# Logic tests are discovered by file name, not listed in package.json

Decided by Marwane on 2026-11-25 (#516).

`npm run test:logic` used to be one hand-written chain of `npm run test:...` commands in
`package.json`. Every fix adds a test, so every pull request edited that one line and
parallel pull requests conflicted: on 2026-11-25 the match-reveal PR (#514) was removed
from the merge queue by a `package.json` conflict with the hidden-guest PR (#507).

`test:logic` now runs `scripts/run-logic-tests.mjs`, which runs every
`scripts/test-*.{mjs,mts,ts}` file except an explicit `integration` list (scripts that
need a real database, a deployed service or secrets). Adding a logic test means adding a
file; `package.json` does not change.

Why this shape:

- **The existing naming already separated the two kinds.** All 75 `scripts/test-*` files
  were either in the chain (63) or integration scripts (12), so discovery by name kept the
  exact same set without moving or renaming a file that open pull requests were editing.
- **A deny list fails safe.** A new integration script forgotten from the list runs in
  the gate and fails for lack of its database, which is loud. An allow list would have
  kept the shared line every pull request edits.
- **No dependency, no framework.** Every test already exits non-zero on failure; the
  runner only spawns Node on each file with `--experimental-strip-types`, which is a
  no-op for plain `.mjs` files.
- **The runner continues after a failure** and lists every failing file, so one red run
  shows all regressions instead of the first.
