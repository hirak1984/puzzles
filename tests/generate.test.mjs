import * as hashi from '../site/js/hashi.js';
import * as tracks from '../site/js/tracks.js';
import assert from 'node:assert';

for (const level of Object.keys(hashi.LEVELS)) {
  let uniq = 0, worst = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const t = Date.now();
    const p = hashi.generate(seed, level);
    worst = Math.max(worst, Date.now() - t);
    if (p.unique) uniq++;
    assert(hashi.status(p.model, p.solution).solved, `hashi ${level} ${seed} solution invalid`);
    const again = hashi.generate(seed, level);
    assert.deepStrictEqual(again.solution, p.solution, 'not deterministic');
  }
  console.log(`hashi ${level}: ${uniq}/10 unique, worst ${worst}ms`);
}
for (const level of Object.keys(tracks.LEVELS)) {
  let uniq = 0, worst = 0, givens = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const t = Date.now();
    const p = tracks.generate(seed, level);
    worst = Math.max(worst, Date.now() - t);
    if (p.unique) uniq++;
    givens += p.given.size;
    const s = tracks.status(p, p.solution);
    assert(s.solved, `tracks ${level} ${seed} solution invalid`);
    const st = tracks.initialState(p);
    assert(!tracks.status(p, st.links).solved);
  }
  console.log(`tracks ${level}: ${uniq}/10 unique, avg givens ${givens / 10}, worst ${worst}ms`);
}
