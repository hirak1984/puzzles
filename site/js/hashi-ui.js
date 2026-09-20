import { svgEl, store, svgPoint } from './common.js';
import { generate, status, blocked, validEdge } from './hashi.js';

const C = 40; // cell size in SVG units

export function mount(ctx) {
  const { board, level, seed } = ctx;
  const key = `puzzles:hashi:${level}:${seed}`;
  const puz = generate(seed, level);
  const { model, solution } = puz;
  const { w, h, islands, edges } = model;

  let vals = new Array(edges.length).fill(0);
  let history = [];
  let selected = null;
  let hint = null;
  let hintTimer = 0;
  let solved = false;

  const saved = store.get(key);
  if (saved && saved.vals?.length === vals.length) {
    vals = saved.vals;
    ctx.timer.set(saved.elapsed || 0);
  }

  const svg = svgEl('svg', { viewBox: `0 0 ${w * C} ${h * C}`, class: 'board hashi', role: 'img', 'aria-label': 'Hashi puzzle board' });
  board.replaceChildren(svg);
  const cx = (i) => islands[i].x * C + C / 2;
  const cy = (i) => islands[i].y * C + C / 2;

  function save() {
    if (solved) store.del(key);
    else store.set(key, { vals, elapsed: ctx.timer.get() });
  }

  function render() {
    const st = status(model, vals);
    svg.replaceChildren();
    // faint grid dots
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) svgEl('circle', { cx: x * C + C / 2, cy: y * C + C / 2, r: 1.5, class: 'dot' }, svg);
    // Paths the selected island can still use (nothing crossing, neither end full).
    if (selected !== null) {
      for (const k of model.adj[selected]) {
        if (!validEdge(model, vals, st.sums, k)) continue;
        const e = edges[k];
        svgEl('line', { x1: cx(e.a), y1: cy(e.a), x2: cx(e.b), y2: cy(e.b), class: 'path-hl' }, svg);
        const o = e.a === selected ? e.b : e.a;
        svgEl('circle', { cx: cx(o), cy: cy(o), r: 19, class: 'target' }, svg);
      }
    }
    edges.forEach((e, k) => {
      const x1 = cx(e.a), y1 = cy(e.a), x2 = cx(e.b), y2 = cy(e.b);
      if (hint === k) svgEl('line', { x1, y1, x2, y2, class: 'hint-line' }, svg);
      const n = vals[k];
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : (i === 0 ? -3.5 : 3.5);
        const dx = e.h ? 0 : off, dy = e.h ? off : 0;
        svgEl('line', { x1: x1 + dx, y1: y1 + dy, x2: x2 + dx, y2: y2 + dy, class: 'bridge' + (st.solved ? ' win' : '') }, svg);
      }
    });
    islands.forEach((is, i) => {
      const g = svgEl('g', { class: 'island' + (st.over[i] ? ' over' : st.done[i] ? ' done' : '') + (selected === i ? ' sel' : '') }, svg);
      svgEl('circle', { cx: cx(i), cy: cy(i), r: 15 }, g);
      const t = svgEl('text', { x: cx(i), y: cy(i) + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
      t.textContent = is.n;
    });
    if (st.solved && !solved) {
      solved = true;
      save();
      ctx.onSolved();
    }
  }

  function cycle(k) {
    if (solved) return;
    if (blocked(model, vals, k) && vals[k] === 0) { ctx.toast('A bridge would cross there'); return; }
    history.push(vals.slice());
    vals[k] = (vals[k] + 1) % 3;
    hint = null;
    save();
  }

  function edgeBetween(a, b) {
    return edges.findIndex((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  }

  // Nearest island in direction (dx,dy) that shares a candidate edge with i.
  function neighbor(i, dx, dy) {
    for (const k of model.adj[i]) {
      const o = edges[k].a === i ? edges[k].b : edges[k].a;
      const sx = Math.sign(islands[o].x - islands[i].x), sy = Math.sign(islands[o].y - islands[i].y);
      if (sx === dx && sy === dy) return k;
    }
    return -1;
  }

  const islandAt = (p) => islands.findIndex((_, i) => Math.hypot(cx(i) - p.x, cy(i) - p.y) < C * 0.5);
  function edgeAt(p) {
    let best = -1, bd = C * 0.28;
    edges.forEach((e, k) => {
      if (!vals[k]) return;
      const x1 = cx(e.a), y1 = cy(e.a), x2 = cx(e.b), y2 = cy(e.b);
      const t = Math.max(0, Math.min(1, ((p.x - x1) * (x2 - x1) + (p.y - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2)));
      const d = Math.hypot(p.x - (x1 + t * (x2 - x1)), p.y - (y1 + t * (y2 - y1)));
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }

  let down = null;
  svg.addEventListener('pointerdown', (ev) => {
    const p = svgPoint(svg, ev);
    down = { p, island: islandAt(p), edge: -1 };
    if (down.island < 0) down.edge = edgeAt(p);
    svg.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  svg.addEventListener('pointerup', (ev) => {
    if (!down) return;
    const p = svgPoint(svg, ev);
    const dx = p.x - down.p.x, dy = p.y - down.p.y;
    const moved = Math.hypot(dx, dy) > C * 0.3;
    const d = down;
    down = null;
    if (d.island >= 0 && moved) {
      const dir = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
      const k = neighbor(d.island, dir[0], dir[1]);
      if (k >= 0) { cycle(k); selected = null; }
    } else if (d.island >= 0) {
      const i = d.island;
      if (selected === null || selected === i) selected = selected === i ? null : i;
      else {
        const k = edgeBetween(selected, i);
        const sums = status(model, vals).sums;
        if (k >= 0 && validEdge(model, vals, sums, k)) { cycle(k); selected = null; } else selected = i;
      }
    } else if (d.edge >= 0 && !moved) {
      cycle(d.edge);
    } else selected = null;
    render();
  });
  svg.addEventListener('pointercancel', () => { down = null; });

  render();
  if (!puz.unique) ctx.toast('Note: this puzzle may have more than one solution');

  return {
    undo() {
      if (solved || !history.length) return;
      vals = history.pop();
      save();
      render();
    },
    reset() {
      if (solved) return;
      history.push(vals.slice());
      vals = vals.map(() => 0);
      selected = null;
      save();
      render();
    },
    hint() {
      if (solved) return;
      // First point out a wrong bridge, otherwise a missing one.
      let k = vals.findIndex((v, i) => v > solution[i]);
      if (k < 0) k = vals.findIndex((v, i) => v < solution[i]);
      if (k < 0) return;
      hint = k;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { hint = null; render(); }, 2500);
      ctx.toast(vals[k] > solution[k] ? 'This bridge is wrong' : 'A bridge belongs here');
      render();
    },
    destroy() { clearTimeout(hintTimer); },
    save,
  };
}
