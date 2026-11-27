# Reuse the CI proof when a pull request only renames its own migration

Date: 2026-11-27

`check-migrations` refuses a migration that sorts before the last one in `main`.
When the founder merges migration pull requests in another order than planned
(once on 2026-11-25, twice on 2026-11-27), the others must rename their file to a
later timestamp. That push changed only a file name but ran the whole pull request
suite again: about ten minutes and about ten of the organization's twenty runners,
while the merge queue replays everything on the final commit anyway.

`scripts/ci-reuse.mjs` now lets both required checks reuse the earlier proof for
that change, and say that tests were not executed again. "Classify the migrations"
still runs on the new commit: it is what proves the new name sorts last.

## What counts as a pure rename

Between the tested head (an ancestor of the new head) and the new head, every
change outside the existing Markdown allowlist is a deleted file under
`supabase/migrations/` paired with an added one with the same suffix after the
14-digit timestamp, a later timestamp, the same blob and the same mode; neither
name exists on the proven base or the current base, so both belong to the pull
request; and the pull request's own migrations keep their order among themselves
(renaming the first of two dependent files past the second would apply an
`ALTER TABLE` before its `CREATE TABLE`). A migration already on `main` renamed, any byte changed, a file that
references the new name (code, a test, agent instructions), an unpaired addition or
deletion, or any Git or API error falls back to the normal validation.

## Why the base may move for this case only

The founder's brief asked to keep "same recorded base". The recorded base is
`github.event.pull_request.base.sha`, and on 2026-11-27 the runs of 2026-11-26 showed
that it is `main`'s tip at each push, not the branch's merge base: a branch that was
never updated still gets a new base whenever `main` moves. A rename is only needed
after `main` moved, so with "same base" the reuse could never apply. For a pure
rename, the proven base must instead be an ancestor of the current one (`main` went
forward, nothing was rewritten). The reused tests then ran against an older `main`;
the plan summary says so. What that leaves untested (the PR against `main`'s newest
commits) is exactly what the merge queue's full suite tests before anything lands.
Documentation-only reuse keeps the same-base rule.

## Limit

A branch updated from `main` since the proof carries `main`'s changes in its diff
and never qualifies. Agents therefore rename without updating the branch, unless
GitHub reports a conflict (`docs/workflow.md`, "Migration kinds").
