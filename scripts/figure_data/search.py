#!/usr/bin/env python3
"""상품 검색 글(image-and-text-search) 앞쪽 그림(embedding, flow, dot)에 쓰는 예시 데이터를 계산한다: python3 scripts/figure_data/search.py

그림 속 벡터와 유사도는 모두 아래 예시 값과 난수(고정 시드)로 계산하며, 실제 모델의 출력이 아니다.
본문에 적은 숫자와 맞는지는 check()의 assert로 확인한다. 결과: assets/figures/search-data.js
"""
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import write_data


def unit(v):
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


# ---- embedding: 사진 세 장(운동화 A, 같은 운동화의 다른 각도, 신발끈)의 6차원 예시 벡터
BASE = [.62, -.18, .41, .05, -.47, .44]
EMB = [unit(BASE),
       unit([b + d for b, d in zip(BASE, (.04, .06, -.05, .03, .02, -.04))]),
       unit([.35, .3, .2, -.45, -.1, .7])]
NEAR, FAR = dot(EMB[0], EMB[1]), dot(EMB[0], EMB[2])

# ---- flow: 상품 사진 8장의 벡터(시드 7)와, 상품 하나와 비슷하게 만든 검색 사진 2장
_rng = random.Random(7)
FLOW_VECS = [unit([_rng.gauss(0, 1) for _ in range(6)]) for _ in range(8)]
FLOW_QUERIES = []
for _source in (1, 4):  # 검색 사진은 상품 하나와 비슷하게 만든다
    _v = unit([x + _rng.gauss(0, .2) for x in FLOW_VECS[_source]])
    _sims = [dot(_v, row) for row in FLOW_VECS]
    _top = sorted(range(8), key=lambda i: -_sims[i])[:3]
    FLOW_QUERIES.append(dict(source=_source, v=_v, sims=_sims, top=_top))

# ---- dot: 같은 자리끼리 곱해서 더하기 (벡터 길이가 1인 6차원 예시)
Q = [.52, -.31, .44, .18, -.47, .42]
P = [.48, -.22, .51, .05, -.53, .41]
PRODUCTS = [a * b for a, b in zip(Q, P)]
TOTAL = sum(PRODUCTS)


def check():
    assert f'{NEAR:.2f}' == '0.99' and f'{FAR:.2f}' == '0.59', (NEAR, FAR)  # 본문: 다른 각도 0.99, 신발끈 0.59
    for q in FLOW_QUERIES:
        assert q['top'][0] == q['source']  # 검색 사진과 비슷하게 만든 상품이 1위
    assert [f'{x:.2f}' for x in PRODUCTS] == ['0.25', '0.07', '0.22', '0.01', '0.25', '0.17']  # 본문의 여섯 곱
    assert f'{TOTAL:.2f}' == '0.97'
    assert f'{sum(round(x, 2) for x in PRODUCTS):.2f}' == f'{TOTAL:.2f}'  # 보이는 곱을 더한 값과 합이 같다
    for k in range(1, 7):  # 합 칸에 차례로 보이는 누적값도 보이는 곱을 더한 값과 같다
        assert f'{sum(PRODUCTS[:k]):.2f}' == f'{sum(round(x, 2) for x in PRODUCTS[:k]):.2f}', k


if __name__ == '__main__':
    check()
    r = lambda v: [round(x, 6) for x in v]
    write_data('search', {
        'embedding': {'vectors': [r(v) for v in EMB], 'near': round(NEAR, 6), 'far': round(FAR, 6)},
        'flow': {'vectors': [r(v) for v in FLOW_VECS],
                 'queries': [dict(source=q['source'], v=r(q['v']), sims=r(q['sims']), top=q['top']) for q in FLOW_QUERIES]},
        'dot': {'q': Q, 'p': P, 'products': r(PRODUCTS), 'total': round(TOTAL, 6)},
    })
