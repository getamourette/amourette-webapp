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
| Used by | local, CI (`E2E_*`), every Vercel Preview, QA and demo rooms | Vercel Production only (`getamourette.com`) |
| Service-role key | `.env.local`, GitHub Actions, Vercel Preview | Vercel Production, nowhere else |
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
- **Next:** the rehearsal, scheduled after the reservation rehearsal (#188).
  Apply first any migration merged since commit `cabcfcd`.

## Keeping the two projects aligned

Production exists from 2026-11-16, so this applies to every migration merged
from now on, before and after the cutover.

1. A migration is applied to development while its PR is open, as before.
2. Once the PR is merged, the same file is applied to production by name, with
   founder approval for that application. Files are applied in filename order
   and never skipped; production never receives a migration that is not in
   `main`.
3. After each production application, dump both catalogs with
   `scripts/schema-fingerprint.mjs` and diff them. No difference may appear
   beyond those recorded in this document.
4. A setting changed in a dashboard (Auth, Data API, Storage, keys, Vault
   names) is changed in both projects when it applies to both, and recorded
   here. Nothing is created by hand that a migration could create.

## Rehearsal on the production project, then cleanup

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
   (first names prefixed `QA`, founder-owned mailboxes, Stripe test mode):
   - founder sign-in and password recovery mail; create one venue and one
     night from `/admin`;
   - two anonymous participants: onboarding, HEIC and JPEG photo upload,
     moderation approval, venue entry, presence, mutual like, match, chat;
   - report and block; a founder removal; leaving the venue;
   - a reservation with a founder mailbox when the reservation variables are
     present, with its confirmation mail and arrival QR;
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
   and `auth.users` must hold the founders only. A rehearsal reservation made
   in Stripe test mode is deleted with its payment rows; no test-mode row may
   remain once live keys are configured.

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
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `LAUNCH_EMAIL_ENABLED`,
`LAUNCH_EMAIL_TRACKING_DISABLED`. `LAUNCH_EMAIL_TEST_RECIPIENTS` is never set
in Production. Optional: `PROFILE_PHOTO_REVIEW_ENABLED`, `OPENAI_API_KEY`.

Preview keeps the development values. Its branch-scoped leftovers (two
`SUPABASE_SERVICE_ROLE_KEY` entries and the reservation branch variables of
merged branches) are removed during the rotation.

## Rotate the development keys after the split

Development still uses the legacy JWT `service_role` key, which has been
copied to CI, Preview and every checkout. Rotation replaces it with a secret
key and then turns the legacy keys off, which invalidates every old copy at
once.

1. Create a new secret key on the development project.
2. Replace `SUPABASE_SERVICE_ROLE_KEY` in: Vercel Preview (shared variable),
   GitHub Actions `E2E_SUPABASE_SERVICE_ROLE_KEY`, `.env.local` of each
   founder's main checkout and worktrees on every machine.
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
- **`scripts/test-email-delivery-e2e.mjs`** defaults to the production site
  while creating its users on development; after the cutover it needs
  `EMAIL_E2E_APP_URL` set to a Preview deployment.
