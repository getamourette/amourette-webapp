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
- **`/ship` moves the card** to `In review` when it opens your PR, and merging moves it
  to `Done` automatically. The card follows the work instead of needing manual
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
| `In progress` | Someone is actively building it | The **agent**, when it branches to start (not you, by hand) |
| `In review` | A PR is open, awaiting the other founder's eyes | `/ship`, when the PR opens |
| `Done` | Merged and shipped | GitHub (auto, when the PR's `Closes #N` fires) |
| `Backlog` | Real, but not to be done now — parked | A human, at triage |

Two things to note about the columns:

- **`Backlog` is deliberately the far-right column, out of the daily view.** It is not
  a step *between* `Inbox` and `Ready` — triage routes an item to `Ready` (do it soon)
  *or* `Backlog` (real, but not now). You park things there so they stop competing for
  attention every day; you go looking for them, they don't come to you.
- **You never drag a card to `In progress` yourself.** When you pick a `Ready` item and
  tell the agent to start, the agent cuts the branch *and* moves the card. The card
  follows the branch, not your memory.

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

### Owner — who takes it

`Marwane` or `Aymane`. Ownership is **per-item, not per-area** — `Area` is only a
filter, it does not assign anyone. An unowned item is grabbable; the person who picks
it up sets themselves as Owner.

### Priority — how urgent

`P0` (drop everything) / `P1` (soon) / `P2` (eventually). Left unset until someone
decides it matters; not every item needs a priority.

---

## The three skills

You drive the workflow with three skills. They work identically under Claude Code and
Codex — say the slash command to either agent.

- **`/task`** — *capture*. Give it a title; it infers `Kind`/`Area`/`Owner`/`Priority`
  from what you said, decides whether it should be a real issue (actionable, will get a
  branch) or a draft item (a question/idea/op), creates it, and sets the fields. You
  can also hand it the full spec explicitly. This is how anything gets onto the board.
- **`/standup`** — *start of session*. Read-only briefing: what merged into `main`,
  new decisions, active branches, **the other founder's open PRs waiting on you**, and
  the remaining board work sorted so yours is on top. It ends by offering to clean up
  local branches that are already merged. Run it every time you sit down.
- **`/ship`** — *end of a unit of work*. Updates docs if the session produced a
  decision, runs the lint+build gate, commits with a conventional message, pushes, and
  opens (or updates) a **draft PR** into `main` with `Closes #N`. It moves the card to
  `In review`. It never merges and never deletes branches — those stay human.

---

## The life of a task

```
CAPTURE → TRIAGE → START → WORK → SHIP → REVIEW → MERGE → CLEANUP
```

1. **Capture** — `/task` (or a new GitHub issue) lands the item in `Inbox`.
2. **Triage** — set `Kind`/`Area`/`Owner`/`Priority` and move it to `Ready` (on the fly
   or at the weekly). This is a human decision.
3. **Start** — `/standup` first: clear the other founder's ready PRs, then grab a
   `Ready` item that is yours. When you tell the agent to start it, the agent cuts a
   `feature/…` or `fix/…` branch from an up-to-date `main` and moves the card to
   `In progress` for you.
4. **Work** — build it on the branch.
5. **Ship** — `/ship`: log any decision to `docs/decisions.md`, pass the gate, push,
   open a draft PR with `Closes #N`. The card goes to `In review`.
6. **Review** — the other founder reads the PR (see the merge rule below).
7. **Merge** — squash-and-merge. `Closes #N` fires, so the card auto-moves to `Done`.
8. **Cleanup** — `/standup` in a later session offers to delete the merged branch.

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

We are in the dev phase with zero real users, so **you may self-merge your own PR** —
review is encouraged but non-blocking, and neither founder is ever stuck waiting across
the timezone gap.

**Two kinds of PR are the exception and need the other founder's eyes before merge,
even at zero users:**

1. **Schema / migration changes.** A bad migration on the single shared DB is expensive
   to unwind and affects the other founder immediately.
2. **Anything touching a product invariant** — discreet double opt-in, no open DM,
   women-first safety, or PII/RLS handling. These are the red lines the whole trust
   model rests on; a regression here is not worth the speed.

For those two, wait for review. For everything else, ship and merge.

**Start-of-session ritual:** before opening new work, clear the other founder's open
PRs. On an async two-timezone team, a PR that sits unreviewed while the other person
builds on a moving `main` is exactly how avoidable conflicts and schema drift creep in.
Reviewing the other's PR is the guard-rail, not busywork — and it is `/standup`'s job to
put those PRs in front of you.

---

## Day to day, and the weekly

- **Daily:** open with `/standup`, clear pending reviews, pick a `Ready` item, branch,
  build, `/ship`. Capture anything new that surfaces with `/task` the moment you think
  of it, so it never lives only in your head.
- **Weekly:** a triage pass over the board — drain `Inbox` (set `Kind`/`Area`/`Owner`/
  `Priority`, move real work to `Ready` or `Backlog`), revisit open `question` items,
  and sanity-check priorities. This is also when raw ideas either become `Ready` work
  or get dropped.

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
