// soft-nav.js가 페이지를 이동할 때 다시 실행되므로 전역 변수를 만들지 않는다
(() => {
  const filters = document.querySelector('[data-filters]');
  if (!filters) return;
  const buttons = [...filters.querySelectorAll('button')];
  const writings = [...document.querySelectorAll('.writing-card')];

  filters.hidden = false;
  buttons.forEach(button => button.addEventListener('click', () => {
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    writings.forEach(writing => {
      writing.hidden = button.dataset.filter !== 'all' && writing.dataset.topic !== button.dataset.filter;
    });
    const count = writings.filter(writing => !writing.hidden).length;
    document.querySelector('#writing-count').textContent = `${count}편의 글`;
  }));
})();
