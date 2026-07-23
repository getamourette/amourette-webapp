---
name: ship
description: Push work on the current Amourette branch. Use for final delivery requests such as /ship, ship, ship it, ready for review, or open the finished PR, and for WIP requests such as push for Vercel, preview, checkpoint, or open a draft PR. Classifies the user's intent; final delivery runs the full gate, makes the PR Ready for review, and moves the card to In review, while WIP pushes optionally create or update a draft PR and leave the card In progress. Never merges or deletes branches. Works the same under Claude Code and Codex.
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
   how we work), append it to `docs/decisions.md` with the date and the *why*. If a
   bloc changed status, update `docs/roadmap.md`. Ask if unsure rather than skip.
2. Inspect the worktree and identify only the intended changes. Never push straight
   to `main`.

## WIP preview or checkpoint

3. Run checks proportionate to the work. The full lint+build gate is not required for
   a checkpoint, but report exactly what was and was not verified. Do not push a
   knowingly broken or unintended state.
4. Commit only the intended changes with a conventional message (`feat:`, `fix:`,
   `refactor:`, `docs:`, `chore:`), never mentioning an AI assistant, then push the
   current branch. A branch push is sufficient for its Vercel preview.
5. If the user wants shared PR visibility, create a **draft** PR into `main`
   (`gh pr create --draft --base main --fill`) or update the existing draft. Link the
   issue with `Closes #N` when there is one. Never convert the PR to Ready in this path.
   If an existing PR is already Ready, do not convert it back to draft implicitly;
   report the mismatch and ask before changing its review state.
6. Leave the task card **In progress**. A pushed branch or draft PR is shared WIP for
   previews, testing, and early feedback; it must not be merged.

## Final delivery

3. Run `npm run lint` and `npm run build`; do not ship a red branch. If the schema
   changed, remind the user that applying the migration to the shared DB is
   founder-gated. This skill never applies it.
4. Commit only the intended changes with a conventional message (`feat:`, `fix:`,
   `refactor:`, `docs:`, `chore:`), never mentioning an AI assistant, then push the
   current branch.
5. Create a PR into `main` if none exists, or update the existing PR. Link the issue
   with `Closes #N` when there is one. If it is a draft, run `gh pr ready`; then verify
   GitHub reports it as non-draft. A non-draft PR is the explicit signal that the work
   is complete, review is requested, and it may be merged under the repository's
   self-merge and required-review exceptions.
6. **Only after GitHub confirms the PR is Ready**, move its single board card to
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

## Never

Never merge a PR or delete a branch (cleanup is `standup`'s job). Never present a
draft PR as merge-ready.
