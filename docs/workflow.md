# How we work

This is the human guide to how Aymane and Marwane run Amourette day to day: where
work is tracked, how it is labelled, and how a task travels from an idea to merged
code. It is meant to be read once, start to finish, and then kept nearby.

The short version: **the GitHub Project board is the single source of truth for
remaining work, and it is always current.** If a piece of work is not on the board,
it does not exist as far as the team is concerned. Everything below serves that one
rule.

- **Board:** https://github.com/orgs/getamourette/projects/1 (`Amourette`, org
  `getamourette`).
- **The engineering contract** (invariants, stack, conventions) lives in `AGENTS.md`.
  `CLAUDE.md` just imports it, so Claude Code and Codex share the exact same rules.
- **Decisions** get logged in `docs/decisions.md`; the **narrative roadmap** is
  `docs/roadmap.md` and points at the board rather than duplicating its task list.

---

## The board is the source of truth

We are two founders coding across a ~6h Paris/New-York gap, with two different agents
(Claude Code and Codex). The only way that does not fork into two private backlogs is
to have one place that is unambiguously current. That place is the board.

What keeps it current, in practice:

- **New issues auto-add** to the board in `Inbox`, so code work lands there without
  anyone remembering to.
- **The `/task` skill** puts everything else on the board (ideas, questions, ops) in
  one step, so there is no friction excuse to keep a task in your head.
- **`/standup` reads the board** at the start of every session, so you are always
  looking at the live state before you touch anything.
- **`/pick` moves the card** to `In progress` when you start a task: it grabs a `Ready`
  item, cuts the branch, and sets up its worktree, so the board reflects what you are
  actually building.
- **`/ship` moves the card** to `In review` only after the PR is marked Ready for
  review, and merging moves it to `Done` automatically. A preview/checkpoint push or
  draft PR stays `In progress`. The card follows the work instead of needing manual
  bookkeeping.
- **Personal to-do tools stay personal.** Marwane's Todoist (or anyone's) is private
  scratch that *feeds* the board. It is never authoritative for shared work — if it
  matters to the team, it goes on the board.

The board holds **everything shared, not just code**: bugs, features, design, infra,
and non-code ops (marketing, legal, business, venue outreach). A task with nowhere
else to live goes on the board with `Area: ops`. There is deliberately no second
place to look.

---

## The labels

Every item carries five fields. Two of them (`Kind` and `Area`) are fixed vocabularies
so that both founders and both agents label the same thing the same way.

### Status — where the item is in its life

Moves left to right. **Who moves the card matters**, so nobody wonders whether a card
is stale:

