#!/usr/bin/env python3
"""평균 응답시간 글(average-response-time)의 그림과 반복 GIF를 만든다: python3 scripts/perf_figures.py

그림 속 숫자는 모두 아래 예시 데이터와 난수 시뮬레이션(고정 시드)으로 계산하며, 실제 서비스를 잰 값이 아니다.
그리는 도구(Canvas, save_gif 등)는 search_figures.py에서 가져온다.
결과: assets/perf-notes/<이름>.gif (+ 움직임 줄이기용 <이름>-still.png), <이름>.png
"""
import heapq
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import search_figures as sf
from search_figures import (BG, BLUE, BLUE_BG, BLUE_FILL, FAINT, GRID, GREEN, GREEN_BG, INK, MUTED, ORANGE, ORANGE_BG, PURPLE,
                            PURPLE_BG, RED, RED_BG, RED_FILL, SOFT, TEXT, W, Canvas, arrow, caption, card, check, cross,
                            ease, header, lerp, mix, pill, save_gif, save_png)

sf.OUT = Path(__file__).resolve().parent.parent / 'assets' / 'perf-notes'  # ponytail: save_gif가 읽는 출력 폴더만 바꾼다


# ---------------------------------------------------------------- 예시 데이터
def pct(xs, p):
    """nearest-rank 백분위수: 빠른 순서로 세웠을 때 p%가 이 값 이하로 끝난다."""
    s = sorted(xs)
    return s[math.ceil(p / 100 * len(s)) - 1]


def mean(xs):
    return sum(xs) / len(xs)


def lognormal(rng, median, sigma):
    return rng.lognormvariate(math.log(median), sigma)


def make_a(rng, n=100):
    """서비스 A: 200ms 근처에 모여 있음. 평균을 정확히 200ms로 맞춘다."""
    xs = [lognormal(rng, 185, .26) for _ in range(n)]
    k = 200 * n / sum(xs)
    return [x * k for x in xs]


def make_b(rng, n=100, slow_share=.04):
    """서비스 B: 대부분 빠르고 4%가 2초 안팎. 느린 쪽 크기를 조절해 평균을 정확히 200ms로 맞춘다."""
    slow_n = round(n * slow_share)
    fast = [lognormal(rng, 112, .3) for _ in range(n - slow_n)]
    slow = [lognormal(rng, 2000, .12) for _ in range(slow_n)]
    k = (200 * n - sum(fast)) / sum(slow)
    xs = fast + [x * k for x in slow]
    rng.shuffle(xs)
    return xs


A = make_a(random.Random(11))
B = make_b(random.Random(12))
SLOW_MS = 500  # 예시에서 '느리다'고 보는 기준


# ---------------------------------------------------------------- 공통 요소
def axis_ms(c, x0, x1, y, top, step, size=24, grid_to=None):
    """가로축 눈금. top까지 step 간격."""
    for v in range(0, top + 1, step):
        x = lerp(x0, x1, v / top)
        if grid_to is not None:
            c.line([(x, y), (x, grid_to)], GRID, 2)
        c.text(x, y + 22, f'{v:,}', size, FAINT, 'medium', 'mm')


def vline(c, x, y0, y1, color, dashed=True, width=3):
    (c.dashed((x, y0), (x, y1), color, width, 9, 6) if dashed else c.line([(x, y0), (x, y1)], color, width))


# ---------------------------------------------------------------- 1. 평균은 같고 분포는 다르다
SPAN = 60  # 요청 100건이 끝나는 시각 범위(초)
_times = random.Random(13)
A_AT = sorted(_times.uniform(0, SPAN) for _ in A)
B_AT = sorted(_times.uniform(0, SPAN) for _ in B)


