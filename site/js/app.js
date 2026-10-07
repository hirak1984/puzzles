import { store, fmtTime, getStats, recordSolve, progressKey, lastLevel, setCurrentSeed, resumableSeed, randomSeed } from './common.js';

const GAMES = {
  hashi: {
    title: 'Hashi',
    blurb: 'Connect the islands with bridges.',
    rules: [
      'Each number is how many bridges must touch that island.',
      'Bridges run straight, horizontally or vertically, and never cross another bridge or island.',
      'At most two bridges join any pair of islands.',
      'All islands must end up connected as one group.',
      'Tap an island, then a highlighted neighbour to add a bridge (tap again for a double, again to remove). You can also drag from an island towards its neighbour, or tap a bridge to cycle it.',
    ],
    load: () => import('./hashi-ui.js'),
    icon: '<svg viewBox="0 0 64 64"><g stroke="currentColor" stroke-width="2.5"><path d="M18 20H46M18 44H46M18 22V42M46 22V42"/><path d="M15.5 22V42M20.5 22V42" opacity=".0"/></g><g fill="var(--bg-elevated)" stroke="currentColor" stroke-width="2.5"><circle cx="18" cy="20" r="8"/><circle cx="46" cy="20" r="8"/><circle cx="18" cy="44" r="8"/><circle cx="46" cy="44" r="8"/></g><g fill="currentColor" font-size="10" font-weight="700" text-anchor="middle"><text x="18" y="23.5">2</text><text x="46" y="23.5">2</text><text x="18" y="47.5">2</text><text x="46" y="47.5">2</text></g></svg>',
  },
  tracks: {
    title: 'Train Tracks',
    blurb: 'Lay a continuous track from entrance to exit.',
    rules: [
      'Build one unbroken track from the entrance arrow on the left to the exit arrow at the bottom.',
      'The numbers on the top and right say how many squares in that column or row hold track.',
      'The track never crosses or branches, and it may not touch itself head-on. Every piece of track must belong to the one route.',
      'Some squares are already laid; they cannot be changed.',
      'Drag from square to square to lay track (drag over existing track to erase it). Tap an empty square to mark it as having no track.',
    ],
    load: () => import('./tracks-ui.js'),
    icon: '<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="10" stroke-dasharray="2.5 5" opacity=".55"><path d="M8 20H32Q48 20 48 36V56"/></g><g fill="none" stroke="currentColor" stroke-width="4"><path d="M8 20H32Q48 20 48 36V56"/></g><g fill="none" stroke="var(--bg-elevated)" stroke-width="1.6"><path d="M8 20H32Q48 20 48 36V56"/></g></svg>',
  },
  sudoku: {
    title: 'Sudoku',
    blurb: 'Fill the grid so every row, column and box holds 1–9.',
    rules: [
      'Fill every empty square with a digit from 1 to 9.',
      'Each row, each column, and each 3×3 box must contain every digit exactly once — no repeats.',
      'Tap a square, then tap a number below to fill it. Tap the same number again to clear it.',
      'Given squares are shaded and locked — they can\'t be changed.',
    ],
    load: () => import('./sudoku-ui.js'),
    icon: '<svg viewBox="0 0 64 64"><g stroke="currentColor" stroke-width="1.5" opacity=".55"><path d="M27.33 18V46M36.67 18V46M18 27.33H46M18 36.67H46"/></g><rect x="18" y="18" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"/><g fill="currentColor" font-size="11" font-weight="700" text-anchor="middle" dominant-baseline="central"><text x="22.67" y="22.67">5</text><text x="41.33" y="32">3</text><text x="32" y="41.33">8</text></g></svg>',
  },
};
const LEVELS = ['easy', 'medium', 'hard'];

const app = document.getElementById('app');
let current = null; // active game controller

function parseRoute() {
  const [, game, level, seed] = location.hash.split('/');
  return { game, level, seed };
}

function teardown() {
  if (current) {
    current.save?.(); // keep the elapsed time when leaving / switching level
    current.destroy?.();
    current.timerId && clearInterval(current.timerId);
    current = null;
  }
}

function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.id);
  toast.id = setTimeout(() => t.classList.remove('show'), 2200);
}

function renderHome() {
  document.title = 'Puzzles — hirakonline';
  const stats = getStats();
  app.innerHTML = `
    <div class="home">
      <p class="page-intro">Three logic puzzles, generated fresh every time.</p>
      <p class="lede">No ads, no accounts — progress stays on this device.</p>
      <div class="cards">
        ${Object.entries(GAMES).map(([id, g]) => {
          const solved = LEVELS.reduce((a, l) => a + (stats[id]?.[l]?.solved || 0), 0);
          return `<a class="card" href="#/${id}">
            <div class="card-icon">${g.icon}</div>
            <div><h2>${g.title}</h2><p>${g.blurb}</p>
            <p class="meta">${solved ? `${solved} solved` : 'Not played yet'}</p></div>
          </a>`;
        }).join('')}
      </div>
    </div>`;
}

