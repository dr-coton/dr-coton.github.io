# 글 속 그림 만들기 (브라우저에서 그리는 SVG 그림)

이 문서는 블로그 글의 그림을 만들고 고치는 사람과 에이전트를 위한 내부 지침이다. 블로그 본문이 아니다. 문체와 설명 방식은 `docs/writing-guide.md`를 따르고, 이 문서는 그림을 코드로 만드는 방법만 다룬다.

## 한눈에

- 그림은 GIF/PNG가 아니라 **브라우저가 그리는 SVG**다. 자동으로 반복 재생되고, 글꼴은 블로그 글꼴이며, 확대해도 선명하다. 움직임 줄이기 설정에서는 마지막 장면만 정지해 보여 준다.
- 모든 그림은 **코드 창 모양의 틀**(신호등 점 + 제목 막대 + 아래 단계 알약과 한 줄 해설) 안에 들어간다. 틀은 런타임(`assets/figures.js`, `assets/figures.css`)이 그린다. 그림 정의는 **틀 안쪽 그림**과 **제목·설명·단계 문구**만 정한다.
- 예시 데이터와 난수 시뮬레이션은 Python이 계산한다(`scripts/figure_data/*.py`). 본문 숫자와 맞는지 `assert`로 확인하고, 결과를 `assets/figures/<이름>-data.js`로 내보낸다. 브라우저는 이 값을 그리기만 한다.
- 예전의 Pillow GIF/PNG 방식(`scripts/search_figures.py`, `perf_figures.py`, `loadgen_figures.py`와 `assets/*-notes/`)은 더 쓰지 않는다. 그림을 새로 만들거나 고칠 때 건드리지 않는다(정리 대상이며, 필요하면 git 기록에서 볼 수 있다).

## 파일

| 파일 | 역할 |
| --- | --- |
| `assets/figures.js` | 런타임: 틀, Canvas(붓), 타임라인 재생, 등록 대기열 |
| `assets/figures.css` | 틀과 단계 알약, 해설 줄 스타일 |
| `assets/figures/<묶음>.js` | 그림 정의들 (`perf.js`, `search-1.js`, `search-2.js`, `loadgen-1.js`, …) |
| `assets/figures/<이름>-data.js` | Python이 만든 예시 데이터 (직접 고치지 않는다) |
| `assets/figures/search-common.js`, `loadgen-common.js` | 묶음끼리 함께 쓰는 도구. `F.search`, `F.loadgen` |
| `scripts/figure_data/<이름>.py` | 예시 데이터 계산 + 본문 숫자 `assert` + 데이터 파일 쓰기 |
| `scripts/figure_bench/` | 그림 점검 도구(`shot.sh`, `fig.html`). Jekyll 서버 없이 파일로 연다 |
| `_writings/*.md` | 그림 자리는 `<div class="fig" data-fig="이름" …>` 이다 (이미 바꿔 놓았다) |

## 그림 정의 한 개

```js
(window.FigureModules = window.FigureModules || []).push(function (F) {
  var K = F.kit, P = K.P, Canvas = K.Canvas, mix = K.mix, ease = K.ease, lerp = K.lerp, hold = K.hold, seg = K.seg, pill = K.pill;

  F.define('percentile', {
    title: '요청 100건을 빠른 순서로',            // 제목 막대의 글. 짧은 명사구
    meta: '막대 하나 = 요청 1건 · 세로: 응답시간(ms)',  // 제목 막대 아래 작은 회색 줄(선택). 읽는 법
    data: 'perf',                                  // F.data.perf 가 준비되면 그린다(선택)
    needs: ['search'],                             // F.search 같은 공통 도구가 준비되면 그린다(선택)
    height: 460,                                   // 그림 높이(논리 px). 폭은 항상 1080
    steps: [['줄 세우기', '요청 100건을 빠른 순서로 세움', 'info'], …],  // [알약 이름, 한 줄 해설, 톤] (선택)
    say: ['한 줄 해설', 'ok'],                      // steps가 없는 그림의 바닥 해설 (선택)
    still: true,                                   // 움직이지 않는 그림. 장면 하나만 둔다
    timeline: function (K, D) {                    // D = F.data[data]
      return [ hold(400, function () { return draw(0); }, { step: 1 }),
               seg(840, function (p) { return draw(ease(p)); }),   // p: 0→1
               hold(1800, function () { return draw(1); }, { step: 2 }) ];
    }
  });
});
```

