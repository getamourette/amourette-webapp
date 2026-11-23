# Every pull request proves the failing case, not only the working one

Date: 2026-11-23 (follows #445 and #450)

A pull request now proves that the change works and that it fails when it must
(`AGENTS.md`, "Prove the failing case too"):

- A test or check that is added or changed is shown red without the change, or on
  a deliberately broken input, then green with it.
- When the change exists to handle a failure (retry, fallback, timeout, refusal,
  error message, rollback), that failure is provoked for real and its result shown.
- When the failure path cannot be provoked, the founder card says so on its Risk
  line, not only under "Not verified", and never reads `Nothing, you can merge`
  without that sentence.
- Documentation-only and verified dictionary copy changes are exempt: they add no
  check and no failure path.

The Proof section of the pull request template carries a dedicated `Failing case`
line; the `ship` skill fills it. This extends "Proof by change type and a founder
card" (same date); it replaces nothing.

*Why:* #450 capped the Chromium install step in CI at five minutes and retried it
once. Its proof showed the normal case, an install that passes. The case the pull
request existed for, an install really interrupted then retried, had never been
triggered. On its first real use the retry failed: the interrupted attempt left
dpkg half-configured and the second install stopped on it (#445, run
45211336009). The existing rule asked for proof and a "Not verified" section, but
nothing required the failure case, so an unproven retry reached `main` under a
card that read as fully proven. A gap written only at the bottom of the
description is not read on a phone in 30 seconds; the Risk line is.

*Not decided here:* an automatic check that refuses a pull request whose
`Failing case` line is empty, and the same instruction for the automatic reviewer
(#448, not merged when this was written). Both are follow-ups.
