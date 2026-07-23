<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Paramour

Live, in-bar dating app. Co-founded by Aymane (New York) and Marwane (Paris). Both founders code, with both Claude Code and Codex.

**North star (internal compass):** *Turn the fear of rejection into a painless match, right where people already are: the bar.*

**Public line:** *The app that gets people in the same bar to actually talk to each other.*

You scan a QR on the way into a venue, see who is checked in tonight, like discreetly, and a chat opens only if it is mutual. No public rejection, ever.

## Where things live

This file is the single source of truth for any agent. Codex reads `AGENTS.md` natively; `CLAUDE.md` just imports it, so Claude Code shares the exact same contract. Keep this file to durable things (vision, invariants, stack, conventions) so it does not rot.

- **`AGENTS.md`** (this file): the durable engineering contract. Rarely changes.
- **`docs/roadmap.md`**: current state and the phased plan. The living status doc, updated as work ships.
- **`docs/decisions.md`**: append-only log of architecture and collaboration decisions, shared between both founders.
- **`docs/workflow.md`**: the human guide to how we work (board, labels, skills, task lifecycle, merge rule). Read it once; the agent-facing rules are the "Task tracking" and "Git workflow" sections below.
- **Google Doc `Paramour - Vision & Strategy`**: full product vision and strategy.
- **Code + git history**: the actual truth of what is built. Docs are the human-readable layer on top.

**This is a living set of docs.** If during any work session you spot something wrong, a missing convention, a gotcha, or a decision worth recording, update the right file on the spot (a convention goes here, a status change in `docs/roadmap.md`, a decision in `docs/decisions.md`). Do not leave it for a separate cleanup pass.

## Logging decisions (do this without being asked)

When you and a founder reach a decision during a session, a choice about architecture, data model, tooling, dependencies, or how you work, **append it to `docs/decisions.md` before the session ends**, with the date and the *why*, not just the *what*. Do not wait to be told. If you are unsure whether something counts as a decision, ask the founder rather than skip it. Keeping this log current is part of the work; a decision that lives only in a chat is a decision lost to the other founder.

## The decision filter (read before any product choice)

Every feature, every shortcut, every line of code is checked against the north star and these five invariants. They are true from v1 to maturity. If a change weakens one of them, it does not ship.

1. **Live**: it is about who is *here, now*, not a database of singles to browse from your couch.
2. **In person first**: the product is a trigger to talk IRL, not a place to chat for weeks.
3. **Discreet double opt-in**: you like in secret, a chat unlocks *only* if it is mutual. No one is ever notified they were liked and not matched. **There is no open messaging.** This is a red line: open DMs drive women off the platform and kill the app.
4. **Ephemeral presence, persistent identity**: your profile is permanent, but your presence in a venue fades when you leave it.
5. **Women first**: safety and control are non-negotiable and gate every decision. If women do not feel safe and in control, the app dies.

When in doubt: *does this reduce the social friction of the first real-life contact?* Yes, consider it. No, drop it. This is the guard rail against the bright shiny object.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict).
- **Supabase**: Postgres + Auth + Storage + Realtime. Client in `lib/supabase.ts`.
- **Tailwind CSS 4** (via `@tailwindcss/postcss`).
- Path alias `@/*` maps to the repo root (configured in `tsconfig.json`).

> Next.js 16 has breaking changes vs older versions. Read the relevant guide in `node_modules/next/dist/docs/` before writing routing or data-fetching code. See the rules block at the top of this file.

## Conventions

- **Language:** everything written to the repo is in **English**: code, identifiers, comments, docs, commit messages. The founders may talk to their agents in French, but nothing French lands in the repo.
- **TypeScript strict, no `any`.** The scaffold uses `useState<any[]>` in a few places; type new code properly and tighten existing types when you touch them.
- **Commits:** conventional (`feat:`, `fix:`, `refactor:`). Never mention AI assistants.
- **Keep it simple.** No premature abstraction. Three similar lines beat one clever abstraction. Pull tooling and structure (folders, docs, libs) when a real need appears, not preemptively.
- **Supabase access:** prefer typed queries; select only the columns you need (never leak email or phone via `select("*")`); enforce access with RLS, not client-side checks.

