# Repeat every changed browser spec 10 times on the pull request

Date: 2026-11-27

On a pull request, CI runs each browser spec (`tests/<area>/*.spec.ts`) that the
pull request adds or modifies 10 more times in a row, without Playwright's CI
retry (`--repeat-each=10 --retries=0`), inside the required job **Playwright
Chromium mobile**. One failure fails the check. At most 6 specs are repeated;
the merge queue, the nightly and manual runs and the WebKit job repeat nothing.
The rule and its limit are in `docs/workflow.md`, "Automated testing".

## Why

On 2026-11-25 two unstable browser tests (the moderation history journey of
#539, then `tests/room/session-refresh.spec.ts`) passed their pull request, then
failed in the merge queue and removed other founders' pull requests from it.
"Repeat your new test several times before Ready" existed only as an instruction
given to agents in chat: nothing in the repository or in CI enforced it.

- **In the existing browser job, not a new one.** No new required check to add to
  the ruleset (and to make run on `merge_group`), and no extra runner by default:
  the organization runs at most 20 jobs at once (GitHub Free) and one CI run
  already takes about ten. The repetitions are spread over the job's shards by
  Playwright's own `--shard`, and each counts as one spec file in the existing
  12-files-per-runner rule, so a large repetition gets a second runner instead
  of a forty-minute job.
- **On the pull request only.** The queue is the last gate and must stay fast; a
  spec that is unstable should be caught before the founder queues it.
- **Without retry.** With the usual retry, a test that fails once and then passes
  keeps the run green and is only listed as flaky; that is exactly how such a
  test reaches the queue.
- **Capped at 6 specs**, about 60 file runs and at most about 15 minutes per
  shard for the slowest specs measured (about one minute per file run), inside
  the 30-minute job limit. Over the cap, the specs that were not repeated are
  named in the run summary instead of silently dropped.
- **Sequential, not interleaved.** Playwright applies `--repeat-each` to a whole
  invocation, so mixing the repetitions with the other tests would repeat the
  whole selection 10 times. Running them in parallel workers would add load but
  also races between copies of the same test that the suite never meets
  (`workers: 1`). Ten sequential runs therefore catch a clearly unstable test,
  not a 1 to 3 % one or one that fails only on a saturated runner; the
  reproduction method of #570 in `docs/workflow.md` covers those.
