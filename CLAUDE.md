# Puzzles — website (puzzles.hirakonline.com)

This site is one of three codebases for the same product, with the iOS and
Android apps in `../puzzles-app`. They must stay feature-identical: any
feature, fix, new puzzle, rule text, color, level config or behaviour change
made here must also go into both apps, and vice versa. Read
`../puzzles-app/CLAUDE.md` for the rule, the iOS ⇄ Android ⇄ Web file map and
the invariants (deterministic `(level, seed)` generation, shared storage key
names).

Before finishing any change, run `../puzzles-app/tools/parity.sh`. It checks
that Swift, Kotlin and this JS generate identical puzzles. Run `npm test` for
the web tests alone.

Pushing `main` deploys to production automatically (Cloudflare Workers
Builds), so ask before pushing.