### Git workflow

Work flows **issue → branch → PR → squash-merge → delete branch**, off `main`.

- **Branch per unit of work**, named `feature/...` or `fix/...`, cut from an up-to-date `main`. One branch = one PR.
- **Open a PR into `main`** for every completed change; that is where the diff is reviewed, CI runs, and the other founder approves. A branch push or draft PR may be used earlier for a Vercel preview, testing, or feedback, but it remains work in progress and must not be merged. Marking the PR **Ready for review** is the explicit signal that the work is complete and may be reviewed and merged under the rules below. Link the issue with `Closes #N` when there is one. Issues are optional for trivial work but expected for anything worth tracking or discussing.
- **Squash and merge, then delete the branch.** Keeps `main` history at one commit per PR and the branch list clean.
- **Do not let ready PRs pile up.** A PR marked Ready for review gets reviewed and merged quickly; draft PRs are visible WIP, not merge requests. A stack of long-lived branches against a moving `main` is how avoidable conflicts and schema drift appear.
- **Agents never merge a PR or apply a migration to the shared DB on their own.** An agent writes the code and the migration file and opens the PR; merging and applying to the remote stay founder-gated.
- **Clear the other founder's ready PRs before starting new work.** On an async two-timezone team, the first thing you do in a session is review and merge what is ready (that is `standup`'s job), so `main` keeps moving and long-lived branches do not accumulate. Draft PRs appear only as active WIP for optional testing or early feedback. Reviewing ready work is not busywork; it is the guard-rail against schema drift.

### Task tracking (the board is the source of truth)

