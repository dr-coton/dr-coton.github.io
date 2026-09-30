"""GPT가 그린 고양이 원본 시트(scripts/cat_gen.sh)를 게임용 도트 스프라이트 한 장으로 정리한다.
사용법: python3 scripts/cat_sprites.py <원본폴더> [jango deuri]
  <원본폴더>/<고양이>_a/_b/_c.png(6x4 동작 시트)를 읽어
  assets/cats/<고양이>.png(6열 x 12행, 칸 CW x CH)와 확인용 <원본폴더>/preview_<고양이>.png 를 만든다.

GPT는 장마다 크기·색·위치가 조금씩 달라서, 그대로 이어 붙이면 프레임마다 고양이가 떨리고 색이 바뀐다. 그래서
- 크기: 모든 시트의 첫 칸(앉은 자세)의 키를 SIT_H 도트에 맞춘다
- 색: 시트마다 밝기·색감을 평균에 맞춘 뒤, 모든 시트에서 뽑은 팔레트 하나로 색을 고정한다
- 외곽선: 가장자리 한 줄을 같은 진한 갈색으로 다시 칠한다
- 위치: 발은 칸 아래 기준선, 가로는 몸의 무게중심을 칸 가운데에 맞춘다(FIX 로 프레임별 보정)
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

CW, CH, PAD, COLS = 72, 64, 2, 6  # 칸 너비·높이, 발 아래 여백, 열(프레임) 수
SIT_H = 40  # 앉은 자세의 키(도트)
PAPER, SOFTEN = np.array([250, 250, 246]), 0.08  # 사이트 종이색, 팔레트에 섞는 비율(수채화 종이 위에서 덜 튀게)
# 행 순서는 assets/cats.js 의 ROW, scripts/cat_gen.sh 의 시트 설명과 같아야 한다
SHEETS = {"a": ["standup", "walk", "run", "stand"], "b": ["sit", "groom", "lie", "sleep"], "c": ["stretch", "jump", "pounce", "knead"]}
ROWS = [r for s in SHEETS.values() for r in s]
# 프레임 보정: order 는 원본 칸 순서를 바꾸거나 고르고(같은 칸을 두 번 써도 된다), dx 는 프레임별 가로 이동(도트),
# src 는 그 줄만 다시 뽑은 시트(scripts/cat_gen.sh 에 번호를 줘서 만든 <고양이>_a2.png 같은 것)에서 가져온다
FIX = {
    "jango": {},
    "deuri": {"walk": {"src": "a4"}},  # 처음 걷기는 다리 순서가 뒤섞여 어색했다
}


def load(path):
    """RGBA 배열과 고양이 마스크. 투명 배경이면 알파로, 아니면 테두리 색(마젠타 등)과 다른 픽셀로 가른다."""
    im = np.asarray(Image.open(path).convert("RGBA")).astype(np.int32)
    a = im[..., 3]
    if (a < 10).mean() > 0.2:
        mask = a >= 200
    else:
        border = np.concatenate([im[0, :, :3], im[-1, :, :3], im[:, 0, :3], im[:, -1, :3]])
        bg = np.median(border, axis=0)
        mask = np.abs(im[..., :3] - bg).sum(-1) > 150
    return im, mask


def cells(mask, rows, cols, k=4):
    """연결된 덩어리를 찾아 중심이 속한 격자 칸별로 모은다(GPT의 격자는 정확하지 않아 칸 경계를 넘기도 한다)."""
    h, w = mask.shape[0] // k, mask.shape[1] // k
    small = mask[: h * k, : w * k].reshape(h, k, w, k).any(axis=(1, 3))
    label = np.zeros((h, w), np.int32)
    comps = []
    for y0, x0 in zip(*np.nonzero(small)):
        if label[y0, x0]:
            continue
        n = len(comps) + 1
        label[y0, x0] = n
        stack, pts = [(y0, x0)], []
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= yy < h and 0 <= xx < w and small[yy, xx] and not label[yy, xx]:
                    label[yy, xx] = n
                    stack.append((yy, xx))
        p = np.array(pts)
        comps.append((n, len(p), p[:, 0].mean() * k, p[:, 1].mean() * k))
    big = max(c[1] for c in comps)
    grid = [[[] for _ in range(cols)] for _ in range(rows)]
    for n, area, cy, cx in comps:
        if area > big * 0.02:  # 잡티는 버린다
            grid[min(int(cy / mask.shape[0] * rows), rows - 1)][min(int(cx / mask.shape[1] * cols), cols - 1)].append(n)
    full = np.kron(label, np.ones((k, k), np.int32))
    full = np.pad(full, ((0, mask.shape[0] - full.shape[0]), (0, mask.shape[1] - full.shape[1])))
    out = []
    for r, row in enumerate(grid):
        for c, ns in enumerate(row):
            assert ns, f"{r + 1}행 {c + 1}열이 비어 있음(격자가 {cols}x{rows}가 아닐 수 있다)"
        out.append([mask & np.isin(full, ns) for ns in row])
    return out


def shrink(im, m, scale):
    """한 마리를 잘라 scale 배로 줄인다. 알파 가중 평균이라 배경색이 번지지 않는다. 반환: RGB 배열, 마스크"""
    ys, xs = np.nonzero(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = im[y0:y1, x0:x1].copy()
    rgba[..., 3] = m[y0:y1, x0:x1] * 255
    size = (max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale)))
    small = np.asarray(Image.fromarray(rgba.astype(np.uint8), "RGBA").resize(size, Image.BOX)).astype(np.int32)
    return small[..., :3], small[..., 3] > 127


def sheet(path, rows, cols):
    """시트 한 장 → [[(RGB, 마스크), ...], ...]. 첫 칸(앉은 자세)의 키로 배율을 정한다."""
    im, mask = load(path)
    grid = cells(mask, rows, cols)
    ys = np.nonzero(grid[0][0])[0]
    scale = SIT_H / (ys.max() + 1 - ys.min())
    return [[shrink(im, m, scale) for m in row] for row in grid]


def median_cut(px, n):
    q = Image.fromarray(px[None]).quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    full = np.array(q.getpalette()).reshape(-1, 3)
    return full[np.unique(np.asarray(q))]  # 실제로 쓰인 색만(남는 칸은 검정으로 채워져 있다)


def palette(sprites, k=32, extra=12):
    """털 색 k개 + 눈·코·귀속·주황 무늬처럼 면적은 작아도 중요한 색 extra개. 반환: 팔레트, 외곽선 색"""
    px = np.concatenate([rgb[m] for rgb, m in sprites]).astype(np.uint8)
    main = median_cut(px, k)
    err = np.sqrt(((px[:, None].astype(np.int32) - main[None]) ** 2).sum(-1).min(1))
    far = px[err > 20]  # 털 색으로 뭉개지는 색
    pal = np.concatenate([main, median_cut(far, extra)]) if len(far) > 50 else main
    pal = np.round(pal * (1 - SOFTEN) + PAPER * SOFTEN).astype(np.int32)
    return pal, pal[: len(main)][pal[: len(main)].sum(1).argmin()]


def paint(rgb, m, pal, outline):
    """팔레트의 가장 가까운 색으로 칠하고, 가장자리 한 줄은 외곽선 색으로 칠한다."""
    d = rgb[:, :, None, :] - pal[None, None]
    rmean = (rgb[:, :, None, 0] + pal[None, None, :, 0]) / 2  # 사람 눈에 가까운 색 거리(redmean)
    dist = (2 + rmean / 256) * d[..., 0] ** 2 + 4 * d[..., 1] ** 2 + (3 - rmean / 256) * d[..., 2] ** 2
    out = pal[dist.argmin(-1)]
    p = np.pad(m, 1)
    edge = m & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    out[edge] = outline
    return out


def place(dst, rgb, m, cx, cy, dx=0, name=""):
    """발은 칸 아래 기준선, 가로는 무게중심을 칸 가운데에. 칸을 넘으면 안쪽으로 밀어 넣는다."""
    h, w = m.shape
    xs = np.nonzero(m)[1]
    x = round(CW / 2 - xs.mean()) + dx
    if not 0 <= x <= CW - w:
        print(f"  경고: {name} 너비 {w}가 칸을 넘어 {x}→{min(max(x, 0), CW - w)}로 밀어 넣음")
        x = min(max(x, 0), CW - w)
    y = CH - PAD - h
    if y < 0:
        print(f"  경고: {name} 키 {h}가 칸보다 큼, 위가 잘린다")
        rgb, m, y = rgb[-y:], m[-y:], 0
    region = dst[cy + y : cy + y + m.shape[0], cx + x : cx + x + w]
    region[m] = np.concatenate([rgb, np.full(rgb.shape[:2] + (1,), 255)], -1)[m]


def preview(out, path, z=4):
    """확인용: 4배 확대, 칸마다 가운데선과 기준선, 오른쪽에는 이웃 프레임을 겹친 그림(어긋나면 떨려 보인다)."""
    h = out.shape[0]
    big = np.zeros((h, CW * COLS * 2, 4), np.uint8)
    big[:, : CW * COLS] = out
    for r in range(h // CH):
        for c in range(COLS):
            a = out[r * CH : (r + 1) * CH, c * CW : (c + 1) * CW].astype(np.float32)
            b = out[r * CH : (r + 1) * CH, ((c + 1) % COLS) * CW : ((c + 1) % COLS + 1) * CW].astype(np.float32)
            big[r * CH : (r + 1) * CH, CW * COLS + c * CW : CW * COLS + (c + 1) * CW] = (a * 0.5 + b * 0.5).astype(np.uint8)
    img = Image.new("RGBA", (big.shape[1], h), (250, 250, 246, 255))
    img.alpha_composite(Image.fromarray(big, "RGBA"))
    img = np.array(img.convert("RGB").resize((img.width * z, h * z), Image.NEAREST))
    for r in range(h // CH):
        img[((r + 1) * CH - PAD) * z, :] = (200, 120, 110)
    for c in range(COLS * 2):
        img[:, (c * CW + CW // 2) * z] = (150, 180, 210)
        img[:, c * CW * z] = (220, 220, 210)
    Image.fromarray(img).save(path)


def build(src, cat):
    keys = [*SHEETS, *{f["src"] for f in FIX[cat].values() if "src" in f}]
    sheets = {key: sheet(src / f"{cat}_{key}.png", 4, COLS) for key in keys}
    px = {key: np.concatenate([rgb[m] for row in rows for rgb, m in row]) for key, rows in sheets.items()}
    allpx = np.concatenate(list(px.values()))
    mean, std = allpx.mean(0), allpx.std(0)
    for key, rows in sheets.items():  # 시트마다 채널별 평균·표준편차를 전체에 맞춘다(어떤 장은 조금 어둡거나 붉다)
        k0, s0 = px[key].mean(0), px[key].std(0)
        sheets[key] = [[(np.clip((rgb - k0) / s0 * std + mean, 0, 255).round().astype(np.int32), m) for rgb, m in row] for row in rows]
    pal, outline = palette([s for rows in sheets.values() for row in rows for s in row])  # 팔레트 하나로 모든 시트의 색을 모은다
    out = np.zeros((CH * len(ROWS), CW * COLS, 4), np.uint8)
    for key, names in SHEETS.items():
        for j, name in enumerate(names):
            fix = FIX[cat].get(name, {})
            row = sheets[fix.get("src", key)][j]
            r = ROWS.index(name)
            for c, i in enumerate(fix.get("order", range(COLS))):
                rgb, m = row[i]
                place(out, paint(rgb, m, pal, outline), m, c * CW, r * CH, fix.get("dx", [0] * COLS)[c], f"{cat} {name} {c + 1}")
    Image.fromarray(out, "RGBA").save(ROOT / "assets" / "cats" / f"{cat}.png")
    preview(out, src / f"preview_{cat}.png")
    print(f"{cat}: {out.shape[1]}x{out.shape[0]}, 팔레트 {len(pal)}색")


ROOT = Path(__file__).resolve().parents[1]

if __name__ == "__main__":
    src = Path(sys.argv[1])
    for cat in sys.argv[2:] or ["jango", "deuri"]:
        build(src, cat)
