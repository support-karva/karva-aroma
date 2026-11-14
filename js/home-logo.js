/* SAMPLE opening (index-logo.html): the Karva logo is written in smoke first.
   1. dark screen, smoke gathers into the shape of the logo
   2. the gold logo condenses out of it; the smoke lifts away in curls
   3. steam keeps rising off the clay pot while the logo holds
   4. the logo dissolves back into smoke and "Aroma first." forms, as before
   Scrolling or a key press skips straight to the page. */
import { withFluid, motionOn, $, $$ } from './site.js';

const html = document.documentElement;
const hero = $('.hero');
const title = $('.hero__title');
const mark = $('.logo-intro');
const markImg = mark && $('img', mark);

// where the soup surface sits inside the logo picture (fractions of its box)
const POT = { x: 0.165, y: 0.37, w: 0.17 };
const LOGO_HOLD = 4.2;   // seconds the gold logo stands with steam rising

/* Steam off the pot: soft wisps that rise, sway, widen and fade.
   Drawn on a small canvas pinned just above the pot. */
function createSteam(host, img) {
  const c = document.createElement('canvas');
  c.className = 'logo-intro__steam';
  host.appendChild(c);
  const ctx = c.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0, scale = 1, raf = 0, last = 0, on = false, acc = 0;
  const P = [];
  const place = () => {
    const r = img.getBoundingClientRect(), hr = host.getBoundingClientRect();
    scale = r.width / 1000;
    W = Math.round(r.width * 0.34); H = Math.round(r.height * 1.25);
    c.width = W * dpr; c.height = H * dpr;
    c.style.width = `${W}px`; c.style.height = `${H}px`;
    c.style.left = `${r.left - hr.left + r.width * POT.x - W / 2}px`;
    c.style.top = `${r.top - hr.top + r.height * POT.y - H}px`;
  };
  const spawn = () => {
    P.push({
      x: W / 2 + (Math.random() - 0.5) * W * POT.w * 1.6 / 0.34 * 0.5,
      y: H - 4 * scale,
      vy: -(34 + Math.random() * 26) * scale,
      ph: Math.random() * 6.28, sw: (8 + Math.random() * 14) * scale,
      r0: (7 + Math.random() * 7) * scale, life: 0, dur: 2.2 + Math.random() * 1.4
    });
  };
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (on) { acc += dt * 32; while (acc > 1) { spawn(); acc--; } }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life += dt / p.dur;
      if (p.life >= 1) { P.splice(i, 1); continue; }
      p.y += p.vy * dt;
      const t = p.life;
      const x = p.x + Math.sin(now / 900 + p.ph + t * 3) * p.sw * t;
      const rad = p.r0 * (1 + t * 2.2);
      // strongest just above the rim, gone before it drifts clear of the logo's own steam
      const a = Math.min(1, t * 6) * Math.pow(1 - t, 1.6) * 0.13;
      const g = ctx.createRadialGradient(x, p.y, 0, x, p.y, rad);
      g.addColorStop(0, `rgba(255, 244, 228, ${a})`);
      g.addColorStop(1, 'rgba(255, 244, 228, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, p.y, rad, 0, 6.283); ctx.fill();
    }
    if (!on && !P.length) { cancelAnimationFrame(raf); raf = 0; }
  };
  addEventListener('resize', place);
  return {
    start() { place(); on = true; c.classList.add('is-on'); if (!raf) { last = 0; raf = requestAnimationFrame(frame); } },
    stop() { on = false; c.classList.remove('is-on'); },
    kill() { on = false; P.length = 0; cancelAnimationFrame(raf); raf = 0; c.remove(); }
  };
}

const ready = (img) => (img.complete && img.naturalWidth ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; }));

if (hero && title && mark && markImg) {
  html.classList.add('logo-intro-on');
  withFluid((f) => {
    if (!motionOn()) { mark.remove(); return; }
    hero.classList.add('is-forming');
    f.darken();
    let phase = 'logo', textStarted = false, thinning = 0;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const steam = createSteam(mark, markImg);

    const box = () => markImg.getBoundingClientRect();
    const stopSteam = () => steam.stop();
    // let the leftover fog sink back to dark, so the words form on black
    const clearFog = (ms, then) => {
      const n = Math.max(1, Math.round(ms / 50));
      let i = 0;
      thinning = setInterval(() => { f.thin(0.16); if (++i >= n) { clearInterval(thinning); thinning = 0; then && then(); } }, 50);
    };

    /* the second act: "Aroma first." written in smoke (same as the live page) */
    const startText = (instant) => {
      if (textStarted) return;
      textStarted = true;
      phase = 'text';
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
          for (let i = 0; i <= 8; i++) {
            points.push((r.left + r.width * (i / 8)) / innerWidth, 1 - (r.top + r.height * (0.35 + Math.random() * 0.4)) / innerHeight);
          }
        }
      }, points, {
        onHold() { hero.classList.add('is-formed'); },
        onRelease() { hero.classList.add('is-released'); },
        onDone() { hero.classList.remove('is-forming'); phase = 'done'; }
      });
      if (instant) f.skipIntro();
    };

    /* the first act: the logo */
    const startLogo = () => {
      const points = [];
      f.intro((ctx, sx, sy) => {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        const r = box();
        ctx.drawImage(markImg, r.left * sx, r.top * sy, r.width * sx, r.height * sy);
        // release points spread over the logo, so it lifts away everywhere at once
        for (let i = 0; i < 28; i++) {
          points.push((r.left + r.width * Math.random()) / innerWidth, 1 - (r.top + r.height * (0.2 + Math.random() * 0.6)) / innerHeight);
        }
      }, points, {
        onHold() { mark.classList.add('is-in'); later(() => steam.start(), 500); },
        onRelease() {
          f.darken();                        // keep the photo hidden while the logo stands
          later(() => {                      // the logo goes back into the smoke
            mark.classList.add('is-out');
            const r = box();
            f.veilBurst(r.left, r.top, r.width, r.height, 0.14);
            stopSteam();
            later(() => clearFog(900, () => startText(false)), 500);
          }, LOGO_HOLD * 1000);
        }
      });
    };

    // anyone who scrolls or presses a key is not made to wait
    const skip = () => {
      removeEventListener('scroll', skip); removeEventListener('keydown', skip);
      if (phase === 'done') return;
      timers.forEach(clearTimeout); clearInterval(thinning); steam.kill();
      mark.classList.add('is-out', 'is-quick');
      if (phase === 'logo') startText(true); else f.skipIntro();
    };
    addEventListener('scroll', skip, { passive: true });
    addEventListener('keydown', skip);

    const fonts = document.fonts && document.fonts.load ? document.fonts.load(`${getComputedStyle(title).fontWeight} 100px Fraunces`) : Promise.resolve();
    Promise.race([Promise.all([fonts, ready(markImg)]), new Promise((r) => setTimeout(r, 1800))]).then(startLogo, startLogo);
  });
  // safety: whatever happens, the headline is never left invisible
  setTimeout(() => { if (!hero.classList.contains('is-formed')) { hero.classList.add('is-formed', 'is-released'); mark.classList.add('is-out'); } }, 20000);
}
if (!html.classList.contains('fx') && hero) hero.classList.add('is-static');
if (!html.classList.contains('fx') && mark) mark.remove();
