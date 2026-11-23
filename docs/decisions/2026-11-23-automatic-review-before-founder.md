# Automatic review before the founder reads a pull request (#421)

**Date:** 2026-11-23. **Decided with:** Marwane.

## Decision

Every pull request is reviewed before the founder reads it, and the review is
attached to the pull request, not to the session that wrote it.

1. **Hosted reviewer first:** Codex code review on GitHub, included in the
   founder's ChatGPT subscription, requested by the authoring agent with an
   `@codex review` comment before the pull request is marked Ready. It reads the
   new `## Code Review Rules` section of `AGENTS.md`.
2. **Local fallback after 15 minutes or on a refusal:** an independent
   fresh-context reviewer of whichever provider still has quota, given only the
   diff and the review rules. Its result is posted as a pull request comment
   opening with `<!-- review-trace: local -->`.
3. **Remarks are settled by the authoring agent,** at most two rounds; a remaining
   disagreement goes on the founder card.
4. **The Review line of the founder card says who reviewed:** `Hosted reviewer`,
   `Local fallback (<why>)` or `None: <reason>`.
5. **A check enforces it:** `Review trace` fails on a Ready pull request whose card
   has no verdict or whose verdict has no matching trace on the pull request.
   `None: <reason>` passes with a warning.

One definition, three places: the rule in `AGENTS.md` ("Automatic review"), the
procedure in the `ship` skill of both providers, the check on the pull request.
Detail in `docs/workflow.md`, "Automatic review".

## Why

- The founder was the only reader after CI: zero reviews on the last 15 merged
  pull requests. He is the bottleneck, and reads on a phone.
- Sessions start in many ways (T3 Code threads of either provider, a session
  opened by hand, soon unattended night threads). A rule tied to one way of
  starting would silently not apply to the others. A request made on the pull
  request and a check that runs on the pull request apply to all of them.
- The hosted reviewer has its own quota, separate from the quota of Codex
  sessions, and its behavior when exhausted is not documented (a comment, or
  silence). A fixed time limit and a fallback mean a pull request never waits
  forever and never ships unread because one provider is out of quota.
- A written rule is goodwill. The check is what catches a session that skipped
  the skill, which is the case that matters for unattended runs (#425).
- `None: <reason>` passes instead of failing because the requirement is that the
  absence of review is never silent, not that it is impossible: with both
  providers exhausted, the founder still gets an honest card and decides.

## Verified and not verified

Verified in the hosted reviewer's documentation on 2026-11-23
(https://learn.chatgpt.com/docs/third-party/github, `/docs/pricing`): the
`@codex review` trigger and the automatic trigger, the 👀 reaction then a standard
GitHub review, P0 and P1 issues only, `AGENTS.md` and its `## Code Review Rules`
section, a separate "Code Review" usage counter, the settings page.

Not documented: behavior on drafts and on each push, what is posted when nothing
is found, what happens when the quota is exhausted, the published quota numbers,
and the login of the reviewer (`chatgpt-codex-connector[bot]` comes from user
reports). The procedure does not depend on any of these: the time limit covers
silence, and the check accepts a review, a comment or a thumbs-up from the
reviewer. Observations made on real pull requests are added to
`docs/workflow.md`, "Automatic review".

## Not decided here

- The check is not added to the required checks. That changes the merge rules and
  stays the founder's decision (#422 revisits them).
- The merge rule in `docs/workflow.md`, "Merging", is untouched (#422).
- The reviewer's name appears in the repository (`@codex review`, the bot login in
  `scripts/review-trace.mjs`): it is the trigger and the only way to recognize its
  trace. Pull request descriptions and commits still never name an assistant.
