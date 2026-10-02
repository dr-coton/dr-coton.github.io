/* 평균 응답시간 글의 그림. 데이터는 perf-data.js (scripts/figure_data/perf.py가 만든다) */
(window.FigureModules = window.FigureModules || []).push(function (F) {
  var K = F.kit, P = K.P, Canvas = K.Canvas, mix = K.mix, ease = K.ease, lerp = K.lerp, hold = K.hold, seg = K.seg, pill = K.pill, fmt = K.fmt;

  function pct(xs, p) { var s = xs.slice().sort(function (a, b) { return a - b; }); return s[Math.ceil(p / 100 * s.length) - 1]; }
  function mean(xs) { return xs.reduce(function (s, x) { return s + x; }, 0) / xs.length; }

  /* ---------------------------------------------------------------- 1. 같은 평균, 다른 요청
   * 질문: 평균이 같으면 사용자가 겪는 시간도 같을까? 변하는 것: 요청이 끝나는 대로 점이 찍히고 평균 선이 이어진다.
   * 알 수 있는 것: 평균은 같아도 B에는 평균 선 위로 떠 있는 요청이 있다.
   * 이 그림만은 글 폭에 맞춰 다시 그린다(글자 크기는 그대로, 가로만 늘고 준다). */
  F.define('same-mean', {
    title: '같은 평균, 다른 요청',
    meta: '점 하나 = 요청 1건 · 가로 끝난 시각 · 세로 응답시간(ms)',
    data: 'perf',
    steps: [['요청이 끝날 때마다', '요청이 끝나는 대로 점이 찍힘', 'info'], ['평균', '평균은 두 서비스 모두 200ms', 'ok'], ['느린 요청', 'B에는 평균 선 위로 떠 있는 요청이 있음', 'bad']],
    mount: function (body, ctx, D) {
      var SPAN = D.span, SLOW = D.slow, TOP = 2600, NS = 'http://www.w3.org/2000/svg';
      var DRAW = 5000, HOLD2 = 2000, TO3 = 700, HOLD3 = 3200, T3 = DRAW + HOLD2, TEND = T3 + TO3 + HOLD3;

      function el(tag, attrs, parent, text) {
        var e = document.createElementNS(NS, tag);
        for (var k in attrs) e.setAttribute(k, attrs[k]);
        if (text != null) e.textContent = text;
        if (parent) parent.appendChild(e);
        return e;
      }
      function h(tag, cls, parent, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        if (parent) parent.appendChild(e);
        return e;
      }
      function back(t) { t = K.clamp(t); var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
      function prep(rows) { var sum = 0; return rows.map(function (r, i) { sum += r[1]; return { at: r[0], ms: r[1], mean: sum / (i + 1) }; }); }

      var root = h('div', 'sm', body);
      var A = Panel(root, 'a', 'A', D.a), gap = h('div', 'sm-gap', root, '<span class="sm-eq" aria-hidden="true">=</span>'), B = Panel(root, 'b', 'B', D.b);
      var eq = gap.firstChild;

      function Panel(host, key, name, rows) {
        var p = { rows: prep(rows), last: {}, r: 2.9, ph: 128, axis: key === 'b' };
        p.root = h('div', 'sm-pn sm-pn-' + key, host);
        var head = h('div', 'sm-h', p.root);
        h('span', 'sm-name', head, '<i></i>서비스 ' + name);
        p.chip = h('span', 'sm-chip', head, '');
        p.svg = el('svg', { 'aria-hidden': 'true' }, p.root);
        var g = function (c) { return el('g', { 'class': c }, p.svg); };
        p.gGrid = g('grid'); p.gAxis = g('axis'); p.thr = el('line', { 'class': 'thr' }, p.svg);
        p.thrT = el('text', { 'class': 'thr-t' }, p.svg, SLOW + 'ms');
        p.gDots = g('dots'); p.mean = el('path', { 'class': 'mean' }, p.svg);
        p.meanT = el('text', { 'class': 'mean-t' }, p.svg, '');
        p.cur = el('line', { 'class': 'cur' }, p.svg);
        p.dots = p.rows.map(function (r) {
          var d = {};
          if (r.ms > SLOW) { d.halo = el('circle', { 'class': 'halo' }, p.gDots); d.rip = el('circle', { 'class': 'rip' }, p.gDots); }
          d.c = el('circle', { 'class': 'dot' }, p.gDots);
          return d;
        });
        p.slowN = p.rows.filter(function (r) { return r.ms > SLOW; }).length;
        return p;
      }

      function layout(p, w) {
        var L = 42, R = 6, T = 10, PH = w < 420 ? Math.round(p.ph * .86) : p.ph, AX = p.axis ? 24 : 6;
        p.w = w; p.L = L; p.R = R; p.T = T; p.PH = PH;
        p.svg.setAttribute('width', w); p.svg.setAttribute('height', T + PH + AX); p.svg.setAttribute('viewBox', '0 0 ' + w + ' ' + (T + PH + AX));
        p.px = function (sec) { return L + (w - L - R) * sec / SPAN; };
        p.py = function (ms) { return T + PH * (1 - ms / TOP); };
        p.gGrid.textContent = ''; p.gAxis.textContent = '';
        [0, 1000, 2000].forEach(function (v) {
          el('line', { 'class': v ? 'gl' : 'gl base', x1: L, x2: w - R, y1: p.py(v), y2: p.py(v) }, p.gGrid);
          el('text', { 'class': 'tick', x: L - 8, y: p.py(v) + 4, 'text-anchor': 'end' }, p.gGrid, fmt(v));
        });
        if (p.axis) {
          var step = (w - L - R) < 300 ? 20 : 10;
          for (var s = 0; s <= SPAN; s += step) el('text', { 'class': 'tick', x: p.px(s), y: T + PH + 18, 'text-anchor': s === 0 ? 'start' : s === SPAN ? 'end' : 'middle' }, p.gAxis, s + 's');
        }
        var ty = p.py(SLOW);
        p.thr.setAttribute('x1', L); p.thr.setAttribute('y1', ty); p.thr.setAttribute('y2', ty);
        p.thrT.setAttribute('x', L + 2); p.thrT.setAttribute('y', ty - 5);
        p.dots.forEach(function (d, i) {
          var r = p.rows[i], x = p.px(r.at), y = p.py(r.ms);
          [d.c, d.halo, d.rip].forEach(function (c) { if (c) { c.setAttribute('cx', x); c.setAttribute('cy', y); } });
        });
        p.cur.setAttribute('y1', T); p.cur.setAttribute('y2', T + PH);
        p.meanT.setAttribute('y', p.py(900));
        p.last = {};
      }

      function drawPanel(p, s) {
        var rows = p.rows, shown = 0, i;
        while (shown < rows.length && rows[shown].at <= s.now) shown++;
        if (s.step >= 2) shown = rows.length;
        var drawing = s.t < DRAW;
        for (i = 0; i < rows.length; i++) {
          var d = p.dots[i], on = i < shown, r = 0;
          if (on) {
            var age = drawing ? s.t - rows[i].at / SPAN * DRAW : 1e9;
            r = p.r * back(age / 300) * (rows[i].ms > SLOW && s.s3 > 0 ? 1 + .55 * s.s3 : 1);
          }
          var key = r.toFixed(2);
          if (p.last['r' + i] !== key) { d.c.setAttribute('r', key); p.last['r' + i] = key; }
          if (d.halo) {
            var t3 = s.t - T3, rp = t3 >= 0 && t3 < 900 ? t3 / 900 : -1;
            d.halo.setAttribute('r', p.r * 3.2); d.halo.style.opacity = on ? s.s3 : 0;
            d.rip.setAttribute('r', rp >= 0 ? p.r * 2 + 15 * ease(rp) : 0); d.rip.style.opacity = rp >= 0 ? .55 * (1 - rp) : 0;
            d.c.classList.toggle('slow', s.s3 > 0);
          }
        }
        if (shown > 1) {  // 평균 선: 그때까지 찍힌 점의 평균. 점이 늘 때마다 다시 계산한다
          var pts = [], k;
          for (k = 0; k < shown; k++) pts.push(p.px(rows[k].at).toFixed(1) + ' ' + p.py(rows[k].mean).toFixed(1));
          p.mean.setAttribute('d', 'M' + pts.join(' L') + ' L' + p.px(Math.min(s.now, SPAN)).toFixed(1) + ' ' + p.py(rows[shown - 1].mean).toFixed(1));
        } else p.mean.setAttribute('d', '');
        p.meanT.textContent = shown ? '평균 ' + fmt(rows[shown - 1].mean) + 'ms' : '';
        p.meanT.classList.toggle('on', s.step === 2);
        p.thr.setAttribute('x2', p.L + (p.w - p.L - p.R) * s.s3);
        p.thrT.style.opacity = s.s3 > .6 ? 1 : 0;
        var cx = p.px(Math.min(s.now, SPAN)), live = s.step === 1 && s.now > 0;
        p.cur.setAttribute('x1', cx); p.cur.setAttribute('x2', cx); p.cur.style.opacity = live ? 1 : 0;
        p.meanT.setAttribute('x', Math.max(cx - 6, p.L + 96));  // 평균 숫자는 선 끝을 따라가다 오른쪽 끝에서 멈춘다
        var cnt = s.s3 > 0 ? p.slowN : 0;
        p.chip.innerHTML = SLOW + 'ms 넘는 요청 <b>' + cnt + '건</b>';
        p.chip.className = 'sm-chip ' + (p.slowN ? 'bad' : 'ok');
        p.chip.style.opacity = s.s3;
      }

      function stateAt(t) {
        var s = { t: t, now: 0, step: 1, eq: 0, s3: 0 };
        if (t < DRAW) { s.now = SPAN * t / DRAW; return s; }
        s.now = SPAN; s.step = 2; s.eq = ease((t - DRAW) / 300);
        if (t >= T3) { s.step = 3; s.eq = 1; s.s3 = ease((t - T3) / TO3); }
        return s;
      }

      function measure() {
        var w = Math.floor(A.root.clientWidth);
        if (w) { layout(A, w); layout(B, w); }
      }
      measure();
      return {
        duration: TEND,
        resize: measure,
        render: function (t) {
          if (!A.w) measure();
          var s = stateAt(t);
          drawPanel(A, s); drawPanel(B, s);
          eq.style.opacity = s.step >= 3 ? 1 - s.s3 : s.eq;
          root.dataset.step = s.step;
          ctx.clock(s.now.toFixed(1) + 's');
          return s.step;
        }
      };
    }
  });

  /* ---------------------------------------------------------------- 2. 백분위수
   * 질문: p99는 무엇을 세는가? 변하는 것: 표시가 p50, p95, p99로 옮겨 가며 그 안에 들어오는 요청이 칠해진다.
   * 알 수 있는 것: 평균보다 빠른 요청이 대부분이고, 느린 꼬리는 p99에서야 처음 보인다. */
  F.define('percentile', {
    title: '요청 100건을 빠른 순서로',
    meta: '막대 하나 = 요청 1건 · 세로: 응답시간(ms)',
    data: 'perf',
    height: 460,
    steps: [['줄 세우기', '요청 100건을 빠른 순서로 세움', 'info'], ['평균', '평균보다 빠른 요청이 96건', 'ok'], ['p50', 'p50: 절반의 요청이 이 시간 안에 끝남', 'info'],
      ['p95', 'p95: 95건이 이 시간 안에 끝남', 'info'], ['p99', 'p99: 99건이 이 시간 안에 끝남 · 느린 요청이 처음 보임', 'bad']],
    timeline: function (K, D) {
      var vals = D.b.map(function (r) { return r[1]; }), ranked = vals.slice().sort(function (a, b) { return a - b; });
      var top = 2600, x0 = 100, x1 = 1010, y0 = 52, y1 = 402, pitch = (x1 - x0) / 100, avg = mean(vals);
      var marks = [[50, P.BLUE, P.BLUE_BG], [95, P.BLUE, P.BLUE_BG], [99, P.RED, P.RED_BG]];
      function py(ms) { return lerp(y1, y0, ms / top); }

      function draw(grow, meanT, k, reached) {
        var c = new Canvas(), v, i;
        for (v = 0; v <= top; v += 500) {
          c.line([[x0, py(v)], [x1, py(v)]], P.GRID, 2);
          c.text(x0 - 14, py(v), fmt(v), 24, P.FAINT, 'medium', 'rm');
        }
        var cut = k ? Math.round(k) : 0;
        for (i = 0; i < 100; i++) {
          var color;
          if (k == null) color = mix(P.BLUE, P.BG, .3);
          else if (i + 1 === cut) color = cut >= 99 ? P.RED : P.INK;
          else color = i < cut ? P.BLUE : mix(P.BLUE, P.BG, .78);
          var top_ = py(ranked[i] * grow);
          c.rect(x0 + i * pitch + 1.4, top_, pitch - 2.8, y1 - top_, { fill: color, r: 2 });
        }
        c.line([[x0, y1], [x1, y1]], P.FAINT, 2);
        c.text(x0, y1 + 28, '가장 빠른 요청', 24, P.FAINT, 'medium');
        c.text(x1, y1 + 28, '가장 느린 요청', 24, P.FAINT, 'medium', 'rm');
        if (meanT) {
          var col = mix(P.GREEN, P.BG, 1 - meanT);
          c.dashed([x0, py(avg)], [x1, py(avg)], col, 3, 9, 6);
          c.text(640, py(avg) - 24, '평균 ' + Math.round(avg) + 'ms', 26, col, 'bold', 'mm');
        }
        if (k) {
          var xk = x0 + (Math.round(k) - .5) * pitch, kc = k >= 99 ? P.RED : P.INK, ms = ranked[Math.round(k) - 1];
          c.dashed([xk, py(ms) - 6], [xk, 70], kc, 3, 8, 6);
          c.text(xk + (xk > 800 ? -12 : 0), 52, Math.round(k) + '번째 · ' + fmt(ms) + 'ms', 26, kc, 'bold', xk > 800 ? 'rm' : 'mm');
        }
        marks.forEach(function (m, j) {  // 도달한 백분위수를 왼쪽 위에 쌓는다
          if (reached.indexOf(m[0]) < 0) return;
          var y = 98 + j * 44;
          pill(c, 120, y, 'p' + m[0], m[1], m[2], 24);
          c.text(206, y, fmt(pct(vals, m[0])) + 'ms', 26, P.INK, 'bold');
        });
        return c.done();
      }

      var segs = [hold(400, function () { return draw(0, 0, null, []); }, { step: 1 }),
        seg(840, function (p) { return draw(ease(p), 0, null, []); }),
        seg(300, function (p) { return draw(1, ease(p), null, []); }, { step: 2 }),
        hold(1800, function () { return draw(1, 1, null, []); })];
      var prev = 0, reached = [];
      marks.forEach(function (m, j) {
        var pcl = m[0], from = prev, snapshot = reached.slice();
        if (from) segs.push(seg(400, function (p) { return draw(1, 1, lerp(from, pcl, ease(p)), snapshot); }));  // 이동하는 동안은 이전 단계 표시를 유지한다
        reached = reached.concat([pcl]);
        var now = reached.slice();
        segs.push(hold(pcl < 99 ? 1900 : 2800, function () { return draw(1, 1, pcl, now); }, { step: 3 + j }));
        prev = pcl;
      });
      return segs;
    }
  });

  /* ---------------------------------------------------------------- 3. 화면 하나가 호출 여러 개
   * 질문: 호출 하나가 느릴 확률이 1%뿐이면 괜찮지 않을까? 변하는 것: 화면 하나가 부르는 호출 수를 1, 10, 100개로 바꾼다.
   * 알 수 있는 것: 느린 화면(빨강)이 1%에서 63%로 늘어난다. 호출이 많을수록 개별 p99가 화면 전체의 흔한 경험이 된다.
   * 숫자(1.0%, 9.6%, 63.4%)는 1 − 0.99^N 이고 perf.py가 본문과 맞는지 assert한다. 느린 칸의 자리는 data.fanout.slow. */
  F.define('fanout', {
    title: '화면 하나가 부르는 호출 수',
    meta: '호출 1개가 느릴 확률 1% · 화면 100번의 기댓값',
    data: 'perf',
    height: 510,
    steps: [['호출 1개', '호출이 1개면 화면 100개 중 1개가 느림', 'info'], ['호출 10개', '호출이 10개면 화면 10개 중 1개가 느림', 'bad'],
      ['호출 100개', '호출이 100개면 화면 10개 중 6개가 느림', 'bad']],
    timeline: function (K, D) {
      var rows = D.fanout.rows, slow = D.fanout.slow.map(function (a) { var m = []; a.forEach(function (i) { m[i] = true; }); return m; });

      function draw(shown) {  // shown[줄] = 그 줄에서 채워진 칸 수(0~100)
        var c = new Canvas();
        rows.forEach(function (n, r) {
          var y = 30 + r * 162, done = shown[r], cnt = 0, i, d, w = pill(c, 40, y + 16, '호출 ' + n + '개', P.BLUE, P.BLUE_BG, 24);
          for (d = 0; d < n; d++) c.circle(40 + w + 24 + d * 6.2, y + 16, 2.6, { fill: mix(P.BLUE, P.BG, .25) });
          for (i = 0; i < 100; i++) {
            if (i < done && slow[r][i]) cnt++;
            c.rect(40 + i * 10, y + 52, 7.4, 44, { fill: i >= done ? P.SOFT : slow[r][i] ? P.RED : mix(P.BLUE, P.BG, .78), r: 2 });
          }
          if (done === 100) c.text(40, y + 120, '느린 화면 ' + cnt + '% · 1 − 0.99^' + n + ' = ' + (100 * (1 - Math.pow(.99, n))).toFixed(1) + '%', 24, cnt >= 10 ? P.RED : P.TEXT, 'bold');
          else if (done) c.text(40, y + 120, '느린 화면 ' + cnt + '건', 24, P.MUTED, 'semibold');
        });
        return c.done();
      }

      var segs = [hold(600, function () { return draw([0, 0, 0]); })];
      rows.forEach(function (n, r) {
        function at(k) { var s = [0, 0, 0], j; for (j = 0; j < r; j++) s[j] = 100; s[r] = k; return s; }
        segs.push(seg(1200, function (p) { return draw(at(Math.floor(p * 100))); }, { step: r + 1 }));
        segs.push(hold(r < 2 ? 1200 : 2500, function () { return draw(at(100)); }));
      });
      return segs;
    }
  });

  /* ---------------------------------------------------------------- 4. VU를 늘려도 TPS는 그대로
   * 질문: TPS가 목표를 넘고 더 오르지 않으면 한계에 도달한 것이니 거기서 끝내도 될까? 변하는 것: VU를 125에서 2,500까지 올린다.
   * 알 수 있는 것: TPS는 1,250 근처에서 멈추는데 p99는 계속 오른다. 같은 TPS에서도 사용자가 기다리는 시간은 다르다.
   * 값은 data.sweep = [VU, TPS, 평균 ms, p99 ms] (단일 서버 시뮬레이션). 단계 문구의 p99(30, 65, 1,074ms)는 perf.py가 본문과 맞는지 assert한다. */
  F.define('vu-sweep', {
    title: 'VU를 늘려 가며 잰 결과',
    meta: '예시 서버 · VU는 응답 뒤 1초 쉼',
    data: 'perf',
    height: 630,
    steps: [['올리는 중', 'VU를 올리면 TPS도 오름', 'info'], ['목표 달성', 'VU 1,125 · TPS 목표 달성, p99 30ms', 'ok'],
      ['거의 멈춤', 'VU 1,250 · TPS가 거의 멈춤, p99 65ms', 'info'], ['더 올림', 'VU를 더 올림', 'info'], ['VU 2,500', 'VU 2,500 · TPS는 그대로, p99 1,074ms', 'bad']],
    timeline: function (K, D) {
      var S = D.sweep, last = S.length - 1, xmax = 2500, x0 = 120, x1 = 1010, t0 = 92, t1 = 242, tmax = 1400, l0 = 322, l1 = 542, lmax = 1200;
      function px(n) { return lerp(x0, x1, n / xmax); }
      function tpsY(v) { return lerp(t1, t0, v / tmax); }
      function latY(v) { return lerp(l1, l0, Math.min(v, lmax) / lmax); }

      function trace(c, f, col, yOf, color) {  // f: 소수 단계 번호(0~19). 지나온 단계는 꺾은선, 지금 단계는 두 단계 사이를 잇는다
        var pts = [], k, whole = Math.floor(f), r = f - whole, a = S[whole], b = S[Math.min(last, whole + 1)];
        for (k = 0; k <= whole; k++) pts.push([px(S[k][0]), yOf(S[k][col])]);
        if (r > 0) pts.push([px(lerp(a[0], b[0], r)), yOf(lerp(a[col], b[col], r))]);
        if (pts.length > 1) c.line(pts, color, 5);
        c.circle(pts[pts.length - 1][0], pts[pts.length - 1][1], 8, { fill: color });
        return pts[pts.length - 1][0];
      }
      function rich(c, xr, y, parts, size) {  // 오른쪽 맞춤으로 색이 다른 글을 이어 쓴다
        parts.slice().reverse().forEach(function (q) { xr -= c.tw(q[0], size, 'bold'); c.text(xr, y, q[0], size, q[1], 'bold'); });
      }

      function draw(f) {
        var c = new Canvas(), v, n, e = S[Math.round(f)];  // 숫자는 가장 가까운 단계의 값
        pill(c, 40, 46, 'TPS', P.BLUE, P.BLUE_BG, 24);
        pill(c, 40, 282, '응답시간', P.INK, P.SOFT, 24);
        for (v = 0; v <= tmax; v += 500) { c.line([[x0, tpsY(v)], [x1, tpsY(v)]], P.GRID, 2); c.text(x0 - 14, tpsY(v), fmt(v), 24, P.FAINT, 'medium', 'rm'); }
        for (v = 0; v <= lmax; v += 400) { c.line([[x0, latY(v)], [x1, latY(v)]], P.GRID, 2); c.text(x0 - 14, latY(v), fmt(v), 24, P.FAINT, 'medium', 'rm'); }
        for (n = 0; n <= xmax; n += 500) c.text(px(n), l1 + 28, fmt(n), 24, P.FAINT, 'medium', 'mm');
        c.text(x1, l1 + 56, 'VU 수', 24, P.FAINT, 'medium', 'rm');
        c.dashed([x0, tpsY(1000)], [x1, tpsY(1000)], P.GREEN, 3, 9, 6);
        c.text(x0 + 10, tpsY(1000) - 16, '목표 1,000', 24, P.GREEN, 'bold');
        c.dashed([x0, latY(500)], [x1, latY(500)], P.ORANGE, 3, 9, 6);
        c.text(x0 + 10, latY(500) - 16, '500ms', 24, P.ORANGE, 'bold');
        trace(c, f, 1, tpsY, P.BLUE);
        trace(c, f, 2, latY, P.BLUE);
        var hx = trace(c, f, 3, latY, P.RED);
        c.dashed([hx, t0], [hx, l1], P.FAINT, 2, 9, 6);
        c.text(1040, 46, 'VU ' + fmt(e[0]) + ' · TPS ' + fmt(e[1]), 26, P.BLUE, 'bold', 'rm');
        rich(c, 1040, 282, [['평균 ' + fmt(e[2]) + 'ms', P.BLUE], [' · ', P.MUTED], ['p99 ' + fmt(e[3]) + 'ms', P.RED]], 26);
        c.text(x0 + 10, latY(0) - 40, '평균', 24, P.BLUE, 'bold');
        c.text(x0 + 80, latY(0) - 40, 'p99', 24, P.RED, 'bold');
        return c.done();
      }

      var i1125 = 8, i1250 = 9;  // VU 1,125와 1,250의 단계 번호
      return [hold(500, function () { return draw(0); }, { step: 1 }),
        seg(1100, function (p) { return draw(lerp(0, i1125, ease(p))); }),
        hold(1800, function () { return draw(i1125); }, { step: 2 }),
        seg(300, function (p) { return draw(lerp(i1125, i1250, ease(p))); }),
        hold(2000, function () { return draw(i1250); }, { step: 3 }),
        seg(1300, function (p) { return draw(lerp(i1250, last, ease(p))); }, { step: 4 }),
        hold(3000, function () { return draw(last); }, { step: 5 })];
    }
  });

  /* ---------------------------------------------------------------- 5. 빠른 에러가 TPS를 올린다
   * 질문: 평균과 TPS가 좋아졌다면 시스템도 좋아진 걸까? 변하는 것: 오류 응답 비율을 0%에서 30%까지 올린다(오류는 10ms에 응답).
   * 알 수 있는 것: 평균은 줄고 TPS는 늘어 목표를 넘는데, 성공한 요청만 센 TPS는 오히려 줄어든다. 오류율 없이는 두 숫자를 믿을 수 없다.
   * 계산식은 perf.py의 err_stats와 같다(TPS = VU ÷ 평균 응답시간(초)). 값은 perf.py가 본문과 맞는지 assert한다. */
  F.define('error-fast', {
    title: '오류가 빨리 돌아오면',
    meta: 'VU 180개 · 성공 200ms · 오류 10ms (가정)',
    data: 'perf',
    height: 480,
    steps: [['오류 0%', '오류 없음: TPS 900, 목표에 못 미침', 'bad'], ['오류 10%', '오류 10%: TPS 목표 직전', 'info'],
      ['오류 20%', '오류 20%: 평균과 TPS 모두 목표를 넘음', 'ok'], ['오류 30%', '오류 30%: 성공한 요청은 더 줄어듦', 'bad']],
    timeline: function (K, D) {
      var E = D.err, x0 = 400, x1 = 800;
      function stats(e) {
        var avg = (1 - e) * E.ok + e * E.err, tps = E.vus / (avg / 1000);  // VU가 쉬지 않으니 동시에 처리 중인 요청은 항상 VU 수
        return [avg, tps, tps * (1 - e), e * 100];
      }
      var rows = [  // 이름, 값 위치, 막대 최대값, 목표(없으면 null), 목표 방향, 글
        ['평균 응답시간', 0, 400, E.avg, 'max', function (v) { return fmt(v) + 'ms'; }],
        ['TPS', 1, 1500, E.tps, 'min', fmt],
        ['성공한 요청만 센 TPS', 2, 1500, E.tps, 'min', fmt],
        ['오류 응답 비율', 3, 40, null, null, function (v) { return fmt(v) + '%'; }]];

      function draw(e) {
        var c = new Canvas(), st = stats(e), pass = st[0] <= E.avg && st[1] >= E.tps;
        rows.forEach(function (row, r) {
          var y = 75 + r * 86, v = st[row[1]], target = row[3], vmax = row[2];
          var ok = target == null || (row[4] === 'max' ? v <= target : v >= target);
          var color = row[1] === 3 && e > 0 ? P.RED : ok ? P.BLUE : mix(P.BLUE, P.BG, .5);
          c.text(40, y, row[0], 28, P.INK, 'semibold');
          c.rect(x0, y - 16, x1 - x0, 32, { fill: P.SOFT, r: 6 });
          c.rect(x0, y - 16, Math.max(4, (x1 - x0) * v / vmax), 32, { fill: color, r: 6 });
          if (target != null) {
            var tx = lerp(x0, x1, target / vmax);
            c.line([[tx, y - 26], [tx, y + 26]], P.GREEN, 4);
            c.text(tx, r ? y + 40 : y - 36, '목표 ' + fmt(target), 22, P.GREEN, 'bold', 'mm');
          }
          c.text(x1 + 24, y, row[5](v), 28, P.INK, 'bold');
          if (target != null) (ok ? K.check : K.cross)(c, 1010, y, ok ? P.GREEN : P.RED);
        });
        var w = pill(c, 40, 435, '평균과 TPS만 보면', P.INK, P.SOFT, 24);
        pill(c, 40 + w + 20, 435, pass ? '합격' : '불합격', pass ? P.GREEN : P.RED, pass ? P.GREEN_BG : P.RED_BG, 26);
        return c.done();
      }

      var segs = [hold(1700, function () { return draw(0); }, { step: 1 })], prev = 0;
      [.1, .2, .3].forEach(function (s, j) {
        var from = prev;
        segs.push(seg(700, function (p) { return draw(lerp(from, s, ease(p))); }));
        segs.push(hold(s < .3 ? 1700 : 2800, function () { return draw(s); }, { step: 2 + j }));
        prev = s;
      });
      return segs;
    }
  });

  /* ---------------------------------------------------------------- 6. 측정 도구가 느린 구간을 건너뛴다
   * 질문: 응답시간 평균과 p99가 괜찮으면 5초 멈춘 서버도 괜찮은가? 변하는 것: 서버가 5초 멈춘 같은 시험을 두 방식으로 잰다.
   * 알 수 있는 것: 응답을 기다리는 방식은 멈춘 동안 요청을 못 보내 느린 기록이 1건뿐이다. 도구가 서버를 따라 느려지면 느린 구간이 숫자에서 사라진다.
   * 막대는 [요청을 보낸 시각(초), 응답시간(초)] (data.omission). 마지막 카드의 건수·평균·p99는 이 값에서 바로 계산한다. */
  F.define('omission', {
    title: '서버가 5초 멈추면',
    meta: '막대 하나 = 요청 1건 · 높이: 응답시간',
    data: 'perf',
    height: 670,
    steps: [['정상', '0~10초: 두 방식 모두 응답 50ms', 'info'], ['서버 멈춤', '멈춘 동안 응답 대기 방식은 요청을 못 보냄', 'bad'], ['결과', '같은 서버, 다른 결과', 'bad']],
    timeline: function (K, D) {
      var O = D.omission, A = O.a, B = O.b, secs = O.secs, x0 = 70, x1 = 1010, laneA = 245, laneB = 465, laneH = 110, hmax = 5.2;
      var lanes = [['응답 대기 방식', P.BLUE, P.BLUE_BG, A, laneA, 145], ['시각 고정 방식', P.PURPLE, P.PURPLE_BG, B, laneB, 365]];
      var cards = [[40, P.BLUE, A], [560, P.PURPLE, B]].map(function (q) {
        var lats = q[2].map(function (r) { return r[1]; });
        return { x: q[0], n: lats.length, avg: mean(lats) * 1000, p99: pct(lats, 99) * 1000 };
      });
      function px(t) { return lerp(x0, x1, t / secs); }
      function barH(lat) { return Math.max(3, laneH * lat / hmax); }

      function draw(now, res) {  // now: 지금 시각(초), res: 결과 카드가 나타난 정도(0~1)
        var c = new Canvas(), v;
        pill(c, 40, 45, '서버', P.MUTED, P.SOFT, 24);
        c.rect(px(0), 69, px(O.from) - px(0), 24, { fill: mix(P.GREEN, P.BG, .7), r: 4 });
        c.rect(px(O.from), 69, px(O.to) - px(O.from), 24, { fill: P.RED, r: 4 });
        c.rect(px(O.to), 69, px(secs) - px(O.to), 24, { fill: mix(P.GREEN, P.BG, .7), r: 4 });
        c.text(px((O.from + O.to) / 2), 105, O.from + '~' + O.to + '초 멈춤', 24, P.RED, 'bold', 'mm');
        lanes.forEach(function (ln, li) {
          var yb = ln[4];
          pill(c, 40, ln[5], ln[0], ln[1], ln[2], 24);
          c.line([[x0, yb], [x1, yb]], P.GRID, 2);
          ln[3].forEach(function (r) {
            if (r[0] > now) return;
            var isSlow = r[1] > .2;
            c.rect(px(r[0]), yb - barH(r[1]), li === 0 && isSlow ? 8 : 3.2, barH(r[1]), { fill: isSlow ? P.RED : mix(ln[1], P.BG, .25), r: 1 });
          });
          if (li === 0 && now > O.from + 1) {  // 응답을 기다리느라 보내지 못한 요청
            var k = K.clamp(now - O.from - 1), col = mix(P.MUTED, P.BG, 1 - k);
            c.rect(px(O.from) + 14, yb - 74, px(O.to) - px(O.from) - 20, 64, { outline: mix(P.FAINT, P.BG, 1 - k), width: 2, r: 8 });
            c.text(px((O.from + O.to) / 2) + 4, yb - 54, '보내지 못한', 22, col, 'semibold', 'mm');
            c.text(px((O.from + O.to) / 2) + 4, yb - 28, '요청 ' + (B.length - A.length) + '건', 22, col, 'semibold', 'mm');
          }
        });
        for (v = 0; v <= secs; v += 5) c.text(px(v), laneB + 26, v + 's', 24, P.FAINT, 'medium', 'mm');
        c.dashed([px(Math.max(0, Math.min(now, secs))), 122], [px(Math.max(0, Math.min(now, secs))), laneB + 4], P.FAINT, 2, 9, 6);
        if (res) cards.forEach(function (cd) {
          K.card(c, cd.x, 535, 480, 112, { outline: mix(P.GRID, P.BG, 1 - res) });
          c.text(cd.x + 24, 567, '잰 요청 ' + cd.n + '건', 24, mix(P.MUTED, P.BG, 1 - res), 'semibold');
          c.text(cd.x + 24, 613, '평균 ' + fmt(cd.avg) + 'ms · p99 ' + fmt(cd.p99) + 'ms', 30, mix(cd.p99 > 1000 ? P.RED : P.INK, P.BG, 1 - res), 'bold');
        });
        return c.done();
      }

      return [hold(500, function () { return draw(-1, 0); }),
        seg(1400, function (p) { return draw(O.from * p, 0); }, { step: 1 }),
        seg(2400, function (p) { return draw(lerp(O.from, O.to, p), 0); }, { step: 2 }),
        hold(1100, function () { return draw(O.to, 0); }),
        seg(1500, function (p) { return draw(lerp(O.to, secs, p), 0); }),
        seg(300, function (p) { return draw(secs, ease(p)); }, { step: 3 }),
        hold(2600, function () { return draw(secs, 1); })];
    }
  });

  /* ---------------------------------------------------------------- 7. 요청 수가 적으면 p99가 흔들린다
   * 질문: p99는 요청이 적어도 믿을 수 있는가? 변하는 것: 서비스 B와 같은 모양에서 요청 수만 100·1,000·10,000건으로 바꿔 시험을 200번씩 반복한다.
   * 알 수 있는 것: 요청이 100건이면 p99가 크게 흔들리고 22번은 500ms 아래로 내려앉는다. 요청이 많을수록 값이 모인다.
   * 점은 시험 1번의 p99이다. data.noise = 요청 수별 [[가로 흩뿌림, p99 ms] × 200]. 원본은 정지 그림이고, 여기서는 시험이 쌓이는 모습을 요청 수별로 차례로 보여 준다. */
  F.define('p99-noise', {
    title: '같은 서비스를 200번 재 보면',
    meta: '점 하나 = 시험 1번의 p99',
    data: 'perf',
    height: 460,
    steps: [['100건', '요청 100건: 시험마다 p99가 크게 달라짐', 'bad'], ['1,000건', '요청 1,000건: 달라지는 폭이 줄어듦', 'info'],
      ['10,000건', '요청 10,000건: 값이 좁은 띠로 모임', 'info'], ['비교', '요청이 적을수록 p99 한 번의 값을 믿기 어려움', 'warn']],
    timeline: function (K, D) {
      var N = D.noise, limit = D.slow, x0 = 120, x1 = 1010, y0 = 40, y1 = 360, top = 3000, names = ['요청 100건', '요청 1,000건', '요청 10,000건'];
      function py(ms) { return lerp(y1, y0, ms / top); }

      function draw(shown) {  // shown[g] = 그 요청 수에서 찍힌 시험 횟수(0~200)
        var c = new Canvas(), v;
        for (v = 0; v <= top; v += 1000) { c.line([[x0, py(v)], [x1, py(v)]], P.GRID, 2); c.text(x0 - 14, py(v), fmt(v), 24, P.FAINT, 'medium', 'rm'); }
        c.dashed([x0, py(limit)], [x1, py(limit)], P.ORANGE, 3, 9, 6);
        c.text(x0 + 10, py(limit) - 16, limit + 'ms', 24, P.ORANGE, 'bold');
        N.forEach(function (pts, g) {
          var cx = x0 + (g + .5) * (x1 - x0) / 3, low = 0;
          pts.forEach(function (q, i) {
            if (i >= shown[g]) return;
            var isLow = q[1] < limit;
            if (isLow) low++;
            c.circle(cx + q[0], py(q[1]), 5, { fill: mix(isLow ? P.RED : P.BLUE, P.BG, .25) });
          });
          c.text(cx, y1 + 30, names[g], 26, P.INK, 'bold', 'mm');
          c.text(cx, y1 + 66, 'p99 ' + limit + 'ms 미만 ' + low + '번', 24, low ? P.RED : P.MUTED, 'semibold', 'mm');
        });
        return c.done();
      }

      var segs = [hold(500, function () { return draw([0, 0, 0]); })];
      N.forEach(function (pts, g) {
        function at(k) { var s = [0, 0, 0], j; for (j = 0; j < g; j++) s[j] = pts.length; s[g] = k; return s; }
        segs.push(seg(g ? 1100 : 1500, function (p) { return draw(at(Math.round(p * pts.length))); }, { step: g + 1 }));
        if (g < 2) segs.push(hold(g ? 900 : 1200, function () { return draw(at(pts.length)); }));
      });
      segs.push(hold(2600, function () { return draw([200, 200, 200]); }, { step: 4 }));
      return segs;
    }
  });
});
