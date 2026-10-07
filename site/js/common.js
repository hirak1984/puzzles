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

// Key names match the iOS/Android apps (UserDefaults / SharedPreferences):
//   puzzles.<game>.<level>.<seed>   per-puzzle progress
//   puzzles.current.<game>.<level>  the puzzle open at each level
//   puzzles.stats                   solved counts + best times
//   puzzles.level.<game>            last-used difficulty
//   puzzles.theme                   light / dark / system (raw string)
export const progressKey = (game, level, seed) => `puzzles.${game}.${level}.${seed}`;
const currentKey = (game, level) => `puzzles.current.${game}.${level}`;
export const lastLevel = {
  get: (game) => store.get(`puzzles.level.${game}`, 'easy'),
  set: (game, level) => store.set(`puzzles.level.${game}`, level),
};
export const setCurrentSeed = (game, level, seed) => store.set(currentKey(game, level), seed);
export const randomSeed = () => 1 + Math.floor(Math.random() * 1e6);

// The level's open puzzle if it's still in progress, else a fresh seed — so
// leaving a puzzle (or switching level) and coming back resumes it.
export function resumableSeed(game, level) {
  const seed = store.get(currentKey(game, level));
  if (Number.isInteger(seed) && store.get(progressKey(game, level, seed))) return seed;
  return randomSeed();
}

// One-time move from the web app's original `puzzles:*` / `puzzles-theme`
// keys to the apps' names. Medium/hard Train Tracks progress is dropped: those
// seeds used to generate different puzzles on the web than in the apps.
(function migrateKeys() {
  try {
    const old = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('puzzles:') || k === 'puzzles-theme') old.push(k);
    }
    for (const k of old) {
      const v = localStorage.getItem(k);
      const p = k.split(':');
      let nk = null;
      if (k === 'puzzles-theme') nk = 'puzzles.theme';
      else if (k === 'puzzles:stats') nk = 'puzzles.stats';
      else if (p[1] === 'level' && p.length === 3) nk = `puzzles.level.${p[2]}`;
      else if (p.length === 4 && !(p[1] === 'tracks' && p[2] !== 'easy')) nk = progressKey(p[1], p[2], p[3]);
      if (nk && localStorage.getItem(nk) === null) localStorage.setItem(nk, v);
      localStorage.removeItem(k);
    }
  } catch {}
})();

export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function getStats() { return store.get('puzzles.stats', {}); }

export function recordSolve(game, level, seconds) {
  const all = getStats();
  const s = (all[game] ??= {});
  const l = (s[level] ??= { solved: 0, best: null });
  l.solved++;
  if (l.best === null || seconds < l.best) l.best = seconds;
  store.set('puzzles.stats', all);
  return l;
}

// Convert a pointer event to SVG user units.
export function svgPoint(svg, ev) {
  const r = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  return { x: vb.x + ((ev.clientX - r.left) / r.width) * vb.width, y: vb.y + ((ev.clientY - r.top) / r.height) * vb.height };
}
