// Train Tracks — model, solver, generator, win check. No DOM.
// The track enters the grid from the left edge of the start row and leaves
// through the bottom edge of the end column. Row/column clues count how many
// cells in that line contain track; some cells are given.
import { mulberry32, randInt, shuffle } from './rng.js';

export const N = 1, E = 2, S = 4, W = 8;
export const DIR = [
  { b: N, dx: 0, dy: -1 },
  { b: E, dx: 1, dy: 0 },
  { b: S, dx: 0, dy: 1 },
  { b: W, dx: -1, dy: 0 },
];
export const opp = (b) => (b === N ? S : b === S ? N : b === E ? W : E);
export const popcount = (m) => ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1));

export const LEVELS = {
  easy: { n: 6, min: 0.4, max: 0.62, minimize: false },
  medium: { n: 8, min: 0.4, max: 0.62, minimize: true },
  hard: { n: 10, min: 0.4, max: 0.6, minimize: true },
};

function randomPath(rnd, n, start, end, minL, maxL, cap) {
  const vis = new Uint8Array(n * n);
  const path = [];
  let nodes = 0;
  function go(c) {
    if (++nodes > cap) return false;
    vis[c] = 1;
    path.push(c);
    if (c === end) {
      if (path.length >= minL) return true;
    } else if (path.length < maxL) {
      const x = c % n, y = (c / n) | 0;
      for (const d of shuffle(rnd, [0, 1, 2, 3])) {
        const nx = x + DIR[d].dx, ny = y + DIR[d].dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n || vis[ny * n + nx]) continue;
        if (go(ny * n + nx)) return true;
        if (nodes > cap) break;
      }
    }
    vis[c] = 0;
    path.pop();
    return false;
  }
  return go(start) ? path.slice() : null;
}

// Enumerate simple paths start→end consistent with clues and givens.
export function countSolutions(n, rowC, colC, start, end, given, limit = 2, cap = 100000) {
  const vis = new Uint8Array(n * n);
  const ru = new Int8Array(n), cu = new Int8Array(n);
  const masks = new Uint8Array(n * n);
  const total = rowC.reduce((a, b) => a + b, 0);
  const ex = end % n, ey = (end / n) | 0;
  let count = 0, nodes = 0, aborted = false, solution = null, used = 1;

  function visit(c, inb) {
    if (count >= limit || aborted) return;
    if (++nodes > cap) { aborted = true; return; }
    const x = c % n, y = (c / n) | 0;
    if (c === end) {
      const m = inb | S;
      if (given.has(c) && given.get(c) !== m) return;
      for (let i = 0; i < n; i++) if (ru[i] !== rowC[i] || cu[i] !== colC[i]) return;
      masks[c] = m;
      let ok = true;
      for (const [gc, gm] of given) if (masks[gc] !== gm) { ok = false; break; }
      if (ok) { count++; solution = masks.slice(); }
      masks[c] = 0;
      return;
    }
    for (const { b, dx, dy } of DIR) {
      if (b === inb) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const nc = ny * n + nx;
      if (vis[nc]) continue;
      const m = inb | b;
      if (given.has(c) && given.get(c) !== m) continue;
      if (ru[ny] + 1 > rowC[ny] || cu[nx] + 1 > colC[nx]) continue;
      const ng = given.get(nc);
      if (ng !== undefined && !(ng & opp(b))) continue;
      const rem = total - (used + 1);
      const dist = Math.abs(nx - ex) + Math.abs(ny - ey);
      if (rem < dist || ((rem - dist) & 1)) continue;
      vis[nc] = 1; ru[ny]++; cu[nx]++; used++; masks[c] = m;
      visit(nc, opp(b));
      vis[nc] = 0; ru[ny]--; cu[nx]--; used--; masks[c] = 0;
    }
  }

  vis[start] = 1; ru[(start / n) | 0]++; cu[start % n]++;
  visit(start, W);
  return { count, solution, aborted };
}

export function generate(seed, level) {
  const cfg = LEVELS[level];
  const n = cfg.n;
  const rnd = mulberry32(seed);
  const isUnique = (rowC, colC, start, end, given) => {
    const r = countSolutions(n, rowC, colC, start, end, given);
    return r.count === 1 && !r.aborted;
  };
  let last = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const start = randInt(rnd, n) * n;
    const end = (n - 1) * n + randInt(rnd, n);
    if (start === end) continue;
    const path = randomPath(rnd, n, start, end, Math.round(n * n * cfg.min), Math.round(n * n * cfg.max), 20000);
    if (!path) continue;
    const masks = new Uint8Array(n * n);
    path.forEach((c, i) => {
      if (i > 0) {
        const p = path[i - 1];
        const d = DIR.find((d) => (p % n) + d.dx === c % n && ((p / n) | 0) + d.dy === ((c / n) | 0));
        masks[p] |= d.b;
        masks[c] |= opp(d.b);
      }
    });
    masks[start] |= W;
    masks[end] |= S;
    const rowC = new Array(n).fill(0), colC = new Array(n).fill(0);
    path.forEach((c) => { rowC[(c / n) | 0]++; colC[c % n]++; });

    const given = new Map();
    let ok = isUnique(rowC, colC, start, end, given);
    for (const c of shuffle(rnd, path)) {
      if (ok) break;
      given.set(c, masks[c]);
      ok = isUnique(rowC, colC, start, end, given);
    }
    last = { n, start, end, rowC, colC, given, solution: masks, unique: ok };
    if (!ok) continue;
    if (cfg.minimize) {
      for (const c of shuffle(rnd, [...given.keys()])) {
        const m = given.get(c);
        given.delete(c);
        if (!isUnique(rowC, colC, start, end, given)) given.set(c, m);
      }
    }
    return last;
  }
  return last;
}

// Initial player links (+ which link bits are locked) for a puzzle.
export function initialState(p) {
  const { n, start, end, given } = p;
  const links = new Uint8Array(n * n);
  links[start] |= W;
  links[end] |= S;
  for (const [c, m] of given) {
    links[c] |= m;
    for (const { b, dx, dy } of DIR) {
      const x = (c % n) + dx, y = ((c / n) | 0) + dy;
      if (m & b && x >= 0 && y >= 0 && x < n && y < n) links[y * n + x] |= opp(b);
    }
  }
  return { links, locked: links.slice() };
}

// Follow the track from the entrance; returns per-line counts + solved flag.
export function status(p, links) {
  const { n, start, end, rowC, colC } = p;
  const rows = new Array(n).fill(0), cols = new Array(n).fill(0);
  let cells = 0;
  for (let c = 0; c < n * n; c++) {
    if (links[c]) { rows[(c / n) | 0]++; cols[c % n]++; cells++; }
  }
  let cur = start, inb = W, seen = 0, reached = false;
  const vis = new Set();
  while (!vis.has(cur)) {
    vis.add(cur);
    const m = links[cur];
    if (popcount(m) !== 2 || !(m & inb)) break;
    seen++;
    const out = m & ~inb;
    if (cur === end && out === S) { reached = true; break; }
    const d = DIR.find((d) => d.b === out);
    const x = (cur % n) + d.dx, y = ((cur / n) | 0) + d.dy;
    if (x < 0 || y < 0 || x >= n || y >= n) break;
    cur = y * n + x;
    inb = opp(out);
  }
  const rowOk = rows.map((v, i) => v === rowC[i]);
  const colOk = cols.map((v, i) => v === colC[i]);
  const solved = reached && seen === cells && rowOk.every(Boolean) && colOk.every(Boolean);
  return { rows, cols, rowOk, colOk, solved };
}
