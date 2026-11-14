/* The menu card: sections rise in as they are reached, and the strip of
   section names under the header follows where you are on the page. */
import { $, $$ } from './site.js';

const secs = $$('[data-sec]');
const chips = $$('[data-chips] a');
const strip = $('.mc-chips__in');

secs.forEach((s) => $$('.mc-list > li', s).forEach((li, i) => li.style.setProperty('--i', Math.min(i, 12))));

if ('IntersectionObserver' in window) {
  const reveal = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); reveal.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
  secs.forEach((s) => reveal.observe(s));

  let current = null;
  const mark = (id) => {
    if (id === current) return;
    current = id;
    chips.forEach((a) => {
      const on = a.getAttribute('href') === `#${id}`;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      if (on && strip && strip.scrollWidth > strip.clientWidth) {
        strip.scrollTo({ left: a.offsetLeft - (strip.clientWidth - a.offsetWidth) / 2, behavior: 'smooth' });
      }
    });
  };
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) mark(e.target.id); });
  }, { rootMargin: '-30% 0px -60% 0px' });
  secs.forEach((s) => spy.observe(s));
} else {
  secs.forEach((s) => s.classList.add('is-in'));
}

/* Dish photo that floats beside the mouse when you move over a dish.
   Only on computers with a mouse; phones keep the plain list. */
const fine = matchMedia('(hover: hover) and (pointer: fine)');
const withImg = $$('.mc-list li[data-img]');
if (withImg.length) {
  const peek = document.createElement('div');
  peek.className = 'mc-peek';
  peek.setAttribute('aria-hidden', 'true');
  peek.innerHTML = '<img alt="" decoding="async"><span class="mc-peek__ai">AI image</span><span class="mc-peek__cap"></span>';
  document.body.appendChild(peek);
  const img = $('img', peek);
  const cap = $('.mc-peek__cap', peek);
  const badge = $('.mc-peek__ai', peek);
  const W = 230, H = 288, GAP = 26;
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0, active = null;

  // up and to the right of the cursor; flips away from the screen edges
  const place = () => {
    let nx = tx + GAP, ny = ty - H - GAP / 2;
    if (nx + W > innerWidth - 12) nx = tx - W - GAP;
    if (ny < 80) ny = ty + GAP;
    if (ny + H > innerHeight - 12) ny = innerHeight - H - 12;
    return [nx, ny];
  };
  const tick = () => {
    const [nx, ny] = place();
    const k = document.documentElement.dataset.motion === 'off' ? 1 : 0.2;
    x += (nx - x) * k;
    y += (ny - y) * k;
    peek.style.setProperty('--px', `${x.toFixed(1)}px`);
    peek.style.setProperty('--py', `${y.toFixed(1)}px`);
    raf = Math.abs(nx - x) + Math.abs(ny - y) > 0.3 ? requestAnimationFrame(tick) : 0;
  };
  const follow = (e) => { tx = e.clientX; ty = e.clientY; if (!raf) raf = requestAnimationFrame(tick); };
  const hide = () => { active = null; peek.classList.remove('is-on'); };

  withImg.forEach((li) => {
    li.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || !fine.matches) return;
      const wasOn = peek.classList.contains('is-on');
      active = li;
      tx = e.clientX; ty = e.clientY;
      if (!wasOn) [x, y] = place();
      const src = li.dataset.img;
      if (img.getAttribute('src') !== src) {
        img.classList.add('is-loading');
        img.onload = () => img.classList.remove('is-loading');
        img.src = src;
      }
      cap.textContent = $('.mc-nm span', li).textContent;
      badge.textContent = li.dataset.photo === 'stand-in' ? 'Stand-in photo' : 'AI image';
      peek.classList.add('is-on');
      follow(e);
    });
    li.addEventListener('pointermove', (e) => { if (active === li) follow(e); });
    li.addEventListener('pointerleave', () => { if (active === li) hide(); });
  });
  addEventListener('scroll', () => { if (active && !active.matches(':hover')) hide(); }, { passive: true });
  addEventListener('mc:dish-open', hide);

  // load the photos once the section is close, so they appear at once
  // (one section at a time, so the page does not fetch every photo up front)
  if (fine.matches && 'IntersectionObserver' in window) {
    const pre = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        $$('.mc-list li[data-img]', e.target).forEach((li) => { const i = new Image(); i.src = li.dataset.img; });
        pre.unobserve(e.target);
      });
    }, { rootMargin: '600px 0px' });
    new Set(withImg.map((li) => li.closest('[data-sec]')).filter(Boolean)).forEach((s) => pre.observe(s));
  }
}

/* Click a dish: a card opens with its photo, what is in it, the story,
   how it is plated and its allergens. Arrows (or ← →) step to the next dish. */
