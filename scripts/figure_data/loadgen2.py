#!/usr/bin/env python3
"""k6와 APM 글(loadgen-vs-apm) 뒤쪽 그림(bandwidth, security, ua-block, generator)에 쓰는 값을 내보낸다: python3 scripts/figure_data/loadgen2.py

- 실험 값은 scripts/k6_lab/results.json(내 컴퓨터에서 k6와 가짜 서버로 잰 값)에서 읽는다. k6는 필요 없다.
- 본문에 적은 숫자와 맞는지는 아래 check()의 assert로 확인하고, 통과하면 assets/figures/loadgen2-data.js 를 쓴다.
- coverage, triage는 숫자 없는 표라서 데이터가 없다(JS에 그대로 있다).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import write_data

ROOT = Path(__file__).resolve().parents[2]
LAB = json.load(open(ROOT / 'scripts' / 'k6_lab' / 'results.json'))

BW_LEVELS = [1, 2, 4, 8, 16, 32]
BW_KB, BW_LIMIT = 256, 10240  # 응답 256KB, 서버가 흘려보내는 속도 한도 10,240KB/s (연결 전체 합계)
GEN_RATES = [1000, 2000, 2800, 3200, 3600]
SEC_DOTS = 30  # security 그림의 점 수(요청 1,201건을 점 30개로 보여 준다)
UA_SECONDS = 6  # ua-block 시험 시간(초)


def lab(case, phase, stat='avg'):
    return LAB[case][phase][stat]


def bw_tps(n):
    return n / (lab(f'bandwidth_{n}', 'duration') / 1000)  # 쉬지 않는 VU n개: 초당 요청 수 = VU ÷ 평균 응답시간


def build():
    rl = LAB['rate_limit']
    sent, passed = rl['reqs'], rl['stats']['app']
    frac = passed / sent
    ua = {}
    for key, case in (('blocked', 'ua_blocked'), ('allowed', 'ua_allowed')):
        d = LAB[case]
        ua[key] = dict(tps=d['reqs'] / UA_SECONDS, failed=d['failed'], duration=d['duration']['avg'], app=d['stats']['app'])
    return dict(
        bw=dict(rows=[dict(vu=n, tps=bw_tps(n), waiting=lab(f'bandwidth_{n}', 'waiting'), receiving=lab(f'bandwidth_{n}', 'receiving')) for n in BW_LEVELS],
                server=lab('bandwidth_32', 'server_time'), limit=BW_LIMIT / BW_KB),
        sec=dict(sent=sent, passed=passed, limited=rl['stats']['limited'], failed=rl['failed'], duration=lab('rate_limit', 'duration'), server=lab('rate_limit', 'server_time'),
                 ok=[int((i + 1) * frac) > int(i * frac) for i in range(SEC_DOTS)]),  # 점 i가 장비를 통과하는가: 통과율(666/1,201)만큼만 true
        ua=ua,
        gen=dict(rows=[dict(rate=r, duration=lab(f'generator_{r}', 'duration', 'p95'), server=lab(f'generator_{r}', 'server_time', 'p95'), dropped=LAB[f'generator_{r}']['dropped']) for r in GEN_RATES]),
    )


def check(d):
    """본문에 적은 숫자가 실험 결과와 맞는지 확인한다."""
    for case, row in LAB.items():
        if isinstance(row, dict) and 'duration' in row:  # duration = sending + waiting + receiving
            assert abs(row['duration']['avg'] - sum(row[k]['avg'] for k in ('sending', 'waiting', 'receiving'))) < .2, case
    # bandwidth
    assert all(100 < lab(f'bandwidth_{n}', 'waiting') < 103 and 100 < lab(f'bandwidth_{n}', 'server_time') < 102 for n in BW_LEVELS)  # 모든 VU에서 waiting과 서버 시간은 약 101ms
    assert round(lab('bandwidth_32', 'server_time')) == 101
    assert BW_LIMIT / BW_KB == 40 and [round(r['tps']) for r in d['bw']['rows']] == [8, 15, 29, 38, 39, 40]
    assert [round(r['receiving']) for r in d['bw']['rows']] == [24, 34, 38, 110, 304, 695]
    assert round(BW_KB / BW_LIMIT * 1000) == 25  # 한도 안에서 256KB를 받는 데 25ms
    assert 1 * 1000 / 8 == 125 and 125 / .5 == 250  # 1Gbit/s = 125MB/s, 응답 500KB면 초당 250건
    # security
    s = d['sec']
    assert (s['sent'], s['passed'], s['limited']) == (1201, 666, 535) and f"{s['failed'] * 100:.1f}" == '44.5'
    assert (round(s['duration'], 1), round(s['server'])) == (28.5, 50)
    assert len(s['ok']) == SEC_DOTS and sum(s['ok']) == int(SEC_DOTS * s['passed'] / s['sent'])  # 점 30개 중 통과하는 점은 통과율만큼(내림)
    # ua-block
    b, a = d['ua']['blocked'], d['ua']['allowed']
    assert (LAB['ua_blocked']['reqs'], round(b['tps']), b['failed']) == (243444, 40574, 1) and f"{b['duration']:.1f}" == '0.1' and b['app'] == 0
    assert (LAB['ua_allowed']['reqs'], round(a['tps']), f"{a['duration']:.1f}", a['app']) == (342, 57, '52.5', 342)
    # generator
    g = 'generator_3600'
    assert [round(lab(g, k)) for k in ('waiting', 'receiving', 'server_time')] == [61, 13, 21] and round(lab(g, 'sending'), 1) == 1.9
    assert round(lab(g, 'waiting') - lab(g, 'server_time')) == 40
    assert [round(r['duration']) for r in d['gen']['rows']] == [20, 21, 24, 93, 191]
    assert [round(r['server']) for r in d['gen']['rows']] == [20, 20, 22, 24, 24]
    assert [r['dropped'] for r in d['gen']['rows']] == [0, 0, 0, 320, 3148]


if __name__ == '__main__':
    data = build()
    check(data)
    write_data('loadgen2', data)