def same_mean_gif():
    """질문: 평균이 같으면 사용자가 겪는 시간도 같을까? 조건: 응답시간 산점도(가로: 끝난 시각, 세로: 응답시간)에 요청 100건이 끝나는 대로 점이 찍힌다.
    변화: 평균 선(그때까지 찍힌 점의 평균)은 두 서비스에서 200ms로 모이는데, B에서는 느린 점 4개가 평균을 끌어올린다.
    알 수 있는 것: 평균은 같아도 B에는 평균 선 위로 떠 있는 요청이 있다."""
    H, top = 780, 2600
    x0, x1, r = 110, 1010, 4.5
    panels = [('서비스 A', BLUE, BLUE_BG, A_AT, A, 100), ('서비스 B', PURPLE, PURPLE_BG, B_AT, B, 420)]
    plot_h = 240

    def px(sec):
        return lerp(x0, x1, sec / SPAN)

    def draw(now, mean_t=0, slow_t=0, status=None, status_color=BLUE):
        c = Canvas(H)
        header(c, '같은 평균, 다른 요청', '점 하나 = 요청 1건 · 가로: 끝난 시각 · 세로: 응답시간(ms)')
        for name, fg, bg, ats, xs, y in panels:
            yb = y + plot_h
            for v in range(0, top + 1, 500):
                yy = yb - plot_h * v / top
                c.line([(x0, yy), (x1, yy)], GRID, 2)
                c.text(x0 - 14, yy, f'{v:,}', 22, FAINT, 'medium', 'rm')
            pill(c, 1040, y + 6, name, fg, bg, 24, 'r')  # 격자선 위에 그린다
            shown = [i for i, t in enumerate(ats) if t <= now]
            if mean_t and len(shown) > 1:  # 그때까지 찍힌 점의 평균. 점이 늘 때마다 다시 계산한다
                pts = [(px(ats[k]), yb - plot_h * mean(xs[:k + 1]) / top) for k in shown]
                c.line(pts + [(px(min(now, SPAN)), pts[-1][1])], mix(GREEN, BG, 1 - mean_t), 4)
            for i in shown:
                red = slow_t and xs[i] > SLOW_MS
                c.circle(px(ats[i]), yb - plot_h * xs[i] / top, 6.5 if red else r, fill=RED if red else fg)
            if mean_t and now >= SPAN:
                c.text(x1 - 4, yb - plot_h * 700 / top, f'평균 {mean(xs):.0f}ms', 26, mix(GREEN, BG, 1 - mean_t), 'bold', 'rm')
            if slow_t:
                yy = yb - plot_h * SLOW_MS / top
                c.dashed((x0, yy), (x1, yy), mix(ORANGE, BG, 1 - slow_t), 2, 9, 6)
                cnt = sum(v > SLOW_MS for v in xs)
                c.text(x0 + 10, yy - 18, f'{SLOW_MS}ms 넘는 요청 {cnt}건', 26, mix(RED if cnt else GREEN, BG, 1 - slow_t), 'bold')
        for v in range(0, SPAN + 1, 10):
            c.text(px(v), 420 + plot_h + 26, f'{v}s', 22, FAINT, 'medium', 'mm')
        if now < SPAN:
            vline(c, px(now), 100, 420 + plot_h, FAINT, width=2)
        if status:
            caption(c, status, status_color, 752)
        return c.done()

    frames = [(draw(0), 500)]
    for k in range(1, 31):
        frames.append((draw(SPAN * k / 30, 1 if k > 0 else 0, status='① 요청이 끝나는 대로 점이 찍힘', status_color=BLUE), 90))
    frames.append((draw(SPAN, 1, status='② 평균은 두 서비스 모두 200ms', status_color=GREEN), 1900))
    for t in (.5, 1):
        frames.append((draw(SPAN, 1, t, status='③ B에는 평균 선 위로 떠 있는 요청이 있음', status_color=RED), 120 if t < 1 else 2800))
    still = draw(SPAN, 1, 1, status='③ B에는 평균 선 위로 떠 있는 요청이 있음', status_color=RED)
    save_gif('same-mean', frames, still)


