export const SVGNS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

export const store = {
  get(k, d) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; }
  },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function getStats() { return store.get('puzzles:stats', {}); }

export function recordSolve(game, level, seconds) {
  const all = getStats();
  const s = (all[game] ??= {});
  const l = (s[level] ??= { solved: 0, best: null });
  l.solved++;
  if (l.best === null || seconds < l.best) l.best = seconds;
  store.set('puzzles:stats', all);
  return l;
}

// Convert a pointer event to SVG user units.
export function svgPoint(svg, ev) {
  const r = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  return { x: vb.x + ((ev.clientX - r.left) / r.width) * vb.width, y: vb.y + ((ev.clientY - r.top) / r.height) * vb.height };
}
