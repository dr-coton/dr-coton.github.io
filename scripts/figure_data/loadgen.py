#!/usr/bin/env python3
"""부하발생기(k6)와 APM 응답시간 글(loadgen-vs-apm)의 그림에 쓰는 실험 데이터를 내보낸다: python3 scripts/figure_data/loadgen.py

- 실험 그림: scripts/k6_lab/results.json(내 컴퓨터에서 k6와 가짜 서버로 잰 값)을 그대로 쓴다. k6는 필요 없다.
- 모식도·계산 그림: 예시 값과 계산식으로 그린다. 그림 안에 '모식도', '계산'이라고 적는다.
결과: assets/figures/loadgen-data.js  (F.data.loadgen.lab[케이스][구간][통계])
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import write_data

ROOT = Path(__file__).resolve().parents[2]
LAB = json.load(open(ROOT / 'scripts' / 'k6_lab' / 'results.json'))

if __name__ == '__main__':
    write_data('loadgen', {'lab': LAB})
