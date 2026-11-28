# Balance browser shards on measured durations; two Safari shards at a time

Date: 2026-11-28

Each browser shard now runs an explicit list of spec files, balanced on the
durations recorded in `scripts/browser-timings.json`, instead of Playwright's
`--shard`. The non-blocking Safari WebKit job runs at most two shards at once.
No test is removed, no required check changes name or role, and the full suite
still runs on every merge queue entry before production.

## Why

Measured on the 395 CI runs and 4,100 jobs of 2026-11-23 to 2026-11-28:

- The required checks of a full-suite pull request took 12.4 minutes (median,
  p90 19) and the merge queue 11.5 (p90 16.4). The "27 to 31 minutes" seen per run
  was mostly the Safari job, which starts after the required checks and blocks
  nothing.
- Playwright's `--shard` cuts the ordered test list into equal **counts**. In the
  queue, shard 2 took 11.2 minutes and shard 1 took 5.3 (medians): 539 seconds of
  tests against 179 on the same run. Every run waited for the heaviest shard.
- 85 of the 102 pull request runs since 2026-11-25 ran the full suite (any
  migration, script, dependency or CI change selects it), so the imbalance hit
  almost every pull request twice: on the PR and in the queue.
- Jobs usually started at once (median wait 6 seconds), but the organization
  reached its 20-job ceiling for about 5 hours over the 6 days. Then
  critical-path jobs waited up to 4 minutes (p90), 10 at worst, and the Safari
  shards held 28 % of the runners.
- The 152-minute run of 2026-11-27 was not queueing: it finished in 22 minutes,
  and one failed shard was rerun by hand two hours later.

## Rejected: the full suite only in the merge queue

Running only the affected tests on the pull request, even when the change is
classified full, would save about 3 more minutes on the PR. It was rejected: a
defect only the full suite sees would remove the pull request from the queue and
make GitHub retest every pull request queued behind it, which costs more than it
saves. `Live code on the new schema` keeps running on the pull request and in the
queue.

## Limits

- The table goes stale as specs change. A spec it does not know weighs the
  median, so staleness costs balance, never coverage; `npm run test:ci-plan` fails
  when it lists a deleted spec. Refresh it with
  `node scripts/browser-timings.mjs <run id> ...` on recent green merge queue runs.
- `Live code on the new schema` runs main's own code with Playwright's `--shard`
  and keeps the count-based split. It runs beside the browser shards (6.8 minutes
  median) and was not the slowest job.
- Safari results arrive later (two shards at a time instead of four). They block
  nothing.