| Status | Meaning | Who moves it here |
|---|---|---|
| `Inbox` | Just captured, not triaged yet | GitHub (auto, on issue create) |
| `Ready` | Triaged and ready to be picked up | A human, at triage |
| `In progress` | Someone is actively building it | **`/pick`**, when it cuts the branch to start (not you, by hand) |
| `In review` | A non-draft PR is Ready for review | `/ship`, after GitHub confirms the PR is Ready |
| `Done` | Merged and shipped | GitHub (auto, when the PR's `Closes #N` fires) |
| `Backlog` | Real, but not to be done now — parked | A human, at triage |

Two things to note about the columns:

- **`Backlog` is deliberately the far-right column, out of the daily view.** It is not
  a step *between* `Inbox` and `Ready` — triage routes an item to `Ready` (do it soon)
  *or* `Backlog` (real, but not now). You park things there so they stop competing for
  attention every day; you go looking for them, they don't come to you.
- **You never drag a card to `In progress` yourself.** `/pick` cuts the branch *and*
  moves the card. The card follows the branch, not your memory.
- **A branch push or draft PR does not end active work.** It is a checkpoint for a
  Vercel preview, testing, or early feedback, so the card remains `In progress`.

### Kind — the nature of the work

- **`bug`** — something is broken or regressed.
- **`feature`** — a new user-facing capability.
- **`design`** — visual / DA / UX work.
- **`infra`** — technical work that is not a bug: a migration, CI, realtime plumbing,
  tooling.
- **`question`** — not yet decided, not yet actionable. Lives on the board so it is
  shared, not carried in one head (see below).
- **`chore`** — maintenance: tests, docs, dependency bumps, config, security
  hardening, cleanup.

### Area — where the work lives

- **`landing`** — pre-venue pages (`/`).
- **`onboarding`** — profile creation and editing.
- **`room`** — the live feed and presence.
- **`match-chat`** — the match reveal and chat.
- **`safety`** — user report / block / moderation.
- **`admin`** — founder tooling under `/admin`.
- **`design-system`** — DA, tokens, fonts, brand, shared visual components.
- **`platform`** — infra / devops / Supabase / DB / auth / Vercel / CI / i18n.
- **`ops`** — non-code work: marketing, legal, business, venue outreach.

**`Kind` and `Area` combine.** A broken profile editor is `Kind: bug` + `Area:
onboarding`. A security audit is `Kind: chore` + `Area: platform`. Read `Kind` as
"what sort of work" and `Area` as "which part of the product".

### Assignee — who takes it

The native GitHub **`Assignee`** (`Marwane` or `Aymane`), so each person's avatar shows
on the card and it works on both issues and draft items. Ownership is **per-item, not
per-area** — `Area` is only a filter, it does not assign anyone. An unassigned item is
grabbable; the person who picks it up assigns themselves.

### Priority — how urgent

`P0` (drop everything) / `P1` (soon) / `P2` (eventually). Left unset until someone
decides it matters; not every item needs a priority.

---

## The four skills

You drive the workflow with four skills, one per stage of a task's life: capture,
start of session, start of a task, and end of a unit of work. They work identically
under Claude Code and Codex — say the slash command to either agent.

- **`/task`** — *capture*. Give it a title; it infers `Kind`/`Area`/`Assignee`/`Priority`
  from what you said, decides whether it should be a real issue (actionable, will get a
  branch) or a draft item (a question/idea/op), creates it, and sets the fields. You
  can also hand it the full spec explicitly. This is how anything gets onto the board.
- **`/standup`** — *start of session*. Read-only briefing: what merged into `main`,
  new decisions, active branches, **the other founder's Ready-for-review PRs waiting
  on you**, draft PRs shown separately as active WIP, and the remaining board work
  sorted so yours is on top. It ends by offering to clean up local branches only when
  an exact-head PR is merged and the linked board item is no longer active. Run it
  every time you sit down.
- **`/pick`** — *start of a task*. Give it a task (or let it list your pickable
  `Ready` items). It converts a draft to a real issue if needed, moves the card to
  `In progress`, assigns it to you, and cuts a `feature/…`/`fix/…` branch in its own
  **worktree** (created with `.env.local` and deps, or reused if it exists). It ends by
  handing you a ready-to-run command that launches a fresh agent briefed with the task.
  That agent reads the issue, then waits for you to discuss the approach (or enter plan
  mode) — it does not start building on its own. `/pick` never writes code; it only sets
  the stage.
- **`/ship`** — *end of completed work*. Updates docs if the session produced a
  decision, runs the lint+build gate, commits with a conventional message, pushes,
  opens or updates the PR with `Closes #N`, marks it **Ready for review**, then moves
  the card to `In review`. Contextual requests to push for a Vercel preview,
  checkpoint, or draft PR use the same skill's WIP path: they push with proportionate
  checks, optionally create/update a draft PR, and leave the card `In progress`.
  It never merges and never deletes branches — those stay human.

---

## The life of a task

```
CAPTURE → TRIAGE → START → WORK → SHIP → REVIEW → MERGE → CLEANUP
```

1. **Capture** — `/task` (or a new GitHub issue) lands the item in `Inbox`.
2. **Triage** — set `Kind`/`Area`/`Assignee`/`Priority` and move it to `Ready` (on the fly
   or at the weekly). This is a human decision.
3. **Start** — `/standup` first: clear the other founder's ready PRs. Then `/pick`:
   it grabs a `Ready` item, cuts a `feature/…` or `fix/…` branch from an up-to-date
   `main` in its own worktree, and moves the card to `In progress` for you.
4. **Work** — build it on the branch.
5. **Preview/checkpoint when needed** — ask to push for Vercel, checkpoint, or open a
   draft PR. The branch becomes testable and shareable, but the work and card remain
   `In progress`; a draft PR must not be merged.
6. **Ship** — `/ship`: log any decision to `docs/decisions.md`, pass the final gate,
   push, open or update the PR with `Closes #N`, and mark it Ready for review. Only
   after GitHub confirms that state does the card go to `In review`.
7. **Review** — the other founder reads the PR when required or available (see the
   merge rule below).
8. **Merge** — squash-and-merge. `Closes #N` fires, so the card auto-moves to `Done`.
9. **Cleanup** — `/standup` in a later session offers to delete the merged branch
   after proving that a merged PR used that exact branch and the board no longer says
   `In progress`.

### Safe branch and worktree cleanup

A branch is not proven finished merely because its worktree is clean, its current
commit is already in `main`, or its remote upstream is gone. A newly prepared branch
can be clean and point at `main` before its first change; after a squash merge, the
original branch tip may not be an ancestor of `main`. Those Git signals are useful
diagnostics, not deletion authority.

`/standup` classifies a local branch as safely deletable only when all of these hold:

1. the worktree has no tracked or untracked changes;
2. GitHub has a merged PR whose `headRefName` exactly matches the branch;
3. the linked board item is not `In progress` (normally it is `Done`);
4. the founder confirms the exact worktree and branch names shown with that evidence.

If there is no exact merged PR, the board still says `In progress`, or any signal
disagrees, the worktree is preserved. The agent reports it as ambiguous and asks
whether the work is intentionally abandoned; it never upgrades ancestry, a gone
upstream, or a broad "clean everything" request into proof that the task shipped.

**The one link that matters is `Closes #N` in the PR body** — that is what ties the
work to its board item and auto-closes it on merge (`/ship` writes it for you). A
branch or commit that mentions `#N` is nice traceability but does nothing on its own.

---

## Draft items vs real issues

- A **real issue** is actionable code work that will get a branch and a PR. It is a
  GitHub issue (so `Closes #N` can link the PR) and auto-lands in `Inbox`.
- A **draft item** is a board-only card with no GitHub issue behind it: a question, a
  raw idea, or a non-code op. It keeps the issue tracker clean.
- **Every issue is a board item, but not every board item is an issue.** You *convert*
  a draft to a real issue the moment someone picks it up and needs a branch, so the
  work can be linked with `Closes #N`.

### When an issue gets created, and by whom

You almost never open a GitHub issue by hand — `/task` decides and does the mechanics.
The rule:

- **Clearly actionable code work → real issue, at capture.** If when you capture it you
  already know it will get a branch and a PR (a bug, a scoped feature), `/task` opens
  the issue now. It lands in `Inbox`.
- **Question / idea / non-code op → draft item, no issue.** It stays a board-only card
  until someone picks it up. Then it is **converted** to a real issue at that moment
  (that is when it earns its `#N` for `Closes #N`).
- **Trivial one-off (a typo, a tiny copy fix) → no issue at all.** Just branch, PR,
  merge. Issues are for work worth tracking or discussing, not for everything.

So: capture with `/task`, let it pick issue-vs-draft, and only real work that will be
branched ever becomes an issue.

### Questions live on the board

A product question you have not settled is `Kind: question`, on the board, not in your
head or a DM. That way the other founder sees it too — it is captured as a draft item.

**Where it sits while open:** parked in `Backlog`, so it stays out of the daily view but
is always findable in the **Questions** view (filter `Kind: question`). It does not
clutter `Ready`, because a question is not work yet.

**How it gets resolved:**

- **By default, at the weekly triage** — you walk the open questions together and
  settle them.
- **By a direct ping if it is urgent** (it blocks work now). Don't wait for the weekly
  for a P0/P1 question; message the other founder, but keep the item on the board so the
  outcome is recorded, not lost in a chat.

**What resolving it produces:** the question turns into either a **task** (if it implies
work — capture it with `/task`) **or** an entry in **`docs/decisions.md`** (if it is a
call we made and want to remember the *why* of). Then the question item is closed. A
question never just evaporates — it becomes a task or a decision.

---

## Merging: self-merge, with two exceptions

We are in the dev phase with zero real users, so **you may self-merge your own PR once
it is marked Ready for review** — review is encouraged but non-blocking, and neither
founder is ever stuck waiting across the timezone gap. A draft PR is never mergeable.

**Two kinds of PR are the exception and need the other founder's eyes before merge,
even at zero users:**

1. **Schema / migration changes.** A bad migration on the single shared DB is expensive
   to unwind and affects the other founder immediately.
2. **Anything touching a product invariant** — discreet double opt-in, no open DM,
   women-first safety, or PII/RLS handling. These are the red lines the whole trust
   model rests on; a regression here is not worth the speed.

For those two, wait for review. For everything else, ship and merge.

**Start-of-session ritual:** before opening new work, clear the other founder's PRs
marked Ready for review. Draft PRs remain visible as WIP for optional testing and
feedback, but they are not review requests. On an async two-timezone team, ready work
that sits unreviewed while the other person builds on a moving `main` is exactly how
avoidable conflicts and schema drift creep in. Reviewing ready work is the guard-rail,
not busywork — and it is `/standup`'s job to put those PRs in front of you.

---

## Day to day, and the weekly

- **Daily:** open with `/standup`, clear pending reviews, `/pick` a `Ready` item,
  build, `/ship`. Capture anything new that surfaces with `/task` the moment you think
  of it, so it never lives only in your head.
- **Weekly:** a triage pass over the board — drain `Inbox` (set `Kind`/`Area`/`Assignee`/
  `Priority`, move real work to `Ready` or `Backlog`), revisit open `question` items,
  and sanity-check priorities. This is also when raw ideas either become `Ready` work
  or get dropped.

### Shared QA rooms

The shared development database has two permanent test venues: `/v/test-crowded`
contains synthetic profiles for scroll/match testing, while `/v/test-empty` exercises
the waiting state. They stay live across the 06:00 rollover and never appear in
founder analytics.

Each founder configures the server-only `SUPABASE_SERVICE_ROLE_KEY` and their own
`QA_TESTER_PROFILE_ID` in the main checkout's `.env.local`; `/pick` copies that file
into future worktrees. The profile UUID is local to that founder's browser identity,
not a shared team value. It persists across venue scans on that browser, but changes
if its anonymous session is cleared or another browser/device is used.

Run `npm run seed:test-venues` to reset both test rooms, create the 36 synthetic
profiles, and prepare Maya's pre-like for the locally configured tester. Pass
`--tester-profile-id <UUID>` to override the local default, or use `clear` to remove
the synthetic state while leaving both venues available.

The Supabase development database is shared: every seed/reset replaces the test-room
state for both founders. Coordinate before running it when the other founder may be
testing. The command is test-only, refuses to clear a venue not explicitly marked as
test, and must never be pointed at a real venue.

---

## Worked examples

How real tasks get labelled, and whether they are a draft or a real issue:

| Task | Kind | Area | Draft or issue |
|---|---|---|---|
| "Profile editing doesn't save" | `bug` | `onboarding` | issue |
| "Redesign the room grid layout" | `design` | `room` | issue |
| "Full security audit of the app" | `chore` | `platform` | issue |
| "Write the e2e tests" | `chore` | `platform` | issue |
| "Add the ability to unlike" | `feature` | `room` | issue |
| "Create the Instagram + TikTok accounts" | `chore` | `ops` | issue (non-code) |
| "Privacy policy / GDPR compliance" | `chore` or `question` | `ops` | issue (or draft if still undecided) |
| "Landing page: what do we put on it?" | `question` | `landing` | draft |
| "Supabase US vs EU region?" | `question` | `platform` | draft |
| "Put the right logo everywhere" | `design` | `design-system` | issue |

Read across: `Kind` is the sort of work, `Area` is the part of the product, and the
draft/issue call is simply "is someone about to branch on it?" — questions and raw
ideas stay drafts until the answer is yes.
