# Every pull request proves the failing case, not only the working one

Date: 2026-11-23 (follows #445 and #450)

A pull request now proves that the change works and that it fails when it must
(`AGENTS.md`, "Prove the failing case too"):

- A test or check that is added or changed is shown red for the behavior it
  covers, then green with the change.
- Every failure-handling path the change adds or alters (retry, fallback, timeout,
  refusal, error message, rollback) is provoked for real, in each failure mode it
  claims to handle, and its result shown.
- When a failure mode cannot be provoked, the founder card says so on its Risk
  line, not only under "Not verified", and never reads `Nothing, you can merge`
  without that sentence.
- Documentation-only and verified dictionary copy changes are exempt: they add no
  check and no failure path.

The Proof section of the pull request template carries a dedicated `Failing case`
line; the `ship` skill fills it. This extends "Proof by change type and a founder
card" (same date); it replaces nothing.

*Why:* #450 capped the Chromium install step in CI at five minutes and retried it
once. It did provoke one failure mode, a stall during `apt-get update`, and showed
the retry recovering from it. The other mode, an install interrupted while `dpkg`
configures packages, was listed under "Not verified" and never triggered, while
the card read `Nothing, you can merge` with no risk named. On its first real use
the retry met exactly that mode and failed: the interrupted attempt left dpkg
half-configured and the second install stopped on it (#445, run 45211336009). The
existing rule asked for proof and a "Not verified" section, but nothing required
every failure mode to be provoked, nor a known gap to be raised where the founder
reads. A gap written only at the bottom of the description is not read on a phone
in 30 seconds; the Risk line is.

*Not decided here:* an automatic check that refuses a pull request whose
`Failing case` line is empty, and the same instruction for the automatic reviewer
(#448, not merged when this was written). Both are follow-ups.
