/* 검색 글의 그림들이 함께 쓰는 예시 상품과 순위 규칙. 그림 정의에서는 needs: ['search'] 로 기다린 뒤 F.search 로 쓴다.
 * 이 파일에는 정지 그림 'architecture'도 들어 있다(그림 정의의 본보기). */
(window.FigureModules = window.FigureModules || []).push(function (F) {
  var K = F.kit, P = K.P, Canvas = K.Canvas, pill = K.pill, card = K.card, hold = K.hold, dot = K.dot;

  // 글 전체에서 쓰는 예시 상품. similarity: 검색어 '흰색 운동화'와의 유사도, coverage: 검색어 단어가 이름에 들어간 비율, type: 상품 종류(운동화) 일치
  var PRODUCTS = [
    { id: 'laces', name: '흰색 신발끈', short: '신발끈', similarity: .995, coverage: .5, type: 0, image: 'laces', color: P.AMBER, kind: 'laces' },
    { id: 'shoe', name: '흰색 운동화 A', short: '운동화 A', similarity: .98, coverage: 1, type: 1, image: 'shoe-a', color: P.BLUE, kind: 'shoe' },
    { id: 'copy', name: '흰색 운동화 A 복제', short: 'A 복제', similarity: .97, coverage: 1, type: 1, image: 'shoe-a', color: P.BLUE, kind: 'shoe' },
    { id: 'other', name: '화이트 스니커즈 B', short: '스니커즈 B', similarity: .92, coverage: 1, type: 1, image: 'shoe-b', color: P.TEAL, kind: 'shoe' }
  ];
  var BY_ID = {};
  PRODUCTS.forEach(function (p) { p.vector = [p.similarity, Math.sqrt(1 - p.similarity * p.similarity)]; BY_ID[p.id] = p; });

  function jaccard(a, b) {
    var l = a.split(/\s+/), r = b.split(/\s+/), inter = l.filter(function (w) { return r.indexOf(w) >= 0; }), uni = l.concat(r.filter(function (w) { return l.indexOf(w) < 0; }));
    return new Set(inter).size / new Set(uni).size;
  }

  // 본문의 점수식과 겹침 감점을 예시 데이터에 그대로 적용한다. 반환: 순위대로 정렬된 상품(score, tier, penalty 포함)
  function rank(correction, diversity, strength) {
    strength = strength == null ? .08 : strength;
    var remaining = PRODUCTS.map(function (p) {
      var score = correction ? Math.min(.99, .6 * p.similarity + .25 * p.coverage + .15 * p.type) : p.similarity;
      var tier = correction ? (p.coverage === 1 ? 2 : p.type ? 1 : 0) : 0;
      return Object.assign({}, p, { score: score, tier: tier, penalty: 0 });
    });
    var selected = [];
    while (remaining.length) {
      remaining.sort(function (a, b) { return (b.tier + b.score - b.penalty) - (a.tier + a.score - a.penalty); });
      var chosen = remaining.shift();
      selected.push(chosen);
      if (diversity) remaining.forEach(function (c) {
        var overlap = Math.max(jaccard(chosen.name, c.name), chosen.image === c.image ? 1 : 0);
        c.penalty = Math.max(c.penalty, strength * (.5 * dot(chosen.vector, c.vector) + .5 * overlap));
      });
    }
    return selected;
  }

  F.provide('search', { PRODUCTS: PRODUCTS, BY_ID: BY_ID, jaccard: jaccard, rank: rank });

  /* ---------------------------------------------------------------- 정지 그림 본보기: 흔한 구성과 직접 만든 구성 */
  F.define('architecture', {
    title: '흔히 떠올리는 구성과 직접 만든 구성',
    height: 580,
    still: true,  // 움직이지 않는 그림: 장면 하나(hold)만 둔다
    timeline: function () {
      var sides = [
        [30, '흔히 떠올리는 구성', P.TEXT, P.SOFT, [
          ['검색 서버', '요청 받기', null],
          ['GPU 서버', '이미지 모델 실행', ['항상 켜 둠', P.MUTED, P.SOFT]],
          ['벡터 DB', '벡터 저장과 비교', ['항상 켜 둠', P.MUTED, P.SOFT]],
          ['검색 엔진', '단어 검색과 순위', ['항상 켜 둠', P.MUTED, P.SOFT]],
          ['상품 DB', '상품 정보', null]], '켜 두고 맞춰야 할 서버 3대 추가', P.RED],
        [560, '직접 만든 구성', P.BLUE, P.BLUE_BG, [
          ['검색 서버', 'CPU로 사진 한 장 처리', null],
          ['PostgreSQL', '상품 + 벡터 + 단어 검색', ['pgvector', P.BLUE, P.BLUE_BG]],
          ['Voyage API', '검색어 → 벡터', ['쓴 만큼 과금', P.ORANGE, P.ORANGE_BG]],
          ['Modal GPU', '상품 사진 대량 등록', ['등록할 때', P.PURPLE, P.PURPLE_BG]]], '상품 DB 하나에 벡터까지', P.GREEN]
      ];
      return [hold(1, function () {
        var c = new Canvas();
        sides.forEach(function (side) {
          var x0 = side[0], boxes = side[4];
          pill(c, x0, 30, side[1], side[2], side[3], 26);
          boxes.forEach(function (b, i) {
            var y = 80 + i * 92;
            card(c, x0, y, 490, 78);
            c.text(x0 + 24, y + 27, b[0], 28, P.INK, 'bold');
            c.text(x0 + 24, y + 58, b[1], 24, P.MUTED);
            if (b[2]) pill(c, x0 + 474, y + 39, b[2][0], b[2][1], b[2][2], 22, 'r');
          });
          c.text(x0 + 245, 556, side[5], 28, side[6], 'semibold', 'mm');
        });
        return c.done();
      })];
    }
  });
});