# ---------------------------------------------------------------- 2. 백분위수
def percentile_gif():
    """질문: p99는 무엇을 세는가? 조건: 서비스 B의 요청 100건을 빠른 순서로 세운다.
    변화: 표시가 p50, p95, p99로 옮겨 가며 그 안에 들어오는 요청이 칠해진다.
    알 수 있는 것: 평균보다 빠른 요청이 대부분이고, 느린 꼬리는 p99에서야 처음 보인다."""
    H, top = 640, 2600
    x0, x1, y0, y1 = 100, 1010, 150, 500
    ranked = sorted(B)
    pitch = (x1 - x0) / 100
    marks = [(50, BLUE, BLUE_BG), (95, BLUE, BLUE_BG), (99, RED, RED_BG)]
    below_mean = sum(v < mean(B) for v in B)

    def py(ms):
        return lerp(y1, y0, ms / top)

    def draw(grow, mean_t, k=None, reached=(), status=None, status_color=BLUE):
        c = Canvas(H)
        header(c, '요청 100건을 빠른 순서로', '막대 하나 = 요청 1건 · 세로: 응답시간(ms)')
        for v in range(0, top + 1, 500):
            c.line([(x0, py(v)), (x1, py(v))], GRID, 2)
            c.text(x0 - 14, py(v), f'{v:,}', 24, FAINT, 'medium', 'rm')
        cut = round(k) if k else 0
        for i, v in enumerate(ranked):
            if k is None:
                color = mix(BLUE, BG, .3)
            elif i + 1 == cut:
                color = RED if cut >= 99 else INK
            else:
                color = BLUE if i < cut else mix(BLUE, BG, .78)
            c.rect(x0 + i * pitch + 1.4, py(v * grow), pitch - 2.8, y1 - py(v * grow), fill=color, r=2)
        c.line([(x0, y1), (x1, y1)], FAINT, 2)
        c.text(x0, y1 + 28, '가장 빠른 요청', 24, FAINT, 'medium')
        c.text(x1, y1 + 28, '가장 느린 요청', 24, FAINT, 'medium', 'rm')
        if mean_t:
            col = mix(GREEN, BG, 1 - mean_t)
            c.dashed((x0, py(mean(B))), (x1, py(mean(B))), col, 3, 9, 6)
            c.text(640, py(mean(B)) - 24, f'평균 {mean(B):.0f}ms', 26, col, 'bold', 'mm')
        if k:
            xk = x0 + (round(k) - .5) * pitch
            col = RED if k >= 99 else INK
            c.dashed((xk, py(ranked[round(k) - 1]) - 6), (xk, 168), col, 3, 8, 6)
            label = f'{round(k)}번째 · {ranked[round(k) - 1]:,.0f}ms'
            c.text(xk + (-12 if xk > 800 else 0), 150, label, 26, col, 'bold', 'rm' if xk > 800 else 'mm')
        for i, (p, fg, bg) in enumerate(marks):  # 도달한 백분위수를 왼쪽 위에 쌓는다
            if p in reached:
                y = 196 + i * 44
                pill(c, 120, y, f'p{p}', fg, bg, 24)
                c.text(206, y, f'{pct(B, p):,.0f}ms', 26, INK, 'bold')
        if status:
            caption(c, status, status_color, 604)
        return c.done()

    frames = [(draw(0, 0), 400)]
    for f in range(1, 15):
        frames.append((draw(ease(f / 14), 0), 60))
    for t in (.5, 1):
        frames.append((draw(1, t, status=f'평균보다 빠른 요청이 {below_mean}건', status_color=GREEN), 100 if t < 1 else 1800))
    prev, reached = 0, []
    notes = {50: '절반의 요청이 이 시간 안에 끝남', 95: '95건이 이 시간 안에 끝남', 99: '99건이 이 시간 안에 끝남 · 느린 요청이 처음 보임'}
    for p, fg, _ in marks:
        if prev:
            for f in range(1, 9):
                frames.append((draw(1, 1, lerp(prev, p, ease(f / 8)), reached, f'p{p}로 이동', FAINT), 50))
        reached = reached + [p]
        frames.append((draw(1, 1, p, reached, notes[p], fg), 1900 if p < 99 else 2800))
        prev = p
    save_gif('percentile', frames, frames[-1][0])


