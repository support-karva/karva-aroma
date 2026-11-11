/* ==========================================================================
   Aroma — behaviour shared by every page.
   Everything here is progressive: with JS off the pages read complete, with
   Motion off nothing moves, and with no WebGL the photographs simply show
   through a static CSS haze. The smoke is decoration over real HTML.
   Reused from the flagship site: prefs.js (Motion switch), status.js (live
   open/closed in America/Chicago) and the reservation panel below.
   ========================================================================== */
import { motionOn, onMotion, initMotionToggles } from './prefs.js';
import { initStatus, chicagoMinutes, chicagoToday, clock, SERVICES } from './status.js';
import { createFluid } from './fluid.js';

export { motionOn, onMotion };
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const html = document.documentElement;
const PHONE = '+12146180078';
const PHONE_TXT = '(214) 618-0078';
const EMAIL = 'support@karvatx.com';

initMotionToggles($$('[data-motion-toggle]'));
initStatus();

/* ==========================================================================
   Scroll lock + focus trap (shared by the panel and the phone menu)
   ========================================================================== */
let locks = 0;
export function lockScroll() { if (++locks === 1) document.body.classList.add('is-locked'); }
export function unlockScroll() { locks = Math.max(0, locks - 1); if (!locks) document.body.classList.remove('is-locked'); }

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export function trap(layer) {
  const others = Array.from(document.body.children).filter((el) => el !== layer && !el.inert && el.tagName !== 'SCRIPT' && el.tagName !== 'CANVAS');
  others.forEach((el) => { el.inert = true; });
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const list = $$(FOCUSABLE, layer).filter((el) => el.offsetParent !== null);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  layer.addEventListener('keydown', onKey);
  return () => { others.forEach((el) => { el.inert = false; }); layer.removeEventListener('keydown', onKey); };
}
function layerOpen(layer) { layer.hidden = false; void layer.offsetWidth; layer.classList.add('is-open'); }
function layerClose(layer, done) {
  layer.classList.remove('is-open');
  setTimeout(() => { layer.hidden = true; done && done(); }, motionOn() ? 420 : 0);
}

/* ==========================================================================
   Phone menu: a native <details>; JS adds Esc, scroll lock and tidy close
   ========================================================================== */
const mnav = $('.mnav');
if (mnav) {
  const summary = $('summary', mnav);
  summary.setAttribute('aria-expanded', 'false');
  let was = false;
  mnav.addEventListener('toggle', () => {
    if (mnav.open === was) return;
    was = mnav.open;
    summary.setAttribute('aria-expanded', String(was));
    summary.setAttribute('aria-label', was ? 'Close pages menu' : 'Open pages menu');
    was ? lockScroll() : unlockScroll();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mnav.open) { mnav.open = false; summary.focus(); } });
  window.addEventListener('resize', () => { if (mnav.open && innerWidth >= 900) mnav.open = false; });
}

/* nav darkens a touch once the page moves */
const nav = $('[data-nav]');
if (nav) {
  let tick = false;
  const set = () => { tick = false; nav.classList.toggle('is-scrolled', scrollY > 24); };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(set); } }, { passive: true });
  set();
}

/* ==========================================================================
   The atmosphere
   ========================================================================== */
const PRESETS = {
  // smoke is an accent: thin, quick to fade, never a blanket over the food
  aroma: { config: { fill: 0, dyeDiss: 1.5, curl: 16, breath: 0.32, alpha: 0.27, hue: 0.22 }, tone: [0.95, 0.82, 0.58] },
  dabba: { config: { fill: 0, dyeDiss: 1.3, curl: 13, breath: 0.24, alpha: 0.3, hue: 0.75 }, tone: [0.9, 0.72, 0.45] },
  chaat: { config: { fill: 0, dyeDiss: 1.5, curl: 14, breath: 0.28, alpha: 0.25, hue: 0.12 }, tone: [0.95, 0.88, 0.75] },
  table: { config: { fill: 0, dyeDiss: 0.9, curl: 10, breath: 0.36, velDiss: 0.6, splatForce: 2000, alpha: 0.23, hue: 0.55 }, tone: [0.9, 0.5, 0.22] }
};
let fluid = null, fluidFailed = false;
const fluidWaiters = [];
/** run fn(fluid) once the smoke is running (never, if it cannot). */
export function withFluid(fn) { if (fluid) fn(fluid); else fluidWaiters.push(fn); }
export const getFluid = () => fluid;

