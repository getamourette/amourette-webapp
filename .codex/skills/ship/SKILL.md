---
name: ship
description: Push work on the current Amourette branch. Use for final delivery requests such as /ship, ship, ship it, ready for review, or open the finished PR, and for WIP requests such as push for Vercel, preview, checkpoint, or open a draft PR. Classifies the user's intent; final delivery verifies the scoped hosted gate, makes the PR Ready for review, and moves the card to In review, while WIP pushes optionally create or update a draft PR and leave the card In progress. Never merges or deletes branches. Works the same under Claude Code and Codex.
---

# Ship

Classify the request before acting:

- **Final delivery:** `/ship`, "ship it", "ready for review", or an equivalent clear
  statement that the work is complete.
- **WIP preview/checkpoint:** "push this so I can test on Vercel", "checkpoint",
  "preview", "push WIP", "open a draft PR", or an equivalent request for testing or
  early feedback.

If intent is genuinely ambiguous, ask whether the work is ready for review. Never infer
final delivery merely from "push" or "open a PR" when the surrounding context says WIP.

## Shared preparation

1. **Docs.** If the session produced a decision (architecture, data model, tooling,
   how we work), record it in a new file `docs/decisions/YYYY-MM-DD-short-slug.md`
   with the *why* (one decision per file; never append to the frozen
   `docs/decisions.md` archive, never add an index). If a
   bloc changed status, update `docs/roadmap.md`. Ask if unsure rather than skip.
2. Inspect the worktree and identify only the intended changes. Never push straight
   to `main`.
3. Determine whether the diff changes a user-facing interface. For UI work, read the
   repository's UI verification gate in `docs/workflow.md` and identify the relevant
   states, target viewports, and existing browser journeys before choosing checks.

## The founder card (every PR, draft or final)

Every PR description this skill creates or updates follows
`.github/pull_request_template.md` and opens with the founder card: **What
changes**, **Proof**, **Review**, **Risk**, **Your action**, in that order, as
specified in `docs/workflow.md`, "Proof and the founder card". Read that section
before writing the description. In short:

- Name the kind of change and provide the proof `AGENTS.md`, "Proof by change
  type", requires for it. If the kind has no line yet, add one in this PR.
- Fill the `Failing case` line of the Proof section as `AGENTS.md`, "Prove the
  failing case too", requires. A failure mode that could not be provoked goes on
  the Risk line. Never mark a PR Ready while that line is empty or unproven.
- **Proof** states the real CI result on the latest commit: the scope and whether
  browser tests really ran, with the run link. Never infer it from a check name.
- When there is a visible surface, take captures at the mobile viewport in French
  and English, publish them on `refs/pr-evidence/<N>` with the commands in that
  section, and embed them right after the card as pairs: one level 3 title per
  screen and language, then a two-column table with `**BEFORE**` on the left and
  `**AFTER**` on the right, `new` in the left cell for a new screen. Never list
  all the "before" captures and then all the "after" captures. Read the
  description back and confirm every image address loads.
- **Your action** is `Nothing, you can merge`, or `To test` with the preview link
  (and the QR image for a venue journey), at most four numbered steps and what the
  founder should see. On a draft it is `Nothing yet, still a draft` unless a test
  is wanted now.
- **Review** says who reviewed and the verdict (see "The review" below). On a draft
  not yet reviewed it is `Pending`.
- Fill `Not verified` honestly; write `Nothing` only when that is true.
- Rewrite the card whenever a push changes what it says: a stale CI result or a
  stale capture is a wrong card.

## WIP preview or checkpoint

4. Run checks proportionate to the work. The full lint+build gate is not required for
   a checkpoint, but report exactly what was and was not verified. Do not push a
   knowingly broken or unintended state.
5. Commit only the intended changes with a conventional message (`feat:`, `fix:`,
   `refactor:`, `docs:`, `chore:`), never mentioning an AI assistant, then push the
   current branch. A branch push is sufficient for its Vercel preview.
6. If the user wants shared PR visibility, create a **draft** PR into `main`
   (`gh pr create --draft --base main` with the founder card as its body) or update
   the existing draft. Link the issue with `Closes #N` when there is one. Never convert the PR to Ready in this path.
   If an existing PR is already Ready, do not convert it back to draft implicitly;
   report the mismatch and ask before changing its review state.
7. Leave the task card **In progress**. A pushed branch or draft PR is shared WIP for
   previews, testing, and early feedback; it must not be merged.

## Final delivery

4. Run relevant local checks for the changed behavior. Do not require a complete
   local lint/logic/build/E2E rerun before every push: final delivery relies on the
   scoped hosted gate in `docs/workflow.md`. Documentation gets lightweight checks;
   verified dictionary copy gets lint, logic and build; application changes get
   the common arrival-to-chat journey plus affected suites; transversal or unknown
   changes get the full suite. Inspect the CI scope summary and expand coverage
   when the known impact exceeds the automatic mapping. Never dispatch a manual
   full run as part of shipping: the nightly run on `main` is the full safety net,
   and manual full runs are for bar tests, milestones or an explicit founder
   request. Do not ship a known red
   branch or treat unavailable tests as an intentional scope exemption. If the
   schema changed, remind the user that applying it to the shared DB remains
   founder-gated. This skill never applies migrations.
5. For a user-facing UI diff, verify the states in `docs/workflow.md` on the deployed
   Vercel preview at the target viewport. The verification may be performed by the
   agent with a real browser or confirmed by the founder after a WIP preview. Record
   who inspected it and what was covered. If the preview, browser, or device-level
   inspection is unavailable, report the gap and keep the PR in draft; do not continue
   to Ready for review. Automated checks alone are not visual approval.