# ---------------------------------------------------------------- 3. 화면 하나가 호출 여러 개
def fanout_gif():
    """질문: 호출 하나가 느릴 확률이 1%뿐이면 괜찮지 않을까? 조건: 화면 하나가 부르는 호출 수를 1, 10, 100개로 바꾼다.
    변화: 느린 화면(빨강)이 1%에서 63%로 늘어난다. 알 수 있는 것: 호출이 많을수록 개별 p99가 화면 전체의 흔한 경험이 된다."""
    H = 630
    rows = [1, 10, 100]
    counts = [round(100 * (1 - .99 ** n)) for n in rows]  # 100번 중 기댓값
    rng = random.Random(5)
    cells = []
    for k in counts:
        one = [True] * k + [False] * (100 - k)
        rng.shuffle(one)
        cells.append(one)

    def draw(shown, status=None, status_color=BLUE):
        c = Canvas(H)
        header(c, '화면 하나가 부르는 호출 수', '호출 1개가 느릴 확률 1% · 화면 100번의 기댓값')
        for r, n in enumerate(rows):
            y = 100 + r * 162
            w = pill(c, 40, y + 16, f'호출 {n}개', BLUE, BLUE_BG, 24)
            for d in range(n):
                c.circle(40 + w + 24 + d * 6.2, y + 16, 2.6, fill=mix(BLUE, BG, .25))
            done = min(100, max(0, shown[r]))
            for i in range(100):
                x = 40 + i * 10
                if i < done:
                    c.rect(x, y + 52, 7.4, 44, fill=RED if cells[r][i] else mix(BLUE, BG, .78), r=2)
                else:
                    c.rect(x, y + 52, 7.4, 44, fill=SOFT, r=2)
            slow = sum(cells[r][:done])
            if done == 100:
                c.text(40, y + 120, f'느린 화면 {slow}% · 1 − 0.99^{n} = {100 * (1 - .99 ** n):.1f}%', 24, RED if slow >= 10 else TEXT, 'bold')
            elif done:
                c.text(40, y + 120, f'느린 화면 {slow}건', 24, MUTED, 'semibold')
        if status:
            caption(c, status, status_color, 600)
        return c.done()

    frames = [(draw([0, 0, 0]), 600)]
    shown = [0, 0, 0]
    for r in range(3):
        for f in range(1, 11):
            shown[r] = f * 10
            frames.append((draw(list(shown)), 60))
        frames.append((draw(list(shown)), 700))
    still = draw([100, 100, 100], '호출이 100개면 화면 10개 중 6개가 느림', RED)
    frames.append((still, 2800))
    save_gif('fanout', frames, still)


# ---------------------------------------------------------------- 4. VU를 늘려도 TPS는 그대로
THINK, SERVICE = 1.0, .0008  # VU는 응답을 받고 1초 쉬었다가 다음 요청, 서버는 요청 하나에 평균 0.8ms(최대 약 1,250 TPS)
LEVELS = list(range(125, 2501, 125))


def closed_loop(vus, warmup=10, duration=70, seed=3):
    """VU(가상 사용자) 수를 정하고 서버 하나가 요청을 도착 순서대로 처리하는 시뮬레이션. (TPS, 평균 ms, p99 ms)"""
    rng = random.Random(seed)
    ready = [(rng.random() * THINK, i) for i in range(vus)]
    heapq.heapify(ready)
    free_at, lat = 0.0, []
    while ready:
        t, i = heapq.heappop(ready)
        if t > duration:
            break
        free_at = max(t, free_at) + rng.expovariate(1 / SERVICE)
        if warmup <= free_at <= duration:
            lat.append(free_at - t)
        heapq.heappush(ready, (free_at + THINK, i))
    return len(lat) / (duration - warmup), mean(lat) * 1000, pct(lat, 99) * 1000


SWEEP = {n: closed_loop(n) for n in LEVELS}