const preset = PRESETS[document.body.dataset.atmos] || PRESETS.aroma;
const params = new URLSearchParams(location.search);

function bootFluid() {
  if (fluid) { fluid.start(); html.classList.add('fx'); return; }
  if (fluidFailed || params.get('fx') === 'off') { html.classList.remove('fx-pending'); return; }
  const canvas = document.createElement('canvas');
  canvas.className = 'atmos';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const f = createFluid(canvas, {
    config: preset.config,
    onLost: () => { html.classList.remove('fx'); canvas.remove(); fluid = null; fluidFailed = true; }
  });
  if (!f) { canvas.remove(); fluidFailed = true; html.classList.remove('fx-pending'); return; }
  fluid = f;
  window.__aroma = f;          // for inspection in a browser console
  f.toneNow(preset.tone);
  html.classList.add('fx');
  $$('[data-veil]').forEach((el) => f.addVeil(el, { fixed: el.hasAttribute('data-fixed') }));
  $$('[data-zone]').forEach((el) => f.addZone(el, el.dataset.zone ? +el.dataset.zone : undefined));
  if (!document.body.hasAttribute('data-no-enter')) f.enter();
  f.start();
  requestAnimationFrame(() => f.measure());
  addEventListener('load', () => f.measure());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => f.measure());
  fluidWaiters.splice(0).forEach((fn) => { try { fn(f); } catch (e) { console.error(e); } });
}
function stopFluid() {
  if (!fluid) return;
  fluid.stop();
  html.classList.remove('fx', 'fx-pending');
}
const syncFluid = () => { if (motionOn()) bootFluid(); else { html.classList.remove('fx-pending'); stopFluid(); } };
syncFluid();
onMotion(syncFluid);

/* tone follows whichever section holds the middle of the screen */
const toned = $$('[data-tone]');
if (toned.length && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting || !fluid) continue;
      const t = e.target.dataset.tone.split(',').map(Number);
      const b = e.target.dataset.bloom ? e.target.dataset.bloom.split(',').map(Number) : null;
      fluid.setTone(t, b);
    }
  }, { rootMargin: '-48% 0px -48% 0px' });
  toned.forEach((el) => io.observe(el));
}

/* ==========================================================================
   Stir to reveal: a section's headline condenses out of the smoke once the
   visitor has stirred over it, or after a short dwell (phones, keyboards).
   ========================================================================== */
const stirs = $$('[data-stir]');
if (stirs.length) {
  const state = new Map();
  stirs.forEach((el) => state.set(el, { energy: 0, timer: 0, fanned: false }));
  const clear = (el) => {
    if (el.classList.contains('is-clear')) return;
    el.classList.add('is-clear');
    const s = state.get(el);
    clearTimeout(s.timer);
  };
  if (!('IntersectionObserver' in window)) stirs.forEach(clear);
  else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const s = state.get(e.target);
        if (e.isIntersecting) {
          if (!html.classList.contains('fx') || !motionOn()) { clear(e.target); continue; }
          const el = e.target;
          clearTimeout(s.timer);
          s.timer = setTimeout(() => {
            clear(el);
            // a gentle hand fans the plate clear for anyone who hasn't stirred
            if (fluid && !s.fanned) {
              s.fanned = true;
              const r = el.getBoundingClientRect();
              fluid.fan(r.left + r.width * 0.5, r.top + r.height * 0.45, r.width * 0.7);
            }
          }, +el.dataset.stir || 1200);
        } else clearTimeout(s.timer);
      }
    }, { threshold: 0.55 });
    stirs.forEach((el) => io.observe(el));
    let px = -1, py = -1;
    const onMove = (x, y) => {
      if (px >= 0) {
        const d = Math.abs(x - px) + Math.abs(y - py);
        for (const el of stirs) {
          if (el.classList.contains('is-clear')) continue;
          const r = el.getBoundingClientRect();
          if (y < r.top || y > r.bottom) continue;
          const s = state.get(el);
          s.energy += d;
          if (s.energy > 700) clear(el);
        }
      }
      px = x; py = y;
    };
    addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY), { passive: true });
    addEventListener('touchmove', (e) => { const t = e.touches[0]; t && onMove(t.clientX, t.clientY); }, { passive: true });
  }
  onMotion((on) => { if (!on) stirs.forEach(clear); });
}