async function renderGame({ game, level, seed }) {
  const g = GAMES[game];
  if (!LEVELS.includes(level)) level = lastLevel.get(game);
  if (!LEVELS.includes(level)) level = 'easy';
  // An explicit seed (a shared link) wins; otherwise resume this level's open puzzle.
  if (!/^\d+$/.test(seed || '')) seed = String(resumableSeed(game, level));
  const want = `#/${game}/${level}/${seed}`;
  if (location.hash !== want) { history.replaceState(null, '', want); }
  lastLevel.set(game, level);
  setCurrentSeed(game, level, Number(seed));
  document.title = `${g.title} — Puzzles`;

  const stats = getStats()[game]?.[level];
  app.innerHTML = `
    <div class="game">
      <a class="back" href="#/">← All puzzles</a>
      <p class="page-intro">${g.title}</p>
      <div class="game-head">
        <div class="seg" role="tablist" aria-label="Difficulty">
          ${LEVELS.map((l) => `<a role="tab" aria-selected="${l === level}" class="${l === level ? 'on' : ''}" href="#/${game}/${l}">${l}</a>`).join('')}
        </div>
        <div class="timer" id="timer" aria-label="Elapsed time">0:00</div>
      </div>
      <div class="board-wrap" id="board"><p class="gen">Generating…</p></div>
      <div class="bar">
        <button id="undo">Undo</button><button id="hint">Hint</button><button id="reset">Reset</button><button id="new" class="primary">New puzzle</button>
      </div>
      <p class="stat">${stats ? `${stats.solved} solved · best ${fmtTime(stats.best)}` : 'No solves yet at this level'}</p>
      <details class="rules"><summary>How to play</summary><ul>${g.rules.map((r) => `<li>${r}</li>`).join('')}</ul></details>
      <div class="win" id="win" hidden>
        <div class="win-card"><h2>Solved!</h2><p id="win-time"></p><div><button id="win-new" class="primary">Next puzzle</button><button id="win-close">Close</button></div></div>
      </div>
    </div>`;

  // timer
  let elapsed = 0;
  const timerEl = document.getElementById('timer');
  const timer = { get: () => elapsed, set: (s) => { elapsed = s; timerEl.textContent = fmtTime(s); } };
  const state = { timerId: null, destroy: null, discard: false };
  // Abandons the current puzzle (its saved progress is dropped, as in the apps).
  const newPuzzle = () => {
    state.discard = true;
    store.del(progressKey(game, level, seed));
    location.hash = `#/${game}/${level}/${randomSeed()}`;
  };
  current = state;
  state.timerId = setInterval(() => {
    if (document.hidden) return;
    elapsed++;
    timerEl.textContent = fmtTime(elapsed);
    if (elapsed % 5 === 0) state.save();
  }, 1000);
  state.save = () => { if (!state.discard) ctrl?.save?.(); };

  let ctrl = null;
  const ctx = {
    board: document.getElementById('board'), level, seed: Number(seed), key: progressKey(game, level, seed), timer, toast,
    onSolved() {
      clearInterval(state.timerId);
      const l = recordSolve(game, level, elapsed);
      document.getElementById('win-time').textContent = `${fmtTime(elapsed)}${l.best === elapsed ? ' — a new best!' : ` · best ${fmtTime(l.best)}`}`;
      document.getElementById('win').hidden = false;
    },
  };
  // let the "Generating…" frame paint before the (possibly slow) generator runs
  await new Promise((r) => setTimeout(r, 30));
  if (current !== state) return;
  const mod = await g.load();
  ctrl = mod.mount(ctx);
  state.destroy = () => ctrl.destroy?.();
  timerEl.textContent = fmtTime(elapsed);

  document.getElementById('undo').onclick = () => ctrl.undo();
  document.getElementById('hint').onclick = () => ctrl.hint();
  document.getElementById('reset').onclick = () => ctrl.reset();
  document.getElementById('new').onclick = newPuzzle;
  document.getElementById('win-new').onclick = newPuzzle;
  document.getElementById('win-close').onclick = () => { document.getElementById('win').hidden = true; };
}

function route() {
  teardown();
  const r = parseRoute();
  if (GAMES[r.game]) renderGame(r);
  else renderHome();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
window.addEventListener('pagehide', () => current?.save?.());
route();

// Light / dark / system toggle — same behaviour as Convene and Angles.
(function initThemeToggle() {
  const wrap = document.getElementById('themeToggleWrap');
  if (!wrap) return;
  const STATES = ['light', 'dark', 'system'];
  const ICONS = {
    light: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><line x1="8" y1="1" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="1" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="15" y2="8"/><line x1="3" y1="3" x2="4.5" y2="4.5"/><line x1="11.5" y1="11.5" x2="13" y2="13"/><line x1="13" y1="3" x2="11.5" y2="4.5"/><line x1="4.5" y1="11.5" x2="3" y2="13"/></svg>',
    dark: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5z"/></svg>',
    system: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="2" width="14" height="10" rx="1.5"/><line x1="5" y1="14" x2="11" y2="14"/><line x1="8" y1="12" x2="8" y2="14"/></svg>',
  };
  const getTheme = () => { try { return localStorage.getItem('puzzles.theme') || 'system'; } catch { return 'system'; } };
  function applyTheme(t) {
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
  function render(current) {
    wrap.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn';
    btn.setAttribute('aria-label', 'Toggle theme (currently ' + current + ')');
    btn.innerHTML = ICONS[current];
    btn.addEventListener('click', () => {
      const next = STATES[(STATES.indexOf(getTheme()) + 1) % STATES.length];
      try { localStorage.setItem('puzzles.theme', next); } catch {}
      applyTheme(next);
      render(next);
    });
    wrap.appendChild(btn);
  }
  render(getTheme());
})();
