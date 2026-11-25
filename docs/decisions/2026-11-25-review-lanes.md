# Two review lanes, computed from the changed files; merging stays the founder's click

**Date:** 2026-11-25 · **Issue:** #422

## Decision

1. Every pull request is in the **fast lane** or the **sensitive lane**.
   `scripts/review-lane.mjs` decides from the changed files; the lists are in
   `docs/workflow.md`, "Review lanes". Fast: copy, ordinary documentation, a small
   fix in application code outside the sensitive areas. Sensitive: database, agent
   rules, CI and tooling, dependencies and configuration, auth and session, server
   code, reservations and payments, legal and production policy, a removed or
   disabled test, more than 400 changed lines of application code, or a path
   nobody has placed yet.
2. The founder card's Risk line opens with the lane. The `Review trace` workflow
   gets a second step that fails a Ready pull request whose card announces no lane,
   or the fast lane for sensitive files. Announcing the sensitive lane for a fast
   change is always allowed.
3. The founder merges a fast-lane pull request from the card and its proof, and
   reads a sensitive-lane one.
4. Nothing changes in the protection of `main`: no new required check, no
   auto-merge, no robot allowed to merge.

## Why

The founder reviews from a phone and was spending the same attention on a sentence
and on a payment webhook. Measured on the 40 pull requests merged before this one,
8 would have been fast and 32 sensitive: most of the recent work touched the
database, reservations or the rules themselves, so the fast lane is a minority
today and grows as the launch infrastructure settles.

The lists are paths, not a reading of the code: a script that guesses intent would
need its own review. They err towards sensitive on purpose (a false sensitive costs
a read, a false fast costs a missed one), and every unknown folder is sensitive until
placed. Product invariants live mostly in SQL, already sensitive; for the rest the
agent may escalate by hand.

The lane is enforced in the existing `Review trace` workflow rather than a new one:
it already reads the pull request live on every push and description edit, the
card is written last, and a second job would spend one more runner under GitHub
Free's 20-job cap. A label was rejected: it needs a write token in CI and says
nothing a reader of the card does not already see.

## Open, for the founder to decide

These change the protection of `main` or give a robot the right to merge, so they
are proposals, not decisions:

- **Require `Review trace`** in the `Required PR tests` ruleset. Then no pull
  request reaches the merge queue without a review verdict and a correct lane.
- **Auto-merge for the fast lane.** A workflow would enable GitHub auto-merge on a
  Ready fast-lane pull request with a green review trace. Recommendation: not yet.
  **Merge when ready** is already a single gesture through the merge queue, the
  issue's done criterion (five fast-lane pull requests merged from the phone
  without opening the diff) has not been met, and a flaky test would then merge or
  block without anyone watching.
