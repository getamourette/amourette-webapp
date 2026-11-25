<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Amourette

Live, in-bar dating app. Co-founded by Aymane (New York) and Marwane (Paris). Both founders code, with both Claude Code and Codex.

**North star (internal compass):** *Turn the fear of rejection into a painless match, right where people already are: the bar.*

**Public line:** *The app that gets people in the same bar to actually talk to each other.*

You scan a QR on the way into a venue, see who is checked in tonight, like discreetly, and a chat opens only if it is mutual. No public rejection, ever.

## Where things live

This file is the single source of truth for any agent. Codex reads `AGENTS.md` natively; `CLAUDE.md` just imports it, so Claude Code shares the exact same contract. Keep this file to durable things (vision, invariants, stack, conventions) so it does not rot.

- **`AGENTS.md`** (this file): the durable engineering contract. Rarely changes.
- **`docs/roadmap.md`**: current state and the phased plan. The living status doc, updated as work ships.
- **`docs/decisions/`**: architecture and collaboration decisions, one file per decision named `YYYY-MM-DD-short-slug.md`. There is no index: the dated file names are the index. `docs/decisions.md` is the frozen archive of every decision recorded before 2026-11-23; read it for history, never add to it.
- **`docs/launch-reservation-policy.md`**: current launch reservation, cancellation, arrival and refund policy, plus participant copy and implementation ownership for #183. Read it before working on a reservation/payment child issue.
- **`docs/production-cutover.md`**: how the EU production database is built from migrations, verified, cut over and kept apart from development (#280, #367). Read it before any work that touches production data, keys or Vercel Production variables.
- **`docs/workflow.md`**: the human guide to how we work (board, labels, skills, task lifecycle, merge rule). Read it once; the agent-facing rules are the "Task tracking" and "Git workflow" sections below.
- **Google Doc `Amourette - Vision & Strategy`**: full product vision and strategy.
- **Code + git history**: the actual truth of what is built. Docs are the human-readable layer on top.

**This is a living set of docs.** If during any work session you spot something wrong, a missing convention, a gotcha, or a decision worth recording, update the right file on the spot (a convention goes here, a status change in `docs/roadmap.md`, a decision as a new file in `docs/decisions/`). Do not leave it for a separate cleanup pass.

**Learn from escaped defects.** When a founder finds, on the preview or in review, a defect the agent's own checks should have caught, the fix is not complete until the gap is closed: add the automated check that would have caught it or, when that is not possible, the checklist line or convention, and name it in the PR. Prefer a test over prose, generalize only reusable lessons, and keep the docs short. Agents may also propose improvements they notice on their own; record them in the right file rather than leaving them in a chat.

## Logging decisions (do this without being asked)

When you and a founder reach a decision during a session, a choice about architecture, data model, tooling, dependencies, or how you work, **record it in a new file `docs/decisions/YYYY-MM-DD-short-slug.md` before the session ends**, with the *why*, not just the *what*. One decision per file, dated the day it was made, with a title line and the same content an entry always had. Do not append to `docs/decisions.md` (frozen archive) and do not add an index file: a shared file that every pull request edits is exactly the merge conflict this layout removes. A later decision that replaces an earlier one gets its own new file that names what it supersedes. Do not wait to be told. If you are unsure whether something counts as a decision, ask the founder rather than skip it. Keeping this log current is part of the work; a decision that lives only in a chat is a decision lost to the other founder.

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
- **Commits:** use Conventional Commits with the type that matches the change
  (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, and so on). Keep the
  subject focused on the repository change, without tool attribution.
- **Keep it simple.** No premature abstraction. Three similar lines beat one clever abstraction. Pull tooling and structure (folders, docs, libs) when a real need appears, not preemptively.
- **Supabase access:** prefer typed queries; select only the columns you need (never leak email or phone via `select("*")`); enforce access with RLS, not client-side checks.
- **Input contracts:** every added or changed input, including API/RPC arguments,
  URLs, files, browser storage and realtime payloads, must update the maintained
  contract in `docs/reports/input-validation-audit.md`. Specify runtime type,
  required/null state, normalization, allowed values, bounds and units, enforcement
  boundaries and user feedback. Follow the input checklist in `docs/workflow.md`.
  UI limits never replace server validation or durable database constraints.
  Count approved text limits in Unicode code points after boundary trimming;
  native HTML `maxLength` counts UTF-16 units and cannot enforce that contract.
  Reject invalid commands before effects; test boundary refusals in the existing
  gate. Keep small shared helpers, not a generic validation framework.

### Testing responsibilities

- **Ask before repeating a long validation suite.** Once a long/full suite has already run for the task, explain why another full run is needed and get the founder's approval before starting it or taking an action expected to trigger it. This includes manual reruns and PR promotion. Check reusable evidence and pending workflows first; wait for lightweight documentation checks before promotion to avoid invalidating reuse. Continue focused regression checks for confirmed fixes without asking. **Do not update a branch only because `main` moved:** the merge queue tests every PR on the latest `main` when the founder merges it, so a green PR that is behind is ready as it is. Update from `main` only to resolve a conflict GitHub reports; that update and its CI run need no approval. Any other long rerun (after a failure, manual dispatch, suspected flaky test) still needs approval. Report completed coverage, failures and remaining gates precisely; bypassing a merge requirement still needs explicit authorization for that merge.
- **Agents own test coverage as part of each behavior change, without a founder reminder.** Inspect existing coverage and add or update meaningful tests for important new behavior and significant bug fixes. Prefer a fast logic test for an isolated rule; extend Playwright when the risk involves a critical browser journey, interactions between participants, or access control. Coverage follows risk, not an exhaustive matrix or a percentage target.
- Run relevant checks while developing. Before marking a PR Ready for review, wait for both required GitHub checks on the latest PR commit using the scope policy in `docs/workflow.md`: documentation gets lightweight checks; verified dictionary copy gets lint, logic and build; application code gets the common browser journey plus affected suites; transversal or unknown changes get the full suite. Run relevant local checks during development without duplicating the complete hosted gate before every push. Follow the testing and UI verification instructions in `docs/workflow.md`; report missing validation and keep unfinished work in draft.
- Explain in the PR what behavior is covered and what remains unverified. If no new test is warranted, briefly explain why. Investigate a failing assertion before changing it; do not weaken an expected behavior just to make the gate pass.

### Proof by change type

Every pull request arrives with proof the founder can judge in 30 seconds, without
rerunning anything. What counts as proof depends on the kind of change:

- **Logic, data, state or SQL bug:** a test that fails on `main` for that reason first, then the fix.
- **Purely visual change:** before/after captures at the mobile viewport, in French and English, shown as pairs side by side; no new test.
- **Motion (animation, transition, flash, loading state, scroll, reveal):** an animated before/after pair recorded by the browser test at the mobile viewport, side by side; still captures alone are not proof. Motion that cannot be recorded honestly is named on the card's Risk line.
- **New user-facing journey:** a browser test of the journey plus captures of each state.
- **Server-only change with no visible surface:** the test plus a short runtime transcript.
- **Migration:** the replay test, the existing-data check and what was not applied.
- **Documentation or agent instructions only:** the lightweight checks; when the text prescribes a procedure, one real execution of it, shown.
- **Retry, fallback or other recovery path:** a run where the real failure is provoked at the real step and the recovery passes. A nominal run, or a simulated failure of another kind, does not prove it.
- **Anything that could not be verified:** stated explicitly under "Not verified".

**Prove the failing case too.** Whatever the kind of change, showing that it works
is half the proof; the pull request also shows that it fails when it must.

- **Red, then green.** Every test or check added or changed (a test, a CI step, a guard) is shown failing for the behavior it covers, without the change or on an input broken in exactly that way, then passing with it. A check never seen failing proves nothing.
- **Failure path triggered for real.** Every failure-handling path the change adds or alters (retry, fallback, timeout, refusal, error message, rollback) is provoked, in each failure mode it claims to handle, and its result shown. The normal case alone is not proof.
- **Not triggerable.** If a failure mode cannot be provoked, the card says so on its Risk line, not only under "Not verified", and `Nothing, you can merge` is never written without it.
- **Exempt:** documentation-only and verified dictionary copy changes, which add no check and no failure path. Documentation that prescribes a procedure still owes its real execution (list above).

A new kind of change gets its rule by adding a line to this list in the same pull
request that first needs it.

The description opens with the **founder card** (What changes, Proof, Review, Risk,
Your action), then Problem, Change, Scope, Proof and Not verified, as laid out in
`.github/pull_request_template.md`. Captures are embedded as images in the
description itself, one titled pair per screen and language: `BEFORE` on the left,
`AFTER` on the right, `new` when there is no before. The card format, the capture method and how the founder opens a
protected preview are in `docs/workflow.md`, "Proof and the founder card".

### Automatic review

Every pull request is reviewed before the founder reads it. The review belongs to
the pull request, not to the session that wrote it: the same rule holds for any
agent of either provider, however the session was started, attended or not.

- **Hosted reviewer first.** Before marking a pull request Ready, the authoring
  agent requests the hosted reviewer on the pull request and waits for its review.
  The reviewer reads the `Code Review Rules` section below.
- **Local fallback, never an endless wait.** If the hosted reviewer refuses (quota,
  setup) or has posted nothing 15 minutes after the request, the authoring agent
  runs an independent local review instead: a fresh-context reviewer of whichever
  provider still has quota, given only the diff and the review rules. Its result is
  posted on the pull request.
- **Remarks are settled by the authoring agent:** fix the real ones, dismiss the
  others with a written reason, at most two rounds. A disagreement that remains
  goes on the founder card for the founder to decide.
- **The founder card says who reviewed:** `Hosted reviewer`, `Local fallback` with
  why the hosted one did not come, or `None` with the reason. A pull request is
  never marked Ready with a silent absence of review.
- **Enforced by the `Review trace` check** (`scripts/review-trace.mjs`): it fails on
  a Ready pull request whose card has no review verdict, or whose verdict has no
  matching trace on the pull request. It catches a session that skipped the skill.

The step-by-step procedure is in the `ship` skill; the detail and what was verified
about the hosted reviewer are in `docs/workflow.md`, "Automatic review".

### Git workflow

Work flows **issue → branch → PR → squash-merge → delete branch**, off `main`.

- **Branch per unit of work**, named `feature/...` or `fix/...`, cut from an up-to-date `main`. One branch = one PR.
- **Open a PR into `main`** for every completed change; that is where the diff is reviewed, CI runs, and the other founder approves. A branch push or draft PR may be used earlier for a Vercel preview, testing, or feedback, but it remains work in progress and must not be merged. Marking the PR **Ready for review** is the explicit signal that the work is complete and may be reviewed and merged under the rules below. Link the issue with `Closes #N` when there is one. Issues are optional for trivial work but expected for anything worth tracking or discussing.
- **Squash and merge through the merge queue, then delete the branch.** The founder clicks **Merge when ready** on a green PR; GitHub rebuilds it on the latest `main`, runs the full suite and squash-merges it, or removes it from the queue if a check fails. Several PRs can be queued without waiting for each other, and a branch does not need to be up to date. Keeps `main` history at one commit per PR and the branch list clean. See `docs/workflow.md`, "Merge queue".
- **Worktree cleanup requires proof, not Git ancestry.** A clean worktree, a branch tip already contained in `main`, or a gone upstream does not prove the named task is finished: a freshly prepared branch may have no commits yet, and squash-merging breaks ancestry. An agent may classify a worktree as safely deletable only when a merged PR has that exact branch as its head and the linked board item is no longer `In progress`. If no exact merged PR exists, the board still says `In progress`, or the signals disagree, preserve it and ask the founder whether the work is intentionally abandoned. Always show the evidence and get confirmation before deleting anything.
- **Do not let ready PRs pile up.** A PR marked Ready for review gets reviewed and merged quickly; draft PRs are visible WIP, not merge requests. A stack of long-lived branches against a moving `main` is how avoidable conflicts and schema drift appear.
- **Agents never merge a PR or apply a migration to a hosted database by hand.** An agent writes the code and the migration file and opens the PR; the founder's merge is the gate, and the workflow then applies the file to both databases before deploying.
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
- **Questions belong on the board** (`Kind: question`, draft item, surfaced in the "Questions" view) so they are shared, not carried in one founder's head. An open question is parked in `Backlog` (out of daily view, always in the Questions view) until resolved — at the weekly, or by a direct ping if urgent. Resolving it produces a task *or* a `docs/decisions/` file (with the *why*), then its item is closed.

### Supabase: how the DB is managed (read before any schema work)

There are **two hosted projects**, and schema reaches them **only through the merge workflow** (`.github/workflows/deploy.yml`, #434). The Supabase MCP is for reading: SQL queries, `generate_typescript_types`, `get_advisors`. CI and rehearsals run on **disposable local stacks** (Supabase CLI in GitHub Actions); there is no `supabase/config.toml` to run one by hand.

- **Two projects, never mixed.** Development (`us-east-1`) serves local work, every Vercel Preview and the QA rooms. CI browser jobs use neither: each starts a disposable local stack. Production (`eu-west-3`) serves `getamourette.com` only and is built from `supabase/migrations/` alone. Its service-role key exists only in Vercel Production. Seed, QA and real-database test tooling refuses any project but development (`scripts/development-target.mjs`); only the Playwright fixtures also accept the CI runner's own `http://127.0.0.1:54321`; a new script that reads the service-role key calls that guard before creating a client. Production is never seeded.
- **Every migration must replay on an empty database.** `npm run test:migration-replay` replays the whole directory in filename order; a file that only works on top of the current development state is a defect. Never create a schema object by hand in the dashboard: anything a migration does not create will be missing from production.

- **Migrations are applied by the workflow, never by hand.** Write the SQL file under `supabase/migrations/` and open the PR; its kind (additive, behaviour, removal) is checked in CI (`docs/workflow.md`, "Migration kinds"). When the founder merges, the workflow applies the pending files to development, then production, recording each in `migration_ledger.applied`, compares both catalogs, and only then deploys the code to Vercel production; any failure stops before the deployment and opens the issue "Release stopped: production is behind main", fixed forward by a new PR. **Never use MCP `apply_migration`, the SQL editor or `psql` to run a migration file on either hosted project:** a file the ledger did not apply makes the next release fail. To try an **additive** migration on a branch preview, run `gh workflow run deploy.yml --ref <branch> -f mode=development`; from then on that file is frozen (an edit fails the release), so correct it with a new file. A behaviour change is proven before merge on local stacks by the PR's own CI. After a schema change, run MCP `generate_typescript_types` and `get_advisors` (security) on development once it holds the file. `lib/database.types.ts` carries hand edits (comments, tightened insert/RPC types), so never overwrite it with the generated output: compare, then copy only the new or changed entries by hand.
- **Anonymous sign-in issues the `authenticated` role, not `anon`.** `signInAnonymously()` gives a real session whose role is `authenticated` (with `is_anonymous=true`). `anon` means *no session at all*. So **every RLS policy and every GRANT targets `authenticated`**; `anon` gets nothing. This has bitten us twice (RLS, then Storage upload policies written for `anon` silently denied every signed-in user).
- **Objects created by migrations need explicit `GRANT`s to every role that uses them.** The hosted projects have no default-privilege grants for the API roles (the local stacks revoke theirs to match), so RLS alone fails with `42501`. Grant the operations the table's policies allow to `authenticated`; server-side scripts using `service_role` also need their own explicit, narrowly scoped grants (including `SELECT` for columns used in PostgREST update/delete filters). See `…_grants.sql`.
- **An RLS policy must not reference the table it protects** (Postgres throws "infinite recursion in policy"). Compute the visible-id set in a `SECURITY DEFINER` helper in the **`private` schema** (PostgREST does not expose it, so it is not a callable RPC) and have the policy test membership against it. See `private.visible_profile_ids()` / `private.my_active_venue_ids()`.
- **Scheduled jobs run in-database via `pg_cron`** (`cron.job`), not on Vercel. `bartap-close-ended-nights` calls `public.run_venue_night_lifecycle()` every minute. Each scheduled night's `closes_at` is authoritative: access rules enforce expiry immediately; terminal transitions close presence and delete the night's likes, matches (cascading messages), and ejections. Temporary closure preserves interactions. Do not restore the legacy `close_ended_nights()` function or the old 06:00-local rollover; scheduled-night transitions own cleanup.
- **Statement-level triggers fire on zero-row statements, including FK cascades.** Deleting a user or venue runs internal `cascade`/`set null` statements on every referencing table, so an unguarded `FOR EACH STATEMENT` trigger fires even when nothing there changed. A trigger with a side effect (broadcast, HTTP, insert) must use a transition table and act only when it is non-empty; see `private.notify_moderation_queue()`. Background writers on the free tier also cost Disk IO budget: keep logs such as `cron.job_run_details` bounded.

## Code Review Rules

These rules are for whoever reviews a pull request here: the hosted reviewer, a
local fallback reviewer, or a founder. Flag only what would break behavior, data,
security or one of these rules. Formatting, lint and types are CI's job.

### Product invariants

- Flag anything that lets a participant learn they were liked without a mutual
  match, message someone who is not a mutual match, or see who is in a venue they
  are not checked into tonight. Safe path: the five invariants in "The decision
  filter"; a chat exists only after a mutual like.

### Database access

- Flag a table or storage bucket a participant can reach without an RLS policy
  and an explicit `GRANT`, a policy or grant written for `anon` (a signed-in
  participant is `authenticated`, also when anonymous), a policy that reads the
  table it protects, and a query that returns email, phone or another
  participant's private columns (`select("*")` included). Safe path: visible-id
  helpers in the `private` schema, explicit column lists.
- Flag a function whose `EXECUTE` grant is wider than its callers (a server-only
  function granted to `authenticated`, any grant to `anon`), a `SECURITY DEFINER`
  function without a fixed `search_path`, and one callable by participants that
  does not check the caller.
- Flag any use of the service-role key outside server-only code, and any script
  that reads it without the `scripts/development-target.mjs` guard.

### Migrations and existing data

- Flag a migration that cannot replay on an empty database in filename order, that
  edits an already merged migration file, or that depends on an object created by
  hand, and any instruction or script that applies a migration to a hosted
  database outside `.github/workflows/deploy.yml`.
- Flag a migration that can fail or lose data on existing rows: a new `NOT NULL`
  or constraint without a backfill, a dropped or retyped column still read by
  code, a destructive statement with no stated existing-data check.
- Flag a statement-level trigger with a side effect that does not test its
  transition table.

### Auth and sessions

- Flag an access decision made in the browser or from a value the client sends
  (user id, role, venue, price). Safe path: derive it from the session on the
  server or in SQL (`auth.uid()`), and enforce it with RLS.
- Flag an admin route or action that does not verify the admin session on the
  server.

### Reservations and payments

- Flag a payment state set from the browser return URL or any unverified input.
  Safe path: only provider evidence verified on the server (a signed event, or an
  object retrieved from the provider with the secret key), matched to the bound
  checkout, amount and currency (`docs/launch-reservation-policy.md`).
- Flag a reservation, payment or refund command that is not idempotent under a
  repeated submission or a repeated provider event, an amount or currency that
  does not come from the event settings, and a capacity check that can be passed
  twice by concurrent requests.

### Input validation

- Flag a new or changed application input (API or RPC argument, URL, file,
  browser storage, realtime payload, build-time configuration) that is validated
  only in the interface, has no bound, or is missing from
  `docs/reports/input-validation-audit.md`. Safe path: server validation plus a
  durable database constraint, refusals tested. Developer and CI tooling under
  `scripts/` and `.github/` is not in that contract.

### Proof

- Flag a behavior change without the proof "Proof by change type" requires for
  it, a test weakened to pass, and a description that claims a verification the
  diff or the CI run does not show.
- Flag French text or an `any` added to the repository.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev      # http://localhost:3000
npm run lint     # eslint
npm run build    # production build
npm run test:logic  # fast deterministic checks, no database: every scripts/test-* file
npm run test:e2e    # build + Chromium mobile, isolated development DB fixtures
```

For phone testing, use the branch's Vercel preview rather than a LAN `next dev`
server: it is a deterministic URL, served over HTTPS, exercises the real QR
flow, and is shareable with the other founder. `npm run preview:qr` renders the
`test-crowded` venue on that preview as a scannable QR code in the terminal.
Pass `-- --venue <slug>` to target another venue or `-- --branch <name>` for another
branch. The command confirms the deployment and resolves its stable Vercel branch alias,
including hash-suffixed aliases for long branch names.

**A user-facing UI change is not complete until its relevant interaction states have
been inspected on the Vercel preview at the target viewport.** Automated checks support
that review but do not replace it. If preview or device-level inspection is unavailable,
say exactly what remains unverified and keep the PR in draft rather than presenting the
change as ready for review. Follow the UI verification checklist in `docs/workflow.md`.

**Status and what to build next:** see `docs/roadmap.md`.