- **등록 규약**: 파일은 반드시 `(window.FigureModules = window.FigureModules || []).push(function (F) { … })` 로 감싼다. `soft-nav.js`가 글 안의 script를 순서 없이 다시 실행하므로, 어떤 파일이 먼저 실행돼도 되고 두 번 실행돼도 되게 쓴다(전역 변수를 만들지 않는다).
- `hold(ms, fn, {step})`: 한 장면을 ms 동안 보여 준다. `fn()`이 SVG 조각(문자열)을 돌려준다. 한 번만 그린다.
- `seg(ms, fn(p), {step})`: ms 동안 p(0→1)를 넘겨 가며 계속 다시 그린다. 이동·늘어남·옅어짐에 쓴다. 이동에는 `ease(p)`를 쓴다.
- `{step: n}`은 그 장면부터 n번째 단계 알약을 켜고 해설을 바꾼다(1부터). 안 쓰면 앞 장면의 단계가 이어진다.
- 한 바퀴가 끝나면 런타임이 옅어졌다 처음부터 다시 시작한다(그림이 직접 처리하지 않는다).
- 정지 그림: `still: true` + `hold(1, …)` 장면 하나. 제목 막대의 초록 진행선이 나오지 않는다.
- 정말 필요할 때만: `mount(body, ctx, D)`로 DOM을 직접 만든다(`perf.js`의 `same-mean`, `loadgen-common.js`의 `path` 참고). 반환값 `{duration, render(t) → 단계 번호, resize()}`. 평소에는 Canvas로 충분하다.

### 단계 알약과 해설 (`steps`, `say`)

예전 그림 아래의 색 있는 한 줄(`caption`, `① …`)이 여기로 옮겨 온다.

- 알약 이름은 2~6글자 안팎의 짧은 말('줄 세우기', '평균', 'p99'). 해설은 알약 아래 한 줄이고, **명사형으로 끝낸다**('~다/~요'로 끝내지 않는다. 예: '평균보다 빠른 요청이 96건').
- 톤: `info`(먹색, 기본), `ok`(초록, 좋음/해결), `bad`(벽돌색, 나쁨/문제), `warn`(황토, 주의), `muted`(회색).
  - 예전 색 → 톤: GREEN → `ok`, RED → `bad`, ORANGE → `warn`, BLUE·INK → `info`, FAINT·MUTED → `muted`.
- 단계가 하나뿐이거나 정지 그림이면 `steps` 대신 `say: [문장, 톤]`만 쓴다. 해설이 없으면 둘 다 생략한다.
- 예전 그림에서 장면마다 바뀌던 캡션은 대부분 `steps`가 된다. 같은 문구가 반복되면 단계를 합친다. 알약은 5개를 넘기지 않는다.

## Canvas (붓)

좌표는 **폭 1080 기준의 논리 좌표**이고 y는 아래로 커진다. 화면에서는 글 폭(약 630px)에 맞춰 줄어든다(배율 약 0.58). 예전 Python `Canvas`와 거의 같다.

```js
var c = new Canvas();
c.rect(x, y, w, h, { fill, outline, width: 2, r: 12 });
c.text(x, y, '글', size, color, 'bold', 'mm');     // 무게: regular|medium|semibold|bold|mono, 기준: l/m/r + m(가운데)/s(기준선)
c.line([[x0, y0], [x1, y1], …], color, width);
c.dashed([x0, y0], [x1, y1], color, width, dash, gap);
c.circle(x, y, r, { fill, outline, width });
c.poly([[x, y], …], { fill, outline });
c.arc(cx, cy, r, 시작각, 끝각, color, width);        // 도(°), 3시에서 시계 방향
c.raw('<path …/>');                                 // SVG 조각을 그대로
K.tw(문자열, size, 무게)                              // 글자 폭
return c.done();                                    // 장면의 SVG 조각
```

도구: `K.mix(a, b, t)`(색 섞기, t=0이면 a), `K.ease`, `K.lerp`, `K.clamp`, `K.unit`, `K.dot`, `K.fmt`(천 단위 쉼표), `K.pill(c, x, y, 글, 글색, 배경색, size, 'l|m|r')`(폭을 돌려줌), `K.card(c, x, y, w, h, {outline, fill, width, lifted})`, `K.check`, `K.cross`, `K.arrow(c, [x0,y0], [x1,y1], color)`, `K.tile(c, x, y, size, color, kind, fade)`(상품 그림), `K.hold`, `K.seg`.

### 색

`K.P` 안의 색만 쓴다(블로그 종이색·세이지 초록·코드 색에서 가져온 값). 색은 꾸밈이 아니라 **의미**에만 쓴다.

| 이름 | 용도 |
| --- | --- |
| `BG` | 창 안쪽 바탕. 흐려지는 색은 `mix(색, P.BG, 투명도)` |
| `INK` 글/강조, `TEXT` 본문, `MUTED` 보조, `FAINT` 눈금·흐린 글, `GRID` 선·테두리, `SOFT` 비어 있는 칸 | 중립 |
| `BLUE`(+`BLUE_BG`, `BLUE_FILL`) | 주 데이터 (청록빛 파랑) |
| `GREEN`(+`GREEN_BG`) | 좋음·평균·해결 |
| `RED`(+`RED_BG`, `RED_FILL`) | 나쁨·문제 |
| `ORANGE`(+`ORANGE_BG`) | 주의·기준선 |
| `PURPLE`(+`PURPLE_BG`) | 참고·보조 구분 |
| `TEAL`, `AMBER`, `ROSE`, `SKY`, `OLIVE`, `BROWN` | 같은 종류 여럿을 구별할 때(상품 색, 구간 색) |

