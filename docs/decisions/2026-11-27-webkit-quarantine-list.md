# A short, explicit WebKit quarantine list, each entry tied to an issue

**Decision (2026-11-27, WebKit stabilization):** a browser test that fails on
WebKit for a reason not fixed in the same pull request (a product bug, or an
intermittent failure whose cause is not classified yet) is set aside on WebKit
only, by calling `quarantinedOnWebKit("#N")` at the top of the test. Every entry lives in one file, `tests/helpers/webkit-quarantine.ts`,
keyed by the issue that tracks it, with a one-line reason. Chromium keeps
running the test. The fix for the issue deletes the entry and the call.

**Why:** from 2026-11-20 to 2026-11-27, 56 of 84 complete WebKit runs had at least
one red shard (24 of the last 27), so nobody read the job any more, a week before
the first night where most guests are on iPhones. Most of that red came from test
defects, fixed in the same pull request. The rest was a real product bug, which must
not be fixed quietly inside a CI pull request, and one long journey that times
out at a different step each run. Leaving one of those tests red would
keep the whole job red and hide the next Safari regression. Skipping it silently,
or weakening the assertion, would hide the bug instead. A typed list keyed by
issue keeps every exception visible, short and owned. `test.fixme` reports it as
skipped with its reason in every run.

**Not decided here:** whether a small core of WebKit journeys becomes a required
check. That stays a founder decision (`2026-11-24-webkit-non-blocking-suite.md`).
