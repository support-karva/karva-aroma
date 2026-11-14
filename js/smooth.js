/* Smooth wheel scrolling, stepped in the same animation frame that draws the
   smoke and the photos. Because the page moves and the photos are drawn in
   one step, they can never slide out of line with each other while scrolling.

   Only for a mouse or trackpad wheel. Touch, keyboard, scrollbar and links
   keep the browser's own scrolling. Anything that scrolls on its own (the
   phone menu, the dish card, the section strip) is left alone. */

const fine = matchMedia('(pointer: fine)');

export function createSmooth() {
  let on = false, moving = false;
  let target = scrollY, current = scrollY, lastT = 0;

  const maxY = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);

  // does something between the pointer and the page want this wheel itself?
  const ownScroller = (el, dy) => {
    for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (el.tagName === 'DIALOG') return true;
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        if ((dy < 0 && el.scrollTop > 0) || (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1)) return true;
      }
    }
    return false;
  };

  const onWheel = (e) => {
    if (!on || !fine.matches || e.ctrlKey || e.defaultPrevented) return;
    // if the animation has stalled for any reason, never trap the wheel
    if (performance.now() - lastT > 250) return;
    if (document.body.classList.contains('is-locked')) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= innerHeight;
    if (!dy || ownScroller(e.target, dy)) return;
    e.preventDefault();
    if (!moving) { current = scrollY; target = scrollY; }
    target = Math.min(maxY(), Math.max(0, target + dy));
    moving = true;
  };

  // keyboard, scrollbar, links: follow wherever the browser went
  const onScroll = () => { if (!moving) { current = target = scrollY; } };

  addEventListener('wheel', onWheel, { passive: false });
  addEventListener('scroll', onScroll, { passive: true });

  return {
    set enabled(v) { on = !!v; if (!on) moving = false; },
    get enabled() { return on; },
    /** call once per animation frame, before anything reads scrollY */
    step(now) {
      const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
      lastT = now;
      if (!moving) return;
      // the browser may have moved under us (find-in-page, a link): follow it
      if (Math.abs(scrollY - current) > 2) { current = scrollY; }
      const k = 1 - Math.exp(-dt * 11);
      current += (target - current) * k;
      if (Math.abs(target - current) < 0.4) { current = target; moving = false; }
      window.scrollTo({ top: current, behavior: 'instant' });
    }
  };
}
