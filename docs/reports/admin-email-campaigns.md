# Upcoming-night email campaigns — #158

Status: migration applied with founder approval; draft preview and live integration testing in progress. No campaign email sent.

## Ticket coverage

| Requirement | Implementation |
| --- | --- |
| Founder Email section | `app/admin/EmailCampaigns.tsx`, existing founder navigation |
| One or more future non-test nights | Server/database validation; 1–20 selections |
| Exact EN/FR/ES preview | Frozen HTML, plain text and fixed subjects from `emails/UpcomingNightsEmail.tsx` |
| Counts without addresses | Service-only aggregate RPC projections; no subscriber PII in HTTP responses |
| Irreversible-send confirmation | Fresh audience review, explicit checkbox and final send button |
| Durable campaign/nights/deliveries | Campaign tables, selected-night IDs, immutable content and unique outbox recipients |
| Rolling seven-day limit | Serialized address reservations, insert guard, claim/retry rechecks |
| Consent/suppression/deduplication | Most recent active subscription; checks at queue, claim and immediately before transport |
| History and all outcomes | Paginated drafts/history; queued/sending/sent/delivered/skipped/failed/unknown counts |
| Definite failure retries only | Failure/provenance filter; unknown has no retry path |
| Global unsubscribe and one-click | Existing private token issuer and headers, runtime URL substitution |
| No room-from-home links | Template contains only the global unsubscribe/preferences link |

## Validation and remaining release work

Local results on September 21:

- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript checking.
- `npm run test:logic`: passed with its temporary fixture directory under
  `node_modules/.cache/campaign-logic`; the existing privacy test rejects macOS's
  default `/private/...` temporary path. No unrelated test assertion was changed.
- `npm run test:email-campaigns`: passed again after the final retry refinements,
  including the actual HTTP handler tests added to the logic gate.
- `E2E_DESKTOP=true npx playwright test tests/admin/email-campaigns.spec.ts`:
  **12 passed**, zero password/anonymous fixture accounts, no remote writes.
- Local mobile/desktop screenshots were inspected for long-name wrapping, email
  preview, confirmation and error states. This is not deployed Vercel inspection.

A subsequent founder-requested test pass reran lint, all campaign SQL/template/API/
worker checks and the complete mobile/desktop campaign browser file: **12 passed**
in 15.2 seconds with zero shared accounts created. Read-only QA status found no
ready Vercel preview for the branch. All permanent fixtures were healthy:
`test-crowded` live with 36 synthetic profiles, `test-empty` live with zero,
and `test-waiting` waiting with zero. The broad diff suggests `test-crowded`, but
campaign-specific testing belongs in `/admin`; test venues are excluded from
campaign selection. No fixture reset, migration, publication or real send occurred.

These local commands used the available Node **24.7.0**. The required hosted gate
must still run with the repository's pinned Node **22.22.1** before delivery.


The isolated PostgreSQL tests execute the migration over the real email foundation
and validate authorization, duplicate-address language selection, idempotent
confirmation, no-effects refusals, frequency boundaries, consent changes, stale
nights, immutable content and definite-failure retries. These are single-connection
PGlite tests, not proof of real concurrent Supabase sessions.

Actual component rendering and worker tests run without network calls. Browser
journeys use intercepted Auth/campaign/database responses, render the real email
component outside Playwright's JSX transform, and create zero shared fixtures.
They validate selection, languages, plain text, confirmation/cancellation,
changed-audience errors, confirmation focus, preview-disabled sending, definite-failure retries, unknown-state refusal and the empty state. HTTP
unauthenticated refusal tests hit the local production server.

The shared schema/grants were inspected before application. After explicit founder
approval, `admin_email_campaigns` was applied at **2026-09-22 03:38 UTC**, remote
version **20260922033810**. Supabase types were regenerated and the campaign
projections reconciled without pulling unrelated remote moderation work or losing
existing nullable/trigger refinements. Security advisors added only two expected
`rls_enabled_no_policy` informational notices for the service-only campaign tables;
existing warnings were unchanged. Direct grant inspection confirms no anonymous
or authenticated campaign table/command access and no queued campaign deliveries.

The approved behavioral migration
`supabase/migrations/20260921000002_admin_email_campaigns.sql` is applied before
this worker deployment, which requires `authorize_email_transport`.
The migration remains compatible with the older welcome-only worker as long as
no campaigns are confirmed before the new worker is deployed. Regenerate types
and run security advisors after application. Do not queue campaigns on an old
worker.

The founder authorized a draft preview and live tests with sending disabled. Inspect the Vercel deployment
on mobile and desktop, including loading, empty, error, long venue names, all
languages, keyboard focus, confirmation dismissal and history. Sending/retries
remain disabled on previews even though the database is shared. A separately
authorized controlled production send is needed to verify actual one-click
headers, provider webhooks, real account authorization and transport behavior.
Exercise two simultaneous confirmations against an isolated disposable PostgreSQL
instance before declaring concurrent behavior verified. Run the full hosted gate
for this SQL/worker change and keep the PR draft until its required validation
and deployed UI inspection pass. Unknown outcomes require provider verification;
this V1 intentionally has no bulk resend override.
