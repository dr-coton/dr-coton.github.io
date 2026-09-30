const filters = document.querySelector('[data-filters]');
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
