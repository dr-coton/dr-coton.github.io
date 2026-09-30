# 꼬박사의 연구노트

수채화 풍경과 글을 중심으로 만든 개인 블로그. GitHub Pages의 기본 Jekyll 빌드를 사용합니다. 글 파일명, 글 주소, 글 목록, 본문에 날짜를 넣지 않습니다. 초기 글 10편은 디자인을 위한 가상 글입니다.

## 글 쓰기

`_writings/` 안에 `my-story.md`처럼 날짜 없는 이름으로 파일을 하나 만들고 다음 형식으로 작성하세요.

```markdown
---
title: 글 제목
topic: 일상
description: 목록에 보일 짧은 소개.
---

여기에 글을 씁니다.

## 작은 제목

Markdown으로 자유롭게 작성하세요.
```

- 주제는 `개발`, `일상`, `생각`, `취향`, `배움` 중에서 선택합니다. `_config.yml`의 `topics`에서 바꿀 수 있습니다.
- 목록은 제목의 가나다순입니다. 날짜나 발행 순서를 관리할 필요가 없습니다.
- 글을 저장하고 `main` 브랜치에 push하면 발행됩니다.
- 예시 글은 자유롭게 지우세요. 실제 글에는 `sample: true`를 넣지 않으면 예시 안내가 표시되지 않습니다.
- 블로그 이름과 작성자는 `_config.yml`, 소개글은 `about.html`에서 바꿉니다.

## GitHub Pages 연결

