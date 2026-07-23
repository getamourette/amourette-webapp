---
name: standup
description: Start-of-work briefing for the Amourette repo. Use when the user says /standup, standup, catch me up, where are we, what changed, or begins a work session. Reports what merged into main, new decisions, active branches, Ready-for-review PRs requiring action, draft PRs as WIP only, and remaining board work, then offers to clean up merged local branches. Read-only except optional cleanup, which always confirms first. Works the same under Claude Code and Codex.
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
4. **Open PRs, separated by review state.** Query enough PR metadata to inspect the
   draft flag (for example `gh pr list --state open --json number,title,url,author,isDraft`).
   Present the other founder's non-draft PRs first as **Ready for review** and prompt
   to clear them before starting new work: merging what is ready keeps `main` moving
   and avoids conflicts. Present draft PRs separately as **Active WIP**: testing and
   early feedback are welcome, but they are not awaiting formal review and must never
   be presented as merge-ready. Do not mutate stale board statuses during standup.
5. **Remaining work — the board is the source of truth.** Read the shared GitHub
   Project (`gh project item-list 1 --owner getamourette --limit 500`, board at
   https://github.com/orgs/getamourette/projects/1). Always pass `--limit`: the default
   of 30 is smaller than the active board, so cards fall out of view without it. Surface
   what needs attention:
   **In review** items waiting on you, then **In progress**, then **Ready**, plus the
   **Inbox** pile to triage. Sort **by Assignee** (yours first, then grabbable, then the
   other founder's collapsed) and **by Area** within each group. If the board is
   unreachable, fall back to `gh issue list` and say so. Treat PR state as authoritative
   for review readiness: `In review` is valid only for a non-draft PR; report any
   mismatch without silently fixing it.

Present it clearly: short scannable sections, not a wall of text.

## Optional cleanup (always confirm)

After the report, if there are local branches already merged into `main` or whose
upstream is gone, offer to delete them. Show the exact list first and wait for a go.
If a branch lives in a worktree, remove the worktree too, and never force-remove one
that has uncommitted changes without explicit approval.

## Never

Never touch `main` history, never merge, never delete anything without showing it
first.
