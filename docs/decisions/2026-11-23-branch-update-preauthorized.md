# Updating a branch from main is authorized in advance

Date: 2026-11-23

An agent may update its PR branch from `main` without asking the founder when the
only reason is that `main` moved. The CI run this triggers is authorized too, and
so is marking the PR Ready for review once that run is green, provided the work
was already complete before the update.

Agents batch the update: once, just before presenting the PR for merge, not each
time `main` moves.

Approval is still required before repeating a long suite for any other reason: a
rerun after a failure, a manual dispatch, or a doubt about a flaky test. Merging
stays founder-gated, and protections are not changed.

This narrows the "Ask before repeating a long validation suite" rule in
`AGENTS.md`; it does not replace it.

*Why:* the **Required PR tests** ruleset demands an up-to-date branch before
merge, and about ten PRs move in parallel. Each merge puts every other PR behind,
and each of those threads then had to ask Marwane for the same approval, several
times a day. The approval protected nothing: the update is mandatory for the
merge, so the answer was always yes. Batching keeps the CI cost at one run per PR
instead of one per movement of `main`.
