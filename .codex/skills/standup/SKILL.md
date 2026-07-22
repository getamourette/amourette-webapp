---
name: standup
description: Start-of-work briefing for the Amourette repo. Use when the user says /standup, standup, catch me up, where are we, what changed, or begins a work session. Reports what merged into main, new decisions, active branches, the other founder's open PRs, and remaining work on the shared project board, then offers to clean up merged local branches. Read-only except the optional cleanup, which always confirms first. Works the same under Claude Code and Codex.
---

# Standup

Run this when you sit down to work, so you see what changed while you were away
before touching anything. Read-only, except an optional branch cleanup at the end
that always confirms first.

## What it reports

1. **Merged into `main`.** Fetch, then list what `origin/main` has that your local
   `main` does not yet, plus recently merged PRs (`gh pr list --state merged`).
2. **New decisions.** The latest entries in `docs/decisions.md`, newest first, so a
   decision the other founder logged does not get missed.
3. **Branches.** Local and remote active branches. Flag new ones, ones that drifted
   behind `main`, and ones whose upstream is gone (merged and deletable).
4. **The other founder's open PRs.** List open PRs awaiting your review
   (`gh pr list --state open`). Prompt to clear these *before* starting new work: on
   an async two-timezone team, merging what is ready first keeps `main` moving and
   avoids conflicts. Agreed start-of-session ritual, not optional.
5. **Remaining work — the board is the source of truth.** Read the shared GitHub
   Project (`gh project item-list 1 --owner getamourette`, board at
   https://github.com/orgs/getamourette/projects/1). Surface what needs attention:
   **In review** items waiting on you, then **In progress**, then **Ready**, plus the
   **Inbox** pile to triage. Sort **by Owner** (yours first, then grabbable, then the
   other founder's collapsed) and **by Area** within each group. If the board is
   unreachable, fall back to `gh issue list` and say so.

Present it clearly: short scannable sections, not a wall of text.

## Optional cleanup (always confirm)

After the report, if there are local branches already merged into `main` or whose
upstream is gone, offer to delete them. Show the exact list first and wait for a go.
If a branch lives in a worktree, remove the worktree too, and never force-remove one
that has uncommitted changes without explicit approval.

## Never

Never touch `main` history, never merge, never delete anything without showing it
first.
