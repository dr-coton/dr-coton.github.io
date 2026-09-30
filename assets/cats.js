// 장고와 드리: 어느 페이지에서든 화면 아래를 돌아다니고, /cats/ 에서는 고양이 방(캣타워·선반·냉장고·세탁기)에서 논다.
// 스프라이트: 56px 프레임, 4열(프레임) x 6행(걷기/앉기/잠자기/달리기/점프/기지개·놀기). 만드는 법은 README 참고.
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const F = 56, PAD = 2, M = 30; // 프레임 크기, 프레임 아래 여백(도트), 발판 가장자리에서 띄울 거리(몸 반폭)
  const ROW = { walk: 0, sit: 1, sleep: 2, run: 3, jump: 4, play: 5 };
  const rand = (a, b) => a + Math.random() * (b - a);
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
  // 앉아 있는 동안 가끔 눈 깜박(1), 꼬리 흔들기(2), 앞발 핥기(3)
  const idle = ms => { const l = []; for (let t = 0; t < ms;) { const d = rand(1500, 3500), f = 1 + Math.floor(Math.random() * 3), fd = [0, 200, 800, 1500][f]; l.push([0, d], [f, fd]); t += d + fd; } return l; };
  const sleep = ms => Array.from({ length: Math.ceil(ms / 700) }, (_, i) => [[0, 1, 2, 3, 2, 1][i % 6], 700]);

  document.querySelectorAll('.cat').forEach(el => {
    const sp = el.appendChild(document.createElement('div')); // 그림자는 바닥에 두고 그림만 뛰어오르게
    sp.className = 'sprite';
    sp.style.backgroundImage = `url(${el.dataset.sprite})`;
    sp.innerHTML = '<i class="hit"></i>'; // 누를 수 있는 곳은 몸통 근처만(뒤의 글과 링크를 가리지 않게)
    const d = el.dataset, speed = +d.speed, sleepy = +d.sleepy, energy = +d.energy, jumpH = +d.jump, reach = +d.reach, says = d.says.split('|');
    const cat = { x: 0, gy: 0, plat: 0, air: false };
    let dir = 1, row = 'sit', frame = 0, lift = 0, act = null, queue = [], teaseAt = 0, last = performance.now();
    cats.push(cat);

    const P = () => world.plats;
    const clampX = (p, x) => { const m = Math.min(M, (p.x[1] - p.x[0]) / 2); return Math.min(Math.max(x, p.x[0] + m), p.x[1] - m); };
    const far = () => { const p = P()[cat.plat]; let t; for (let i = 0; i < 10; i++) { t = rand(p.x[0], p.x[1]); if (Math.abs(t - cat.x) > 150) break; } return t; };

    // 행동 하나 = (now, dt) => 끝났으면 true
    const hold = (r, list, face) => { let t0; return now => { if (t0 == null) { t0 = now; if (face) dir = face; } row = r; frame = at(list, now - t0); return now - t0 >= total(list); }; };
    const travel = (r, spd, target, ms) => { // 지금 발판 위에서 걷거나 달린다
      let t;
      return (now, dt) => {
        if (t == null) { t = clampX(P()[cat.plat], target()); dir = t > cat.x ? 1 : -1; }
        row = r; frame = Math.floor(now / ms) % 4; cat.x += dir * spd * dt;
        return dir > 0 ? cat.x >= t : cat.x <= t;
      };
    };
    const leap = (pi, xf, h = jumpH * rand(0.7, 1.1)) => { // 발판 pi 의 xf() 로 포물선 점프(같은 발판이면 제자리·앞으로 뛰기)
      let t0, x0, xt, g0, g1, arc, air;
      return now => {
        if (t0 == null) {
          t0 = now; x0 = cat.x; g0 = cat.gy; cat.air = true;
          const p = P()[pi], dy = p.y - g0;
          xt = clampX(p, xf()); g1 = p.y;
          if (xt !== x0) dir = xt > x0 ? 1 : -1;
          arc = pi === cat.plat ? h : Math.max(h, dy > 0 ? dy * 0.6 + 15 : 20);
          air = 300 + 4 * arc + 0.6 * Math.abs(dy);
        }
        const t = now - t0; row = 'jump';
        if (t < 180) frame = 0; // 웅크리기
        else if (t < 180 + air) { const u = (t - 180) / air; cat.x = x0 + (xt - x0) * u; cat.gy = g0 + (g1 - g0) * u; lift = arc * 4 * u * (1 - u); frame = u < 0.35 ? 1 : 2; }
        else { cat.x = xt; cat.gy = g1; cat.plat = pi; lift = 0; frame = 3; } // 착지
        if (t < 180 + air + 200) return false;
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
        acts.push(travel('walk', speed, edge, 120), leap(path[k], () => clampX(b, edge())));
      }
      acts.push(travel('walk', speed, xf, 120));
      return acts;
    };

    const stay = () => world.room && d.stay && P()[cat.plat].n === d.fav; // 좋아하는 자리에 올라가면 좀처럼 안 내려온다
    const plan = {
      walk: () => [travel('walk', speed, far, 120)],
      run: () => Array.from({ length: 1 + (Math.random() < 0.4) + (Math.random() < 0.2) }, () => travel('run', speed * 2.6, far, 80)),
      sit: () => [hold('sit', idle(rand(3000, 8000)))],
      sleep: () => [hold('sleep', sleep(rand(8000, 20000)))],
      jump: () => Array.from({ length: 1 + (Math.random() < 0.3) + (Math.random() < 0.1) }, () => leap(cat.plat, () => cat.x + (Math.random() < 0.6 ? dir * rand(60, 180) : 0))),
      stretch: () => [hold('play', [[0, 600], [1, 1500], [0, 500]])],
      play: () => [hold('play', [[2, 1200], [3, 250], [2, 300], [3, 250], [2, 700]])],
      chase: () => { // 다른 고양이에게 달려가 앞발로 툭 치면, 맞은 고양이가 깜짝 놀라 도망간다
        const o = cats.find(c => c !== cat && c.plat === cat.plat);
        if (!o) return plan.walk();
        return [travel('run', speed * 2.6, () => o.x + (cat.x < o.x ? -50 : 50), 80), hold('play', [[3, 300]]), () => { o.flee(); return true; }];
      },
      climb: () => { // 방에서 발판을 골라 걷고 뛰어서 올라간다(반은 좋아하는 자리로)
        const ps = P(), fav = ps.findIndex(p => p.n === d.fav), to = Math.random() < 0.5 && fav >= 0 ? fav : Math.floor(rand(0, ps.length)), p = ps[to];
        return route(to, () => rand(p.x[0] + 20, p.x[1] - 20)) || plan.sit();
      },
      peek: () => { // 세탁기 뒤로 들어가 왼쪽으로 얼굴만 빼꼼
        const r = route(P().findIndex(p => p.n === 'floor'), () => world.hide[0] + 15);
        return r ? [...r, hold('sit', idle(rand(6000, 10000)), -1)] : plan.sit();
      },
    };
    const pick = () => {
      const w = { walk: 4, sit: 3, sleep: sleepy * 10, run: energy * 4, jump: 1 + energy * 3, stretch: 1, play: 1, chase: cats.length > 1 ? energy * 2 : 0, climb: world.room ? 3 : 0, peek: world.room && d.hider ? 2 : 0 };
      if (stay()) Object.assign(w, { walk: 0.3, run: 0, jump: 0, chase: 0, climb: 0.3, sit: 9, sleep: sleepy * 30 });
      let r = rand(0, Object.values(w).reduce((a, b) => a + b));
      for (const k in w) if ((r -= w[k]) < 0) return plan[k]();
      return plan.sit();
    };

    // 밖에서 부르는 것들. 점프 도중에는 끼어들지 않는다
    const interrupt = acts => { if (cat.air) return; queue = acts; act = null; };
    cat.flee = () => interrupt([leap(cat.plat, () => cat.x), travel('run', speed * 2.6, far, 80)]);
    cat.eat = (pi, x, treat) => {
      const r = route(pi, () => x);
      if (r) interrupt([...r, hold('sit', [[3, 500], [0, 250], [3, 600], [0, 250], [3, 700]]), () => { treat.remove(); return true; }]);
    };
    const spawn = (cls, html, dx, ms) => {
      const n = document.createElement('div');
      n.className = cls; n.innerHTML = html;
      n.style.cssText = `left:${cat.x + dx}px;bottom:${cat.gy + 70 * world.S}px`;
      world.el.append(n);
      setTimeout(() => n.remove(), ms);
    };
    sp.firstChild.addEventListener('click', e => { // 쓰다듬기
      e.stopPropagation();
      if (cat.air) return;
      interrupt([hold('sit', [[0, 2400]])]);
      for (let i = 0; i < 3; i++) setTimeout(() => spawn('heart', '♥', rand(-16, 16), 1400), i * 250);
      spawn('bubble', says[Math.floor(Math.random() * says.length)], 0, 2200);
    });
    cat.enter = () => {
      world.el.append(el);
      const f = P()[0];
      cat.plat = 0; cat.gy = 0; cat.air = false; lift = 0; cat.x = clampX(f, rand(f.x[0], f.x[1])); act = null; queue = [];
    };

    setInterval(() => {
      const now = performance.now(), dt = Math.min((now - last) / 1000, 0.2);
      last = now;
      if (lure && now - lure.t < 700 && now > teaseAt && !world.room && !cat.air && Math.random() < 0.05 && (row !== 'sleep' || Math.abs(cat.x - lure.x) < 150)) {
        teaseAt = now + rand(4000, 7000); // 마우스 커서를 장난감으로 알고 달려와 툭툭 친다
        interrupt([travel('run', speed * 2.2, () => lure.x, 80), hold('play', [[2, 300], [3, 250], [2, 200], [3, 250], [2, 200], [3, 300]])]);
      }
      if (!act && !(act = queue.shift())) { queue = pick(); act = queue.shift(); }
      if (act(now, dt)) act = null;
      const S = world.S, snap = v => Math.round(v / S) * S;
      cat.x = Math.min(Math.max(cat.x, 0), world.room ? 960 : innerWidth);
      el.style.transform = `translate(${snap(cat.x - F / 2)}px, ${PAD * S - snap(cat.gy)}px) scale(${S * dir}, ${S})`;
      sp.style.transform = `translateY(${-Math.round(lift / S)}px)`;
      sp.style.backgroundPosition = `${-frame * F}px ${-ROW[row] * F}px`;
    }, 50);
  });

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
})();
