#!/usr/bin/env python3
"""k6 지표 실험용 가짜 서버(내 컴퓨터 전용). 일부러 만든 지연이 어떤 k6 지표를 움직이는지 보려는 것이라
실제 서비스, WAF, 네트워크를 흉내 낸 모형이다. 실행: python3 scripts/k6_lab/server.py

  8101  HTTP        8102  HTTPS        8103  8102 앞의 TLS 지연 프록시(연결을 받고 한참 뒤에 넘겨 줌)
  /app?ms=N         앱이 N ms 일한 뒤 응답. Server-Timing의 app;dur는 앱이 일한 시간
  /device?pre=P&ms=N  보안장비가 P ms 검사한 뒤 앱이 N ms 일함. Server-Timing에는 N만 적힘
  /big?kb=K&ms=N    앱이 N ms 일한 뒤 K KB 본문을 대역폭 한도(bw KB/s, 연결 전체 합계)로 흘려보냄
  POST /upload      요청 본문을 업로드 한도(up KB/s)로 읽음
  /_cfg?bw=&up=&rate=&block_ua=&tls_delay=   설정 변경 · /_stats  앱이 처리한 요청 수 · /_reset
"""
import asyncio
import json
import ssl
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

CFG = dict(bw=10240, up=8192, rate=0, block_ua='', tls_delay=300)  # bw/up: KB/s, rate: 장비가 1초에 통과시키는 요청 수(0이면 제한 없음)
STATS = dict(app=0, app_ms=0.0, blocked_ua=0, limited=0)
CHUNK = 16 * 1024


class Pacer:
    """연결 전체가 함께 쓰는 대역폭. 요청마다 자기 몫만큼 순서를 기다린다."""

    def __init__(self):
        self.free_at = 0.0

    async def take(self, nbytes, kb_per_s):
        now = time.perf_counter()
        slot = max(now, self.free_at)
        self.free_at = slot + nbytes / (kb_per_s * 1024)
        if slot > now:
            await asyncio.sleep(slot - now)


DOWN, UP = Pacer(), Pacer()
WINDOW = dict(second=-1, count=0)


def over_rate():
    sec = int(time.perf_counter())
    if WINDOW['second'] != sec:
        WINDOW.update(second=sec, count=0)
    WINDOW['count'] += 1
    return CFG['rate'] and WINDOW['count'] > CFG['rate']


def response(status, body=b'', extra=''):
    reason = {200: 'OK', 403: 'Forbidden', 429: 'Too Many Requests'}[status]
    return f'HTTP/1.1 {status} {reason}\r\nContent-Length: {len(body)}\r\n{extra}\r\n'.encode() + body


async def handle(reader, writer):
    try:
        while True:
            line = await reader.readline()
            if not line:
                break
            method, target, _ = line.decode().split(' ', 2)
            headers = {}
            while True:
                h = await reader.readline()
                if h in (b'\r\n', b''):
                    break
                k, v = h.decode().split(':', 1)
                headers[k.strip().lower()] = v.strip()
            url = urlsplit(target)
            q = {k: v[0] for k, v in parse_qs(url.query, keep_blank_values=True).items()}
            length = int(headers.get('content-length', 0))
            if url.path == '/upload':  # 본문을 한도에 맞춰 읽는다
                left = length
                while left > 0:
                    data = await reader.read(min(CHUNK, left))
                    if not data:
                        return
                    left -= len(data)
                    await UP.take(len(data), CFG['up'])
            elif length:
                await reader.readexactly(length)
            if url.path == '/_cfg':
                for k, v in q.items():
                    CFG[k] = v if k == 'block_ua' else int(v)
                writer.write(response(200, json.dumps(CFG).encode()))
            elif url.path == '/_stats':
                writer.write(response(200, json.dumps(STATS).encode()))
            elif url.path == '/_reset':
                STATS.update(app=0, app_ms=0.0, blocked_ua=0, limited=0)
                WINDOW.update(second=-1, count=0)
                writer.write(response(200, b'{}'))
            elif CFG['block_ua'] and CFG['block_ua'].lower() in headers.get('user-agent', '').lower():
                STATS['blocked_ua'] += 1  # 장비가 앱까지 보내지 않고 바로 막는다
                writer.write(response(403, b'blocked'))
            elif over_rate():
                STATS['limited'] += 1
                writer.write(response(429, b'slow down'))
            else:
                if url.path == '/device':
                    await asyncio.sleep(int(q.get('pre', 0)) / 1000)  # 장비 검사 시간. 앱 시간에는 안 들어감
                t0 = time.perf_counter()
                await asyncio.sleep(int(q.get('ms', 0)) / 1000)
                size = int(q.get('kb', 0)) * 1024
                app_ms = (time.perf_counter() - t0) * 1000
                STATS['app'] += 1
                STATS['app_ms'] += app_ms
                writer.write(response(200, extra=f'Server-Timing: app;dur={app_ms:.1f}\r\n').replace(b'Content-Length: 0', f'Content-Length: {size}'.encode()))
                await writer.drain()
                sent = 0
                while sent < size:
                    n = min(CHUNK, size - sent)
                    await DOWN.take(n, CFG['bw'])
                    writer.write(b'x' * n)
                    await writer.drain()
                    sent += n
            await writer.drain()
    except (ConnectionError, asyncio.IncompleteReadError):
        pass
    finally:
        writer.close()


async def delayed_proxy(client_r, client_w):
    """연결을 받고 tls_delay ms 뒤에야 뒤쪽 HTTPS 서버로 넘긴다. TCP 연결은 바로 되지만 TLS 핸드셰이크가 늦어진다."""
    await asyncio.sleep(CFG['tls_delay'] / 1000)
    try:
        server_r, server_w = await asyncio.open_connection('127.0.0.1', 8102)
    except OSError:
        client_w.close()
        return

    async def pipe(r, w):
        try:
            while data := await r.read(65536):
                w.write(data)
                await w.drain()
        except ConnectionError:
            pass
        finally:
            w.close()

    await asyncio.gather(pipe(client_r, server_w), pipe(server_r, client_w))


async def main():
    tmp = tempfile.mkdtemp()
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', f'{tmp}/k.pem', '-out', f'{tmp}/c.pem',
                    '-days', '2', '-subj', '/CN=localhost'], check=True, capture_output=True)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(f'{tmp}/c.pem', f'{tmp}/k.pem')
    servers = [await asyncio.start_server(handle, '127.0.0.1', 8101, backlog=1024),
               await asyncio.start_server(handle, '127.0.0.1', 8102, ssl=ctx, backlog=1024),
               await asyncio.start_server(delayed_proxy, '127.0.0.1', 8103, backlog=1024)]
    print('ready', flush=True)
    await asyncio.gather(*(s.serve_forever() for s in servers))


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
