// Cross-platform parity: the web logic must generate exactly the puzzles the
// iOS (Swift) and Android (Kotlin) apps do for the same (level, seed).
// tests/fixtures/puzzles.json is written by puzzles-app's tools/parity.sh from
// the Swift code and copied here — don't edit it by hand.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { mulberry32 } from '../site/js/rng.js';
import * as hashi from '../site/js/hashi.js';
import * as tracks from '../site/js/tracks.js';
import * as sudoku from '../site/js/sudoku.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures/puzzles.json', import.meta.url)));
let checked = 0;

for (const f of fx.rng) {
  const r = mulberry32(f.seed);
  assert.deepStrictEqual(f.values.map(() => r()), f.values, `rng seed ${f.seed}`);
  checked++;
}
for (const f of fx.hashi) {
  const p = hashi.generate(f.seed, f.level);
  const at = `hashi ${f.level} ${f.seed}`;
  assert.strictEqual(p.model.w, f.w, at);
  assert.strictEqual(p.model.h, f.h, at);
  assert.deepStrictEqual(p.model.islands.map((i) => [i.x, i.y, i.n]), f.islands, at);
  assert.deepStrictEqual(p.model.edges.map((e) => [e.a, e.b]), f.edges, at);
  assert.deepStrictEqual(Array.from(p.solution), f.solution, at);
  assert.strictEqual(p.unique, f.unique, at);
  checked++;
}
for (const f of fx.tracks) {
  const p = tracks.generate(f.seed, f.level);
  const at = `tracks ${f.level} ${f.seed}`;
  assert.deepStrictEqual([p.n, p.start, p.end], [f.n, f.start, f.end], at);
  assert.deepStrictEqual(p.rowC, f.rowC, at);
  assert.deepStrictEqual(p.colC, f.colC, at);
  assert.deepStrictEqual([...p.given].sort((a, b) => a[0] - b[0]), f.given, at);
  assert.deepStrictEqual(Array.from(p.solution), f.solution, at);
  assert.strictEqual(p.unique, f.unique, at);
  checked++;
}
for (const f of fx.sudoku) {
  const p = sudoku.generate(f.seed, f.level);
  const at = `sudoku ${f.level} ${f.seed}`;
  assert.deepStrictEqual(p.givens, f.givens, at);
  assert.deepStrictEqual(p.solution, f.solution, at);
  assert.strictEqual(p.unique, f.unique, at);
  checked++;
}
console.log(`parity OK: ${checked} fixtures match the iOS/Android logic`);
