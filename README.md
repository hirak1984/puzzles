# Puzzles — Hashi, Train Tracks & Sudoku

Static, no-build web app for `puzzles.hirakonline.com`. Vanilla JS ES modules,
no dependencies, no backend. Progress/stats live in `localStorage`.

## Layout

- `site/` — the only thing that gets deployed (`wrangler.jsonc` points at it).
  - `js/hashi.js`, `js/tracks.js`, `js/sudoku.js` — pure logic: model, solver, seeded generator, win check.
  - `js/hashi-ui.js`, `js/tracks-ui.js`, `js/sudoku-ui.js` — SVG boards + pointer input.
  - `js/app.js` — hash router (`#/`, `#/<game>/<level>/<seed>`), shell, timer, stats.
- `tests/parity.test.mjs` — requires the JS to generate exactly the puzzles the iOS/Android apps do
  (`tests/fixtures/puzzles.json`, written from the Swift code by the app repo's `tools/parity.sh`).
- `tests/generate.test.mjs` — generates puzzles for every level, checks the
  stored solution passes the win check, generation is deterministic, and reports how many are provably unique.
- `npm test` runs both.

## Kept in sync with the apps

The iOS and Android apps ([puzzles-app](../puzzles-app), checked out next to this repo) and this
site must stay feature-identical: every feature, fix, new puzzle, rule text or colour change goes into
all three. The app repo's `CLAUDE.md` has the rule and the iOS ⇄ Android ⇄ Web file map; its
`tools/parity.sh` checks all three generate identical puzzles. Storage keys match the apps
(`puzzles.<game>.<level>.<seed>`, `puzzles.current.<game>.<level>`, `puzzles.stats`,
`puzzles.level.<game>`, `puzzles.theme`); `common.js` migrates the original `puzzles:*` keys once.

## Notes

- A puzzle is fully determined by `(game, level, seed)` — the URL is shareable. Without a seed in the
  URL, the level's in-progress puzzle is resumed (as in the apps); "New puzzle" abandons it.
- Generators only emit puzzles the solver proves to have exactly one solution
  (Hashi: constraint-propagating DFS; Tracks: clue-pruned path enumeration, givens added until unique;
  Sudoku: random full grid, then cells removed while a bitmask backtracking solver still finds exactly
  one solution, down to 38/30/24 givens for easy/medium/hard).
  If a rare seed fails to produce one, the UI shows a notice.
- Tracks `hard` can take ~0.5–3 s to generate on the main thread (shows "Generating…").
- Adding a game: add logic + `*-ui.js` exporting `mount(ctx)` → `{undo, reset, hint, destroy, save}`, then register it in `GAMES` in `app.js`.

## Run / deploy

    cd site && python3 -m http.server 8765     # then open http://localhost:8765
    npx wrangler deploy                         # manual deploy, from this directory

Pushing to `main` on GitHub (`hirak1984/puzzles`) redeploys automatically via Cloudflare Workers Builds
(deploy command `npx wrangler deploy`, no build step).