예전 코드의 `BLUE`, `RED` 같은 이름은 그대로 `P.BLUE`, `P.RED` 로 옮긴다. `rgb('#e05d9a')` 같은 직접 쓴 색은 가장 가까운 위 이름으로 바꾼다(분홍 → `ROSE`, 연파랑 → `SKY`, 연두 → `OLIVE`). 같은 상품·구간은 모든 그림에서 같은 색을 쓴다.

## 그림을 만드는 순서 (예전 Python 그림에서 옮길 때의 방법 포함)

새 그림은 먼저 보여 줄 것(독자의 질문, 변하는 조건, 눈여겨볼 변화, 그 변화에서 알 수 있는 사실)을 정하고 같은 순서로 만든다. 예전 `xxx_gif`/`xxx_png`에서 옮길 때는 아래 1번부터 따른다.

1. 원본 함수(`xxx_gif`, `xxx_png`)와 위쪽 데이터 계산을 읽는다. 필요한 질문·조건·변화·알 수 있는 것은 함수 첫머리 주석에 있다.
2. **계산**은 `scripts/figure_data/<이름>.py` 로 복사한다(원본 스크립트를 import하지 않는다. 원본은 나중에 지운다). 난수는 같은 시드를 쓴다. 맨 아래 `check()`에는 원본 `__main__`의 `assert` 중 이 그림들에 해당하는 것을 옮긴다. `python3 scripts/figure_data/<이름>.py` 를 실행하면 `assert`를 통과한 뒤 데이터 파일이 써진다. 숫자 몇 개뿐인 예시는 JS 안에 그대로 적어도 된다(그 숫자가 본문과 맞는지 주석으로 밝힌다).
3. **그리기**는 JS로 옮긴다.
   - `Canvas(H)` → `new Canvas()`, 높이는 정의의 `height`. 키워드 인자는 옵션 객체로: `fill=…, outline=…, r=…` → `{fill, outline, r}`.
   - PIL 글자 기준 `'lm' 'mm' 'rm' 'rs'` → 같은 문자열 그대로 쓴다.
   - `header(c, 제목, 메타)` → 정의의 `title`, `meta`. 캔버스 안에 제목을 그리지 않는다. **헤더가 있던 위쪽 빈 공간만큼 모든 y를 올려서** 그림이 위에서 20~30px 띄워 시작하고, 마지막 요소 아래 20px에서 끝나게 `height`를 맞춘다.
   - `caption(c, 글, 색, y)` → `steps`/`say` (위 참고). 캔버스 안에 그리지 않는다.
   - `frames = [(draw(…), ms), …]` → 타임라인 `[hold(ms, …), seg(ms, p => draw(…)), …]`. 같은 모양의 프레임이 `for f in range(1, N)`으로 이어지면 하나의 `seg(총 ms, p => draw(ease(p)))` 로 합친다(총 ms = 프레임 수 × 프레임 ms). 정수로 세어 가는 장면(칸이 하나씩 채워짐)은 `p`에서 `Math.floor(p * N)` 처럼 정수를 뽑는다.
   - `save_gif` / `save_png` / 그림 파일 쓰기는 하지 않는다. `still`(움직임 줄이기용 정지 장면)은 런타임이 마지막 장면으로 정한다. **타임라인의 마지막 장면이 본문이 가리키는 완성된 상태**가 되게 한다.
   - `c.d.arc/ellipse/pieslice` 같은 PIL 직접 호출은 `c.arc`, `c.circle`, `c.raw`로 바꾼다.
4. 정지 그림은 `still: true`, `timeline: () => [hold(1, …)]`.
5. 같은 일을 하는 도구(`pill`, `card`, `tile`, `check`, `cross`, `arrow`, `mix`, `ease`, `lerp`, `unit`, `dot`)는 `F.kit`에 이미 있다. 다시 만들지 않는다. 묶음 공통 도구(`F.search`, `F.loadgen`)도 있으면 쓴다.

## 모양 규칙 (기억할 것)