const dlg = $('[data-dish-dialog]');
const dataEl = $('#dish-data');
if (dlg && dataEl && typeof dlg.showModal === 'function') {
  const DATA = JSON.parse(dataEl.textContent);
  const order = $$('.mc-list li[data-dish]').map((li) => li.dataset.dish);
  const body = $('.mc-dish__body', dlg);
  const field = (k) => $(`[data-d="${k}"]`, dlg);
  const pic = field('img');
  let idx = -1, opener = null;

  const list = (el, items) => {
    el.replaceChildren(...items.map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
  };
  const fill = (slug, swap) => {
    const d = DATA[slug];
    if (!d) return;
    idx = order.indexOf(slug);
    field('no').textContent = `${d.section || 'Chaat'} · ${d.no}`;
    field('name').textContent = d.name;
    field('aka').textContent = d.aka;
    field('aka').hidden = !d.aka;
    field('inh').textContent = d.insideTitle || "What's in it";
    list(field('inside'), d.inside);
    field('story').textContent = d.story;
    list(field('plate'), d.plate || []);
    field('plate').hidden = field('plateh').hidden = !(d.plate && d.plate.length);
    field('cap').textContent = d.photo || 'AI image · placeholder';
    field('allergens').textContent = d.allergens;
    const NAMES = { veg: 'Vegetarian', vegan: 'Vegan', gluten: 'Gluten', dairy: 'Dairy', peanuts: 'Peanuts', mustard: 'Mustard', soy: 'Soy', sesame: 'Sesame', nonveg: 'Non-vegetarian' };
    const ico = (k) => `<svg aria-hidden="true"><use href="#i-${k}"/></svg>`;
    const tags = d.tags || [];
    const diet = tags.find((t) => t === 'veg' || t === 'vegan' || t === 'nonveg');
    field('diet').innerHTML = diet ? `${ico(diet)}${NAMES[diet]}` : '';
    const has = tags.filter((t) => t !== diet);
    const chips = field('contains');
    chips.innerHTML = has.map((k) => `<li>${ico(k)}${NAMES[k]}</li>`).join('');
    chips.hidden = !has.length;
    chips.previousElementSibling.hidden = !has.length;
    field('count').textContent = `${String(idx + 1).padStart(2, '0')} / ${String(order.length).padStart(2, '0')}`;
    if (pic.getAttribute('src') !== d.img) {
      pic.classList.add('is-loading');
      pic.onload = () => pic.classList.remove('is-loading');
      if (d.img4k) { pic.srcset = `${d.img} 1920w, ${d.img4k} 3840w`; pic.sizes = '(max-width: 759px) 100vw, 460px'; }
      else { pic.removeAttribute('srcset'); pic.removeAttribute('sizes'); }
      pic.src = d.img;
      pic.alt = d.photo ? `Stand-in photograph for ${d.name}; Karva's own plating may look different.` : `AI-generated placeholder image of ${d.name}.`;
    }
    body.scrollTop = 0;
    if (dlg.querySelector('.mc-dish__card').scrollTop) dlg.querySelector('.mc-dish__card').scrollTop = 0;
    if (swap) { body.classList.remove('is-swap'); void body.offsetWidth; body.classList.add('is-swap'); }
  };

  const open = (slug, from) => {
    opener = from || null;
    fill(slug, false);
    dispatchEvent(new Event('mc:dish-open'));
    dlg.classList.remove('is-closing');
    dlg.showModal();
    document.body.classList.add('is-locked');
    const title = field('name');
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
  };
  let closing = false;
  const close = (now) => {
    if (!dlg.open || closing) return;
    const done = () => {
      closing = false;
      dlg.classList.remove('is-closing');
      dlg.close();
      document.body.classList.remove('is-locked');
      if (opener) opener.focus({ preventScroll: true });
    };
    if (now || document.documentElement.dataset.motion === 'off') { done(); return; }
    closing = true;
    dlg.classList.add('is-closing');
    setTimeout(done, 240);
  };
  const step = (n) => { if (idx < 0) return; fill(order[(idx + n + order.length) % order.length], true); };

  $$('.mc-list li[data-dish]').forEach((li) => {
    const btn = $('.mc-open', li);
    btn.addEventListener('click', (e) => { e.stopPropagation(); open(li.dataset.dish, btn); });
    li.addEventListener('click', (e) => { if (!e.target.closest('a')) open(li.dataset.dish, btn); });
  });
  $('[data-d-close]', dlg).addEventListener('click', () => close());
  $$('[data-d-step]', dlg).forEach((b) => b.addEventListener('click', () => step(+b.dataset.dStep)));
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });
  // a click on the dim area outside the card closes it
  dlg.addEventListener('click', (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
  });
  // Reserve inside the card: shut the card first so the booking panel is on top
  $$('[data-reserve]', dlg).forEach((a) => a.addEventListener('click', () => close(true), { capture: true }));

  // a link like menu.html#dish-papdi-chaat opens that dish straight away
  const m = /^#dish-([a-z-]+)$/.exec(location.hash);
  if (m && DATA[m[1]]) open(m[1], $(`li[data-dish="${m[1]}"] .mc-open`));
}
