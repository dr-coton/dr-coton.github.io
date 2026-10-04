/* k6 + AWS 글: 모두 모식도 또는 가정에 따른 계산. 실제 AWS 실행·성능 측정값 없음. */
(window.FigureModules = window.FigureModules || []).push(function (F) {
  var K = F.kit, P = K.P, Canvas = K.Canvas, card = K.card, pill = K.pill;
  var hold = K.hold, seg = K.seg, ease = K.ease, lerp = K.lerp, arrow = K.arrow, fmt = K.fmt;

  function box(c, x, y, w, h, title, sub, color) {
    card(c, x, y, w, h, { outline: color, width: 3 });
    c.text(x + w / 2, y + h * .35, title, 30, color, 'bold', 'mm');
    c.text(x + w / 2, y + h * .72, sub, 25, P.MUTED, 'medium', 'mm');
  }
  function usd(value) { return '$' + value.toFixed(2); }

  /* 질문: 작업용 컴퓨터가 HTTP 요청도 중계하는가? 조건: SSH 준비 → 독립 실행 → 회수.
   * 변화: 점선 명령 전달이 끝난 뒤 각 서버에서 실선 HTTP 경로로 요청 발생.
   * 사실: 명령과 시험 트래픽은 서로 다른 경로. 세 칸은 수백 대의 대표 표현. */
  F.define('fleet-control', {
    title: '명령 경로와 시험 요청 경로', meta: '모식도 · 세 칸은 수백 대를 대표',
    height: 440,
    steps: [['전달', 'SSH로 각 서버에 파일과 실행 설정 전달', 'info'],
      ['실행', '각 k6에서 시험 대상으로 직접 요청', 'ok'],
      ['회수', '노드별 로그와 종료 상태 회수', 'info']],
    timeline: function () {
      var ys = [40, 170, 300];
      function draw(stage, progress) {
        var c = new Canvas(), command = stage === 1 ? P.PURPLE : P.GRID;
        box(c, 40, 170, 240, 110, '작업용 컴퓨터', 'CLI · SSH', P.PURPLE);
        box(c, 820, 170, 220, 110, '시험 대상', 'HTTP 수신', P.BLUE);
        ys.forEach(function (y, i) {
          box(c, 410, y, 250, 100, 'k6 ' + String.fromCharCode(65 + i), '독립 프로세스', P.BLUE);
          c.dashed([282, 225], [405, y + 50], command, 3, 8, 8);
          arrow(c, [665, y + 50], [815, 225], stage === 2 ? P.BLUE : P.GRID, 3);
          var t = (progress + i / 3) % 1;
          if (stage === 1) c.circle(lerp(282, 405, t), lerp(225, y + 50, t), 8, { fill: P.PURPLE });
          if (stage === 2) c.circle(lerp(665, 815, t), lerp(y + 50, 225, t), 8, { fill: P.BLUE });
          if (stage === 3) c.circle(lerp(405, 282, t), lerp(y + 50, 225, t), 8, { fill: P.PURPLE });
        });
        c.text(40, 400, stage === 2 ? 'SSH 연결 종료 후에도 실행 유지' : stage === 3 ? '요청 경로와 분리된 결과 회수' : '점선: 명령 · 실선: HTTP', 26, P.MUTED, 'semibold');
        return c.done();
      }
      return [hold(650, function () { return draw(1, 0); }, { step: 1 }),
        seg(2000, function (p) { return draw(1, p); }),
        seg(3000, function (p) { return draw(2, p * 3); }, { step: 2 }),
        hold(1800, function () { return draw(2, .5); }),
        seg(1400, function (p) { return draw(3, p); }, { step: 3 }),
        hold(2100, function () { return draw(3, .8); })];
    }
  });

  /* 질문: 전체 요청률을 복사하면 합계는 얼마인가? 조건: 전체 6,000회/초, 세 노드.
   * 변화: 복제한 18,000회/초에서 구간별 2,000회, 합계 6,000회로 변경.
   * 사실: 전체 설정과 노드별 설정을 구별. 숫자는 발생률 측정이 아닌 계획. */
  F.define('fleet-split', {
    title: '전체 설정 복제와 실행 구간 분할', meta: '계산 · 반복당 HTTP 요청 1회 · 실제 발생률은 별도 확인',
    data: 'fleet', height: 350,
    steps: [['복제', '전체 6,000회를 세 번 실행: 합계 18,000회/초', 'bad'],
      ['분할', '서로 다른 1/3 구간을 실행: 합계 6,000회/초', 'ok']],
    timeline: function (K, D) {
      var d = D.split, ranges = ['0:1/3', '1/3:2/3', '2/3:1'];
      function draw(split) {
        var c = new Canvas(), color = split ? P.BLUE : P.RED;
        for (var i = 0; i < d.nodes; i++) {
          var x = 40 + i * 345;
          card(c, x, 30, 310, 170, { outline: color, width: 3 });
          c.text(x + 155, 70, '서버 ' + String.fromCharCode(65 + i), 26, P.INK, 'bold', 'mm');
          c.text(x + 155, 115, split ? ranges[i] : '전체 0:1', 28, color, 'mono', 'mm');
          c.text(x + 155, 165, fmt(split ? d.each : d.global_rate) + '회/초', 32, color, 'bold', 'mm');
        }
        c.line([[195, 210], [195, 240], [885, 240], [885, 210]], P.GRID, 3);
        c.text(540, 295, '합계 ' + fmt(split ? d.global_rate : d.duplicate) + '회/초', 34, color, 'bold', 'mm');
        return c.done();
      }
      return [hold(650, function () { return draw(false); }, { step: 1 }),
        hold(3600, function () { return draw(false); }),
        hold(4000, function () { return draw(true); }, { step: 2 })];
    }
  });

  /* 질문: SSH 도착 시각이 달라도 같이 시작할 수 있는가? 조건: 0/12/25초 도착, 공통 60초.
   * 변화: 명령 수신 뒤 기다리는 띠, 같은 위치에서 시작하는 파란 띠.
   * 사실: 명령과 시작 시각 분리. 실제 시계 오차·초기화 시간까지 해결한 동기화 아님. */
  F.define('fleet-start', {
    title: '먼저 준비하고 공통 시각에 시작', meta: '모식도 · 시각은 예시 · 시계 오차와 초기화 시간 존재',
    data: 'fleet', height: 330,
    steps: [['명령', '서버마다 다른 시각에 도착하는 SSH 명령', 'info'],
      ['대기', '공통 시작 시각까지 대기', 'info'],
      ['시작', '동일 시각에 프로세스 시작 · 실제 발생률 확인 필요', 'ok']],
    timeline: function (K, D) {
      var d = D.start, x0 = 210, x1 = 1000, end = 80;
      function tx(t) { return lerp(x0, x1, t / end); }
      function draw(now) {
        var c = new Canvas(), start = tx(d.at);
        c.text(start, 35, '공통 시작 ' + d.at + '초', 26, P.BLUE, 'bold', 'mm');
        c.dashed([start, 58], [start, 280], P.BLUE, 3);
        d.arrivals.forEach(function (a, i) {
          var y = 90 + i * 70;
          c.text(40, y, '서버 ' + String.fromCharCode(65 + i), 28, P.TEXT, 'bold');
          c.line([[x0, y], [x1, y]], P.GRID, 3);
          if (now >= a) {
            c.rect(tx(a), y - 12, tx(Math.min(now, d.at)) - tx(a), 24, { fill: P.PURPLE_BG, r: 3 });
            c.circle(tx(a), y, 8, { fill: P.PURPLE });
            c.text(tx(a) + 15, y - 26, a + '초 도착', 23, P.PURPLE, 'medium');
          }
          if (now >= d.at) c.rect(start, y - 12, tx(now) - start, 24, { fill: P.BLUE, r: 3 });
        });
        [0, 20, 40, 60, 80].forEach(function (t) { c.text(tx(t), 292, t + '초', 23, P.FAINT, 'medium', 'mm'); });
        return c.done();
      }
      return [hold(650, function () { return draw(0); }, { step: 1 }),
        seg(2200, function (p) { return draw(25 * ease(p)); }),
        hold(1700, function () { return draw(25); }, { step: 2 }),
        seg(1800, function (p) { return draw(25 + 35 * ease(p)); }),
        seg(1200, function (p) { return draw(60 + 20 * ease(p)); }, { step: 3 }),
        hold(2400, function () { return draw(80); })];
    }
  });

  /* 질문: 시험 시간이 늘면 300대 비용은 어떻게 바뀌는가? 조건: 시험 1~3시간, 준비·정리 0.5시간.
   * 변화: 실제 생존 시간에 비례하는 자원 사용료와 EC2/IP/디스크 내역.
   * 사실: 대수와 생존 시간으로 계산, 전송료나 대상 시스템 비용 제외. */
  F.define('fleet-cost', {
    title: '300대의 생존 시간과 자원 비용', meta: '계산 · 서울 c6i.large · IPv4와 gp3 8GB씩 · 전송료 제외',
    data: 'fleet', height: 380,
    steps: [['1시간', '시험 1시간 + 준비·정리 30분: $45.91', 'info'],
      ['2시간', '시험 2시간 + 준비·정리 30분: $76.51', 'info'],
      ['3시간', '시험 3시간 + 준비·정리 30분: $107.11', 'info']],
    timeline: function (K, D) {
      function draw(i, progress) {
        var c = new Canvas(), d = D.cost[i], components = [['EC2', d.ec2], ['IPv4', d.ipv4], ['gp3 8GB', d.ebs]];
        pill(c, 40, 48, '시험 ' + d.test_hours + '시간', P.BLUE, P.BLUE_BG, 28);
        c.text(1040, 48, '생존 ' + d.billed_hours + '시간', 28, P.MUTED, 'semibold', 'rm');
        c.rect(40, 105, 1000, 50, { fill: P.SOFT, r: 5 });
        c.rect(40, 105, 1000 * d.total / D.cost[2].total * progress, 50, { fill: P.BLUE, r: 5 });
        components.forEach(function (r, j) {
          var x = 40 + j * 345;
          card(c, x, 205, 310, 110);
          c.text(x + 20, 239, r[0], 26, P.MUTED, 'semibold');
          c.text(x + 290, 282, usd(r[1]), 32, P.INK, 'bold', 'rm');
        });
        c.text(1040, 350, '합계 ' + usd(d.total), 34, P.BLUE, 'bold', 'rm');
        return c.done();
      }
      return [hold(650, function () { return draw(0, 0); }, { step: 1 }),
        seg(900, function (p) { return draw(0, ease(p)); }),
        hold(2000, function () { return draw(0, 1); }),
        seg(900, function (p) { return draw(1, lerp(D.cost[0].total / D.cost[1].total, 1, ease(p))); }, { step: 2 }),
        hold(2300, function () { return draw(1, 1); }),
        seg(900, function (p) { return draw(2, lerp(D.cost[1].total / D.cost[2].total, 1, ease(p))); }, { step: 3 }),
        hold(2400, function () { return draw(2, 1); })];
    }
  });

  /* 질문: 작은 자원 비용만으로 시험 비용을 알 수 있는가? 조건: 300,000회/초, 2시간, 외부 송신 1→4KiB.
   * 변화: 고정 자원 막대와 증가하는 인터넷 송신 막대.
   * 사실: 동일 서버·요청률에서도 전송량이 비용을 바꿈. 무료량 소진과 첫 유료 구간 가정. */
  F.define('fleet-transfer', {
    title: '자원 비용보다 커질 수 있는 송신료', meta: '계산 · 인터넷 송신 · 무료량 소진 · 첫 유료 10TB 구간',
    data: 'fleet', height: 370,
    steps: [['1KiB', '평균 외부 송신 1KiB: 자원과 송신료 합계 $336.06', 'warn'],
      ['4KiB', '평균 외부 송신 4KiB: 자원과 송신료 합계 $1,114.72', 'warn']],
    timeline: function (K, D) {
      var max = D.traffic[1].total;
      function draw(i, progress) {
        var c = new Canvas(), d = D.traffic[i], unit = 900 / max;
        pill(c, 40, 45, '평균 외부 송신 ' + d.kib + 'KiB/회', P.ORANGE, P.ORANGE_BG, 28);
        c.text(1040, 95, '초당 300,000회 × 2시간', 28, P.MUTED, 'semibold', 'rm');
        c.rect(40, 135, d.base * unit, 56, { fill: P.BLUE, r: 3 });
        c.rect(40 + d.base * unit, 135, d.transfer * unit * progress, 56, { fill: P.ORANGE, r: 3 });
        c.text(40, 235, '자원 ' + usd(d.base), 28, P.BLUE, 'bold');
        c.text(1040, 235, '송신료 ' + usd(d.transfer), 28, P.ORANGE, 'bold', 'rm');
        c.text(40, 290, '외부 송신 ' + d.gb.toLocaleString('en-US', { minimumFractionDigits: 2 }) + 'GB', 26, P.MUTED, 'medium');
        c.text(1040, 330, '합계 ' + usd(d.total), 34, P.INK, 'bold', 'rm');
        return c.done();
      }
      return [hold(650, function () { return draw(0, 0); }, { step: 1 }),
        seg(1200, function (p) { return draw(0, ease(p)); }),
        hold(2500, function () { return draw(0, 1); }),
        seg(1300, function (p) { return draw(1, lerp(D.traffic[0].transfer / D.traffic[1].transfer, 1, ease(p))); }, { step: 2 }),
        hold(3000, function () { return draw(1, 1); })];
    }
  });
});
