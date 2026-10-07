// Hashiwokakero (Bridges) — model, solver, generator, win check. No DOM.
import { mulberry32, randInt, shuffle } from './rng.js';

export const LEVELS = {
  easy: { w: 7, h: 7, islands: 10, extra: 0.15, dbl: 0.3 },
  medium: { w: 9, h: 9, islands: 18, extra: 0.25, dbl: 0.35 },
  hard: { w: 12, h: 16, islands: 48, extra: 0.3, dbl: 0.4 },
};

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// islands: [{x,y,n}]. A candidate edge joins two islands that see each
// other in a straight line with nothing between them.
export function buildModel(w, h, islands) {
  const grid = new Int16Array(w * h).fill(-1);
  islands.forEach((is, i) => (grid[is.y * w + is.x] = i));
  const edges = [];
  islands.forEach((is, i) => {
    for (const [dx, dy, horiz] of [[1, 0, true], [0, 1, false]]) {
      const cells = [];
      let x = is.x + dx, y = is.y + dy;
      while (x < w && y < h) {
        const j = grid[y * w + x];
        if (j >= 0) {
          edges.push({ a: i, b: j, h: horiz, cells });
          break;
        }
        cells.push(y * w + x);
        x += dx;
        y += dy;
      }
    }
  });
  const adj = islands.map(() => []);
  edges.forEach((e, k) => {
    adj[e.a].push(k);
    adj[e.b].push(k);
  });
  const byCell = new Map();
  edges.forEach((e, k) => e.cells.forEach((c) => {
    if (!byCell.has(c)) byCell.set(c, []);
    byCell.get(c).push(k);
  }));
  const crosses = edges.map(() => []);
  for (const list of byCell.values()) {
    for (const p of list) for (const q of list) if (p !== q && !crosses[p].includes(q)) crosses[p].push(q);
  }
  return { w, h, islands, edges, adj, crosses };
}

function connected(model, vals) {
  const n = model.islands.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  model.edges.forEach((e, k) => {
    if (vals[k] > 0) parent[find(e.a)] = find(e.b);
  });
  const root = find(0);
  for (let i = 1; i < n; i++) if (find(i) !== root) return false;
  return true;
}

// Domain-propagating DFS. Counts connected solutions up to `limit`.
export function solve(model, limit = 2, nodeCap = 30000) {
  const { islands, edges, adj, crosses } = model;
  const N = islands.length, E = edges.length;
  let count = 0, nodes = 0, aborted = false, solution = null;

  function propagate(lo, hi) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < N; i++) {
        let sl = 0, sh = 0;
        for (const e of adj[i]) { sl += lo[e]; sh += hi[e]; }
        const n = islands[i].n;
        if (sl > n || sh < n) return false;
        for (const e of adj[i]) {
          const nl = Math.max(lo[e], n - (sh - hi[e]));
          const nh = Math.min(hi[e], n - (sl - lo[e]));
          if (nl > nh) return false;
          if (nl !== lo[e] || nh !== hi[e]) { lo[e] = nl; hi[e] = nh; changed = true; }
        }
      }
      for (let e = 0; e < E; e++) {
        if (lo[e] > 0) {
          for (const c of crosses[e]) {
            if (lo[c] > 0) return false;
            if (hi[c] > 0) { hi[c] = 0; changed = true; }
          }
        }
      }
    }
    return true;
  }

  function dfs(lo, hi) {
    if (count >= limit || aborted) return;
    if (++nodes > nodeCap) { aborted = true; return; }
    if (!propagate(lo, hi)) return;
    let pick = -1;
    for (let e = 0; e < E; e++) if (lo[e] < hi[e]) { pick = e; break; }
    if (pick < 0) {
      if (connected(model, lo)) { count++; solution = Array.from(lo); }
      return;
    }
    for (let v = lo[pick]; v <= hi[pick]; v++) {
      const l2 = lo.slice(), h2 = hi.slice();
      l2[pick] = h2[pick] = v;
      dfs(l2, h2);
      if (count >= limit || aborted) return;
    }
  }

  dfs(new Int8Array(E), new Int8Array(E).fill(2));
  return { count, solution, aborted };
}

