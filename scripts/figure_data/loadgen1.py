#!/usr/bin/env python3
"""k6와 APM 글(loadgen-vs-apm) 앞쪽 그림(timeline, journey, tls, rtt, upload, gap)의 예시 값·계산·본문 숫자 확인: python3 scripts/figure_data/loadgen1.py

- journey(모식도)의 예시 값과 rtt(계산)의 계산식을 내보낸다. 실험 값(tls, upload, gap)은 loadgen-data.js의 lab을 그대로 쓴다.
- 그림 해설 문구에 적은 숫자(54ms, 1,907ms, 716ms, 220ms, 90ms ...)와 본문 숫자가 실험 결과와 맞는지 맨 아래 check()에서 확인한다.
결과: assets/figures/loadgen1-data.js
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import write_data

ROOT = Path(__file__).resolve().parents[2]
LAB = json.load(open(ROOT / 'scripts' / 'k6_lab' / 'results.json'))

RTT, DEVICE_MS, SERVER_MS = 30, 60, 120  # 예시 값: 왕복 30ms, 장비 검사 60ms, 서버가 일한 시간 120ms
JOURNEY = [('connecting', RTT), ('tls_handshaking', 2 * RTT), ('sending', 2), ('waiting', RTT + DEVICE_MS + SERVER_MS), ('receiving', 8)]
J_DURATION = sum(v for n, v in JOURNEY if n in ('sending', 'waiting', 'receiving'))


def lab(case, phase, stat='avg'):
    return LAB[case][phase][stat]


def rtt_rows():
    rows = []
    for rtt in (1, 30, 150):  # 새 연결: TCP 1왕복 + TLS 1.3 1왕복 + 요청 1왕복 + 서버
        rows.append(dict(rtt=rtt, new=3 * rtt + SERVER_MS, reuse=rtt + SERVER_MS))
    return rows


def check():
    for case, row in LAB.items():
        if isinstance(row, dict) and 'duration' in row:  # duration = sending + waiting + receiving
            assert abs(row['duration']['avg'] - sum(row[k]['avg'] for k in ('sending', 'waiting', 'receiving'))) < .2, case
    for case in ('tls_direct', 'tls_delay_new'):  # blocked는 connecting과 tls_handshaking을 품는다(연결을 얻을 때까지)
        r = LAB[case]
        assert abs(r['blocked']['avg'] - r['connecting']['avg'] - r['tls_handshaking']['avg']) < 1, case
    assert [round(lab(c, 'blocked')) for c in ('tls_direct', 'tls_delay_new', 'tls_delay_reuse')] == [7, 316, 3]
    assert [round(lab(c, 'duration')) for c in ('tls_direct', 'tls_delay_new', 'tls_delay_reuse')] == [55, 54, 54]  # 해설 '54ms 안팎'
    assert (round(lab('tls_direct', 'connecting'), 1), round(lab('tls_direct', 'tls_handshaking'), 1)) == (.8, 6.2)
    assert [round(lab('upload', k)) for k in ('sending', 'waiting', 'duration')] == [1190, 716, 1907]
    assert round(lab('upload', 'sending') + lab('upload', 'waiting')) == 1907  # 해설 '1,907ms, 그중 716ms'
    assert 8 * 1024 / 4096 == 2  # 8MB ÷ 4,096KB/s ≈ 2초
    assert [round(lab('server_slow', k)) for k in ('waiting', 'server_time')] == [503, 502]
    assert [round(lab('device_delay', k)) for k in ('waiting', 'server_time')] == [504, 52]
    assert round(lab('device_delay', 'waiting') - lab('device_delay', 'server_time')) == 452
    assert J_DURATION - SERVER_MS == RTT + DEVICE_MS + 2 + 8 == 100  # k6 duration과 APM의 차이
    assert (J_DURATION, sum(v for n, v in JOURNEY if n in ('connecting', 'tls_handshaking'))) == (220, 90)
    assert [(r['new'], r['reuse']) for r in rtt_rows()] == [(123, 121), (210, 150), (570, 270)]


if __name__ == '__main__':
    check()
    write_data('loadgen1', {
        'journey': {'rtt': RTT, 'device': DEVICE_MS, 'server': SERVER_MS, 'phases': [[n, v] for n, v in JOURNEY], 'duration': J_DURATION},
        'rtt': {'server': SERVER_MS, 'rows': rtt_rows()},
    })
