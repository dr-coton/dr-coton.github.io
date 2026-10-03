// soft-nav.js가 페이지를 이동할 때 다시 실행되므로 전역 변수를 만들지 않는다
(() => {
  const filters = document.querySelector('[data-filters]');
  if (!filters) return;
  const buttons = [...filters.querySelectorAll('button')];
  const writings = [...document.querySelectorAll('.writing-card')];
  const search = document.querySelector('#writing-search');
  const empty = document.querySelector('[data-empty-search]');
  const params = new URLSearchParams(location.search);
  const searchIndex = new Map();
  let searchIndexRequest;
  let activeTopic = 'all';

  filters.hidden = false;
  const normalize = value => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const words = value => normalize(value).split(' ').filter(Boolean);
  const indexUrl = `${location.origin}/search.json`;

  function loadSearchIndex() {
    if (!search || searchIndexRequest) return searchIndexRequest;
    searchIndexRequest = fetch(indexUrl)
      .then(response => (response.ok ? response.json() : []))
      .then(items => {
        items.forEach(item => {
          searchIndex.set(item.url, normalize([item.title, item.topic, item.description, item.content].join(' ')));
        });
        apply();
      })
      .catch(() => []);
    return searchIndexRequest;
  }

  function apply() {
    const query = words(search ? search.value : '');
    if (query.length) loadSearchIndex();
    let count = 0;
    writings.forEach(writing => {
      const matchesTopic = activeTopic === 'all' || writing.dataset.topic === activeTopic;
      const haystack = searchIndex.get(writing.dataset.url) || normalize(writing.dataset.search || writing.textContent);
      const matchesQuery = query.every(word => haystack.includes(word));
      writing.hidden = !(matchesTopic && matchesQuery);
      if (!writing.hidden) count += 1;
    });
    document.querySelector('#writing-count').textContent = `${count}편의 글`;
    if (empty) empty.hidden = count !== 0;
  }

  if (search && params.has('q')) search.value = params.get('q');
  buttons.forEach(button => button.addEventListener('click', () => {
    activeTopic = button.dataset.filter;
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    apply();
  }));
  if (search) search.addEventListener('input', apply);
  apply();
})();