- **글자 크기**: 논리 22~34. 화면에서 약 13~20px이 된다. 22 미만으로 줄이지 않는다. 휴대폰에서는 이 그림이 폭에 맞춰 줄어 글자가 작아지므로, 그림 안에는 식별자·숫자·짧은 이름만 넣고 설명은 본문과 해설 줄에 둔다.
- **여백**: 가장자리에서 40 안쪽, 요소 사이 최소 16, 같은 종류 요소는 같은 간격. 글자·마커·선이 겹치지 않아야 한다.
- **정렬**: 비슷한 요소의 왼쪽 끝/가운데/오른쪽 끝을 맞춘다. 숫자 열은 오른쪽 맞춤.
- **데이터는 파랑 한 가지가 기본**. 초록·벽돌·황토·보라는 의미(좋음·나쁨·주의·참고)에만 쓴다. 색만으로 구별하지 않고 글이나 모양을 함께 쓴다.
- 가리키는 부분은 점선과 옅은 음영으로, 번호 알약(`pill`)은 옅은 배경에 진한 글.
- 그림 안의 글은 명사형으로 쓴다('검색 1번에 1장'). 원본 문구는 그대로 둔다(바꿔야 할 이유가 없으면).
- 실제 측정값과 모식도를 구분한다. 원본이 '예시', '모식도', '계산'이라고 밝힌 그림은 `meta`에 그 말을 그대로 둔다.

## 움직임 규칙

- 한 바퀴 8~13초. 본문이 가리키는 장면(결과, 비교, 바뀐 순서)에서는 1.5~2.5초 멈춰 읽을 시간을 준다. 마지막 장면은 2초 이상 보여 준다.
- 첫 장면은 비어 있거나 처음 상태이고 400~900ms 머문다.
- 이동·늘어남은 `seg` + `ease`. 점프하는 장면에서만 `hold`를 이어 붙인다. 같은 화면을 거듭 그리는 `hold`를 수십 개 만들지 않는다.
- 사용자가 조작해야 하는 장치는 만들지 않는다.
- 장면 함수는 매 호출마다 새로 계산해도 되지만(약 30fps), 무거운 계산(정렬, 순위, 시뮬레이션)은 `timeline()` 시작 부분에서 한 번만 하고 클로저로 쓴다.

## 점검

Jekyll 서버 없이 점검한다. `scripts/figure_bench/shot.sh`가 헤드리스 Chrome으로 `scripts/figure_bench/fig.html`을 파일로 열어 스크린샷을 찍는다(Chrome이 있어야 한다). 새 파일은 저장하는 즉시 반영된다.

```bash
scripts/figure_bench/shot.sh "name=percentile,fanout&t=auto6&w=660" /tmp/out.png 720 3000   # 장면 6장을 위에서 아래로
scripts/figure_bench/shot.sh "name=cosine&t=0,2500,end&w=660" /tmp/out.png 720 2000         # 원하는 시각(ms)에 세운 장면
scripts/figure_bench/shot.sh "name=cosine&t=end&w=327" /tmp/out.png 380 1200               # 휴대폰 폭(글자가 작아지는 것은 정상)
```

- `t`는 장면을 세울 시각(ms), `end`(마지막 장면), `auto6`(처음~끝 6장면; 맨 위에 그림 길이가 `정보:`로 나온다). `name=all`은 정의된 모든 그림.
- 스크린샷은 `Read` 도구로 열어 눈으로 확인한다. 맨 위에 빨간 글자로 오류나 `그려지지 않음`이 나오면 고친다.
- 원본과 비교한다: 원본 정지 이미지(`assets/*-notes/<이름>-still.png` 또는 `<이름>.png`)와 **숫자·문구·상태 변화가 같아야** 한다.
- 확인할 것: 겹치는 글자 없음, 위쪽·아래쪽 쓸데없는 빈 공간 없음, 마지막 장면이 본문 설명과 일치, 단계 알약과 해설이 장면과 맞음, 한 바퀴 길이, 색이 의미에만 쓰임, 콘솔 오류 없음.
- 같은 이름의 그림 정의를 두 번 만들지 않는다. 그림 이름은 글의 `data-fig` 값과 같다.
- 점검 화면은 `fig.html`의 `MODULES` 목록에 있는 묶음 파일을 불러온다. 새 묶음 파일을 만들면 이름을 더한다. 실제 글에서는 `jekyll serve`로 글 페이지를 열어 본다.
- 새 그림은 글에 `<figure class="fig-figure"><div class="fig" data-fig="이름" role="group" aria-label="대체 글"></div><figcaption>…</figcaption></figure>`를 넣고, 그 글에 묶음 파일과 데이터 파일의 `<script src>`를 더한다. `tests/check_site.py`가 모든 `data-fig`에 정의가 있는지 확인한다.

## 건드리지 않는 것

여럿이 나눠 작업할 때의 규칙이다: `assets/figures.js`, `assets/figures.css`, `_layouts/*`, `_writings/*`, `docs/*`, `scripts/figure_bench/*`, 다른 묶음의 파일은 자기 몫이 아니면 건드리지 않는다. 런타임이나 CSS에 필요한 변경이 있으면 직접 고치지 말고 보고서에 적는다.
