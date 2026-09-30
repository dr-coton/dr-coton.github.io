// 장고와 드리: 어느 페이지에서든 화면 아래를 돌아다니고, /cats/ 에서는 고양이 방(캣타워·선반·냉장고·세탁기)에서 논다.
// 스프라이트: 72x64 칸, 6열(프레임) x 12행(ROW). 만드는 법은 README 참고.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const W = 72, PAD = 2, M = 20; // 칸 너비, 발 아래 여백, 발판 끝에서 띄울 거리(몸 반폭). 단위는 도트
  const STRIDE = { walk: 4, run: 9 }; // 걷기·달리기 한 프레임에 나아가는 거리(도트). 그림에서 땅에 닿은 발이 한 프레임에 뒤로 가는 만큼
  const ROW = { standup: 0, walk: 1, run: 2, stand: 3, sit: 4, groom: 5, lie: 6, sleep: 7, stretch: 8, jump: 9, pounce: 10, knead: 11 };
  // 자세는 서기 ↔ 앉기 ↔ 엎드리기(식빵) ↔ 웅크리기(잠) 순서로만 바뀌고, 한 칸 옮길 때마다 사이 동작을 보여 준다
  const POSES = ['stand', 'sit', 'loaf', 'curl'];
  const DOWN = [['standup', [5, 4, 3, 2, 1, 0], 90], ['lie', [0, 1, 2], 180], ['lie', [3, 4, 5], 450]]; // 서기→앉기, 앉기→식빵, 식빵→잠(천천히 눈을 감는다). 거꾸로 틀면 반대
  const rand = (a, b) => a + Math.random() * (b - a);
  const one = list => list[Math.floor(Math.random() * list.length)];
  const cats = [];
  let world, lure;

  // 세계: 화면 아래 한 줄(바닥뿐) 또는 고양이 방(발판이 여러 개). 발판 = { n: 이름, x: [왼쪽, 오른쪽], y: 바닥에서의 높이 }
  const sync = () => {
    const r = document.querySelector('.room-cats');
    if (!r && world && !world.room) return; // 계속 화면 아래에서 논다
    world = r
      ? { el: r, S: 1.5, plats: JSON.parse(r.dataset.platforms), hide: (r.dataset.hide || '').split(',').map(Number), room: r.closest('.room') }
      : { el: document.querySelector('.cats'), S: devicePixelRatio >= 2 ? 1.5 : 1, plats: [{ n: 'floor', x: [0, innerWidth], y: 0 }] };
    fit();
    cats.forEach(c => c.enter());
  };
  const fit = () => world.room && (world.room.firstElementChild.style.transform = `scale(${world.room.clientWidth / 960})`);

  // [[프레임, 지속ms], ...] 목록에서 경과 시간에 맞는 프레임을 고른다
  const at = (list, t) => { for (const [f, d] of list) { if (t < d) return f; t -= d; } return list.at(-1)[0]; };
  const total = list => list.reduce((s, [, d]) => s + d, 0);
  // 가만히 있는 동안 기본 프레임 사이사이에 events 중 하나([프레임, 최소ms, 최대ms])를 끼운다
  const idle = (ms, events, base = 0) => { const l = []; for (let t = 0; t < ms;) { const d = rand(1200, 3200), [f, a, b] = one(events), fd = rand(a, b); l.push([base, d], [f, fd]); t += d + fd; } return l; };
  const SIT = [[1, 120, 180], [1, 120, 180], [2, 1200, 2600], [3, 700, 1400], [4, 300, 500], [4, 300, 500], [5, 900, 1200]]; // 깜박, 이쪽 보기, 올려다보기, 꼬리, 하품
  const STAND = [[5, 120, 180], [1, 900, 1800], [4, 600, 1200]]; // 깜박, 이쪽 보기, 꼬리 세우기
  const sleep = ms => Array.from({ length: Math.ceil(ms / 2400) }, () => [[0, 1200], [Math.random() < 0.2 ? one([2, 3]) : 1, 1200]]).flat(); // 숨쉬기, 가끔 귀·꼬리
  const alt = (a, b, n, ms) => Array.from({ length: n }, (_, i) => [i % 2 ? b : a, ms]);

  document.querySelectorAll('.cat').forEach(el => {
    const sp = el.appendChild(document.createElement('div')); // 그림자는 바닥에 두고 그림만 뛰어오르게
    sp.className = 'sprite';
    sp.style.backgroundImage = `url(${el.dataset.sprite})`;
    sp.innerHTML = '<i class="hit"></i>'; // 누를 수 있는 곳은 몸통 근처만(뒤의 글과 링크를 가리지 않게)
    const d = el.dataset, speed = +d.speed, sleepy = +d.sleepy, energy = +d.energy, jumpH = +d.jump, reach = +d.reach, says = d.says.split('|');
    const cat = { x: 0, gy: 0, plat: 0, air: false };
    let dir = 1, row = 'sit', frame = 0, lift = 0, pose = 'sit', act = null, queue = [], teaseAt = 0;
    cats.push(cat);

    const P = () => world.plats;
    const clampX = (p, x) => { const m = Math.min(M * world.S, (p.x[1] - p.x[0]) / 2); return Math.min(Math.max(x, p.x[0] + m), p.x[1] - m); };
    const far = () => { const p = P()[cat.plat]; let t; for (let i = 0; i < 10; i++) { t = rand(p.x[0], p.x[1]); if (Math.abs(t - cat.x) > 150) break; } return t; };

    // 행동 하나 = (now, dt) => 끝났으면 true
    const hold = (r, list, face) => { let t0; return now => { if (t0 == null) { t0 = now; if (face) dir = face; } row = r; frame = at(list, now - t0); return now - t0 >= total(list); }; };
    const set = p => () => { pose = p; return true; };
    const seq = make => { let list, a; return (now, dt) => { list ??= make(); while (a || list.length) { a ??= list.shift(); if (!a(now, dt)) return false; a = null; } return true; }; };
    // 지금 자세에서 p 까지 한 칸씩(예: 잠 → 식빵 → 앉기 → 서기). 실행하는 순간의 자세에서 계산한다
    const to = p => seq(() => {
      const acts = [];
      for (let i = POSES.indexOf(pose), j = POSES.indexOf(p); i !== j;) {
        const down = i < j, [r, fs, ms] = DOWN[down ? i : i - 1];
        i += down ? 1 : -1;
        acts.push(hold(r, (down ? fs : [...fs].reverse()).map(f => [f, ms])), set(POSES[i]));
      }
      return acts;
    });
    const travel = (kind, spd, target) => { // 지금 발판 위에서 걷거나 달린다. 방향을 바꿀 때는 잠깐 이쪽을 보고 돌아선다
      let t, turn, dist = 0;
      return (now, dt) => {
        if (t == null) { t = clampX(P()[cat.plat], target()); turn = (t > cat.x ? 1 : -1) !== dir ? now + 150 : 0; }
        pose = 'stand';
        if (now < turn) { row = 'stand'; frame = 1; return false; }
        dir = t > cat.x ? 1 : -1;
        const step = Math.min(spd * world.S * dt, Math.abs(t - cat.x));
        cat.x += dir * step; dist += step;
        row = kind; frame = Math.floor(dist / (STRIDE[kind] * world.S)) % 6; // 시간 대신 간 거리로 프레임을 넘겨야 발이 미끄러지지 않는다
        return Math.abs(t - cat.x) < 0.01;
      };
    };
    const leap = (pi, xf, h = jumpH * rand(0.7, 1.1), kind = 'jump') => { // 발판 pi 의 xf() 로 포물선 점프(같은 발판이면 제자리·앞으로 뛰기). kind 'pounce' 는 덮치기
      let t0, x0, xt, g0, g1, arc, air;
      const J = kind === 'jump';
      return now => {
        if (t0 == null) {
          t0 = now; x0 = cat.x; g0 = cat.gy; cat.air = true; pose = 'stand';
          const p = P()[pi], dy = p.y - g0;
          xt = clampX(p, xf()); g1 = p.y;
          if (xt !== x0) dir = xt > x0 ? 1 : -1;
          arc = pi === cat.plat ? h : Math.max(h, dy > 0 ? dy * 0.6 + 15 : 20);
          air = 300 + 4 * arc + 0.6 * Math.abs(dy);
        }
        const t = now - t0; row = kind;
        if (t < 180) frame = J ? 0 : 2; // 웅크리기
        else if (t < 180 + air) { const u = (t - 180) / air; cat.x = x0 + (xt - x0) * u; cat.gy = g0 + (g1 - g0) * u; lift = arc * 4 * u * (1 - u); frame = J ? (u < 0.2 ? 1 : u < 0.45 ? 2 : u < 0.65 ? 3 : 4) : 3; }
        else { cat.x = xt; cat.gy = g1; cat.plat = pi; lift = 0; frame = J ? 5 : 4; } // 착지
        if (t < 180 + air + 180) return false;
        cat.air = false;
        return true;
      };
    };
    // 발판 to 의 xf() 까지 가는 행동들. 발판 사이는 점프할 수 있는 곳끼리만 이어서 너비 우선 탐색으로 길을 찾는다
    const route = (to, xf) => {
      const ps = P(), ok = (a, b) => Math.max(0, a.x[0] - b.x[1], b.x[0] - a.x[1]) <= 130 && b.y - a.y <= reach;
      const prev = { [cat.plat]: null }, q = [cat.plat];
      while (q.length) { const a = q.shift(); ps.forEach((b, i) => { if (!(i in prev) && ok(ps[a], b)) { prev[i] = a; q.push(i); } }); }
      if (!(to in prev)) return null;
      const path = [];
      for (let i = to; i !== null; i = prev[i]) path.unshift(i);
      const acts = [];
      for (let k = 1; k < path.length; k++) {
        const a = ps[path[k - 1]], b = ps[path[k]], edge = () => clampX(a, (b.x[0] + b.x[1]) / 2);
        acts.push(travel('walk', speed, edge), leap(path[k], () => clampX(b, edge())));
      }
      acts.push(travel('walk', speed, xf));
      return acts;
    };

    const up = () => to('stand');
    const stretch = () => [to('sit'), hold('stretch', [[0, 200], [1, 250], [2, 700], [3, 1300], [4, 900], [5, 300]]), set('stand')]; // 앉았다 일어나며 앞으로, 뒤로 쭉
    const stay = () => world.room && d.stay && P()[cat.plat].n === d.fav; // 좋아하는 자리에 올라가면 좀처럼 안 내려온다
    const plan = {
      walk: () => [up(), travel('walk', speed, far), ...(Math.random() < 0.4 ? [hold('stand', idle(rand(1500, 3000), STAND))] : [])],
      sniff: () => [up(), travel('walk', speed, () => cat.x + dir * rand(30, 80)), hold('stand', [[2, 700], [3, 400], [2, 500], [3, 600], [0, 400]])],
      run: () => [up(), ...Array.from({ length: 1 + (Math.random() < 0.4) + (Math.random() < 0.2) }, () => travel('run', speed * 2.8, far))],
      sit: () => [to('sit'), hold('sit', idle(rand(4000, 9000), SIT))],
      groom: () => [to('sit'), hold('groom', [[0, 400], ...alt(1, 0, 6, 220), [2, 450], [3, 450], [2, 450], [3, 450], [4, 700], [4, 500], ...alt(5, 1, 4, 250), [0, 300]])],
      loaf: () => [to('loaf'), hold('lie', [[2, rand(2000, 4000)], [3, rand(1500, 3000)], [4, rand(4000, 9000)], [3, 700], [2, 900]])],
      nap: () => [up(), hold('knead', alt(0, 2, Math.round(rand(8, 14)), 260)), to('curl'), hold('sleep', sleep(rand(10000, 25000))), to('sit'), hold('sit', [[5, 1100], [0, 500]]), ...stretch()], // 꾹꾹이 → 잠 → 하품 → 기지개
      jump: () => [up(), ...Array.from({ length: 1 + (Math.random() < 0.3) }, () => leap(cat.plat, () => cat.x + (Math.random() < 0.6 ? dir * rand(40, 140) : 0)))],
      play: () => [up(), hold('pounce', [[0, 900], ...alt(1, 2, 6, 150)]), leap(cat.plat, () => cat.x + dir * rand(50, 90), 14, 'pounce'), hold('pounce', [[4, 500], [5, 350], [4, 250], [5, 350], [4, 300]])],
      chase: () => { // 다른 고양이에게 달려가 앞발로 툭 치면, 맞은 고양이가 깜짝 놀라 도망간다
        const o = cats.find(c => c !== cat && c.plat === cat.plat);
        if (!o) return plan.walk();
        return [up(), travel('run', speed * 2.8, () => o.x + (cat.x < o.x ? -50 : 50)), hold('pounce', [[5, 350]]), () => { o.flee(); return true; }];
      },
      climb: () => { // 방에서 발판을 골라 걷고 뛰어서 올라간다(반은 좋아하는 자리로)
        const ps = P(), fav = ps.findIndex(p => p.n === d.fav), to = Math.random() < 0.5 && fav >= 0 ? fav : Math.floor(rand(0, ps.length)), p = ps[to];
        const r = route(to, () => rand(p.x[0] + 20, p.x[1] - 20));
        return r ? [up(), ...r] : plan.sit();
      },
      peek: () => { // 세탁기 뒤로 들어가 왼쪽으로 얼굴만 빼꼼
        const r = route(P().findIndex(p => p.n === 'floor'), () => world.hide[0] + 15);
        return r ? [up(), ...r, to('sit'), hold('sit', idle(rand(6000, 10000), SIT), -1)] : plan.sit();
      },
    };
    // 느긋한 행동이 대부분이고 뛰어노는 건 가끔. 이미 앉아 있거나 엎드려 있으면 그 자세로 할 수 있는 걸 더 자주 고른다
    const pick = () => {
      const w = { walk: 4, sniff: 1.5, sit: 3, groom: 1.5, loaf: 1 + sleepy * 3, nap: sleepy * 5, run: energy * 2, jump: 0.5 + energy * 2, play: energy * 1.5, chase: cats.length > 1 ? energy * 1.2 : 0, climb: world.room ? 3 : 0, peek: world.room && d.hider ? 2 : 0 };
      if (pose === 'sit') Object.assign(w, { sit: w.sit * 1.5, groom: w.groom * 2, loaf: w.loaf * 2 });
      if (pose === 'loaf') Object.assign(w, { loaf: w.loaf * 2, nap: w.nap * 3 });
      if (stay()) Object.assign(w, { walk: 0.3, sniff: 0, run: 0, jump: 0, play: 0, chase: 0, climb: 0.3, sit: 9, loaf: 6, nap: sleepy * 30 });
      let r = rand(0, Object.values(w).reduce((a, b) => a + b));
      for (const k in w) if ((r -= w[k]) < 0) return plan[k]();
      return plan.sit();
    };

    // 밖에서 부르는 것들. 점프 도중에는 끼어들지 않는다
    const interrupt = acts => { if (cat.air) return; queue = acts; act = null; };
    cat.flee = () => interrupt([leap(cat.plat, () => cat.x, jumpH * 0.5), travel('run', speed * 2.8, far)]);
    cat.eat = (pi, x, treat) => {
      const r = route(pi, () => x);
      if (r) interrupt([up(), ...r, hold('stand', [[2, 400], [3, 300], [2, 400], [3, 300], [2, 400], [3, 300]]), () => { treat.remove(); return true; }, to('sit'), hold('groom', [[0, 300], ...alt(1, 0, 4, 220)])]);
    };
    cat.tease = x => interrupt([up(), travel('run', speed * 2.4, () => x - dir * 45), hold('pounce', [[0, 400], ...alt(1, 2, 4, 140)]), leap(cat.plat, () => x, 14, 'pounce'), hold('pounce', [[4, 300], [5, 300], [4, 200], [5, 300], [4, 300]])]);
    const spawn = (cls, html, dx, ms) => {
      const n = document.createElement('div');
      n.className = cls; n.innerHTML = html;
      n.style.cssText = `left:${cat.x + dx}px;bottom:${cat.gy + 64 * world.S}px`;
      world.el.append(n);
      setTimeout(() => n.remove(), ms);
    };
    sp.firstChild.addEventListener('click', e => { // 쓰다듬기: 자는 중이면 귀만 쫑긋하고 계속 잔다
      e.stopPropagation();
      if (cat.air) return;
      const pet = { curl: ['sleep', [[2, 500], ...sleep(6000)]], loaf: ['lie', [[4, 2000], [3, 400]]], sit: ['sit', [[1, 1800], [2, 700]]], stand: ['stand', [[4, 700], [5, 1300], [4, 500]]] }[pose];
      interrupt([hold(...pet)]);
      for (let i = 0; i < 3; i++) setTimeout(() => spawn('heart', '♥', rand(-16, 16), 1400), i * 250);
      if (pose !== 'curl') spawn('bubble', one(says), 0, 2200);
    });
    cat.enter = () => {
      world.el.append(el);
      const f = P()[0];
      cat.plat = 0; cat.gy = 0; cat.air = false; lift = 0; cat.x = clampX(f, rand(f.x[0], f.x[1])); act = null; queue = [];
      pose = one(['stand', 'sit', 'loaf']); [row, frame] = { stand: ['stand', 0], sit: ['sit', 0], loaf: ['lie', 2] }[pose];
    };

    cat.step = (now, dt) => {
      if (lure && now - lure.t < 700 && now > teaseAt && !world.room && !cat.air && Math.random() < 0.05 && (pose !== 'curl' || Math.abs(cat.x - lure.x) < 150)) {
        teaseAt = now + rand(4000, 7000); // 마우스 커서를 장난감으로 알고 달려와 덮친다
        cat.tease(lure.x);
      }
      if (!act && !(act = queue.shift())) { queue = pick(); act = queue.shift(); }
      if (act(now, dt)) act = null;
      const S = world.S, px = v => Math.round(v * devicePixelRatio) / devicePixelRatio; // 기기 픽셀에 맞춰 부드럽고 선명하게
      cat.x = Math.min(Math.max(cat.x, 0), world.room ? 960 : innerWidth);
      el.style.transform = `translate(${px(cat.x - W / 2)}px, ${px(PAD * S - cat.gy)}px) scale(${S * dir}, ${S})`;
      sp.style.transform = `translateY(${-px(lift) / S}px)`;
      sp.style.backgroundPosition = `${-frame * W}px ${-ROW[row] * 64}px`;
    };
  });

  let last = performance.now();
  const loop = now => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    cats.forEach(c => c.step(now, dt));
    requestAnimationFrame(loop);
  };

  // 화면 아래에 마우스를 가져다 대면 고양이들이 알아챈다
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && e.clientY > innerHeight - 150) lure = { x: e.clientX, t: performance.now() }; });
  addEventListener('resize', () => { if (world.room) fit(); else world.plats[0].x[1] = innerWidth; });
  addEventListener('softnav', sync);

  // 고양이 방에서 바닥이나 발판을 누르면 간식이 떨어지고 가까운 고양이가 먹으러 온다
  document.addEventListener('click', e => {
    if (!world.room || !world.room.contains(e.target)) return;
    const r = world.room.getBoundingClientRect(), k = r.width / 960;
    const x = (e.clientX - r.left) / k, h = 400 - (e.clientY - r.top) / k; // 방 안 좌표: 가로, 바닥에서의 높이
    let pi = -1;
    world.plats.forEach((p, i) => { if (x >= p.x[0] && x <= p.x[1] && p.y <= h + 25 && (pi < 0 || p.y > world.plats[pi].y)) pi = i; });
    if (pi < 0) return;
    world.el.querySelectorAll('.treat').forEach(t => t.remove());
    const treat = document.createElement('div');
    treat.className = 'treat';
    treat.innerHTML = '<svg viewBox="0 0 22 12" width="22" height="12"><ellipse cx="9" cy="6" rx="8" ry="4.5" fill="#e6a07f"/><path d="M16 6 22 1v10z" fill="#e6a07f"/><circle cx="5" cy="5" r="1" fill="#5b3a2b"/></svg>';
    treat.style.cssText = `left:${x}px;bottom:${world.plats[pi].y}px`;
    world.el.append(treat);
    [...cats].sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x)).forEach((c, i) => { if (i === 0 || Math.random() < 0.5) c.eat(pi, x, treat); });
  });

  sync();
  requestAnimationFrame(loop);
})();
