---
name: ship
description: Push the current branch's work on the Amourette repo. Use when the user says /ship, ship, ship it, push this, or open a PR. Updates docs if needed, runs the lint and build gate, commits, pushes, and handles the PR situationally (reuse an existing one, open a draft, or push with no PR). Never merges and never deletes branches. Works the same under Claude Code and Codex.
---

# Ship

Push the current branch's work. Run it when you are done, or when you just want to
push what you have. It does the right thing whether or not a PR already exists.

## Before pushing

1. **Docs.** Did this session produce a decision (architecture, data model, tooling,
   how we work)? Append it to `docs/decisions.md` with the date and the *why*, not
   just the *what*. Did a bloc change status? Update `docs/roadmap.md`. Ask if unsure
   rather than skip.
2. **Gate.** Run `npm run lint` and `npm run build`; do not push a red branch. If you
   changed the schema, remind the user the migration still has to be applied to the
   shared DB by them (founder-gated). This skill never applies it.

## Push

3. Commit with a conventional message (`feat:`, `fix:`, `refactor:`, `docs:`,
   `chore:`), never mentioning an AI assistant.
4. Push the current branch.

## The PR (situational)

5. If a PR already exists for this branch, the push updates it, done. If none exists
   and the user wants one, open a **draft** PR into `main`
   (`gh pr create --draft --base main --fill`), linking the issue with `Closes #N`.
   The draft PR is the shared radar with the other founder, open it early rather than
   at the end. If the user only wants to push WIP with no PR, stop after the push.

## Never

Never merge a PR, never push straight to `main`, never delete a branch (that is
`standup`'s job).
