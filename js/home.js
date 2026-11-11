/* Aroma — the opening. "Aroma first." is written into the smoke, holds,
   then lets go in curls and the dish appears beneath. The real <h1> is
   always in the page; it condenses in as the smoke words hold. */
import { withFluid, motionOn, $, $$ } from './site.js';

const html = document.documentElement;
const hero = $('.hero');
const title = $('.hero__title');

if (hero && title) {
  withFluid((f) => {
    if (!motionOn()) return;
    hero.classList.add('is-forming');
    f.darken();
    const go = () => {
      const lines = $$('.hero__title .ln', hero);
      const points = [];
      f.intro((ctx, sx, sy) => {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        for (const ln of lines) {
          const cs = getComputedStyle(ln);
          const range = document.createRange();
          range.selectNodeContents(ln);
          const r = range.getBoundingClientRect();
          const size = parseFloat(cs.fontSize) * sy;
          ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
          if ('letterSpacing' in ctx) ctx.letterSpacing = `${(parseFloat(cs.letterSpacing) || 0) * sx}px`;
          // match the HTML type's baseline: the em box sits inside the line box
          const base = (r.top + r.height * 0.5) * sy + size * 0.36;
          const x = r.left * sx;
          ctx.save();
          ctx.shadowColor = 'rgba(255,255,255,1)';
          ctx.shadowBlur = size * 0.16;
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.fillText(ln.textContent, x, base);
          ctx.restore();
          ctx.fillStyle = '#fff';
          ctx.fillText(ln.textContent, x, base);
          // release points along each line, in uv space
          for (let i = 0; i <= 8; i++) {
            const px = (r.left + r.width * (i / 8)) / innerWidth;
            const py = 1 - (r.top + r.height * (0.35 + Math.random() * 0.4)) / innerHeight;
            points.push(px, py);
          }
        }
      }, points, {
        onHold() { hero.classList.add('is-formed'); },
        onRelease() { hero.classList.add('is-released'); },
        onDone() { hero.classList.remove('is-forming'); }
      });
      // anyone who scrolls or presses a key is not made to wait
      const skip = () => { f.skipIntro(); removeEventListener('scroll', skip); removeEventListener('keydown', skip); };
      addEventListener('scroll', skip, { passive: true, once: true });
      addEventListener('keydown', skip, { once: true });
    };
    const fonts = document.fonts && document.fonts.load ? document.fonts.load(`${getComputedStyle(title).fontWeight} 100px Fraunces`) : Promise.resolve();
    Promise.race([fonts, new Promise((r) => setTimeout(r, 1400))]).then(go, go);
  });
  // safety: whatever happens, the headline is never left invisible
  setTimeout(() => { if (hero.classList.contains('is-forming') && !hero.classList.contains('is-formed')) hero.classList.add('is-formed'); }, 5000);
}
if (!html.classList.contains('fx') && hero) hero.classList.add('is-static');
