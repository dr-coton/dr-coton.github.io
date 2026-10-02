/* k6와 APM 글의 그림들이 함께 쓰는 도구와 색. 그림 정의에서는 needs: ['loadgen'] 으로 기다린 뒤 F.loadgen 으로 쓴다.
 * 이 파일에는 구성도 'path'도 들어 있다(HTML로 짠 그림의 본보기). */
(window.FigureModules = window.FigureModules || []).push(function (F) {
  var K = F.kit, P = K.P, card = K.card;

  var PHASES = ['connecting', 'tls_handshaking', 'sending', 'waiting', 'receiving'];
  var COLOR = { connecting: P.TEAL, tls_handshaking: P.PURPLE, sending: P.ORANGE, waiting: P.BLUE, receiving: P.ROSE };
  var SHORT = { connecting: '연결', tls_handshaking: 'TLS', sending: '보내기', waiting: '기다림', receiving: '받기' };

  function node(c, x, y, w, h, title, sub, o) {  // o: {outline, fill, width, color, size}
    o = o || {};
    card(c, x, y, w, h, { outline: o.outline || P.GRID, fill: o.fill || P.BG, width: o.width == null ? 2 : o.width });
    c.text(x + w / 2, y + h / 2 - (sub ? 14 : 0), title, o.size || 26, o.color || P.INK, 'bold', 'mm');
    if (sub) c.text(x + w / 2, y + h / 2 + 22, sub, 22, P.MUTED, 'medium', 'mm');
  }
  function bracket(c, x0, x1, y, color, label, o) {  // 가로 괄호. below(기본 true)면 눈금이 위로, 라벨은 아래에 둔다
    o = o || {};
    var below = o.below !== false, tick = o.tick || 12, d = below ? -tick : tick;
    c.line([[x0, y + d], [x0, y], [x1, y], [x1, y + d]], color, o.width || 3);
    c.text((x0 + x1) / 2, y + (below ? 30 : -30), label, o.size || 24, color, 'bold', 'mm');
  }
  function segBar(c, x, y, w, h, values, scale, o) {  // values: [[이름, 값]] 순서대로 이어 붙인 가로 막대. scale: 값 1당 픽셀. 그린 끝 x를 돌려준다
    o = o || {};
    var colors = o.colors || COLOR, fade = o.fade == null ? 1 : o.fade, minLabel = o.minLabel || 70, cx = x;
    values.forEach(function (nv) {
      var sw = nv[1] * scale * fade;
      if (sw <= 0) return;
      c.rect(cx, y, Math.max(sw, 2), h, { fill: colors[nv[0]], r: 4 });
      if (o.labels && sw > minLabel) c.text(cx + sw / 2, y + h / 2, K.fmt(nv[1]), 22, P.BG, 'bold', 'mm');
      cx += sw;
    });
    return cx;
  }
  function legend(c, x, y, names, o) {
    o = o || {};
    var size = o.size || 22, gap = o.gap == null ? 18 : o.gap;
    (names || PHASES).forEach(function (nm) {
      c.rect(x, y - 9, 18, 18, { fill: COLOR[nm], r: 4 });
      c.text(x + 26, y, SHORT[nm], size, P.TEXT, 'semibold');
      x += 26 + K.tw(SHORT[nm], size, 'semibold') + gap + 14;
    });
    return x;
  }
  // 실험 값: lab('baseline','waiting') → 평균, lab('baseline','waiting','p(95)') → 그 통계
  function lab(case_, phase, stat) { return F.data.loadgen.lab[case_][phase][stat || 'avg']; }

  F.provide('loadgen', { PHASES: PHASES, COLOR: COLOR, SHORT: SHORT, node: node, bracket: bracket, segBar: segBar, legend: legend, lab: lab });

  /* ---------------------------------------------------------------- 요청이 지나가는 길 (HTML로 짠 구성도: 글 폭에 따라 가로·세로로 바뀐다) */
  F.define('path', {
    title: '요청이 지나가는 길',
    meta: '모식도 · 흔한 구성을 가정',
    say: ['바로 쏘는 시험에는 방화벽 · 로드밸런서 · 바깥 구간이 없음', 'warn'],
    mount: function (body) {
      body.innerHTML = '<div class="pt"><div class="pt-map">' +
        '<div class="n n1"><b>외부 부하발생기</b><small>k6</small></div>' +
        '<div class="n n2"><b>방화벽 · WAF</b><small>봇 차단</small></div>' +
        '<div class="n n3"><b>로드밸런서</b><small>TLS 종단</small></div>' +
        '<div class="n n4"><b>WAS</b><small>APM이 봄</small></div>' +
        '<div class="n n5"><b>DB</b><small>&nbsp;</small></div>' +
        '<div class="n inner"><b>내부 부하발생기</b><small>WAS에 바로 쏘는 시험</small></div>' +
        '<div class="s s1"><b>k6가 재는 구간</b><small>요청을 보내고 응답이 돌아올 때까지</small></div>' +
        '<div class="s s2"><b>APM이 재는 구간</b><small>WAS 안(DB 호출 포함)</small></div></div></div>';
      var pt = body.firstChild;
      function fit() { pt.classList.toggle('col', pt.clientWidth < 540); }
      fit();
      return { duration: 0, render: function () { return 0; }, resize: fit };
    }
  });
});