def vu_sweep_gif():
    """질문: TPS가 목표를 넘고 더 오르지 않으면 한계에 도달한 것이니 거기서 끝내도 될까? 조건: VU를 125에서 2,500까지 올린다.
    변화: TPS는 1,250 근처에서 멈추는데 p99는 계속 오른다. 알 수 있는 것: 같은 TPS에서도 사용자가 기다리는 시간은 다르다."""
    H, xmax = 700, 2500
    x0, x1 = 120, 1010
    t0, t1, tmax = 150, 300, 1400   # TPS 차트
    l0, l1, lmax = 380, 600, 1200   # 지연 차트

    def px(n):
        return lerp(x0, x1, n / xmax)

    def tps_y(v):
        return lerp(t1, t0, v / tmax)

    def lat_y(v):
        return lerp(l1, l0, min(v, lmax) / lmax)

    def draw(i, status=None, status_color=BLUE):
        c = Canvas(H)
        header(c, 'VU를 늘려 가며 잰 결과', '예시 서버 · VU는 응답 뒤 1초 쉼')
        pill(c, 40, 104, 'TPS', BLUE, BLUE_BG, 24)
        pill(c, 40, 340, '응답시간', PURPLE, PURPLE_BG, 24)
        for v in range(0, tmax + 1, 500):
            c.line([(x0, tps_y(v)), (x1, tps_y(v))], GRID, 2)
            c.text(x0 - 14, tps_y(v), f'{v:,}', 24, FAINT, 'medium', 'rm')
        for v in range(0, lmax + 1, 400):
            c.line([(x0, lat_y(v)), (x1, lat_y(v))], GRID, 2)
            c.text(x0 - 14, lat_y(v), f'{v:,}', 24, FAINT, 'medium', 'rm')
        for n in range(0, xmax + 1, 500):
            c.text(px(n), l1 + 28, f'{n:,}', 24, FAINT, 'medium', 'mm')
        c.text(x1, l1 + 56, 'VU 수', 24, FAINT, 'medium', 'rm')
        c.dashed((x0, tps_y(1000)), (x1, tps_y(1000)), GREEN, 3, 9, 6)
        c.text(x0 + 10, tps_y(1000) - 16, '목표 1,000', 24, GREEN, 'bold')
        c.dashed((x0, lat_y(SLOW_MS)), (x1, lat_y(SLOW_MS)), ORANGE, 3, 9, 6)
        c.text(x0 + 10, lat_y(SLOW_MS) - 16, '500ms', 24, ORANGE, 'bold')
        shown = LEVELS[:i + 1]
        for series, color, y_of, width in ((0, BLUE, tps_y, 5), (1, BLUE, lat_y, 5), (2, RED, lat_y, 5)):
            pts = [(px(n), y_of(SWEEP[n][series])) for n in shown]
            if len(pts) > 1:
                c.line(pts, color, width)
            c.circle(*pts[-1], 8, fill=color)
        n = shown[-1]
        tps, avg, p99 = SWEEP[n]
        vline(c, px(n), t0, l1, FAINT, width=2)
        c.text(1040, 104, f'VU {n:,} · TPS {tps:,.0f}', 26, BLUE, 'bold', 'rm')
        c.text(1040, 340, f'평균 {avg:,.0f}ms · p99 {p99:,.0f}ms', 26, RED, 'bold', 'rm')
        c.text(x0 + 10, lat_y(0) - 40, '평균', 24, BLUE, 'bold')
        c.text(x0 + 80, lat_y(0) - 40, 'p99', 24, RED, 'bold')
        if status:
            caption(c, status, status_color, 672)
        return c.done()

    holds = {1125: 1800, 1250: 2000, 2500: 3000}
    notes = {1125: (f'VU 1,125 · TPS 목표 달성, p99 {SWEEP[1125][2]:,.0f}ms', GREEN),
             1250: (f'VU 1,250 · TPS가 거의 멈춤, p99 {SWEEP[1250][2]:,.0f}ms', BLUE),
             2500: (f'VU 2,500 · TPS는 그대로, p99 {SWEEP[2500][2]:,.0f}ms', RED)}
    frames, last = [(draw(0, 'VU를 올리면 TPS도 오름', BLUE), 500)], None
    for i in range(1, len(LEVELS)):
        n = LEVELS[i]
        note = notes.get(n, ('VU를 올리면 TPS도 오름' if n < 1125 else 'VU를 더 올림', BLUE))
        last = (draw(i, *note), holds.get(n, 120))
        frames.append(last)
    save_gif('vu-sweep', frames, last[0])


# ---------------------------------------------------------------- 5. 빠른 에러가 TPS를 올린다
ERR_VUS, OK_MS, ERR_MS = 180, 200, 10   # VU 180개, 쉬지 않고 요청. 성공은 200ms, 오류는 10ms에 돌아온다고 가정
TARGET_AVG, TARGET_TPS = 300, 1000


def err_stats(e):
    avg = (1 - e) * OK_MS + e * ERR_MS
    tps = ERR_VUS / (avg / 1000)  # VU가 쉬지 않으니 동시에 처리 중인 요청은 항상 VU 수 (Little의 법칙)
    return avg, tps, tps * (1 - e)


