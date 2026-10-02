/* 글 속 그림 런타임: 코드 창 모양의 틀 + SVG 그림 + 반복 재생.
 * 그림 정의(assets/figures/*.js)는 FigureModules.push(function (F) { F.define(이름, 정의); }) 로 등록한다.
 * soft-nav.js가 글 안의 script를 순서 없이 다시 실행하므로, 이 파일이 두 번 실행돼도 문제없고 등록 순서도 상관없다. */
(function () {
  'use strict';
  if (window.Figures) { window.Figures.scan(); return; }

  var NS = 'http://www.w3.org/2000/svg';
  var W = 1080;          // 그림의 논리 폭. 화면에서는 글 폭에 맞춰 줄어든다
  var FADE_OUT = 350, FADE_IN = 250, GAP = 150;  // 반복 사이의 숨 고르기(ms)
  var defs = {}, data = {}, figs = [];
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- 색: 블로그 토큰과 코드 색에서 가져온다 */
  function hex(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  var PAL = {
    BG: '#fffefb', INK: '#333f37', TEXT: '#46514a', MUTED: '#73796f', FAINT: '#a5aa9d', GRID: '#e1e4d9', SOFT: '#f1f0e6',
    BLUE: '#3f6f82', BLUE_BG: '#dce8ec', BLUE_FILL: '#eef4f6',
    GREEN: '#5f7a45', GREEN_BG: '#e3ecd8',
    ORANGE: '#b98336', ORANGE_BG: '#f5ead2',
    RED: '#be5a43', RED_BG: '#f7e3dc', RED_FILL: '#fbefea',
    PURPLE: '#6e5a8c', PURPLE_BG: '#eae5f0',
    TEAL: '#3a8f86', AMBER: '#d0a24a', ROSE: '#b5607f', SKY: '#6f93b0', OLIVE: '#8a9a4a', BROWN: '#9c6b4e'
  };
  var P = {};
  Object.keys(PAL).forEach(function (k) { P[k] = hex(PAL[k]); });

  function css(c) { return typeof c === 'string' ? c : 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function mix(a, b, t) { return a.map(function (x, i) { return Math.round(x + (b[i] - x) * t); }); }  // t=0이면 a, t=1이면 b
  function clamp(t) { return Math.min(1, Math.max(0, t)); }
  function ease(t) { t = clamp(t); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function unit(v) { var n = Math.sqrt(v.reduce(function (s, x) { return s + x * x; }, 0)); return v.map(function (x) { return x / n; }); }
  function dot(a, b) { return a.reduce(function (s, x, i) { return s + x * b[i]; }, 0); }
  function n(x) { return String(Math.round(x * 100) / 100); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmt(x) { return Math.round(x).toLocaleString('en-US'); }

  /* ---------------------------------------------------------------- 글자 폭 재기 */
  var measure, fam = {};
  function family(kind) {
    if (!fam.sans) {
      var st = getComputedStyle(document.documentElement);
      fam.sans = st.getPropertyValue('--sans').trim() || 'sans-serif';
      fam.mono = st.getPropertyValue('--mono').trim() || 'monospace';
    }
    return fam[kind];
  }
  var WEIGHT = { regular: 400, medium: 500, semibold: 600, bold: 700, mono: 400 };
  function tw(s, size, weight) {
    weight = weight || 'regular';
    measure = measure || document.createElement('canvas').getContext('2d');
    measure.font = WEIGHT[weight] + ' ' + size + 'px ' + family(weight === 'mono' ? 'mono' : 'sans');
    return measure.measureText(s).width;
  }

  /* ---------------------------------------------------------------- Canvas: SVG 조각을 모으는 붓. 좌표는 1080 폭 기준이다 */
  function Canvas() { this.out = []; }
  Canvas.prototype = {
    rect: function (x, y, w, h, o) {  // o: {fill, outline, width=2, r=12}
      o = o || {};
      var r = o.r == null ? 12 : o.r, sw = o.outline ? (o.width == null ? 2 : o.width) : 0;
      this.out.push('<rect x="' + n(x + sw / 2) + '" y="' + n(y + sw / 2) + '" width="' + n(Math.max(0, w - sw)) + '" height="' + n(Math.max(0, h - sw)) +
        '" rx="' + n(Math.max(0, r - sw / 2)) + '" fill="' + (o.fill ? css(o.fill) : 'none') + '"' +
        (sw ? ' stroke="' + css(o.outline) + '" stroke-width="' + n(sw) + '"' : '') + '/>');
    },
    text: function (x, y, s, size, fill, weight, anchor) {
      weight = weight || 'regular'; anchor = anchor || 'lm';
      var ha = { l: 'start', m: 'middle', r: 'end' }[anchor.charAt(0)];
      this.out.push('<text x="' + n(x) + '" y="' + n(y) + '" font-size="' + size + '" font-weight="' + WEIGHT[weight] + '" fill="' + css(fill || P.TEXT) +
        '" text-anchor="' + ha + '"' + (anchor.charAt(1) === 'm' ? ' dominant-baseline="central"' : '') + (weight === 'mono' ? ' class="mono"' : '') + '>' + esc(s) + '</text>');
    },
    tw: tw,
    line: function (pts, fill, width) {
      this.out.push('<polyline points="' + pts.map(function (p) { return n(p[0]) + ',' + n(p[1]); }).join(' ') + '" fill="none" stroke="' + css(fill) +
        '" stroke-width="' + n(width == null ? 2 : width) + '" stroke-linecap="round" stroke-linejoin="round"/>');
    },
    dashed: function (a, b, fill, width, dash, gap) {
      this.out.push('<line x1="' + n(a[0]) + '" y1="' + n(a[1]) + '" x2="' + n(b[0]) + '" y2="' + n(b[1]) + '" stroke="' + css(fill) + '" stroke-width="' + n(width == null ? 2 : width) +
        '" stroke-dasharray="' + (dash || 8) + ' ' + (gap || 7) + '"/>');
    },
    circle: function (x, y, r, o) {  // o: {fill, outline, width=2}
      o = o || {};
      var sw = o.outline ? (o.width == null ? 2 : o.width) : 0;
      this.out.push('<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + n(Math.max(0, r - sw / 2)) + '" fill="' + (o.fill ? css(o.fill) : 'none') + '"' +
        (sw ? ' stroke="' + css(o.outline) + '" stroke-width="' + n(sw) + '"' : '') + '/>');
    },
    poly: function (pts, o) {
      o = o || {};
      this.out.push('<polygon points="' + pts.map(function (p) { return n(p[0]) + ',' + n(p[1]); }).join(' ') + '" fill="' + (o.fill ? css(o.fill) : 'none') + '"' +
        (o.outline ? ' stroke="' + css(o.outline) + '"' : '') + '/>');
    },
    arc: function (cx, cy, r, a0, a1, color, width) {  // 각도는 도(°), 3시 방향에서 시계 방향 (PIL과 같다)
      var p = function (a) { return n(cx + r * Math.cos(a * Math.PI / 180)) + ' ' + n(cy + r * Math.sin(a * Math.PI / 180)); };
      this.out.push('<path d="M' + p(a0) + ' A' + r + ' ' + r + ' 0 ' + (((a1 - a0) % 360 + 360) % 360 > 180 ? 1 : 0) + ' 1 ' + p(a1) + '" fill="none" stroke="' + css(color) + '" stroke-width="' + n(width || 2) + '"/>');
    },
    raw: function (s) { this.out.push(s); },
    done: function () { return this.out.join(''); }
  };

  /* ---------------------------------------------------------------- 공통 부품 */
  function pill(c, x, y, s, fg, bg, size, anchor) {  // 둥근 알약 라벨. 폭을 돌려준다
    size = size || 26; anchor = anchor || 'l';
    var w = tw(s, size, 'bold') + 32, h = Math.round(size * 1.75);
    x = anchor === 'm' ? x - w / 2 : anchor === 'r' ? x - w : x;
    c.rect(x, y - h / 2, w, h, { fill: bg, r: h / 2 });
    c.text(x + w / 2, y, s, size, fg, 'bold', 'mm');
    return w;
  }
  function card(c, x, y, w, h, o) {  // o: {outline, fill, width, lifted}
    o = o || {};
    if (o.lifted) c.rect(x + 2, y + 6, w, h, { fill: hex('#ece9dd'), r: 12 });
    c.rect(x, y, w, h, { fill: o.fill || P.BG, outline: o.outline || P.GRID, width: o.width == null ? 2 : o.width, r: 12 });
  }
  function check(c, x, y, color, s) { s = s || 14; c.line([[x - s, y], [x - s * .3, y + s * .7], [x + s, y - s * .75]], color, 4); }
  function cross(c, x, y, color, s) { s = s || 11; c.line([[x - s, y - s], [x + s, y + s]], color, 4); c.line([[x - s, y + s], [x + s, y - s]], color, 4); }
  function arrow(c, a, b, color, width, head) {
    width = width || 3; head = head || 12;
    var angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    var back = [b[0] - Math.cos(angle) * head, b[1] - Math.sin(angle) * head];
    c.line([a, back], color, width);
    var sx = Math.cos(angle + Math.PI / 2) * head * .6, sy = Math.sin(angle + Math.PI / 2) * head * .6;
    c.poly([b, [back[0] + sx, back[1] + sy], [back[0] - sx, back[1] - sy]], { fill: color });
  }
  function tile(c, x, y, size, color, kind, fade) {  // 상품 사진을 대신하는 작은 그림
    color = mix(color, P.BG, fade || 0);
    c.rect(x, y, size, size, { fill: mix(color, P.BG, .88), r: size * .2 });
    var cx = x + size / 2, cy = y + size / 2, s = size * .78, w = Math.max(2, size * .06);
    if (kind === 'shoe' || kind === 'shoe-flip') {
      var sign = kind === 'shoe-flip' ? -1 : 1;
      var upper = [[-.42, .12], [-.42, -.1], [-.3, -.2], [-.12, -.18], [.02, -.04], [.3, .02], [.44, .1], [.44, .16], [-.42, .16]];
      c.poly(upper.map(function (p) { return [cx + sign * p[0] * s, cy + p[1] * s]; }), { fill: color });
      c.rect(cx - .45 * s, cy + .14 * s, .91 * s, .1 * s, { fill: mix(color, P.INK, .35), r: .04 * s });
      for (var i = 0; i < 3; i++) {
        var lx = cx + sign * (-.16 * s + i * .1 * s);
        c.line([[lx, cy - .1 * s + i * .04 * s], [lx + sign * .06 * s, cy - .04 * s + i * .04 * s]], mix(color, P.BG, .7), Math.max(1.5, size * .03));
      }
    } else if (kind === 'laces') {
      c.circle(cx - .17 * s, cy - .08 * s, .15 * s, { outline: color, width: w });
      c.circle(cx + .17 * s, cy - .08 * s, .15 * s, { outline: color, width: w });
      c.line([[cx, cy - .04 * s], [cx - .3 * s, cy + .32 * s]], color, w);
      c.line([[cx, cy - .04 * s], [cx + .3 * s, cy + .32 * s]], color, w);
      c.circle(cx, cy - .05 * s, .06 * s, { fill: color });
    } else if (kind === 'mug') {
      c.rect(cx - .28 * s, cy - .26 * s, .44 * s, .52 * s, { fill: color, r: .06 * s });
      c.circle(cx + .2 * s, cy, .14 * s, { outline: color, width: w });
    } else if (kind === 'cap') {
      c.raw('<path d="M' + n(cx - .3 * s) + ' ' + n(cy + .04 * s) + ' A' + n(.3 * s) + ' ' + n(.3 * s) + ' 0 0 1 ' + n(cx + .3 * s) + ' ' + n(cy + .04 * s) + 'Z" fill="' + css(color) + '"/>');
      c.rect(cx - .02 * s, cy + .02 * s, .44 * s, .08 * s, { fill: color, r: .04 * s });
    } else {  // 'photo' 와 그 밖: 액자 속 산
      c.rect(cx - .4 * s, cy - .32 * s, .8 * s, .64 * s, { outline: color, width: Math.max(2, size * .05), r: .08 * s });
      c.circle(cx + .18 * s, cy - .12 * s, .08 * s, { fill: color });
      c.poly([[cx - .32 * s, cy + .24 * s], [cx - .1 * s, cy - .04 * s], [cx + .08 * s, cy + .14 * s], [cx + .18 * s, cy + .04 * s], [cx + .32 * s, cy + .24 * s]], { fill: color });
    }
  }

  /* 타임라인 부품: hold는 한 장면을 ms 동안 보여 주고, seg는 p(0~1)를 넘겨 가며 장면을 그린다 */
  function hold(ms, fn, o) { return { ms: ms, fn: fn, hold: true, step: o && o.step }; }
  function seg(ms, fn, o) { return { ms: ms, fn: fn, hold: false, step: o && o.step }; }

  var kit = { P: P, PAL: PAL, W: W, Canvas: Canvas, hex: hex, css: css, mix: mix, ease: ease, lerp: lerp, clamp: clamp, unit: unit, dot: dot, n: n, esc: esc, fmt: fmt, tw: tw,
    pill: pill, card: card, check: check, cross: cross, arrow: arrow, tile: tile, hold: hold, seg: seg, data: data };

  /* ---------------------------------------------------------------- 틀 만들기 */
  function h(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function build(host, def) {
    host.textContent = '';
    var F = { host: host, def: def, step: 0, t: 0, running: false, inView: false };
    var win = h('div', 'fig-win', host);
    var bar = h('div', 'fig-bar', win);
    h('i', '', bar); h('i', '', bar); h('i', '', bar);
    h('b', 'fig-title', bar, def.title || '');
    if (def.meta) h('p', 'fig-note', win, def.meta);
    F.body = h('div', 'fig-body', win);
    if (def.steps || def.say) {
      var foot = h('div', 'fig-foot', win);
      if (def.steps) {
        var ol = h('ol', 'fig-steps', foot);
        F.pills = def.steps.map(function (s, i) { var li = h('li', '', ol); h('i', '', li, String(i + 1)); h('span', '', li, s[0]); return li; });
      }
      F.say = h('p', 'fig-say', foot);
      if (def.say) { F.say.textContent = def.say[0]; F.say.dataset.tone = def.say[1] || 'info'; }
    }
    F.bar = bar;
    return F;
  }

  function setStep(F, s) {
    if (!F.def.steps || F.step === s || !s) return;
    F.step = s;
    F.pills.forEach(function (li, i) { li.className = i + 1 === s ? 'on' : i + 1 < s ? 'done' : ''; });
    var st = F.def.steps[s - 1];
    F.say.textContent = st[1] || '';
    F.say.dataset.tone = st[2] || 'info';
    F.say.style.animation = 'none'; void F.say.offsetWidth; F.say.style.animation = '';
  }

  function resetSteps(F) {
    if (!F.def.steps) return;
    F.step = 0;
    F.pills.forEach(function (li) { li.className = ''; });
    F.say.textContent = '';
  }

  /* SVG 그림(Canvas로 그리는 그림)의 컨트롤러 */
  function canvasCtl(F, def, d) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'fig-svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + def.height);
    svg.setAttribute('aria-hidden', 'true');
    F.body.appendChild(svg);
    var segs = def.timeline(kit, d), starts = [], total = 0, step = 0;
    segs.forEach(function (s) { starts.push(total); total += s.ms; if (s.step) step = s.step; s.stepNow = step; });
    var lastI = -1;
    return {
      duration: total,
      render: function (t) {
        var i = segs.length - 1;
        while (i > 0 && starts[i] > t) i--;
        var s = segs[i], p = clamp((t - starts[i]) / s.ms);
        if (!(s.hold && i === lastI)) svg.innerHTML = s.hold ? s.fn() : s.fn(p);
        lastI = i;
        return s.stepNow;
      }
    };
  }

  function mount(host, def) {
    var F = build(host, def);
    host.__fig = F;  // 점검용(lab/fig.html)
    host.setAttribute('data-ready', '');
    var ctx = Object.create(kit);
    ctx.host = host;
    ctx.clock = function (text) {
      if (!F.clock) F.clock = h('em', 'fig-clock', F.bar);
      F.clock.textContent = text;
    };
    var d = def.data ? data[def.data] : null;
    if (def.html) {
      F.body.innerHTML = typeof def.html === 'function' ? def.html(kit, d) : def.html;
      F.ctl = { duration: 0, render: function () { return 0; } };
    } else if (def.mount) {
      F.ctl = def.mount(F.body, ctx, d);
    } else {
      F.ctl = canvasCtl(F, def, d);
    }
    F.animated = F.ctl.duration > 0 && !def.still;  // def.still: 움직임 없는 그림. 마지막 장면만 보여 준다
    if (!F.animated) host.classList.add('is-still');
    var freeze = host.getAttribute('data-freeze');
    F.loop = F.ctl.duration + FADE_OUT + GAP;
    F.t = freeze == null || freeze === 'end' || !F.animated ? F.ctl.duration : Math.min(+freeze, F.ctl.duration);
    if (F.ctl.resize && window.ResizeObserver) new ResizeObserver(function () { F.ctl.resize(); if (!F.running) draw(F, F.t); }).observe(host);
    if (freeze != null || reduce || !F.animated) { draw(F, F.t); return; }
    F.t = 0;
    figs.push(F);
    new IntersectionObserver(function (es) { F.inView = es[0].isIntersecting; play(F, F.inView && !document.hidden); }, { threshold: .2 }).observe(host);
    draw(F, 0);
  }

  function draw(F, t) {
    var step = F.ctl.render(Math.min(t, F.ctl.duration));
    setStep(F, step);
    if (F.animated) {
      F.host.style.setProperty('--p', (Math.min(t, F.ctl.duration) / F.ctl.duration).toFixed(4));
      var o = Math.min(1, t / FADE_IN) * (t > F.ctl.duration ? Math.max(0, 1 - (t - F.ctl.duration) / FADE_OUT) : 1);
      F.body.style.opacity = F.running ? o : 1;
    }
  }

  function tick(F, now) {
    if (!F.running) return;
    if (!F.host.isConnected) { F.running = false; return; }  // 다른 글로 넘어가면 멈춘다
    if (!F.t0) F.t0 = now - F.t;
    var t = (now - F.t0) % F.loop;
    if (F.t > t) resetSteps(F);            // 한 바퀴 돌았다
    F.t = t;
    if (!F.last || now - F.last >= 30 || t < 50) { draw(F, t); F.last = now; }
    requestAnimationFrame(function (nn) { tick(F, nn); });
  }

  function play(F, on) {
    if (on === F.running) return;
    F.running = on;
    if (on) { F.t0 = 0; requestAnimationFrame(function (now) { tick(F, now); }); }
  }

  /* ---------------------------------------------------------------- 등록과 훑기 */
  function scan() {
    document.querySelectorAll('.fig[data-fig]:not([data-ready])').forEach(function (host) {
      var def = defs[host.getAttribute('data-fig')];
      if (def && (!def.data || data[def.data]) && (def.needs || []).every(function (k) { return Figures[k]; })) mount(host, def);
    });
  }
  function ready(fn) { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(fn); }

  var Figures = {
    kit: kit, defs: defs, data: data,
    define: function (name, def) { defs[name] = def; ready(scan); },
    setData: function (key, value) { data[key] = value; ready(scan); },
    provide: function (key, value) { Figures[key] = value; ready(scan); },  // 여러 그림이 함께 쓰는 도구. 정의에서 needs: [key] 로 기다린다
    scan: function () { ready(scan); },
    scanNow: scan,  // 점검용: 폰트를 기다리지 않고 바로 훑는다
    play: play,     // 점검용: Figures.play(host.__fig, true|false)
    seek: function (t) {  // 점검용: 모든 그림을 t(ms) 장면에 세운다
      document.querySelectorAll('.fig[data-fig]').forEach(function (host) { host.setAttribute('data-freeze', t); host.removeAttribute('data-ready'); });
      scan();
    }
  };
  window.Figures = Figures;

  // 등록 대기열: 이 파일보다 먼저 실행된 그림 정의를 처리하고, 이후 push는 바로 실행한다
  var queue = window.FigureModules || [];
  window.FigureModules = { push: function (fn) { fn(Figures); } };
  queue.forEach(function (fn) { fn(Figures); });

  document.addEventListener('visibilitychange', function () {
    figs = figs.filter(function (F) { return F.host.isConnected; });
    figs.forEach(function (F) { play(F, F.inView && !document.hidden); });
  });
  addEventListener('softnav', Figures.scan);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Figures.scan); else Figures.scan();
})();
