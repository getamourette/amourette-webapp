# Merge through GitHub's merge queue instead of an up-to-date branch

Date: 2026-11-23

`main` is merged through GitHub's merge queue. The founder clicks **Merge when
ready** on every green PR, in any order, without waiting; GitHub tests each one on
the latest `main` and squash-merges it. Agents no longer update a branch because
`main` moved.

This supersedes `2026-11-23-branch-update-preauthorized.md` (there is no routine
branch update left to authorize). It replaces the 2026-10-21 pre-launch CI policy
("the full suite is a safety net, not a per-PR merge gate") for the queue only:
the full suite runs once per merge, in the queue. On the PR itself that policy
stands and the scoped selection is unchanged. A documentation PR therefore takes
about ten minutes to merge instead of one; the founder no longer waits in front of
it, so the delay costs nothing.

It takes one piece out of #422 (fast and sensitive lanes). Lanes, one-action
approval and auto-merge stay open there. The repository's auto-merge setting stays
off; the founder clicks **Merge when ready** once the PR's checks are green.

## What is configured

In the **Required PR tests** ruleset (id 22532357) on `main`:

- The two required checks are unchanged: `Lint, logic and build` and
  `Playwright Chromium mobile`.
- "Require branches to be up to date" is turned off
  (`strict_required_status_checks_policy: false`). The queue gives the same
  guarantee without the author updating the branch (GitHub docs, "Managing a merge
  queue").
- A `merge_queue` rule is added: merge method `SQUASH`; one PR per merge
  (`min_entries_to_merge` and `max_entries_to_merge` at 1), so every PR is its own
  commit and its own push to `main`; up to 3 queued PRs tested at the same time
  (`max_entries_to_build`), each on top of the ones before it (one entry is five
  jobs, and the organization's plan runs about twenty at once, shared with the
  open PRs); `ALLGREEN`, so each
  PR's own commit must pass; a check with no result after 60 minutes counts as
  failed. `min_entries_to_merge_wait_minutes` is 5 and has no effect with a minimum
  of one.
- The admin bypass on pull requests is unchanged. It now appears as "Merge without
  waiting for requirements to be met", which skips the queue and its full suite:
  an emergency exit, not the normal path.

In CI, `.github/workflows/ci.yml` also runs on `merge_group`, and
`scripts/ci-plan.mjs` treats that event like a manual run: full suite, no proof
reuse.

## Activation

Applied by the founder's explicit decision, right after the pull request that adds
the `merge_group` trigger is merged. Activating first would block every merge: the
required checks would never be reported in the queue. Waiting long after it leaves
the old up-to-date requirement in force while agents no longer update branches.
After the command, read the ruleset back
(`gh api repos/getamourette/amourette-webapp/rulesets/22532357`) and check that its
name, target, conditions and bypass are unchanged.

```bash
gh api -X PUT repos/getamourette/amourette-webapp/rulesets/22532357 --input - <<'JSON'
{"rules":[
  {"type":"required_status_checks","parameters":{
    "strict_required_status_checks_policy":false,
    "do_not_enforce_on_create":false,
    "required_status_checks":[
      {"context":"Lint, logic and build","integration_id":15368},
      {"context":"Playwright Chromium mobile","integration_id":15368}]}},
  {"type":"merge_queue","parameters":{
    "merge_method":"SQUASH",
    "grouping_strategy":"ALLGREEN",
    "max_entries_to_build":3,
    "min_entries_to_merge":1,
    "max_entries_to_merge":1,
    "min_entries_to_merge_wait_minutes":5,
    "check_response_timeout_minutes":60}}
]}
JSON
```

## Rollback, one command

Restores the ruleset rules exactly as they were before the queue (up-to-date
branch required, no queue). Use it with an empty queue: what GitHub does with
PRs still queued at that moment was not checked.

```bash
gh api -X PUT repos/getamourette/amourette-webapp/rulesets/22532357 --input - <<'JSON'
{"rules":[
  {"type":"required_status_checks","parameters":{
    "strict_required_status_checks_policy":true,
    "do_not_enforce_on_create":false,
    "required_status_checks":[
      {"context":"Lint, logic and build","integration_id":15368},
      {"context":"Playwright Chromium mobile","integration_id":15368}]}}
]}
JSON
```

The `merge_group` trigger can stay in the workflow after a rollback: without the
queue rule the event never fires.

## Consequences to keep in mind

- **Any check that becomes required must run on `merge_group` too.** `Review
  trace` is deliberately not required
  (`2026-11-23-automatic-review-before-founder.md`), reads the pull request
  description and does not run in the queue. If it is made required one day, its
  workflow needs the `merge_group` trigger in the same change, or every queued PR
  waits 60 minutes and is removed.
- **Steps that read `github.event.pull_request.*` get empty values in the queue.**
  The migration classification (#449) therefore reads
  `github.event.merge_group.base_sha` and `head_sha` there: it classifies the
  queued PR's migrations against the commit queued just before it, so two queued
  migrations cannot land out of filename order, and the "live code on the new
  schema" run uses that same base. `scripts/check-migrations.mjs` refuses to run
  on a pull request or a queue entry without both commits. Any later step added
  to the workflow (#458 included) follows the same pattern.
- **The migrate-and-deploy workflow (#434, #458) is unaffected.** A queue merge
  reaches `main` as an ordinary push, one per PR, so a workflow triggered by
  `push` on `main` behaves as with a manual merge. It must filter on
  `branches: [main]` so the queue's temporary `gh-readonly-queue/main/...` branches
  never start it. Two PRs can now land a few minutes apart, so that workflow keeps
  its own serialization.
- **No Vercel preview for the queue's branches.** `vercel.json` disables
  deployments for `gh-readonly-queue/**`; without it every queued PR would build
  one more preview that nobody opens.
- **A flaky test now costs a place in the queue**, not just a rerun: the PR is
  removed and the founder queues it again. Playwright already retries once in CI,
  and the known flaky tests (#337, #392, #416) are fixed; a new one is worth fixing
  at once.
- **The queue cannot take a PR that conflicts with `main`.** That is the one case
  where an agent still updates its branch.

## Why

The ruleset demanded an up-to-date branch, and about ten PRs move in parallel.
Each merge put every other PR behind; each then had to be updated and wait ten
minutes of tests again, and the founder had to wait and merge in the right order.
Authorizing the updates in advance removed the question but not the waiting. The
queue removes both: GitHub does the update, the test and the ordering.

One PR per merge and no batching is the simplest setting to reason about: each
commit on `main` was tested exactly as it landed, and a failure points at one PR.
Testing up to three at once keeps ten queued PRs from taking ten times ten minutes.

The full suite runs in the queue, not the scoped selection, because the queue is
the last gate before `main` and its commit has never been tested as such; it also
makes proof reuse unnecessary there.

Availability was checked against GitHub's documentation on 2026-11-23: merge
queues are available in any public repository owned by an organization, which is
this repository's case (the organization is on the Free plan).