def error_fast_gif():
    """질문: 평균과 TPS가 좋아졌다면 시스템도 좋아진 걸까? 조건: 오류 응답 비율을 0%에서 30%까지 올린다(오류는 10ms에 응답).
    변화: 평균은 줄고 TPS는 늘어 목표를 넘는데, 성공한 요청만 센 TPS는 오히려 줄어든다. 알 수 있는 것: 오류율 없이는 두 숫자를 믿을 수 없다."""
    H = 600
    x0, x1 = 400, 800
    rows = [  # 이름, 값 계산, 막대 최대값, 목표(없으면 None), 목표 방향
        ('평균 응답시간', lambda e: err_stats(e)[0], 400, TARGET_AVG, 'max', lambda v: f'{v:,.0f}ms'),
        ('TPS', lambda e: err_stats(e)[1], 1500, TARGET_TPS, 'min', lambda v: f'{v:,.0f}'),
        ('성공한 요청만 센 TPS', lambda e: err_stats(e)[2], 1500, TARGET_TPS, 'min', lambda v: f'{v:,.0f}'),
        ('오류 응답 비율', lambda e: e * 100, 40, None, None, lambda v: f'{v:.0f}%'),
    ]

    def draw(e, status=None, status_color=BLUE):
        c = Canvas(H)
        header(c, '오류가 빨리 돌아오면', f'VU {ERR_VUS}개 · 성공 {OK_MS}ms · 오류 {ERR_MS}ms (가정)')
        pass_all = err_stats(e)[0] <= TARGET_AVG and err_stats(e)[1] >= TARGET_TPS
        for r, (name, value, vmax, target, mode, fmt) in enumerate(rows):
            y = 130 + r * 86
            v = value(e)
            c.text(40, y, name, 28, INK, 'semibold')
            c.rect(x0, y - 16, x1 - x0, 32, fill=SOFT, r=6)
            ok = target is None or (v <= target if mode == 'max' else v >= target)
            color = RED if name == '오류 응답 비율' and e > 0 else BLUE if ok else mix(BLUE, BG, .5)
            c.rect(x0, y - 16, max(4, (x1 - x0) * v / vmax), 32, fill=color, r=6)
            if target is not None:
                tx = lerp(x0, x1, target / vmax)
                c.line([(tx, y - 26), (tx, y + 26)], GREEN, 4)
                c.text(tx, y + 40, f'목표 {target:,}', 22, GREEN, 'bold', 'mm') if r else c.text(tx, y - 36, f'목표 {target:,}', 22, GREEN, 'bold', 'mm')
            c.text(x1 + 24, y, fmt(v), 28, INK, 'bold')
            if target is not None:
                (check if ok else cross)(c, 1010, y, GREEN if ok else RED)
        pill(c, 40, 490, '평균과 TPS만 보면', INK, SOFT, 24)
        pill(c, 330, 490, '합격' if pass_all else '불합격', GREEN if pass_all else RED, GREEN_BG if pass_all else RED_BG, 26)
        if status:
            caption(c, status, status_color, 566)
        return c.done()

    frames, stops, last = [], [0, .1, .2, .3], 0
    notes = {0: ('오류 없음: TPS 900, 목표에 못 미침', RED), .1: ('오류 10%: TPS 목표 직전', BLUE),
             .2: ('오류 20%: 평균과 TPS 모두 목표를 넘음', GREEN), .3: ('오류 30%: 성공한 요청은 더 줄어듦', RED)}
    for s in stops:
        for f in range(1, 7) if s else [6]:
            frames.append((draw(lerp(last, s, ease(f / 6)), *notes[s] if f == 6 else (None, BLUE)), 1700 if f == 6 and s != .3 else 2800 if f == 6 else 60))
        last = s
    save_gif('error-fast', frames, frames[-1][0])


# ---------------------------------------------------------------- 6. 측정 도구가 느린 구간을 건너뛴다
RATE, SECS, NORMAL_MS, STALL_FROM, STALL_TO = 10, 30, 50, 10, 15   # 초당 10건, 30초, 정상 응답 50ms, 서버 10~15초 멈춤


def omission_data():
    """같은 멈춤을 두 방식으로 잰다. 방식 A: 응답을 받은 뒤에 다음 요청. 방식 B: 정해진 시각마다 요청.
    시각은 ms 정수로 계산해 소수점 오차가 멈춤 구간 경계를 흔들지 않게 한다. 반환: [(시작 초, 응답 초)]."""
    gap, end = 1000 // RATE, SECS * 1000

    def lat_at(t):
        return STALL_TO * 1000 - t + NORMAL_MS if STALL_FROM * 1000 <= t < STALL_TO * 1000 else NORMAL_MS

    a, t = [], 0
    while t < end:
        a.append((t / 1000, lat_at(t) / 1000))
        t += max(gap, lat_at(t)) if lat_at(t) > NORMAL_MS else gap
    b = [(t / 1000, lat_at(t) / 1000) for t in range(0, end, gap)]
    return a, b


