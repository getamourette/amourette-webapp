# WebKit starts after the required checks; agents push in batches and wait with a limit

**Date:** 2026-11-25 · **Issue:** #531

## Decision

1. The non-blocking `Safari WebKit iPhone` job (#505) starts only once both
   required checks and `CI evidence` are done (`needs: [plan, evidence]`), instead
   of as soon as the Chromium shards end.
2. Agents mark a pull request Ready on the two required checks of its latest
   commit and read the WebKit result afterwards; they do not wait for the whole run.
3. Agents develop and test locally and push a batch when it is ready to be
   verified, not every commit.
4. Agents wait for CI with `npm run pr:wait -- <N>`: it fails at once on a conflict
   with `main`, fails when no CI run has started on the head commit after 3
   minutes, waits only for the two required checks and stops at a time limit.

## Why

Measured on 2026-11-25 over the Actions jobs API: the organization is on GitHub
Free, which runs at most 20 jobs at once across all repositories. With five to
seven pull requests in flight, jobs queue for a runner. `Playwright Chromium
mobile` is a 3-second job, but it became eligible at the same moment as the four
WebKit shards and waited 2 to 4.5 minutes behind them (runs 45590311235,
45590633427, 45590908151). The Chromium shards themselves were not slower. Agents
also waited for the end of the run, WebKit included (median 17.6 minutes, up to
30, against about 10 before WebKit), before marking Ready.

Running WebKit in parallel with Chromium was rejected: under the same runner cap
it would add four jobs competing with the required shards at the start of every
run. Fewer WebKit shards were not adopted: they save only the per-job setup and
lengthen the Safari result, while the long WebKit shards measured today come from
the five known failures retried once each, which #526 removes. WebKit already runs
the plan's selection on a pull request, not the full suite.

Each push to a pull request branch starts a full run on those shared runners and
spends one Vercel deployment from the Hobby plan's daily cap, which blocked
production on 2026-11-23; hence the batching rule.

The same morning, #529 was in conflict with `main` on `package.json`. GitHub starts
no `pull_request` run on a conflicting PR, and its agent's hand-written wait loop
waited 50 minutes for a run that never existed, with no error. A shared script with
those three exits replaces each agent's own loop.

Lifting the runner cap means a paid GitHub plan (Team allows 60 concurrent
jobs) and remains a founder decision; it is not needed for this change.
