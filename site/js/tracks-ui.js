import { svgEl, store, svgPoint } from './common.js';
import { generate, initialState, status, DIR, N, E, S, W, opp, popcount } from './tracks.js';

const C = 44;

export function mount(ctx) {
  const { board, level, seed } = ctx;
  const { key } = ctx;
  const puz = generate(seed, level);
  const { n, start, end, rowC, colC, given, solution } = puz;
  const init = initialState(puz);
  const locked = init.locked;
  let links = init.links.slice();
  let marks = new Set();
  let history = [];
  let hint = null;
  let hintTimer = 0;
  let solved = false;

  const saved = store.get(key);
  if (saved && saved.links?.length === links.length) {
    links = Uint8Array.from(saved.links);
    marks = new Set(saved.marks);
    ctx.timer.set(saved.elapsed || 0);
  }

  // 1 cell margin on every side: column clues on top, row clues on the right,
  // entrance on the left, exit at the bottom.
  const svg = svgEl('svg', { viewBox: `${-C} ${-C} ${(n + 2) * C} ${(n + 2) * C}`, class: 'board tracks', role: 'img', 'aria-label': 'Train Tracks puzzle board' });
  board.replaceChildren(svg);

  const save = () => {
    if (solved) store.del(key);
    else store.set(key, { links: Array.from(links), marks: [...marks], elapsed: ctx.timer.get() });
  };

  // Each link is drawn as its own half-segment (edge -> centre) so locked and
  // player links can have different colours even inside one cell. A curve is
  // split exactly at its midpoint (de Casteljau), so halves join seamlessly.
  function trackHalves(x, y, m) {
    const ox = x * C, oy = y * C, mx = ox + C / 2, my = oy + C / 2;
    const edge = (b) => (b === N ? [mx, oy] : b === S ? [mx, oy + C] : b === W ? [ox, my] : [ox + C, my]);
    const bits = DIR.filter((d) => m & d.b).map((d) => d.b);
    if (bits.length === 1) { const [ex, ey] = edge(bits[0]); return [{ bit: bits[0], d: `M${ex} ${ey}L${mx} ${my}` }]; }
    const [a, b] = bits.map(edge);
    const px = (a[0] + 2 * mx + b[0]) / 4, py = (a[1] + 2 * my + b[1]) / 4;
    return [
      { bit: bits[0], d: `M${a[0]} ${a[1]}Q${(a[0] + mx) / 2} ${(a[1] + my) / 2} ${px} ${py}` },
      { bit: bits[1], d: `M${b[0]} ${b[1]}Q${(b[0] + mx) / 2} ${(b[1] + my) / 2} ${px} ${py}` },
    ];
  }

  function render() {
    const st = status(puz, links);
    svg.replaceChildren();
    for (let c = 0; c < n * n; c++) {
      const x = c % n, y = (c / n) | 0;
      svgEl('rect', { x: x * C, y: y * C, width: C, height: C, class: 'cell' + (given.has(c) ? ' given' : '') + (hint && hint.includes(c) ? ' hint' : '') }, svg);
      if (marks.has(c) && !links[c]) {
        const g = svgEl('path', { d: `M${x * C + 15} ${y * C + 15}L${x * C + C - 15} ${y * C + C - 15}M${x * C + C - 15} ${y * C + 15}L${x * C + 15} ${y * C + C - 15}`, class: 'mark' }, svg);
      }
    }
    for (let c = 0; c < n * n; c++) {
      if (!links[c]) continue;
      for (const { bit, d } of trackHalves(c % n, (c / n) | 0, links[c])) {
        const cls = (st.solved ? ' win' : '') + (locked[c] & bit ? ' sys' : ' usr');
        svgEl('path', { d, class: 'ties' + cls }, svg);
        svgEl('path', { d, class: 'rail' + cls }, svg);
        svgEl('path', { d, class: 'rail-in' }, svg);
      }
    }
    // entrance / exit markers
    const sy = ((start / n) | 0);
    const ex = end % n;
    const arrow = (x, y, rot) => {
      const g = svgEl('g', { transform: `translate(${x} ${y}) rotate(${rot})`, class: 'gate' }, svg);
      svgEl('path', { d: 'M-7 -8L7 0L-7 8Z' }, g);
    };
    svgEl('path', { d: `M${-C} ${sy * C + C / 2}L0 ${sy * C + C / 2}`, class: 'ties' }, svg);
    svgEl('path', { d: `M${-C} ${sy * C + C / 2}L0 ${sy * C + C / 2}`, class: 'rail' }, svg);
    svgEl('path', { d: `M${-C} ${sy * C + C / 2}L0 ${sy * C + C / 2}`, class: 'rail-in' }, svg);
    arrow(-C + 10, sy * C + C / 2, 0);
    svgEl('path', { d: `M${ex * C + C / 2} ${n * C}L${ex * C + C / 2} ${n * C + C}`, class: 'ties' }, svg);
    svgEl('path', { d: `M${ex * C + C / 2} ${n * C}L${ex * C + C / 2} ${n * C + C}`, class: 'rail' }, svg);
    svgEl('path', { d: `M${ex * C + C / 2} ${n * C}L${ex * C + C / 2} ${n * C + C}`, class: 'rail-in' }, svg);
    arrow(ex * C + C / 2, n * C + C - 10, 90);
    // grid lines
    for (let i = 0; i <= n; i++) {
      svgEl('line', { x1: 0, y1: i * C, x2: n * C, y2: i * C, class: 'gl' }, svg);
      svgEl('line', { x1: i * C, y1: 0, x2: i * C, y2: n * C, class: 'gl' }, svg);
    }
    // clues
    const clue = (x, y, v, ok, cur) => {
      const t = svgEl('text', { x, y, class: 'clue' + (ok ? ' ok' : cur > v ? ' bad' : ''), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, svg);
      t.textContent = v;
    };
    for (let i = 0; i < n; i++) {
      clue(i * C + C / 2, -C / 2, colC[i], st.colOk[i], st.cols[i]);
      clue(n * C + C / 2, i * C + C / 2, rowC[i], st.rowOk[i], st.rows[i]);
    }
    if (st.solved && !solved) { solved = true; save(); ctx.onSolved(); }
  }

  // --- interaction -------------------------------------------------------
  function toggle(a, b, mode) {
    const dx = (b % n) - (a % n), dy = ((b / n) | 0) - ((a / n) | 0);
    const d = DIR.find((d) => d.dx === dx && d.dy === dy);
    if (!d) return false;
    const has = links[a] & d.b;
    if (mode === 'erase') {
      if (!has || locked[a] & d.b) return false;
      links[a] &= ~d.b; links[b] &= ~opp(d.b);
      return true;
    }
    if (has) return false;
    if (popcount(links[a]) >= 2 || popcount(links[b]) >= 2) return false;
    links[a] |= d.b; links[b] |= opp(d.b);
    marks.delete(a); marks.delete(b);
    return true;
  }

  const cellAt = (p) => {
    const x = Math.floor(p.x / C), y = Math.floor(p.y / C);
    return x >= 0 && y >= 0 && x < n && y < n ? y * n + x : -1;
  };

  let drag = null;
  svg.addEventListener('pointerdown', (ev) => {
    if (solved) return;
    const c = cellAt(svgPoint(svg, ev));
    if (c < 0) return;
    drag = { last: c, first: c, mode: null, before: { links: links.slice(), marks: new Set(marks) }, changed: false, moved: false };
    svg.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const c = cellAt(svgPoint(svg, ev));
    if (c < 0 || c === drag.last) return;
    drag.moved = true;
    const dx = Math.abs((c % n) - (drag.last % n)), dy = Math.abs(((c / n) | 0) - ((drag.last / n) | 0));
    if (dx + dy === 1) {
      // The first pair that isn't a locked link decides draw vs erase.
      if (!drag.mode) {
        const d = DIR.find((d) => (drag.last % n) + d.dx === c % n && ((drag.last / n) | 0) + d.dy === ((c / n) | 0));
        if (!(locked[drag.last] & d.b)) drag.mode = links[drag.last] & d.b ? 'erase' : 'draw';
      }
      if (drag.mode && toggle(drag.last, c, drag.mode)) drag.changed = true;
      hint = null;
      render();
    }
    drag.last = c;
  });
  const finish = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) {
      // tap: toggle an "empty" mark on cells without track
      if (!links[d.first]) {
        marks.has(d.first) ? marks.delete(d.first) : marks.add(d.first);
        d.changed = true;
      }
    }
    if (d.changed) { history.push(d.before); save(); }
    render();
  };
  svg.addEventListener('pointerup', finish);
  svg.addEventListener('pointercancel', finish);

  render();
  if (!puz.unique) ctx.toast('Note: this puzzle may have more than one solution');

  return {
    undo() {
      if (solved || !history.length) return;
      const h = history.pop();
      links = h.links; marks = h.marks;
      save(); render();
    },
    reset() {
      if (solved) return;
      history.push({ links: links.slice(), marks: new Set(marks) });
      links = init.links.slice(); marks = new Set();
      save(); render();
    },
    hint() {
      if (solved) return;
      // A wrong link first, otherwise a missing one.
      let cells = null;
      for (let c = 0; c < n * n && !cells; c++) {
        const extra = links[c] & ~solution[c] & ~locked[c];
        if (extra) cells = [c];
      }
      for (let c = 0; c < n * n && !cells; c++) {
        if (solution[c] & ~links[c]) cells = [c];
      }
      if (!cells) return;
      hint = cells;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { hint = null; render(); }, 2500);
      ctx.toast(links[cells[0]] & ~solution[cells[0]] ? 'Something here is wrong' : 'Track belongs through this cell');
      render();
    },
    destroy() { clearTimeout(hintTimer); },
    save,
  };
}