def omission_gif():
    """질문: 응답시간 평균과 p99가 괜찮으면 5초 멈춘 서버도 괜찮은가? 조건: 서버가 5초 멈춘 같은 시험을 두 방식으로 잰다.
    변화: 응답을 기다리는 방식은 멈춘 동안 요청을 못 보내 느린 기록이 1건뿐이다. 알 수 있는 것: 도구가 서버를 따라 느려지면 느린 구간이 숫자에서 사라진다."""
    A_, B_ = omission_data()
    H, hmax = 760, 5.2
    x0, x1 = 70, 1010
    lane_a, lane_b, lane_h = 300, 520, 110

    def px(t):
        return lerp(x0, x1, t / SECS)

    def bar_h(lat):
        return max(3, lane_h * lat / hmax)

    def draw(t_now, result_t=0, status=None, status_color=BLUE):
        c = Canvas(H)
        header(c, '서버가 5초 멈추면', '막대 하나 = 요청 1건 · 높이: 응답시간')
        pill(c, 40, 100, '서버', MUTED, SOFT, 24)
        c.rect(px(0), 124, px(STALL_FROM) - px(0), 24, fill=mix(GREEN, BG, .7), r=4)
        c.rect(px(STALL_FROM), 124, px(STALL_TO) - px(STALL_FROM), 24, fill=RED, r=4)
        c.rect(px(STALL_TO), 124, px(SECS) - px(STALL_TO), 24, fill=mix(GREEN, BG, .7), r=4)
        c.text(px((STALL_FROM + STALL_TO) / 2), 160, '10~15초 멈춤', 24, RED, 'bold', 'mm')
        for name, fg, bg, data, y_base, y_pill in (('응답 대기 방식', BLUE, BLUE_BG, A_, lane_a, 200),
                                                    ('시각 고정 방식', PURPLE, PURPLE_BG, B_, lane_b, 420)):
            pill(c, 40, y_pill, name, fg, bg, 24)
            c.line([(x0, y_base), (x1, y_base)], GRID, 2)
            for t, lat in data:
                if t <= t_now:
                    slow = lat > .2
                    c.rect(px(t), y_base - bar_h(lat), 8 if data is A_ and slow else 3.2, bar_h(lat), fill=RED if slow else mix(fg, BG, .25), r=1)
            if data is A_ and t_now > STALL_FROM + 1:
                c.rect(px(STALL_FROM) + 14, y_base - 74, px(STALL_TO) - px(STALL_FROM) - 20, 64, outline=FAINT, width=2, r=8)
                c.text(px(12.5) + 4, y_base - 54, '보내지 못한', 22, MUTED, 'semibold', 'mm')
                c.text(px(12.5) + 4, y_base - 28, f'요청 {len(B_) - len(A_)}건', 22, MUTED, 'semibold', 'mm')
        for v in range(0, SECS + 1, 5):
            c.text(px(v), lane_b + 26, f'{v}s', 24, FAINT, 'medium', 'mm')
        vline(c, px(min(t_now, SECS)), 170, lane_b + 4, FAINT, width=2)
        if result_t:
            for x, fg, bg, data in ((40, BLUE, BLUE_BG, A_), (560, PURPLE, PURPLE_BG, B_)):
                lats = [l for _, l in data]
                col = mix(fg, BG, 1 - result_t)
                card(c, x, 590, 480, 112, outline=mix(GRID, BG, 1 - result_t))
                c.text(x + 24, 622, f'잰 요청 {len(lats)}건', 24, mix(MUTED, BG, 1 - result_t), 'semibold')
                c.text(x + 24, 668, f'평균 {mean(lats) * 1000:,.0f}ms · p99 {pct(lats, 99) * 1000:,.0f}ms', 30, mix(RED if pct(lats, 99) > 1 else INK, BG, 1 - result_t), 'bold')
        if status:
            caption(c, status, status_color, 738)
        return c.done()

    frames = [(draw(-1), 500)]
    for step in range(0, SECS * 2 + 1):
        frames.append((draw(step / 2), 90))
    for t in (.5, 1):
        frames.append((draw(SECS, t, '같은 서버, 다른 결과', RED), 120 if t < 1 else 3000))
    save_gif('omission', frames, frames[-1][0])


# ---------------------------------------------------------------- 7. 요청 수가 적으면 p99가 흔들린다
def draw_b(rng):
    """서비스 B와 같은 모양에서 요청 하나를 뽑는다. 4%가 2초 남짓."""
    return lognormal(rng, 2300, .12) if rng.random() < .04 else lognormal(rng, 112, .3)


def noise_runs(sizes=(100, 1000, 10000), runs=200, seed=21):
    rng = random.Random(seed)
    return [[pct([draw_b(rng) for _ in range(n)], 99) for _ in range(runs)] for n in sizes]


