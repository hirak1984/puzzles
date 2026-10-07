// Sudoku — model, solver, generator, win check. No DOM.
// Ported from the iOS app's `Sudoku.swift` (same algorithm, same RNG draws),
// so a (level, seed) pair gives the same puzzle on iOS, Android and the web.
import { mulberry32, shuffle } from './rng.js';

// Target number of given clues left after digging holes (out of 81).
export const LEVELS = {
  easy: { givens: 38 },
  medium: { givens: 30 },
  hard: { givens: 24 },
};

export const rowOf = (i) => (i / 9) | 0;
export const colOf = (i) => i % 9;
export const boxOf = (i) => (((i / 9) | 0) / 3 | 0) * 3 + ((i % 9) / 3 | 0);

const popcount = (m) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
const ctz = (bit) => 31 - Math.clz32(bit);

// Bitmask backtracking with most-constrained-cell-first ordering. Counts
// solutions up to `limit` (limit 2 = "is it unique?").
export function countSolutions(givens, limit = 2, nodeCap = 200000) {
  const cells = givens.slice();
  const rowMask = new Array(9).fill(0), colMask = new Array(9).fill(0), boxMask = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    if (!cells[i]) continue;
    const bit = 1 << (cells[i] - 1);
    rowMask[rowOf(i)] |= bit; colMask[colOf(i)] |= bit; boxMask[boxOf(i)] |= bit;
  }
  let count = 0, nodes = 0, aborted = false, solution = null;
  const candidates = (i) => 0x1ff & ~(rowMask[rowOf(i)] | colMask[colOf(i)] | boxMask[boxOf(i)]);

  // Returns true to stop the search (limit reached or aborted).
  function backtrack() {
    if (++nodes > nodeCap) { aborted = true; return true; }
    let best = -1, bestPop = 10, bestMask = 0;
    for (let i = 0; i < 81; i++) {
      if (cells[i]) continue;
      const m = candidates(i), pc = popcount(m);
      if (pc < bestPop) {
        bestPop = pc; best = i; bestMask = m;
        if (pc === 0) break;
      }
    }
    if (best < 0) {
      count++;
      if (!solution) solution = cells.slice();
      return count >= limit;
    }
    if (bestPop === 0) return false;
    const r = rowOf(best), c = colOf(best), b = boxOf(best);
    let m = bestMask;
    while (m) {
      const bit = m & -m;
      m &= ~bit;
      cells[best] = ctz(bit) + 1;
      rowMask[r] |= bit; colMask[c] |= bit; boxMask[b] |= bit;
      const stop = backtrack();
      cells[best] = 0;
      rowMask[r] &= ~bit; colMask[c] &= ~bit; boxMask[b] &= ~bit;
      if (stop) return true;
    }
    return false;
  }

  backtrack();
  return { count, solution, aborted };
}

// A random fully-solved grid: sequential cell fill with shuffled digit order
// per cell, backtracking on dead ends.
function randomFullGrid(rnd) {
  const cells = new Array(81).fill(0);
  const rowMask = new Array(9).fill(0), colMask = new Array(9).fill(0), boxMask = new Array(9).fill(0);
  function fill(i) {
    if (i === 81) return true;
    const r = rowOf(i), c = colOf(i), b = boxOf(i);
    let m = 0x1ff & ~(rowMask[r] | colMask[c] | boxMask[b]);
    const digits = [];
    while (m) {
      const bit = m & -m;
      m &= ~bit;
      digits.push(ctz(bit) + 1);
    }
    for (const d of shuffle(rnd, digits)) {
      const bit = 1 << (d - 1);
      cells[i] = d;
      rowMask[r] |= bit; colMask[c] |= bit; boxMask[b] |= bit;
      if (fill(i + 1)) return true;
      cells[i] = 0;
      rowMask[r] &= ~bit; colMask[c] &= ~bit; boxMask[b] &= ~bit;
    }
    return false;
  }
  return fill(0) ? cells : null;
}

export function generate(seed, level) {
  const cfg = LEVELS[level];
  const rnd = mulberry32(seed);
  const full = randomFullGrid(rnd);
  if (!full) {
    // Should never happen (a full grid always exists); fail soft.
    const empty = new Array(81).fill(0);
    return { givens: empty, solution: empty, unique: false };
  }
  const givens = full.slice();
  const targetRemoved = 81 - cfg.givens;
  let removed = 0;
  for (const i of shuffle(rnd, Array.from({ length: 81 }, (_, k) => k))) {
    if (removed >= targetRemoved) break;
    const backup = givens[i];
    givens[i] = 0;
    const r = countSolutions(givens, 2);
    if (r.count === 1 && !r.aborted) removed++;
    else givens[i] = backup;
  }
  const fin = countSolutions(givens, 2);
  return { givens, solution: full, unique: fin.count === 1 && !fin.aborted };
}

// conflict[i] = cell shares a row, column or box with another cell holding
// the same digit.
export function status(givens, values) {
  const conflict = new Array(81).fill(false);
  const markDupes = (idxs) => {
    const seen = new Map();
    for (const i of idxs) {
      if (!values[i]) continue;
      if (!seen.has(values[i])) seen.set(values[i], []);
      seen.get(values[i]).push(i);
    }
    for (const list of seen.values()) if (list.length > 1) list.forEach((i) => (conflict[i] = true));
  };
  for (let r = 0; r < 9; r++) markDupes(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) markDupes(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      const idxs = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) idxs.push((br + r) * 9 + bc + c);
      markDupes(idxs);
    }
  }
  const filledCount = values.reduce((a, v) => a + (v ? 1 : 0), 0);
  return { conflict, filledCount, solved: filledCount === 81 && !conflict.includes(true) };
}
