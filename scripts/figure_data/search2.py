#!/usr/bin/env python3
"""상품 검색 글(image-and-text-search)의 뒤쪽 그림 중 계산이 필요한 것에 쓰는 예시 데이터를 만든다: python3 scripts/figure_data/search2.py

- cost: 공식 요금표 단가 x 예시 가정으로 한 달 비용을 계산한다(실제 사용량이 아님). 본문 숫자와 맞는지 check()의 assert로 확인한다.
- funnel: 설명용 점의 위치(고정 시드). 점의 개수와 위치에는 뜻이 없다.
- 순위·점수·Jaccard 숫자는 브라우저(assets/figures/search-common.js의 rank, jaccard)가 계산한다. 여기서는 같은 규칙을 복사해 본문 숫자와 맞는지만 확인한다.
결과: assets/figures/search2-data.js (그림 이름 cost, funnel이 data: 'search2'로 읽는다)
"""
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import write_data

# ---------------------------------------------------------------- 예시 상품과 순위 규칙 (assets/figures/search-common.js와 같다. 확인용)
PRODUCTS = [
    dict(id='laces', name='흰색 신발끈', similarity=.995, coverage=.5, type=0, image='laces'),
    dict(id='shoe', name='흰색 운동화 A', similarity=.98, coverage=1, type=1, image='shoe-a'),
    dict(id='copy', name='흰색 운동화 A 복제', similarity=.97, coverage=1, type=1, image='shoe-a'),
    dict(id='other', name='화이트 스니커즈 B', similarity=.92, coverage=1, type=1, image='shoe-b'),
]
for _p in PRODUCTS:
    _p['vector'] = (_p['similarity'], math.sqrt(1 - _p['similarity'] ** 2))


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def jaccard(a, b):
    left, right = set(a.split()), set(b.split())
    return len(left & right) / len(left | right)


def rank(correction, diversity, strength=.08):
    """본문의 점수식과 겹침 감점을 예시 데이터에 그대로 적용한다."""
    remaining = []
    for p in PRODUCTS:
        score = min(.99, .6 * p['similarity'] + .25 * p['coverage'] + .15 * p['type']) if correction else p['similarity']
        tier = (2 if p['coverage'] == 1 else 1 if p['type'] else 0) if correction else 0
        remaining.append(dict(p, score=score, tier=tier, penalty=0.0))
    selected = []
    while remaining:
        remaining.sort(key=lambda c: c['tier'] + c['score'] - c['penalty'], reverse=True)
        chosen = remaining.pop(0)
        selected.append(chosen)
        if diversity:
            for c in remaining:
                overlap = max(jaccard(chosen['name'], c['name']), float(chosen['image'] == c['image']))
                c['penalty'] = max(c['penalty'], strength * (.5 * dot(chosen['vector'], c['vector']) + .5 * overlap))
    return selected


# ---------------------------------------------------------------- 한 달 비용 (공식 단가 x 가정)
# 단가는 2026-10-02에 공식 요금표에서 확인했다.
#   Modal: https://modal.com/pricing  (T4 초당 $0.000164, 무료 크레딧은 반영하지 않음)
#   Voyage: https://docs.voyageai.com/docs/pricing  (voyage-multilingual-2 100만 토큰당 $0.12, 무료 토큰은 반영하지 않음)
#   Pinecone: https://www.pinecone.io/pricing/  (Standard 최소 월 $50)
T4_PER_SEC, VOYAGE_PER_TOKEN, PINECONE_STANDARD_MIN = 0.000164, 0.12 / 1_000_000, 50
PRODUCTS_N, SEARCHES_PER_MONTH = 10_000, 100_000  # 예시 쇼핑몰
QUERY_TOKENS, PRODUCT_TOKENS, GPU_SEC_PER_IMAGE = 20, 50, 1.0  # 넉넉히 잡은 가정, 측정값 아님
IMAGE_DIM, TEXT_DIM = 768, 1024  # SigLIP ViT-B-16, Voyage 기본 차원


