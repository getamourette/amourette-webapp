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

## The five skills

You drive the workflow with five shared skills. They work identically
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
  decision, runs proportionate local checks, then commits and pushes for the scoped hosted gate,
  opens or updates the PR with `Closes #N`, marks it **Ready for review**, then moves
  the card to `In review`. Contextual requests to push for a Vercel preview,
  checkpoint, or draft PR use the same skill's WIP path: they push with proportionate
  checks, optionally create/update a draft PR, and leave the card `In progress`.
  It never merges and never deletes branches — those stay human.
- **`/qa`** — *repeatable preview testing*. Resolves the stable Vercel branch alias,
  suggests `test-crowded`, `test-empty`, or `test-waiting` from the branch diff, verifies
  all shared fixtures, detects the current preview's anonymous tester from a new Supabase
  check-in, and prepares guarded match/message/presence scenarios. It never resets shared
  data without explicit confirmation and never ships, merges, or applies migrations.

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

### Input development and review checklist (#77)

For every added or changed form field, API/RPC argument, URL, file, browser-storage
record or realtime value:

- Update the maintained contract at the top of
  [`input-validation-audit.md`](reports/input-validation-audit.md). Its dated
  inventory is historical evidence, not a second current specification.
- Specify the runtime type, required/null/empty behavior, allowed values, bounds
  and units. State trimming, casing, Unicode normalization and raw payload caps.
- Validate untrusted values before casting or making effects. Check objects,
  arrays, identifiers and commands even when TypeScript says they are typed.
- Match UI feedback to submission rules. Do not truncate persisted content or use
  UTF-16 `maxLength` as the approved code-point limit. Preserve a rejected draft.
- Enforce durable invariants in PostgreSQL, covering direct writes as well as RPCs.
  Validation must preserve authorization, side-effect ordering and existing grants.
  Bound streams before JSON/multipart parsing; MIME metadata alone is not image
  validation. Passwords and opaque tokens must not inherit ordinary text trimming.
- Inspect remote schema/grants and existing-data compatibility before tightening
  constraints. Prepare migration files and reconcile types selectively when another
  branch has deployed schema changes. Do not apply shared changes without the
  founder's explicit approval of the concrete result.
- Add meaningful min/max and rejected-input tests, including Unicode, whitespace,
  null and malformed values. Use a no-side-effect assertion for mutating commands.
  `test:validation` runs through `test:logic`; HTTP regressions run with Playwright.
- Document intentional exceptions, dependencies, historical-data remediation and
  unverified Auth/Storage/provider/preview behavior. Passing isolated SQL does not
  prove deployed Supabase RLS, Auth policy or the actual upload transport.

The PR template asks for this evidence. Neither the template nor contract tests
automatically discover new fields: the author and reviewer own that inventory.

### UI verification gate

For any user-facing UI change, automated checks and visual verification answer different
questions. Lint and build catch code and compilation failures. Targeted unit tests cover
isolated logic. Playwright drives a real browser and should cover important journeys and
state transitions. None of them decides whether a new visual treatment feels intentional,
so the rendered preview must also be inspected at the viewport where the feature is used.

Before a UI PR becomes Ready for review:

- exercise the relevant resting, loading, empty, success, and error states;
- exercise interaction transitions, including focus, blur, keyboard opening, dismissal,
  back navigation, and post-submit state when they apply;
- try representative short, long, and localized content, checking wrapping and touch
  targets rather than only the happy-path copy;
- check the narrowest supported mobile viewport for clipping, horizontal overflow,
  overlays, safe-area behavior, and controls stranded by the software keyboard;
- check keyboard navigation, visible focus, reduced motion, and accessible names;
- run the existing targeted Playwright journey when the changed surface has one, and add
  a behavioral assertion when the change introduces a new interaction state;
- inspect the deployed Vercel preview visually on the target viewport. A screenshot or
  browser automation run may support this, but first-time visual quality still needs
  human or agent visual judgment rather than a passing geometry assertion alone.

If the environment cannot launch the required browser or the preview cannot be inspected,
record that limitation in the handoff and leave the PR as draft. Push a WIP preview early
when device behavior or visual direction is uncertain, so feedback happens before the
final-delivery gate rather than after it.

### Automated testing (#45)