/* ==========================================================================
   Tadka: one tap or click anywhere and the mustard seeds pop
   ========================================================================== */
document.addEventListener('click', (e) => {
  if (!fluid || !html.classList.contains('fx') || e.detail === 0) return;
  fluid.tadka(e.clientX, e.clientY);
}, { capture: true, passive: true });

/* ==========================================================================
   Page transitions: smoke rushes in, the next page loads, the smoke clears.
   The arrival is pure CSS (.haze fades out), so a slow script can never
   leave a page covered.
   ========================================================================== */
const haze = $('.haze');
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || !haze || !motionOn()) return;
  if ((a.target && a.target !== '_self') || a.hasAttribute('download') || a.hasAttribute('data-reserve')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
  if (url.pathname === location.pathname) return;
  if (!/(\.html|\/)$/.test(url.pathname)) return;
  e.preventDefault();
  if (fluid) fluid.cover();
  haze.classList.add('is-in');
  setTimeout(() => { location.href = url.href; }, fluid ? 560 : 360);
});
addEventListener('pageshow', (e) => {
  if (e.persisted && haze) { haze.classList.remove('is-in'); if (fluid) fluid.enter(0.3); }
});

/* ==========================================================================
   Reservation panel (from the flagship, restyled): date, a real service
   time, party, name, notes. It composes a call, a text or an email.
   There is no online booking — every table is confirmed by phone.
   ========================================================================== */
const ICON_X = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1.5 1.5l11 11M12.5 1.5l-11 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
let panel = null, release = null, opener = null;

