/* k6와 APM 글의 뒤쪽 그림: bandwidth, security, ua-block, generator, coverage, triage.
 * 실험 값은 loadgen2-data.js (scripts/figure_data/loadgen2.py가 results.json에서 읽어 만든다). coverage와 triage는 숫자 없는 표라 데이터가 없다.
 * 구간 색은 F.loadgen.COLOR(loadgen-common.js)를 쓴다. */
(window.FigureModules = window.FigureModules || []).push(function (F) {
  var K = F.kit, P = K.P, Canvas = K.Canvas, mix = K.mix, ease = K.ease, lerp = K.lerp, clamp = K.clamp, hold = K.hold, seg = K.seg, pill = K.pill, card = K.card, check = K.check, cross = K.cross, arrow = K.arrow, fmt = K.fmt;

  /* ---------------------------------------------------------------- 대역폭이 모자라면 receiving만 늘어난다 (실험)
   * 질문: 서버가 멀쩡한데 k6 응답시간만 늘어나는 건 언제인가? 조건: 응답 256KB, 서버 한도 10,240KB/s에서 VU를 1에서 32로 올린다.
   * 변하는 것: TPS는 40에서 멈추고 waiting은 101ms로 같은데 receiving만 24ms에서 695ms로 커진다.
   * 알 수 있는 것: 서버 지표가 그대로여도 회선이 차면 k6 응답시간이 커진다.
   * TPS는 VU ÷ 평균 응답시간(loadgen2.py의 bw_tps: 8, 15, 29, 38, 39, 40). */
  F.define('bandwidth', {
    title: '같은 서버, VU만 늘렸을 때',
    meta: '실험 · 응답 256KB · 서버 한도 10,240KB/s',
    data: 'loadgen2', needs: ['loadgen'], height: 565,
    steps: [['VU 1', 'VU 1: 회선이 남아 receiving 24ms', 'ok'], ['VU 4', 'VU 4: 아직 한도 안', 'info'], ['VU 8', 'VU 8: TPS가 한도에 닿음', 'warn'], ['VU 32', 'VU 32: TPS는 40에 묶이고 receiving만 695ms', 'bad']],
    timeline: function (K, D) {
      var L = F.loadgen, B = D.bw, rows = B.rows, N = rows.length;
      var lx0 = 90, rx0 = 640, base = 470, top = 140, bw = 46, pitch = 68, gridW = 400;
      function ty(v, max) { return lerp(base, top, v / max); }

      function draw(v) {  // v: 막대가 몇 개째까지 자랐나(0~6)
        var c = new Canvas(), i, g, y, k = Math.round(v);
        pill(c, 40, 40, 'TPS', P.BLUE, P.BLUE_BG, 24);
        var pw = pill(c, 590, 40, '응답시간', P.TEXT, P.SOFT, 24);
        L.legend(c, 590 + pw + 28, 40, ['waiting', 'receiving']);
        [0, 20, 40].forEach(function (g) {
          y = ty(g, 50);
          c.line([[lx0 - 10, y], [lx0 + gridW, y]], P.GRID, 2);
          c.text(lx0 - 18, y, String(g), 22, P.FAINT, 'medium', 'rm');
        });
        [0, 400, 800].forEach(function (g) {
          y = ty(g, 850);
          c.line([[rx0 - 10, y], [rx0 + gridW, y]], P.GRID, 2);
          c.text(rx0 - 18, y, String(g), 22, P.FAINT, 'medium', 'rm');
        });
        var capY = ty(B.limit, 50);
        c.dashed([lx0 - 10, capY], [lx0 + gridW, capY], P.RED, 3, 9, 6);
        c.text(lx0 + gridW, capY - 18, '회선 한도 ' + B.limit, 22, P.RED, 'bold', 'rm');
        var sy = ty(B.server, 850);
        c.dashed([rx0 - 10, sy], [rx0 + gridW, sy], P.GREEN, 3, 9, 6);
        c.text(rx0 - 6, sy - 44, '서버 시간 ' + Math.round(B.server), 22, P.GREEN, 'bold');
        rows.forEach(function (r, i) {
          c.text(lx0 + i * pitch + bw / 2, base + 26, String(r.vu), 22, P.FAINT, 'medium', 'mm');
          c.text(rx0 + i * pitch + bw / 2, base + 26, String(r.vu), 22, P.FAINT, 'medium', 'mm');
          var f = ease(clamp(v - i));
          if (f <= 0) return;
          var th = (base - ty(r.tps, 50)) * f, wh = (base - ty(r.waiting, 850)) * f, rh = (base - ty(r.receiving, 850)) * f;
          c.rect(lx0 + i * pitch, base - th, bw, th, { fill: P.BLUE, r: 4 });
          c.rect(rx0 + i * pitch, base - wh, bw, wh, { fill: L.COLOR.waiting, r: 3 });
          c.rect(rx0 + i * pitch, base - wh - rh, bw, rh, { fill: L.COLOR.receiving, r: 3 });
        });
        c.text(lx0, base + 62, 'VU 수', 22, P.FAINT, 'medium');
        c.text(rx0, base + 62, 'VU 수', 22, P.FAINT, 'medium');
        if (k) c.text(1040, 88, 'VU ' + rows[k - 1].vu + ' · TPS ' + fmt(rows[k - 1].tps) + ' · receiving ' + fmt(rows[k - 1].receiving) + 'ms', 24, P.INK, 'bold', 'rm');
        return c.done();
      }
      return [hold(600, function () { return draw(0); }),
        seg(500, function (p) { return draw(ease(p)); }, { step: 1 }),
        hold(1400, function () { return draw(1); }),
        seg(900, function (p) { return draw(1 + 2 * ease(p)); }, { step: 2 }),
        hold(1400, function () { return draw(3); }),
        seg(500, function (p) { return draw(3 + ease(p)); }, { step: 3 }),
        hold(1500, function () { return draw(4); }),
        seg(1100, function (p) { return draw(4 + 2 * ease(p)); }, { step: 4 }),
        hold(3000, function () { return draw(6); })];
    }
  });

  /* ---------------------------------------------------------------- 보안장비가 막은 요청은 APM에 없다 (실험)
   * 질문: 서버에 오류가 없으면 시험 결과는 정상일까? 조건: 초당 200건을 보내고 장비가 초당 100건만 통과시킨다(가정).
   * 변하는 것: 점 일부가 장비 앞에서 떨어진다. k6는 실패율 44.5%, APM은 666건을 오류 없이 처리.
   * 알 수 있는 것: 막힌 요청은 서버 지표에 남지 않는다. 점 30개로 요청 1,201건을 대신한다(점 하나 = 약 40건). */
  F.define('security', {
    title: '장비가 막은 요청은 서버에 없다',
    meta: '실험 · 장비는 초당 100건만 통과(가정)',
    data: 'loadgen2', needs: ['loadgen'], height: 410,
    steps: [['보내기', 'k6가 초당 200건을 보냄', 'info'], ['막기', '장비가 초당 100건만 통과시키고 나머지는 막음', 'warn'], ['결과', '서버는 멀쩡해 보이고 k6는 실패 44.5%', 'bad']],
    timeline: function (K, D) {
      var L = F.loadgen, S = D.sec, ok = S.ok, dots = ok.length, launch = 2, leg = 8, T = dots * launch;  // 프레임 단위: 점은 2프레임마다 출발해 8프레임 걸려 장비에 닿는다
      var END = T + Math.floor(leg * 2.6) + 2, FRAME = 55, Y = 90;  // 한 프레임 55ms, 점이 다니는 길의 높이

      function draw(f, final) {  // f<0: 출발 전
        var c = new Canvas(), i;
        arrow(c, [236, Y], [439, Y], P.FAINT);
        arrow(c, [641, Y], [844, Y], P.FAINT);
        for (i = 0; f >= 0 && i < Math.min(dots, Math.floor(f / launch) + 1); i++) {
          var t = (f - i * launch) / leg, lane = Y + (i % 3 - 1) * 12;
          if (t < 0) continue;
          if (t < 1) c.circle(lerp(236, 440, ease(t)), lane, 8, { fill: P.BLUE });
          else if (ok[i] && t < 2.6) c.circle(lerp(440, 845, (t - 1) / 1.6), lane, 8, { fill: t < 1.6 ? P.BLUE : P.GREEN });
          else if (!ok[i] && t < 1.8) c.circle(440, lane + (t - 1) * 70, 8, { fill: mix(P.RED, P.BG, (t - 1) * .9) });
        }
        L.node(c, 40, 30, 190, 120, 'k6', '부하발생기', { outline: P.BLUE, width: 3 });
        L.node(c, 445, 30, 190, 120, '보안장비', '속도 제한', { outline: P.ORANGE, width: 3, fill: P.ORANGE_BG, color: P.ORANGE });
        L.node(c, 850, 30, 190, 120, 'WAS', 'APM이 봄', { outline: P.GREEN, width: 3 });
        var g = final ? 1 : clamp((f - leg) / T);  // 장비에 첫 점이 닿은 뒤로 막은 요청과 처리한 요청이 센다
        var nSent = Math.round(S.sent * (final ? 1 : clamp(f / (T + leg)))), nPass = Math.round(S.passed * g), nLim = Math.round(S.limited * g);
        c.text(135, 180, '보낸 요청 ' + fmt(nSent), 26, P.BLUE, 'bold', 'mm');
        c.text(540, 180, '막은 요청 ' + fmt(nLim), 26, P.RED, 'bold', 'mm');
        c.text(945, 180, '처리 ' + fmt(nPass), 26, P.GREEN, 'bold', 'mm');
        card(c, 40, 240, 490, 150, { outline: P.BLUE, width: 3 });
        c.text(64, 272, 'k6가 본 것', 26, P.BLUE, 'bold');
        c.text(64, 320, '실패율 ' + ((final ? S.failed : nSent ? nLim / nSent : 0) * 100).toFixed(1) + '%', 32, P.RED, 'bold');
        if (final) c.text(64, 362, '평균 응답시간 ' + S.duration.toFixed(1) + 'ms (서버 ' + fmt(S.server) + 'ms보다 짧음)', 22, P.MUTED, 'semibold');
        card(c, 550, 240, 490, 150, { outline: P.GREEN, width: 3 });
        c.text(574, 272, 'APM이 본 것', 26, P.GREEN, 'bold');
        c.text(574, 320, fmt(nPass) + '건 · 오류 0', 32, P.INK, 'bold');
        if (final) c.text(574, 362, '서버가 일한 시간 평균 ' + fmt(S.server) + 'ms', 22, P.MUTED, 'semibold');
        return c.done();
      }
      var A = 16;  // 처음 점이 장비에 닿을 때까지(8프레임)와 그 뒤 잠깐을 '보내기'로 본다
      return [hold(500, function () { return draw(-1); }),
        seg(A * FRAME, function (p) { return draw(p * A); }, { step: 1 }),
        seg((END - A) * FRAME, function (p) { return draw(A + p * (END - A)); }, { step: 2 }),
        hold(3400, function () { return draw(END, true); }, { step: 3 })];
    }
  });

  /* ---------------------------------------------------------------- 특정 도구가 막힌 경우 (실험, 정지 그림) */
  F.define('ua-block', {
    title: '같은 시험, 도구가 막힌 경우',
    meta: '실험 · k6 v1.4.2 · 막는 규칙은 가정',
    data: 'loadgen2', height: 380, still: true,
    say: ['막힌 시험이 TPS는 가장 높고 응답시간은 가장 짧음', 'bad'],
    timeline: function (K, D) {
      var U = D.ua, y0 = 24;
      var cols = [[40, '기본 User-Agent', 'Grafana k6/1.4.2', U.blocked, P.RED, P.RED_BG, true], [560, '시험용으로 허용한 User-Agent', 'LoadTest-Internal/1.0', U.allowed, P.BLUE, P.BLUE_BG, false]];
      return [hold(1, function () {
        var c = new Canvas();
        cols.forEach(function (col) {
          var x = col[0], d = col[3], fg = col[4], blocked = col[6];
          card(c, x, y0, 480, 336, { outline: fg, width: 3 });
          pill(c, x + 20, y0 + 40, col[1], fg, col[5], 24);
          c.text(x + 24, y0 + 90, col[2], 22, P.MUTED, 'semibold');
          [['TPS', fmt(d.tps)], ['실패율', Math.round(d.failed * 100) + '%'], ['평균 응답시간', d.duration.toFixed(1) + 'ms'], ['APM이 본 요청', fmt(d.app)]].forEach(function (r, i) {
            var y = y0 + 140 + i * 52;
            c.text(x + 24, y, r[0], 24, P.TEXT, 'semibold');
            c.text(x + 456, y, r[1], 30, blocked && i !== 3 ? fg : P.INK, 'bold', 'rm');
          });
        });
        return c.done();
      })];
    }
  });

  /* ---------------------------------------------------------------- 부하발생기가 밀리면 (실험)
   * 질문: 서버는 그대로인데 k6 응답시간이 커지면 서버 탓일까? 조건: 응답 뒤에 스크립트가 CPU를 4ms 쓰게 하고 목표 TPS를 올린다.
   * 변하는 것: 서버가 일한 시간은 21ms로 같은데 k6 p95는 20ms에서 191ms로 커지고 못 시작한 요청이 생긴다.
   * 알 수 있는 것: 부하발생기가 밀리면 서버가 느려진 것처럼 보인다. */
  F.define('generator', {
    title: '서버는 그대로, 부하발생기만 밀릴 때',
    meta: '실험 · k6 v1.4.2 · p95',
    data: 'loadgen2', height: 500,
    steps: [['1,000', '목표 1,000: 두 선이 붙어 있음', 'ok'], ['2,000', '목표 2,000: 아직 같음', 'ok'], ['3,200', '목표 3,200: k6만 커지기 시작', 'warn'], ['3,600', '목표 3,600: 서버 시간은 그대로, k6 p95 191ms', 'bad']],
    timeline: function (K, D) {
      var rows = D.gen.rows, N = rows.length, x0 = 130, x1 = 1010, y0 = 108, y1 = 408, MAX = 200;
      function px(i) { return lerp(x0 + 60, x1 - 60, i / (N - 1)); }
      function py(v) { return lerp(y1, y0, Math.min(v, MAX) / MAX); }

      function draw(lead, a) {  // lead: 선이 몇 번째 구간까지 그려졌나(0~4), a: 첫 점이 나타난 정도
        var c = new Canvas(), v, i;
        var w1 = pill(c, 40, 42, 'k6가 잰 응답시간', P.RED, P.RED_BG, 22);
        pill(c, 40 + w1 + 24, 42, '서버가 일한 시간', P.BLUE, P.BLUE_BG, 22);
        for (v = 0; v <= MAX; v += 50) {
          c.line([[x0, py(v)], [x1, py(v)]], P.GRID, 2);
          c.text(x0 - 14, py(v), String(v), 22, P.FAINT, 'medium', 'rm');
        }
        rows.forEach(function (r, i) { c.text(px(i), y1 + 28, fmt(r.rate), 22, P.FAINT, 'medium', 'mm'); });
        c.text(x1, y1 + 60, '목표 TPS', 22, P.FAINT, 'medium', 'rm');
        [['duration', P.RED], ['server', P.BLUE]].forEach(function (s) {  // 파랑을 위에 그려 두 선이 붙은 곳에서는 파랑이 보인다
          var pts = rows.map(function (r, i) { return [px(i), py(r[s[0]])]; }), full = Math.floor(lead), path = pts.slice(0, full + 1);
          if (full < N - 1 && lead > full) path.push([lerp(pts[full][0], pts[full + 1][0], lead - full), lerp(pts[full][1], pts[full + 1][1], lead - full)]);
          if (path.length > 1) c.line(path, s[1], 5);
          for (i = 0; i < N; i++) {
            var r = 8 * (i ? ease(clamp((lead - i) / .08 + 1)) : ease(a));
            if (r > 0) c.circle(pts[i][0], pts[i][1], r, { fill: s[1] });
          }
        });
        if (a > .5) {
          var d = rows[Math.min(N - 1, Math.floor(lead + .5))];
          c.text(1040, 42, '목표 ' + fmt(d.rate) + ' · 못 시작한 요청 ' + fmt(d.dropped), 24, d.dropped ? P.RED : P.INK, 'bold', 'rm');
        }
        return c.done();
      }
      return [hold(600, function () { return draw(0, 0); }),
        seg(450, function (p) { return draw(0, ease(p)); }, { step: 1 }),
        hold(1300, function () { return draw(0, 1); }),
        seg(650, function (p) { return draw(ease(p), 1); }, { step: 2 }),
        hold(1300, function () { return draw(1, 1); }),
        seg(600, function (p) { return draw(1 + ease(p), 1); }),
        seg(700, function (p) { return draw(2 + ease(p), 1); }, { step: 3 }),
        hold(1700, function () { return draw(3, 1); }),
        seg(800, function (p) { return draw(3 + ease(p), 1); }, { step: 4 }),
        hold(3000, function () { return draw(4, 1); })];
    }
  });

  /* ---------------------------------------------------------------- 어디서 쏘면 무엇이 보이나 (모식도, 정지 그림) */
  F.define('coverage', {
    title: '어디서 쏘면 무엇이 보이나',
    meta: '모식도 · 흔한 구성을 가정',
    height: 588, still: true,
    say: ['부하발생기는 어디에 있든 자원을 확인', 'warn'],
    timeline: function () {
      var cols = [['WAS에', '바로', 480], ['내부 LB를', '거쳐', 650], ['외부망', '실제 경로', 850]];
      var rows = [['서버(WAS·DB) 처리 한계', 1, 1, 1], ['로드밸런서·TLS 처리 한계', 0, 1, 1], ['방화벽·WAF의 검사 지연, 속도 제한', 0, 0, 1],
        ['봇·매크로 차단', 0, 0, 1], ['인터넷 구간 대역폭, 거리(왕복)', 0, 0, 1], ['부하발생기 자체의 한계', 2, 2, 2]];  // 1: 드러남, 0: 드러나지 않음, 2: 어디서든
      return [hold(1, function () {
        var c = new Canvas();
        cols.forEach(function (col) {
          c.text(col[2], 34, col[0], 24, P.INK, 'bold', 'mm');
          c.text(col[2], 62, col[1], 24, P.INK, 'bold', 'mm');
        });
        rows.forEach(function (r, i) {
          var y = 136 + i * 70;
          if (i % 2 === 0) c.rect(40, y - 30, 1000, 60, { fill: P.SOFT, r: 8 });
          c.text(60, y, r[0], 26, P.INK, 'semibold');
          cols.forEach(function (col, j) {
            if (r[j + 1] === 1) check(c, col[2], y, P.GREEN);
            else if (r[j + 1] === 0) cross(c, col[2], y, P.RED);
            else c.text(col[2], y, '어디서든', 22, P.ORANGE, 'bold', 'mm');
          });
        });
        var x = 52;
        [['시험에서 드러남', P.GREEN, check], ['드러나지 않음', P.RED, cross]].forEach(function (l) {
          l[2](c, x + 12, 556, l[1], 10);
          c.text(x + 36, 556, l[0], 22, P.TEXT, 'semibold');
          x += 260;
        });
        return c.done();
      })];
    }
  });

  /* ---------------------------------------------------------------- 진단표 (정리, 정지 그림) */
  F.define('triage', {
    title: 'k6와 APM 숫자가 다를 때 먼저 볼 곳',
    meta: '정리',
    needs: ['loadgen'], height: 690, still: true,
    timeline: function () {
      var C = F.loadgen.COLOR;
      var rows = [[['blocked · connecting · tls가 큼', 'duration은 정상'], C.connecting, ['새 연결을 처리하는 곳', '방화벽, 로드밸런서, TLS 장비, 먼 거리']],
        [['sending이 큼', '요청 본문이 큼'], C.sending, ['올리는 쪽 회선', '부하발생기의 회선, 요청 크기']],
        [['waiting이 큼', 'APM(서버) 시간은 작음'], C.waiting, ['중간 장비와 왕복 시간', '검사와 대기, 거리']],
        [['waiting이 크고', 'APM(서버) 시간도 큼'], P.GREEN, ['서버 자체', '앱, DB, 스레드']],
        [['receiving이 큼', 'waiting은 일정'], C.receiving, ['내려받는 회선', '응답 크기, 대역폭']],
        [['실패율은 오르고 응답시간은 줄어듦', 'APM 요청 수도 줄어듦'], P.RED, ['장비의 차단과 제한', '상태 코드 403, 429']],
        [['모든 구간이 같이 늘어남', 'dropped_iterations가 생김'], P.PURPLE, ['부하발생기의 자원', 'CPU, 메모리, 회선, 포트']]];
      return [hold(1, function () {
        var c = new Canvas();
        c.text(40, 34, 'k6에서 이렇게 보이면', 24, P.FAINT, 'semibold');
        c.text(610, 34, '먼저 의심할 곳', 24, P.FAINT, 'semibold');
        rows.forEach(function (r, i) {
          var y = 66 + i * 88, color = r[1];
          card(c, 40, y, 530, 76, { outline: color, width: 3 });
          c.text(60, y + 25, r[0][0], 24, P.INK, 'bold');
          c.text(60, y + 54, r[0][1], 22, P.MUTED, 'semibold');
          arrow(c, [578, y + 38], [602, y + 38], P.FAINT);
          c.rect(610, y, 430, 76, { fill: mix(color, P.BG, .9), r: 12 });
          c.text(628, y + 25, r[2][0], 24, P.INK, 'bold');
          c.text(628, y + 54, r[2][1], 22, P.MUTED, 'semibold');
        });
        return c.done();
      })];
    }
  });
});
