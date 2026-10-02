/* k6와 APM 글(loadgen-vs-apm)의 앞쪽 그림: timeline, journey, tls, rtt, upload, gap.
 * 공통 도구는 F.loadgen(loadgen-common.js), 실험 값은 F.data.loadgen.lab(loadgen-data.js), 예시 값과 계산은 loadgen1-data.js(scripts/figure_data/loadgen1.py). */
(window.FigureModules = window.FigureModules || []).push(function (F) {
  var K = F.kit, P = K.P, Canvas = K.Canvas, mix = K.mix, ease = K.ease, lerp = K.lerp, clamp = K.clamp, hold = K.hold, seg = K.seg, pill = K.pill, fmt = K.fmt;

  function fd(color, k) { return mix(P.BG, color, clamp(k)); }  // 바탕에서 색으로 나타남(k=0 안 보임, 1 제 색)
  function bracketL(c, a, b, y, color, label, below, size) {  // G.bracket과 같지만 라벨이 왼쪽 가장자리(40) 밖으로 나가지 않게 민다
    var d = below ? -12 : 12, w = c.tw(label, size, 'bold');
    c.line([[a, y + d], [a, y], [b, y], [b, y + d]], color, 3);
    c.text(Math.max((a + b) / 2, 40 + w / 2), y + (below ? 30 : -30), label, size, color, 'bold', 'mm');
  }

  /* ---------------------------------------------------------------- 1. k6가 요청 하나를 나눠 재는 구간 (모식도)
   * 질문: 다섯 구간 중 duration에 들어가는 것은? 변하는 것: 구간이 이어 붙고 괄호가 생기고, 마지막에 연결 재사용이면 connecting과 tls가 0이 된다.
   * 알 수 있는 것: blocked(connecting, tls)는 duration 밖이고, 연결을 재사용하면 0이다. */
  F.define('timeline', {
    title: 'k6가 요청 하나를 나눠 재는 구간',
    meta: '모식도 · 길이는 실제 비율이 아님',
    needs: ['loadgen'],
    height: 310,
    steps: [['blocked', 'blocked(connecting, tls)는 http_req_duration에 들어가지 않음', 'warn'], ['재사용', '연결을 재사용하면 connecting과 tls는 0', 'ok']],
    timeline: function () {
      var G = F.loadgen, PH = G.PHASES, COLOR = G.COLOR;
      var widths = { connecting: 150, tls_handshaking: 170, sending: 140, waiting: 300, receiving: 150 };
      var notes = { connecting: 'TCP 연결', tls_handshaking: 'TLS 핸드셰이크', sending: '요청 보내기', waiting: '첫 바이트가 올 때까지', receiving: '응답 받기' };
      var X0 = 85, Y = 90, H = 76, pos = {}, x = X0;
      PH.forEach(function (n) { pos[n] = x; x += widths[n]; });
      var blocked = [pos.connecting, pos.tls_handshaking + widths.tls_handshaking - 4], dur = [pos.sending, pos.receiving + widths.receiving - 4];

      // p: 구간이 차례로 나타남(0~1), br: 괄호가 나타남(0~1), g: connecting과 tls가 0으로 바뀜(0~1)
      function draw(p, br, g) {
        var c = new Canvas();
        PH.forEach(function (n, i) {
          var q = ease((p - i * .175) / .3), w = widths[n] - 4, cx = pos[n] + w / 2, col = COLOR[n];
          if (q <= 0) return;
          var zero = g > 0 && (n === 'connecting' || n === 'tls_handshaking'), name = n === 'tls_handshaking' ? 'TLS' : n, size = n === 'receiving' ? 22 : 24;
          if (zero) {
            c.rect(pos[n], Y, w, H, { fill: mix(col, P.BG, .9 * g), r: 6 });
            c.raw('<rect x="' + (pos[n] + 1) + '" y="' + (Y + 1) + '" width="' + (w - 2) + '" height="' + (H - 2) + '" rx="5" fill="none" stroke="' + K.css(fd(col, g)) + '" stroke-width="2" stroke-dasharray="8 6"/>');
            c.text(cx, Y + H / 2 - 14 * clamp(g * 2), name, size, fd(col, g), 'bold', 'mm');
            if (g > .4) c.text(cx, Y + H / 2 + 16, '0', 28, fd(P.GREEN, g * 2.5 - 1), 'bold', 'mm');
          } else {
            c.rect(pos[n], Y, w, H, { fill: mix(col, P.BG, 1 - q), r: 6 });
            c.text(cx, Y + H / 2, name, size, P.BG, 'bold', 'mm');
          }
          c.text(cx, Y + H + 110, notes[n], 22, fd(P.MUTED, q), 'semibold', 'mm');
        });
        if (br > 0) {
          bracketL(c, blocked[0], blocked[1], Y - 24, fd(P.MUTED, br), 'http_req_blocked · 새 연결을 얻을 때까지', false, 24);
          bracketL(c, dur[0], dur[1], Y + H + 26, fd(P.BLUE, br), 'http_req_duration = sending + waiting + receiving', true, 24);
        }
        return c.done();
      }
      return [hold(400, function () { return draw(0, 0, 0); }),
        seg(1200, function (p) { return draw(p, 0, 0); }),
        seg(500, function (p) { return draw(1, ease(p), 0); }, { step: 1 }),
        hold(2600, function () { return draw(1, 1, 0); }),
        seg(600, function (p) { return draw(1, 1, ease(p)); }, { step: 2 }),
        hold(2800, function () { return draw(1, 1, 1); })];
    }
  });

  /* ---------------------------------------------------------------- 2. 요청 하나의 여행 (모식도, 예시 값: 왕복 30ms, 장비 검사 60ms, 서버 120ms)
   * 질문: k6와 APM의 응답시간은 왜 다른가? 변하는 것: 요청 하나가 지나가는 동안 k6의 구간이 차례로 채워지고, APM은 그중 서버 구간만 잰다.
   * 알 수 있는 것: APM에 안 보이는 시간(연결, TLS, 왕복, 장비 검사)이 k6 숫자에는 들어 있다. */
  F.define('journey', {
    title: '요청 하나의 여행',
    meta: '모식도 · 예시 값 · 왕복 30ms',
    data: 'loadgen1',
    needs: ['loadgen'],
    height: 456,
    steps: [['연결', '연결: TCP 연결을 맺음 · TLS: 암호화 협상', 'info'], ['보내기', '요청 보내기', 'info'], ['기다림', '기다림: 왕복 + 장비 검사 + 서버', 'info'],
      ['받기', '응답 받기', 'info'], ['정리', 'k6 220ms · APM 120ms · 연결 90ms는 duration 밖', 'bad']],  // 220, 120, 90은 loadgen1.py가 확인
    timeline: function (K, D) {
      var G = F.loadgen, PH = G.PHASES, COLOR = G.COLOR, J = D.journey, JP = J.phases;
      var NODES = [['부하발생기', 'k6'], ['방화벽 · WAF', null], ['로드밸런서', null], ['WAS', 'APM']];
      var NX = [40, 304, 568, 832], NW = 208, SCALE = 3.2, BX = 44, BY = 224, BH = 56, PY = 142;
      var INNER = J.rtt + J.device + J.server, B = (J.rtt + J.device) / INNER;  // 기다림 중 장비 검사가 끝나 서버로 넘어가는 지점
      var TOTAL = JP.reduce(function (s, ph) { return s + ph[1]; }, 0);
      var PARTS = [['왕복', J.rtt, P.MUTED, .55], ['장비 검사', J.device, P.ORANGE, .12], ['서버', J.server, P.GREEN, .12]];
      var before = JP.slice(0, 3).reduce(function (s, ph) { return s + ph[1]; }, 0), WX = BX + before * SCALE;

      // stage: 0 연결 ~ 4 받기(null이면 처음), prog: 그 구간의 진행(0~1), final: 마지막 정리 장면
      function draw(stage, prog, final) {
        var c = new Canvas(), hotCol = stage == null ? null : COLOR[PH[stage]];
        NODES.forEach(function (nd, i) {
          var hot = stage != null && ((stage <= 1 && (i === 0 || i === 2)) || (stage === 2 && (i === 0 || i === 3)) || (stage === 3 && i === (prog < B ? 1 : 3)) || (stage === 4 && (i === 0 || i === 3)));
          G.node(c, NX[i], 24, NW, 90, nd[0], nd[1], { outline: hot ? hotCol : P.GRID, width: hot ? 4 : 2, size: 26 });
          if (i) K.arrow(c, [NX[i - 1] + NW + 4, 69], [NX[i] - 4, 69], P.FAINT);
        });
        if (stage != null && !final) {  // 요청 알갱이. 연결은 1왕복, TLS는 2왕복
          var a = 0, b = 2, k = 0;
          if (stage === 0) k = Math.sin(prog * Math.PI);
          else if (stage === 1) k = Math.abs(Math.sin(prog * Math.PI * 2));
          else if (stage === 2) { b = 3; k = prog; }
          else if (stage === 3) a = b = prog < B ? 1 : 3;
          else { a = 3; b = 0; k = prog; }
          c.circle(lerp(NX[a], NX[b], ease(k)) + NW / 2, PY, 12, { fill: hotCol });
        }
        var x = BX;
        JP.forEach(function (ph, i) {  // 아래 막대: 지나간 구간은 가득, 지금 구간은 진행만큼
          var frac = final || (stage != null && i < stage) ? 1 : i === stage ? prog : 0, w = ph[1] * SCALE * frac;
          if (frac > 0) {
            c.rect(x, BY, Math.max(w - 2, 3), BH, { fill: COLOR[ph[0]], r: 4 });
            if (w > 60) c.text(x + w / 2, BY + BH / 2, Math.round(ph[1] * frac) + 'ms', 22, P.BG, 'bold', 'mm');
          }
          x += ph[1] * SCALE;
        });
        c.line([[BX, BY + BH + 8], [BX + TOTAL * SCALE, BY + BH + 8]], P.GRID, 2);
        if ((stage === 3 && prog > 0) || stage === 4 || final) {  // 기다림 안쪽: 왕복 + 장비 검사 + 서버
          var f = stage === 4 || final ? 1 : prog, used = 0;
          PARTS.forEach(function (pt) {
            var w = Math.max(0, Math.min(pt[1], f * INNER - used)) * SCALE, soft = pt[2] === P.MUTED;
            if (w > 0) {
              c.rect(WX + used * SCALE, BY + 96, Math.max(w - 2, 3), 44, { fill: mix(pt[2], P.BG, pt[3]), r: 4 });
              if (w > 70) c.text(WX + used * SCALE + w / 2, BY + 118, pt[0] + ' ' + pt[1], 22, soft ? P.INK : P.BG, 'bold', 'mm');
            }
            used += pt[1];
          });
        }
        if (stage === 4 || final) G.bracket(c, WX + (J.rtt + J.device) * SCALE, WX + INNER * SCALE - 2, BY + 168, P.GREEN, 'APM ' + J.server + 'ms');
        if (final) {
          var blockedEnd = BX + (JP[0][1] + JP[1][1]) * SCALE;
          G.bracket(c, blockedEnd, BX + TOTAL * SCALE - 2, BY - 22, P.BLUE, 'k6 duration ' + J.duration + 'ms', { below: false });
          G.bracket(c, BX, blockedEnd - 4, BY - 22, P.MUTED, 'blocked ' + (JP[0][1] + JP[1][1]) + 'ms', { below: false });
        }
        return c.done();
      }

      var segs = [hold(500, function () { return draw(null, 0); })];
      [[0, 800, 500, 1], [1, 1000, 400, 1], [2, 600, 300, 2], [3, 1700, 600, 3], [4, 600, 1500, 4]].forEach(function (s) {
        var st = s[0];
        segs.push(seg(s[1], function (p) { return draw(st, p); }, { step: s[3] }));
        segs.push(hold(s[2], function () { return draw(st, 1); }));
      });
      segs.push(hold(2600, function () { return draw(4, 1, true); }, { step: 5 }));
      return segs;
    }
  });

  /* ---------------------------------------------------------------- 3. duration은 같은데 blocked만 큰 경우 (실험)
   * 질문: duration이 정상이면 연결 쪽은 문제없는 걸까? 조건: 같은 서버에 연결 지연(300ms)을 넣고 새 연결/재사용으로 잰다.
   * 변하는 것: duration은 54ms로 같은데 blocked만 316ms로 커진다. 알 수 있는 것: 연결 문제는 duration만 보면 안 보인다. */
  F.define('tls', {
    title: 'duration은 같은데 blocked만 큰 경우',
    meta: '실험 · k6 v1.4.2 · 평균',
    data: 'loadgen',
    needs: ['loadgen'],
    height: 545,
    steps: [['duration', '세 경우 모두 duration은 54ms 안팎', 'info'], ['blocked', '연결 지연은 blocked에만 보임', 'bad']],
    timeline: function () {
      var G = F.loadgen, lab = G.lab, X0 = 60, SC = 1.9, YS = [113, 273, 433];
      var CASES = [['tls_direct', '새 연결마다 · 지연 없음'], ['tls_delay_new', '새 연결마다 · 연결 지연 300ms'], ['tls_delay_reuse', '연결 재사용 · 연결 지연 300ms']];

      // t: 막대가 자람(0~1), hot: 두 번째 경우를 강조(0~1)
      function draw(t, hot) {
        var c = new Canvas();
        G.legend(c, 60, 33, ['connecting', 'tls_handshaking', 'waiting']);
        CASES.forEach(function (cs, i) {
          var y = YS[i], h = i === 1 ? hot : 0, key = cs[0], by = y + 6, dur = lab(key, 'duration'), blocked = lab(key, 'blocked');
          if (h > 0) c.rect(40, y - 40, 1000, 150, { fill: mix(P.BG, P.RED_FILL, h), r: 12 });
          c.text(X0, y - 20, cs[1], 26, P.INK, 'bold');
          var e1 = G.segBar(c, X0 + 150, by, 36, 36, [['connecting', lab(key, 'connecting')], ['tls_handshaking', lab(key, 'tls_handshaking')]], SC, { fade: ease(t) });
          c.text(X0 + 140, by + 18, 'blocked', 22, P.MUTED, 'semibold', 'rm');
          var e2 = G.segBar(c, X0 + 150, by + 50, 36, 36, [['waiting', dur]], SC, { fade: ease(t) });
          c.text(X0 + 140, by + 68, 'duration', 22, P.MUTED, 'semibold', 'rm');
          var k = (t - .85) / .15;
          if (k > 0) {
            c.text(Math.max(e1, X0 + 150) + 14, by + 18, fmt(blocked) + 'ms', 26, fd(mix(P.INK, P.RED, h), k), 'bold');
            c.text(Math.max(e2, X0 + 150) + 14, by + 68, fmt(dur) + 'ms', 26, fd(P.INK, k), 'bold');
          }
        });
        return c.done();
      }
      return [hold(500, function () { return draw(0, 0); }),
        seg(1400, function (p) { return draw(p, 0); }),
        hold(2800, function () { return draw(1, 0); }, { step: 1 }),
        seg(400, function (p) { return draw(1, ease(p)); }, { step: 2 }),
        hold(3000, function () { return draw(1, 1); })];
    }
  });

  /* ---------------------------------------------------------------- 4. 거리가 멀면 새 연결이 비싸다 (계산: 새 연결 = 3왕복 + 서버, 재사용 = 1왕복 + 서버)
   * 알 수 있는 것: APM은 거리와 상관없이 120ms이고 k6 숫자만 커진다. 계산은 loadgen1.py의 rtt_rows. */
  F.define('rtt', {
    title: '거리가 멀면 새 연결이 비싸다',
    meta: '계산 · 서버가 일한 시간 120ms · TLS 1.3',
    data: 'loadgen1',
    needs: ['loadgen'],
    height: 426,
    still: true,
    say: ['APM은 거리와 상관없이 120ms, k6 숫자만 커짐', 'bad'],
    timeline: function (K, D) {
      var G = F.loadgen, COLOR = G.COLOR, X0 = 330, light = mix(P.BLUE, P.BG, .55), SV = D.rtt.server;
      return [hold(1, function () {
        var c = new Canvas();
        var x = G.legend(c, 40, 30, ['connecting', 'tls_handshaking']);
        [['왕복(waiting 안)', light], ['서버(APM)', P.GREEN]].forEach(function (it) {
          c.rect(x, 21, 18, 18, { fill: it[1], r: 4 });
          c.text(x + 26, 30, it[0], 22, P.TEXT, 'semibold');
          x += 26 + c.tw(it[0], 22, 'semibold') + 32;
        });
        D.rtt.rows.forEach(function (r, i) {
          var y = 66 + i * 128;
          pill(c, 40, y + 42, '왕복 ' + r.rtt + 'ms', P.MUTED, P.SOFT, 24);
          [['새 연결', [['connecting', r.rtt], ['tls_handshaking', r.rtt], ['rtt', r.rtt], ['server', SV]]], ['재사용', [['rtt', r.rtt], ['server', SV]]]].forEach(function (row, k) {
            var yy = y + k * 48, cx = X0, total = 0;
            row[1].forEach(function (pt) {
              c.rect(cx, yy, Math.max(pt[1] - 1, 2), 36, { fill: COLOR[pt[0]] || (pt[0] === 'rtt' ? light : P.GREEN), r: 4 });
              cx += pt[1]; total += pt[1];
            });
            c.text(X0 - 14, yy + 18, row[0], 22, P.MUTED, 'semibold', 'rm');
            c.text(cx + 12, yy + 18, fmt(total) + 'ms', 26, P.INK, 'bold');
          });
        });
        return c.done();
      })];
    }
  });

  /* ---------------------------------------------------------------- 5. 업로드 8MB 요청 하나 (실험)
   * 알 수 있는 것: 큰 요청은 서버가 본문을 다 읽을 때까지의 시간이 sending과 waiting에 나뉘어 잡힌다. */
  F.define('upload', {
    title: '업로드 8MB 요청 하나',
    meta: '실험 · k6 v1.4.2 · 서버가 읽는 속도를 8,192KB/s로 제한',
    data: 'loadgen',
    needs: ['loadgen'],
    height: 286,
    still: true,
    say: ['서버가 본문을 다 읽을 때까지 1,907ms, 그중 716ms는 waiting에 잡힘', 'bad'],  // 1,907 = sending + waiting, 716 = waiting. loadgen1.py가 확인
    timeline: function () {
      var G = F.loadgen, lab = G.lab, X0 = 60, SC = .5;
      return [hold(1, function () {
        var c = new Canvas(), snd = lab('upload', 'sending'), wt = lab('upload', 'waiting'), rcv = lab('upload', 'receiving');
        G.legend(c, 60, 30, ['sending', 'waiting', 'receiving']);
        G.segBar(c, X0, 70, 70, 70, [['sending', snd], ['waiting', wt], ['receiving', rcv]], SC, { labels: true });
        G.bracket(c, X0, X0 + snd * SC, 168, P.ORANGE, 'sending ' + fmt(snd) + 'ms · 운영체제 버퍼에 다 넣을 때까지', { size: 22 });
        G.bracket(c, X0 + snd * SC + 4, X0 + (snd + wt) * SC, 168, P.BLUE, 'waiting ' + fmt(wt) + 'ms', { size: 22 });
        c.text(K.W / 2, 252, 'VU 2개가 한도를 나눠 쓰므로 8MB ÷ 4,096KB/s ≈ 2초', 22, P.MUTED, 'medium', 'mm');
        return c.done();
      })];
    }
  });

  /* ---------------------------------------------------------------- 6. waiting 안에서 서버 시간 빼기 (실험)
   * 질문: waiting이 같으면 원인도 같을까? 조건: 서버가 500ms 일하는 경우와 장비가 450ms 검사하고 서버는 50ms 일하는 경우.
   * 변하는 것: k6 waiting은 둘 다 약 500ms인데 서버가 보고한 시간이 502ms와 52ms로 갈린다. 알 수 있는 것: waiting − 서버 시간이 중간 구간의 몫이다. */
  F.define('gap', {
    title: 'waiting 안에서 서버 시간 빼기',
    meta: '실험 · k6 v1.4.2 · 평균',
    data: 'loadgen',
    needs: ['loadgen'],
    height: 404,
    steps: [['waiting', 'waiting은 둘 다 약 500ms', 'info'], ['원인', '서버 시간이 갈라지면 원인 위치가 갈림', 'bad']],
    timeline: function () {
      var G = F.loadgen, lab = G.lab, X0 = 90, SC = 1.35;
      var CASES = [['server_slow', '서버가 느린 경우', 64], ['device_delay', '장비가 검사하느라 느린 경우', 224]];
      var LEG = 'waiting − 서버 시간 = 중간 구간';

      // t: 막대가 자람(0~1), hot: 두 번째 경우를 강조(0~1)
      function draw(t, hot) {
        var c = new Canvas(), k = (t - .8) / .2;
        CASES.forEach(function (cs) {
          var key = cs[0], y = cs[2], wt = lab(key, 'waiting'), srv = lab(key, 'server_time'), gap = wt - srv, h = key === 'device_delay' ? hot : 0;
          if (h > 0) c.rect(40, y - 56, 1000, 176, { fill: mix(P.BG, P.RED_FILL, h), r: 12 });
          c.text(X0, y - 22, cs[1], 28, P.INK, 'bold');
          var e = G.segBar(c, X0, y + 10, 52, 52, [['waiting', srv]], SC, { colors: { waiting: P.GREEN }, fade: ease(t) });
          e = G.segBar(c, e, y + 10, 52, 52, [['sending', gap]], SC, { colors: { sending: P.ORANGE }, fade: ease(t) });
          if (k > 0) {
            if (srv * SC > 120) c.text(X0 + srv * SC / 2, y + 36, '서버 ' + fmt(srv), 24, mix(P.GREEN, P.BG, k), 'bold', 'mm');
            else c.text(X0 + srv * SC / 2, y + 86, '서버 ' + fmt(srv), 24, fd(P.GREEN, k), 'bold', 'mm');
            if (gap * SC > 120) c.text(X0 + srv * SC + gap * SC / 2, y + 36, '차이 ' + fmt(gap), 24, mix(P.ORANGE, P.BG, k), 'bold', 'mm');
            c.text(Math.max(e, X0) + 16, y + 36, 'waiting ' + fmt(wt) + 'ms', 26, fd(mix(P.INK, P.RED, h), k), 'bold');
          }
        });
        var ly = 392, x2 = X0 + 26 + c.tw('서버가 보고한 시간(APM과 같은 구간)', 22, 'semibold') + 32;
        c.rect(X0, ly - 9, 18, 18, { fill: P.GREEN, r: 4 });
        c.text(X0 + 26, ly, '서버가 보고한 시간(APM과 같은 구간)', 22, P.TEXT, 'semibold');
        c.rect(x2, ly - 9, 18, 18, { fill: P.ORANGE, r: 4 });
        c.text(x2 + 26, ly, LEG, 22, P.TEXT, 'semibold');
        return c.done();
      }
      return [hold(500, function () { return draw(0, 0); }),
        seg(1400, function (p) { return draw(p, 0); }),
        hold(2600, function () { return draw(1, 0); }, { step: 1 }),
        seg(400, function (p) { return draw(1, ease(p)); }, { step: 2 }),
        hold(3200, function () { return draw(1, 1); })];
    }
  });
});
