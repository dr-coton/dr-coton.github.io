#!/usr/bin/env python3
"""검색 글(image-and-text-search)의 그림과 반복 GIF를 만든다: python3 scripts/search_figures.py

유사도, 후보, 점수, 감점, 거리 같은 숫자는 아래 예시 데이터로 계산한다.
결과: assets/search-notes/<이름>.gif (+ 움직임 줄이기용 <이름>-still.png), <이름>.png
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'search-notes'
W, SS = 1080, 2  # 출력 폭, 안티에일리어싱용 배율


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


BG, INK, TEXT, MUTED, FAINT = rgb('#ffffff'), rgb('#111827'), rgb('#374151'), rgb('#6b7280'), rgb('#9ca3af')
GRID, SOFT = rgb('#e5e7eb'), rgb('#f3f4f6')
BLUE, BLUE_BG, BLUE_FILL = rgb('#2f80ed'), rgb('#dbeafe'), rgb('#eef5fe')
GREEN, GREEN_BG = rgb('#16a34a'), rgb('#dcfce7')
ORANGE, ORANGE_BG = rgb('#d97706'), rgb('#fef3c7')
RED, RED_BG, RED_FILL = rgb('#e5484d'), rgb('#fee2e2'), rgb('#fdf0f0')
PURPLE, PURPLE_BG = rgb('#7c5cf0'), rgb('#ede9fe')
TEAL, AMBER = rgb('#0e9f9a'), rgb('#f59e0b')


def mix(a, b, t):
    """t=0이면 a, t=1이면 b."""
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def ease(t):
    t = min(1, max(0, t))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


_fonts = {}
_weights = {'regular': ('Regular', 0), 'medium': ('Medium', 2), 'semibold': ('SemiBold', 4), 'bold': ('Bold', 6)}


def font(size, weight):
    key = (size, weight)
    if key not in _fonts:
        if weight == 'mono':
            _fonts[key] = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', size, index=0)
        else:
            name, index = _weights[weight]
            found = sorted((Path.home() / 'Library' / 'Fonts').glob(f'*Pretendard-{name}.otf'))
            # ponytail: Pretendard가 없으면 시스템 고딕으로 그린다
            _fonts[key] = (ImageFont.truetype(str(found[0]), size) if found
                           else ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', size, index=index))
    return _fonts[key]


class Canvas:
    def __init__(self, h):
        self.h = h
        self.im = Image.new('RGB', (W * SS, h * SS), BG)
        self.d = ImageDraw.Draw(self.im)

    def rect(self, x, y, w, h, fill=None, outline=None, width=2, r=12):
        self.d.rounded_rectangle([x * SS, y * SS, (x + w) * SS, (y + h) * SS], r * SS,
                                 fill=fill, outline=outline, width=round(width * SS))

    def text(self, x, y, s, size, fill=TEXT, weight='regular', anchor='lm'):
        self.d.text((x * SS, y * SS), s, font=font(size * SS, weight), fill=fill, anchor=anchor)

    def tw(self, s, size, weight='regular'):
        return font(size * SS, weight).getlength(s) / SS

    def line(self, points, fill, width=2):
        self.d.line([(x * SS, y * SS) for x, y in points], fill=fill, width=round(width * SS), joint='curve')

    def dashed(self, a, b, fill, width=2, dash=8, gap=7):
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        pos = 0
        while pos < length:
            s, e = pos / length, min(1, (pos + dash) / length)
            self.line([(lerp(a[0], b[0], s), lerp(a[1], b[1], s)), (lerp(a[0], b[0], e), lerp(a[1], b[1], e))], fill, width)
            pos += dash + gap

    def circle(self, x, y, r, fill=None, outline=None, width=2):
        self.d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=fill, outline=outline, width=round(width * SS))

    def poly(self, points, fill=None, outline=None):
        self.d.polygon([(x * SS, y * SS) for x, y in points], fill=fill, outline=outline)

    def done(self):
        return self.im.resize((W, self.h), Image.LANCZOS)


# ---------------------------------------------------------------- 공통 요소
def header(c, title, meta=None, y=46):
    c.text(40, y, title, 34, INK, 'bold')
    if meta:
        c.text(1040, y, meta, 26, FAINT, 'regular', 'rm')


def pill(c, x, y, s, fg, bg, size=26, anchor='l'):
    w, h = c.tw(s, size, 'bold') + 32, round(size * 1.75)
    x = x - w / 2 if anchor == 'm' else x - w if anchor == 'r' else x
    c.rect(x, y - h / 2, w, h, fill=bg, r=h / 2)
    c.text(x + w / 2, y, s, size, fg, 'bold', 'mm')
    return w


def caption(c, s, fg, y):
    c.text(W / 2, y, s, 28, fg, 'semibold', 'mm')


def card(c, x, y, w, h, outline=GRID, fill=BG, width=2, lifted=False):
    if lifted:  # 움직이는 카드는 살짝 떠 보이게 한다
        c.rect(x + 2, y + 7, w, h, fill=rgb('#e9ebef'), r=12)
    c.rect(x, y, w, h, fill=fill, outline=outline, width=width, r=12)


def check(c, x, y, color, s=14):
    c.line([(x - s, y), (x - s * .3, y + s * .7), (x + s, y - s * .75)], color, 4)


def cross(c, x, y, color, s=11):
    c.line([(x - s, y - s), (x + s, y + s)], color, 4)
    c.line([(x - s, y + s), (x + s, y - s)], color, 4)


def arrow(c, a, b, color, width=3, head=12):
    angle = math.atan2(b[1] - a[1], b[0] - a[0])
    back = (b[0] - math.cos(angle) * head, b[1] - math.sin(angle) * head)
    c.line([a, back], color, width)
    side = (math.cos(angle + math.pi / 2) * head * .6, math.sin(angle + math.pi / 2) * head * .6)
    c.poly([b, (back[0] + side[0], back[1] + side[1]), (back[0] - side[0], back[1] - side[1])], fill=color)


def tile(c, x, y, size, color, kind, fade=0):
    """상품 사진을 대신하는 작은 그림."""
    color = mix(color, BG, fade)
    c.rect(x, y, size, size, fill=mix(color, BG, .88), r=size * .2)
    cx, cy, s = x + size / 2, y + size / 2, size * .78
    if kind in ('shoe', 'shoe-flip'):
        sign = -1 if kind == 'shoe-flip' else 1
        upper = [(-.42, .12), (-.42, -.1), (-.3, -.2), (-.12, -.18), (.02, -.04), (.3, .02), (.44, .1), (.44, .16), (-.42, .16)]
        c.poly([(cx + sign * px * s, cy + py * s) for px, py in upper], fill=color)
        c.rect(cx - .45 * s, cy + .14 * s, .91 * s, .1 * s, fill=mix(color, INK, .35), r=.04 * s)
        for i in range(3):
            lx = cx + sign * (-.16 * s + i * .1 * s)
            c.line([(lx, cy - .1 * s + i * .04 * s), (lx + sign * .06 * s, cy - .04 * s + i * .04 * s)], mix(color, BG, .7), max(1.5, size * .03))
    elif kind == 'laces':
        w = max(2, size * .06)
        c.circle(cx - .17 * s, cy - .08 * s, .15 * s, outline=color, width=w)
        c.circle(cx + .17 * s, cy - .08 * s, .15 * s, outline=color, width=w)
        c.line([(cx, cy - .04 * s), (cx - .3 * s, cy + .32 * s)], color, w)
        c.line([(cx, cy - .04 * s), (cx + .3 * s, cy + .32 * s)], color, w)
        c.circle(cx, cy - .05 * s, .06 * s, fill=color)
    elif kind == 'mug':
        c.rect(cx - .28 * s, cy - .26 * s, .44 * s, .52 * s, fill=color, r=.06 * s)
        c.circle(cx + .2 * s, cy, .14 * s, outline=color, width=max(2, size * .06))
    elif kind == 'cap':
        c.d.pieslice([(cx - .3 * s) * SS, (cy - .26 * s) * SS, (cx + .3 * s) * SS, (cy + .34 * s) * SS], 180, 360, fill=color)
        c.rect(cx - .02 * s, cy + .02 * s, .44 * s, .08 * s, fill=color, r=.04 * s)
    else:
        c.rect(cx - .4 * s, cy - .32 * s, .8 * s, .64 * s, outline=color, width=max(2, size * .05), r=.08 * s)
        c.circle(cx + .18 * s, cy - .12 * s, .08 * s, fill=color)
        c.poly([(cx - .32 * s, cy + .24 * s), (cx - .1 * s, cy - .04 * s), (cx + .08 * s, cy + .14 * s),
                (cx + .18 * s, cy + .04 * s), (cx + .32 * s, cy + .24 * s)], fill=color)


def palette_for(images):
    mosaic = Image.new('RGB', (W, sum(im.height for im in images)))
    y = 0
    for im in images:
        mosaic.paste(im, (0, y))
        y += im.height
    palette = mosaic.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    values = palette.getpalette()[:255 * 3]
    nearest = min(range(255), key=lambda i: sum((values[i * 3 + k] - BG[k]) ** 2 for k in range(3)))
    values[nearest * 3:nearest * 3 + 3] = BG  # 배경을 정확히 흰색으로 맞춘다
    palette.putpalette(values)
    return palette


def save_gif(name, frames, still):
    """frames: [(이미지, ms)]. 모든 프레임이 같은 팔레트를 써서 색이 깜박이지 않는다."""
    OUT.mkdir(parents=True, exist_ok=True)
    palette = palette_for([im for im, _ in frames[::max(1, len(frames) // 16)]] + [still])
    quantized = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im, _ in frames]
    quantized[0].save(OUT / f'{name}.gif', save_all=True, append_images=quantized[1:], duration=[ms for _, ms in frames], loop=0)
    still.quantize(palette=palette, dither=Image.Dither.NONE).save(OUT / f'{name}-still.png', optimize=True)
    print(f'{name}.gif  {len(frames)} frames  {sum(ms for _, ms in frames) / 1000:.1f}s  {(OUT / f"{name}.gif").stat().st_size // 1024} KB')


def save_png(name, im):
    OUT.mkdir(parents=True, exist_ok=True)
    im.quantize(palette=palette_for([im]), dither=Image.Dither.NONE).save(OUT / f'{name}.png', optimize=True)
    print(f'{name}.png  {(OUT / f"{name}.png").stat().st_size // 1024} KB')


def unit(v):
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v]


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


# ---------------------------------------------------------------- 글 전체에서 쓰는 예시 상품
PRODUCTS = [
    dict(id='laces', name='흰색 신발끈', short='신발끈', similarity=.995, coverage=.5, type=0, image='laces', color=AMBER, kind='laces'),
    dict(id='shoe', name='흰색 운동화 A', short='운동화 A', similarity=.98, coverage=1, type=1, image='shoe-a', color=BLUE, kind='shoe'),
    dict(id='copy', name='흰색 운동화 A 복제', short='A 복제', similarity=.97, coverage=1, type=1, image='shoe-a', color=BLUE, kind='shoe'),
    dict(id='other', name='화이트 스니커즈 B', short='스니커즈 B', similarity=.92, coverage=1, type=1, image='shoe-b', color=TEAL, kind='shoe'),
]
for p in PRODUCTS:
    p['vector'] = (p['similarity'], math.sqrt(1 - p['similarity'] ** 2))
BY_ID = {p['id']: p for p in PRODUCTS}


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


# ---------------------------------------------------------------- 1. 키워드 검색의 한계
def keyword_gif():
    H = 640
    words = ['흰색', '운동화']
    order = [BY_ID[i] for i in ('shoe', 'copy', 'other', 'laces')]
    ys = [150 + i * 92 for i in range(4)]
    cols = [700, 830]

    def draw(step, result_t, photo_t):
        c = Canvas(H)
        header(c, '키워드 검색', '검색어: 흰색 운동화 · 두 단어가 모두 들어간 상품')
        for x, w in zip(cols, words):
            c.text(x, 116, w, 26, FAINT, 'semibold', 'mm')
        c.text(1040, 116, '결과', 26, FAINT, 'semibold', 'rm')
        for r, p in enumerate(order):
            y = ys[r]
            card(c, 40, y, 1000, 76)
            tile(c, 56, y + 14, 48, p['color'], p['kind'])
            for w_i, w in enumerate(words):
                if step > w_i * 4 + r and w in p['name']:
                    i = p['name'].index(w)
                    x = 124 + c.tw(p['name'][:i], 32, 'semibold')
                    c.rect(x - 4, y + 18, c.tw(w, 32, 'semibold') + 8, 40, fill=BLUE_BG, r=6)
            c.text(124, y + 38, p['name'], 32, INK, 'semibold')
            for w_i, w in enumerate(words):
                if step > w_i * 4 + r:
                    (check if w in p['name'] else cross)(c, cols[w_i], y + 38, GREEN if w in p['name'] else FAINT)
            if result_t:
                found = all(w in p['name'] for w in words)
                fg, bg = (GREEN, GREEN_BG) if found else (RED, RED_BG)
                pill(c, 1024, y + 38, '찾음' if found else '못 찾음', mix(fg, BG, 1 - result_t), mix(bg, BG, 1 - result_t), 24, 'r')
        if photo_t:
            y = 530
            c.rect(40, y, 1000, 76, outline=mix(GRID, BG, 1 - photo_t), width=2, r=12)
            c.dashed((40, y), (1040, y), BG, 3)
            tile(c, 56, y + 14, 48, MUTED, 'photo', fade=1 - photo_t)
            c.text(124, y + 38, '사진을 올려서 찾기', 32, mix(INK, BG, 1 - photo_t), 'semibold')
            pill(c, 1024, y + 38, '검색 불가', mix(RED, BG, 1 - photo_t), mix(RED_BG, BG, 1 - photo_t), 24, 'r')
        return c.done()

    frames = [(draw(0, 0, 0), 900)]
    for step in range(1, 9):
        frames.append((draw(step, 0, 0), 260))
    for f in range(1, 5):
        frames.append((draw(8, f / 4, 0), 70))
    frames.append((draw(8, 1, 0), 1500))
    for f in range(1, 5):
        frames.append((draw(8, 1, f / 4), 70))
    still = draw(8, 1, 1)
    frames.append((still, 2400))
    save_gif('keyword', frames, still)


# ---------------------------------------------------------------- 2. 흔한 구성과 우리 구성
def architecture_png():
    H = 640
    c = Canvas(H)
    sides = [
        (30, '흔히 떠올리는 구성', TEXT, SOFT, [
            ('검색 서버', '요청 받기', None),
            ('GPU 서버', '이미지 모델 실행', ('항상 켜 둠', MUTED, SOFT)),
            ('벡터 DB', '벡터 저장과 비교', ('항상 켜 둠', MUTED, SOFT)),
            ('검색 엔진', '단어 검색과 순위', ('항상 켜 둠', MUTED, SOFT)),
            ('상품 DB', '상품 정보', None),
        ], '켜 두고 맞춰야 할 서버 3대 추가', RED),
        (560, '직접 만든 구성', BLUE, BLUE_BG, [
            ('검색 서버', 'CPU로 사진 한 장 처리', None),
            ('PostgreSQL', '상품 + 벡터 + 단어 검색', ('pgvector', BLUE, BLUE_BG)),
            ('Voyage API', '검색어 → 벡터', ('쓴 만큼 과금', ORANGE, ORANGE_BG)),
            ('Modal GPU', '상품 사진 대량 등록', ('등록할 때', PURPLE, PURPLE_BG)),
        ], '상품 DB 하나에 벡터까지', GREEN),
    ]
    for x0, title, fg, bg, boxes, note, note_color in sides:
        pill(c, x0, 50, title, fg, bg, 26)
        for i, (name, sub, tag) in enumerate(boxes):
            y = 100 + i * 92
            card(c, x0, y, 490, 78)
            c.text(x0 + 24, y + 27, name, 28, INK, 'bold')
            c.text(x0 + 24, y + 58, sub, 24, MUTED)
            if tag:
                pill(c, x0 + 474, y + 39, tag[0], tag[1], tag[2], 22, 'r')
        c.text(x0 + 245, 600, note, 28, note_color, 'semibold', 'mm')
    save_png('architecture', c.done())


# ---------------------------------------------------------------- 3. 사진을 숫자 목록으로
def embedding_gif():
    H = 640
    photos = [('운동화 A', BLUE, 'shoe'), ('운동화 A (다른 각도)', BLUE, 'shoe-flip'), ('신발끈', AMBER, 'laces')]
    base = [.62, -.18, .41, .05, -.47, .44]
    vectors = [unit(base), unit([b + d for b, d in zip(base, (.04, .06, -.05, .03, .02, -.04))]),
               unit([.35, .3, .2, -.45, -.1, .7])]
    near, far = dot(vectors[0], vectors[1]), dot(vectors[0], vectors[2])
    row_y = [170, 320, 470]
    box = (330, 250, 180, 140)

    def cell_color(v):
        return mix(BG, BLUE, v * .85) if v >= 0 else mix(BG, ORANGE, -v * .85)

    def draw(flying, filled, compare):
        c = Canvas(H)
        header(c, '사진 → 숫자 목록', '예시 값 · 실제로는 숫자가 수백 개')
        card(c, *box)
        c.text(box[0] + 90, box[1] + 56, '이미지', 28, INK, 'bold', 'mm')
        c.text(box[0] + 90, box[1] + 92, '모델', 28, INK, 'bold', 'mm')
        for i, (label, color, kind) in enumerate(photos):
            y = row_y[i]
            tile(c, 90, y - 50, 100, color, kind)
            c.text(140, y + 70, label, 24, MUTED, 'medium', 'mm')
            for k in range(filled[i]):
                v = vectors[i][k]
                x = 570 + k * 78
                c.rect(x, y - 30, 70, 60, fill=cell_color(v), r=8)
                c.text(x + 35, y, f'{v:.2f}', 24, INK, 'semibold', 'mm')
        for i, t in flying:
            k = ease(t)
            label, color, kind = photos[i]
            tile(c, lerp(90, box[0] + 70, k), lerp(row_y[i] - 50, box[1] + 50, k), lerp(100, 40, k), color, kind, fade=max(0, t * 2 - 1))
        if compare >= 1:
            for i, color in ((0, GREEN), (1, GREEN)) if compare == 1 else ((0, RED), (2, RED)):
                c.rect(562, row_y[i] - 38, 476, 76, outline=color, width=3, r=12)
            if compare == 1:
                pill(c, W / 2, 600, f'운동화 A ↔ 다른 각도   유사도 {near:.2f}', GREEN, GREEN_BG, 26, 'm')
            else:
                pill(c, W / 2, 600, f'운동화 A ↔ 신발끈   유사도 {far:.2f}', RED, RED_BG, 26, 'm')
        return c.done()

    frames, filled = [], [0, 0, 0]
    frames.append((draw([], filled, 0), 700))
    for i in range(3):
        for f in range(1, 8):
            frames.append((draw([(i, f / 7)], filled, 0), 70))
        for k in range(1, 7):
            filled = filled[:i] + [k] + filled[i + 1:]
            frames.append((draw([], filled, 0), 70))
        frames.append((draw([], filled, 0), 300))
    frames.append((draw([], filled, 1), 2000))
    still = draw([], filled, 2)
    frames.append((still, 2200))
    save_gif('embedding', frames, still)
    return near, far


# ---------------------------------------------------------------- 4. 등록과 검색의 흐름
def flow_gif():
    H = 700
    random.seed(7)
    colors = [AMBER, BLUE, TEAL, PURPLE, rgb('#e05d9a'), rgb('#5b8def'), rgb('#8b9a3c'), rgb('#9c6b4e')]
    vectors = [unit([random.gauss(0, 1) for _ in range(6)]) for _ in colors]
    queries = []
    for source in (1, 4):  # 검색 사진은 상품 하나와 비슷하게 만든다
        v = unit([x + random.gauss(0, .2) for x in vectors[source]])
        sims = [dot(v, row) for row in vectors]
        top = sorted(range(8), key=lambda i: -sims[i])[:3]
        assert top[0] == source
        queries.append((source, v, sims, top))

    grid = [(40 + (i % 4) * 76, 170 + (i // 4) * 76) for i in range(8)]
    box_top, box_bottom = (380, 160, 200, 120), (380, 490, 200, 120)
    table_x, row_y = 660, [150 + i * 62 for i in range(8)]

    def strip(c, x, y, v, fade=0, cell=30):
        for k, value in enumerate(v):
            c.rect(x + k * (cell + 4), y, cell, 30, fill=mix(mix(rgb('#eaf2fd'), BLUE, (value + 1) / 2 * .9), BG, fade), r=5)

    def base(c, filled, top_dim, query_no, gpu_on, cpu_on):
        d_top, d_bottom = (.6, 0) if top_dim else (0, .6)
        pill(c, 40, 56, '① 상품 등록', mix(PURPLE, BG, d_top), mix(PURPLE_BG, BG, d_top))
        c.text(40, 116, '사진 전체를 한 번', 26, mix(MUTED, BG, d_top))
        pill(c, 40, 386, '② 검색 요청', mix(BLUE, BG, d_bottom), mix(BLUE_BG, BG, d_bottom))
        c.text(40, 446, '사진 한 장을 검색마다', 26, mix(MUTED, BG, d_bottom))
        if query_no:
            c.text(236, 386, f'#{query_no}', 28, FAINT, 'semibold', 'lm')
        for i, (x, y) in enumerate(grid):
            tile(c, x, y, 64, colors[i], 'photo', fade=d_top)
        for (x, y, w, h), label, on, d in ((box_top, 'GPU', gpu_on, d_top), (box_bottom, 'CPU', cpu_on, d_bottom)):
            c.rect(x, y, w, h, fill=BG, outline=mix(BLUE if on else GRID, BG, d), width=3 if on else 2, r=12)
            c.text(x + w / 2, y + 42, '이미지 모델', 28, mix(INK, BG, d), 'bold', 'mm')
            pill(c, x + w / 2, y + 86, label, mix(TEXT, BG, d), mix(SOFT, BG, d), 22, 'm')
        card(c, table_x, 60, 400, 600)
        c.text(table_x + 24, 104, 'products', 28, TEXT, 'mono')
        for i, y in enumerate(row_y):
            tile(c, table_x + 18, y, 44, colors[i], 'photo')
            if i in filled:
                strip(c, table_x + 76, y + 7, vectors[i])
            else:
                c.rect(table_x + 76, y + 7, 200, 30, outline=GRID, r=5)

    frames = []

    def add(c, ms=80):
        frames.append((c.done(), ms))

    # 상품 등록: 사진 여덟 장이 GPU를 거쳐 벡터가 되고 표에 저장된다.
    for f in range(30):
        c = Canvas(H)
        filled = {i for i in range(8) if f >= i * 2 + 15}
        busy = any(i * 2 + 6 <= f < i * 2 + 9 for i in range(8))
        base(c, filled, False, 0, busy, False)
        for i in range(8):
            t = (f - i * 2) / 7
            if 0 <= t < 1:
                x, y = grid[i]
                k = ease(t)
                tile(c, lerp(x, box_top[0] - 40, k), lerp(y, box_top[1] + 44, k), lerp(64, 34, k), colors[i], 'photo', fade=max(0, t * 2 - 1))
            t = (f - i * 2 - 7) / 8
            if 0 <= t < 1:
                k = ease(t)
                strip(c, lerp(box_top[0] + box_top[2] + 6, table_x + 76, k), lerp(box_top[1] + 45, row_y[i] + 7, k), vectors[i])
        add(c, 1000 if f == 29 else 80)

    # 검색 요청: 사진 한 장만 CPU를 거치고, 저장된 벡터와 비교한다.
    for n, (source, v, sims, top) in enumerate(queries, 1):
        for f in range(24):
            c = Canvas(H)
            base(c, set(range(8)), True, n, False, 3 <= f < 12)
            tx, ty = 40, 520
            if f < 3:
                tile(c, tx, ty, 64, colors[source], 'photo', fade=1 - f / 3)
            elif f < 9:
                t = (f - 3) / 6
                k = ease(t)
                tile(c, lerp(tx, box_bottom[0] - 40, k), lerp(ty, box_bottom[1] + 44, k), lerp(64, 34, k), colors[source], 'photo', fade=max(0, t * 2 - 1))
            qx, qy = box_bottom[0] - 4, 632
            if f >= 9:
                strip(c, qx, qy, v, fade=max(0, 1 - (f - 9) / 3), cell=29)
            if f >= 12:
                k = ease((f - 12) / 5)
                for i, y in enumerate(row_y):
                    c.line([(qx + 208, qy + 15), (lerp(qx + 208, table_x, k), lerp(qy + 15, y + 22, k))], GRID, 2)
            if f >= 17:
                fade = max(0, 1 - (f - 17) / 3)
                for i, y in enumerate(row_y):
                    hit = i in top
                    if hit:
                        c.rect(table_x + 8, y - 6, 384, 56, outline=mix(BLUE, BG, fade), width=3, r=10)
                    c.text(table_x + 384, y + 22, f'{sims[i]:.2f}', 26, mix(BLUE if hit else FAINT, BG, fade), 'bold' if hit else 'medium', 'rm')
            add(c, {23: 1600}.get(f, 80))
    save_gif('flow', frames, frames[30 + 23][0])  # 첫 검색의 비교 결과


# ---------------------------------------------------------------- 5. 검색 1번에 모델이 처리하는 사진 수
def per_search_gif():
    H = 600
    x0, x1, y0, y1, top = 120, 1010, 150, 470, 100_000

    def px(n):
        return lerp(x0, x1, n / top)

    def py(n):
        return lerp(y1, y0, n / top)

    def draw(t):
        c = Canvas(H)
        header(c, '검색 1번에 모델이 처리하는 사진 수', '세로: 사진 수 · 가로: 상품 수')
        pill(c, 40, 104, '검색마다 전부 바꾸기', RED, RED_BG, 24)
        pill(c, 330, 104, '미리 바꿔 두기', BLUE, BLUE_BG, 24)
        for i in range(5):
            n = top * i / 4
            c.line([(x0, py(n)), (x1, py(n))], GRID, 2)
            c.text(x0 - 14, py(n), f'{n / 10000:g}만' if n else '0', 24, FAINT, 'medium', 'rm')
            c.text(px(n), y1 + 30, f'{n / 10000:g}만' if n else '0', 24, FAINT, 'medium', 'mm')
        n = top * t
        if n:
            c.poly([(x0, y1), (px(n), py(n)), (px(n), y1)], fill=RED_FILL)
            c.line([(x0, y1), (px(n), py(n))], RED, 4)
            c.circle(px(n), py(n), 8, fill=RED)
            c.text(px(n) - 16, py(n) - 6, f'{round(n):,}장', 28, RED, 'bold', 'rs')
            c.line([(x0, py(1)), (px(n), py(1))], BLUE, 5)
            c.circle(px(n), py(1), 8, fill=BLUE)
            c.text(px(n) - 4, py(1) - 22, '1장', 28, BLUE, 'bold', 'rs')
        caption(c, '미리 바꿔 두면 상품 수와 상관없이 검색 1번에 1장', GREEN, 565)
        return c.done()

    frames = [(draw(0), 500)]
    for f in range(1, 29):
        frames.append((draw(ease(f / 28)), 70))
    still = draw(1)
    frames.append((still, 2600))
    save_gif('per-search', frames, still)


# ---------------------------------------------------------------- 6. 내적: 같은 자리끼리 곱해서 더하기
def dot_gif():
    H = 560
    q = [.52, -.31, .44, .18, -.47, .42]
    p = [.48, -.22, .51, .05, -.53, .41]
    products = [a * b for a, b in zip(q, p)]
    total = sum(products)
    assert f'{sum(round(x, 2) for x in products):.2f}' == f'{total:.2f}'
    xs = [230 + k * 112 for k in range(6)]
    rows = [('검색 벡터', q, 150), ('상품 벡터', p, 236), ('곱한 값', None, 380)]

    def draw(done, active, final):
        c = Canvas(H)
        header(c, '같은 자리끼리 곱해서 더하기', '예시 벡터 · 숫자 6개')
        for label, values, y in rows:
            c.text(40, y, label, 26, MUTED, 'semibold')
            for k, x in enumerate(xs):
                if values is not None:
                    c.rect(x, y - 32, 100, 64, fill=SOFT, r=10)
                    c.text(x + 50, y, f'{values[k]:.2f}', 28, INK, 'semibold', 'mm')
                elif k < done:
                    c.rect(x, y - 32, 100, 64, fill=BLUE_FILL, outline=BLUE_BG, r=10)
                    c.text(x + 50, y, f'{products[k]:.2f}', 28, BLUE, 'bold', 'mm')
                else:
                    c.rect(x, y - 32, 100, 64, outline=GRID, r=10)
        if active is not None:
            x = xs[active]
            c.rect(x - 6, 110, 112, 168, outline=BLUE, width=3, r=14)
            c.text(x + 50, 312, '×', 30, BLUE, 'bold', 'mm')
        c.text(925, 316, '합', 26, MUTED, 'semibold', 'mm')
        c.rect(880, 348, 160, 64, fill=GREEN_BG if final else BG, outline=GREEN if final else GRID, width=3 if final else 2, r=10)
        c.text(960, 380, f'{sum(products[:done]):.2f}', 32, GREEN if final else INK, 'bold', 'mm')
        if final:
            caption(c, '벡터 길이가 1이면 이 합이 곧 코사인 유사도', GREEN, 500)
        return c.done()

    frames = [(draw(0, None, False), 800)]
    for k in range(6):
        frames.append((draw(k, k, False), 380))
        frames.append((draw(k + 1, k, False), 420))
    still = draw(6, None, True)
    frames.append((still, 2600))
    save_gif('dot', frames, still)
    return total


# ---------------------------------------------------------------- 7. 코사인 유사도
def cosine_gif():
    H = 600
    ox, oy, radius = 300, 520, 250
    points = [('P', 20, BLUE), ('Q', 80, PURPLE), ('R', 150, TEAL)]
    slot_y = [160, 270, 380]

    def draw(angle, rows):
        c = Canvas(H)
        header(c, '각도로 재는 유사도', '숫자 2개짜리 예시 벡터')
        c.d.arc([(ox - radius) * SS, (oy - radius) * SS, (ox + radius) * SS, (oy + radius) * SS], 180, 360, fill=GRID, width=2 * SS)
        c.line([(30, oy), (570, oy)], GRID, 2)
        for deg in (50, 115):  # 두 벡터 사이의 가운데: 여기서 순서가 바뀐다
            r = math.radians(deg)
            c.dashed((ox, oy), (ox + math.cos(r) * radius, oy - math.sin(r) * radius), GRID, 2)
            c.text(ox + math.cos(r) * (radius + 26), oy - math.sin(r) * (radius + 26), f'{deg}°', 22, FAINT, 'medium', 'mm')
        for name, deg, color in points:
            r = math.radians(deg)
            x, y = ox + math.cos(r) * radius, oy - math.sin(r) * radius
            c.line([(ox, oy), (x, y)], color, 4)
            c.circle(x, y, 9, fill=color)
            c.text(ox + math.cos(r) * (radius + 36), oy - math.sin(r) * (radius + 36), name, 34, color, 'bold', 'mm')
        r = math.radians(angle)
        tip = (ox + math.cos(r) * 190, oy - math.sin(r) * 190)
        c.line([(ox, oy), tip], INK, 7)
        c.circle(*tip, 10, fill=INK)
        c.text(ox + math.cos(r) * 150 + math.sin(r) * 34, oy - math.sin(r) * 150 + math.cos(r) * 34, '검색', 28, INK, 'bold', 'mm')
        c.circle(ox, oy, 6, fill=INK)

        c.text(640, 106, '유사도 순서', 26, FAINT, 'semibold')
        order = sorted(points, key=lambda p: -math.cos(math.radians(angle - p[1])))
        for name, deg, color in points:
            y = rows[name]
            sim = math.cos(math.radians(angle - deg))
            card(c, 630, y - 44, 410, 88)
            c.text(664, y, str([p[0] for p in order].index(name) + 1), 30, FAINT, 'bold', 'mm')
            c.circle(704, y, 11, fill=color)
            c.text(728, y, name, 30, INK, 'bold')
            c.rect(778, y - 9, 140, 18, fill=SOFT, r=9)
            c.rect(778, y - 9, max(4, 140 * max(0, sim)), 18, fill=color, r=9)
            c.text(1024, y, f'{sim:.3f}', 28, INK, 'semibold', 'rm')
        c.text(40, 570, '검색 방향', 26, FAINT, 'semibold')
        c.text(160, 570, f'{round(angle)}°', 28, INK, 'bold')
        return c.done()

    n = 76
    angle_at = lambda f: 90 - 75 * math.cos(2 * math.pi * f / n)
    rank_rows = lambda a: {p[0]: slot_y[i] for i, p in enumerate(sorted(points, key=lambda p: -math.cos(math.radians(a - p[1]))))}
    frames = [(draw(angle_at(f), rank_rows(angle_at(f))), 90) for f in range(n)]
    save_gif('cosine', frames, draw(35, rank_rows(35)))


# ---------------------------------------------------------------- 8. ORDER BY 거리 LIMIT 3
def pgvector_gif():
    H = 940
    items = [('머그컵 E', FAINT, 'mug', .81), ('운동화 A', BLUE, 'shoe', .03), ('샌들 C', FAINT, 'shoe', .34),
             ('신발끈', AMBER, 'laces', .21), ('A 복제', BLUE, 'shoe', .03), ('모자 F', FAINT, 'cap', .62),
             ('스니커즈 B', TEAL, 'shoe', .12), ('슬리퍼 D', FAINT, 'shoe', .38)]
    slot = [150 + i * 84 for i in range(8)]
    start = {name: slot[i] for i, (name, *_ ) in enumerate(items)}
    end = {name: slot[i] for i, (name, *_ ) in enumerate(sorted(items, key=lambda it: it[3]))}

    def draw(ys, shown, limit_t, front=None, fade_all=0):
        c = Canvas(H)
        header(c, '가까운 순서로 3개 가져오기', 'ORDER BY 거리 LIMIT 3')
        c.text(124, 116, '상품', 24, FAINT, 'semibold')
        c.text(820, 116, '거리', 24, FAINT, 'semibold', 'rm')
        c.text(1010, 116, '유사도', 24, FAINT, 'semibold', 'rm')
        top3 = sorted(items, key=lambda it: it[3])[:3]
        for name, color, kind, dist in sorted(items, key=lambda it: it[0] == front):
            hit = limit_t and (name, color, kind, dist) in top3
            y = ys[name] + (0 if hit or not limit_t else 56 * ease(limit_t))  # 잘린 아래쪽을 띄운다
            fade = max(.55 * limit_t if limit_t and not hit else 0, fade_all)
            card(c, 40, y, 1000, 72, outline=mix(BLUE, GRID, 1 - limit_t) if hit else GRID, fill=mix(BG, BLUE_FILL, limit_t) if hit else BG, width=3 if hit else 2)
            tile(c, 56, y + 12, 48, color, kind, fade=fade)
            c.text(124, y + 36, name, 30, mix(INK, BG, fade), 'semibold')
            if name in shown:
                c.text(820, y + 36, f'{dist:.2f}', 30, mix(INK, BG, fade), 'bold', 'rm')
                c.text(1010, y + 36, f'{1 - dist:.2f}', 30, mix(MUTED, BG, fade), 'medium', 'rm')
            else:
                c.text(820, y + 36, '—', 30, GRID, 'medium', 'rm')
        if limit_t:
            cut = slot[3] + 22
            c.dashed((40, cut), (1040, cut), mix(BLUE, BG, 1 - limit_t), 2)
            pill(c, W / 2, cut, 'LIMIT 3: 이 3개만 다음 단계로', mix(BLUE, BG, 1 - limit_t), mix(BLUE_BG, BG, 1 - limit_t), 24, 'm')
        caption(c, '거리가 작을수록 가까운 상품 · 같은 사진인 A와 A 복제는 같은 거리', MUTED, 900)
        return c.done()

    frames = [(draw(start, set(), 0), 700)]
    shown = set()
    for name, *_ in items:
        shown = shown | {name}
        frames.append((draw(start, shown, 0), 150))
    frames.append((draw(start, shown, 0), 600))
    for f in (1, 2, 3):  # 정렬: 흐려졌다가 거리 순서로 다시 나타난다
        frames.append((draw(start, shown, 0, fade_all=f / 3 * .85), 70))
    for f in (3, 2, 1, 0):
        frames.append((draw(end, shown, 0, fade_all=f / 3 * .85), 70))
    frames.append((draw(end, shown, 0), 700))
    for f in range(1, 5):
        frames.append((draw(end, shown, f / 4), 70))
    still = draw(end, shown, 1)
    frames.append((still, 2600))
    save_gif('pgvector', frames, still)


# ---------------------------------------------------------------- 9. 검색어 벡터 근처 (개념도)
def text_space_png():
    H = 620
    c = Canvas(H)
    header(c, '검색어 벡터 근처의 상품', '개념도')
    qx, qy = 380, 340
    c.circle(qx, qy, 185, fill=BLUE_FILL)
    c.d.ellipse([(qx - 185) * SS, (qy - 185) * SS, (qx + 185) * SS, (qy + 185) * SS], outline=BLUE_BG, width=2 * SS)
    near = [('흰색 운동화 A', BLUE, 470, 290), ('흰색 운동화 A 복제', BLUE, 455, 395),
            ('화이트 스니커즈 B', TEAL, 270, 250), ('흰색 신발끈', AMBER, 300, 440)]
    far = [('검정 구두', FAINT, 760, 200), ('흰색 머그컵', FAINT, 780, 470), ('가죽 지갑', FAINT, 900, 330)]
    for name, color, x, y in near + far:
        c.circle(x, y, 10, fill=color)
        c.text(x + 18, y, name, 26, TEXT if color != FAINT else MUTED, 'semibold')
    c.poly([(qx, qy - 16), (qx + 16, qy), (qx, qy + 16), (qx - 16, qy)], fill=INK)
    c.text(qx - 26, qy, '흰색 운동화', 28, INK, 'bold', 'rm')
    pill(c, 120, 170, '표기가 달라도 가까이', GREEN, GREEN_BG, 24)
    c.line([(250, 190), (268, 236)], GREEN, 2)
    pill(c, 150, 520, '운동화가 아닌데도 가까이', ORANGE, ORANGE_BG, 24)
    c.line([(300, 500), (300, 456)], ORANGE, 2)
    pill(c, 720, 540, '‘흰색’이 같아도 멀리', MUTED, SOFT, 24)
    c.line([(790, 520), (782, 486)], FAINT, 2)
    save_png('text-space', c.done())


# ---------------------------------------------------------------- 10. 두 가지 방법으로 후보 모으기
def candidates_gif():
    H = 880
    cols = (30, 375, 720)
    product_y = {p['id']: 170 + i * 112 for i, p in enumerate(PRODUCTS)}
    vector_ids = [p['id'] for p in sorted(PRODUCTS, key=lambda p: -p['similarity'])[:2]]
    lexical_ids = [p['id'] for p in PRODUCTS if p['coverage'] == 1]
    vector_y = {pid: 170 + i * 112 for i, pid in enumerate(vector_ids)}
    lexical_y = {pid: 470 + i * 112 for i, pid in enumerate(lexical_ids)}
    union_order = list(dict.fromkeys(vector_ids + lexical_ids))
    union_y = {pid: 170 + i * 112 for i, pid in enumerate(union_order)}
    source_color = {'벡터': BLUE, '단어': PURPLE, '양쪽': GREEN}

    def chip(c, x, y, p, detail, fade=0, outline=None, detail_color=MUTED, lifted=False):
        card(c, x, y, 330, 96, outline=mix(outline or GRID, BG, fade), width=3 if outline else 2, lifted=lifted and fade < .5)
        tile(c, x + 14, y + 18, 60, p['color'], p['kind'], fade=fade)
        c.text(x + 90, y + 34, p['short'], 30, mix(INK, BG, fade), 'bold')
        c.text(x + 90, y + 70, detail, 24, mix(source_color.get(detail, detail_color), BG, fade), 'semibold')

    def frame(status, status_color, moves, settled, b_missing=False, highlight=(), union_detail=None):
        c = Canvas(H)
        header(c, '검색어: 흰색 운동화', '유사도 · 단어 일치')
        c.text(cols[0], 128, '상품', 24, FAINT, 'semibold')
        pill(c, cols[1], 128, '벡터로 찾기 · 상위 2개', BLUE, BLUE_BG, 22)
        pill(c, cols[1], 432, '단어로 찾기 · 2/2 일치', PURPLE, PURPLE_BG, 22)
        pill(c, cols[2], 128, '합친 후보', GREEN, GREEN_BG, 22)
        for p in PRODUCTS:
            missing = b_missing and p['id'] == 'other'
            detail = '후보에 없음' if missing else f"{p['similarity']:.3f} · {round(p['coverage'] * 2)}/2"
            chip(c, cols[0], product_y[p['id']], p, detail, outline=RED if missing else BLUE if p['id'] in highlight else None, detail_color=RED if missing else MUTED)
        for kind, pid, fade in settled:
            p = BY_ID[pid]
            if kind == 'vector':
                chip(c, cols[1], vector_y[pid], p, f"유사도 {p['similarity']:.3f}", fade)
            elif kind == 'lexical':
                chip(c, cols[1], lexical_y[pid], p, f"단어 {round(p['coverage'] * 2)}/2", fade)
            else:
                chip(c, cols[2], union_y[pid], p, (union_detail or {}).get(pid, ''), fade)
        for pid, start, end, t, detail, fade in moves:
            k = ease(t)
            chip(c, lerp(start[0], end[0], k), lerp(start[1], end[1], k), BY_ID[pid], detail, fade, lifted=0 < t < 1)
        caption(c, status, status_color, 840)
        return c.done()

    frames = []
    s1 = ('① 벡터로 찾기: 유사도 상위 2개', BLUE)
    frames.append((frame(*s1, [], []), 1000))
    for f in range(13):
        moves = [(pid, (cols[0], product_y[pid]), (cols[1], vector_y[pid]), (f - i * 2) / 10, f"유사도 {BY_ID[pid]['similarity']:.3f}", 0)
                 for i, pid in enumerate(vector_ids) if f - i * 2 >= 0]
        frames.append((frame(*s1, moves, [], highlight=vector_ids), 70))
    vector_settled = [('vector', pid, 0) for pid in vector_ids]
    frames.append((frame(*s1, [], vector_settled, highlight=vector_ids), 600))

    s2 = ('② 벡터만 쓰면 스니커즈 B 누락', RED)
    detail_v = {pid: '벡터' for pid in vector_ids}
    for f in range(11):
        moves = [(pid, (cols[1], vector_y[pid]), (cols[2], union_y[pid]), f / 10, '벡터', 0) for pid in vector_ids]
        frames.append((frame(*s2, moves, vector_settled, b_missing=True), 70))
    union_v = [('union', pid, 0) for pid in vector_ids]
    frames.append((frame(*s2, [], vector_settled + union_v, b_missing=True, union_detail=detail_v), 1800))

    s3 = ('③ 단어로 찾기: 두 단어가 모두 맞는 상품', PURPLE)
    for f in range(15):
        moves = [(pid, (cols[0], product_y[pid]), (cols[1], lexical_y[pid]), (f - i * 2) / 10, f"단어 {round(BY_ID[pid]['coverage'] * 2)}/2", 0)
                 for i, pid in enumerate(lexical_ids) if f - i * 2 >= 0]
        frames.append((frame(*s3, moves, vector_settled + union_v, b_missing=f < 4, highlight=lexical_ids, union_detail=detail_v), 70))
    lexical_settled = [('lexical', pid, 0) for pid in lexical_ids]
    frames.append((frame(*s3, [], vector_settled + lexical_settled + union_v, highlight=lexical_ids, union_detail=detail_v), 600))

    s4 = ('④ 합치기: 양쪽에 있는 운동화 A는 하나로', GREEN)
    both = set(vector_ids) & set(lexical_ids)
    detail_all = {pid: '양쪽' if pid in both else '벡터' if pid in vector_ids else '단어' for pid in union_order}
    for f in range(11):
        moves = [(pid, (cols[1], lexical_y[pid]), (cols[2], union_y[pid]), f / 10, '단어', ease(f / 10) if pid in both else 0) for pid in lexical_ids]
        frames.append((frame(*s4, moves, vector_settled + lexical_settled + union_v, union_detail=detail_v), 70))
    final = vector_settled + lexical_settled + [('union', pid, 0) for pid in union_order]
    still = frame(*s4, [], final, union_detail=detail_all)
    frames.append((still, 2400))
    save_gif('candidates', frames, still)


# ---------------------------------------------------------------- 11. 짧은 단어
def word_boundary_png():
    H = 380
    c = Canvas(H)
    header(c, '짧은 단어 ‘아이’ 찾기', '단어 단위로 확인')
    rows = [('아이 운동화', '아이', GREEN, GREEN_BG, '단어로 일치'), ('아이스 쿨토시', '아이', RED, RED_BG, '글자만 겹침 · 제외')]
    for i, (name, word, fg, bg, label) in enumerate(rows):
        y = 110 + i * 120
        card(c, 40, y, 1000, 96)
        c.rect(70 - 4, y + 26, c.tw(word, 36, 'bold') + 8, 46, fill=bg, r=8)
        c.text(70, y + 49, name, 36, INK, 'bold')
        if i == 1:
            first = c.tw('아이스', 36, 'bold')
            c.line([(70, y + 82), (70 + first, y + 82)], FAINT, 2)
            c.text(70 + first + 12, y + 84, '한 단어', 20, FAINT, 'medium', 'lm')
        pill(c, 1020, y + 48, label, fg, bg, 24, 'r')
    save_png('word-boundary', c.done())


# ---------------------------------------------------------------- 12. 후보 → 순서 → 결과
def funnel_png():
    H = 480
    c = Canvas(H)
    header(c, '후보 모으기 → 순서 정하기')
    stages = [('전체 상품', '', 300, 30), ('후보', '벡터 + 단어', 220, 14), ('순서 정하기', '점수 · 단계 · 감점', 160, 8), ('검색 결과', '화면에 보이는 상품', 110, 4)]
    random.seed(3)
    x, mid = 40, 270
    for i, (name, sub, h, dots) in enumerate(stages):
        w = 220
        fill = BLUE_FILL if i else SOFT
        c.rect(x, mid - h / 2, w, h, fill=fill, outline=BLUE_BG if i else GRID, r=14)
        c.text(x + w / 2, mid - h / 2 - 24, name, 28, INK, 'bold', 'mm')
        if sub:
            c.text(x + w / 2, mid + h / 2 + 24, sub, 22, MUTED, 'medium', 'mm')
        for _ in range(dots):
            c.circle(x + random.uniform(24, w - 24), mid + random.uniform(-h / 2 + 22, h / 2 - 22), 7, fill=BLUE if i else FAINT)
        if i < 3:
            arrow(c, (x + w + 12, mid), (x + w + 40, mid), FAINT)
        x += w + 52
    rx, ry = 150, mid + 105
    c.circle(rx, ry, 10, fill=RED)
    c.dashed((rx + 14, ry), (300, ry), RED, 3)
    cross(c, 314, ry, RED, 10)
    pill(c, 40, 450, '후보에서 빠진 상품은 뒤에서 되살릴 방법 없음', RED, RED_BG, 24)
    save_png('funnel', c.done())


# ---------------------------------------------------------------- 13. 점수 막대
def score_gif():
    H = 640
    parts = [('유사도 × 0.60', BLUE, lambda p: .6 * p['similarity']),
             ('단어 × 0.25', PURPLE, lambda p: .25 * p['coverage']),
             ('종류 × 0.15', GREEN, lambda p: .15 * p['type'])]
    slot = [170 + i * 100 for i in range(4)]
    start = {p['id']: slot[i] for i, p in enumerate(sorted(PRODUCTS, key=lambda p: -p['similarity']))}
    end = {p['id']: slot[i] for i, p in enumerate(rank(True, False))}
    bx, scale = 280, 640

    def draw(grow, ys, show_total):
        c = Canvas(H)
        header(c, '점수 계산', '단어 묶음 2개 · 종류 = 운동화')
        x = 40
        for label, color, _ in parts:
            x += pill(c, x, 112, label, color, mix(color, BG, .85), 24) + 12
        for p in sorted(PRODUCTS, key=lambda p: p['id'] == 'laces'):
            y = ys[p['id']]
            c.rect(30, y, 1020, 80, fill=BG, r=12)
            tile(c, 40, y + 14, 52, p['color'], p['kind'])
            c.text(108, y + 40, p['short'], 30, INK, 'bold')
            c.rect(bx, y + 22, scale, 36, fill=SOFT, r=8)
            x, total = bx, 0
            for i, (_, color, value) in enumerate(parts):
                v = value(p) * grow[i]
                if v > 0:
                    c.rect(x, y + 22, scale * v, 36, fill=color, r=8 if i == 0 else 4)
                x += scale * v
                total += v
            if show_total:
                c.text(1040, y + 40, f'{total:.3f}', 30, INK, 'bold', 'rm')
        caption(c, '신발끈은 단어 1/2, 종류 0이라 맨 아래로', ORANGE, 600)
        return c.done()

    frames = [(draw([0, 0, 0], start, False), 800)]
    for i in range(3):
        for f in range(1, 9):
            grow = [1] * i + [ease(f / 8)] + [0] * (2 - i)
            frames.append((draw(grow, start, False), 70))
        frames.append((draw([1] * (i + 1) + [0] * (2 - i), start, False), 600))
    frames.append((draw([1, 1, 1], start, True), 900))
    for f in range(1, 11):
        k = ease(f / 10)
        frames.append((draw([1, 1, 1], {n: lerp(start[n], end[n], k) for n in start}, True), 70))
    still = draw([1, 1, 1], end, True)
    frames.append((still, 2600))
    save_gif('score', frames, still)


# ---------------------------------------------------------------- 14. 세 번 줄 세우기
def ranking_gif():
    H = 720
    slot = [130 + i * 120 for i in range(4)]
    plain, corrected, diverse = rank(False, False), rank(True, False), rank(True, True)
    score = {p['id']: p['score'] for p in corrected}
    tier = {p['id']: p['tier'] for p in corrected}
    penalty = {p['id']: p['penalty'] for p in diverse}
    tabs = [('① 유사도만', TEXT, SOFT), ('② 단어·종류 반영', PURPLE, PURPLE_BG), ('③ 겹침 감점', RED, RED_BG)]

    def draw(active, ys, score_t, badge_t, penalty_t, outline_t, status, front=None):
        c = Canvas(H)
        x = 40
        for i, (label, fg, bg) in enumerate(tabs):
            on = i == active
            x += pill(c, x, 56, label, fg if on else FAINT, bg if on else BG, 26) + 14
        order = sorted(PRODUCTS, key=lambda p: ys[p['id']])
        for p in sorted(PRODUCTS, key=lambda p: p['id'] == front):  # 크게 움직이는 행을 위에 그린다
            y = ys[p['id']]
            picked = p['id'] == 'shoe' and outline_t
            card(c, 40, y, 1000, 104, outline=mix(GRID, BLUE, outline_t) if picked else GRID, width=3 if picked else 2, lifted=p['id'] == front)
            c.text(80, y + 52, str(order.index(p) + 1), 32, FAINT, 'bold', 'mm')
            tile(c, 112, y + 20, 64, p['color'], p['kind'])
            c.text(198, y + 52, p['short'], 32, INK, 'bold')
            if badge_t:
                c.rect(470, y + 32, 120, 40, outline=mix(FAINT, BG, 1 - badge_t), width=2, r=20)
                c.text(530, y + 52, f"단계 {tier[p['id']]}", 24, mix(TEXT, BG, 1 - badge_t), 'semibold', 'mm')
            if penalty_t and penalty[p['id']]:
                c.text(830, y + 52, f"−{penalty[p['id']]:.3f}", 30, mix(RED, BG, 1 - penalty_t), 'bold', 'rm')
            c.text(1016, y + 52, f"{lerp(p['similarity'], score[p['id']], score_t):.3f}", 32, INK, 'bold', 'rm')
        caption(c, status[0], status[1], 680)
        return c.done()

    def positions(order):
        return {p['id']: slot[i] for i, p in enumerate(order)}

    def slide(a, b, t):
        k = ease(t)
        return {pid: lerp(a[pid], b[pid], k) for pid in a}

    p1, p2, p3 = positions(plain), positions(corrected), positions(diverse)
    s1 = ('유사도만 보면 신발끈이 1등', MUTED)
    s2 = ('두 단어와 종류가 맞는 운동화 셋이 위로', PURPLE)
    s3 = ('운동화 A를 고른 뒤 겹치는 후보 감점', RED)
    s4 = ('감점 차이가 점수 차이보다 커서 B가 A 복제를 추월', RED)
    frames = [(draw(0, p1, 0, 0, 0, 0, s1), 2000)]
    for f in range(1, 6):
        frames.append((draw(1, p1, f / 5, f / 5, 0, 0, s2), 80))
    for f in range(1, 10):
        frames.append((draw(1, slide(p1, p2, f / 9), 1, 1, 0, 0, s2, 'laces'), 70))
    frames.append((draw(1, p2, 1, 1, 0, 0, s2), 2000))
    for f in range(1, 4):
        frames.append((draw(2, p2, 1, 1, 0, f / 3, s3), 80))
    for f in range(1, 6):
        frames.append((draw(2, p2, 1, 1, f / 5, 1, s3), 80))
    frames.append((draw(2, p2, 1, 1, 1, 1, s3), 1000))
    for f in range(1, 10):
        frames.append((draw(2, slide(p2, p3, f / 9), 1, 1, 1, 1, s4, 'other'), 70))
    still = draw(2, p3, 1, 1, 1, 1, s4)
    frames.append((still, 2600))  # 끝나면 첫 프레임으로 바로 돌아간다
    save_gif('ranking', frames, still)


# ---------------------------------------------------------------- 15. 이름 겹침 (Jaccard)
def jaccard_png():
    H = 560
    c = Canvas(H)
    header(c, '이름이 겹치는 정도', 'Jaccard = 겹친 단어 ÷ 모든 단어')
    pairs = [(BY_ID['shoe']['name'], BY_ID['copy']['name'], BLUE, BLUE_BG, '많이 겹침'),
             (BY_ID['shoe']['name'], BY_ID['other']['name'], MUTED, SOFT, '겹침 없음')]
    for i, (a, b, fg, bg, label) in enumerate(pairs):
        y0 = 110 + i * 200
        card(c, 40, y0, 1000, 176)
        common = set(a.split()) & set(b.split())
        for r, name in enumerate((a, b)):
            x, y = 70, y0 + 50 + r * 76
            for word in name.split():
                hit = word in common
                w = c.tw(word, 28, 'semibold') + 32
                c.rect(x, y - 24, w, 48, fill=BLUE_BG if hit else SOFT, r=10)
                c.text(x + w / 2, y, word, 28, BLUE if hit else TEXT, 'semibold', 'mm')
                x += w + 10
        value = jaccard(a, b)
        union = len(set(a.split()) | set(b.split()))
        c.text(1010, y0 + 64, f'{len(common)} ÷ {union} = {value:.2f}'.replace('.00', ''), 40, INK, 'bold', 'rm')
        pill(c, 1010, y0 + 124, label, fg, bg, 24, 'r')
    pill(c, W / 2, 520, '사진이 같으면 이름과 상관없이 겹침 1', PURPLE, PURPLE_BG, 24, 'm')
    save_png('jaccard', c.done())
    return jaccard(*pairs[0][:2]), jaccard(*pairs[1][:2])


# ---------------------------------------------------------------- 17. 한 달 비용 (공식 단가 × 가정)
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
    storage = PRODUCTS_N * ((4 * IMAGE_DIM + 8) + (4 * TEXT_DIM + 8))  # pgvector: 4 × 차원 + 8바이트
    break_even = gpu_month / (QUERY_TOKENS * VOYAGE_PER_TOKEN)
    return dict(gpu_month=gpu_month, first_images=first_images, first_text=first_text,
                first=first_images + first_text, query_month=query_month, storage=storage, break_even=break_even)


def cost_png():
    H = 540
    k = costs()
    c = Canvas(H)
    header(c, '한 달에 드는 비용', f'예시: 상품 {PRODUCTS_N:,}개 · 검색어 검색 월 {SEARCHES_PER_MONTH:,}번')
    x0, scale = 470, 430 / k['gpu_month']
    groups = [
        ('흔히 떠올리는 구성', TEXT, SOFT, 104, [
            ('GPU 한 장 24시간 (T4)', RED, k['gpu_month'], '월'),
            ('벡터 DB (Pinecone Standard)', mix(RED, BG, .45), PINECONE_STANDARD_MIN, '월'),
        ]),
        ('직접 만든 구성', BLUE, BLUE_BG, 286, [
            ('검색어 → 벡터 (Voyage)', BLUE, k['query_month'], '월'),
            ('첫 등록 (사진 + 상품명)', PURPLE, k['first'], '한 번'),
        ]),
    ]
    for title, fg, bg, y0, rows in groups:
        pill(c, 40, y0, title, fg, bg, 24)
        for i, (label, color, value, unit) in enumerate(rows):
            y = y0 + 60 + i * 64
            c.text(40, y, label, 28, INK, 'semibold')
            c.line([(x0, y - 22), (x0, y + 22)], GRID, 2)
            w = max(5, value * scale)
            c.rect(x0, y - 16, w, 32, fill=color, r=6)
            c.text(x0 + w + 14, y, f'${value:,.2f}', 28, INK, 'bold')
            c.text(x0 + w + 14 + c.tw(f'${value:,.2f}', 28, 'bold') + 8, y, f'/ {unit}', 24, MUTED, 'medium')
    caption(c, f"직접 만든 구성의 추가 비용: 첫 등록 ${k['first']:.2f}, 그 뒤 월 ${k['query_month']:.2f}", GREEN, 500)
    save_png('cost', c.done())
    return k


# ---------------------------------------------------------------- 16. 결과가 이상할 때
def debug_png():
    H = 560
    c = Canvas(H)
    header(c, '검색 결과가 이상할 때')
    card(c, 290, 92, 500, 84, outline=BLUE, width=3)
    c.text(540, 134, '원하는 상품이 후보에 있었나요?', 30, INK, 'bold', 'mm')
    boxes = [(40, '아니요 · 후보 문제', RED, RED_BG, ['벡터 검색 결과', '단어 찾기 규칙', '후보 개수'], '순서 규칙을 고쳐도 소용없음'),
             (560, '예 · 순서 문제', BLUE, BLUE_BG, ['단어 묶음', '상품 종류 판별', '점수와 감점'], '후보 안에서 순서만 바뀜')]
    for x, title, fg, bg, lines, note in boxes:
        arrow(c, (440 if x < 300 else 640, 178), (x + 240, 240), FAINT)
        card(c, x, 246, 480, 268)
        pill(c, x + 24, 290, title, fg, bg, 24)
        for i, line in enumerate(lines):
            y = 352 + i * 44
            c.circle(x + 38, y, 5, fill=fg)
            c.text(x + 56, y, line, 28, TEXT, 'semibold')
        c.text(x + 24, 486, note, 22, MUTED, 'medium')
    save_png('debug', c.done())


if __name__ == '__main__':
    plain, corrected, diverse = rank(False, False), rank(True, False), rank(True, True)
    # 본문에 적은 순서와 수치가 이 계산과 맞는지 먼저 확인한다.
    assert [p['id'] for p in plain] == ['laces', 'shoe', 'copy', 'other']
    assert [p['id'] for p in corrected] == ['shoe', 'copy', 'other', 'laces']
    assert [p['id'] for p in diverse] == ['shoe', 'other', 'copy', 'laces']
    numbers = {p['id']: (round(p['score'], 3), round(p['penalty'], 3)) for p in diverse}
    assert numbers['copy'] == (.982, .08) and numbers['other'] == (.952, .039) and numbers['laces'] == (.722, .05), numbers
    keyword_gif()
    architecture_png()
    near, far = embedding_gif()
    flow_gif()
    per_search_gif()
    total = dot_gif()
    cosine_gif()
    pgvector_gif()
    text_space_png()
    candidates_gif()
    word_boundary_png()
    funnel_png()
    score_gif()
    ranking_gif()
    same, other = jaccard_png()
    debug_png()
    k = cost_png()
    assert (round(k['gpu_month'], 2), round(k['first'], 2), round(k['query_month'], 2)) == (425.09, 1.7, .24), k
    print({key: round(v, 4) for key, v in k.items()})
    print(f'embedding: near {near:.2f}, far {far:.2f} · dot {total:.2f} · jaccard {same:.2f}, {other:.2f}')
