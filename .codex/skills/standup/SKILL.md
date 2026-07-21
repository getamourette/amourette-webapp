---
name: standup
description: Start-of-work briefing for the Amourette repo. Use when the user says /standup, standup, catch me up, where are we, what changed, or begins a work session. Reports what merged into main, new decisions, active branches, and remaining issues, then offers to clean up merged local branches. Read-only except the optional cleanup, which always confirms first. Works the same under Claude Code and Codex.
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
4. **Remaining work.** Open issues, sorted **by ownership first** (assigned to you,
   then unassigned and grabbable, then the other founder's, collapsed), and **by
   area label** within each group (`gh issue list`). If the GitHub Project board is
   not set up yet, say so and skip this section instead of erroring.

Present it clearly: short scannable sections, not a wall of text.

## Optional cleanup (always confirm)

After the report, if there are local branches already merged into `main` or whose
upstream is gone, offer to delete them. Show the exact list first and wait for a go.
If a branch lives in a worktree, remove the worktree too, and never force-remove one
that has uncommitted changes without explicit approval.

## Never

Never touch `main` history, never merge, never delete anything without showing it
first.
