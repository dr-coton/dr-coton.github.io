#!/usr/bin/env python3
"""평균 응답시간 글(average-response-time)의 그림에 쓰는 예시 데이터를 계산한다: python3 scripts/figure_data/perf.py

그림 속 숫자는 모두 아래 예시 데이터와 난수 시뮬레이션(고정 시드)으로 계산하며, 실제 서비스를 잰 값이 아니다.
본문에 적은 숫자와 맞는지는 맨 아래 assert로 확인한다. 결과: assets/figures/perf-data.js
"""
import heapq
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import write_data


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
SPAN = 60      # 요청 100건이 끝나는 시각 범위(초)
_times = random.Random(13)
A_AT = sorted(_times.uniform(0, SPAN) for _ in A)
B_AT = sorted(_times.uniform(0, SPAN) for _ in B)


# ---- fanout: 화면 하나가 부르는 호출 수. 100번 중 느린 화면의 기댓값 칸(빨강)을 섞어 놓는다
FAN_ROWS = [1, 10, 100]
FAN_COUNTS = [round(100 * (1 - .99 ** n)) for n in FAN_ROWS]
_fan = random.Random(5)
FAN_SLOW = []  # 줄마다 느린 화면인 칸의 번호(0~99)
for _k in FAN_COUNTS:
    _one = [True] * _k + [False] * (100 - _k)
    _fan.shuffle(_one)
    FAN_SLOW.append([i for i, v in enumerate(_one) if v])

# ---- vu-sweep: VU는 응답을 받고 1초 쉬었다가 다음 요청, 서버는 요청 하나에 평균 0.8ms(최대 약 1,250 TPS)
THINK, SERVICE = 1.0, .0008
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

# ---- error-fast: VU 180개가 쉬지 않고 요청. 성공은 200ms, 오류는 10ms에 돌아온다고 가정
ERR_VUS, OK_MS, ERR_MS = 180, 200, 10
TARGET_AVG, TARGET_TPS = 300, 1000


def err_stats(e):
    avg = (1 - e) * OK_MS + e * ERR_MS
    tps = ERR_VUS / (avg / 1000)  # VU가 쉬지 않으니 동시에 처리 중인 요청은 항상 VU 수 (Little의 법칙)
    return avg, tps, tps * (1 - e)


# ---- omission: 같은 멈춤을 두 방식으로 잰다
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


# ---- p99-noise: 요청 수만 바꿔 시험을 200번씩 반복
def draw_b(rng):
    """서비스 B와 같은 모양에서 요청 하나를 뽑는다. 4%가 2초 남짓."""
    return lognormal(rng, 2300, .12) if rng.random() < .04 else lognormal(rng, 112, .3)


def noise_runs(sizes=(100, 1000, 10000), runs=200, seed=21):
    rng = random.Random(seed)
    return [[pct([draw_b(rng) for _ in range(n)], 99) for _ in range(runs)] for n in sizes]


NOISE = noise_runs()


def _noise_points():
    """점마다 가로로 흩뿌리는 값(-90~90)을 원본 그림과 같은 순서로 뽑는다. [[흩뿌림, p99 ms], …]를 요청 수별로."""
    jitter = random.Random(3)
    return [[[round(jitter.uniform(-90, 90), 1), round(v, 1)] for v in runs] for runs in NOISE]


def check():
    assert abs(mean(A) - 200) < 1e-6 and abs(mean(B) - 200) < 1e-6
    assert [round(pct(A, p)) for p in (50, 95, 99)] == [194, 297, 340] and round(max(A)) == 379
    assert [round(pct(B, p)) for p in (50, 95, 99)] == [105, 186, 2421] and round(max(B)) == 2527
    assert (sum(v > SLOW_MS for v in A), sum(v > SLOW_MS for v in B)) == (0, 4)
    assert sum(v < mean(B) for v in B) == 96
    assert round((100 - .01 * 5000) / .99, 1) == 50.5  # Google SRE 책의 예: 평균 100ms, 1%가 5초
    assert [round(100 * (1 - .99 ** n), 1) for n in (1, 10, 100)] == [1.0, 9.6, 63.4] and FAN_COUNTS == [1, 10, 63]
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
    assert len(ob) - len(oa) == 49 and sum(l > .2 for l in la) == 1  # 보내지 못한 요청 49건, 느린 기록 1건
    merged = [100] * 900 + [1000] * 100
    assert (pct([100] * 900, 99) + pct([1000] * 100, 99)) / 2 == 550 and pct(merged, 99) == 1000
    assert round(.96 ** 100 + 100 * .04 * .96 ** 99, 3) == .087  # 요청 100건에서 느린 요청이 1건 이하일 확률
    assert [sum(v < SLOW_MS for v in runs) for runs in NOISE] == [22, 0, 0]


if __name__ == '__main__':
    check()
    data = {
        'span': SPAN, 'slow': SLOW_MS,
        'a': [[round(t, 2), round(x, 1)] for t, x in zip(A_AT, A)],  # [끝난 시각(초), 응답시간(ms)]
        'b': [[round(t, 2), round(x, 1)] for t, x in zip(B_AT, B)],
        'fanout': {'rows': FAN_ROWS, 'slow': FAN_SLOW},  # slow[줄] = 느린 화면인 칸 번호
        'sweep': [[n, round(t, 2), round(a, 2), round(p, 2)] for n, (t, a, p) in SWEEP.items()],  # [VU 수, TPS, 평균 ms, p99 ms]
        'err': {'vus': ERR_VUS, 'ok': OK_MS, 'err': ERR_MS, 'avg': TARGET_AVG, 'tps': TARGET_TPS},
        'omission': {'secs': SECS, 'from': STALL_FROM, 'to': STALL_TO,
                     'a': [[t, l] for t, l in omission_data()[0]], 'b': [[t, l] for t, l in omission_data()[1]]},  # [시작 초, 응답 초]
        'noise': _noise_points(),
    }
    write_data('perf', data)
