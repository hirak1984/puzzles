# Puzzles — Hashi & Train Tracks

Static, no-build web app for `puzzles.hirakonline.com`. Vanilla JS ES modules,
no dependencies, no backend. Progress/stats live in `localStorage`.

## Layout

- `site/` — the only thing that gets deployed (`wrangler.jsonc` points at it).
  - `js/hashi.js`, `js/tracks.js` — pure logic: model, solver, seeded generator, win check.
  - `js/hashi-ui.js`, `js/tracks-ui.js` — SVG boards + pointer input.
  - `js/app.js` — hash router (`#/`, `#/<game>/<level>/<seed>`), shell, timer, stats.
- `tests/generate.test.mjs` — `npm test`: generates puzzles for every level, checks the
  stored solution passes the win check, generation is deterministic, and reports how many are provably unique.

## Notes

- A puzzle is fully determined by `(game, level, seed)` — the URL is shareable.
- Generators only emit puzzles the solver proves to have exactly one solution
  (Hashi: constraint-propagating DFS; Tracks: clue-pruned path enumeration, givens added until unique).
  If a rare seed fails to produce one, the UI shows a notice.
- Tracks `hard` can take ~0.5–3 s to generate on the main thread (shows "Generating…").
- Adding a game: add logic + `*-ui.js` exporting `mount(ctx)` → `{undo, reset, hint, destroy, save}`, then register it in `GAMES` in `app.js`.

## Run / deploy

    cd site && python3 -m http.server 8765     # then open http://localhost:8765
    npx wrangler deploy                         # from this directory
