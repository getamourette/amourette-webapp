# Production database: build, verification and cutover (#280)

Runbook for the dedicated EU Supabase production project and the switch of the
public application to it. It also carries the security exit conditions of #367
(SEC-004) and the catalog comparison asked by SEC-018.

**Every remote action below is founder-gated.** An agent prepares and proposes;
a founder approves each migration run, each Vercel change, each deployment and
each key rotation. Nothing here is authorized by this document alone.

## Environments

| | Development | Production |
|---|---|---|
| Supabase project | `BarTap`, ref `szufoicsigmxncghquhj`, `us-east-1` | `amourette-prod`, `eu-west-3` (Paris), created by a founder |
| Used by | local, every Vercel Preview, QA and demo rooms (CI browser jobs use disposable local stacks) | Vercel Production only (`getamourette.com`) |
| Service-role key | `.env.local`, Vercel Preview | Vercel Production, nowhere else |
| Seed and fixture data | yes | never |

Both projects live in the same founder-owned Supabase organization, on the Free
plan as of 2026-11-16 (two active Free projects is the limit; the paused
`dating-app` project does not count). No paid upgrade is authorized yet.

## What the audit of 2026-11-16 found

Method: every file of `supabase/migrations/` replayed in filename order on an
empty database with a stand-in for the Supabase platform objects
(`npm run test:migration-replay`), then the resulting catalog compared with the
development project.

1. **`main` could not rebuild the schema.** `20260726000002_moderation_cases.sql`
   declared `target_venue_id` in one function and `venue_id` in the other, each
   using the other name, so the file failed on an empty database and fourteen
   later files failed after it. The file is corrected to the names of the
   deployed functions; all migrations now replay.
2. **The `profile-photos` bucket was never created by a migration** (made by
   hand in June 2026). `20261116000003_profile_photos_bucket.sql` creates it;
   it is a no-op on development.
3. **The migrations insert the three QA venues** (`test-crowded`, `test-empty`,
   `test-waiting`) and their nights. They are the only rows the replay creates
   besides reference data, and are deleted in production (step 4).
4. **Data privileges match.** For `anon`, `authenticated` and `service_role`,
   SELECT/INSERT/UPDATE/DELETE on every table, the column grants, the execute
   grants, the 42 policies (Storage and Realtime included), the triggers, the
   Realtime publication and the six cron jobs are identical between the replay
   and development, apart from the expected differences below. `anon` has no
   table access; only the two email-unsubscribe RPCs are callable without a
   session.