// Grow a random connected island graph, then add a few loop-closing bridges.
function build(rnd, cfg) {
  const { w, h } = cfg;
  const occ = new Int16Array(w * h).fill(-1);
  const bridge = new Uint8Array(w * h);
  const islands = [{ x: randInt(rnd, w), y: randInt(rnd, h), n: 0 }];
  occ[islands[0].y * w + islands[0].x] = 0;
  const links = [];
  const islandNear = (x, y) => DIRS.some(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < w && ny < h && occ[ny * w + nx] >= 0;
  });

  for (let t = 0; islands.length < cfg.islands && t < cfg.islands * 80; t++) {
    const a = randInt(rnd, islands.length);
    const [dx, dy] = DIRS[randInt(rnd, 4)];
    const src = islands[a];
    const lens = [];
    for (let k = 1, x = src.x, y = src.y; k <= 6; k++) {
      x += dx; y += dy;
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      const c = y * w + x;
      if (occ[c] >= 0 || bridge[c]) break;
      if (k >= 2 && !islandNear(x, y)) lens.push(k);
    }
    if (!lens.length) continue;
    const k = lens[randInt(rnd, lens.length)];
    for (let s = 1; s < k; s++) bridge[(src.y + dy * s) * w + src.x + dx * s] = 1;
    const ni = { x: src.x + dx * k, y: src.y + dy * k, n: 0 };
    occ[ni.y * w + ni.x] = islands.length;
    links.push({ a, b: islands.length, n: rnd() < cfg.dbl ? 2 : 1 });
    islands.push(ni);
  }
  if (islands.length < cfg.islands * 0.8) return null;

  const model = buildModel(w, h, islands);
  const solution = new Array(model.edges.length).fill(0);
  const edgeOf = (a, b) => model.edges.findIndex((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  for (const l of links) solution[edgeOf(l.a, l.b)] = l.n;
  for (const k of shuffle(rnd, model.edges.map((_, i) => i))) {
    const e = model.edges[k];
    if (solution[k] || rnd() > cfg.extra) continue;
    if (e.cells.some((c) => bridge[c])) continue;
    e.cells.forEach((c) => (bridge[c] = 1));
    solution[k] = rnd() < cfg.dbl ? 2 : 1;
  }
  model.edges.forEach((e, k) => {
    islands[e.a].n += solution[k];
    islands[e.b].n += solution[k];
  });
  return { model, solution };
}

export function generate(seed, level) {
  const cfg = LEVELS[level];
  const rnd = mulberry32(seed);
  let last = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const p = build(rnd, cfg);
    if (!p) continue;
    last = p;
    const r = solve(p.model, 2);
    if (r.count === 1 && !r.aborted) return { ...p, unique: true };
  }
  return { ...last, unique: false };
}

// Union-find root of every island over the edges that carry a bridge.
function componentRoots(model, vals) {
  const parent = model.islands.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) x = parent[x]; return x; };
  model.edges.forEach((e, k) => {
    if (vals[k] <= 0) return;
    const ra = find(e.a), rb = find(e.b);
    if (ra !== rb) parent[ra] = rb;
  });
  return parent.map((_, i) => find(i));
}

// Per-island bridge totals + overall solved flag for a player's `vals`.
// `isolated` marks islands outside the largest bridge network, but only once
// every island's own count is satisfied (the board looks finished but is
// split into two or more networks).
export function status(model, vals) {
  const sums = model.islands.map(() => 0);
  model.edges.forEach((e, k) => { sums[e.a] += vals[k]; sums[e.b] += vals[k]; });
  const over = sums.map((s, i) => s > model.islands[i].n);
  const done = sums.map((s, i) => s === model.islands[i].n);
  const allDone = done.every(Boolean);
  const roots = componentRoots(model, vals);
  const fullyConnected = roots.every((r) => r === roots[0]);
  const solved = allDone && fullyConnected;
  let isolated = roots.map(() => false);
  if (allDone && !fullyConnected) {
    // Largest network wins; ties go to the one seen first (same as the apps).
    const sizes = new Map();
    for (const r of roots) sizes.set(r, (sizes.get(r) || 0) + 1);
    let mainRoot = null, most = -1;
    for (const [r, n] of sizes) if (n > most) { most = n; mainRoot = r; }
    isolated = roots.map((r) => r !== mainRoot);
  }
  return { sums, over, done, solved, isolated };
}

// True if placing a bridge on edge k would cross an existing one.
export function blocked(model, vals, k) {
  return model.crosses[k].some((c) => vals[c] > 0);
}

// Can the player usefully put (or keep) a bridge on edge k right now? True if
// it already carries a bridge (so it can be doubled/removed), or if nothing
// crosses it and neither end island is already full.
export function validEdge(model, vals, sums, k) {
  if (vals[k] > 0) return true;
  if (blocked(model, vals, k)) return false;
  const e = model.edges[k];
  return sums[e.a] < model.islands[e.a].n && sums[e.b] < model.islands[e.b].n;
}