Use Node `22.22.1` (`nvm use`, or your version manager's equivalent) and `npm ci`.
The lockfile supplies the Playwright version; install its matching Chromium once:

```bash
npx playwright install --with-deps chromium
npm run test:logic
npm run test:e2e
```

`test:logic` runs the eight existing deterministic script groups (entry, empty room,
admin review/recovery, venue time, email UI, chat delivery, email transport/webhook
contracts), plus diagnostic encryption round-trip/tamper checks and `test:validation`. The latter
executes text/email/file/request rules and the actual #77 SQL migrations in an
ephemeral PGlite database; it never connects to the shared project. Some are source-contract checks; these are weaker evidence than executing
behavior. Extend behavior assertions when changing the relevant code. The suite uses
Node assertions and does not need Supabase credentials or a running app.

`test:like-sql` runs #231's authorization/token/receipt migration in PGlite and
is included in `test:logic`. `test:like-concurrency` requires an **empty disposable
PostgreSQL 17 database** on loopback, with `LIKE_TEST_DATABASE_URL` (default
`postgres://postgres:test@127.0.0.1:55431/like_test`). It refuses remote hosts,
other major versions and an existing application schema. The required
lint/logic/build CI job provides a fresh `postgres:17` service and executes it.
It creates a minimal Supabase/Auth substrate, installs real existing function
bodies and the discovery/like migrations, then uses separate connections and
`pg_blocking_pids()` barriers to verify transaction ordering. Its venue deletion
fixture retains the production venue/night foreign keys and cascades: do not
remove them or replace the cascade assertion with a lock-only mock. Preserve their
historical creation order too (direct venue cascades precede scheduled nights),
and cover direct privileged DELETE as well as the admin RPC. The fast SQL
gate also instruments discovery so unrelated-venue presences fail if they reach
the shared eligibility predicate, alongside presence/profile/photo authorization
assertions. No Docker/local Supabase stack is required for ordinary development;
never point this suite at the shared Supabase database. Local binaries/container
setup is optional.

`test:name-corrections` executes #229's migration against the same isolated
substrate and checks validation, grants, auxiliary-write guards, immutable requests,
receipts and existing-match notice semantics. It is part of `test:logic`.
`test:like-concurrency` also executes the name-correction races after its like cases,
reusing the same disposable PostgreSQL 17 service. The deterministic browser suite
`tests/profile/name-corrections-ui.spec.ts` uses mocked transport and no shared data;
`tests/moderation/name-corrections.spec.ts` requires the founder-approved migration
and owns its normal disposable Supabase fixtures. Never apply the migration to make
a browser run pass without explicit founder approval. After application, regenerate
types, run security advisors and inspect mobile profile/chat and desktop admin on
the branch's Vercel preview before Ready for review.

For #231's coordinated cutover, obtain founder approval of the prepared migration
before remote application; then regenerate types and inspect security advisors.
That approval and both remote applications were completed on September 21; exact
versions and validation evidence are recorded in `docs/decisions.md` and PR #269.
Run the full hosted browser gate (including `like-authorization.spec.ts`) and
inspect refusal, lost-response recovery and match reveal/dismissal on the Vercel
preview at mobile width. Old clients must fail closed; never restore table-write
grants to make a stale deployment work.
The targeted lifecycle test must preserve established matches across temporary
closure while expecting unmatched likes to be invalidated. Require a fresh gesture
after re-entry; never update saved likes to accelerate a fixture's expiry.

`test:profile-edits` runs #230's cooldown migration against the existing isolated
SQL substrate and is included in `test:logic`. The existing PostgreSQL 17 gate
also covers concurrent profile edits, identical retries, stale versions, direct
writes, waits crossing expiry, likes, blocks and terminal cleanup. Browser
transport tests live in `tests/profile/preference-edits-ui.spec.ts`; they use no
shared data. `tests/profile/preference-edits.spec.ts` covers real owner RPCs,
direct-write refusals, separate bio saves and retained matches. The shared browser
fixture refuses to start before the founder-approved migration exists. Use fresh
profiles or reductions followed by at most one expansion in integration fixtures;
never add a production cooldown bypass for tests.

#230's `20260922000001_profile_preference_cooldown.sql` was applied with explicit
founder approval on September 23 (remote version `20260923081456`). The founder
chose to finish #230 before adapting the other photo editors; existing editors
receive refusals for restricted mixed saves. Remote types were regenerated with
nullable version/deadline refinements and security advisors inspected. Run the
full hosted gate before review. Inspect EN/FR/ES at 320 and 390 px and on desktop on the
Vercel preview, including confirmation/focus, cooldown/reduction, conflict,
loading, network recovery and navigation. Keep any published PR draft until those
checks and deployment inspection pass; local mocks do not establish remote RLS
or device keyboard behavior.

`test:e2e` builds the current source, starts the production server at
`http://127.0.0.1:3100`, runs Chromium with Pixel 7 emulation, and stops the server.
It refuses to reuse a possibly stale server. Multi-user contexts inherit the same
viewport, touch, locale and timezone configuration. The server explicitly disables
paid photo review and email delivery. Use the development Supabase values in
`.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
server-only `SUPABASE_SERVICE_ROLE_KEY`. No migration or permanent QA reset is part
of this command. Do not point browser fixtures at a production database with users.

For focused development and debugging:

```bash
npm run test:chat
npm run test:e2e -- tests/onboarding
npm run test:e2e:ui
# After a successful build, rerun only a journey without rebuilding:
npx playwright test tests/onboarding --project=chromium-mobile --debug
npx playwright show-report
```

Tests live under `tests/<area>/*.spec.ts`, sharing `playwright.config.ts` and
`tests/helpers/fixtures.ts`. The initial suites are `onboarding/arrival-to-chat`
`match-chat/chat`, and `profile/chat-preview`; add `room`, `safety`, and `admin` files when a
critical journey warrants one, rather than creating empty suites. The existing chat
journey keeps all its delivery, typing, retry, presence, report/block and match-stack
assertions. The onboarding journey starts with an anonymous session but no profile
or presence, uploads to real Storage, checks in through the UI, verifies recipient
RLS after a one-sided like, then matches through both participants' UI and sends a
message. It does not simulate a physical camera scanning a QR.

Each test owns a new `e2e-<run UUID>-<suffix>` venue and disposable identities tagged
with `app_metadata.e2e_run`. The profile suite preserves starter localization, focus, dismissal, reduced-motion and phone-sheet assertions from main. It never reads or resets `test-crowded`, `test-empty`,
or `test-waiting`. Normal teardown and failed setup clean only tracked IDs, including
Storage uploads; cleanup failures make the run red. Hard termination can still leave
rows: inspect the failing run's UUID and owned records before any targeted cleanup.
Do not run the shared QA reset as an E2E cleanup substitute.

Fixtures default to confirmed **password accounts**, created by the server-only
administrator and signed in with the publishable key. Browser/API requests retain
ordinary `authenticated` user tokens and RLS. Each test still gets independent
identities; tests are not combined to save accounts. The common arrival-to-chat
journey explicitly requests **two anonymous identities**, asserts their anonymous
status, and retains Storage onboarding, secret-like visibility, unmatched-message
refusal and mutual-match/chat assertions. It cannot be switched to password mode
by an environment override. `E2E_FIXTURE_AUTH=anonymous` explicitly expands anonymous
coverage when investigating Auth-specific behavior; invalid values fail setup.

The #264 audit found no `is_anonymous` branch in application authorization or
public/private database functions and public/Storage policies (including a read-only
remote catalog inspection). Authorization uses `authenticated`, `auth.uid()`, presence
and founder membership. Future anonymous-specific behavior must add an explicit
anonymous fixture and its assertions. The fixture administrator only prepares,
inspects and removes fixtures; it never supplies a browser session. Ownership is
registered before subsequent setup/sign-in steps, including partial failures.
Anonymous signup also carries the run tag in user metadata for investigation if
the response is lost before ownership can be recorded. Teardown has a separate
60-second budget, continues after individual errors, and cleanup failures remain red.
A context is registered before preview routing, so routing failure still closes it.

The GitHub workflow runs on PR creation, new commits, reopening, conversion to draft,
Ready for review, and manual dispatch. It does not repeat after merge. The required
checks remain **Lint, logic and build** and **Playwright Chromium mobile**; neither
branch protections nor check names change. Both report selector failures rather
than silently succeeding. Browser execution is a separate job; its required gate
fails if execution is unsuccessful or canceled. No automatic test retries are added.
Failure evidence remains encrypted before upload with seven-day retention.

Only the browser execution job acquires `supabase-development-e2e`, across all
branches and manual runs in this repository. Lint/build and exempt checks do not
wait for that lock. `cancel-in-progress: false` lets active teardown finish;
`queue: max` retains up to 100 waiting jobs instead of replacing the single pending
job. GitHub orders by when jobs enter the queue, not commit/dispatch order. A full
queue can still cancel an additional job: that is a failed/missing validation,
never merge coverage. Inspect Actions and deliberately rerun it after capacity
returns. See [GitHub's concurrency semantics](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
There is no outer per-PR queue that could discard work before it reaches this queue.

Local/preview runs, other repositories and scripts outside this workflow do not
acquire the GitHub lock. Coordinate their shared-project use manually. Password
accounts reduce anonymous signup usage but still use Auth APIs and their limits;
the two anonymous smoke accounts still consume anonymous quota. The reporter
labels observed 429/rate-limit errors as infrastructure limitations without masking
failures, retrying blindly or suppressing functional assertions. It reports actual
password/anonymous fixture creation counts in the run summary. Hard cancellation,
runner loss, network ambiguity or teardown timeout can still leave owned fixtures;
use the run UUID to inspect and clean only those records, never reset shared QA.

#### Pre-launch CI scope

`scripts/ci-plan.mjs` owns the explicit mapping. Both named required gates always start and
finish successfully for an intentional exemption; only their expensive steps are
conditional. A selection error fails the job. Do not use workflow-level path
filters or `[skip ci]`, which leave required checks pending. No ruleset change is
needed. Read the scope summary before treating green checks as browser coverage.

| Changed files | Required validation |
|---|---|
| Markdown under `docs/`, root README/agent contract, shared skill instructions, PR template | Scope checks only; no dependency installation, build or E2E |
| Verified plain dictionary string values in `lib/strings.ts`, `lib/photo-strings.ts`, `lib/email-preference-strings.ts` | Lint, logic and build; no E2E |
| Profile/onboarding | Lint, logic, build; onboarding, profile and moderation suites |
| Chat/delivery/read state/match ordering | Lint, logic, build; chat and profile chat-preview suites |
| Photo components/API/moderation | Lint, logic, build; photo validation, moderation, onboarding, profile and chat suites |
| Founder UI | Lint, logic, build; photo validation, moderation, onboarding, profile, chat and campaign suites |
| Campaign UI/API/template/helpers | Lint, logic, build; campaign suite |
| Venue UI | Lint, logic, build; onboarding, profile, moderation and chat suites |
| Landing/email UI and email endpoints/helpers | Lint, logic, build; API validation suite |
| Individual existing-area browser specs | Lint, logic, build; changed specs |
| Auth, presence/lifecycle helpers, SQL, dependencies, shared layout/styles/UI, test helpers, CI/tooling or any unmapped path | Lint, logic, build and the full E2E suite |

Every targeted browser selection also includes
`tests/onboarding/arrival-to-chat.spec.ts`: arrival, secret like, mutual match and
message delivery, with recipient permission assertions. Reuse this journey rather
than introducing another reduced version of the same test. Multiple changed areas
combine their suites. Transversal/unknown files override a narrower selection.
Mapping is intentionally conservative where profiles, photos and chat interact.

The selector compares the entire PR from the merge base to the PR head, including
both paths of a rename and deleted files. Git errors fail the check. Empty diffs
select the full suite. A copy exemption requires unchanged source outside plain
string property values inside the named dictionary; keys, functions, locale rules,
interpolations, added/deleted dictionaries and unsupported syntax do not qualify.
Text embedded in a component follows that component's area; do not try to infer
arbitrary text-only TSX edits or bypass testing with a label. Preview inspection
still applies to user-visible copy and UI changes.

#### PR stage and verified reuse (#264)

| Event / stage | Behavior |
|---|---|
| Draft opened or updated | Scoped lint/logic/build; E2E deferred, explicitly reported as **not merge coverage** |
| Manual dispatch on the branch | Always fresh lint/logic/build and **full** E2E, including drafts |
| Ready for review / ready PR code update | Required scoped browser coverage; common journey plus affected suites, full on transversal/unknown changes |
| Allowed Markdown after successful validation | Both required gates link the proven earlier run and explicitly say tests were **not executed again** |
| No usable proof | Normal stage/scope validation; failures are never exemptions |

Selection still examines the **whole PR**, not its last commit. Reuse is an
additional proof, not a smaller scope: `scripts/ci-reuse.mjs` checks the latest
50 runs of this workflow, same repository and branch, with a matching run source
SHA and a successful `CI evidence v1` job. That job is emitted only after both
required checks succeed on a **fresh** validation and records base SHA, head SHA,
scope and whether browser execution was required and completed. Reused runs do
not issue new proof, so reuse chains cannot hide the original execution.

The recorded base must exactly match the PR's current base SHA. The tested head
must be an ancestor of the new head, and a NUL-delimited, rename-disabled two-tree
diff must contain only `README.md`, `docs/decisions.md`, `docs/workflow.md`,
`docs/roadmap.md` or `docs/reports/input-validation-audit.md`. Thus application code,
tests, SQL, dependencies, CI configuration and every other tracked file are unchanged
across the entire tested-to-current range. Agent/skill changes are **not** in this
reuse allowlist. A targeted proof covers the same scope because the base and
executable tree are identical; a full proof covers narrower scopes too. A draft
proof without browser execution cannot satisfy ready coverage. An identical head
may reuse an explicit full manual run during promotion. Manual proof records the
merge base with `main`, so a branch-only test cannot certify an untested newer base.

Missing, malformed, inaccessible, incomplete, insufficient or failed evidence falls
back to normal validation. A newer equivalent failure blocks older success. Deleted
run history or evidence outside the 50-run search window only causes more work.
Git/API errors cannot grant reuse. The proof certifies Git inputs and executed
coverage, **not** immutability of the remote DB, Auth settings, secrets or external
services. No remote schema fingerprint or cross-machine lease is claimed. After
remote changes or suspected infrastructure drift, explicitly dispatch a fresh full
run; manual dispatch never reuses proof. The existing up-to-date-branch protection
remains necessary for base movement and is not modified here.

Before delivery, `/ship` must inspect coverage, not only green check names. For a
code PR still in draft, dispatch full E2E on the final branch, verify success and
exact head/base, then mark Ready and wait for the **ready event's** required checks
to pass (fresh execution or verified reuse of that manual run). If any validation
is missing, leave/revert to draft and keep the board `In progress`. Docs/copy-only
PRs retain their documented exemptions. A draft skip never authorizes delivery.

Deterministic tests cover scope unions, Git ancestry/tree differences, proof
provenance, missing/failed coverage, changed base/code/config/dependencies,
draft-to-ready, manual full coverage and conservative unknown-file expansion.
Hosted validation must additionally verify event delivery, the jobs API evidence,
and actual queue support. Local mocks cannot prove GitHub scheduling or provider
quota behavior; the 100-job saturation case is documented, not load-tested against
the shared project. No throughput or timing improvement is claimed without a run.

Run the full suite before a bar-testing session or an important milestone against
the intended version: `npm run test:e2e` locally, or select **Actions → CI → Run
workflow** and the desired branch. Manual dispatch always runs lint, logic, build
and every browser test. From the CLI (once this workflow is on `main`):

```bash
gh workflow run ci.yml --ref <branch>
```

To inspect the selection for committed local changes:

```bash
CI_BASE=<full-base-commit-sha> CI_HEAD=<full-head-commit-sha> node scripts/ci-plan.mjs
# Add --run to build and run the selected E2E suite. It does not run lint/logic.
```

During development use relevant local checks. `/ship` relies on the latest PR's
hosted results instead of requiring a second complete local gate. CI changes must
exercise the selector's docs/copy/targeted/full cases and refusal paths through
`npm run test:ci-plan` (also part of `test:logic`). Revisit this pre-launch policy
when real users arrive or failures show that the mapping misses dependencies.

GitHub activation needs four repository Actions secrets, all for the shared
**development** Supabase project:

| GitHub Actions secret | Local source | Use |
|---|---|---|
| `E2E_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` | Build and browser data endpoint |
| `E2E_SUPABASE_PUBLISHABLE_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Ordinary authenticated participant requests |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` | Server-side fixture setup and cleanup |
| `E2E_ARTIFACT_KEY` | `E2E_ARTIFACT_KEY` | Encrypt/decrypt diagnostic archives; 32 random bytes encoded as 64 hexadecimal characters |

The service-role key is powerful and bypasses RLS; it is not a venue-scoped key.
Its exposure is restricted to the E2E execution step, and ordinary browser actions
use participant sessions. Never expose it through `NEXT_PUBLIC_*`, commit `.env`
values, upload session files, or print credentials. The repository is public: traces can contain temporary
participant tokens and network data, so only the encrypted archive is uploaded.
The artifact key is separate from the database credentials and exposed only to the
encryption step. Both founders keep it in their private credential store and local
`.env.local`; never attach it to the PR or logs. Generate it once with a cryptographic
random generator (32 bytes), transfer it through the private secret store, and retain
old keys until their seven-day artifacts expire when rotating. To inspect a failure,
download the artifact and run:

```bash
node scripts/e2e-artifacts.mjs decrypt /path/to/e2e-diagnostics.enc e2e-diagnostics.tar.gz
tar -xzf e2e-diagnostics.tar.gz
npx playwright show-report
# Or open a trace under the extracted test-results directory:
npx playwright show-trace /path/to/trace.zip
```

Decryption authenticates the archive before writing plaintext and refuses to overwrite
an existing destination. Extract in a separate directory if retaining local reports.
Never publish decrypted traces or session contents. Dependency installation and the lint/logic job receive no
service-role secret. The workflow uses `pull_request`, never privileged
`pull_request_target`; fork/Dependabot PRs without secrets fail the E2E configuration
check and need a trusted maintainer-reviewed branch run. Never expose DB secrets to
unreviewed external code just to make a check green.

The active **Required PR tests** ruleset on `main` requires both named GitHub Actions
checks and an up-to-date branch before merge (configured after the first successful
hosted run on 2026-09-08). Existing PRs may need updating from `main` to pick up the
workflow. Local success is not a substitute for the latest PR commit's hosted checks;
keep the PR draft if those checks are missing, pending or failing.

Other integration scripts remain targeted commands: `test:venue-nights` exercises
lifecycle and RLS on Supabase, and the subscription scripts exercise email database
contracts. Audit their remote effects before adding them to default CI. In particular,
`test:email-delivery-e2e` contacts the deployed email endpoint and Resend lifecycle;
it is intentionally excluded from the ordinary PR suite. Browser/API permission
assertions should use real participant credentials, not the fixture administrator.

`npm run test:venue-nights` also exercises a populated night's scheduled cleanup.
It creates uniquely prefixed `lifecycle-<run>-...` venues and seven temporary Auth
users, uses signed-in participant clients for access checks, and removes the owned
fixtures even on failure. Cleanup errors fail the run. It never resets permanent QA
rooms or changes the cron schedule. Existing opening/idempotency checks call the
global lifecycle RPC, which can also process other due nights in the shared development
database; do not run it against a production database or concurrently with another
manual lifecycle runner.

The expiry scenario accelerates only its own fixture's close time and aligned
like/match expiry through `service_role`; this is test setup, not an admin schedule-edit
capability. Using the database clock, it chooses second 10 of the next minute, checks
participant access before and after expiry while the records still exist, then waits
up to 90 seconds for the scheduled worker without manually invoking it to make cleanup
pass. Guards fail if another engine run cleans the fixture before the access assertions;
there is no silent skip or automatic retry. Expect roughly two extra minutes. The test
checks temporary closure/reopening, terminal deletion, retained identity/safety/history/
analytics, an unaffected live control night, and repeat-run idempotency. It remains a
targeted integration command, outside `test:logic` and the default Playwright CI gate.

The agent implementing a change owns its test coverage without waiting for a founder
to request it. Inspect existing tests before choosing the smallest meaningful addition:

- a changed entry or expiry rule usually needs a fast logic regression test;
- a new important browser interaction should extend the relevant Playwright journey;
- a significant bug fix should reproduce the failure and verify the correction;
- a documentation-only or cosmetic change does not automatically need a new test.

Describe the covered behavior and remaining gaps in the PR, including why no new test
was needed when applicable. GitHub automatically executes committed tests; it does
not write tests for new behavior. A local commit triggers no CI, and a feature-branch
push only triggers this workflow when that branch has a PR targeting `main`.

During development, run the relevant logic checks and browser journey. Before review,
the selected hosted gate must pass; a complete local rerun is not required. UI changes also need the preview inspection
above; use physical iPhone Safari and Android Chrome for software keyboard, safe areas,
browser chrome, installation and background recovery changes. Add desktop Chromium
or selected WebKit projects only for demonstrated layout/platform needs. Emulation is
not proof of physical-device behavior. Before an important launch, exercise the core
loop on both phone platforms using the intended deployed version.

### Taste evaluation (#45)

The evaluated file is Marwane's personal `design-taste-frontend/SKILL.md` from the
installation associated with [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill).
The local file has no verified pinned upstream revision; its SHA-256 on 2026-09-08 was
`aa194351b246b8b4799099d4ed7b033d29eab6e6e3d58d8d2172978be7b3ec89`.
This is a document/task-fit evaluation, not a comparative rendered-UI experiment.

| Representative task | Useful guidance | Fit with Amourette |
|---|---|---|
| Refresh the landing within the current brand | Audit first, preserve intentional choices, review real copy and states | Optional inspiration; `docs/design.md` already fixes typography, palette, discretion and motion |
| Adjust the onboarding wizard | General form/state reminders | Explicitly outside its multi-step product-UI scope; our validation, accessibility and device checks remain necessary |
| Change the chat composer or match reveal | General interaction feedback and reduced-motion reminders | Marketing hero/layout rules cannot validate realtime, keyboard geometry, double opt-in or safety |

**Decision: optional personal installation only; no shared adoption.** The useful
preservation/state guidance overlaps our canonical contract, while generic animation,
layout and type defaults require filtering against the established night/discretion
system. It activates only for a relevant landing/redesign brief or an explicit founder
request, with project rules taking precedence. It is not a prerequisite for either
founder, Codex, Claude Code or CI, and cannot approve product UX, accessibility or
physical-device behavior. Nothing is vendored, so there is no shared version or license
copy to maintain. Reconsidering shared adoption requires evidence of added value, a
verified pinned source, license retention and an owner for synchronized updates.

### Codex permissions for task preparation

Calling `/pick` with an issue authorizes routine preparation without separate
conversational confirmations. The shared skill calls
`node <main-root>/scripts/prepare-worktree.mjs feature/<slug>` (or `fix/<slug>`).
The helper derives the canonical main checkout even from another worktree,
creates the usual sibling worktree from fresh `origin/main`, preserves existing
work and environment files, and uses the lockfile with `npm ci`. Branch/path
collisions and another founder's ownership still need resolution.

Codex's workspace sandbox protects Git metadata and excludes sibling directories;
marking a repository trusted does not by itself grant those writes. A local
persistent rule can authorize just this helper, including its Git operations,
local environment copy and npm installation/lifecycle scripts. Use an absolute
helper path so the rule cannot match a same-named script in another directory:

```python
prefix_rule(
    pattern=["node", "<absolute-main-root>/scripts/prepare-worktree.mjs"],
    decision="allow",
    justification="Prepare an explicitly picked Amourette issue worktree",
)
```

Store it in a dedicated personal `~/.codex/rules/amourette-pick.rules`, replacing
the placeholder with the actual main checkout path. Restart Codex to load it.
This machine-specific permission is not a repository-wide approval and does not
change global approval policy or sandbox settings. The helper remains trusted
executable code: changes to it require normal review. Managed administrator
restrictions can still take precedence. See the official
[Codex rules documentation](https://learn.chatgpt.com/docs/agent-configuration/rules).

`npm run test:pick` (part of `test:logic`) exercises disposable Git repositories
and a simulated npm executable: creation, resumption, no incorrect upstream,
non-overwriting environment copy and rejected paths/branches. It does not create
real project worktrees, install packages or use private environment values.

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

The shared development database has three permanent test venues:
`/v/test-crowded` contains synthetic profiles for scroll/match testing,
`/v/test-empty` exercises the empty live-room state, and `/v/test-waiting`
exercises the pre-launch waiting room. The first two stay live; the third keeps
an explicit far-future night in `waiting`. All three remain deterministic across
the lifecycle cron and never appear in founder analytics.

Each founder configures the server-only `SUPABASE_SERVICE_ROLE_KEY` in the main checkout's
`.env.local`; `/pick` copies that file into future worktrees. Preview hostnames are separate
browser origins, so anonymous profile UUIDs normally change from branch to branch. `/qa`
detects the current preview's tester from one new non-synthetic check-in; an explicitly
identified UUID may be passed only as a fallback when detection is ambiguous.

Run `/qa` for a read-only health check, venue suggestion, real preview QR, and smoke-test
guide. A confirmed `/qa reset` resets all three rooms and recreates the 36 synthetic
profiles without binding a stale tester. The guarded match scenario detects the founder's
new arrival and prepares a compatible synthetic profile's pre-like separately.

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


### Photo moderation deployment and verification (#194)

The photo migration changes behavior on the one shared development database:
`supabase/migrations/20260908000001_photo_moderation.sql` makes profile storage
private and removes participants' direct profile-photo writes. Coordinate the
application deployment with the founders before applying it. Old application
versions cannot upload or render private photos after this cutover.

Before the cutover, configure `SUPABASE_SERVICE_ROLE_KEY` and a random
`PHOTO_CLEANUP_SECRET` in the deployed server environment, and matching Vault `photo_cleanup_secret` and
`photo_cleanup_url` for `/api/profile-photo/cleanup`. The migration schedules the
worker through pg_cron every 15 minutes. Missing Vault configuration leaves the
worker inactive, so verify dispatch and successful deletion of an isolated
expired upload before calling retention operational. Never delete Storage rows
with SQL; file removal goes through the Storage API.

`SUPABASE_SERVICE_ROLE_KEY` is also required for ordinary profile-photo submission.
Set the development key as a sensitive project-level variable for **all Preview
branches**, not only the branch that introduced the server workflow. Production
configuration is separate; branch overrides are reserved for deliberate exceptions.
New previews inherit this default automatically. Redeploy existing previews after
changing environment variables, and verify successful profile creation with an
isolated photo upload on the actual preview. Local/CI tests with their own service
key do not prove the deployed server has its required configuration. Never expose
the key through `NEXT_PUBLIC_*`, browser code or committed environment files.

At a preview-to-production cutover, verify that `PHOTO_CLEANUP_SECRET` is configured
in Vercel's **Production** environment, not only a branch preview, and matches
Vault. Environment changes require a new deployment. The agent handling the
authorized cutover updates the cleanup URL, removes the preview-only bypass,
and verifies an authenticated database dispatch and isolated expired-object
removal on the released origin. A Ready Vercel deployment alone does not prove
that the worker's production authentication is configured.

After founder-authorized schema changes, regenerate the database types and run
security advisors. Preserve the documented type refinements for trigger-supplied
like fields and nullable SQL function results; the generator cannot infer those
behaviors. Check both a fresh authenticated download and the old public
URL for a legacy image. If a public CDN copy remains accessible, resolve cache
invalidation before treating the private-bucket transition as verified.

`npm run test:logic` includes an isolated PostgreSQL migration/authorization test
using PGlite. It verifies SQL transitions, grants, RLS, queue ordering, retention,
null/stale revisions, discovery restrictions, unmatched likes and preserved
presence. Its small substrate does not simulate the full Supabase platform.
`npm run test:e2e` checks for the migration before creating any fixtures and then
uses isolated participant and founder identities to exercise real Storage,
RPC authorization, simultaneous reviews, upload failure, correction, chats and
returning-user flows. It must pass against the shared development schema.

On the Vercel preview, inspect mobile and desktop: initial unverified photo,
voluntary pending/rejected replacement, displayed-photo rejection, resubmission,
cancellation, correction approval, a stale founder detail, photo enlargement,
a report's photo detail, off-night return, next scan, voluntary hiding, and an
independent venue exclusion. Keep discovery and an existing chat open in another
session; verify removal and neutral avatars without a reload, then test
foreground return and reconnect. Do not mark the PR Ready before these checks.

For repeated preview inspection, `E2E_BASE_URL` runs Playwright against that
existing deployment instead of starting localhost. `E2E_DESKTOP=true` also runs a
1440×1000 Chromium project. `E2E_SCREENSHOTS_DIR` saves the photo moderation states
for human/agent visual inspection. For a protected preview, supply
`E2E_VERCEL_BYPASS` from the authorized project's automation credential; the
browser sends it only to the application origin, never Supabase. Do not put the
credential in screenshots, tracked files or PR text. Local and CI fixtures default to `E2E_FIXTURE_AUTH=password`; isolated confirmed
accounts are removed by the same teardown. The common arrival-to-chat journey
always retains its two anonymous participants. Run summaries report both modes.


### Discovery authorization cutover (#227)

`20260918000001_mutual_discovery_authorization.sql` was applied with founder
approval on 2026-09-18 (remote version `20260918192025`). It revokes participant
reads of profile preferences,
adds the owner-only `get_my_profile()` projection, tightens discovery/Storage
access and removes the legacy profile-preview bypass. Coordinate the application
release with both founders: older home/editor/feed queries asking for preferences
fail closed.
Never restore permissive grants to bridge the cutover. The historical venue
preview field remains false; QA uses the permanent venues' compatible attendance.

After authorized application, regenerate database types (retain nullable owner
bio/photo refinements), run security advisors, then the full hosted gate. The
moderation journey includes real participant direct reads, joined reads, forbidden
preference filters, private Storage, removed RPCs and WebSocket payload checks,
reusing existing identities. Verify the arrival-to-chat and #263 departure/return
journeys, owner editing, global room count and stable card ordering. Inspect the
Vercel preview on mobile: compatible/incompatible discovery, owner preferences,
existing chat after preference changes and hidden/rejected photos. Until the
migration, remote checks and preview inspection are complete, keep any PR draft.


### Founder email campaign verification (#158)

`npm run test:email-campaigns` executes bounded command checks, actual EN/FR/ES
HTML/text rendering, the campaign SQL migration in isolated PGlite, the actual
worker with a fake provider/database and the HTTP handler with isolated Auth
seams. It never contacts Supabase or Resend. `tests/admin/email-campaigns.spec.ts`
intercepts Auth and campaign/database traffic to exercise founder selection,
previews, confirmation, audience changes, failure retries and disabled preview
sending without remote fixtures. These tests support, but do not replace, real
Supabase authorization, concurrent PostgreSQL sessions or Vercel UI inspection.
The worker also retains API-validation coverage; SQL/dependency/tooling changes
continue selecting the full gate.

The behavioral migration was applied with founder approval on September 21
(September 22 UTC; remote version `20260922033810`). Follow
[`admin-email-campaigns.md`](reports/admin-email-campaigns.md) for rollout order,
remaining validation and the requirement to obtain founder approval before any
shared migration or real email send. A preview must never queue a campaign into
the shared outbox: only the production API with email delivery enabled accepts
confirmation or retries.
