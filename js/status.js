/* Open / closed — always computed in Little Elm's own time zone,
   never from the visitor's clock. Hours are the same every day. */
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
});
const dayFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long'
});

export const SERVICES = [
  { name: 'Lunch', open: 11 * 60, close: 14 * 60 },
  { name: 'Dinner', open: 17 * 60, close: 23 * 60 }
];

export function chicagoMinutes(date = new Date()) {
  const p = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10);
}

/** Today's date in Little Elm as YYYY-MM-DD, plus the weekday name. */
export function chicagoToday(date = new Date()) {
  const p = {};
  for (const part of dayFmt.formatToParts(date)) p[part.type] = part.value;
  return { iso: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday };
}

export const clock = (mins) => {
  const h = Math.floor(mins / 60) % 24, m = mins % 60, h12 = h % 12 || 12, ap = h < 12 ? 'am' : 'pm';
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
};

export function serviceState(t = chicagoMinutes()) {
  for (const s of SERVICES) if (t >= s.open && t < s.close) return { open: true, until: s.close, service: s.name, now: t };
  const next = SERVICES.find((s) => t < s.open);
  return { open: false, opens: next ? next.open : SERVICES[0].open, tomorrow: !next, service: (next || SERVICES[0]).name, now: t };
}

export function initStatus() {
  const nodes = document.querySelectorAll('[data-status]');
  const longs = document.querySelectorAll('[data-status-long]');
  const lives = document.querySelectorAll('[data-status-live]');
  const days = document.querySelectorAll('[data-today]');
  const update = () => {
    const st = serviceState();
    const label = st.open
      ? `Open now, ${st.service.toLowerCase()} until ${clock(st.until)}, Little Elm time`
      : `Closed now, opens ${st.tomorrow ? 'tomorrow at ' : 'at '}${clock(st.opens)}, Little Elm time`;
    for (const el of nodes) {
      el.classList.toggle('is-open', st.open);
      const t = el.querySelector('[data-status-text]');
      if (t) t.textContent = st.open ? 'Open now' : `Opens ${clock(st.opens)}`;
      el.setAttribute('aria-label', label);
      el.setAttribute('role', 'status');
    }
    for (const el of longs) {
      el.classList.toggle('is-open', st.open);
      const t = el.querySelector('[data-status-text]');
      if (t) t.textContent = st.open
        ? `Open now · ${st.service} until ${clock(st.until)}`
        : `Closed · Opens ${st.tomorrow ? 'tomorrow ' : ''}${clock(st.opens)}`;
    }
    for (const el of lives) {
      el.textContent = st.open
        ? `Open now. ${st.service} until ${clock(st.until)}.`
        : `It is ${clock(st.now)} in Little Elm. ${st.service} starts at ${clock(st.opens)}${st.tomorrow ? ' tomorrow' : ''}.`;
    }
    const wd = chicagoToday().weekday;
    for (const el of days) el.textContent = wd;
  };
  update();
  setInterval(update, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
}
