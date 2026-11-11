/* Ārambh: the chaat counter.
   Native horizontal scroll with snap (trackpad, touch, arrow keys).
   Each plate opens a detail sheet built from the dish's own article in the
   ledger, so every word is real text in the page. */
import { $, $$, getFluid, motionOn, lockScroll, unlockScroll } from './site.js';

const track = $('.counter__track');
const plates = $$('.plate');
const sheet = $('#sheet');

if (track) {
  const prev = $('[data-prev]'), next = $('[data-next]');
  const stepW = () => { const it = $('.counter__item', track); return it ? it.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 24) : 260; };
  const behavior = () => (motionOn() ? 'smooth' : 'auto');
  prev && prev.addEventListener('click', () => track.scrollBy({ left: -stepW() * 2, behavior: behavior() }));
  next && next.addEventListener('click', () => track.scrollBy({ left: stepW() * 2, behavior: behavior() }));
  const sync = () => {
    const max = track.scrollWidth - track.clientWidth - 4;
    if (prev) prev.disabled = track.scrollLeft <= 4;
    if (next) next.disabled = track.scrollLeft >= max;
  };
  track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
  addEventListener('resize', sync);
  sync();

  // arrow keys walk the counter plate by plate
  plates.forEach((p, i) => {
    p.addEventListener('keydown', (e) => {
      let j = -1;
      if (e.key === 'ArrowRight') j = Math.min(plates.length - 1, i + 1);
      else if (e.key === 'ArrowLeft') j = Math.max(0, i - 1);
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = plates.length - 1;
      if (j < 0) return;
      e.preventDefault();
      plates[j].focus({ preventScroll: true });
      plates[j].scrollIntoView({ behavior: behavior(), inline: 'center', block: 'nearest' });
    });
  });
}

if (sheet && typeof sheet.showModal === 'function') {
  const body = $('.sheet__body', sheet);
  const img = $('.sheet__ph img', sheet);
  const order = plates.map((p) => p.getAttribute('href').slice(1));
  let current = -1, opener = null;

  function show(id) {
    const art = document.getElementById(id);
    if (!art) return;
    current = order.indexOf(id);
    body.innerHTML = '';
    for (const node of art.children) body.appendChild(node.cloneNode(true));
    const h = $('.dish__name', body);
    if (h) { h.id = 'sheet-title'; h.setAttribute('tabindex', '-1'); }
    const base = art.dataset.img;
    img.src = `${base}.jpg`;
    img.srcset = `${base}.jpg 479w, ${base}@2x.jpg 958w`;
    img.alt = art.dataset.alt || '';
    $('[data-sheet-prev]', sheet).disabled = current <= 0;
    $('[data-sheet-next]', sheet).disabled = current >= order.length - 1;
    sheet.classList.remove('is-steaming');
    void sheet.offsetWidth;
    sheet.classList.add('is-steaming');
    const f = getFluid();
    if (f && motionOn()) {
      const r = $('.sheet__ph', sheet).getBoundingClientRect();
      f.puff(r.left + r.width / 2, r.top + r.height * 0.7, [0.95, 0.9, 0.8], 1.1);
    }
  }
  function open(id, from) {
    opener = from || document.activeElement;
    if (!sheet.open) { sheet.showModal(); lockScroll(); }
    show(id);
    $('.sheet__close', sheet).focus({ preventScroll: true });
  }
  function close() { if (sheet.open) sheet.close(); }
  sheet.addEventListener('close', () => {
    unlockScroll();
    sheet.classList.remove('is-steaming');
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  });
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close();        // the backdrop
    if (e.target.closest('[data-sheet-close]')) close();
    if (e.target.closest('[data-sheet-prev]') && current > 0) show(order[current - 1]);
    if (e.target.closest('[data-sheet-next]') && current < order.length - 1) show(order[current + 1]);
  });
  plates.forEach((p) => p.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    open(p.getAttribute('href').slice(1), p);
  }));
  window.__chaatSheet = { open: (i) => open(order[i]), close };
}
