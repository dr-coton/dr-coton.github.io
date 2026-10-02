"""Run after `bundle exec jekyll build`: python3 tests/check_site.py [빌드 폴더]."""
import ast
from html.parser import HTMLParser
from pathlib import Path
import re
import struct
import sys
from urllib.parse import unquote, urlsplit


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.links = []
        self.cards = 0
        self.has_main = False
        self.has_date = False
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.cards += "writing-card" in attrs.get("class", "").split()
        self.has_main |= tag == "main" and attrs.get("id") == "main"
        self.has_date |= tag == "time" or attrs.get("property", "") in ("article:published_time", "article:modified_time")
        if tag in ("a", "link", "script", "img"):
            link = attrs.get("href", attrs.get("src", ""))
            if link.startswith("/") and not link.startswith("//"):
                self.links.append(unquote(urlsplit(link).path))


root = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "_site"  # 빌드 위치를 따로 지정할 수 있다
sources = list((root / "_writings").glob("*.md"))
for source in sources:
    front_matter = source.read_text().split("---", 2)[1]
    assert not any(line.split(":", 1)[0].strip() == "date" for line in front_matter.splitlines()), source
    assert not re.match(r"\d{4}-\d{2}-\d{2}", source.stem), f"Use a name without a date: {source}"
    article = output / "writing" / source.stem / "index.html"
    assert article.is_file(), f"Writing did not build: {article}"
    assert 'class="prose"' in article.read_text(), f"Missing article body: {article}"

assert Page((output / "index.html").read_text()).cards == len(sources), "Missing writing in the index"
pages = list(output.rglob("*.html"))
for path in pages:
    page = Page(path.read_text())
    assert page.has_main, f"Missing main landmark: {path}"
    assert not page.has_date, f"Visible date metadata: {path}"
    for link in page.links:
        target = output / link.lstrip("/")
        if target.is_dir():
            target /= "index.html"
        assert target.is_file(), f"Broken local link in {path}: {link}"

# 글 속 그림: 글의 data-fig 이름마다 assets/figures/*.js 에 F.define('이름')이 있어야 하고, 이름은 글 안에서 겹치지 않는다
defined = set(re.findall(r"""\.define\(\s*['"]([\w-]+)['"]""", "".join(p.read_text() for p in (root / "assets" / "figures").glob("*.js"))))
for source in sources:
    names = re.findall(r'data-fig="([\w-]+)"', source.read_text())
    assert len(names) == len(set(names)), f"Duplicate figure in {source}"
    assert set(names) <= defined, f"Figure without a definition in {source}: {sorted(set(names) - defined)}"

sitemap = (output / "sitemap.xml").read_text()
assert ("/writing/" in sitemap) == bool(sources) and "404" not in sitemap, "sitemap.xml should list writings but not the 404 page"

# 고양이 스프라이트: cats.js 의 행 순서 = scripts/cat_sprites.py 의 행 순서, 그림 크기 = 칸 크기 x 열·행 수
sprite_consts = {}
for node in ast.parse((root / "scripts" / "cat_sprites.py").read_text()).body:
    if isinstance(node, ast.Assign):
        names = node.targets[0].elts if isinstance(node.targets[0], ast.Tuple) else node.targets
        values = node.value.elts if isinstance(node.value, ast.Tuple) else [node.value]
        for name, value in zip(names, values):
            if isinstance(name, ast.Name) and name.id in ("CW", "CH", "COLS", "SHEETS"):
                sprite_consts[name.id] = ast.literal_eval(value)
rows = [r for names in sprite_consts["SHEETS"].values() for r in names]
js_rows = re.search(r"const ROW = \{([^}]*)\}", (root / "assets" / "cats.js").read_text()).group(1)
assert [k.strip().split(":")[0] for k in js_rows.split(",")] == rows, "cats.js ROW order differs from cat_sprites.py"
for cat in ("jango", "deuri"):
    width, height = struct.unpack(">II", (root / "assets" / "cats" / f"{cat}.png").read_bytes()[16:24])
    assert (width, height) == (sprite_consts["CW"] * sprite_consts["COLS"], sprite_consts["CH"] * len(rows)), f"{cat}.png is {width}x{height}"

print(f"OK: {len(sources)} writings, {len(pages)} pages, local links and date-free publishing, cat sprites.")
