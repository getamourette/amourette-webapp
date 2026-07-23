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
   behind `main`, and ones whose upstream is gone. Treat those as diagnostic signals,
   never as proof that the named work is merged or deletable.
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

Classify a local branch as safely deletable only when all of these are true:

1. Its worktree is clean, including untracked files.
2. GitHub has a merged PR whose `headRefName` exactly matches the local branch name.
3. The linked board item is not `In progress` (normally it is `Done`).

For every cleanup candidate, show the branch and worktree names, the exact merged PR,
the board status, and the clean-worktree result. Then wait for confirmation of that
exact list. If a branch lives in a worktree, remove the worktree too, and never
force-remove one that has uncommitted changes without explicit approval.

A branch tip contained in `main`, a clean worktree, or a gone upstream is not proof of
completion. A freshly prepared branch can be clean and still point at `main`; squash
merges can also make ancestry misleading. If there is no exact merged PR, the board
still says `In progress`, or any signals disagree, preserve the branch and label it
**Ambiguous — keep**. Ask separately whether the founder intentionally wants to
abandon it; never include it in a broad cleanup confirmation.

## Never

Never touch `main` history, never merge, never delete anything without showing its
evidence first. Never describe a branch as merged based only on ancestry, cleanliness,
or upstream state.
