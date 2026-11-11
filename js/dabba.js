/* The Masala Dabba: the menu as a round steel spice tin.
   Each katori is a tab; its chapter is real HTML text beside the tin.
   Hover or tap a katori and a pinch of that spice puffs up as smoke. */
import { $, $$, withFluid, getFluid, motionOn } from './site.js';

const list = $('[role="tablist"]');
if (list) {
  const tabs = $$('[role="tab"]', document);
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
  const rgb = (t) => (t.dataset.rgb || '0.9,0.6,0.2').split(',').map(Number);

  const puff = (t, amt = 1) => {
    const f = getFluid();
    if (!f || !motionOn()) return;
    const bowl = $('.katori__spice', t) || t;
    const r = bowl.getBoundingClientRect();
    f.puff(r.left + r.width / 2, r.top + r.height / 2, rgb(t), amt);
  };

  function select(tab, { focus = false, fx = true, hash = true } = {}) {
    tabs.forEach((t, i) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const p = panels[i];
      if (!p) return;
      p.hidden = !on;
      p.classList.toggle('is-in', on);
    });
    if (focus) tab.focus();
    if (fx) puff(tab, 1.2);
    if (hash) history.replaceState(null, '', `#${tab.dataset.slug}`);
    const f = getFluid();
    if (f) requestAnimationFrame(() => f.measure());
    // on phones the chapter sits below the tin: bring its heading into view
    if (fx && innerWidth < 1080) {
      const p = panels[tabs.indexOf(tab)];
      const h = p && $('h2', p);
      if (h && h.getBoundingClientRect().top > innerHeight * 0.85) h.scrollIntoView({ behavior: motionOn() ? 'smooth' : 'auto', block: 'start' });
    }
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') puff(t, 0.7); });
    t.addEventListener('keydown', (e) => {
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j < 0) return;
      e.preventDefault();
      select(tabs[j], { focus: true });
    });
  });

  const fromHash = tabs.find((t) => `#${t.dataset.slug}` === location.hash);
  select(fromHash || tabs[0], { fx: false, hash: false });

  // once the lid has lifted, the first pinch rises from the open tin
  withFluid(() => {
    setTimeout(() => {
      const cur = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
      if (cur) puff(cur, 1.4);
      tabs.forEach((t, k) => { if (t !== cur && !t.closest('.thai-tab')) setTimeout(() => puff(t, 0.35), 120 + k * 90); });
    }, 1700);
  });
}
