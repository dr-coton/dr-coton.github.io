"""Run after `bundle exec jekyll build`: python3 tests/check_site.py."""
from html.parser import HTMLParser
from pathlib import Path
import re
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
output = root / "_site"
sources = list((root / "_writings").glob("*.md"))
assert sources, "No writings found"
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

print(f"OK: {len(sources)} writings, {len(pages)} pages, local links and date-free publishing.")