def noise_png(results):
    H, top = 600, 3000
    x0, x1, y0, y1 = 120, 1010, 110, 430
    c = Canvas(H)
    header(c, '같은 서비스를 200번 재 보면', '점 하나 = 시험 1번의 p99')

    def py(ms):
        return lerp(y1, y0, ms / top)

    for v in range(0, top + 1, 1000):
        c.line([(x0, py(v)), (x1, py(v))], GRID, 2)
        c.text(x0 - 14, py(v), f'{v:,}', 24, FAINT, 'medium', 'rm')
    jitter = random.Random(3)
    sizes = ('요청 100건', '요청 1,000건', '요청 10,000건')
    for i, (label, runs) in enumerate(zip(sizes, results)):
        cx = x0 + (i + .5) * (x1 - x0) / 3
        for v in runs:
            c.circle(cx + jitter.uniform(-90, 90), py(v), 5, fill=mix(RED if v < SLOW_MS else BLUE, BG, .25))
        c.text(cx, y1 + 30, label, 26, INK, 'bold', 'mm')
        low = sum(v < SLOW_MS for v in runs)
        c.text(cx, y1 + 66, f'p99 500ms 미만 {low}번', 24, RED if low else MUTED, 'semibold', 'mm')
    caption(c, '요청이 적을수록 p99 한 번의 값을 믿기 어려움', ORANGE, 570)
    save_png('p99-noise', c.done())
    return [sum(v < SLOW_MS for v in runs) for runs in results]


if __name__ == '__main__':
    # 본문에 적은 숫자가 이 계산과 맞는지 먼저 확인한다.
    assert abs(mean(A) - 200) < 1e-6 and abs(mean(B) - 200) < 1e-6
    assert [round(pct(A, p)) for p in (50, 95, 99)] == [194, 297, 340] and round(max(A)) == 379
    assert [round(pct(B, p)) for p in (50, 95, 99)] == [105, 186, 2421] and round(max(B)) == 2527
    assert (sum(v > SLOW_MS for v in A), sum(v > SLOW_MS for v in B)) == (0, 4)
    assert sum(v < mean(B) for v in B) == 96
    assert round((100 - .01 * 5000) / .99, 1) == 50.5  # Google SRE 책의 예: 평균 100ms, 1%가 5초
    assert [round(100 * (1 - .99 ** n), 1) for n in (1, 10, 100)] == [1.0, 9.6, 63.4]
    assert min(n for n in range(1, 200) if 1 - .99 ** n >= .5) == 69
    mc = random.Random(1)
    assert abs(sum(any(mc.random() < .01 for _ in range(100)) for _ in range(20000)) / 20000 - (1 - .99 ** 100)) < .01
    tps, avg, p99 = SWEEP[1125]
    assert (round(tps), round(p99)) == (1117, 30) and SWEEP[1000][0] < 1000 <= tps
    assert [round(v) for v in SWEEP[1250]] == [1225, 21, 65] and [round(v) for v in SWEEP[2500]] == [1262, 984, 1074]
    assert [round(v) for v in SWEEP[1750]] == [1261, 389, 460] and round(SWEEP[1875][2]) == 560
    assert abs(SWEEP[2500][0] * (SWEEP[2500][1] / 1000 + THINK) - 2500) < 25  # Little의 법칙: VU = TPS × (응답 + 쉼)
    assert [round(v) for v in err_stats(0)] == [200, 900, 900] and [round(v) for v in err_stats(.2)] == [162, 1111, 889]
    assert [round(v) for v in err_stats(.3)] == [143, 1259, 881]
    assert abs(err_stats(20 / 190)[1] - 1000) < 1e-6  # 오류 10.5%에서 TPS가 목표 1,000에 닿음
    oa, ob = omission_data()
    la, lb = [l for _, l in oa], [l for _, l in ob]
    assert (len(la), round(mean(la) * 1000), round(pct(la, 99) * 1000), round(max(la) * 1000)) == (251, 70, 50, 5050)
    assert (len(lb), round(mean(lb) * 1000), round(pct(lb, 99) * 1000)) == (300, 475, 4750)
    merged = [100] * 900 + [1000] * 100
    assert (pct([100] * 900, 99) + pct([1000] * 100, 99)) / 2 == 550 and pct(merged, 99) == 1000
    assert round(.96 ** 100 + 100 * .04 * .96 ** 99, 3) == .087  # 요청 100건에서 느린 요청이 1건 이하일 확률

    same_mean_gif()
    percentile_gif()
    fanout_gif()
    vu_sweep_gif()
    error_fast_gif()
    omission_gif()
    low = noise_png(noise_runs())
    assert low == [22, 0, 0], low
