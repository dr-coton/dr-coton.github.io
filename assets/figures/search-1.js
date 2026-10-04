/* 상품 검색 글의 앞쪽 그림 여섯 개: keyword, embedding, flow, per-search, dot, cosine.
 * 예시 벡터는 search-data.js (scripts/figure_data/search.py가 계산하고, 본문에 적은 숫자와 맞는지 assert로 확인한다). */
(window.FigureModules = window.FigureModules || []).push(function (F) {
  var K = F.kit, P = K.P, Canvas = K.Canvas, mix = K.mix, ease = K.ease, lerp = K.lerp, hold = K.hold, seg = K.seg, pill = K.pill, card = K.card, tile = K.tile, fmt = K.fmt;
  var BG = P.BG;

  function faded(color, f) { return mix(color, BG, f); }  // f=0이면 본래 색, 1이면 배경색
  function dashedBox(c, x, y, w, h, color) {  // 점선 테두리 상자
    c.raw('<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (w - 2) + '" height="' + (h - 2) + '" rx="11" fill="none" stroke="' + K.css(color) + '" stroke-width="2" stroke-dasharray="10 8"/>');
  }

  /* ---------------------------------------------------------------- 1. 키워드 검색의 한계
   * 질문: 상품명에 검색어 글자가 들어 있는지만 보면 무엇을 놓치는가? 변하는 것: '흰색'과 '운동화'를 차례로 찾고, 결과가 나온 뒤 사진 검색 줄이 붙는다.
   * 알 수 있는 것: 같은 운동화인 '화이트 스니커즈 B'는 글자가 달라 못 찾고, 사진으로 찾기는 아예 할 수 없다. */
  F.define('keyword', {
    title: '키워드 검색',
    meta: '검색어: 흰색 운동화 · 두 단어가 모두 들어간 상품',
    needs: ['search'],
    height: 550,
    steps: [['흰색', '상품명에 ‘흰색’이 들어 있는지 확인', 'info'], ['운동화', '상품명에 ‘운동화’가 들어 있는지 확인', 'info'],
      ['결과', '두 단어가 모두 들어간 상품만 찾음', 'info'], ['사진', '사진을 올려서 찾기는 불가능', 'bad']],
    timeline: function () {
      var BY = F.search.BY_ID, words = ['흰색', '운동화'], cols = [700, 830];
      var order = ['shoe', 'copy', 'other', 'laces'].map(function (id) { return BY[id]; });

      function draw(step, rt, pt) {  // step: 지금까지 확인한 칸 수(0~8), rt: 결과 알약이 나타난 정도, pt: 사진 검색 줄이 나타난 정도
        var c = new Canvas();
        words.forEach(function (w, i) { c.text(cols[i], 40, w, 26, P.FAINT, 'semibold', 'mm'); });
        c.text(1040, 40, '결과', 26, P.FAINT, 'semibold', 'rm');
        order.forEach(function (p, r) {
          var y = 74 + r * 92, found = words.every(function (w) { return p.name.indexOf(w) >= 0; });
          card(c, 40, y, 1000, 76);
          tile(c, 56, y + 14, 48, p.color, p.kind);
          words.forEach(function (w, wi) {
            var at = p.name.indexOf(w);
            if (step > wi * 4 + r && at >= 0) c.rect(124 + c.tw(p.name.slice(0, at), 32, 'semibold') - 4, y + 18, c.tw(w, 32, 'semibold') + 8, 40, { fill: P.BLUE_BG, r: 6 });
          });
          c.text(124, y + 38, p.name, 32, P.INK, 'semibold');
          words.forEach(function (w, wi) {
            if (step > wi * 4 + r) (p.name.indexOf(w) >= 0 ? K.check : K.cross)(c, cols[wi], y + 38, p.name.indexOf(w) >= 0 ? P.GREEN : P.FAINT);
          });
          if (rt) pill(c, 1024, y + 38, found ? '찾음' : '못 찾음', faded(found ? P.GREEN : P.RED, 1 - rt), faded(found ? P.GREEN_BG : P.RED_BG, 1 - rt), 24, 'r');
        });
        if (pt) {
          var y = 454, f = 1 - pt;
          dashedBox(c, 40, y, 1000, 76, faded(P.GRID, f));
          tile(c, 56, y + 14, 48, P.MUTED, 'photo', f);
          c.text(124, y + 38, '사진을 올려서 찾기', 32, faded(P.INK, f), 'semibold');
          pill(c, 1024, y + 38, '검색 불가', faded(P.RED, f), faded(P.RED_BG, f), 24, 'r');
        }
        return c.done();
      }

      return [
        hold(800, function () { return draw(0, 0, 0); }, { step: 1 }),
        seg(1360, function (p) { return draw(1 + Math.min(3, Math.floor(p * 4)), 0, 0); }),  // '흰색' 칸이 위에서 아래로 하나씩
        seg(1360, function (p) { return draw(5 + Math.min(3, Math.floor(p * 4)), 0, 0); }, { step: 2 }),  // '운동화' 칸
        seg(300, function (p) { return draw(8, ease(p), 0); }, { step: 3 }),
        hold(2200, function () { return draw(8, 1, 0); }),
        seg(300, function (p) { return draw(8, 1, ease(p)); }, { step: 4 }),
        hold(2400, function () { return draw(8, 1, 1); })
      ];
    }
  });

  /* ---------------------------------------------------------------- 2. 사진을 숫자 목록으로
   * 질문: 이미지 모델은 사진을 무엇으로 바꾸는가? 변하는 것: 사진 세 장이 차례로 모델을 지나 숫자 6개가 된 뒤 두 쌍을 비교한다.
   * 알 수 있는 것: 같은 운동화의 두 사진은 목록이 거의 같아(0.99) 유사도가 높고, 신발끈은 많이 달라(0.59) 낮다. 숫자는 search-data.js(search.py)가 계산하고 본문과 맞는지 확인한다. */
  F.define('embedding', {
    title: '사진 → 숫자 목록',
    meta: '예시 값 · 실제로는 숫자가 수백 개',
    data: 'search',
    height: 555,
    steps: [['운동화 A', '운동화 A 사진이 모델을 거쳐 숫자 6개가 됨', 'info'], ['다른 각도', '같은 운동화의 다른 각도 사진도 숫자 6개', 'info'],
      ['신발끈', '신발끈 사진도 숫자 6개', 'info'], ['비슷함', '같은 운동화의 두 목록은 거의 같음', 'ok'], ['다름', '운동화와 신발끈의 목록은 많이 다름', 'bad']],
    timeline: function (K, D) {
      var E = D.embedding, vectors = E.vectors;
      var photos = [['운동화 A', P.BLUE, 'shoe'], ['운동화 A (다른 각도)', P.BLUE, 'shoe-flip'], ['신발끈', P.AMBER, 'laces']];
      var rowY = [80, 230, 380], box = [330, 160, 180, 140];

      function cellColor(v) { return v >= 0 ? mix(BG, P.BLUE, v * .85) : mix(BG, P.ORANGE, -v * .85); }  // 양수는 파랑, 음수는 황토

      function draw(flying, filled, compare) {  // flying: [[사진 번호, 0~1]], filled: 사진마다 채워진 칸 수, compare: 0 없음 · 1 비슷함 · 2 다름
        var c = new Canvas();
        card(c, box[0], box[1], box[2], box[3]);
        c.text(box[0] + 90, box[1] + 56, '이미지', 28, P.INK, 'bold', 'mm');
        c.text(box[0] + 90, box[1] + 92, '모델', 28, P.INK, 'bold', 'mm');
        photos.forEach(function (ph, i) {
          var y = rowY[i];
          tile(c, 90, y - 50, 100, ph[1], ph[2]);
          c.text(140, y + 70, ph[0], 24, P.MUTED, 'medium', 'mm');
          for (var k = 0; k < filled[i]; k++) {
            var x = 570 + k * 78;
            c.rect(x, y - 30, 70, 60, { fill: cellColor(vectors[i][k]), r: 8 });
            c.text(x + 35, y, vectors[i][k].toFixed(2), 24, P.INK, 'semibold', 'mm');
          }
        });
        flying.forEach(function (fl) {
          var i = fl[0], t = fl[1], k = ease(t), ph = photos[i];
          tile(c, lerp(90, box[0] + 70, k), lerp(rowY[i] - 50, box[1] + 50, k), lerp(100, 40, k), ph[1], ph[2], Math.max(0, t * 2 - 1));
        });
        if (compare) {
          var pair = compare === 1 ? [0, 1] : [0, 2], color = compare === 1 ? P.GREEN : P.RED;
          pair.forEach(function (i) { c.rect(562, rowY[i] - 38, 476, 76, { outline: color, width: 3, r: 12 }); });
          pill(c, 540, 510, compare === 1 ? '운동화 A ↔ 다른 각도   유사도 ' + E.near.toFixed(2) : '운동화 A ↔ 신발끈   유사도 ' + E.far.toFixed(2),
            color, compare === 1 ? P.GREEN_BG : P.RED_BG, 26, 'm');
        }
        return c.done();
      }

      var segs = [hold(700, function () { return draw([], [0, 0, 0], 0); }, { step: 1 })];
      [0, 1, 2].forEach(function (i) {
        var before = [0, 0, 0].map(function (_, j) { return j < i ? 6 : 0; }), after = before.slice();
        after[i] = 6;
        segs.push(seg(500, function (p) { return draw([[i, p]], before, 0); }, { step: i + 1 }));  // 사진이 모델로 들어감
        segs.push(seg(500, function (p) { var n = before.slice(); n[i] = Math.min(6, Math.floor(p * 6) + 1); return draw([], n, 0); }));  // 숫자가 하나씩 채워짐
        segs.push(hold(300, function () { return draw([], after, 0); }));
      });
      segs.push(hold(2000, function () { return draw([], [6, 6, 6], 1); }, { step: 4 }));
      segs.push(hold(2400, function () { return draw([], [6, 6, 6], 2); }, { step: 5 }));
      return segs;
    }
  });

  /* ---------------------------------------------------------------- 3. 등록과 검색의 흐름 (모식도)
   * 질문: 이미지 모델은 언제, 몇 장을 처리하는가? 변하는 것: 등록 때 사진 8장이 모두 벡터가 되어 표에 저장되고, 검색 #1·#2에서는 사진 한 장만 벡터가 되어 저장된 벡터와 비교된다.
   * 알 수 있는 것: 모델을 거치는 사진은 등록 때만 여러 장이고, 검색할 때는 매번 한 장이다. 벡터는 search-data.js(search.py, 시드 7). */
  F.define('flow', {
    title: '등록할 때와 검색할 때의 흐름',
    meta: '모식도 · 예시 벡터로 계산',
    data: 'search',
    height: 684,
    steps: [['상품 등록', '상품 사진 여덟 장을 모두 벡터로 바꿔 저장 · 한 번만', 'info'], ['검색 #1', '검색 사진 한 장만 모델을 거쳐 저장된 벡터와 비교', 'info'],
      ['검색 #2', '검색이 반복돼도 모델을 거치는 사진은 한 장', 'ok']],
    timeline: function (K, D) {
      var V = D.flow.vectors, Q = D.flow.queries, i;
      var colors = [P.AMBER, P.BLUE, P.TEAL, P.PURPLE, P.ROSE, P.SKY, P.OLIVE, P.BROWN];
      var grid = [], rowY = [];
      for (i = 0; i < 8; i++) { grid.push([40 + (i % 4) * 76, 170 + Math.floor(i / 4) * 76]); rowY.push(150 + i * 62); }
      var boxTop = [380, 160, 200, 120], boxBottom = [380, 490, 200, 120], tableX = 660;

      function strip(c, x, y, v, fade, cell) {  // 벡터 하나: 숫자 6개를 칸 6개로
        cell = cell || 30;
        v.forEach(function (value, k) { c.rect(x + k * (cell + 4), y, cell, 30, { fill: faded(mix(P.BLUE_FILL, P.BLUE, (value + 1) / 2 * .9), fade || 0), r: 5 }); });
      }

      function base(c, filled, dT, dB, no, gpuOn, cpuOn) {  // dT, dB: 위쪽(등록)·아래쪽(검색) 영역이 흐려진 정도
        pill(c, 40, 56, '① 상품 등록', faded(P.PURPLE, dT), faded(P.PURPLE_BG, dT));
        c.text(40, 116, '사진 전체를 한 번', 26, faded(P.MUTED, dT));
        var w = pill(c, 40, 386, '② 검색 요청', faded(P.BLUE, dB), faded(P.BLUE_BG, dB));
        c.text(40, 446, '사진 한 장을 검색마다', 26, faded(P.MUTED, dB));
        if (no) c.text(40 + w + 20, 386, '#' + no, 28, P.FAINT, 'semibold');
        grid.forEach(function (g, k) { tile(c, g[0], g[1], 64, colors[k], 'photo', dT); });
        [[boxTop, 'GPU', gpuOn, dT], [boxBottom, 'CPU', cpuOn, dB]].forEach(function (b) {
          var r = b[0], on = b[2], d = b[3];
          c.rect(r[0], r[1], r[2], r[3], { fill: BG, outline: faded(on ? P.BLUE : P.GRID, d), width: on ? 3 : 2, r: 12 });
          c.text(r[0] + r[2] / 2, r[1] + 42, '이미지 모델', 28, faded(P.INK, d), 'bold', 'mm');
          pill(c, r[0] + r[2] / 2, r[1] + 86, b[1], faded(P.TEXT, d), faded(P.SOFT, d), 22, 'm');
        });
        card(c, tableX, 60, 380, 600);
        c.text(tableX + 24, 104, 'products', 28, P.TEXT, 'mono');
        rowY.forEach(function (y, k) {
          tile(c, tableX + 18, y, 44, colors[k], 'photo');
          if (filled[k]) strip(c, tableX + 76, y + 7, V[k]);
          else c.rect(tableX + 76, y + 7, 200, 30, { outline: P.GRID, r: 5 });
        });
      }

      function reg(f) {  // 상품 등록: 0~29 (사진 한 장이 2씩 늦게 출발한다)
        var c = new Canvas(), filled = {}, busy = false, k, t;
        for (k = 0; k < 8; k++) {
          if (f >= k * 2 + 15) filled[k] = true;
          if (f >= k * 2 + 6 && f < k * 2 + 9) busy = true;
        }
        base(c, filled, 0, .6, 0, busy, false);
        for (k = 0; k < 8; k++) {
          t = (f - k * 2) / 7;
          if (t >= 0 && t < 1) tile(c, lerp(grid[k][0], boxTop[0] - 40, ease(t)), lerp(grid[k][1], boxTop[1] + 44, ease(t)), lerp(64, 34, ease(t)), colors[k], 'photo', Math.max(0, t * 2 - 1));
          t = (f - k * 2 - 7) / 8;
          if (t >= 0 && t < 1) strip(c, lerp(boxTop[0] + boxTop[2] + 6, tableX + 76, ease(t)), lerp(boxTop[1] + 45, rowY[k] + 7, ease(t)), V[k]);
        }
        return c.done();
      }

      function qry(n, f, e) {  // 검색 요청 #n: 0~23. e: 위쪽이 흐려지고 아래쪽이 또렷해진 정도(0~1)
        var q = Q[n - 1], c = new Canvas(), all = {}, k, t, y;
        for (k = 0; k < 8; k++) all[k] = true;
        base(c, all, .6 * e, .6 * (1 - e), n, false, f >= 3 && f < 12);
        if (f < 3) tile(c, 40, 520, 64, colors[q.source], 'photo', 1 - f / 3);
        else if (f < 9) {
          t = (f - 3) / 6;
          tile(c, lerp(40, boxBottom[0] - 40, ease(t)), lerp(520, boxBottom[1] + 44, ease(t)), lerp(64, 34, ease(t)), colors[q.source], 'photo', Math.max(0, t * 2 - 1));
        }
        var qx = boxBottom[0] - 4, qy = 632;
        if (f >= 9) strip(c, qx, qy, q.v, Math.max(0, 1 - (f - 9) / 3), 29);
        if (f >= 12) {
          t = ease((f - 12) / 5);
          rowY.forEach(function (ry) { c.line([[qx + 208, qy + 15], [lerp(qx + 208, tableX, t), lerp(qy + 15, ry + 22, t)]], P.GRID, 2); });
        }
        if (f >= 17) {
          var fade = Math.max(0, 1 - (f - 17) / 3);
          rowY.forEach(function (ry, i) {
            var hit = q.top.indexOf(i) >= 0;
            if (hit) c.rect(tableX + 8, ry - 6, 364, 56, { outline: faded(P.BLUE, fade), width: 3, r: 10 });
            c.text(tableX + 364, ry + 22, q.sims[i].toFixed(2), 26, faded(hit ? P.BLUE : P.FAINT, fade), hit ? 'bold' : 'medium', 'rm');
          });
        }
        return c.done();
      }

      return [
        hold(500, function () { return reg(0); }, { step: 1 }),
        seg(2320, function (p) { return reg(p * 29); }),
        hold(1200, function () { return reg(29); }),
        seg(1840, function (p) { return qry(1, p * 23, ease(p * 23 / 3)); }, { step: 2 }),
        hold(1600, function () { return qry(1, 23, 1); }),
        seg(1840, function (p) { return qry(2, p * 23, 1); }, { step: 3 }),
        hold(1600, function () { return qry(2, 23, 1); })
      ];
    }
  });

  /* ---------------------------------------------------------------- 4. 검색 1번에 모델이 처리하는 사진 수
   * 질문: 사진을 미리 바꿔 두면 검색 1번의 일이 얼마나 줄어드는가? 변하는 것: 상품 수가 0에서 10만으로 늘어나는 동안 두 방식의 사진 수가 그려진다.
   * 알 수 있는 것: 검색마다 전부 바꾸면 상품 수만큼(10만 개면 100,000장) 늘고, 미리 바꿔 두면 몇 개든 1장이다. 측정값이 아니라 정의상의 개수다. */
  F.define('per-search', {
    title: '검색 1번에 모델이 처리하는 사진 수',
    meta: '세로: 사진 수 · 가로: 상품 수',
    height: 474,
    steps: [['전부 바꾸기', '검색마다 전부 바꾸면 사진 수가 상품 수만큼 늘어남', 'bad'], ['미리 바꾸기', '미리 바꿔 두면 상품 수와 상관없이 검색 1번에 1장', 'ok']],
    timeline: function () {
      var x0 = 120, x1 = 1010, y0 = 92, y1 = 412, top = 100000;
      function px(n) { return lerp(x0, x1, n / top); }
      function py(n) { return lerp(y1, y0, n / top); }

      function draw(t) {
        var c = new Canvas(), i, n;
        var w = pill(c, 40, 38, '검색마다 전부 바꾸기', P.RED, P.RED_BG, 24);
        pill(c, 40 + w + 18, 38, '미리 바꿔 두기', P.BLUE, P.BLUE_BG, 24);
        for (i = 0; i < 5; i++) {
          n = top * i / 4;
          c.line([[x0, py(n)], [x1, py(n)]], P.GRID, 2);
          c.text(x0 - 14, py(n), n ? String(n / 10000) + '만' : '0', 24, P.FAINT, 'medium', 'rm');
          c.text(px(n), y1 + 30, n ? String(n / 10000) + '만' : '0', 24, P.FAINT, 'medium', 'mm');
        }
        n = top * t;
        if (n) {
          c.poly([[x0, y1], [px(n), py(n)], [px(n), y1]], { fill: P.RED_FILL });
          c.line([[x0, y1], [px(n), py(n)]], P.RED, 4);
          c.circle(px(n), py(n), 8, { fill: P.RED });
          var show = Math.min(1, Math.max(0, (n - 14000) / 6000));  // 두 선의 끝이 서로 떨어진 뒤에 이름표를 보여 준다
          if (show) c.text(px(n) - 16, py(n) - 6, fmt(n) + '장', 28, faded(P.RED, 1 - show), 'bold', 'rs');
          c.line([[x0, py(1)], [px(n), py(1)]], P.BLUE, 5);
          c.circle(px(n), py(1), 8, { fill: P.BLUE });
          if (show) c.text(px(n) - 4, py(1) - 22, '1장', 28, faded(P.BLUE, 1 - show), 'bold', 'rs');
        }
        return c.done();
      }

      return [
        hold(700, function () { return draw(0); }, { step: 1 }),
        seg(4300, function (p) { return draw(ease(p)); }),
        hold(3200, function () { return draw(1); }, { step: 2 })
      ];
    }
  });

  /* ---------------------------------------------------------------- 5. 내적: 같은 자리끼리 곱해서 더하기
   * 질문: 숫자가 여러 개인 두 벡터의 유사도는 어떻게 계산하는가? 변하는 것: 자리마다 곱이 채워지며 합이 쌓인다.
   * 알 수 있는 것: 벡터 길이가 1이면 이 합(0.98)이 곧 코사인 유사도다. 숫자는 search-data.js(search.py)가 계산하고 본문의 여섯 곱·합과 맞는지 확인한다. */
  F.define('dot', {
    title: '같은 자리끼리 곱해서 더하기',
    meta: '예시 벡터 · 숫자 6개',
    data: 'search',
    height: 350,
    steps: [['곱하기', '같은 자리끼리 곱해서 차례로 더함', 'info'], ['합', '벡터 길이가 1이면 이 합이 곧 코사인 유사도', 'ok']],
    timeline: function (K, D) {
      var q = D.dot.q, p = D.dot.p, prod = D.dot.products, cw = 94;
      var xs = [0, 1, 2, 3, 4, 5].map(function (k) { return 170 + k * 106; });
      var rows = [['검색 벡터', q, 68], ['상품 벡터', p, 154], ['곱한 값', null, 298]];

      function draw(done, active, final) {  // done: 곱이 채워진 칸 수, active: 지금 곱하는 자리(없으면 null)
        var c = new Canvas();
        rows.forEach(function (row) {
          var y = row[2];
          c.text(40, y, row[0], 26, P.MUTED, 'semibold');
          xs.forEach(function (x, k) {
            if (row[1]) {
              c.rect(x, y - 32, cw, 64, { fill: P.SOFT, r: 10 });
              c.text(x + cw / 2, y, row[1][k].toFixed(2), 28, P.INK, 'semibold', 'mm');
            } else if (k < done) {
              c.rect(x, y - 32, cw, 64, { fill: P.BLUE_FILL, outline: P.BLUE_BG, r: 10 });
              c.text(x + cw / 2, y, prod[k].toFixed(2), 28, P.BLUE, 'bold', 'mm');
            } else c.rect(x, y - 32, cw, 64, { outline: P.GRID, r: 10 });
          });
        });
        if (active != null) {
          c.rect(xs[active] - 6, 28, cw + 12, 168, { outline: P.BLUE, width: 3, r: 14 });
          c.text(xs[active] + cw / 2, 228, '×', 30, P.BLUE, 'bold', 'mm');
        }
        c.text(950, 228, '합', 26, P.MUTED, 'semibold', 'mm');
        c.rect(860, 266, 180, 64, { fill: final ? P.GREEN_BG : BG, outline: final ? P.GREEN : P.GRID, width: final ? 3 : 2, r: 10 });
        c.text(950, 298, prod.slice(0, done).reduce(function (s, x) { return s + x; }, 0).toFixed(2), 32, final ? P.GREEN : P.INK, 'bold', 'mm');
        return c.done();
      }

      return [
        hold(800, function () { return draw(0, null, false); }, { step: 1 }),
        seg(4800, function (p) {  // 자리마다 0.8초: 앞 0.38초는 곱하는 중, 뒤는 곱한 값이 채워진 상태
          var k = Math.min(5, Math.floor(p * 6)), within = p * 6 - k;
          return draw(k + (within >= .475 ? 1 : 0), k, false);
        }),
        hold(2600, function () { return draw(6, null, true); }, { step: 2 })
      ];
    }
  });

  /* ---------------------------------------------------------------- 6. 코사인 유사도
   * 질문: 두 벡터가 가까운지는 어떻게 재는가? 변하는 것: 검색 벡터(검은 화살표)가 15°에서 165°로 돌아가며 P, Q, R과의 코사인 유사도 순서가 바뀐다.
   * 알 수 있는 것: 50°(P와 Q의 한가운데)를 넘으면 Q가 P를 앞서고, 115°(Q와 R의 한가운데)를 넘으면 R이 Q를 앞선다. 숫자 2개짜리 예시이고 계산은 cos(각도 차)다. */
  F.define('cosine', {
    title: '각도로 재는 유사도',
    meta: '숫자 2개짜리 예시 벡터',
    height: 420,
    steps: [['시작', '검색 15° · P가 가장 가까움', 'info'], ['50°', 'P·Q의 한가운데 50°를 넘으면 Q가 P를 앞섬', 'info'], ['115°', 'Q·R의 한가운데 115°를 넘으면 R이 Q를 앞섬', 'info']],
    timeline: function () {
      var ox = 300, oy = 330, radius = 250, EPS = .06;
      var points = [['P', 20, P.BLUE], ['Q', 80, P.PURPLE], ['R', 150, P.TEAL]], slot0 = 120, pitch = 110;
      function rad(deg) { return deg * Math.PI / 180; }
      function sim(angle, deg) { return Math.cos(rad(angle - deg)); }

      function draw(angle) {
        var c = new Canvas(), sims = points.map(function (pt) { return sim(angle, pt[1]); });
        c.arc(ox, oy, radius, 180, 360, P.GRID, 2);
        c.line([[30, oy], [570, oy]], P.GRID, 2);
        [50, 115].forEach(function (deg) {  // 두 벡터 사이의 가운데: 여기서 순서가 바뀐다
          var r = rad(deg), passed = angle >= deg;
          c.dashed([ox, oy], [ox + Math.cos(r) * radius, oy - Math.sin(r) * radius], passed ? P.FAINT : P.GRID, 2);
          c.text(ox + Math.cos(r) * (radius + 26), oy - Math.sin(r) * (radius + 26), deg + '°', 22, passed ? P.INK : P.FAINT, passed ? 'bold' : 'medium', 'mm');
        });
        points.forEach(function (pt) {
          var r = rad(pt[1]), x = ox + Math.cos(r) * radius, y = oy - Math.sin(r) * radius;
          c.line([[ox, oy], [x, y]], pt[2], 4);
          c.circle(x, y, 9, { fill: pt[2] });
          c.text(ox + Math.cos(r) * (radius + 36), oy - Math.sin(r) * (radius + 36), pt[0], 34, pt[2], 'bold', 'mm');
        });
        var a = rad(angle), tip = [ox + Math.cos(a) * 190, oy - Math.sin(a) * 190];
        c.line([[ox, oy], tip], P.INK, 7);
        c.circle(ox, oy, 6, { fill: P.INK });
        pill(c, tip[0], tip[1], '검색', BG, P.INK, 24, 'm');  // 검색 벡터의 끝에 이름표를 붙여 다른 선과 겹치지 않게 한다

        c.text(630, 42, '유사도 순서', 26, P.FAINT, 'semibold');
        points.forEach(function (pt, j) {
          var pos = 0, rank = 1;  // pos: 부드럽게 바뀌는 자리, rank: 보이는 순위
          sims.forEach(function (s, k) { if (k !== j) { pos += ease((s - sims[j]) / (2 * EPS) + .5); if (s > sims[j]) rank++; } });
          var y = slot0 + pos * pitch;
          card(c, 630, y - 44, 410, 88);
          c.text(664, y, String(rank), 30, P.FAINT, 'bold', 'mm');
          c.circle(704, y, 11, { fill: pt[2] });
          c.text(728, y, pt[0], 30, P.INK, 'bold');
          c.rect(778, y - 9, 140, 18, { fill: P.SOFT, r: 9 });
          c.rect(778, y - 9, Math.max(4, 140 * Math.max(0, sims[j])), 18, { fill: pt[2], r: 9 });
          c.text(1024, y, sims[j].toFixed(3), 28, P.INK, 'semibold', 'rm');
        });
        c.text(40, 380, '검색 방향', 26, P.FAINT, 'semibold');
        c.text(160, 380, Math.round(angle) + '°', 28, P.INK, 'bold');
        return c.done();
      }

      function sweep(from, to, ms, cross, step) {  // from→to를 ease로 한 번에 돌리되, cross도를 지나는 순간부터 step 알약을 켠다
        var lo = 0, hi = 1, u;
        for (var i = 0; i < 30; i++) { u = (lo + hi) / 2; if (lerp(from, to, ease(u)) < cross) lo = u; else hi = u; }
        return [seg(ms * u, function (p) { return draw(lerp(from, to, ease(p * u))); }),
          seg(ms * (1 - u), function (p) { return draw(lerp(from, to, ease(u + p * (1 - u)))); }, { step: step })];
      }

      return [hold(700, function () { return draw(15); }, { step: 1 })]
        .concat(sweep(15, 58, 1500, 50, 2))
        .concat([hold(1700, function () { return draw(58); })])
        .concat(sweep(58, 123, 1500, 115, 3))
        .concat([hold(1900, function () { return draw(123); }),
          seg(1100, function (p) { return draw(lerp(123, 165, ease(p))); }),
          hold(1800, function () { return draw(165); })]);
    }
  });
});
