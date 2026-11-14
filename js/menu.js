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
