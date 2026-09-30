"""GPT가 그린 4x3 스프라이트 시트(마젠타 배경)를 프레임 56x56 픽셀 시트로 정리한다.
사용법: python3 scripts/cat_sprites.py <출력.png> <기본시트.png> [추가시트.png ...]
시트마다 3행이 이어 붙는다(기본: 걷기/앉기/잠자기, 추가: 달리기/점프/기지개).
배율은 기본시트에 맞추고 추가시트도 같은 배율을 쓴다(같은 도트 크기로 그려졌다는 가정)."""
import sys
from PIL import Image, ImageFilter

COLS, ROWS, CELL, PAD = 4, 3, 56, 2
FIT = 44  # 기본시트에서 가장 큰 자세가 이 크기가 되도록 배율을 잡는다
PAPER, SOFTEN = (250, 250, 246), 0.12  # 사이트 종이색, 종이색을 섞는 비율


def foreground(cell):
    """마젠타가 아닌 픽셀 = 고양이. 가장자리 잡티는 median으로 지운다."""
    px = cell.convert("RGB").load()
    out = Image.new("L", cell.size, 0)
    op = out.load()
    for y in range(cell.height):
        for x in range(cell.width):
            R, G, B = px[x, y]
            op[x, y] = 0 if (R > 170 and B > 170 and G < 120) else 255
    out = out.filter(ImageFilter.MedianFilter(5))
    return drop_specks(out)


def drop_specks(mask, min_area=40):
    """칸 경계를 넘어 옆 칸에서 잘려 들어온 조각처럼 작은 덩어리를 지운다(4분의 1 크기로 줄여서 찾는다)."""
    k = 4
    small = mask.resize((mask.width // k, mask.height // k), Image.NEAREST)
    w, h = small.size
    data = bytearray(small.tobytes())
    for start in range(w * h):
        if data[start] != 255:
            continue
        stack, blob = [start], []
        data[start] = 1
        while stack:
            p = stack.pop()
            blob.append(p)
            x, y = p % w, p // w
            for q in ((p - 1) if x else -1, (p + 1) if x < w - 1 else -1, (p - w) if y else -1, (p + w) if y < h - 1 else -1):
                if q >= 0 and data[q] == 255:
                    data[q] = 1
                    stack.append(q)
        if len(blob) < min_area:
            for p in blob:
                data[p] = 0
        else:
            for p in blob:
                data[p] = 255
    keep = Image.frombytes("L", (w, h), bytes(data)).resize(mask.size, Image.NEAREST)
    return Image.composite(mask, Image.new("L", mask.size, 0), keep)


def rows_of(path):
    sheet = Image.open(path).convert("RGB")
    cw, ch = sheet.width // COLS, sheet.height // ROWS
    cells = [[sheet.crop((i * cw, j * ch, (i + 1) * cw, (j + 1) * ch)) for i in range(COLS)] for j in range(ROWS)]
    masks = [[foreground(c) for c in row] for row in cells]
    windows = []
    for row in masks:  # 행마다 프레임 4개의 bbox 합집합 -> 같은 창으로 잘라야 그려진 위치가 유지된다
        boxes = [m.getbbox() for m in row]
        assert all(boxes), f"{path}: 빈 칸이 있음(격자가 4x3이 아닐 수 있다)"
        windows.append((min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)))
    return cells, masks, windows


def main(dst, *srcs):
    sheets = [rows_of(s) for s in srcs]
    wins = sheets[0][2]
    scale = min(FIT / max(w[2] - w[0] for w in wins), FIT / max(w[3] - w[1] for w in wins))
    out = Image.new("RGBA", (CELL * COLS, CELL * ROWS * len(sheets)), (0, 0, 0, 0))
    for n, (cells, masks, windows) in enumerate(sheets):
        for j, (row, mrow, win) in enumerate(zip(cells, masks, windows)):
            w, h = round((win[2] - win[0]) * scale), round((win[3] - win[1]) * scale)
            if w > CELL - 2 * PAD or h > CELL - 2 * PAD:
                print(f"경고: {srcs[n]} {j + 1}행이 칸보다 큼 ({w}x{h}), 잘릴 수 있다")
            ox, oy = (CELL - w) // 2, CELL - PAD - h  # 가운데, 발은 아래쪽 기준선
            for i, (cell, mask) in enumerate(zip(row, mrow)):
                rgba = cell.convert("RGBA")
                rgba.putalpha(mask)
                small = rgba.crop(win).resize((w, h), Image.BOX)  # RGBA는 알파 가중 평균이라 마젠타가 번지지 않는다
                small.putalpha(small.getchannel("A").point(lambda v: 255 if v > 127 else 0))  # 반투명 없이 딱딱한 도트
                q = small.quantize(colors=24, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert("RGB")
                q = Image.blend(q, Image.new("RGB", q.size, PAPER), SOFTEN).convert("RGBA")  # 수채화 종이 위에서 덜 튀게
                q.putalpha(small.getchannel("A"))
                out.alpha_composite(q, (i * CELL + ox, (n * ROWS + j) * CELL + oy))
    out.save(dst)
    print(f"{dst}: {out.size}, scale {scale:.3f}")


if __name__ == "__main__":
    main(*sys.argv[1:])
