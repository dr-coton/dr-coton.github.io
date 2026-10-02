#!/usr/bin/env python3
"""server.py를 띄우고 k6로 케이스를 하나씩 돌려 scripts/k6_lab/results.json에 저장한다. (k6 설치 필요, 약 3분)
실행: python3 scripts/k6_lab/run_lab.py   ·   그림은 이 파일을 읽어 그리므로 그림만 다시 만들 때는 k6가 필요 없다."""
import json
import os
import platform
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
PHASES = ['blocked', 'connecting', 'tls_handshaking', 'sending', 'waiting', 'receiving', 'duration']


def call(path):
    return json.load(urllib.request.urlopen(f'http://127.0.0.1:8101{path}'))


def run_k6(target, base='http://127.0.0.1:8101', opts=None, env=None):
    out = tempfile.mktemp(suffix='.json')
    e = dict(os.environ, OPTS=json.dumps(opts or {}), TARGET=target, BASE=base, **(env or {}))
    subprocess.run(['k6', 'run', '--quiet', f'--summary-export={out}', str(HERE / 'script.js')], env=e, check=True, capture_output=True)
    m = json.load(open(out))['metrics']
    row = {p: {'avg': m[f'http_req_{p}']['avg'], 'p95': m[f'http_req_{p}']['p(95)']} for p in PHASES}
    row['server_time'] = {'avg': m['server_time']['avg'], 'p95': m['server_time']['p(95)']} if 'server_time' in m else None
    row.update(reqs=m['http_reqs']['count'], failed=m['http_req_failed']['value'], dropped=m.get('dropped_iterations', {}).get('count', 0),
               data_received=m['data_received']['count'])
    return row


def closed(vus, secs=6, **extra):
    return dict(vus=vus, duration=f'{secs}s', **extra)


def arrival(rate, secs=6, pre=200, mx=600):
    return dict(scenarios=dict(r=dict(executor='constant-arrival-rate', rate=rate, timeUnit='1s', duration=f'{secs}s', preAllocatedVUs=pre, maxVUs=mx)))


def main():
    server = subprocess.Popen([sys.executable, str(HERE / 'server.py')], stdout=subprocess.PIPE, text=True)
    assert server.stdout.readline().strip() == 'ready'
    res = {'k6': subprocess.run(['k6', 'version'], capture_output=True, text=True).stdout.split()[1], 'machine': f'{platform.system()} {platform.machine()}, {os.cpu_count()} cores'}
    try:
        def case(name, *a, cfg=None, **kw):
            call('/_cfg?' + '&'.join(f'{k}={v}' for k, v in (cfg or dict(rate=0, block_ua='', bw=10240, up=8192, tls_delay=300)).items()))
            call('/_reset')
            res[name] = run_k6(*a, **kw)
            res[name]['stats'] = call('/_stats')
            print(name, {p: round(res[name][p]['avg'], 1) for p in PHASES}, 'failed', round(res[name]['failed'], 3), 'dropped', res[name]['dropped'], flush=True)

        case('baseline', '/app?ms=50', opts=closed(3))
        case('server_slow', '/app?ms=500', opts=closed(3))
        case('device_delay', '/device?pre=450&ms=50', opts=closed(3))
        for n in (1, 2, 4, 8, 16, 32):
            case(f'bandwidth_{n}', '/big?kb=256&ms=100', opts=closed(n))
        case('upload', '/upload', opts=closed(2, 10), env={'BODY_KB': '8192'})
        tls = dict(noConnectionReuse=True, insecureSkipTLSVerify=True)
        case('tls_direct', '/app?ms=50', 'https://127.0.0.1:8102', opts=closed(3, **tls))
        case('tls_delay_new', '/app?ms=50', 'https://127.0.0.1:8103', opts=closed(3, **tls))
        case('tls_delay_reuse', '/app?ms=50', 'https://127.0.0.1:8103', opts=closed(3, insecureSkipTLSVerify=True))
        case('rate_limit', '/app?ms=50', opts=arrival(200, pre=50, mx=200), cfg=dict(rate=100, block_ua='', bw=10240, up=8192, tls_delay=300))
        blocked = dict(rate=0, block_ua='k6', bw=10240, up=8192, tls_delay=300)
        case('ua_blocked', '/app?ms=50', opts=closed(3), cfg=blocked)
        case('ua_allowed', '/app?ms=50', opts=closed(3, userAgent='LoadTest-Internal/1.0'), cfg=blocked)
        for rate in (1000, 2000, 2800, 3200, 3600):
            case(f'generator_{rate}', '/app?ms=20', opts=arrival(rate, 8), env={'BURN_MS': '4'})
    finally:
        server.terminate()
    (HERE / 'results.json').write_text(json.dumps(res, indent=1, ensure_ascii=False))


if __name__ == '__main__':
    main()