def costs():
    gpu_month = T4_PER_SEC * 60 * 60 * 24 * 30
    first_images = PRODUCTS_N * GPU_SEC_PER_IMAGE * T4_PER_SEC
    first_text = PRODUCTS_N * PRODUCT_TOKENS * VOYAGE_PER_TOKEN
    query_month = SEARCHES_PER_MONTH * QUERY_TOKENS * VOYAGE_PER_TOKEN
    storage = PRODUCTS_N * ((4 * IMAGE_DIM + 8) + (4 * TEXT_DIM + 8))  # pgvector: 4 x 차원 + 8바이트
    break_even = gpu_month / (QUERY_TOKENS * VOYAGE_PER_TOKEN)
    return dict(gpu_month=gpu_month, pinecone=PINECONE_STANDARD_MIN, first_images=first_images, first_text=first_text,
                first=first_images + first_text, query_month=query_month, storage=storage, break_even=break_even,
                products=PRODUCTS_N, searches=SEARCHES_PER_MONTH)


# ---------------------------------------------------------------- funnel: 점의 위치 (고정 시드 3)
# 단계마다 (상자 높이, 점 개수). 점 위치는 상자 왼쪽 끝에서 오른쪽(x)과 상자 가운데에서 아래(y)로 잰 값이다.
FUNNEL_BOX_W = 208  # 상자 4개와 사이 간격 3개가 가장자리 40 안쪽에 들어가는 폭
FUNNEL_STAGES = [(300, 30), (220, 14), (160, 8), (110, 4)]


def funnel():
    random.seed(3)
    stages = []
    for h, dots in FUNNEL_STAGES:
        pts = []
        for _ in range(dots):
            x = random.uniform(24, FUNNEL_BOX_W - 24)  # x를 먼저, y를 나중에 뽑는다
            y = random.uniform(-h / 2 + 22, h / 2 - 22)
            pts.append([round(x, 2), round(y, 2)])
        stages.append(dict(h=h, dots=pts))
    # 후보에서 빠지는 빨간 점: 첫 상자 안에서 원래 자리(110, 105) 가까이에 두되, 다른 점과 겹치지 않고 오른쪽으로 가는 점선 길도 비는 자리를 고른다
    others = stages[0]['dots']
    best = max(((110 + dx, 105 + dy) for dx in range(-30, 31, 2) for dy in range(-30, 21, 2)),
               key=lambda r: min(min(math.hypot(r[0] - x, r[1] - y), abs(r[1] - y) if x > r[0] else 1e9) for x, y in others)
               - .15 * math.hypot(r[0] - 110, r[1] - 105))
    return dict(w=FUNNEL_BOX_W, stages=stages, red=list(best))


def check():
    plain, corrected, diverse = rank(False, False), rank(True, False), rank(True, True)
    # 본문에 적은 순서와 수치가 이 계산과 맞는지 확인한다.
    assert [p['id'] for p in plain] == ['laces', 'shoe', 'copy', 'other']
    assert [p['id'] for p in corrected] == ['shoe', 'copy', 'other', 'laces']
    assert [p['id'] for p in diverse] == ['shoe', 'other', 'copy', 'laces']
    assert {p['id']: round(p['score'], 3) for p in corrected} == {'shoe': .988, 'copy': .982, 'other': .952, 'laces': .722}
    numbers = {p['id']: (round(p['score'], 3), round(p['penalty'], 3)) for p in diverse}
    assert numbers['copy'] == (.982, .08) and numbers['other'] == (.952, .039) and numbers['laces'] == (.722, .05), numbers
    assert round(jaccard(PRODUCTS[1]['name'], PRODUCTS[2]['name']), 2) == .75 and jaccard(PRODUCTS[1]['name'], PRODUCTS[3]['name']) == 0
    k = costs()
    assert (round(k['gpu_month'], 2), round(k['first'], 2), round(k['query_month'], 2)) == (425.09, 1.7, .24), k
    assert (round(k['first_images'], 2), round(k['first_text'], 2)) == (1.64, .06)  # 본문 계산 목록
    assert 177e6 <= k['break_even'] < 178e6  # 본문: 한 달 약 1억 7,700만 번
    assert (round(k['storage'] / 1e6), 4 * IMAGE_DIM + 8, 4 * TEXT_DIM + 8) == (72, 3080, 4104)  # 본문: 약 72MB, 3,080바이트, 4,104바이트
    assert round(.6 * 1 + .25 * 1 + .15 * 1, 3) == 1 and [len(s['dots']) for s in funnel()['stages']] == [30, 14, 8, 4]


if __name__ == '__main__':
    check()
    k = costs()
    print({key: round(v, 4) for key, v in k.items()})
    write_data('search2', {'cost': {key: round(v, 6) for key, v in k.items()}, 'funnel': funnel()})
