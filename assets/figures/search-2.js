/* 상품 검색 글(image-and-text-search)의 뒤쪽 그림 10개: pgvector, candidates, score, ranking, funnel, text-space, word-boundary, jaccard, cost, debug.
 * 예시 상품과 순위 규칙은 search-common.js(F.search), 비용·점 위치는 search2-data.js(scripts/figure_data/search2.py가 만든다). */
(window.FigureModules = window.FigureModules || []).push(function (F) {
  var K = F.kit, P = K.P, Canvas = K.Canvas, mix = K.mix, ease = K.ease, lerp = K.lerp, clamp = K.clamp, hold = K.hold, seg = K.seg,
      pill = K.pill, card = K.card, tile = K.tile, arrow = K.arrow, cross = K.cross;

  function money(x) { return '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  /* ---------------------------------------------------------------- 1. ORDER BY 거리 LIMIT 3
   * 질문: 가까운 상품을 어떻게 가져오는가? 변하는 것: 거리가 하나씩 채워지고, 거리 순으로 다시 서고, LIMIT 선 아래가 흐려진다.
   * 알 수 있는 것: 같은 사진인 A와 A 복제는 거리가 같고, 앞의 3개만 다음 단계로 간다. 거리는 예시 값(본문: A·A 복제 0.03, 스니커즈 B 0.12). */
  F.define('pgvector', {
    title: '가까운 순서로 3개 가져오기',
    meta: 'ORDER BY 거리 LIMIT 3',
    height: 800,
    steps: [['거리 계산', '거리가 작을수록 가까운 상품', 'info'], ['정렬', '같은 사진인 A와 A 복제는 같은 거리', 'info'],
      ['LIMIT 3', 'LIMIT 선 아래 5개는 다음 단계로 못 감', 'warn']],
    timeline: function () {
      var items = [['머그컵 E', P.FAINT, 'mug', .81], ['운동화 A', P.BLUE, 'shoe', .03], ['샌들 C', P.FAINT, 'shoe', .34], ['신발끈', P.AMBER, 'laces', .21],
        ['A 복제', P.BLUE, 'shoe', .03], ['모자 F', P.FAINT, 'cap', .62], ['스니커즈 B', P.TEAL, 'shoe', .12], ['슬리퍼 D', P.FAINT, 'shoe', .38]]
        .map(function (a) { return { name: a[0], color: a[1], kind: a[2], dist: a[3] }; });
      var slot = items.map(function (_, i) { return 62 + i * 84; });
      var byDist = items.slice().sort(function (a, b) { return a.dist - b.dist; }), top3 = byDist.slice(0, 3);
      var start = {}, end = {};
      items.forEach(function (it, i) { start[it.name] = slot[i]; });
      byDist.forEach(function (it, i) { end[it.name] = slot[i]; });

      function draw(ys, shown, limitT, fadeAll) {
        var c = new Canvas();
        c.text(124, 34, '상품', 24, P.FAINT, 'semibold');
        c.text(820, 34, '거리', 24, P.FAINT, 'semibold', 'rm');
        c.text(1010, 34, '유사도', 24, P.FAINT, 'semibold', 'rm');
        items.forEach(function (it, idx) {
          var hit = limitT > 0 && top3.indexOf(it) >= 0;
          var y = ys[it.name] + (hit || !limitT ? 0 : 56 * ease(limitT));  // 잘린 아래쪽을 띄운다
          var fade = Math.max(limitT && !hit ? .55 * limitT : 0, fadeAll);
          card(c, 40, y, 1000, 72, { outline: hit ? mix(P.GRID, P.BLUE, limitT) : P.GRID, fill: hit ? mix(P.BG, P.BLUE_FILL, limitT) : P.BG, width: hit ? 3 : 2 });
          tile(c, 56, y + 12, 48, it.color, it.kind, fade);
          c.text(124, y + 36, it.name, 30, mix(P.INK, P.BG, fade), 'semibold');
          if (idx < shown) {
            c.text(820, y + 36, it.dist.toFixed(2), 30, mix(P.INK, P.BG, fade), 'bold', 'rm');
            c.text(1010, y + 36, (1 - it.dist).toFixed(2), 30, mix(P.MUTED, P.BG, fade), 'medium', 'rm');
          } else c.text(820, y + 36, '—', 30, P.GRID, 'medium', 'rm');
        });
        if (limitT) {
          var cut = slot[3] + 22, vis = 1 - limitT;
          c.dashed([40, cut], [1040, cut], mix(P.BLUE, P.BG, vis), 2);
          pill(c, 540, cut, 'LIMIT 3: 이 3개만 다음 단계로', mix(P.BLUE, P.BG, vis), mix(P.BLUE_BG, P.BG, vis), 24, 'm');
        }
        return c.done();
      }

      return [
        hold(600, function () { return draw(start, 0, 0, 0); }, { step: 1 }),
        seg(1600, function (p) { return draw(start, Math.min(8, Math.floor(p * 8) + 1), 0, 0); }),
        hold(900, function () { return draw(start, 8, 0, 0); }),
        seg(900, function (p) {  // 정렬: 흐려지며 거리 순서로 자리를 옮긴다
          var k = ease(clamp((p - .15) / .7)), ys = {};
          items.forEach(function (it) { ys[it.name] = lerp(start[it.name], end[it.name], k); });
          return draw(ys, 8, 0, .85 * Math.sin(Math.PI * p));
        }, { step: 2 }),
        hold(1500, function () { return draw(end, 8, 0, 0); }),
        seg(700, function (p) { return draw(end, 8, p, 0); }, { step: 3 }),
        hold(2500, function () { return draw(end, 8, 1, 0); })
      ];
    }
  });

  /* ---------------------------------------------------------------- 2. 두 가지 방법으로 후보 모으기
   * 질문: 벡터만으로 후보를 모으면 충분한가? 변하는 것: 벡터 상위 2개가 후보로 가고, B가 빠진 것을 보이고, 단어로 찾은 3개를 더해 합친다.
   * 알 수 있는 것: 스니커즈 B는 벡터만으로는 빠지고, 양쪽에서 찾은 운동화 A는 한 번만 들어간다. */
  F.define('candidates', {
    title: '검색어: 흰색 운동화',
    meta: '유사도 · 단어 일치',
    needs: ['search'],
    height: 722,
    steps: [['벡터', '벡터로 찾기: 유사도 상위 2개', 'info'], ['누락', '벡터만 쓰면 스니커즈 B 누락', 'bad'],
      ['단어', '단어로 찾기: 두 단어가 모두 맞는 상품', 'info'], ['합치기', '합치기: 양쪽에 있는 운동화 A는 하나로', 'ok']],
    timeline: function () {
      var PR = F.search.PRODUCTS, BY = F.search.BY_ID;
      var cols = [40, 385, 730], CW = 310, TOP = 82, PITCH = 112, LEX = 382;
      var SRC = { '벡터': P.BLUE, '단어': P.PURPLE, '양쪽': P.GREEN };
      var vectorIds = PR.slice().sort(function (a, b) { return b.similarity - a.similarity; }).slice(0, 2).map(function (p) { return p.id; });
      var lexicalIds = PR.filter(function (p) { return p.coverage === 1; }).map(function (p) { return p.id; });
      var unionIds = vectorIds.concat(lexicalIds.filter(function (id) { return vectorIds.indexOf(id) < 0; }));
      var productY = {}, vectorY = {}, lexicalY = {}, unionY = {};
      PR.forEach(function (p, i) { productY[p.id] = TOP + i * PITCH; });
      vectorIds.forEach(function (id, i) { vectorY[id] = TOP + i * PITCH; });
      lexicalIds.forEach(function (id, i) { lexicalY[id] = LEX + i * PITCH; });
      unionIds.forEach(function (id, i) { unionY[id] = TOP + i * PITCH; });
      var DETAIL_V = {}, DETAIL_ALL = {};
      vectorIds.forEach(function (id) { DETAIL_V[id] = '벡터'; });
      unionIds.forEach(function (id) { DETAIL_ALL[id] = vectorIds.indexOf(id) >= 0 && lexicalIds.indexOf(id) >= 0 ? '양쪽' : vectorIds.indexOf(id) >= 0 ? '벡터' : '단어'; });
      function simText(id) { return '유사도 ' + BY[id].similarity.toFixed(3); }
      function lexText(id) { return '단어 ' + Math.round(BY[id].coverage * 2) + '/2'; }

      function chip(c, x, y, p, detail, o) {  // o: {fade, outline, detailColor, lifted}
        o = o || {};
        var fade = o.fade || 0;
        card(c, x, y, CW, 96, { outline: mix(o.outline || P.GRID, P.BG, fade), width: o.outline ? 3 : 2, lifted: o.lifted && fade < .5 });
        tile(c, x + 14, y + 18, 60, p.color, p.kind, fade);
        c.text(x + 90, y + 34, p.short, 30, mix(P.INK, P.BG, fade), 'bold');
        c.text(x + 90, y + 70, detail, 24, mix(SRC[detail] || o.detailColor || P.MUTED, P.BG, fade), 'semibold');
      }
      // moves: [상품, 시작 [x,y], 끝 [x,y], t(0~1), 글, 옅어짐]. settled: [종류, 상품, 옅어짐]. o: {missing, highlight, hlColor, unionDetail}
      function frame(moves, settled, o) {
        o = o || {};
        var c = new Canvas();
        c.text(cols[0], 40, '상품', 24, P.FAINT, 'semibold');
        pill(c, cols[1], 40, '벡터로 찾기 · 상위 2개', P.BLUE, P.BLUE_BG, 22);
        pill(c, cols[1], 344, '단어로 찾기 · 2/2 일치', P.PURPLE, P.PURPLE_BG, 22);
        pill(c, cols[2], 40, '합친 후보', P.GREEN, P.GREEN_BG, 22);
        PR.forEach(function (p) {
          var missing = o.missing && p.id === 'other', hl = (o.highlight || []).indexOf(p.id) >= 0;
          chip(c, cols[0], productY[p.id], p, missing ? '후보에 없음' : p.similarity.toFixed(3) + ' · ' + Math.round(p.coverage * 2) + '/2',
            { outline: missing ? P.RED : hl ? o.hlColor : null, detailColor: missing ? P.RED : P.MUTED });
        });
        settled.forEach(function (s) {
          var p = BY[s[1]];
          if (s[0] === 'vector') chip(c, cols[1], vectorY[s[1]], p, simText(s[1]), { fade: s[2] });
          else if (s[0] === 'lexical') chip(c, cols[1], lexicalY[s[1]], p, lexText(s[1]), { fade: s[2] });
          else chip(c, cols[2], unionY[s[1]], p, (o.unionDetail || {})[s[1]] || '', { fade: s[2] });
        });
        moves.forEach(function (m) {
          var k = ease(m[3]);
          chip(c, lerp(m[1][0], m[2][0], k), lerp(m[1][1], m[2][1], k), BY[m[0]], m[4], { fade: m[5], lifted: m[3] > 0 && m[3] < 1 });
        });
        return c.done();
      }
      function staggered(ids, f, make) {  // 칸마다 2프레임씩 늦게 출발하는 이동
        var out = [];
        ids.forEach(function (id, i) { if (f - i * 2 >= 0) out.push(make(id, clamp((f - i * 2) / 10), i)); });
        return out;
      }
      var vectorSettled = vectorIds.map(function (id) { return ['vector', id, 0]; });
      var lexicalSettled = lexicalIds.map(function (id) { return ['lexical', id, 0]; });
      var unionV = vectorIds.map(function (id) { return ['union', id, 0]; });
      var both = vectorIds.filter(function (id) { return lexicalIds.indexOf(id) >= 0; });
      var finalSettled = vectorSettled.concat(lexicalSettled, unionIds.map(function (id) { return ['union', id, 0]; }));

      return [
        hold(900, function () { return frame([], []); }, { step: 1 }),
        seg(900, function (p) {
          return frame(staggered(vectorIds, p * 12, function (id, t) { return [id, [cols[0], productY[id]], [cols[1], vectorY[id]], t, simText(id), 0]; }), [], { highlight: vectorIds, hlColor: P.BLUE });
        }),
        hold(700, function () { return frame([], vectorSettled, { highlight: vectorIds, hlColor: P.BLUE }); }),
        seg(770, function (p) {
          return frame(vectorIds.map(function (id) { return [id, [cols[1], vectorY[id]], [cols[2], unionY[id]], p, '벡터', 0]; }), vectorSettled, { missing: true });
        }, { step: 2 }),
        hold(1800, function () { return frame([], vectorSettled.concat(unionV), { missing: true, unionDetail: DETAIL_V }); }),
        seg(1050, function (p) {
          return frame(staggered(lexicalIds, p * 14, function (id, t) { return [id, [cols[0], productY[id]], [cols[1], lexicalY[id]], t, lexText(id), 0]; }),
            vectorSettled.concat(unionV), { missing: p * 14 < 4, highlight: lexicalIds, hlColor: P.PURPLE, unionDetail: DETAIL_V });
        }, { step: 3 }),
        hold(700, function () { return frame([], vectorSettled.concat(lexicalSettled, unionV), { highlight: lexicalIds, hlColor: P.PURPLE, unionDetail: DETAIL_V }); }),
        seg(770, function (p) {
          return frame(lexicalIds.map(function (id) { return [id, [cols[1], lexicalY[id]], [cols[2], unionY[id]], p, '단어', both.indexOf(id) >= 0 ? ease(p) : 0]; }),
            vectorSettled.concat(lexicalSettled, unionV), { unionDetail: DETAIL_V });
        }, { step: 4 }),
        hold(2400, function () { return frame([], finalSettled, { unionDetail: DETAIL_ALL }); })
      ];
    }
  });

  /* ---------------------------------------------------------------- 3. 점수 막대
   * 질문: 신발끈은 왜 맨 아래로 가는가? 변하는 것: 유사도·단어·종류 조각이 차례로 쌓이고 합계 순으로 자리를 바꾼다.
   * 알 수 있는 것: 파란 조각은 넷이 거의 같고, 신발끈만 단어가 절반, 종류가 없어 짧게 끝난다. */
  F.define('score', {
    title: '점수 계산',
    meta: '단어 묶음 2개 · 종류 = 운동화',
    needs: ['search'],
    height: 496,
    steps: [['유사도', '유사도 × 0.60: 파란 조각', 'info'], ['단어', '단어 × 0.25: 보라 조각', 'info'], ['종류', '종류 × 0.15: 초록 조각', 'info'],
      ['합계', '세 조각을 더한 점수', 'info'], ['정렬', '신발끈은 단어 1/2, 종류 0이라 맨 아래로', 'warn']],
    timeline: function () {
      var S = F.search, PR = S.PRODUCTS;
      var parts = [['유사도 × 0.60', P.BLUE, function (p) { return .6 * p.similarity; }],
        ['단어 × 0.25', P.PURPLE, function (p) { return .25 * p.coverage; }],
        ['종류 × 0.15', P.GREEN, function (p) { return .15 * p.type; }]];
      var slot = [0, 1, 2, 3].map(function (i) { return 96 + i * 100; });
      var start = {}, end = {}, BX = 280, SCALE = 640;
      PR.slice().sort(function (a, b) { return b.similarity - a.similarity; }).forEach(function (p, i) { start[p.id] = slot[i]; });
      S.rank(true, false).forEach(function (p, i) { end[p.id] = slot[i]; });

      function draw(grow, ys, showTotal) {
        var c = new Canvas(), x = 40;
        parts.forEach(function (pt) { x += pill(c, x, 40, pt[0], pt[1], mix(pt[1], P.BG, .85), 24) + 12; });
        PR.slice().sort(function (a, b) { return (a.id === 'laces') - (b.id === 'laces'); }).forEach(function (p) {  // 신발끈이 내려오는 동안 맨 위에 그린다
          var y = ys[p.id];
          c.rect(30, y, 1020, 80, { fill: P.BG, r: 12 });
          tile(c, 40, y + 14, 52, p.color, p.kind);
          c.text(108, y + 40, p.short, 30, P.INK, 'bold');
          c.rect(BX, y + 22, SCALE, 36, { fill: P.SOFT, r: 8 });
          var x = BX, total = 0;
          parts.forEach(function (pt, i) {
            var v = pt[2](p) * grow[i];
            if (v > 0) c.rect(x, y + 22, SCALE * v, 36, { fill: pt[1], r: i === 0 ? 8 : 4 });
            x += SCALE * v; total += v;
          });
          if (showTotal) c.text(1040, y + 40, total.toFixed(3), 30, P.INK, 'bold', 'rm');
        });
        return c.done();
      }
      var segs = [hold(700, function () { return draw([0, 0, 0], start, false); }, { step: 1 })];
      [0, 1, 2].forEach(function (i) {
        segs.push(seg(700, function (p) { return draw([1, 1, 1].map(function (_, j) { return j < i ? 1 : j === i ? ease(p) : 0; }), start, false); }, { step: i + 1 }));
        segs.push(hold(500, function () { return draw([1, 1, 1].map(function (_, j) { return j <= i ? 1 : 0; }), start, false); }));
      });
      segs.push(hold(1200, function () { return draw([1, 1, 1], start, true); }, { step: 4 }));
      segs.push(seg(900, function (p) {
        var k = ease(p), ys = {};
        PR.forEach(function (q) { ys[q.id] = lerp(start[q.id], end[q.id], k); });
        return draw([1, 1, 1], ys, true);
      }, { step: 5 }));
      segs.push(hold(2600, function () { return draw([1, 1, 1], end, true); }));
      return segs;
    }
  });

  /* ---------------------------------------------------------------- 4. 세 번 줄 세우기
   * 질문: 같은 후보 넷은 규칙을 더할 때마다 어떻게 순서가 바뀌는가? 변하는 것: ① 유사도만 → ② 단어·종류 반영 → ③ 겹침 감점.
   * 알 수 있는 것: 신발끈이 내려가고, 감점 차이가 점수 차이보다 커서 스니커즈 B가 A 복제를 추월한다. */
  F.define('ranking', {
    title: '같은 후보를 세 번 줄 세우기',
    meta: '단계 숫자가 클수록 먼저 나옴',
    needs: ['search'],
    height: 508,
    steps: [['유사도만', '유사도만 보면 신발끈이 1등', 'muted'], ['단어·종류', '두 단어와 종류가 맞는 운동화 셋이 위로', 'info'],
      ['겹침 감점', '감점 차이가 점수 차이보다 커서 B가 A 복제를 추월', 'bad']],
    timeline: function () {
      var S = F.search, PR = S.PRODUCTS;
      var slot = [0, 1, 2, 3].map(function (i) { return 24 + i * 120; });
      var plain = S.rank(false, false), corrected = S.rank(true, false), diverse = S.rank(true, true);
      var score = {}, tier = {}, penalty = {};
      corrected.forEach(function (p) { score[p.id] = p.score; tier[p.id] = p.tier; });
      diverse.forEach(function (p) { penalty[p.id] = p.penalty; });
      function positions(order) { var o = {}; order.forEach(function (p, i) { o[p.id] = slot[i]; }); return o; }
      function slide(a, b, t) { var o = {}, k = ease(t); Object.keys(a).forEach(function (id) { o[id] = lerp(a[id], b[id], k); }); return o; }
      var p1 = positions(plain), p2 = positions(corrected), p3 = positions(diverse);

      function draw(ys, scoreT, badgeT, penaltyT, outlineT, front) {
        var c = new Canvas();
        var order = PR.slice().sort(function (a, b) { return ys[a.id] - ys[b.id]; });
        PR.slice().sort(function (a, b) { return (a.id === front) - (b.id === front); }).forEach(function (p) {  // 크게 움직이는 행을 위에 그린다
          var y = ys[p.id], picked = p.id === 'shoe' && outlineT > 0;
          card(c, 40, y, 1000, 104, { outline: picked ? mix(P.GRID, P.BLUE, outlineT) : P.GRID, width: picked ? 3 : 2, lifted: p.id === front });
          c.text(80, y + 52, String(order.indexOf(p) + 1), 32, P.FAINT, 'bold', 'mm');
          tile(c, 112, y + 20, 64, p.color, p.kind);
          c.text(198, y + 52, p.short, 32, P.INK, 'bold');
          if (badgeT) {
            c.rect(470, y + 32, 120, 40, { outline: mix(P.FAINT, P.BG, 1 - badgeT), width: 2, r: 20 });
            c.text(530, y + 52, '단계 ' + tier[p.id], 24, mix(P.TEXT, P.BG, 1 - badgeT), 'semibold', 'mm');
          }
          if (penaltyT && penalty[p.id]) c.text(830, y + 52, '−' + penalty[p.id].toFixed(3), 30, mix(P.RED, P.BG, 1 - penaltyT), 'bold', 'rm');
          c.text(1016, y + 52, lerp(p.similarity, score[p.id], scoreT).toFixed(3), 32, P.INK, 'bold', 'rm');
        });
        return c.done();
      }
      return [
        hold(2000, function () { return draw(p1, 0, 0, 0, 0); }, { step: 1 }),
        seg(450, function (p) { return draw(p1, p, p, 0, 0); }, { step: 2 }),
        seg(700, function (p) { return draw(slide(p1, p2, p), 1, 1, 0, 0, 'laces'); }),
        hold(2000, function () { return draw(p2, 1, 1, 0, 0); }),
        seg(300, function (p) { return draw(p2, 1, 1, 0, p); }, { step: 3 }),
        seg(450, function (p) { return draw(p2, 1, 1, p, 1); }),
        hold(1000, function () { return draw(p2, 1, 1, 1, 1); }),
        seg(700, function (p) { return draw(slide(p2, p3, p), 1, 1, 1, 1, 'other'); }),
        hold(2600, function () { return draw(p3, 1, 1, 1, 1); })
      ];
    }
  });

  /* ---------------------------------------------------------------- 5. 후보 모으기 → 순서 정하기 (정지)
   * 질문: 어디서 놓친 상품이 되살아나지 못하는가? 알 수 있는 것: 빨간 점은 후보 단계에서 막혀 뒤로 가지 못한다. 점의 개수와 위치는 설명용(고정 시드). */
  F.define('funnel', {
    title: '후보 모으기 → 순서 정하기',
    data: 'search2',
    height: 392,
    still: true,
    say: ['후보에서 빠진 상품은 뒤에서 되살릴 방법 없음', 'bad'],
    timeline: function (K_, D) {
      var info = [['전체 상품', ''], ['후보', '벡터 + 단어'], ['순서 정하기', '점수 · 단계 · 감점'], ['검색 결과', '화면에 보이는 상품']];
      var W = D.funnel.w, MID = 214, STEP = (1000 - W) / 3;  // 상자 4개가 40~1040 안에 들어간다
      return [hold(1, function () {
        var c = new Canvas();
        D.funnel.stages.forEach(function (st, i) {
          var x = 40 + i * STEP, h = st.h;
          c.rect(x, MID - h / 2, W, h, { fill: i ? P.BLUE_FILL : P.SOFT, outline: i ? P.BLUE_BG : P.GRID, r: 14 });
          c.text(x + W / 2, MID - h / 2 - 24, info[i][0], 28, P.INK, 'bold', 'mm');
          if (info[i][1]) c.text(x + W / 2, MID + h / 2 + 24, info[i][1], 22, P.MUTED, 'medium', 'mm');
          st.dots.forEach(function (d) { c.circle(x + d[0], MID + d[1], 7, { fill: i ? P.BLUE : P.FAINT }); });
          if (i < 3) arrow(c, [x + W + 12, MID], [x + STEP - 12, MID], P.FAINT);
        });
        var rx = 40 + D.funnel.red[0], ry = MID + D.funnel.red[1];  // 후보에서 빠지는 점
        c.circle(rx, ry, 10, { fill: P.RED });
        var gate = 40 + STEP - 22;  // 후보 상자 앞, 두 상자 사이 가운데
        c.dashed([rx + 14, ry], [gate - 14, ry], P.RED, 3);
        cross(c, gate, ry, P.RED, 10);
        return c.done();
      })];
    }
  });

  /* ---------------------------------------------------------------- 6. 검색어 벡터 근처의 상품 (정지 개념도) */
  F.define('text-space', {
    title: '검색어 벡터 근처의 상품',
    meta: '개념도',
    needs: ['search'],
    height: 462,
    still: true,
    timeline: function () {
      var BY = F.search.BY_ID, DY = 120;  // 원본 좌표에서 위쪽 제목 자리만큼 올린다
      return [hold(1, function () {
        var c = new Canvas(), qx = 380, qy = 340 - DY;
        c.circle(qx, qy, 185, { fill: P.BLUE_FILL, outline: P.BLUE_BG, width: 2 });
        var near = [[BY.shoe, 470, 290], [BY.copy, 455, 395], [BY.other, 270, 250], [BY.laces, 300, 440]];
        var far = [['검정 구두', 760, 200], ['흰색 머그컵', 780, 470], ['가죽 지갑', 900, 330]];
        near.forEach(function (n) {
          c.circle(n[1], n[2] - DY, 10, { fill: n[0].color });
          c.text(n[1] + 18, n[2] - DY, n[0].name, 26, P.TEXT, 'semibold');
        });
        far.forEach(function (n) {
          c.circle(n[1], n[2] - DY, 10, { fill: P.FAINT });
          c.text(n[1] + 18, n[2] - DY, n[0], 26, P.MUTED, 'semibold');
        });
        c.poly([[qx, qy - 16], [qx + 16, qy], [qx, qy + 16], [qx - 16, qy]], { fill: P.INK });
        c.text(qx - 26, qy, '흰색 운동화', 28, P.INK, 'bold', 'rm');
        pill(c, 120, 170 - DY, '표기가 달라도 가까이', P.GREEN, P.GREEN_BG, 24);
        c.line([[250, 190 - DY], [268, 236 - DY]], P.GREEN, 2);
        pill(c, 150, 520 - DY, '운동화가 아닌데도 가까이', P.ORANGE, P.ORANGE_BG, 24);
        c.line([[300, 500 - DY], [300, 456 - DY]], P.ORANGE, 2);
        pill(c, 720, 540 - DY, '‘흰색’이 같아도 멀리', P.MUTED, P.SOFT, 24);
        c.line([[790, 520 - DY], [782, 486 - DY]], P.FAINT, 2);
        return c.done();
      })];
    }
  });

  /* ---------------------------------------------------------------- 7. 짧은 단어 ‘아이’ 찾기 (정지) */
  F.define('word-boundary', {
    title: '짧은 단어 ‘아이’ 찾기',
    meta: '단어 단위로 확인',
    height: 276,
    still: true,
    timeline: function () {
      var rows = [['아이 운동화', '아이', P.GREEN, P.GREEN_BG, '단어로 일치'], ['아이스 쿨토시', '아이', P.RED, P.RED_BG, '글자만 겹침 · 제외']];
      return [hold(1, function () {
        var c = new Canvas();
        rows.forEach(function (r, i) {
          var y = 24 + i * 124;
          card(c, 40, y, 1000, 108);
          c.rect(70 - 4, y + 18, K.tw(r[1], 36, 'bold') + 8, 48, { fill: r[3], r: 8 });
          c.text(70, y + 42, r[0], 36, P.INK, 'bold');
          var word = K.tw(r[0].split(' ')[0], 36, 'bold');  // 찾는 글자가 들어 있는 단어를 밑줄로 보인다
          c.line([[70, y + 80], [70 + word, y + 80]], P.FAINT, 2);
          c.text(70 + word + 12, y + 80, '한 단어', 22, P.FAINT, 'medium', 'lm');
          pill(c, 1020, y + 54, r[4], r[2], r[3], 24, 'r');
        });
        return c.done();
      })];
    }
  });

  /* ---------------------------------------------------------------- 8. 이름이 겹치는 정도 (정지) */
  F.define('jaccard', {
    title: '이름이 겹치는 정도',
    meta: 'Jaccard = 겹친 단어 ÷ 모든 단어',
    needs: ['search'],
    height: 412,
    still: true,
    say: ['사진이 같으면 이름과 상관없이 겹침 1', 'info'],
    timeline: function () {
      var BY = F.search.BY_ID;
      var pairs = [[BY.shoe.name, BY.copy.name, P.BLUE, P.BLUE_BG, '많이 겹침'], [BY.shoe.name, BY.other.name, P.MUTED, P.SOFT, '겹침 없음']];
      return [hold(1, function () {
        var c = new Canvas();
        pairs.forEach(function (pr, i) {
          var y0 = 24 + i * 192, a = pr[0].split(/\s+/), b = pr[1].split(/\s+/);
          var common = a.filter(function (w) { return b.indexOf(w) >= 0; }), union = a.concat(b.filter(function (w) { return a.indexOf(w) < 0; }));
          card(c, 40, y0, 1000, 176);
          [a, b].forEach(function (words, r) {
            var x = 70, y = y0 + 50 + r * 76;
            words.forEach(function (word) {
              var hit = common.indexOf(word) >= 0, w = K.tw(word, 28, 'semibold') + 32;
              c.rect(x, y - 24, w, 48, { fill: hit ? P.BLUE_BG : P.SOFT, r: 10 });
              c.text(x + w / 2, y, word, 28, hit ? P.BLUE : P.TEXT, 'semibold', 'mm');
              x += w + 10;
            });
          });
          c.text(1010, y0 + 64, common.length + ' ÷ ' + union.length + ' = ' + F.search.jaccard(pr[0], pr[1]).toFixed(2).replace('.00', ''), 40, P.INK, 'bold', 'rm');
          pill(c, 1010, y0 + 124, pr[4], pr[2], pr[3], 24, 'r');
        });
        return c.done();
      })];
    }
  });

  /* ---------------------------------------------------------------- 9. 한 달에 드는 비용 (정지)
   * 단가(Modal T4, Voyage, Pinecone)와 가정은 scripts/figure_data/search2.py에 있고, 본문 숫자와 맞는지 거기서 assert로 확인한다.
   * 제목 막대 아래 줄과 해설은 그 데이터에서 만든다(데이터가 준비된 뒤에 그려지므로 접근자로 읽는다). */
  F.define('cost', {
    title: '가정에 따른 사용료 비교',
    get meta() { var k = F.data.search2.cost; return '예시: 상품 ' + K.fmt(k.products) + '개 · 검색어 검색 월 ' + K.fmt(k.searches) + '번'; },
    get say() { var k = F.data.search2.cost; return ['GPU·임베딩 API 사용료: 첫 등록 ' + money(k.first) + ', 이후 월 ' + money(k.query_month), 'ok']; },
    data: 'search2',
    height: 406,
    still: true,
    timeline: function (K_, D) {
      var k = D.cost, X0 = 470, SCALE = 340 / k.gpu_month;  // 가장 긴 막대(GPU 한 달)가 340이 되게 한다
      var groups = [
        ['비교용 구성', P.TEXT, P.SOFT, 46, [['GPU 한 장 상시 운영 (T4)', P.RED, k.gpu_month, '월'], ['벡터 DB (Pinecone Standard)', mix(P.RED, P.BG, .45), k.pinecone, '월']]],
        ['직접 만든 구성', P.BLUE, P.BLUE_BG, 240, [['검색어 → 벡터 (Voyage)', P.BLUE, k.query_month, '월'], ['첫 등록 (사진 + 상품명)', P.PURPLE, k.first, '한 번']]]
      ];
      return [hold(1, function () {
        var c = new Canvas();
        groups.forEach(function (g) {
          pill(c, 40, g[3], g[0], g[1], g[2], 24);
          g[4].forEach(function (r, i) {
            var y = g[3] + 60 + i * 64, w = Math.max(5, r[2] * SCALE), label = money(r[2]);
            c.text(40, y, r[0], 28, P.INK, 'semibold');
            c.line([[X0, y - 22], [X0, y + 22]], P.GRID, 2);
            c.rect(X0, y - 16, w, 32, { fill: r[1], r: 6 });
            c.text(X0 + w + 14, y, label, 28, P.INK, 'bold');
            c.text(X0 + w + 14 + K.tw(label, 28, 'bold') + 8, y, '/ ' + r[3], 24, P.MUTED, 'medium');
          });
        });
        return c.done();
      })];
    }
  });

  /* ---------------------------------------------------------------- 10. 검색 결과가 이상할 때 (정지) */
  F.define('debug', {
    title: '검색 결과가 이상할 때',
    height: 464,
    still: true,
    timeline: function () {
      var boxes = [[40, '아니요 · 후보 문제', P.RED, P.RED_BG, ['벡터 검색 결과', '단어 찾기 규칙', '후보 개수'], '순서 규칙을 고쳐도 소용없음'],
        [560, '예 · 순서 문제', P.BLUE, P.BLUE_BG, ['단어 묶음', '상품 종류 판별', '점수와 감점'], '후보 안에서 순서만 바뀜']];
      return [hold(1, function () {
        var c = new Canvas();
        card(c, 290, 24, 500, 84, { outline: P.BLUE, width: 3 });
        c.text(540, 66, '원하는 상품이 후보에 있었나요?', 30, P.INK, 'bold', 'mm');
        boxes.forEach(function (b) {
          arrow(c, [b[0] < 300 ? 440 : 640, 110], [b[0] + 240, 172], P.FAINT);
          card(c, b[0], 178, 480, 266);
          pill(c, b[0] + 24, 222, b[1], b[2], b[3], 24);
          b[4].forEach(function (line, i) {
            var y = 284 + i * 44;
            c.circle(b[0] + 38, y, 5, { fill: b[2] });
            c.text(b[0] + 56, y, line, 28, P.TEXT, 'semibold');
          });
          c.text(b[0] + 24, 418, b[5], 22, P.MUTED, 'medium');
        });
        return c.done();
      })];
    }
  });
});