저장소 **Settings → Pages → Build and deployment**에서 **Deploy from a branch**, **main**, **/(root)**를 선택하면 `https://dr-coton.github.io`로 발행됩니다. [GitHub 공식 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 로컬 미리보기

Ruby와 Bundler가 설치된 환경에서:

```sh
bundle install
bundle exec jekyll serve
```

`http://127.0.0.1:4000`에서 확인합니다. 정적 빌드와 링크 확인:

```sh
bundle exec jekyll build
python3 tests/check_site.py
```

## 썸네일 만들기 (Codex + GPT 이미지)

글을 쓴 뒤 슬러그(파일명에서 `.md`를 뺀 것)를 넘기면 Codex가 글을 읽고 수채화 썸네일을 그립니다. `codex` CLI가 로그인되어 있으면 API 키는 필요 없습니다.

```sh
scripts/thumb.sh commit-message
```

- 그림은 `assets/thumbs/<슬러그>.jpg`(1200px)로 저장되고, 글 맨 위 front matter에 `thumb:`이 자동으로 들어갑니다.
- 이미 만들어진 썸네일은 건너뜁니다. 다시 만들려면 jpg를 지우고 다시 실행하세요.
- 그림 스타일(수채화, 주제별 색, 종이색 배경)은 `scripts/thumb-style.txt`에서 바꿉니다.
- 썸네일이 없는 글도 그대로 표시됩니다. 목록에는 이미지 없이 글자만 나옵니다.

### ChatGPT에서 직접 만들 때

1. `scripts/thumb-style.txt` 내용을 붙여 넣고, 맨 앞에 `Subject: <이 글을 상징하는 물건이나 장면 하나>`를 한 줄 추가해 요청합니다.
2. 받은 이미지를 아래 명령으로 줄여서 저장하고, 글 맨 위 front matter에 `thumb: /assets/thumbs/<슬러그>.jpg`를 적습니다.

```sh
sips -s format jpeg -s formatOptions 85 -Z 1200 ~/Downloads/그림.png --out assets/thumbs/<슬러그>.jpg
```

디자인이 깨지지 않으려면 이 규칙이 필요합니다.

| 규칙 | 이유 |
| --- | --- |
| 배경은 `#fafaf6` 단색 | 사이트가 이미지를 종이 위에 `multiply`로 겹치고 가장자리를 흐려서, 단색 배경이어야 이음매가 안 보입니다 |
| 그림은 가운데 절반 안에 | 글 상단에서 위아래를 2:1로 잘라 보여주고, 목록에서는 가장자리가 옅어집니다 |
| 3:2 가로, 1536×1024 | 카드와 글 상단이 이 비율에 맞춰져 있습니다 |
| 글자, 코드, 화면, 얼굴 금지 | 이미지 모델이 한글과 코드를 깨뜨려 그리기 쉽고, 세트의 통일감이 무너집니다 |
| 테두리, 프레임, 그라데이션 금지 | 배경 위에 사각형이 떠서 수채화가 종이에 스며드는 느낌이 사라집니다 |
| 주제별 색 팔레트 | 개발 황토+청록, 일상 초록, 생각 보라, 취향 살구, 배움 하늘색으로 목록이 한 세트로 보입니다 |

## 수채화 에셋

- 메인과 소개 페이지의 풍경은 `assets/watercolor.svg`입니다(코드로 그린 수채화). 공유 미리보기(og:image)용 `assets/watercolor.png`는 이 SVG를 Chrome으로 렌더링한 것입니다.
- 종이 질감은 `assets/style.css`의 배경(아주 옅은 노이즈)으로 만듭니다.
- 소개 페이지의 프로필 그림은 `assets/profile.jpg`입니다. 바꾸려면 같은 이름으로 덮어쓰세요(정사각형 권장).

## 고양이: 장고와 드리

- 뚱뚱한 쪽이 장고(`assets/cats/jango.png`), 평범한 쪽이 드리(`assets/cats/deuri.png`)입니다. 이름은 각각 냉장고 위에서 안 내려온 것, 세탁기(laundry) 뒤에서 안 나온 것에서 왔습니다. 소개는 `/cats/` 페이지(`cats.html`)에 있습니다.
- 어느 페이지에서든 화면 아래를 돌아다닙니다. 대부분은 느긋하게 걷고, 냄새를 맡고, 앉아서 두리번거리거나 하품하고, 그루밍하고, 식빵 자세로 졸고, 꾹꾹이를 한 뒤 웅크려 잡니다. 가끔 달리고, 점프하고, 엉덩이를 흔들다 덮치고, 서로 쫓아다닙니다. 행동은 무작위이고 성격(아래 `data-*`)에 따라 비율이 다릅니다.
- 자세는 서기 ↔ 앉기 ↔ 식빵 ↔ 잠 순서로만 바뀌고 사이 동작(앉기, 엎드리기, 눈 감기)을 거칩니다. 잠에서 깨면 하품하고 기지개를 켠 뒤 일어납니다. 걷기·달리기는 이동한 거리만큼 프레임을 넘겨서 발이 미끄러지지 않습니다.
- 페이지를 옮겨도 이어서 움직입니다. 같은 사이트 안의 링크는 `assets/soft-nav.js`가 헤더·본문·푸터만 바꾸기 때문입니다. 새로 불러오는 스크립트는 `filter.js`처럼 전역 변수를 만들지 않아야 합니다.
- 인터랙션: 고양이를 누르면 쓰다듬기(하트와 한마디, 자는 중이면 귀만 쫑긋), 마우스를 화면 아래에 가져다 대면 달려와서 덮칩니다. `/cats/`에서는 바닥이나 선반을 누르면 간식이 떨어지고 가까운 고양이가 먹으러 옵니다.
- `/cats/`의 방은 `cats.html`의 SVG 그림이고, 세탁기만 고양이보다 앞 층에 그려서 드리가 뒤로 숨을 수 있습니다. 고양이가 딛는 발판은 `.room-cats`의 `data-platforms`(가로 범위와 바닥에서의 높이)로 정하고, 그림을 바꾸면 이 좌표도 함께 고쳐야 합니다.
- 스프라이트는 72×64px 칸이 6열(프레임) × 12행입니다. 행 순서는 일어서기, 걷기, 달리기, 서서 쉬기, 앉기, 그루밍, 엎드리기, 잠, 기지개, 점프, 덮치기, 꾹꾹이이고 `assets/cats.js`의 `ROW`와 `scripts/cat_sprites.py`의 `SHEETS`가 같아야 합니다(`tests/check_site.py`가 확인).
- 움직임은 `assets/cats.js`, 스타일은 `assets/style.css`의 `.cat`, 마크업은 `_layouts/default.html`에 있습니다. `default.html`의 `data-speed`(걷는 속도, 초당 도트), `data-sleepy`(잠자는 성향), `data-energy`(달리기·점프·쫓기 성향), `data-jump`(점프 높이 px), `data-reach`(방에서 한 번에 오를 수 있는 높이), `data-fav`(방에서 좋아하는 자리), `data-says`(누르면 하는 말)로 성격을 바꿉니다.
- 글 읽기를 방해하지 않도록 몸통 말고는 클릭이 고양이를 통과합니다. 움직임 줄이기 설정이 켜져 있으면 나타나지 않습니다.

스프라이트를 다시 만들려면 Codex(내장 이미지 생성)로 원본 시트를 그리고 정리합니다. `codex` CLI가 ChatGPT로 로그인되어 있으면 API 키는 필요 없습니다.

```sh
mkdir -p ~/cat-src && cp 고양이사진_또는_예전스프라이트.png ~/cat-src/jango_ref.png
scripts/cat_gen.sh jango model ~/cat-src   # 캐릭터 기준 시트(3x2). 마음에 들 때까지 다시 돌린다
scripts/cat_gen.sh jango a ~/cat-src       # 동작 시트 a·b·c(6x4). 기준 시트를 참고 이미지로 붙여 같은 그림체를 유지한다
scripts/cat_gen.sh jango b ~/cat-src
scripts/cat_gen.sh jango c ~/cat-src
python3 scripts/cat_sprites.py ~/cat-src jango   # assets/cats/jango.png 와 확인용 ~/cat-src/preview_jango.png
```

- 기준 시트가 고양이의 생김새를 정하는 단계입니다. 무늬·눈 색·체형이 맞을 때까지 다시 만들고, 동작 시트는 이 그림만 참고합니다. 프롬프트는 `scripts/cat-model-prompt.txt`, `scripts/cat-anim-prompt.txt`, 행마다의 동작 설명은 `scripts/cat_gen.sh`에 있습니다.
- 동작 시트는 배경이 투명합니다(마젠타 같은 단색 배경이어도 정리됩니다). 모든 시트의 첫 칸은 같은 앉은 자세라서 이 키로 시트마다의 크기를 맞춥니다.
- `cat_sprites.py`는 크기를 맞추고, 시트마다 색감을 평균에 맞춘 뒤 팔레트 하나로 색을 고정하고, 외곽선을 다시 칠하고, 발을 기준선에·몸의 무게중심을 칸 가운데에 둡니다. `preview_<고양이>.png` 오른쪽의 겹친 그림에서 이웃 프레임이 크게 어긋나 보이면 `FIX`로 프레임 순서(`order`)나 가로 위치(`dx`)를 고칩니다. 한 줄이 통째로 이상하면 그 시트만 다시 만드는 편이 빠릅니다.