5. **Expected differences, development versus `main`:**
   - Development only: the unmerged email-campaign objects (2 tables, 14
     functions, 1 trigger, and a different `claim_email_delivery`).
   - `main` only: `public.record_existing_match_events()` (admin-only
     backfill, absent from development). The closed venue listing
     (`20261116000002`) was `main` only at the audit and has been applied to
     development since (2026-11-16, #364), so it no longer differs.
   - `private.admin_founder_analytics_including_tests()` differs (development
     lacks the `live_messages` part). It is a renamed historical copy with no
     caller in the application.
   - Not a difference, although first recorded as one: both projects grant
     `MAINTAIN`, `TRUNCATE`, `REFERENCES` and `TRIGGER` on new public tables to
     the API roles by default, and both kept them on the tables no migration
     had cleaned (measured on 2026-11-19: identical counts). The first catalog
     comparison excluded these four privileges, so it could not see them.
     `20261119000001_revoke_leftover_api_privileges` removes them and the
     default; the comparison now covers every privilege and the default
     privileges.
6. **Migration history differs from the files**: seven files of `main` have no
   remote history row although their effects are present, and nine version
   prefixes are shared by two files each (the latest pair is
   `20261116000002_close_venue_listing` and `20261116000002_launch_unpaid_hold_cap`).
   The Supabase CLI keys history on that prefix and cannot push this
   directory; migrations are applied one by one by name (step 2).

Created by hand on development and **not** reproduced by migrations, so set
explicitly in production: Auth settings, the seven Vault secrets, founder admin
rows, and the name of the night lifecycle job.

## Build the production project

1. **Create the project** (founder, dashboard): organization of the existing
   project, name `amourette-prod`, region `eu-west-3`, Free plan, generated
   database password kept in the founder's password manager. Report only the
   project ref.
2. **Apply the migrations** in filename order, one history row per file, named
   after the file without its numeric prefix, through the Supabase MCP or
   Management API `apply_migration`. The platform assigns each history version
   from the time of the call, so files sharing a prefix do not collide; wait
   at least one second between two files, since that version has a one-second
   resolution. Stop at the first error. Afterwards the history must hold one
   row per file, in the same order as the directory. No SQL is run before
   them and no dashboard object is created. The closed venue listing is part
   of this replay: production starts with it applied.
3. **Compare catalogs.**
   `node scripts/schema-fingerprint.mjs dump <ref> <file>` for both projects,
   then `diff`. The only differences allowed are those listed in finding 5,
   plus `seed_rows` and `vault_secret_names`. Run the Supabase security and
   performance advisors and resolve or record every notice. Compare the
   extension list: anything the platform enabled by default and development
   does not have (for example `pg_graphql`) is reviewed before real data.
4. **Remove what the migrations seeded and rename the job** (SQL, founder
   approved):
   ```sql
   delete from public.venues where is_test_venue;
   select cron.unschedule('bartap-close-ended-nights');
   select cron.schedule('amourette-venue-night-lifecycle', '* * * * *',
     $$select public.run_venue_night_lifecycle();$$);
   ```
   Expected afterwards: `venues`, `venue_nights`, `admins`, `profiles` and
   `auth.users` are empty. Development keeps the legacy job name (#200). A later
   migration that reschedules the job by its legacy name must be followed by
   the same rename in production.
5. **Auth settings** (dashboard, founder), matching development unless noted:
   anonymous sign-ins on; email provider on; secure password change on; JWT
   expiry 3600 s; Site URL `https://getamourette.com`; redirect allow-list
   exactly `https://getamourette.com/admin/reset-password` (no localhost, no
   preview wildcard). Data API: exposed schemas `public, graphql_public`, max
   rows 1000; `private` is never exposed. API keys: use the publishable and
   secret keys; leave legacy JWT keys disabled.
6. **Founder access**: each founder creates their own Auth user (email and
   password, 12 characters minimum), then one founder-approved statement adds
   both ids to `public.admins`. No other row is inserted by hand.
7. **Vault secrets stay empty until the rehearsal.** The three dispatchers
   (`email_worker_*`, `photo_cleanup_*`, `launch_worker_*`) return without
   calling anything while their URL or secret is missing, so the cron jobs are
   inert until step 2 of the rehearsal. Production never gets a
   `*_bypass` secret.

## Build log

- **2026-11-16.** Project `amourette-prod` (ref `ywiiiggxvytnmkogsfnq`) created
  in `eu-west-3`, Free plan, in a separate `Amourette` organization so a paid
  plan can later apply to production alone. Created with "Automatically expose
  new tables" off: grants come from migrations only.
- **2026-11-16.** Steps 2 to 4 done from branch commit `cabcfcd`: 115
  migrations applied by name, 115 history rows with distinct versions in file
  order. Catalog comparison with development shows only the finding 5
  differences plus newer `pg_net` and `supabase_vault` versions. Security
  advisors report no error; warnings match development. The three test venues
  are deleted and the night job is `amourette-venue-night-lifecycle`; `venues`,
  `venue_nights`, `admins`, `profiles` and `auth.users` are empty.
- **2026-11-16.** Step 5 done in the dashboard and read back: anonymous
  sign-ins on, Site URL and the single redirect URL set; every other Auth
  setting already matched development. Legacy API keys are disabled and the
  legacy HS256 JWT secret is revoked (the Management API `postgrest`
  configuration endpoint returns that secret, and it had been printed once in
  a setup session log: filter that response when reading it). Tokens are
  signed with the project's ECC key.
- **2026-11-16.** Step 6 done for one founder: one Auth user, one row in
  `public.admins`. The second founder account is created before the first
  night.
- **2026-11-19.** Anonymous sign-in limit raised from 30 to 300 per hour per
  IP address on both projects. Development: set through the Management API and
  read back (the other Auth rate limits are unchanged). Production: set by the
  founder in the dashboard and recorded from a screenshot of the field; the
  API read-back is still owed and is cutover step 2.
- **2026-11-19.** Read back through the API: anonymous sign-in limit 300,
  Auth settings unchanged, one user, one admin, no venue, 115 history rows.
- **2026-11-19.** `20261119000001_revoke_leftover_api_privileges` applied to
  development, then to production (116 history rows), with founder approval
  for each: no API role holds `TRUNCATE`, `REFERENCES`, `TRIGGER` or
  `MAINTAIN` any more, data privileges are unchanged table by table, and the
  extended comparison shows identical table privileges, default privileges and
  policies. Remaining differences: the email-campaign objects (development
  only), `public.record_existing_match_events()` (production only), the night
  job name, Vault names and row counts.
- **2026-11-20. Cutover done; `getamourette.com` serves production.** The
  founder chose to cut over directly instead of rehearsing on a staged
  deployment first (`docs/decisions.md`): development held no real
  registration or reservation, production was empty, and a staged
  `*.vercel.app` URL sits behind Vercel deployment protection, which blocks
  both a second test browser and the database workers.
  - Vercel Production: `NEXT_PUBLIC_SUPABASE_URL` and
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` split into a Preview entry
    (development) and a Production entry (production). The former shared
    entries were of the sensitive type, which Vercel no longer accepts for a
    `NEXT_PUBLIC_` name and cannot convert, so they were deleted and recreated
    as plain values. `SUPABASE_SERVICE_ROLE_KEY` replaced by the founder with
    the production secret key. `EMAIL_WORKER_SECRET` and `PHOTO_CLEANUP_SECRET`
    regenerated and mirrored in the production Vault without being displayed.
    `NEXT_PUBLIC_SITE_URL` added; it only feeds email links
    (`lib/server/email-links.ts`).
  - Production Vault: `email_worker_url`, `email_worker_secret`,
    `photo_cleanup_url`, `photo_cleanup_secret`, URLs on
    `https://getamourette.com`. No `launch_worker_*` secret yet (reservations
    are not open) and no `*_bypass` secret.
  - Deployment `amourette-webapp-qk61jq3bn` (commit `2953acf`) redeployed to
    Production. Previous deployment, for rollback while no real data exists:
    `amourette-webapp-9izpg1xr5`.
  - Verified: the browser bundle contains the production project ref and no
    development ref; the publishable key is accepted by production Auth; both
    workers answer 200 to the database dispatchers; anonymous sign-in limit
    read back at 300 after the deployment; Preview variables still resolve to
    development.
  - Tested on the domain with `QA` identities: founder sign-in and recovery
    mail, venue and night creation, two participants with photos, mutual like,
    match, chat, report, block, and the scheduled end of the night (presence
    closed, likes, matches and messages deleted, night report kept). An open
    night's schedule is locked in `/admin` and there is no "end now" action
    (#431), so the closing time of the test night was moved by one
    founder-approved statement. Not tested: email subscription and
    unsubscribe; reservations (their variables are absent from Production).
  - Cleanup verified by counts: four anonymous users and the test venue
    deleted; every application table is empty except `admins`,
    `private.matching_consent_wordings` and the five bookkeeping rows a
    migration writes to `private.unassigned_analytics_cleanup`; `auth.users`
    holds the founder only. Six test files remained in the photo buckets: the
    cleanup worker removes unreferenced files after 24 hours, to be confirmed
    on 2026-11-21.
- **2026-11-20. Reservation payments configured in live mode** (steps 2 to
  5 of "Reservation payments go-live"). Live webhook destination created by
  the founder with the seven events; `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET` pasted by the founder; `STRIPE_MODE=live`,
  `LAUNCH_SITE_ORIGIN`, `LAUNCH_EMAIL_ENABLED`,
  `LAUNCH_EMAIL_TRACKING_DISABLED`, `LAUNCH_WORKER_SECRET` and
  `LAUNCH_SECRET_KEY` set by the agent. `LAUNCH_SECRET_KEY` is backed up in
  Marwane's password manager, in an entry named after the variable
  (confirmed by him on 2026-11-20); no other copy exists outside Vercel. Production Vault holds `launch_worker_url`
  and `launch_worker_secret`. Deployment `amourette-webapp-cntndsyar` (commit
  `a061470`); the payments worker answers 200 with no `worker_incomplete`.
  **Resend tracking verified off** for `getamourette.com` on 2026-11-20 (no
  tracking subdomain configured: Domains > getamourette.com > Configuration
  shows "Enable tracking metrics: Configure"), which is what
  `LAUNCH_EMAIL_TRACKING_DISABLED=true` asserts. Recheck only if someone
  configures tracking there. The Stripe balance is not funded yet. The
  real-money pass (step 6) is next.
- **2026-11-23.** `20261123000001_launch_arrival_early_window.sql` (#435,
  arrival confirmed from 60 minutes before the start) applied to production,
  history version `20261123092332`; the catalog comparison with development
  showed no new difference. This was the last migration applied by hand: the
  ledger baseline of 2026-11-24 records it as already applied (see
  "Activation").
- **2026-11-25. SEC-004 exit conditions checked (#367)**, from names, targets
  and dates only, never values:
  - Vercel: `SUPABASE_SERVICE_ROLE_KEY` has one Production entry, last updated
    on 2026-11-20 (the cutover). Its Preview entries (one shared, two scoped to
    merged branches) were last updated in September 2026, before the
    production project existed on 2026-11-16, so none can hold a production
    key. The Development environment holds no Supabase variable, so
    `vercel env pull` cannot bring one into a checkout.
  - GitHub: the only repository secret is `E2E_ARTIFACT_KEY`; the
    `E2E_SUPABASE_*` secrets are gone and the browser jobs use the keys of
    their own disposable stack. Production credentials live only in the
    `database-production` environment, restricted to `main` (the migration
    connection and the Vercel deployment token of #434); the deploy job builds
    on Vercel and does not pull the Production variables onto the runner.
  - Checkouts: every `.env.local` on the founders' machines targets the development
    project with a development key; no file outside the documentation names
    the production project.
  - Tooling: every script or test helper that reads the service-role key calls
    the development-target guard before its first client
    (`scripts/test-development-target.mjs` fails otherwise).
    `test:email-delivery-e2e` no longer defaults to the production site.
  - Not done: the rotation of the development keys (next section). Until then
    the old legacy key still opens the development project only: production
    was created separately, its legacy keys are disabled and its legacy
    secret revoked. Development holds fixtures and founder test accounts, no
    third-party personal data (counted by email domain on 2026-11-25).
- **Next:** rotate the development keys and repoint the development Vault
  worker URLs (see "Still open").

## Keeping the two projects aligned

Production exists from 2026-11-16, so this applies to every migration merged
from now on, before and after the cutover.

1. Since #434 is in service, a merge into `main` runs the migrate and deploy
   workflow below: pending files go to development, then production, in
   filename order, never skipped; both catalogs are compared; only then is the
   code deployed. Production never receives a migration that is not in `main`.
2. No thread applies a migration file to either project by hand (MCP
   `apply_migration`, SQL editor, `psql`): the ledger would not know it and the
   next release would fail. A branch tries an additive file on development
   with the workflow's `development` mode.
3. The comparison fails on any difference that
   `supabase/catalog-differences.json` does not record with its reason.
4. A setting changed in a dashboard (Auth, Data API, Storage, keys, Vault
   names) is changed in both projects when it applies to both, and recorded
   here. Nothing is created by hand that a migration could create.

### Migration ledger (#434)

`scripts/apply-migrations.mjs`
applies the pending files of `supabase/migrations/` to one database, in
filename order, one transaction per file, and records each one in
`migration_ledger.applied` (file name, SHA-256, date, branch, commit, run
link). That table is created by the command itself, in a schema no API role
can use; it is tooling state, not application schema, and
`scripts/schema-fingerprint.mjs` does not compare it.

- `status` lists pending files; `apply` applies them and stops at the first
  error, leaving the failed file rolled back and unrecorded.
- Nothing is applied when a file was edited after it was applied, when a new
  file sorts before one already applied from `main`, or when the checkout
  lacks a file applied from `main`.
- `baseline --through <file>` runs once per existing database: it records the
  files already present as applied without executing them. Until it has run,
  a hosted database refuses every `apply`: with an empty ledger, every file
  would run again on top of the existing schema.
- `MIGRATION_TARGET` (`local`, `development`, `production`) must match the
  project designated by `MIGRATION_DATABASE_URL`, so a secret stored in the
  wrong place is refused. Production is accepted only inside GitHub Actions on
  `main`.
- A migration added after `20261123000001` contains no `BEGIN`, `COMMIT` or
  `ROLLBACK`: the ledger owns the transaction.
- A removal (`scripts/migration-kind.mjs`) applied to a database that already
  has ledger rows is preceded, in its transaction, by a copy of every
  application table (below). A fresh replay on an empty database has nothing to
  save and takes no copy.

#### Saved copies and restore (#510)

**What is saved.** Before a removal, the ledger takes a `SHARE` lock on every
table of `public` and `private` (no write lands between the copy and the
removal; `lock_timeout` stays 10 s), copies each one with
`create table … as table …` into `removal_backup_<version>_<hash>.<schema>__<table>`,
then runs the file and records it, all in one transaction. The schema is not
exposed by the Data API and no role but its owner can use it.
`migration_ledger.removal_backups` records the file, the schema, the number of
tables and rows, and when the copy was dropped. The run log prints those names
and counts, never a row. Definitions, grants and policies are not copied: the
migrations that created them are in git.

**Retention.** A copy holds participant data, so it is dropped by the first
ledger run (every merge runs one on both databases) more than 30 days after it
was saved. It is in the same database, so an erasure request is applied to it
like to the live tables, and the privacy policy's sentence on backups covers
it. It protects against a wrong removal, not against losing the project: a
daily backup of production is a separate decision (#523).

**Restore** (a founder decision, through a pull request like any schema
change; within 30 days of the removal):

1. Find the copy: `select * from migration_ledger.removal_backups order by
   saved_at desc` (read-only). Its name derives from the file name alone, so
   it is the same on both databases.
2. Write a new migration that recreates the object as the git history defined
   it, then copies the rows back from the copy, guarded so the file still
   replays on an empty database where the copy does not exist:

   ```sql
   alter table public.t add column label text;
   do $$ begin
     if to_regclass('removal_backup_20270201000003_1a2b3c4d.public__t') is not null then
       update public.t set label = b.label
       from removal_backup_20270201000003_1a2b3c4d.public__t b where b.id = t.id;
     end if;
   end $$;
   ```

   For a dropped table, recreate it, then
   `insert into public.t select * from removal_backup_….public__t` inside the
   same guard, and restore its grants and policies from git.
3. Merge it: the workflow applies it to development, then production, each
   database restoring from its own copy. Nobody runs it by hand.

This procedure is executed for real by `scripts/rehearse-removal-backup.mjs`
in the workflow's rehearsal (below) and by `npm run test:migration-ledger`.

### Migrate and deploy workflow (#434)

`.github/workflows/deploy.yml` is the only path from `main` to production:
migrate development, migrate production, compare both catalogs, deploy. Every
push to `main` runs it in `release` mode. Vercel no longer deploys `main` on its
own (`vercel.json`, `git.deploymentEnabled.main: false`); previews of other
branches are unchanged. A founder can also run a mode by hand ("Run workflow").

| Mode | What it does | Touches |
|---|---|---|
| `rehearsal` | the whole chain on two disposable local stacks, plus a removal rehearsal on the first (refused while its save fails, then saved, removed and restored); also runs on every pull request that changes this machinery | nothing hosted |
| `compare` | dumps both hosted catalogs in read-only transactions and checks them | reads both |
| `baseline` | records the files up to `through` as already applied, executing nothing; once per database | writes the ledger of both |
| `development` | applies pending additive files to development, from any branch, to try a preview | development |
| `release` | the whole chain, then the Vercel production deployment; `main` only; what every merge runs | both, then Vercel |

- **Secrets** live in two GitHub environments and nowhere else.
  `database-development` (any branch): `MIGRATION_DATABASE_URL`, the session
  pooler connection string of the development project. `database-production`
  (branch policy: `main` only): `MIGRATION_DATABASE_URL` of the production
  project, plus `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`. A
  founder pastes them; no agent thread holds them. The tools refuse a
  connection string that does not designate the project of its environment.
- **Catalog comparison.** `scripts/schema-fingerprint.mjs dump-database` reads
  the catalog without row counts; `check` fails on any difference that
  `supabase/catalog-differences.json` does not record with its reason. That
  file is the machine-readable form of finding 5 above. It was filled from the
  first `compare` run on the two hosted projects (2026-11-23): 57 differences,
  each with its reason, all already known (the unmerged email-campaign objects
  on development, `record_existing_match_events` and the analytics copy, the
  renamed lifecycle job, the test-only bypass secret, newer `pg_net` and
  `supabase_vault` versions in production). Keys are listed one by one, never by
  wildcard, so a new object of the same family is still refused. Merging the
  email-campaign work, or aligning the job name, removes its entries.
- **A removal is saved first** (#510). The Free plan has no backup, so before
  the ledger applies a removal it copies every table of `public` and
  `private`, rows included, into a schema of its own,
  `removal_backup_<14-digit version>_<8-character hash of the file name>`, in the same transaction as
  the removal: if the copy fails, nothing is removed, on either database. See
  "Saved copies and restore" below.
- **On failure** the run stops before the deployment, the previous code keeps
  serving, and one issue ("Release stopped: production is behind main") is
  opened or updated with the run link. Fix forward with a new pull request;
  the next successful release closes the issue. Merges queued meanwhile are
  not lost: the next run applies everything `main` holds.
- The public repository sees file names, counts and Postgres error codes and
  messages; never a connection string, a host or a row.
- **TLS is verified** against the Supabase Root 2021 CA pinned in
  `supabase/ca/supabase-root-2021.crt`: Supabase signs its database
  certificates with its own root, which no system store holds, so a plain
  verified connection fails with `SELF_SIGNED_CERT_IN_CHAIN`. The pinned file is
  the one the dashboard offers for download (SHA-256
  `80:70:25:AD:…:72:E6:CA:FA`, checked against the certificate both poolers
  present). TLS parameters in a pasted connection string (`sslmode`, …) are
  ignored so they cannot weaken this. The certificate expires on 2031-04-26.

### Activation (#434, one time, done 2026-11-24)

The baseline mode runs from `main` only, so the activation pull request is
merged first. Its own release is refused by the empty ledgers, which is the
intended stop, not a failure to investigate.

1. **Freeze.** From this step on, no thread applies a migration by hand, and
   nothing else is merged until step 4 succeeds.
2. **Merge the activation pull request.** Vercel stops deploying `main`; the
   release it starts refuses both databases ("The ledger of this database is
   empty") and opens the release issue, which proves the alert path.
3. **Baseline**, with founder approval: "Run workflow" on `main`, mode
   `baseline`. `through` = the last file production already holds;
   `development_through` = the last file development holds, when a file was
   applied to development only. Both ledgers then list those files as
   recorded, not executed. The comparison of this run may fail while
   development is ahead; that is expected.
4. **Release**: re-run the refused release run. It applies to production what
   it lacks, compares both catalogs, deploys through the Vercel CLI and closes
   the release issue. If Vercel refuses the deployment (daily limit of the
   Hobby plan, or `vercel.json`), the databases are already migrated, the
   previous code keeps serving, and "Re-run failed jobs" once the limit
   resets deploys it. If the CLI were refused because of `vercel.json`, the fix
   is a pull request that deploys a prebuilt output instead
   (`vercel build --prod`, then `vercel deploy --prebuilt --prod`).
5. Check that the release produced exactly one production deployment, from
   the workflow, and none from Git.

**Done on 2026-11-24.** #500 merged at 23:40 UTC on 2026-11-23; its release
was refused by the empty ledgers and opened #504. The baseline recorded 119
files on development and 118 on production. The re-run release applied
`20261123000476_launch_access_until_night_end.sql` to production, compared the
catalogs (57 recorded differences, none unexpected), deployed `62b24df`
through the Vercel CLI as the only production deployment, and closed #504.
Vercel accepted the CLI deployment with `main` disabled in Git.

**First activation, 2026-11-23/24:** `20261123000476_launch_access_until_night_end.sql`
was applied by hand to development only (PR #502), so step 3 uses
`through = 20261123000002_superseded_launch_access.sql` and
`development_through = 20261123000476_launch_access_until_night_end.sql`.

## Rehearsal on the production project, then cleanup

> Not run as written: on 2026-11-20 the same test list and cleanup ran on
> `getamourette.com` right after the cutover (build log). Kept as the
> procedure for a staged check once production holds real data. A staged
> `*.vercel.app` deployment is behind Vercel deployment protection, so it
> additionally needs a temporary protection bypass for the test browsers and
> the worker URLs.

The service-role key must not leave Vercel Production, and seed, QA and E2E
tooling refuses any project but development. The rehearsal therefore runs
through the real application, on a production deployment that is **not** yet
attached to the domain.

1. Freeze merges to `main` for the window (a merge would auto-deploy to the
   domain with the new variables).
2. Set the Production variables (next section) and the Vault secrets with the
   worker URLs of the staged deployment, then
   `vercel deploy --prod --skip-domain`. `getamourette.com` keeps serving the
   previous deployment and the development database.
3. On the staged URL, with founder phones and synthetic identities only
   (first names prefixed `QA`, founder-owned mailboxes):
   - founder sign-in and password recovery mail; create one venue and one
     night from `/admin`;
   - two anonymous participants: onboarding, HEIC and JPEG photo upload,
     moderation approval, venue entry, presence, mutual like, match, chat;
   - report and block; a founder removal; leaving the venue;
   - no reservation here: a Production deployment accepts live Stripe only
     (#408), and the return origin is the domain. The reservation journey is
     proven by the real-money pass after the cutover ("Reservation payments
     go-live" below);
   - email subscription and unsubscribe link;
   - close the night and check that presence, likes, matches, messages and
     ejections of that night are gone and that the night report exists.
4. Check the advisors again, `cron.job_run_details` for failures, and the
   Vercel logs of the photo, email and reservation routes.
5. **Cleanup, verified by counts** (SQL, founder approved): delete the
   synthetic Auth users (their profiles, presence, likes, matches and messages
   cascade), their Storage objects in the four photo buckets, the rehearsal
   venue, its nights, reports, analytics and email rows. Every application
   table except `admins` and `private.matching_consent_wordings` must be empty,
   and `auth.users` must hold the founders only. No test-mode payment row
   can exist: Production refuses test keys, events and objects (#408).

Left for the launch issues, not this rehearsal: the reservation rehearsal
(#188), the load test (#262) and phone QA (#48) run on this database after the
cutover of the variables and before real participants.

## Cutover

Preconditions: the unpaid-hold limit is in `main` (merged on 2026-11-16, #390)
and replayed with the rest; the closed venue listing is applied to production by the replay, so the
application deployed must contain `venue_by_slug` (it has since #391); the
rehearsal cleanup is verified; no real registration exists on development (if
one does, decide its treatment explicitly rather than deleting it).

1. Apply to production any migration merged since the build (step 2 above) and
   rerun the catalog comparison.
2. Confirm the anonymous sign-in limit on production is 300 per hour per IP
   address (Authentication > Rate Limits, or `rate_limit_anonymous_users` in
   the Management API auth configuration; set on 2026-11-19), read the value
   back and record it in the build log. Every guest of a night creates an anonymous session
   from the same venue Wi-Fi address, so the default of 30 would refuse most of
   about 100 first-time arrivals (#262).
3. Point the Vault worker URLs at `https://getamourette.com`.
4. Promote the verified deployment (`vercel promote <url>`), or redeploy `main`
   to Production if it moved.
5. On `https://getamourette.com`: the browser calls the production project
   host; a real QR scan reaches the venue; founder sign-in works; one
   synthetic participant completes onboarding and is deleted again. Read
   `rate_limit_anonymous_users` once more: it must still be 300.
6. Confirm a Preview deployment and a local `npm run test:e2e` still use
   development, then lift the merge freeze.
7. Rotate the development keys (below) and record region, environment mapping
   and evidence here and in #203.

**Rollback limit.** Before the first real participant or reservation, rolling
back is re-promoting the previous deployment and restoring the three Supabase
variables. After real data exists in production, the public site is never
pointed back at development: fix forward.

## The production venue slug, before its QR is printed (#472)

The venue slug is the only key to its room: whoever knows it can check in from
anywhere until proof of presence ships (#395). The venue name is public, so the
slug must not be derivable from it. A venue created from `/admin` since #472
gets `<name>-<16 random characters>`; check the URL shown on its page ends with
that suffix before printing or sending the QR.

A venue created earlier keeps a name-only slug, and renaming does not change it.
Give it a random one with this one-off statement in the SQL editor of the
project, then reprint the QR (the old one stops working, which is the point):

```sql
update public.venues
set slug = left(slug, 47) || '-' || replace(gen_random_uuid()::text, '-', '')
where id = '<venue uuid>' and not is_test_venue
returning slug;
```

The suffix is 32 hexadecimal characters from a random UUID (122 bits); the
result stays within the 80-character slug contract. Never post the slug or the
QR image anywhere public (social posts, the booking page, emails).

## Vercel Production variables

Today `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are
single variables shared by Preview and Production. They must be split.

| Variable | Change at cutover |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Restrict the existing variable to Preview; add a Production-only one with the production URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same split, with the production publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Replace the Production value with the production secret key, pasted by a founder from the Supabase dashboard into Vercel; never copied anywhere else |
| `EMAIL_WORKER_SECRET` | New random value, mirrored in the production Vault |
| `PHOTO_CLEANUP_SECRET` | New random value, mirrored in the production Vault |
| `NEXT_PUBLIC_SITE_URL` | Add `https://getamourette.com` (absent today; printed QR codes depend on it) |

Unchanged: `EMAIL_DELIVERY_ENABLED`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
`RESEND_WEBHOOK_SECRET`.

Absent from Production today and required before reservations open; they
belong to the reservation go-live but are set in the same window if it is
ready: `LAUNCH_SECRET_KEY` (new, backed up privately), `LAUNCH_SITE_ORIGIN`
(`https://getamourette.com`), `LAUNCH_WORKER_SECRET` (new, mirrored in Vault),
`STRIPE_MODE`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`LAUNCH_EMAIL_ENABLED`, `LAUNCH_EMAIL_TRACKING_DISABLED`. Their values and order
are in "Reservation payments go-live" below. `LAUNCH_EMAIL_TEST_RECIPIENTS` is never set
in Production. Optional: `PROFILE_PHOTO_REVIEW_ENABLED`, `OPENAI_API_KEY`.

Preview keeps the development values. Its branch-scoped leftovers (two
`SUPABASE_SERVICE_ROLE_KEY` entries and the reservation branch variables of
merged branches) are removed during the rotation.

## Reservation payments go-live (#408)

Founder only, after the cutover: `getamourette.com` must already serve the
production database, because Stripe returns guests to `LAUNCH_SITE_ORIGIN`.
The code accepts live Stripe on Vercel Production only and test Stripe
everywhere else; any mismatch disables payments instead of mixing modes
(`docs/launch-reservation-policy.md`, "Stripe mode").

**0. Before merging the mode change.** Add `STRIPE_MODE=test` to Vercel Preview
and Development and to every `.env.local` that has a Stripe key. Without it,
reservations on previews and local runs answer 503 by design.

**1. Stripe account (can take days, start first).** Live payments activated
(business details, identity verification, bank account); `charges_enabled` and
the card payments capability active, otherwise Checkout creation stays pending
with `stripe_cards_unavailable`; statement descriptor set; balance funded so
arrival refunds do not wait for funds (board card "Fund the Stripe balance so
arrival refunds do not stall").

Checked with Stripe support on 2026-11-20 for the account `amourette` (owned
by Inbox Pilot, settled in USD): card payments are active and live charges and
refunds are not restricted. Two readings that cost time:

- In Settings > Business > Account status, "Cartes Bancaires payments:
  Suspended" (French UI: "Paiements par carte bancaire") is the French CB
  network only, not card payments. Visa, Mastercard and Amex work; French
  co-badged cards are processed through Visa or Mastercard, in EUR. Only a
  CB-only card would be refused.
- The account settles in USD while deposits are charged in EUR, so each
  payment and each refund is converted. Expect a higher fee than a euro
  account; measure it in the real-money pass.

**2. Stripe Dashboard, live mode.** Create one webhook endpoint:

- URL `https://getamourette.com/api/launch/webhook` (the exact host of
  `LAUNCH_SITE_ORIGIN`; a redirecting host loses deliveries);
- events from your account, snapshot payloads, API version
  `2026-10-28.endive`. The Dashboard only offers the latest release of each
  named version, so the `2026-09-30.endive` the code pins
  (`STRIPE_VERSION`) cannot be selected; monthly releases under one name are
  backward compatible. Never pick the account default (`2026-08-26.dahlia`
  on 2026-11-20), which is the previous named version;
- `checkout.session.completed`, `checkout.session.expired`,
  `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `refund.created`, `refund.updated`,
  `refund.failed`.

Keep its signing secret (`whsec_...`) and a standard live secret key
(`sk_live_...`; a restricted `rk_live_` key is refused). Paste both straight
from Stripe into Vercel, nowhere else.

**3. Vercel, Production scope only.**

| Variable | Value |
|---|---|
| `STRIPE_MODE` | `live` |
| `STRIPE_SECRET_KEY` | the live secret key |
| `STRIPE_WEBHOOK_SECRET` | the signing secret of the live endpoint |
| `LAUNCH_SITE_ORIGIN` | `https://getamourette.com` |
| `LAUNCH_SECRET_KEY` | new 64 lowercase hex, backed up privately, never rotated while reservations exist |
| `LAUNCH_WORKER_SECRET` | new 64 lowercase hex |
| `LAUNCH_EMAIL_ENABLED` | `true` |
| `LAUNCH_EMAIL_TRACKING_DISABLED` | `true`, only after checking open and click tracking are off for the sending domain |

`RESEND_API_KEY` must be present; `LAUNCH_EMAIL_TEST_RECIPIENTS` must not.
Preview and Development keep `STRIPE_MODE=test` and the test key. Redeploy
Production: variables apply to new deployments only.

**4. Payments worker on the production database.** In the production Vault:
`launch_worker_url` = `https://getamourette.com/api/launch/process`,
`launch_worker_secret` = the same value as `LAUNCH_WORKER_SECRET`, and no
`launch_worker_bypass`. The `amourette-launch-payments` cron job then calls
the worker every minute; check one `cron.job_run_details` success and a 200 in
the Vercel log of `/api/launch/process`. The development Vault keeps pointing
at a Preview.

**5. Checks before any money moves.** A Preview still creates a test
Checkout; the Production log of `/api/launch/process` shows 200 and no
`worker_incomplete` (a 503 there means the mode, key or account is wrong).

**6. Real-money pass**, on a founder-only test night that is not announced:

1. Reserve with a real card and a founder mailbox: EUR 10 charged, payment
   visible in Stripe live mode, confirmation mail with QR received.
2. Confirm the arrival from `/admin`: the full refund succeeds in Stripe and
   the refund mail arrives.
3. Second reservation, then a cancellation before the deadline: one full
   refund, one place released.
4. Record in `docs/reports/launch-reservation-rehearsal.md`: the Stripe fee
   actually kept per payment, the refund delay, what the bank statement shows,
   and the mode of each object (the admin "View payment in Stripe" link must
   open the live Dashboard).

**7. Cleanup by count**, founder approved: delete the test night with its
reservations, payment, refund, mail and audit rows; state the expected count of
each before deleting and read zero back after. The Stripe payments and refunds
themselves stay in the account as the accounting record.

**8. Before each night: fund the Stripe balance.** Founder only, in the
Stripe Dashboard. What Stripe documents (https://docs.stripe.com/refunds and
https://docs.stripe.com/get-started/account/add-funds, read 2026-11-25):

- a refund is taken from the **available** balance, never from pending funds;
- when that balance is short, a card refund stays **pending** until funds are
  available, and **fails** with `insufficient_funds` 45 days after it was
  created;
- processing fees are not returned on a refund; Stripe keeps no fee on a
  reversal (a payment cancelled shortly after it was made);
- funds are added from Balances, "Add funds", by a bank transfer to the
  account details shown there or from the linked bank account. A SEPA transfer
  takes about 1 to 2 business days, and Stripe warns that availability may be
  delayed on an account with few top-ups.

Observed on 2026-11-25 (night C, rehearsal report): a two-day-old EUR 10
payment was refunded in full and **succeeded in the same second**, while the
account had nothing available (Balances total USD -0.16 afterwards, the
incoming funds of another deposit still pending).

Each guest's own deposit is on the account on the night, available or still
pending, and covers that guest's refund. What is missing is only the Stripe
fee each refunded reservation loses (EUR 0.69 on a EUR 10 card payment). So
the balance is funded for the fees, not for the deposits (founder decision,
2026-11-25). If Stripe ever held a refund back as its documentation says, the
refund would wait until that deposit becomes available, about a week on this
account, far from the 45-day failure: a delay to watch, not a loss.

This holds only while the deposits stay on the account: **payouts stay
manual** (set on 2026-11-21, confirmed by the founder on 2026-11-25). An
automatic payout would send the deposits to the bank before their refunds.

1. **Amount.** Capacity x EUR 0.69, plus a margin, plus any negative balance
   shown on Balances. Fund in EUR: the payment of 2026-11-23 and its refund
   stayed in EUR, with no conversion. For the first night of 2026-12-10 at the
   planned 30 places (the bar's figure is not confirmed): 30 x 0.69 = EUR
   20.70, so **EUR 30**. Recompute when the capacity or the deposit changes.
2. **When.** The transfer leaves the bank at least five business days before
   the night (for 2026-12-10: by Thursday 2026-12-03), so the funds are
   available even if the first top-up is delayed. In 2026, not before night
   D's refund on 2026-12-02, which must run on an unfunded balance.
3. **Check** on the day of the night, before arrivals open: Balances shows at
   least the amount of step 1 available, and payouts are still manual.
4. **The morning after the night.** In `/admin`, every confirmed arrival has a
   succeeded refund. For any other (`docs/launch-reservation-policy.md`,
   founder procedure for an unresolved deposit), open the reservation and use
   **Take responsibility for refund**, then:
   - **pending**: add funds if the balance is short and let the worker
     reconcile; never create another refund for it. Check again a week later
     until none is left, well before the 45-day failure;
   - **failed**: adding funds does not retry it. Use **Reconcile refund**, then
     **Replace failed refund** once the server has verified the failure and the
     returned funds; that verified replacement is the only second refund
     allowed.

**Rollback.** Set `STRIPE_MODE` to anything but `live` (or remove it) and
redeploy: checkout, worker and webhook then refuse everything. Do this only
with no paid reservation outstanding, since refunds stop too.

## Rotate the development keys after the split

Development still uses the legacy JWT `service_role` key, which has been
copied to CI, Preview and every checkout. Rotation replaces it with a secret
key and then turns the legacy keys off, which invalidates every old copy at
once.

1. Create a new secret key on the development project.
2. Replace `SUPABASE_SERVICE_ROLE_KEY` in: Vercel Preview (shared variable)
   and `.env.local` of each founder's main checkout and worktrees on every
   machine. GitHub Actions holds no development key any more. Delete the two
   branch-scoped Preview entries of `SUPABASE_SERVICE_ROLE_KEY`
   (`feature/admin-photo-replacement`, `feature/empty-room-states`) and the
   other Preview variables scoped to merged branches.
3. Run the browser suite once on a PR and one `npm run qa -- status` locally.
4. Disable the legacy API keys (`anon` and `service_role`), delete the previous
   secret key, and replace the publishable key if a founder wants a full
   rotation (it is public by design).
5. Rotate the development database password and the worker secrets kept in
   the development Vault and in Preview.
6. Check that the former production values are gone from every place listed
   in SEC-004, then close #367.

## Still open (does not block the technical preparation)

- **Plan and backups.** Free has no downloadable backup and pauses a project
  after a week without activity. Record the tier chosen for launch, its backup
  and log retention, and the restore procedure; any paid upgrade needs explicit
  founder authorization. The Vercel Hobby plan excludes commercial use.
- **Anonymous sign-in rate limit.** 300 per hour per IP address on both
  projects since 2026-11-19; token refresh stays at 150 per five minutes per IP
  address. 300 covers a night of about 100 first-time guests behind one
  address with a margin of three. Raise it before a night expected above 250
  guests, and confirm the value with the load test (#262).
- **CAPTCHA on anonymous sign-in (#376, SEC-013).** Deferred until the week
  after the first night, risk accepted on 2026-11-19 (`docs/decisions.md`).
  Until then the 300 per hour limit is the only brake on scripted anonymous
  accounts. It must exist before any wider communication.
- **Auth mail.** Founder recovery mail uses Supabase's built-in sender, which
  is rate-limited and meant for testing; decide whether to configure SMTP.
- **Compliance records of #280**: Supabase international access and transfer
  assessment, Vercel processing locations and function regions, log retention
  for the chosen tiers, and the verified facts to feed into #203.
- **Stripe settlement and refund funding (found 2026-11-21, before the first
  night).** The Stripe account is American: a EUR 10 payment is converted to
  USD on arrival and its refund converted back, so conversion is paid twice
  per reservation on top of the processing fee. Check whether a EUR balance
  can be kept (Dashboard, Balances, "Add an account or a currency"; it needs
  a bank account in euros) and record the outcome. Update 2026-11-25: the
  payment of 2026-11-23 and its refund stayed in EUR (fee EUR 0.69, no
  conversion) and Balances shows a EUR line; how it was enabled is not
  recorded here. Separately, a payment
  stays pending for about a week on this recent account, so on the night the
  deposits are not available to refund from: decide who funds the balance
  before each night and from which bank account, since a founder's personal
  account may not be accepted. Payouts were switched to manual on
  2026-11-21 so that funds added for refunds are not swept to the bank.
- **Development workers after the cutover.** The development Vault still
  points `email_worker_url` and `photo_cleanup_url` at
  `https://getamourette.com`, which now refuses the development secrets.
  That refusal is intended, but email delivery and photo cleanup are idle on
  development until those URLs point at a development deployment; do it with
  the key rotation.
- **Automated visitors create anonymous accounts.** Two anonymous users were
  created by headless browsers seconds after the deployment (Vercel's own
  post-deployment visit). Any crawler that loads a page which signs in
  anonymously does the same; they count against the 300 per hour limit and
  accumulate in `auth.users`. Handle with the CAPTCHA work (#376).
- **`scripts/test-email-delivery-e2e.mjs`** creates its users on development,
  so it refuses to run without `EMAIL_E2E_APP_URL` and refuses the production
  site (#367). A Preview deployment is behind Vercel deployment protection:
  running it needs a protection bypass for that request, not added yet.
