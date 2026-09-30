// 같은 사이트 안의 이동은 페이지를 통째로 새로 불러오지 않고 헤더·본문·푸터만 바꾼다.
// 그래야 화면 아래의 고양이(assets/cats.js)가 끊기지 않고 계속 움직인다. 실패하면 평범한 이동으로 되돌아간다.
(() => {
  const swap = doc => {
    for (const sel of ['.site-header', 'main', '.site-footer']) {
      document.querySelector(sel).replaceWith(document.importNode(doc.querySelector(sel), true));
    }
    document.title = doc.title;
    document.querySelectorAll('main script').forEach(old => { // 파서가 넣은 script는 실행되지 않으니 새로 만든다
      const s = document.createElement('script');
      if (old.src) s.src = old.src; else s.text = old.text;
      old.replaceWith(s);
    });
    scrollTo(0, 0);
    document.querySelector('main').focus({ preventScroll: true });
    dispatchEvent(new Event('softnav'));
  };

  const go = async (url, push) => {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.headers.get('content-type')?.includes('text/html')) throw 0;
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      if (push) history.pushState(null, '', url);
      swap(doc);
    } catch {
      location.href = url;
    }
  };

  document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target || a.hasAttribute('download') || a.origin !== location.origin) return;
    if (a.pathname === location.pathname && a.search === location.search && a.hash) return; // 같은 페이지 안의 #링크
    e.preventDefault();
    go(a.href, true);
  });
  addEventListener('popstate', () => go(location.href, false));
})();