The **GitHub Project `Amourette`** (org `getamourette`, https://github.com/orgs/getamourette/projects/1) is the single shared source of truth for remaining work. If it is not on the board, it is not tracked. `roadmap.md` is the narrative layer (blocs, the *why*) and points at the board; it does not duplicate task lists. Each founder's personal to-do tool is private scratch that *feeds* the board, never authoritative for shared work.

- **Everything shared lives here, not just code:** bugs, features, design, infra, and non-code ops (marketing, legal, business) — the board is the one place both founders look, so a task with nowhere else to live goes here with `Area: ops`.
- **Fields:** `Status` (Inbox → Backlog → Ready → In progress → In review → Done), `Kind`, `Area`, `Assignee`, `Priority`. Ownership is the native GitHub **`Assignee`** field (so each person's avatar shows on the card, and it works on both issues and draft items), set per-item, not per-area — `Area` is only a filter.
- **`Kind` = the nature of the work; `Area` = where it lives. They combine** (a bug in onboarding is `Kind: bug` + `Area: onboarding`). Both are fixed sets, so every agent labels the same way:
  - **Kind:** `bug` (broken / regression) · `feature` (user-facing capability) · `design` (visual / DA / UX) · `infra` (technical non-bug: migration, CI, realtime, tooling) · `question` (not yet decided, not yet actionable) · `chore` (maintenance: tests, docs, deps, config, security hardening, cleanup).
  - **Area:** `landing` (pre-venue pages, `/`) · `onboarding` (profile creation + editing) · `room` (live feed & presence) · `match-chat` (match reveal + chat) · `safety` (user report / block / moderation) · `admin` (founder tooling, `/admin`) · `design-system` (DA / tokens / fonts / brand / shared visual components) · `platform` (infra / devops / Supabase / DB / auth / Vercel / CI / i18n) · `ops` (non-code: marketing, legal, business, venue outreach).
- **New items land in `Inbox`** (auto-added from the repo) and get triaged (Kind/Area/Assignee/Priority) on the fly or at the weekly. `In review` exclusively means a non-draft PR is Ready for review; a pushed branch or draft PR remains `In progress`.
- **Status transitions — who moves the card:** GitHub auto-sets `Inbox` (issue created) and `Done` (a merged PR's `Closes #N` fires). A human triages `Inbox` into `Ready` (do soon) or `Backlog` (real, not now — a parked parking-lot, not a step before `Ready`; it is the far-right column, kept out of daily view). The **agent moves `Ready` → `In progress` when it cuts the branch to start the work** (this is what `/pick` does), not the founder by hand. A preview/checkpoint push does not change the status; `/ship` moves it to `In review` only after the PR is confirmed Ready for review.
- **Draft item vs real issue, and when the issue is created:** `/task` decides. Clearly actionable code work (will get a branch/PR) becomes a **real issue** at capture (auto-added to `Inbox`). Questions, raw ideas, and non-code ops start as **draft items** (no repo noise) and are **converted to a real issue** only when someone picks them up and needs a branch (so `Closes #N` links the work; `/pick` does the conversion). Trivial one-off fixes need no issue at all.
- **Questions belong on the board** (`Kind: question`, draft item, surfaced in the "Questions" view) so they are shared, not carried in one founder's head. An open question is parked in `Backlog` (out of daily view, always in the Questions view) until resolved — at the weekly, or by a direct ping if urgent. Resolving it produces a task *or* a `docs/decisions.md` entry (with the *why*), then its item is closed.

### Supabase: how the DB is managed (read before any schema work)

There is **no local Supabase stack** (no `supabase/config.toml`, no Docker). The database is a **remote project reached through the Supabase MCP**. Both agents need that MCP configured, or you can write migration files but not actually apply them.

- **Migrations are dual-tracked:** write the SQL file under `supabase/migrations/` (so the history is in git) **and** apply it to the remote project with the MCP `apply_migration`. After any schema change, regenerate `lib/database.types.ts` (MCP `generate_typescript_types`) and run `get_advisors` (security) to catch missing policies/grants.
- **Anonymous sign-in issues the `authenticated` role, not `anon`.** `signInAnonymously()` gives a real session whose role is `authenticated` (with `is_anonymous=true`). `anon` means *no session at all*. So **every RLS policy and every GRANT targets `authenticated`**; `anon` gets nothing. This has bitten us twice (RLS, then Storage upload policies written for `anon` silently denied every signed-in user).
- **Objects created via the MCP need explicit `GRANT`s to every role that uses them.** Supabase's default-privilege grants do not apply to objects created by the MCP migration role, so RLS alone fails with `42501`. Grant the operations the table's policies allow to `authenticated`; server-side scripts using `service_role` also need their own explicit, narrowly scoped grants (including `SELECT` for columns used in PostgREST update/delete filters). See `…_grants.sql`.
- **An RLS policy must not reference the table it protects** (Postgres throws "infinite recursion in policy"). Compute the visible-id set in a `SECURITY DEFINER` helper in the **`private` schema** (PostgREST does not expose it, so it is not a callable RPC) and have the policy test membership against it. See `private.visible_profile_ids()` / `private.my_active_venue_ids()`.
- **Scheduled jobs run in-database via `pg_cron`** (`cron.job`), not on Vercel. The night rollover (`bartap-close-ended-nights` → `public.close_ended_nights()`) lives there.
- **Testing a schema change before merge, on the single shared remote.** There is one remote DB shared by both founders and no local stack, so you cannot test schema-dependent code without applying the migration *somewhere* — yet applying it changes the DB for the other founder too. The rule while pre-launch (no real users; the shared DB *is* the dev DB): an **additive** migration (new nullable column, new table nobody reads yet) is safe to apply early and test, since existing code does not reference it. A **behavioral or destructive** one (alters a constraint, trigger, or function, drops a column) changes the DB's behavior for the other founder immediately — announce it before applying and merge the PR promptly so code and DB resync. The migration file always travels in the PR (dual-tracking) regardless of when it was applied. When there are real users, split a separate prod project from this dev one and gate prod migrations to merge/release time (Supabase per-PR branching is the cleaner long-term option, deferred as paid/complex for now).

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev      # http://localhost:3000
npm run lint     # eslint
npm run build    # production build
```

For phone testing, use the branch's Vercel preview rather than a LAN `next dev`
server: it is a deterministic URL, served over HTTPS, exercises the real QR
flow, and is shareable with the other founder. `npm run preview:qr` renders that
preview URL as a scannable QR code in the terminal (pass a branch name as an
argument to target a branch other than the current one).

**Status and what to build next:** see `docs/roadmap.md`.