6. Commit only the intended changes with a conventional message (`feat:`, `fix:`,
   `refactor:`, `docs:`, `chore:`), never mentioning an AI assistant, then push the
   current branch.
7. Create a draft PR into `main` if none exists, or update the existing PR, with
   the founder card as the opening of its description. Link the issue with
   `Closes #N`. Inspect the whole-PR scope and Actions summaries.
   Every push runs the scoped browser coverage, draft or not; a new push cancels
   the previous run of the same PR. Docs/copy-only scopes retain their documented
   exemptions. Wait for the two required checks on the current head/base. Once
   they are green and any preview review is complete, run "The review" below,
   update the card's Proof, Review and Your action lines with the real result, then
   run `node scripts/review-trace.mjs <N> --as-ready`: it judges the draft as if it
   were Ready, so the founder is never notified of a pull request the check then
   refuses. Fix what it names. Only when it passes, run `gh pr ready`; it does not
   start another CI run. Confirm fresh scoped execution, or a verified reuse
   link whose `CI evidence v1` covers the scope (a reused summary means tests were
   **not executed again**). A test listed as flaky (passed on retry) does not block;
   capture it on the board. On a real failure follow the PR failure policy in
   `docs/workflow.md`: fix and push when it is in the PR's area; for an unrelated
   failure, reproduce the spec locally, capture it and ask the founder. Never rerun
   the whole suite to clear it. If promotion validation fails/is unavailable, restore draft and report
   the gap; the card remains `In progress`. New code on an already-ready PR needs
   its own completed scoped validation. If `main` moved, do nothing: the
   merge queue tests the PR on the latest `main` when the founder merges it, so a
   green PR that is behind is ready as it is. Update the branch from `main` only
   when GitHub reports a conflict; that update and its run need no approval. Never
   add a PR to the merge queue yourself. Any other long rerun
   (after a failure, manual dispatch, suspected flaky test) still needs approval;
   never modify protections or use `[skip ci]` to bypass this requirement.
   Only successful validation and confirmed non-draft state mean review is requested.
8. **Only after GitHub confirms the PR is Ready**, move its single board card to
   **In review**. If making the PR Ready or updating the board fails, report the exact
   partial state and do not claim shipping is complete. Two card cases:
   - **PR linked to an issue** (`Closes #N`): the issue is already the card (auto-added
     to `Inbox` at creation). Move *that* card to **In review**. Do **not** add the PR
     as a second card — the board does not merge them, so that creates a duplicate.
     Merging later auto-moves the issue card to **Done** via `Closes #N`.
   - **PR with no issue** (trivial/already-decided work): add the **PR itself** as the
     card and set its fields:
     `item=$(gh project item-add 1 --owner getamourette --url <PR_URL> --format json | jq -r .id)`,
     then `gh project item-edit` to set **Status: In review**, plus `Kind`/`Area`
     (resolve field/option ids as in `/task`), and `gh pr edit <N> --add-assignee
     <login>` for the avatar. Merging later moves it to **Done**.

## The review (final delivery, before Ready)

Every pull request is reviewed before the founder reads it (`AGENTS.md`,
"Automatic review"; detail in `docs/workflow.md`, "Automatic review"). This step
is the same whatever started the session and whichever provider runs it.

1. **Request the hosted reviewer**, once the required checks are green and while
   the pull request is still a draft: `gh pr comment <N> --body "@codex review"`.
   Note the time.
2. **Wait, with a limit.** Check every minute or two for a review from
   `chatgpt-codex-connector[bot]` newer than the request:
   `gh api repos/getamourette/amourette-webapp/pulls/<N>/reviews`; its remarks
   are the inline comments in `pulls/<N>/comments`. Its thumbs-up in
   `issues/<N>/reactions` is also a verdict (nothing to flag). Its status comment
   in `issues/<N>/comments` says `Running` first: that is not a verdict. It
   usually answers within two minutes. Stop waiting as soon as it answers with a
   usage-limit or setup message, or 15 minutes after the request. Never wait
   longer and never skip the review because it is slow.
3. **Fallback: local review.** When the hosted review did not come, start a
   fresh-context reviewer that receives only `git diff origin/main...HEAD` and the
   `Code Review Rules` section of `AGENTS.md`, not this conversation. Use whichever
   provider still has quota, the other one than yours when both do:
   `codex review --base origin/main` (it reads the rules itself and takes no
   instructions with `--base`), `claude -p "<instructions>"`, or a subagent
   started without the conversation. Ask for serious issues only,
   each with file and line, or `No blocking remark`. Post the result with
   `gh pr comment <N> --body-file <file>`; the first line of the file is exactly
   `<!-- review-trace: local -->`, then why the hosted reviewer did not come, the
   reviewed commit and the remarks. Never name an assistant or model in it.
4. **Settle every remark.** Fix the real ones; reply to the others in their thread
   with the reason they are dismissed. After pushing fixes and getting green
   checks, request one second review (steps 1 to 3). Never a third: what is still
   open goes on the Review line for the founder.
5. **Write the Review line** with one of the three fixed openings:
   `Hosted reviewer: 3 remarks, 2 fixed, 1 dismissed (reason in the thread).`,
   `Local fallback (hosted reviewer out of quota): no blocking remark.`, or
   `None: <reason>` when no review could run at all (then say it under
   `Not verified` too). The `Review trace` check compares this line with what is
   really on the pull request.

## Never

Never merge a PR or delete a branch (cleanup is `standup`'s job). Never present a
draft PR as merge-ready.
