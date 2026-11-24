# Full browser suite on WebKit, non-blocking at first (#349)

**Decision (Marwane, 2026-11-24):** the whole Playwright suite runs on WebKit with
an iPhone profile, in addition to Chromium mobile, not only the critical
journeys. The WebKit job starts as a non-required check: it is skipped in the
merge queue and `continue-on-error` keeps a failure from turning the run red.
Making it required is a separate decision, taken once the job is stably green.
The iOS simulator and real devices are decided after the first launch night
(10 December 2026).

**Why:** most guests will arrive with an iPhone, and until now no test ran on
Safari's engine. A blocking job on day one would have stopped every merge on
failures that still need triage two weeks before launch. Running it after the
Chromium shards, and outside the merge queue, keeps the required check as fast
and reliable as before while still reporting every Safari regression on each pull
request and every night on `main`.

**How it works:** `E2E_ENGINE=webkit` swaps the Playwright project to
`webkit-iphone`; the job reuses the plan's selection and shards.
`scripts/test-ci-reuse.mjs` asserts that the job stays non-blocking. See
`docs/workflow.md`, "Safari WebKit job (#349)".