function slots() {
  const out = [];
  for (const s of SERVICES) for (let t = s.open; t <= s.close - 30; t += 15) out.push(t);
  return out;
}
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function buildPanel() {
  const today = chicagoToday().iso;
  const el = document.createElement('div');
  el.className = 'panel';
  el.id = 'reserve';
  el.hidden = true;
  const party = Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}"${i === 1 ? ' selected' : ''}>${i + 1} ${i ? 'guests' : 'guest'}</option>`).join('') + '<option value="9">9 or more</option>';
  el.innerHTML = `
    <div class="panel__scrim" data-close></div>
    <div class="panel__box" role="dialog" aria-modal="true" aria-labelledby="rv-h">
      <div class="panel__top">
        <p class="status" data-status><span class="status__dot" aria-hidden="true"></span><span data-status-text>11–2 · 5–11</span></p>
        <button type="button" class="panel__close" data-close aria-label="Close reservations">${ICON_X}</button>
      </div>
      <h2 class="panel__h" id="rv-h">A table, <em>warm.</em></h2>
      <p class="panel__lede">Choose a time. We confirm every table by phone.</p>
      <form class="panel__form" novalidate>
        <div class="f"><label for="rv-date">Date</label><input id="rv-date" type="date" min="${today}" value="${today}" required></div>
        <div class="f"><label for="rv-time">Time</label><select id="rv-time" required></select></div>
        <div class="f f--wide"><label for="rv-party">Party</label><select id="rv-party">${party}</select></div>
        <p class="panel__big" data-big hidden>Parties over eight, please call us first so we can set the room.</p>
        <div class="f f--wide"><label for="rv-name">Name</label><input id="rv-name" type="text" autocomplete="name" placeholder="Your name"></div>
        <div class="f f--wide"><label for="rv-notes">Notes <span>(optional)</span></label><textarea id="rv-notes" rows="2" placeholder="High chair, a birthday, an allergy"></textarea></div>
      </form>
      <p class="panel__summary" data-summary aria-live="polite"></p>
      <div class="panel__acts">
        <a class="btn btn--gold" data-act="call" href="tel:${PHONE}">Call ${PHONE_TXT}</a>
        <div class="panel__alt" data-alt>
          <a class="btn btn--line" data-act="sms" href="sms:${PHONE}">Text the details</a>
          <a class="btn btn--line" data-act="mail" href="mailto:${EMAIL}">Email the details</a>
        </div>
      </div>
      <p class="panel__fine">Text and email open your own app with everything filled in. Nothing is sent until you press send. Lunch 11 am – 2 pm, dinner 5 – 11 pm, every day.</p>
    </div>`;
  document.body.appendChild(el);

  const date = $('#rv-date', el), time = $('#rv-time', el), size = $('#rv-party', el), name = $('#rv-name', el), notes = $('#rv-notes', el);
  const big = $('[data-big]', el), alt = $('[data-alt]', el), sum = $('[data-summary]', el);
  const sms = $('[data-act="sms"]', el), mail = $('[data-act="mail"]', el);

  const fillTimes = () => {
    const keep = time.value;
    const isToday = date.value === chicagoToday().iso;
    const now = chicagoMinutes();
    const list = slots().filter((t) => !isToday || t > now + 15);
    time.innerHTML = '';
    if (!list.length) { time.innerHTML = '<option value="">No times left today</option>'; return; }
    let group = null;
    for (const t of list) {
      const svc = SERVICES.find((s) => t >= s.open && t < s.close);
      if (!group || group.label !== svc.name) { group = document.createElement('optgroup'); group.label = svc.name; time.appendChild(group); }
      const o = document.createElement('option');
      o.value = String(t); o.textContent = clock(t);
      group.appendChild(o);
    }
    time.value = keep && list.includes(+keep) ? keep : String(list.find((t) => t >= 19 * 60) || list[0]);
  };
  const compose = () => {
    const n = +size.value, over = n > 8;
    big.hidden = !over; alt.hidden = over;
    if (!date.value || !time.value) { sum.textContent = 'Choose a date with times left, or call us.'; return; }
    const who = over ? 'a party of 9 or more' : `${n} ${n === 1 ? 'guest' : 'guests'}`;
    const when = `${prettyDate(date.value)} at ${clock(+time.value)}`;
    sum.textContent = `Table for ${who}, ${when}.`;
    const body = [
      `Hello Karva, I'd like a table for ${who} on ${when}.`,
      name.value.trim() ? `Name: ${name.value.trim()}` : '',
      notes.value.trim() ? `Notes: ${notes.value.trim()}` : '',
      'Please call me to confirm.'
    ].filter(Boolean).join('\n');
    sms.href = `sms:${PHONE}?&body=${encodeURIComponent(body)}`;
    mail.href = `mailto:${EMAIL}?subject=${encodeURIComponent(`Table request: ${who}, ${when}`)}&body=${encodeURIComponent(body)}`;
  };
  if (!slots().some((t) => t > chicagoMinutes() + 15)) date.value = addDays(today, 1);
  fillTimes(); compose();
  date.addEventListener('change', () => { if (!date.value || date.value < date.min) date.value = date.min; fillTimes(); compose(); });
  [time, size, name, notes].forEach((x) => x.addEventListener('input', compose));
  size.addEventListener('change', compose);
  $('form', el).addEventListener('submit', (e) => e.preventDefault());
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closePanel(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } });
  el._refresh = () => { fillTimes(); compose(); };
  initStatus();
  return el;
}

export function openPanel(from) {
  if (!panel) panel = buildPanel();
  if (!panel.hidden) return;
  opener = from || document.activeElement;
  if (mnav && mnav.open) mnav.open = false;
  panel._refresh();
  layerOpen(panel);
  lockScroll();
  release = trap(panel);
  if (fluid && from && from.getBoundingClientRect) {
    const r = from.getBoundingClientRect();
    fluid.puff(r.left + r.width / 2, r.top + r.height / 2, [0.95, 0.7, 0.3], 0.8);
  }
  setTimeout(() => { const d = $('#rv-date', panel); d && d.focus({ preventScroll: true }); }, motionOn() ? 80 : 0);
}
export function closePanel() {
  if (!panel || panel.hidden || !panel.classList.contains('is-open')) return;
  release && release(); release = null;
  layerClose(panel, () => unlockScroll());
  if (opener && opener.focus) opener.focus({ preventScroll: true });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-reserve]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  openPanel(a);
});
if (location.hash === '#reserve') setTimeout(() => openPanel(), 300);

/* the year in the footer */
$$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
