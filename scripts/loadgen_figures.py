#!/usr/bin/env python3
"""부하발생기(k6)와 APM 응답시간 글(loadgen-vs-apm)의 그림과 반복 GIF를 만든다: python3 scripts/loadgen_figures.py

- 실험 그림: scripts/k6_lab/results.json(내 컴퓨터에서 k6와 가짜 서버로 잰 값)을 그대로 그린다. k6는 필요 없다.
- 모식도·계산 그림: 예시 값과 계산식으로 그린다. 그림 안에 '모식도', '계산'이라고 적는다.
그리는 도구(Canvas, save_gif 등)는 search_figures.py에서 가져온다.
결과: assets/loadgen-notes/<이름>.gif (+ 움직임 줄이기용 <이름>-still.png), <이름>.png
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import search_figures as sf
from search_figures import (AMBER, BG, BLUE, BLUE_BG, BLUE_FILL, FAINT, GRID, GREEN, GREEN_BG, INK, MUTED, ORANGE, ORANGE_BG, PURPLE,
                            PURPLE_BG, RED, RED_BG, RED_FILL, SOFT, TEAL, TEXT, W, Canvas, arrow, caption, card, check, cross,
                            ease, header, lerp, mix, pill, rgb, save_gif, save_png)

ROOT = Path(__file__).resolve().parent.parent
sf.OUT = ROOT / 'assets' / 'loadgen-notes'  # ponytail: save_gif가 읽는 출력 폴더만 바꾼다
LAB = json.load(open(ROOT / 'scripts' / 'k6_lab' / 'results.json'))

PINK = rgb('#db2777')
PHASES = ['connecting', 'tls_handshaking', 'sending', 'waiting', 'receiving']
COLOR = dict(connecting=TEAL, tls_handshaking=PURPLE, sending=ORANGE, waiting=BLUE, receiving=PINK)
NAME = dict(connecting='connecting', tls_handshaking='tls_handshaking', sending='sending', waiting='waiting', receiving='receiving')
SHORT = dict(connecting='연결', tls_handshaking='TLS', sending='보내기', waiting='기다림', receiving='받기')


def lab(case, phase, stat='avg'):
    return LAB[case][phase][stat]


# ---------------------------------------------------------------- 공통 요소
def node(c, x, y, w, h, title, sub=None, outline=GRID, fill=BG, width=2, color=INK, size=26):
    card(c, x, y, w, h, outline=outline, fill=fill, width=width)
    c.text(x + w / 2, y + h / 2 - (14 if sub else 0), title, size, color, 'bold', 'mm')
    if sub:
        c.text(x + w / 2, y + h / 2 + 22, sub, 22, MUTED, 'medium', 'mm')


def bracket(c, x0, x1, y, color, label, below=True, size=24, tick=12, width=3):
    """가로 괄호. below면 눈금이 위로, 라벨은 아래에 둔다."""
    d = -tick if below else tick
    c.line([(x0, y + d), (x0, y), (x1, y), (x1, y + d)], color, width)
    c.text((x0 + x1) / 2, y + (30 if below else -30), label, size, color, 'bold', 'mm')


def seg_bar(c, x, y, w, h, values, scale, colors=COLOR, labels=False, fade=1.0, min_label=70):
    """values: [(이름, 값)] 순서대로 이어 붙인 가로 막대. scale: 값 1당 픽셀. 그린 끝 x를 돌려준다."""
    cx = x
    for name, v in values:
        sw = v * scale * fade
        if sw <= 0:
            continue
        c.rect(cx, y, max(sw, 2), h, fill=colors[name], r=4)
        if labels and sw > min_label:
            c.text(cx + sw / 2, y + h / 2, f'{v:,.0f}', 22, BG, 'bold', 'mm')
        cx += sw
    return cx


def legend(c, x, y, names=PHASES, gap=18, size=22):
    for n in names:
        c.rect(x, y - 9, 18, 18, fill=COLOR[n], r=4)
        c.text(x + 26, y, SHORT[n], size, TEXT, 'semibold')
        x += 26 + c.tw(SHORT[n], size, 'semibold') + gap + 14
    return x


# ---------------------------------------------------------------- 1. 요청이 지나가는 길
NODES = [('외부 부하발생기', 'k6'), ('방화벽 · WAF', '봇 차단'), ('로드밸런서', 'TLS 종단'), ('WAS', 'APM이 봄'), ('DB', None)]
NX = [51 + i * 202 for i in range(5)]  # 노드 왼쪽 x (폭 170)


def path_png():
    H = 560
    c = Canvas(H)
    header(c, '요청이 지나가는 길', '모식도 · 흔한 구성을 가정')
    y = 200
    for i, (t, s) in enumerate(NODES):
        node(c, NX[i], y, 170, 100, t, s, outline=BLUE if i == 0 else GREEN if i >= 3 else GRID, width=3 if i in (0, 3) else 2, size=24 if i == 0 else 26)
        if i:
            arrow(c, (NX[i - 1] + 170 + 4, y + 50), (NX[i] - 4, y + 50), FAINT)
    node(c, NX[2], 78, 170, 64, '내부 부하발생기', None, outline=ORANGE, fill=ORANGE_BG, color=ORANGE, size=24)
    c.line([(NX[2] + 170, 110), (NX[3] + 85, 110), (NX[3] + 85, y - 6)], ORANGE, 3)
    arrow(c, (NX[3] + 85, y - 30), (NX[3] + 85, y - 4), ORANGE)
    c.text(NX[3] + 100, 150, 'WAS에 바로 쏘는 시험', 22, ORANGE, 'bold')
    bracket(c, NX[0] + 85, NX[3] + 170, 345, BLUE, 'k6가 재는 구간 · 요청을 보내고 응답이 돌아올 때까지')
    bracket(c, NX[3], NX[4] + 170, 415, GREEN, 'APM이 재는 구간 · WAS 안(DB 호출 포함)')
    caption(c, '바로 쏘는 시험에는 방화벽 · 로드밸런서 · 바깥 구간이 없음', ORANGE, 515)
    save_png('path', c.done())


# ---------------------------------------------------------------- 2. k6의 여섯 구간
def timeline_png():
    H = 600
    c = Canvas(H)
    header(c, 'k6가 요청 하나를 나눠 재는 구간', '모식도 · 길이는 실제 비율이 아님')
    widths = dict(connecting=150, tls_handshaking=170, sending=120, waiting=330, receiving=150)
    x, y, h = 80, 210, 76
    pos = {}
    for n in PHASES:
        pos[n] = (x, widths[n])
        c.rect(x, y, widths[n] - 4, h, fill=COLOR[n], r=6)
        c.text(x + widths[n] / 2 - 2, y + h / 2, 'TLS' if n == 'tls_handshaking' else n, 24 if n != 'receiving' else 22, BG, 'bold', 'mm')
        x += widths[n]
    bx0, bx1 = pos['connecting'][0], pos['tls_handshaking'][0] + pos['tls_handshaking'][1] - 4
    bracket(c, bx0, bx1, y - 24, MUTED, 'http_req_blocked · 새 연결을 얻을 때까지', below=False)
    dx0, dx1 = pos['sending'][0], pos['receiving'][0] + pos['receiving'][1] - 4
    bracket(c, dx0, dx1, y + h + 26, BLUE, 'http_req_duration = sending + waiting + receiving', below=True)
    notes = dict(connecting='TCP 연결', tls_handshaking='TLS 핸드셰이크', sending='요청 보내기', waiting='첫 바이트가 올 때까지', receiving='응답 받기')
    for n in PHASES:
        c.text(pos[n][0] + pos[n][1] / 2 - 2, y + h + 100, notes[n], 22, MUTED, 'semibold', 'mm')
    caption(c, 'blocked(connecting, tls)는 http_req_duration에 들어가지 않음', ORANGE, 490)
    caption(c, '연결을 재사용하면 connecting과 tls는 0', GREEN, 545)
    save_png('timeline', c.done())



# ---------------------------------------------------------------- 3. 요청 하나의 여행 (모식도)
RTT, DEVICE_MS, SERVER_MS = 30, 60, 120  # 예시 값: 왕복 30ms, 장비 검사 60ms, 서버가 일한 시간 120ms
JOURNEY = [('connecting', RTT), ('tls_handshaking', 2 * RTT), ('sending', 2), ('waiting', RTT + DEVICE_MS + SERVER_MS), ('receiving', 8)]
J_DURATION = sum(v for n, v in JOURNEY if n in ('sending', 'waiting', 'receiving'))


def journey_gif():
    """질문: k6와 APM의 응답시간은 왜 다른가? 변화: 요청 하나가 지나가는 동안 k6의 구간이 차례로 채워지고, APM은 그중 서버 구간만 잰다.
    알 수 있는 것: APM에 안 보이는 시간(연결, TLS, 왕복, 장비 검사)이 k6 숫자에는 들어 있다."""
    H, scale = 620, 2.9
    nx = [40, 290, 540, 790]
    names = [('부하발생기', 'k6'), ('방화벽 · WAF', None), ('로드밸런서', None), ('WAS', 'APM')]
    bx, by, bh = 60, 300, 56
    total = sum(v for _, v in JOURNEY)

    def draw(stage, prog, status=None, status_color=BLUE, final=False):
        c = Canvas(H)
        header(c, '요청 하나의 여행', f'모식도 · 예시 값 · 왕복 {RTT}ms')
        for i, (t, sub) in enumerate(names):
            hot = stage is not None and ((stage in (0, 1) and i in (0, 2)) or (stage == 2 and i in (0, 3)) or (stage == 3 and i == (1 if prog < .6 else 3)) or (stage == 4 and i in (0, 3)))
            node(c, nx[i], 100, 200, 90, t, sub, outline=COLOR[PHASES[stage]] if hot else GRID, width=4 if hot else 2, size=26)
            if i:
                arrow(c, (nx[i - 1] + 204, 145), (nx[i] - 4, 145), FAINT)
        if stage is not None and not final:  # 요청 알갱이 위치
            a, b = {0: (0, 2), 1: (0, 2), 2: (0, 3), 3: (3, 3), 4: (3, 0)}[stage]
            k = prog if stage != 1 else abs(math.sin(prog * math.pi * 2))
            if stage == 3:
                k, a, b = 0, (1 if prog < .6 else 3), (1 if prog < .6 else 3)
            x = lerp(nx[a], nx[b], ease(k)) + 100
            c.circle(x, 218, 12, fill=COLOR[PHASES[stage]])
        # 아래 막대
        x = bx
        for i, (n, v) in enumerate(JOURNEY):
            frac = 1 if stage is None or i < stage or final else prog if i == stage else 0
            if frac:
                c.rect(x, by, max(v * scale * frac - 2, 3), bh, fill=COLOR[n], r=4)
                if v * scale * frac > 90:
                    c.text(x + v * scale * frac / 2, by + bh / 2, f'{v * frac:.0f}ms' if n != 'waiting' else f'{v * frac:.0f}ms', 22, BG, 'bold', 'mm')
            x += v * scale
        c.line([(bx, by + bh + 8), (bx + total * scale, by + bh + 8)], GRID, 2)
        # waiting 안쪽
        wx = bx + sum(v for n, v in JOURNEY[:3]) * scale
        if (stage == 3 and prog > 0) or stage == 4 or final:
            f = 1 if stage == 4 or final else prog
            used = 0
            for label, v, color in (('왕복', RTT, MUTED), ('장비 검사', DEVICE_MS, ORANGE), ('서버', SERVER_MS, GREEN)):
                w = max(0, min(v, f * (RTT + DEVICE_MS + SERVER_MS) - used)) * scale
                if w > 0:
                    c.rect(wx + used * scale, by + 96, max(w - 2, 3), 44, fill=mix(color, BG, .12 if color != MUTED else .55), r=4)
                    if w > 70:
                        c.text(wx + used * scale + w / 2, by + 118, f'{label} {v}', 22, BG if color != MUTED else INK, 'bold', 'mm')
                used += v
        if stage == 4 or final:
            sx = wx + (RTT + DEVICE_MS) * scale
            bracket(c, sx, wx + (RTT + DEVICE_MS + SERVER_MS) * scale - 2, by + 168, GREEN, f'APM {SERVER_MS}ms', below=True)
        if final:
            bracket(c, bx + (JOURNEY[0][1] + JOURNEY[1][1]) * scale, bx + total * scale - 2, by - 22, BLUE, f'k6 duration {J_DURATION}ms', below=False)
            bracket(c, bx, bx + (JOURNEY[0][1] + JOURNEY[1][1]) * scale - 4, by - 22, MUTED, f'blocked {JOURNEY[0][1] + JOURNEY[1][1]}ms', below=False)
        if status:
            caption(c, status, status_color, 590)
        return c.done()

    frames = [(draw(None, 0), 500)]
    plan = [(0, 6, '① 연결: TCP 연결을 맺음'), (1, 8, '② TLS: 암호화 협상'), (2, 3, '③ 요청 보내기'), (3, 14, '④ 기다림: 왕복 + 장비 검사 + 서버'), (4, 4, '⑤ 응답 받기')]
    for stage, n, text in plan:
        for f in range(1, n + 1):
            frames.append((draw(stage, f / n, text, COLOR[PHASES[stage]]), 90 if f < n else 500))
    still = draw(4, 1, f'k6 {J_DURATION}ms · APM {SERVER_MS}ms · 연결 {RTT * 3}ms는 duration 밖', RED, final=True)
    frames.append((still, 3200))
    save_gif('journey', frames, still)


# ---------------------------------------------------------------- 4. 연결 구간은 duration에 안 들어간다 (실험)
TLS_CASES = [('tls_direct', '새 연결마다 · 지연 없음'), ('tls_delay_new', '새 연결마다 · 연결 지연 300ms'), ('tls_delay_reuse', '연결 재사용 · 연결 지연 300ms')]


def tls_gif():
    """질문: duration이 정상이면 연결 쪽은 문제없는 걸까? 조건: 같은 서버에 연결 지연(300ms)을 넣고 새 연결/재사용으로 잰다.
    변화: duration은 54ms로 같은데 blocked만 316ms로 커진다. 알 수 있는 것: 연결 문제는 duration만 보면 안 보인다."""
    H, x0, scale = 640, 60, 1.9
    ys = [185, 345, 505]

    def draw(t, mark=0, status=None, status_color=BLUE):
        c = Canvas(H)
        header(c, 'duration은 같은데 blocked만 큰 경우', '실험 · k6 v1.4.2 · 평균')
        for i, (case, label) in enumerate(TLS_CASES):
            y = ys[i]
            hot = mark == 2 and i == 1
            if hot:
                c.rect(30, y - 40, 1020, 150, fill=RED_FILL, r=12)
            c.text(x0, y - 20, label, 26, INK, 'bold')
            blocked, conn, tls, dur = lab(case, 'blocked'), lab(case, 'connecting'), lab(case, 'tls_handshaking'), lab(case, 'duration')
            by = y + 6
            c.text(x0 - 4, by + 18, 'blocked', 22, MUTED, 'semibold', 'rm') if False else None
            end = seg_bar(c, x0 + 150, by, 0, 36, [], scale)
            e1 = seg_bar(c, x0 + 150, by, 36, 36, [('connecting', conn), ('tls_handshaking', tls)], scale, fade=ease(t))
            c.text(x0 + 140, by + 18, 'blocked', 22, MUTED, 'semibold', 'rm')
            c.text(max(e1, x0 + 150) + 14, by + 18, f'{blocked:,.0f}ms' if t > .9 else '', 26, RED if hot else INK, 'bold')
            e2 = seg_bar(c, x0 + 150, by + 50, 36, 36, [('waiting', dur)], scale, fade=ease(t))
            c.text(x0 + 140, by + 68, 'duration', 22, MUTED, 'semibold', 'rm')
            c.text(max(e2, x0 + 150) + 14, by + 68, f'{dur:,.0f}ms' if t > .9 else '', 26, INK, 'bold')
        legend(c, 60, 105, ['connecting', 'tls_handshaking', 'waiting'])
        if status:
            caption(c, status, status_color, 612)
        return c.done()

    frames = [(draw(0), 500)]
    for f in range(1, 15):
        frames.append((draw(f / 14), 70))
    frames.append((draw(1, 1, '① 세 경우 모두 duration은 54ms 안팎', BLUE), 1700))
    still = draw(1, 2, '② 연결 지연은 blocked에만 보임', RED)
    frames.append((still, 2800))
    save_gif('tls', frames, still)


# ---------------------------------------------------------------- 5. 거리가 멀면 연결 비용이 커진다 (계산)
def rtt_rows():
    rows = []
    for rtt in (1, 30, 150):  # 새 연결: TCP 1왕복 + TLS 1.3 1왕복 + 요청 1왕복 + 서버
        rows.append(dict(rtt=rtt, new=3 * rtt + SERVER_MS, reuse=rtt + SERVER_MS))
    return rows


def rtt_png():
    H = 560
    c = Canvas(H)
    header(c, '거리가 멀면 새 연결이 비싸다', f'계산 · 서버가 일한 시간 {SERVER_MS}ms · TLS 1.3')
    x0, scale = 330, 1.0
    rows = rtt_rows()
    for i, r in enumerate(rows):
        y = 130 + i * 128
        pill(c, 40, y + 20, f'왕복 {r["rtt"]}ms', MUTED, SOFT, 24)
        for k, (label, parts) in enumerate((('새 연결', [('connecting', r['rtt']), ('tls_handshaking', r['rtt']), ('rtt', r['rtt']), ('server', SERVER_MS)]),
                                            ('재사용', [('rtt', r['rtt']), ('server', SERVER_MS)]))):
            yy = y + k * 48
            cx = x0
            for n, v in parts:
                color = COLOR.get(n, mix(BLUE, BG, .55) if n == 'rtt' else GREEN)
                w = v * scale
                c.rect(cx, yy, max(w - 1, 2), 36, fill=color, r=4)
                cx += w
            c.text(x0 - 14, yy + 18, label, 22, MUTED, 'semibold', 'rm')
            c.text(cx + 12, yy + 18, f'{sum(v for _, v in parts):,}ms', 26, INK, 'bold')
    x = legend(c, 40, 100, ['connecting', 'tls_handshaking'])
    for label, color in (('왕복(waiting 안)', mix(BLUE, BG, .55)), ('서버(APM)', GREEN)):
        c.rect(x, 91, 18, 18, fill=color, r=4)
        c.text(x + 26, 100, label, 22, TEXT, 'semibold')
        x += 26 + c.tw(label, 22, 'semibold') + 32
    caption(c, f'APM은 거리와 상관없이 {SERVER_MS}ms, k6 숫자만 커짐', RED, 530)
    save_png('rtt', c.done())
    return rows


# ---------------------------------------------------------------- 6. 업로드는 sending과 waiting에 나뉜다 (실험)
def upload_png():
    H = 480
    c = Canvas(H)
    header(c, '업로드 8MB 요청 하나', '실험 · k6 v1.4.2 · 서버가 읽는 속도를 8,192KB/s로 제한')
    snd, wt, rcv = lab('upload', 'sending'), lab('upload', 'waiting'), lab('upload', 'receiving')
    x0, scale = 60, 0.5
    seg_bar(c, x0, 190, 70, 70, [('sending', snd), ('waiting', wt), ('receiving', rcv)], scale, labels=True)
    legend(c, 60, 120, ['sending', 'waiting', 'receiving'])
    bracket(c, x0, x0 + snd * scale, 290, ORANGE, f'sending {snd:,.0f}ms · 운영체제 버퍼에 다 넣을 때까지', below=True, size=22)
    bracket(c, x0 + snd * scale + 4, x0 + (snd + wt) * scale, 290, BLUE, f'waiting {wt:,.0f}ms', below=True, size=22)
    caption(c, f'서버가 본문을 다 읽을 때까지 {snd + wt:,.0f}ms, 그중 {wt:,.0f}ms는 waiting에 잡힘', RED, 400)
    c.text(W / 2, 445, 'VU 2개가 한도를 나눠 쓰므로 8MB ÷ 4,096KB/s ≈ 2초', 22, MUTED, 'medium', 'mm')
    save_png('upload', c.done())


# ---------------------------------------------------------------- 7. waiting과 APM의 차이 (실험)
def gap_gif():
    """질문: waiting이 같으면 원인도 같을까? 조건: 서버가 500ms 일하는 경우와 장비가 450ms 검사하고 서버는 50ms 일하는 경우.
    변화: k6 waiting은 둘 다 약 500ms인데 서버가 보고한 시간이 502ms와 52ms로 갈린다. 알 수 있는 것: waiting − 서버 시간이 중간 구간의 몫이다."""
    H, x0, scale = 590, 90, 1.35
    cases = [('server_slow', '서버가 느린 경우', 150), ('device_delay', '장비가 검사하느라 느린 경우', 340)]

    def draw(t, mark=0, status=None, status_color=BLUE):
        c = Canvas(H)
        header(c, 'waiting 안에서 서버 시간 빼기', '실험 · k6 v1.4.2 · 평균')
        for case, label, y in cases:
            wt, srv = lab(case, 'waiting'), lab(case, 'server_time')
            gap = wt - srv
            hot = mark and case == 'device_delay'
            if hot:
                c.rect(30, y - 56, 1020, 190, fill=RED_FILL, r=12)
            c.text(x0, y - 22, label, 28, INK, 'bold')
            c.text(x0 - 10, y + 22, 'k6 waiting', 22, MUTED, 'semibold', 'rm') if False else None
            e = seg_bar(c, x0, y + 10, 52, 52, [('waiting', srv)], scale, colors=dict(waiting=GREEN), fade=ease(t))
            e = seg_bar(c, e, y + 10, 52, 52, [('sending', gap)], scale, colors=dict(sending=ORANGE), fade=ease(t))
            c.text(x0 + srv * scale * ease(t) / 2, y + 36, f'서버 {srv:,.0f}' if srv * scale > 120 and t > .9 else '', 24, BG, 'bold', 'mm')
            if t > .9:
                if srv * scale <= 120:
                    c.text(x0 + srv * scale / 2, y + 86, f'서버 {srv:,.0f}', 24, GREEN, 'bold', 'mm')
                if gap * scale > 120:
                    c.text(x0 + srv * scale + gap * scale / 2, y + 36, f'차이 {gap:,.0f}', 24, BG, 'bold', 'mm')
                c.text(max(e, x0) + 16, y + 36, f'waiting {wt:,.0f}ms', 26, RED if hot else INK, 'bold')
        c.rect(x0, 495, 18, 18, fill=GREEN, r=4)
        c.text(x0 + 26, 504, '서버가 보고한 시간(APM과 같은 구간)', 22, TEXT, 'semibold')
        c.rect(x0 + 380, 495, 18, 18, fill=ORANGE, r=4)
        c.text(x0 + 406, 504, 'waiting − 서버 시간 = 중간 구간', 22, TEXT, 'semibold')
        if status:
            caption(c, status, status_color, 566)
        return c.done()

    frames = [(draw(0), 500)]
    for f in range(1, 15):
        frames.append((draw(f / 14), 70))
    frames.append((draw(1, 0, '① waiting은 둘 다 약 500ms', BLUE), 1700))
    still = draw(1, 1, '② 서버 시간이 갈라지면 원인 위치가 갈림', RED)
    frames.append((still, 2800))
    save_gif('gap', frames, still)



# ---------------------------------------------------------------- 8. 대역폭이 모자라면 receiving만 늘어난다 (실험)
BW_LEVELS = [1, 2, 4, 8, 16, 32]
BW_KB, BW_LIMIT = 256, 10240  # 응답 256KB, 서버가 흘려보내는 속도 한도 10,240KB/s (연결 전체 합계)


def bw_tps(n):
    return n / (lab(f'bandwidth_{n}', 'duration') / 1000)  # 쉬지 않는 VU n개: 초당 요청 수 = VU ÷ 평균 응답시간


def bandwidth_gif():
    """질문: 서버가 멀쩡한데 k6 응답시간만 늘어나는 건 언제인가? 조건: 응답 256KB, 서버 한도 10,240KB/s에서 VU를 1에서 32로 올린다.
    변화: TPS는 40에서 멈추고 waiting은 101ms로 같은데 receiving만 24ms에서 695ms로 커진다. 알 수 있는 것: 서버 지표가 그대로여도 회선이 차면 k6 응답시간이 커진다."""
    H = 640
    lx0, rx0, base, top = 90, 640, 500, 170
    bw, gap = 46, 22

    def draw(k, status=None, status_color=BLUE):
        c = Canvas(H)
        header(c, '같은 서버, VU만 늘렸을 때', f'실험 · 응답 {BW_KB}KB · 서버 한도 {BW_LIMIT:,}KB/s')
        pill(c, 40, 104, 'TPS', BLUE, BLUE_BG, 24)
        pill(c, 590, 104, '응답시간', PURPLE, PURPLE_BG, 24)
        for v in (0, 20, 40):
            y = lerp(base, top, v / 50)
            c.line([(lx0 - 10, y), (lx0 + 6 * (bw + gap), y)], GRID, 2)
            c.text(lx0 - 18, y, str(v), 22, FAINT, 'medium', 'rm')
        for v in (0, 400, 800):
            y = lerp(base, top, v / 850)
            c.line([(rx0 - 10, y), (rx0 + 6 * (bw + gap), y)], GRID, 2)
            c.text(rx0 - 18, y, str(v), 22, FAINT, 'medium', 'rm')
        cap_y = lerp(base, top, BW_LIMIT / BW_KB / 50)
        c.dashed((lx0 - 10, cap_y), (lx0 + 6 * (bw + gap), cap_y), RED, 3, 9, 6)
        c.text(lx0 + 6 * (bw + gap), cap_y - 18, f'회선 한도 {BW_LIMIT // BW_KB}', 22, RED, 'bold', 'rm')
        srv = lab('bandwidth_32', 'server_time')
        sy = lerp(base, top, srv / 850)
        c.dashed((rx0 - 10, sy), (rx0 + 6 * (bw + gap), sy), GREEN, 3, 9, 6)
        c.text(rx0 - 6, sy - 44, f'서버 시간 {srv:.0f}', 22, GREEN, 'bold')
        for i, n in enumerate(BW_LEVELS):
            c.text(lx0 + i * (bw + gap) + bw / 2, base + 26, str(n), 22, FAINT, 'medium', 'mm')
            c.text(rx0 + i * (bw + gap) + bw / 2, base + 26, str(n), 22, FAINT, 'medium', 'mm')
            if i >= k:
                continue
            case = f'bandwidth_{n}'
            y = lerp(base, top, bw_tps(n) / 50)
            c.rect(lx0 + i * (bw + gap), y, bw, base - y, fill=BLUE, r=4)
            wy = lerp(base, top, lab(case, 'waiting') / 850)
            ry = lerp(wy, top, lab(case, 'receiving') / 850 * (base - top) / (base - top))
            ry = wy - (base - top) * lab(case, 'receiving') / 850
            c.rect(rx0 + i * (bw + gap), wy, bw, base - wy, fill=BLUE, r=3)
            c.rect(rx0 + i * (bw + gap), ry, bw, wy - ry, fill=PINK, r=3)
        c.text(lx0, base + 62, 'VU 수', 22, FAINT, 'medium')
        c.text(rx0, base + 62, 'VU 수', 22, FAINT, 'medium')
        if k:
            n = BW_LEVELS[k - 1]
            c.text(1040, 138, f'VU {n} · TPS {bw_tps(n):.0f} · receiving {lab(f"bandwidth_{n}", "receiving"):.0f}ms', 24, INK, 'bold', 'rm')
        if status:
            caption(c, status, status_color, 606)
        return c.done()

    frames = [(draw(0), 500)]
    notes = {1: ('VU 1: 회선이 남아 receiving 24ms', GREEN), 3: ('VU 4: 아직 한도 안', BLUE), 4: ('VU 8: TPS가 한도에 닿음', ORANGE),
             6: ('VU 32: TPS는 40에 묶이고 receiving만 695ms', RED)}
    hold = {1: 900, 3: 1200, 4: 1400, 6: 3000}
    for k in range(1, 7):
        text, color = notes.get(k, ('VU를 올림', BLUE))
        frames.append((draw(k, text, color), hold.get(k, 500)))
    save_gif('bandwidth', frames, frames[-1][0])


# ---------------------------------------------------------------- 9. 보안장비가 막은 요청은 APM에 없다 (실험)
def security_gif():
    """질문: 서버에 오류가 없으면 시험 결과는 정상일까? 조건: 초당 200건을 보내고 장비가 초당 100건만 통과시킨다(가정).
    변화: 점 일부가 장비 앞에서 떨어진다. k6는 실패율 44.5%, APM은 666건을 오류 없이 처리. 알 수 있는 것: 막힌 요청은 서버 지표에 남지 않는다."""
    H, dots, launch, leg = 640, 30, 2, 8
    sent, passed, limited = LAB['rate_limit']['reqs'], LAB['rate_limit']['stats']['app'], LAB['rate_limit']['stats']['limited']
    frac = passed / sent
    ok = [int((i + 1) * frac) > int(i * frac) for i in range(dots)]
    total_frames = dots * launch + int(leg * 2.6) + 2

    def draw(f, final=False):
        c = Canvas(H)
        header(c, '장비가 막은 요청은 서버에 없다', '실험 · 장비는 초당 100건만 통과(가정)')
        arrow(c, (236, 210), (439, 210), FAINT)
        arrow(c, (641, 210), (844, 210), FAINT)
        for i in range(min(dots, f // launch + 1) if f >= 0 else 0):
            t = (f - i * launch) / leg
            lane = 210 + (i % 3 - 1) * 12
            if t < 0:
                continue
            if t < 1:
                c.circle(lerp(236, 440, ease(t)), lane, 8, fill=BLUE)
            elif ok[i] and t < 2.6:
                c.circle(lerp(440, 845, (t - 1) / 1.6), lane, 8, fill=BLUE if t < 1.6 else GREEN)
            elif not ok[i] and t < 1.8:
                c.circle(440, lane + (t - 1) * 70, 8, fill=mix(RED, BG, (t - 1) * .9))
        node(c, 40, 150, 190, 120, 'k6', '부하발생기', outline=BLUE, width=3)
        node(c, 445, 150, 190, 120, '보안장비', '속도 제한', outline=ORANGE, width=3, fill=ORANGE_BG, color=ORANGE)
        node(c, 850, 150, 190, 120, 'WAS', 'APM이 봄', outline=GREEN, width=3)
        frac_done = 1 if final else min(1, max(0, f / (dots * launch + leg)))
        lag = 0 if final else max(0, (frac_done * (dots * launch + leg) - leg) / (dots * launch))
        n_sent = sent if final else round(sent * frac_done)
        n_pass = passed if final else round(passed * min(1, lag))
        n_lim = limited if final else round(limited * min(1, max(0, (frac_done * (dots * launch + leg) - leg) / (dots * launch))))
        c.text(135, 300, f'보낸 요청 {n_sent:,}', 26, BLUE, 'bold', 'mm')
        c.text(540, 300, f'막은 요청 {n_lim:,}', 26, RED, 'bold', 'mm')
        c.text(945, 300, f'처리 {n_pass:,}', 26, GREEN, 'bold', 'mm')
        card(c, 40, 360, 490, 150, outline=BLUE, width=3)
        c.text(64, 392, 'k6가 본 것', 26, BLUE, 'bold')
        fail = LAB['rate_limit']['failed'] if final else (n_lim / n_sent if n_sent else 0)
        c.text(64, 440, f'실패율 {fail * 100:.1f}%', 32, RED, 'bold')
        if final:
            c.text(64, 482, f'평균 응답시간 {lab("rate_limit", "duration"):.1f}ms (서버 {lab("rate_limit", "server_time"):.0f}ms보다 짧음)', 22, MUTED, 'semibold')
        card(c, 550, 360, 490, 150, outline=GREEN, width=3)
        c.text(574, 392, 'APM이 본 것', 26, GREEN, 'bold')
        c.text(574, 440, f'{n_pass:,}건 · 오류 0', 32, INK, 'bold')
        if final:
            c.text(574, 482, f'서버가 일한 시간 평균 {lab("rate_limit", "server_time"):.0f}ms', 22, MUTED, 'semibold')
            caption(c, '서버는 멀쩡해 보이고 k6는 실패 44.5%', RED, 570)
        return c.done()

    frames = [(draw(-1), 500)]
    for f in range(0, total_frames):
        frames.append((draw(f), 55))
    still = draw(total_frames, final=True)
    frames.append((still, 3200))
    save_gif('security', frames, still)


# ---------------------------------------------------------------- 10. 특정 도구가 막힌 경우 (실험)
def ua_block_png():
    H = 560
    c = Canvas(H)
    header(c, '같은 시험, 도구가 막힌 경우', '실험 · k6 v1.4.2 · 막는 규칙은 가정')
    cols = [(40, '기본 User-Agent', 'Grafana k6/1.4.2', 'ua_blocked', RED, RED_BG), (560, '시험용으로 허용한 User-Agent', 'LoadTest-Internal/1.0', 'ua_allowed', BLUE, BLUE_BG)]
    for x, title, sub, case, fg, bg in cols:
        d = LAB[case]
        card(c, x, 100, 480, 360, outline=fg, width=3)
        pill(c, x + 20, 140, title, fg, bg, 24)
        c.text(x + 24, 190, sub, 22, MUTED, 'mono' if False else 'semibold')
        rows = [('TPS', f'{d["reqs"] / 6:,.0f}'), ('실패율', f'{d["failed"] * 100:.0f}%'), ('평균 응답시간', f'{d["duration"]["avg"]:.1f}ms'), ('APM이 본 요청', f'{d["stats"]["app"]:,}')]
        for i, (k, v) in enumerate(rows):
            y = 240 + i * 52
            c.text(x + 24, y, k, 24, TEXT, 'semibold')
            c.text(x + 456, y, v, 30, fg if case == 'ua_blocked' and i != 3 else INK, 'bold', 'rm')
    caption(c, '막힌 시험이 TPS는 가장 높고 응답시간은 가장 짧음', RED, 510)
    save_png('ua-block', c.done())


# ---------------------------------------------------------------- 11. 부하발생기가 밀리면 (실험)
GEN_RATES = [1000, 2000, 2800, 3200, 3600]


def generator_gif():
    """질문: 서버는 그대로인데 k6 응답시간이 커지면 서버 탓일까? 조건: 응답 뒤에 스크립트가 CPU를 4ms 쓰게 하고 목표 TPS를 올린다.
    변화: 서버가 일한 시간은 21ms로 같은데 k6 p95는 20ms에서 191ms로 커지고 못 시작한 요청이 생긴다. 알 수 있는 것: 부하발생기가 밀리면 서버가 느려진 것처럼 보인다."""
    H, top = 640, 200
    x0, x1, y0, y1 = 130, 1010, 170, 470

    def px(i):
        return lerp(x0 + 60, x1 - 60, i / (len(GEN_RATES) - 1))

    def py(v):
        return lerp(y1, y0, min(v, top) / top)

    def draw(k, status=None, status_color=BLUE):
        c = Canvas(H)
        header(c, '서버는 그대로, 부하발생기만 밀릴 때', '실험 · k6 v1.4.2 · p95')
        pill(c, 40, 104, 'k6가 잰 응답시간', RED, RED_BG, 22)
        pill(c, 330, 104, '서버가 일한 시간', BLUE, BLUE_BG, 22)
        for v in range(0, top + 1, 50):
            c.line([(x0, py(v)), (x1, py(v))], GRID, 2)
            c.text(x0 - 14, py(v), str(v), 22, FAINT, 'medium', 'rm')
        for i, r in enumerate(GEN_RATES):
            c.text(px(i), y1 + 28, f'{r:,}', 22, FAINT, 'medium', 'mm')
        c.text(x1, y1 + 60, '목표 TPS', 22, FAINT, 'medium', 'rm')
        for series, color in (('duration', RED), ('server_time', BLUE)):
            pts = [(px(i), py(lab(f'generator_{r}', series, 'p95'))) for i, r in enumerate(GEN_RATES[:k])]
            if len(pts) > 1:
                c.line(pts, color, 5)
            for p in pts:
                c.circle(*p, 8, fill=color)
        if k:
            r = GEN_RATES[k - 1]
            d = LAB[f'generator_{r}']
            c.text(1040, 104, f'목표 {r:,} · 못 시작한 요청 {d["dropped"]:,}', 24, RED if d['dropped'] else INK, 'bold', 'rm')
        if status:
            caption(c, status, status_color, 606)
        return c.done()

    frames = [(draw(0), 500)]
    notes = {1: ('목표 1,000: 두 선이 붙어 있음', GREEN), 2: ('목표 2,000: 아직 같음', GREEN), 4: ('목표 3,200: k6만 커지기 시작', ORANGE), 5: ('목표 3,600: 서버 시간은 그대로, k6 p95 191ms', RED)}
    hold = {1: 800, 2: 1500, 3: 500, 4: 1700, 5: 3000}
    for k in range(1, 6):
        t, col = notes.get(k, ('목표를 올림', BLUE))
        frames.append((draw(k, t, col), hold[k]))
    save_gif('generator', frames, frames[-1][0])


# ---------------------------------------------------------------- 12. 어디서 쏘면 무엇이 보이나 (모식도)
def coverage_png():
    H = 700
    c = Canvas(H)
    header(c, '어디서 쏘면 무엇이 보이나', '모식도 · 흔한 구성을 가정')
    cols = [('WAS에\n바로', 480), ('내부 LB를\n거쳐', 650), ('외부망\n실제 경로', 850)]
    for t, x in cols:
        a, b = t.split('\n')
        c.text(x, 128, a, 24, INK, 'bold', 'mm')
        c.text(x, 156, b, 24, INK, 'bold', 'mm')
    rows = [('서버(WAS·DB) 처리 한계', 1, 1, 1), ('로드밸런서·TLS 처리 한계', 0, 1, 1), ('방화벽·WAF의 검사 지연, 속도 제한', 0, 0, 1),
            ('봇·매크로 차단', 0, 0, 1), ('인터넷 구간 대역폭, 거리(왕복)', 0, 0, 1), ('부하발생기 자체의 한계', 2, 2, 2)]
    for i, (name, *marks) in enumerate(rows):
        y = 230 + i * 70
        c.rect(30, y - 30, 1020, 60, fill=SOFT if i % 2 == 0 else BG, r=8)
        c.text(50, y, name, 26, INK, 'semibold')
        for (t, x), m in zip(cols, marks):
            if m == 1:
                check(c, x, y, GREEN)
            elif m == 0:
                cross(c, x, y, RED)
            else:
                c.text(x, y, '어디서든', 22, ORANGE, 'bold', 'mm')
    x = 50
    for label, color, kind in (('시험에서 드러남', GREEN, 'c'), ('드러나지 않음', RED, 'x')):
        (check if kind == 'c' else cross)(c, x + 12, 665, color, 10)
        c.text(x + 36, 665, label, 22, TEXT, 'semibold')
        x += 260
    c.text(1040, 665, '부하발생기는 어디에 있든 자원을 확인', 22, ORANGE, 'bold', 'rm')
    save_png('coverage', c.done())


# ---------------------------------------------------------------- 13. 진단표 (정리)
def triage_png():
    H = 780
    c = Canvas(H)
    header(c, 'k6와 APM 숫자가 다를 때 먼저 볼 곳', '정리')
    c.text(40, 108, 'k6에서 이렇게 보이면', 24, FAINT, 'semibold')
    c.text(610, 108, '먼저 의심할 곳', 24, FAINT, 'semibold')
    rows = [(('blocked · connecting · tls가 큼', 'duration은 정상'), TEAL, ('새 연결을 처리하는 곳', '방화벽, 로드밸런서, TLS 장비, 먼 거리')),
            (('sending이 큼', '요청 본문이 큼'), ORANGE, ('올리는 쪽 회선', '부하발생기의 회선, 요청 크기')),
            (('waiting이 큼', 'APM(서버) 시간은 작음'), BLUE, ('중간 장비와 왕복 시간', '검사와 대기, 거리')),
            (('waiting이 크고', 'APM(서버) 시간도 큼'), GREEN, ('서버 자체', '앱, DB, 스레드')),
            (('receiving이 큼', 'waiting은 일정'), PINK, ('내려받는 회선', '응답 크기, 대역폭')),
            (('실패율은 오르고 응답시간은 줄어듦', 'APM 요청 수도 줄어듦'), RED, ('장비의 차단과 제한', '상태 코드 403, 429')),
            (('모든 구간이 같이 늘어남', 'dropped_iterations가 생김'), PURPLE, ('부하발생기의 자원', 'CPU, 메모리, 회선, 포트'))]
    for i, (obs, color, sus) in enumerate(rows):
        y = 140 + i * 88
        card(c, 30, y, 540, 76, outline=color, width=3)
        c.text(50, y + 25, obs[0], 24, INK, 'bold')
        c.text(50, y + 54, obs[1], 22, MUTED, 'semibold')
        arrow(c, (578, y + 38), (606, y + 38), FAINT)
        c.rect(614, y, 436, 76, fill=mix(color, BG, .9), r=12)
        c.text(632, y + 25, sus[0], 24, INK, 'bold')
        c.text(632, y + 54, sus[1], 22, MUTED, 'semibold')
    save_png('triage', c.done())


if __name__ == '__main__':
    # 본문에 적은 숫자가 실험 결과와 맞는지 먼저 확인한다.
    for case, row in LAB.items():
        if isinstance(row, dict) and 'duration' in row:  # duration = sending + waiting + receiving
            assert abs(row['duration']['avg'] - sum(row[k]['avg'] for k in ('sending', 'waiting', 'receiving'))) < .2, case
    for case in ('tls_direct', 'tls_delay_new'):  # blocked는 connecting과 tls_handshaking을 품는다(연결을 얻을 때까지)
        r = LAB[case]
        assert abs(r['blocked']['avg'] - r['connecting']['avg'] - r['tls_handshaking']['avg']) < 1, case
    assert [round(lab(c, 'blocked')) for c in ('tls_direct', 'tls_delay_new', 'tls_delay_reuse')] == [7, 316, 3]
    assert [round(lab(c, 'duration')) for c in ('tls_direct', 'tls_delay_new', 'tls_delay_reuse')] == [55, 54, 54]
    assert (round(lab('tls_direct', 'connecting'), 1), round(lab('tls_direct', 'tls_handshaking'), 1)) == (.8, 6.2)
    assert all(100 < lab(f'bandwidth_{n}', 'waiting') < 103 and 100 < lab(f'bandwidth_{n}', 'server_time') < 102 for n in BW_LEVELS)  # 모든 VU에서 waiting과 서버 시간은 약 101ms
    assert round(lab('bandwidth_32', 'server_time')) == 101
    g = 'generator_3600'
    assert [round(lab(g, k)) for k in ('waiting', 'receiving', 'server_time')] == [61, 13, 21] and round(lab(g, 'sending'), 1) == 1.9
    assert round(lab(g, 'waiting') - lab(g, 'server_time')) == 40
    assert 1 * 1000 / 8 == 125 and 125 / .5 == 250  # 1Gbit/s = 125MB/s, 응답 500KB면 초당 250건
    assert J_DURATION - SERVER_MS == RTT + DEVICE_MS + 2 + 8 == 100  # k6 duration과 APM의 차이
    assert [round(lab('server_slow', k)) for k in ('waiting', 'server_time')] == [503, 502]
    assert [round(lab('device_delay', k)) for k in ('waiting', 'server_time')] == [504, 52]
    assert round(lab('device_delay', 'waiting') - lab('device_delay', 'server_time')) == 452
    assert BW_LIMIT / BW_KB == 40 and [round(bw_tps(n)) for n in BW_LEVELS] == [8, 15, 29, 38, 39, 40]
    assert [round(lab(f'bandwidth_{n}', 'receiving')) for n in BW_LEVELS] == [24, 34, 38, 110, 304, 695]
    assert round(BW_KB / BW_LIMIT * 1000) == 25  # 한도 안에서 256KB를 받는 데 25ms
    assert [round(lab('upload', k)) for k in ('sending', 'waiting', 'duration')] == [1190, 716, 1907]
    r = LAB['rate_limit']
    assert (r['reqs'], r['stats']['app'], r['stats']['limited']) == (1201, 666, 535) and f"{r['failed'] * 100:.1f}" == '44.5'
    assert (round(lab('rate_limit', 'duration'), 1), round(lab('rate_limit', 'server_time'))) == (28.5, 50)
    assert (LAB['ua_blocked']['reqs'], round(LAB['ua_blocked']['reqs'] / 6), LAB['ua_blocked']['failed']) == (243444, 40574, 1)
    assert (LAB['ua_allowed']['reqs'], round(LAB['ua_allowed']['reqs'] / 6), round(lab('ua_allowed', 'duration'), 1)) == (342, 57, 52.5)
    assert [round(lab(f'generator_{r}', 'duration', 'p95')) for r in GEN_RATES] == [20, 21, 24, 93, 191]
    assert [round(lab(f'generator_{r}', 'server_time', 'p95')) for r in GEN_RATES] == [20, 20, 22, 24, 24]
    assert [LAB[f'generator_{r}']['dropped'] for r in GEN_RATES] == [0, 0, 0, 320, 3148]
    assert (J_DURATION, sum(v for n, v in JOURNEY if n in ('connecting', 'tls_handshaking'))) == (220, 90)
    assert [(r['new'], r['reuse']) for r in rtt_rows()] == [(123, 121), (210, 150), (570, 270)]

    path_png()
    timeline_png()
    journey_gif()
    tls_gif()
    rtt_png()
    upload_png()
    gap_gif()
    bandwidth_gif()
    security_gif()
    ua_block_png()
    generator_gif()
    coverage_png()
    triage_png()
