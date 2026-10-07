import { svgEl, store, svgPoint } from './common.js';
import { generate, status, rowOf, colOf, boxOf } from './sudoku.js';

const C = 44;

export function mount(ctx) {
  const { board, level, seed, key } = ctx;
  const puz = generate(seed, level);
  const { givens, solution } = puz;
  const isGiven = (i) => givens[i] !== 0;

  let values = givens.slice();
  let history = [];
  let selected = null;
  let hint = null;
  let hintWrong = false; // the hinted cell holds a wrong digit (drawn red)
  let hintTimer = 0;
  let solved = false;

  const saved = store.get(key);
  if (saved && saved.values?.length === values.length) {
    values = saved.values;
    ctx.timer.set(saved.elapsed || 0);
  }

  const wrap = document.createElement('div');
  wrap.className = 'sudoku-wrap';
  const svg = svgEl('svg', { viewBox: `0 0 ${9 * C} ${9 * C}`, class: 'board sudoku', role: 'img', 'aria-label': 'Sudoku puzzle board' });
  const pad = document.createElement('div');
  pad.className = 'keypad';
  pad.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button type="button" data-d="${d}">${d}</button>`).join('') +
    '<button type="button" class="erase" aria-label="Erase"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="M17 9.5l-5 5M12 9.5l5 5"/></svg></button>';
  wrap.append(svg, pad);
  board.replaceChildren(wrap);

  function save() {
    if (solved) store.del(key);
    else store.set(key, { values, elapsed: ctx.timer.get() });
  }

  function render() {
    const st = status(givens, values);
    svg.replaceChildren();
    const sr = selected === null ? -1 : rowOf(selected), sc = selected === null ? -1 : colOf(selected), sb = selected === null ? -1 : boxOf(selected);
    for (let i = 0; i < 81; i++) {
      const x = colOf(i), y = rowOf(i);
      let cls = 'cell';
      if (selected === i) cls += ' sel';
      else if (hint === i) cls += ' hint';
      else if (isGiven(i)) cls += ' given';
      else if (y === sr || x === sc || boxOf(i) === sb) cls += ' peer';
      svgEl('rect', { x: x * C, y: y * C, width: C, height: C, class: cls }, svg);
    }
    for (let i = 0; i < 81; i++) {
      if (!values[i]) continue;
      const bad = (hint === i && hintWrong) || st.conflict[i];
      const t = svgEl('text', {
        x: colOf(i) * C + C / 2, y: rowOf(i) * C + C / 2 + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        class: 'digit' + (isGiven(i) ? ' given' : '') + (bad ? ' bad' : ''),
      }, svg);
      t.textContent = values[i];
    }
    // thin cell lines first, then the thick 3×3 box separators on top
    for (const thick of [false, true]) {
      for (let i = 0; i <= 9; i++) {
        if ((i % 3 === 0) !== thick) continue;
        const cls = 'gl' + (thick ? ' box' : '');
        svgEl('line', { x1: 0, y1: i * C, x2: 9 * C, y2: i * C, class: cls }, svg);
        svgEl('line', { x1: i * C, y1: 0, x2: i * C, y2: 9 * C, class: cls }, svg);
      }
    }
    if (st.solved && !solved) {
      solved = true;
      selected = null;
      save();
      ctx.onSolved();
    }
  }

  function selectCell(i) {
    if (solved) return;
    if (isGiven(i)) selected = null;
    else selected = selected === i ? null : i;
    render();
  }

  // Tapping the digit already in the selected cell clears it.
  function enterDigit(d) {
    if (solved) return;
    if (selected === null || isGiven(selected)) { ctx.toast('Tap a square first'); return; }
    history.push(values.slice());
    values[selected] = values[selected] === d ? 0 : d;
    hint = null;
    save();
    render();
  }

  function erase() {
    if (solved || selected === null || isGiven(selected) || !values[selected]) return;
    history.push(values.slice());
    values[selected] = 0;
    hint = null;
    save();
    render();
  }

  svg.addEventListener('pointerdown', (ev) => {
    const p = svgPoint(svg, ev);
    const x = Math.floor(p.x / C), y = Math.floor(p.y / C);
    if (x >= 0 && y >= 0 && x < 9 && y < 9) selectCell(y * 9 + x);
    ev.preventDefault();
  });
  pad.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.d) enterDigit(Number(b.dataset.d));
    else erase();
  });
  // Web only: a physical keyboard can type digits / erase too.
  const onKey = (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (/^[1-9]$/.test(ev.key)) { enterDigit(Number(ev.key)); ev.preventDefault(); }
    else if (ev.key === 'Backspace' || ev.key === 'Delete' || ev.key === '0') { erase(); ev.preventDefault(); }
  };
  document.addEventListener('keydown', onKey);

  render();
  if (!puz.unique) ctx.toast('Note: this puzzle may have more than one solution');

  return {
    undo() {
      if (solved || !history.length) return;
      values = history.pop();
      save();
      render();
    },
    reset() {
      if (solved) return;
      history.push(values.slice());
      values = givens.slice();
      selected = null;
      save();
      render();
    },
    // A wrong entry first (left for the player to fix), otherwise an empty
    // cell whose digit is named in the toast rather than filled in.
    hint() {
      if (solved) return;
      let k = values.findIndex((v, i) => !isGiven(i) && v && v !== solution[i]);
      hintWrong = k >= 0;
      if (k < 0) k = values.findIndex((v) => !v);
      if (k < 0) return;
      hint = k;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { hint = null; render(); }, 2500);
      ctx.toast(hintWrong ? 'This number is wrong' : `A ${solution[k]} belongs here`);
      render();
    },
    destroy() {
      clearTimeout(hintTimer);
      document.removeEventListener('keydown', onKey);
    },
    save,
  };
}
