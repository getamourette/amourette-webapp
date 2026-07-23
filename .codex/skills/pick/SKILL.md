---
name: pick
description: Start work on a task from the Amourette board. Use when the user says /pick, pick a task, start on something, grab a task, or what should I work on. Lists pickable board items, converts a chosen draft to a real issue if needed, moves it to In progress, assigns it, then ensures a worktree (reuse or create with env + deps) and hands off a ready-to-run launch command. Never writes code, never merges. Works the same under Claude Code and Codex.
---

# Pick

The middle of the trio: `standup` (see what changed) → **`pick` (start on a task)** →
`ship` (push it). Run it once you have decided what to work on. It takes one board
item from "I might do this" to "there is a branch, a worktree, and an agent primed to
work on it", moving the card to **In progress** on the way — the step the contract
already asks for (*"the agent moves Ready → In progress when it cuts the branch"*).

Never writes code and never merges. It sets the stage; the work happens in the session
it hands off to.

## 1. Offer the pickable tasks

Read the shared board (`gh project item-list 1 --owner getamourette --limit 500
--format json`, board at https://github.com/orgs/getamourette/projects/1) and present a
short, ranked list to choose from. Always pass `--limit` (default is 30): the active
board (`Inbox` plus `Backlog` plus `Done`) already exceeds that, so a `Ready` item can
otherwise fall outside the window and be silently missed. The same applies whenever you
resolve a board item id.

1. **Your `In progress`** first (resume something already started).
2. **Your `Ready`** (assigned to you, do-soon).
3. **Grabbable `Ready`** (unassigned) — picking one assigns it to you.

Sort by `Priority` then `Area` within each group. Show number/title, Kind, Area,
Assignee. If the user already named the task, skip the list and match it. If the board
is unreachable, fall back to `gh issue list` and say so.

## 2. Make sure it is a real issue

A branch needs an issue so `Closes #N` can link the PR later.

- **Already an issue:** use its number.
- **Draft item:** convert it before cutting a branch. Create the issue
  (`gh issue create --repo getamourette/amourette-webapp --title "…" --body "…"`,
  carrying over the draft's intent), then delete the now-duplicated draft from the
  board (`gh project item-delete`) so there is exactly one card. The new issue
  auto-adds to `Inbox`; you will set its fields in step 3.

## 3. Move it to In progress (and assign it)

Resolve ids at runtime; do not hardcode them (project id via
`gh project view 1 --owner getamourette --format json`; field + option ids via
`gh project field-list 1 --owner getamourette --format json`).

- Set **Status → In progress** with `gh project item-edit --project-id <PROJECT_ID>
  --id <ITEM_ID> --field-id <STATUS_FIELD_ID> --single-select-option-id <IN_PROGRESS_ID>`.
  If it is already In progress (a resume), leave it.
- If the item was **grabbable** (unassigned), assign it to the user:
  `gh issue edit <N> --repo getamourette/amourette-webapp --add-assignee <login>`
  (`Marwane` = `marwaneazzouzi`, `Aymane` = `AymaneSghier`). Never reassign a card that
  already belongs to the other founder — flag it and stop instead.
- If a freshly converted draft is missing `Kind`/`Area`, carry them over from the draft
  (resolve field/option ids as in `/task`).

## 4. Ensure the branch and worktree

One task = one branch = one worktree, so parallel agents never collide and `main` stays
clean. Derive paths portably — never hardcode a home path.

- **Repo root:** `git rev-parse --show-toplevel`. **Worktree dir:** `<repo-root>--<slug>`
  where `<slug>` is the branch name with any `feature/`|`fix/` prefix stripped and every
  non-alphanumeric run collapsed to `-` (e.g. `feature/room-feed` →
  `<repo-root>--room-feed`).
- **Branch name:** `feature/…` or `fix/…` from the task's Kind (bug → `fix/`, else
  `feature/`), a short slug of the title. Confirm the name with the user if unsure.
- **If the worktree already exists** (`git worktree list`): reuse it. If the current
  session is already inside it, skip straight to step 5's "already here" path.
- **If it does not exist:** create it off up-to-date `main`, then make it runnable —
  this is what a fresh worktree lacks, since `.env*` and `node_modules` are gitignored:
  ```
  git fetch origin main
  git worktree add --no-track -b <branch> <worktree-dir> origin/main
  cp <repo-root>/.env.local <worktree-dir>/.env.local
  ( cd <worktree-dir> && npm install )
  ```
  `--no-track` matters: without it the branch's upstream is set to `origin/main`,
  which misleads `standup`'s drift/upstream detection and `git push`. The upstream is
  set correctly later by `ship` (`git push -u origin <branch>`).
  If `.env.local` is absent in the main checkout, say so (the user fills it from
  `.env.example`) rather than failing silently.

## 5. Hand off, primed but not launched

`pick` prepares the environment and briefs the next agent — it does **not** send it off
to build. The seeded agent reads the issue for context, then **stops and waits for the
founder**, who will discuss the approach, adjust scope, or enter plan mode before any
code is written. The running session cannot teleport into another directory, so end by
handing over cleanly.

- **Already inside the right worktree:** no launch needed — confirm the card is In
  progress and the branch is checked out, give a one-line summary of the task, and wait
  for the founder's direction. Do not start implementing.
- **Otherwise:** output one copy-paste block. Use the launcher for the current tool
  (`claude` under Claude Code, `codex` under Codex):
  ```
  cd <worktree-dir> && claude "We're picking up #<N> — <title>. Setup is done: branch <branch> is checked out here and the board card is In progress. Read the issue for context with: gh issue view <N> --repo getamourette/amourette-webapp — then stop and wait for me. We'll discuss the approach together before writing any code; do not start implementing or ship on your own."
  ```
  Keep the seed short: what the task is, that setup is done, where to read the detail,
  and the explicit instruction to wait for the founder rather than start working.

Then stop.

## Never

Never write code, cut corners on the gate, or merge — that is the next session's and
`ship`'s job. Never reassign or move another founder's card. Never hardcode project,
field, or path ids — resolve them at runtime. Never force-create a worktree over one
with uncommitted changes.
