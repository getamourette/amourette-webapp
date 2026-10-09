# Input validation contract and audit — #77

Date: 2026-09-09. Branch: `feature/input-validation-constraints`, commit `3d5bd33`.
Status: implemented; all nine #77 migrations applied remotely on 2026-09-11; local gate passed. The preview server-credential gap was fixed on 2026-09-14, with successful anonymous photo onboarding verified on #77 and #208. Final PR checks and review state are tracked in #250.

## Current maintained contract

Implementation authorized on 2026-09-09, resumed on 2026-09-11. The earlier pause
statements below describe the historical audit session and are superseded by that
authorization. **All nine #77 migrations are applied remotely; local validation and successful deployed preview photo onboarding have passed**.
On September 11, Marwane authorized integrating the delivered #194 code. The branch
was fast-forwarded to `main` at `6add2da` (including #243/#194 and #247), then the
uncommitted #77 work was reapplied and conflicts resolved. No new commit or push
was made during that integration. Final delivery was subsequently authorized on
September 11, including commits, branch publication and a PR. The private uploader,
rendering, moderation and generated types now come
from that merged baseline.

Maintain this section whenever an input changes. The inventory and approved rule
blocks below remain the original audit evidence; do not silently revise historical
findings to look like deployed behavior.

### Photo preparation timing (#289, 2026-10-08)

Authenticated preparation responses expose numeric stage durations through
`Server-Timing` (milliseconds, finite and nonnegative) and
`X-Photo-Process-First-Request` (`true`/`false`, first invocation of the loaded
route module, not evidence of a platform cold start). Neither header carries
identifiers, credentials, paths or image data. Request validation, owner-only
transport, no-store headers, source/output limits and cancellation are unchanged.
The browser keeps at most twenty local Performance measures per photo stage;
details contain only durations, byte counts, dimensions, supported MIME, cache
hit state and these response timing headers. They are not persisted or sent as
telemetry. Diagnostics do not replace loading/cancel feedback or authorize a
photo command.

The prepared full-resolution PNG uses lossless adaptive filtering with compression
level 3; its samples, ICC, orientation and existing byte/pixel limits remain
authoritative. The mounted page retains the accepted source Blob and stable
object URL separately from an unconfirmed candidate. Decoded pixels and at most
two recent local crop-preview promises are reused by that URL; failed decodes and
exports are evicted. Cancellation or invalid replacement cannot replace the
accepted cache. URLs/decoded references are released on confirmed replacement,
actual account change, saved-source version/revision change and page unmount.
Correction-source downloads still reauthorize rather than sharing the saved-source
cache. Initial authentication subscription replacement does not revoke a source
being restored for that same owner. IndexedDB retains the original File and
independent percentage crops under the existing expiry; no PNG/decoded cache is
persisted. Final publication continues to validate/convert the original and crop
native pixels. Loading status remains visible until decode, framing restoration
and required preview generation finish; cancel stays available.

### Launch Stripe integration contracts (#185, local 2026-10-07)

These entries describe the branch-preview application and migrations
`20261007000002_launch_stripe.sql` / `20261007000003_launch_stripe_schedule.sql`,
applied with Marwane's explicit approval as remote `20261007141235` /
`20261007141253` on 2026-10-07. The HTTP routes are deployed on the authorized protected test preview. Shared preflight
found no configured booking events/reservations; no existing-data repair was needed.
All new tables have RLS with no direct client/service grants. Public commands below
are service-only unless explicitly founder-only; private helpers have no role grants.

| Input / boundary | Maintained runtime contract and refusal behavior |
| --- | --- |
| `POST /api/launch/credentials` | Required JSON object exactly `{}`, at most 1024 streamed bytes; no Auth/profile requirement. Server generates UUID and two independent random 32-byte lowercase-hex secrets, returning only UUID and an encrypted bearer capability. No reservation effect. Malformed/oversized inputs refuse with 400/413. |
| Guest mutation transport | Exact configured `Origin`, no cross-site Fetch Metadata, media type `application/json` (optional parameters allowed). Body bounds apply without trusting Content-Length. Origin/media/rate refusal returns generic 429; absent configuration fails closed. All responses use private/no-store and no-referrer. GETs never mutate reservations. |
| Guest rate identity | Only Vercel's platform-controlled `x-vercel-forwarded-for` (up to 256 characters), otherwise one shared local/other-host bucket. HMAC-SHA256 with the launch encryption key; no raw IP persisted or trusted arbitrary X-Forwarded-For. `launch_http_allow(p_bucket)` requires exactly 64 lowercase hex characters. Atomic 30 requests / 600 seconds; stale buckets pruned after one day by worker. No null/coercion. |
| `GET /api/launch/checkout` | Exactly one query parameter, `night`, required UUID, no trimming; rejects null, arrays via repeated parameters, extras and malformed IDs with 400. DB availability is advisory; no capacity acquisition. |
| `POST /api/launch/checkout` | At most 4096 raw bytes. Required object: `action` is a string exactly `create`, `resume` or `status`; no unknown keys. `create` requires `booking`; the others forbid it. Arrays and string coercion are rejected. Validation errors return 400. |
| `booking` | Required object with only `night,email,name,locale,policy,late_ack`. `night` UUID lowercased; email uses unchanged #182 ASCII validator/normalization (254 bytes total, 64 local part, trim boundary whitespace, lowercase, preserve dots/+suffixes). Name boundary-trimmed, 1–30 Unicode code points, no NUL/unpaired surrogate; locale string exactly en/fr/es. Policy string `[A-Za-z0-9._-]{1,80}`, unchanged casing, must equal event version. `late_ack` required boolean, not a truthy/coerced value, and true when within 48 hours. Existing SQL revalidates all fields before allocation. |
| Browser price/schedule/provider/redirect input | No accepted amount, currency, timeout, account, session ID, management/arrival raw secret or return URL. Unknown keys rejected before booking effects. The event supplies fixed integer minor units (1–99,999,999), eur/usd and policy. Stripe's account-dependent charge minimum is additionally authoritative; a misconfigured price cannot be treated as a paid reservation. |
| Guest authorization | Required `Authorization: Bearer <access>` for checkout commands, never email/UUID alone. `access` is exact `v1.` plus 100–1500 base64url characters, untrimmed, AES-256-GCM authenticated for the access purpose. Payload contains UUID, distinct exact 64-hex secrets, integer issue time in Unix milliseconds. Reject future issuance or age >=604,800,000 ms. DB separately checks the current management digest/expiry, so renewal revokes old capabilities. Invalid/tampered/expired or unrelated access returns generic 401; nothing identifies another email's reservation. |
| `/return` query string | Entirely ignored. GET returns only verification-required handoff, never payment success, booking details or a release. No session/paid parameter is authoritative. #184 owns rendering and capability persistence; no browser-storage format is implemented here. |
| `prepare_launch_checkout` | Required UUIDs and booking inputs above; two server secrets keep #182 bounds. Envelope required text `v1.` plus base64url, total 103–1503 characters; account required `acct_` + 1–100 alphanumerics; origin required <=255 characters with HTTP(S) scheme and hostname/port characters. The server enforces a canonical trusted origin separately. Atomic reservation/work/envelope commit; rollback on invalid configuration. Idempotent replay requires identical normalized booking inputs/current secrets/account/origin and uses the original stored hold. Email collision returns only access-required; browser gets generic unavailable/recovery handoff (409), never an existing ID/session. |
| New allocation / waitlist / schedule | Authoritative wall time after night lock; new booking interval `[registration_opens_at, waiting_opens_at - 30 minutes)`. Both direct create RPC and facade enforce it. Waitlist closes at the same cutoff. Event/schedule guards require opening strictly before cutoff. `prepare` derives `hold_until` at now+1800 seconds floored to a whole second, before admission start; browser cannot supply it. The earlier #182 service create RPC still validates an explicit finite future hold <=start. No timer alone frees a bound/uncertain allocation. |
| `inspect_launch_checkout`, `read_launch_delivery` | Required reservation UUID; service-only, null if unknown. First returns bounded provider/work projection; second returns initial encrypted envelope plus stored recipient/locale. Neither is an email-authorized HTTP lookup. Envelope purpose is delivery; it cannot substitute for an access capability. #189 owns renewed delivery material and sending. No raw secret, envelope or worker claim reaches founder lists or guest status. |
| `claim_launch_checkout` | Optional target UUID, absent/null means queue selection. SKIP LOCKED claims only pending due/unleased items; a targeted authenticated resume can poll before next-run time. Fixed 120-second lease, fresh claim UUID, monotonic count. `start_launch_checkout_request(id,claim)` requires current unexpired claim and persists first-call time once. |
| `finish_launch_checkout` | Required reservation/claim UUIDs and state string pending/done/review_needed; optional null error token `[A-Za-z0-9_.-]{1,80}`. Stale/expired claims refuse. Uncertain pending work is scheduled >=30 seconds later; healthy open sessions wait until expiration, with cancellation/confirmation bypassing that delay. No free-text provider errors, emails or secrets persisted. |
| `reject_launch_checkout_creation` | Required reservation/current claim and Stripe `req_` + 1–240 alphanumeric evidence. First claim only, request-start recorded, no bound session or paid/unpaid record. Caller may assert only a definite first, unretried Stripe 400 input rejection for `expires_at`; never a timeout, replay error or empty listing. SQL records unpaid evidence and revokes arrival access atomically. Ordinary hold release still needs the bound session's verified terminal-unpaid state. |
| `admin_retry_launch_checkout` | Founder-only UUID plus required trimmed 1–500-code-point verification note. Requeues review-needed work and audits the note without changing provider identity/first-call time or bypassing the replay horizon. Founder detail adds work state, counts/timestamps, safe error code and account binding only. |
| Stripe Checkout create/retrieve | API `2026-09-30.endive`; stable reservation-based idempotency key, original amount/currency/email/locale/expiration/origin and versioned metadata. Card-only allowed-method filter, Adaptive Pricing false, `wallet_options.link.display=never` to exclude Link's bank/financing offers; Apple Pay/Google Pay remain eligible. No delayed methods or recovered Checkout. Validate session identity, mode, test mode, exact metadata, exact amount/currency/method and expiration <=start. Verify full succeeded PaymentIntent and matching metadata before `record_launch_payment`. An expired session with an in-flight attached intent remains held. |
| Stripe account charge eligibility | Retrieved `charges_enabled` must be boolean `true` and `capabilities.card_payments` exactly `active` only before a Checkout creation/replay call that could create a session. Missing/inactive capability or disabled charges keeps the attempt pending with `stripe_cards_unavailable`, without recording a new provider-request timestamp or releasing capacity. Shared initialization still retrieves/binds the account ID; session retrieval, expiry, payment reconciliation and refund execution/recovery continue independently of these flags. Stripe's actual refund API result remains authoritative. |
| Stripe retry/list input | SDK timeout 15,000 ms; automatic SDK retries off. List within the attempt's creation/payment window, 100 per page, max 1000 results; incomplete/duplicate/mismatched evidence requires review. Same create parameters/key may replay only <23 elapsed hours from durable first request. Beyond that, retrieval/list may recover an object; absence never permits another operation or capacity release. |
| `/webhook` | Raw stream <=262,144 bytes; signature header required <=4096 chars, configured whsec secret, SDK HMAC verification and 300-second timestamp tolerance before parsing/DB effects. Test direct-account events only; accepted Checkout completed/expired/async success/failure events require integration metadata and strict UUID. Unsupported/unrelated events are acknowledged without booking effects. Current authenticated Stripe retrieval is authoritative, not the event snapshot or ordering. Invalid input/signature returns 400/413; failed reconciliation returns 503 for provider retry. |
| Refund claim/provider result | Existing #182 amount/currency/claim/operation contracts unchanged; claim also returns durable operation first-request time and checkout account. New operation clocks are inserted once per operation UUID. Retrieve known provider refund or finish list by PaymentIntent before uncertain replay, with 100/page and 1000 cap. Verify original payment, exact full amount/currency, obligation and operation metadata, immutable provider ID. Pending/failed/canceled/succeeded/requires_action map to pending/failed/failed/succeeded/review_needed. Unknown manual refunds require review. No replay >=23 hours without a found object; only existing audited replacement contract can mint a new operation after terminal failure. |
| `POST /process` | Constant-time exact `Bearer <LAUNCH_WORKER_SECRET>` check. Required JSON `{limit}` <=1024 streamed bytes; integer 1–10, no extras/coercion/clamping. Unauthorized 401, malformed/oversized 400/413, interrupted processing 503. Separate checkout/refund progress within a 40-second start budget and 60-second route allowance; persistent leases survive interruption. `maintain_launch_checkout()` takes no arguments and finalizes at most 100 ended nights plus stale rate buckets. |
| Runtime secrets/config | `STRIPE_SECRET_KEY` server-only and must begin sk_test_; live keys fail closed. `STRIPE_WEBHOOK_SECRET` whsec_; `LAUNCH_SECRET_KEY` and `LAUNCH_WORKER_SECRET` exactly 64 lowercase hex, never public env variables. `LAUNCH_SITE_ORIGIN` exact canonical HTTPS origin, no path/query/userinfo/trailing slash; local HTTP allowed only localhost:3000 / 127.0.0.1:3000. AES key loss/rotation requires explicit recovery/migration, not silent regeneration. |
| Vault schedule input | Private dispatcher uses `launch_worker_url` (HTTPS host plus exact `/api/launch/process`), `launch_worker_secret` (64 lowercase hex), optional nonpublic preview bypass header. Absent URL/secret yields no request; malformed values refuse. Cron every minute, fixed `{limit:5}`, HTTP timeout 55,000 ms. Schedule and protected-preview Vault configuration authorized and applied. Actual scheduled HTTP dispatch and full refunds verified. |
| Opt-in sandbox CLI | `LAUNCH_SANDBOX_TEST=1` required; test keys only. Optional `LAUNCH_SANDBOX_FAULTS=1` simulates response loss after real Stripe effects; `LAUNCH_SANDBOX_WEBHOOK=1` and local `STRIPE_CLI_PATH` enable real signed forwarding. CLI key goes through environment, never process arguments/logged secrets. Synthetic recipients, ephemeral local SQL, session cleanup and listener shutdown. No shared DB writes or live payments. |

Coverage: `test:launch-reservations`, `test:launch-stripe`,
`test:launch-concurrency`, `test:launch-http` and opt-in `test:launch-sandbox`.
The deterministic tests run in the existing logic/concurrency gates; isolated HTTP
checks run after the existing CI build. Sandbox tests never run automatically.
Actual EUR/USD Checkout payments/refunds and a real signed local webhook passed.
Shared post-migration checks passed for RPC grants/RLS, cutoff definitions, the
inert dispatcher, rolled-back authorization/rate-boundary tests and read-only
PostgREST service access/anonymous denial. MCP types were reconciled; advisors
have no ERRORs, with only three expected private-table notices and one guarded
founder-RPC warning added. The protected preview then passed real EUR/USD card
payments, automatic signed webhooks, duplicate delivery, guest isolation, cutoff
refusal, price injection refusal, browser return and cron-driven full refunds
(including a payment after cancellation). Inspected mobile/desktop hosted Checkout
and the JSON handoff; Link offers discovered there prompted an explicit disable.
Physical-device wallets, the #184 participant UI, final hosted review coverage,
production fees/timing and live payments remain unverified. See the policy integration section
for the exact evidence and downstream ownership boundaries.

Final delivery validation: [GitHub run 37639653605](https://github.com/getamourette/amourette-webapp/actions/runs/37639653605)
passed lint, the complete logic suite, PostgreSQL concurrency, build and isolated
production Next HTTP contracts on `cc395f543fcee571a33b716032d269414efa7eca`, against
base `466bb61774a6962ac105e1974df9b18f5c079ba0`. Its `CI evidence v1` records full
scope with browser execution false. The temporary October 12 browser exemption
applies to final review; this does not establish full Playwright coverage. Later
allowlisted documentation-only changes may reuse that exact application evidence.
The preview-stage report's outstanding GitHub gate is superseded by this result;
physical wallets, #184 UI and production activation remain outstanding.

### Launch reservation database contracts (#182, 2026-10-07)

Migration `20261007000001_launch_reservations.sql` was applied with explicit approval
on 2026-10-07 as remote version `20261007095253` (`launch_reservations`).
All entries below describe SQL commands, not deployed HTTP routes. No new Next.js
input, URL handler, browser storage, provider webhook or email sender is shipped.
See [the policy's database contract](../launch-reservation-policy.md#local-database-foundation--182-2026-10-07)
for access/delivery ownership and transition semantics. MCP-generated types were
reconciled for all 25 public commands, preserving SQL-nullable inputs; remote
security advisors and role/grant checks were completed as detailed below.

| Boundary | Runtime contract and normalization | Enforcement / feedback |
|---|---|---|
| IDs and scope | PostgreSQL UUID for night, reservation/request and claim/refund IDs; required for writes, no trimming/coercion. New purchase UUID is also the retry identity. Waitlist/audit cursor is int8, non-null ≥0, default 0; booking cursor is optional UUID/null. | SQL argument parsing, lookup and foreign keys; unavailable/invalid IDs reject before mutation. Founder read of an unknown reservation returns null; unknown/empty list scope returns an empty array. Lists are capped at 100 and never expose secrets. |
| `admin_configure_launch_event` | Required existing night; finite timestamptz opening strictly before scheduled start, not in the past for initial configuration; int4 quota 1–100000 places; int4 deposit 1–99999999 minor units; currency exactly lowercase `eur` or `usd`; policy version 1–80 ASCII letters/digits/`.`/`_`/`-`. No currency conversion or string normalization. | Founder allowlist precedes effects. CHECKs, freeze trigger, night lock and allocation count; quota cannot fall below holds + confirmations. Existing registration opening, price, currency, policy version and night schedule freeze at opening; venue association is fixed. Invalid/frozen/full errors leave existing configuration intact. |
| Contact email | Required text, raw maximum 16384 UTF-8 bytes; Unicode boundary whitespace trimming, then lowercase ASCII under C collation; normalized maximum 254 bytes, local part ≤64, dot-separated valid domain labels. ASCII only, no alias/dot/plus collapsing. Reuses `private.valid_marketing_email` syntax only. | Command validator plus normalized durable CHECK; partial active email/night unique index. Different emails remain a known identity limitation. Browser/HTTP layer must never expose existing reservation details from a typed address. |
| First name / locale | Name required, raw ≤16384 bytes, trimmed 1–30 Unicode code points, no case or Unicode normalization. Locale required and exactly `en`, `fr` or `es`, no trimming. | Database validators/CHECKs; invalid input rejects rather than truncates. Name supports manual identification but is not an authorization credential. No matching profile is created. |
| `create_launch_reservation` | Required IDs, contacts, exact configured policy-version text, boolean late acknowledgement, finite hold-until timestamptz strictly after locked database wall time and ≤event start, plus two independent secrets. Policy argument represents explicit accepted conditions; server records acceptance time. Late acknowledgement must be true only when the inclusive 48-hour deadline has passed. | Registration `[opening,start)`, nonterminal event, capacity and email checked under the night lock. Request UUID replay requires the same normalized payload/deadline and current original credentials; conflicting reuse fails. Existing active email under a new UUID yields only `{access_required:true}` internally. No second allocation. Future HTTP UI preserves rejected drafts and maps policy/late/full/closed/access errors; endpoints remain unbuilt. |
| Secrets / guest access | Required exact 64 lowercase hexadecimal characters encoding 32 CSPRNG bytes; no trimming, case conversion or Unicode changes. Initial management and arrival secrets must differ; only SHA-256 digests persist. Management expires seven elapsed days after issue/renewal. | Private credential table, strict format, management proof plus expiry inside read/cancel commands. Arrival token cannot authorize management. Wrong/expired/missing proof refuses. RLS + explicit revoked grants keep tables inaccessible even to service clients; only designated SECURITY DEFINER RPCs may act. |
| Recovery / support correction | Delivery lookup: required night UUID and validated email. Renewal: required reservation UUID plus freshly generated secret; identical-secret replay has no additional effect. Founder correction: paid reservation UUID, validated new email, trimmed required note 1–500 code points (raw ≤16384 bytes). | Service-only lookup/renewal return information solely to the delivery backend; send to stored address and return generic HTTP acknowledgement, never the secret. Founder correction verifies paid record, respects active-email uniqueness, expires management access and audits note; QR remains valid. Future endpoints own anti-enumeration, rate limits, private caching and explicit-confirmation protections. |
| `bind_launch_checkout` / `release_launch_hold` | Required reservation UUID; provider Checkout and terminal-unpaid evidence identifiers are non-null ASCII `[A-Za-z0-9_]`, 1–255 characters, exact matching, no trimming. No secret, card details or arbitrary provider JSON accepted. | Binding is immutable/idempotent and remains possible after cancellation to reconcile a provider creation already in flight. It never revives the booking. Release requires the bound Checkout and trusted provider evidence asserted by #185; local expiry/browser return is insufficient. Holds count until an explicit safe terminal transition. Incorrect references reject before any release. |
| `record_launch_payment` | Required reservation, bound Checkout and payment identifiers with the same 1–255 ASCII contract; int4 amount and exact lowercase currency must equal immutable attempt values. No client timestamp. | Service-only evidence boundary; #185 must verify signatures/provider object identity before calling. Exact success replay returns current state; mismatched charge/price/currency rejects. Payment IDs are unique. Late success never revives released capacity; it records payment and queues the full refund. |
| Participant cancellation | Required UUID and valid current management secret; no caller clock or refund flag. Server captures one wall-clock instant after locking. | Cancellation at or before `start - 48 hours` is refundable; later cancellation retains paid deposit. Cancellation after end or verified arrival rejects. Terminal replay is harmless. State change, capacity release, QR revocation and eligible refund queue are atomic; rebooking does not rewrite prior history. |
| Arrival / no-show | Founder arrival: required UUID, exact `qr` or `manual` method. Optional note trimmed to null when blank for QR; required 1–500 code points for manual (raw ≤16384 bytes). No-show: service-only night UUID, no caller clock. | Arrival requires confirmed booking and `[start,end)` with no terminal cancellation; database timestamp and founder ID recorded. Repetition preserves first arrival and refund. No-show only at/after end; never overwrites verified arrival. Both are separate from venue admission and public presence. |
| Organizer / exception | Founder cancellation reason exactly `cancelled` or `postponed`; exception/retry note required trimmed 1–500 code points, raw ≤16384 bytes, no Unicode/case normalization. | Founder check; cancellation final, all outstanding paid deposits queued once. Exceptional refund requires paid record. Existing room terminal cancellation invokes booking cleanup, but scheduled end preserves financial records. Night deletion is restricted by FK. |
| Waitlist | Required night, normalized email and locale as above; manual status exactly `waiting`, `contacted` or `closed`, required int8 row ID. List kind exactly `waitlist` or `audit`. | Join only while registration is open and full; unique email/night preserves signup ordering on retries. Founder-only status/list commands; ID ordering and cursor pagination. No payment, marketing subscription or automatic place allocation. |
| Refund claims | Optional int4 lease seconds, default 60, non-null 10–300. No caller-supplied payment amount/key. Server chooses at most one queue item, random claim UUID, lease instant and increasing attempt count. | `SKIP LOCKED` excludes concurrent claims; expired pending work is reconcilable. Returned `operation_id` UUID is the provider idempotency key for that operation; later claims of it require external reconciliation first. Refund UUID continues to identify one financial obligation; claim UUID fences the worker. No work returns null. |
| Refund completion / retry | Required refund and claim UUIDs; outcome exactly `pending`, `succeeded`, `failed` or `review_needed`. Optional provider-refund reference null or 1–255 ASCII `[A-Za-z0-9_]`, required for success; once present cannot change or be omitted within that operation. Optional error is null or 1–80 ASCII letters/digits/`_`/`.`/`-`, not an exception dump. Retry requires founder verification note. | Current unexpired claim only; duplicate outcome has no extra effects; success cannot regress. Full immutable amount/currency must equal the paid deposit. Failed/review outcomes may be requeued for reconciliation, retaining operation identity/key and provider reference. A verified terminal failure needs the separate replacement command below. No duplicate refund intent is possible. |
| Verified failed-refund replacement | `admin_replace_failed_launch_refund`: required refund UUID, inspected operation UUID, exact failed provider ID and evidence reference (each 1–255 ASCII `[A-Za-z0-9_]`), required verification note trimmed to 1–500 Unicode code points, raw ≤16384 bytes. No UUID/reference trimming or normalization. | Founder-only; locked current state must be `failed` with that exact operation/provider. Founder attests terminal failure, returned funds and eligibility for a new provider operation. Snapshot, evidence, note and actor are retained; new operation UUID/key, no provider ID or worker claim, zero claims for the new operation. Repeated identical old approval is a no-op; stale/conflicting, uncertain/pending/succeeded, missing-evidence and unauthorized inputs refuse without mutation. Full amount, currency and obligation UUID stay fixed. Private registry uniquely binds provider IDs across current and historical attempts. Founder detail exposes archived failure snapshots with worker claim IDs removed. |

Database table/state constraints and direct-write refusal complement RPC checks.
All new tables enable RLS with no direct client policies/grants; `anon` has no
command execution and `authenticated` has only founder-checking command grants.
Service RPCs are backend boundaries, never public visitor endpoints. Private
helpers have no client/service execution grants. Audit entries contain bounded
operational metadata, no raw capabilities or arbitrary webhook payloads.

Tests: `test:launch-reservations` executes the migration in isolated PGlite;
`test:launch-concurrency` exercises actual PostgreSQL 17 locks on loopback and is
also integrated into the existing PostgreSQL CI gate. The current night-report
suite loads this migration alongside the production report/lifecycle migration
to verify booking/refund survival while ephemeral interactions are purged.
These do not establish hosted Auth/PostgREST, Stripe, HTTP recovery, email delivery
or Vercel behavior.

Separate deployment verification on 2026-10-07 confirmed all nine private tables
have RLS and no direct CRUD grants to application roles, and all new function
grants match their documented boundaries. Rolled-back remote SQL role checks
confirmed founder access, nonfounder read/refund-replacement denial, anonymous
execution denial and service-only lookup. No event was configured or test data
retained. Security advisors added nine private-table/no-policy INFO findings and
twelve authenticated SECURITY DEFINER WARN findings, consistent with the guarded
command design; no new anonymous execution finding. Existing unrelated findings
remain. Generated types passed TypeScript checking; no long suite was repeated.

Delivery follow-up: with explicit approval to run the hosted gate, PR #307's
[CI run 37604745057](https://github.com/getamourette/amourette-webapp/actions/runs/37604745057)
passed lint, the full logic suite, PostgreSQL 17 transaction ordering and build
on commit `d8254ee6959c7903f2b7fa216f9f7658a2473630`. Browser tests were not run;
the existing sprint exception permits their automatic deferral through October 11.
Documentation-only follow-up and promotion use verified CI reuse where available.

### Public legal navigation (#292, 2026-10-06)

| Input | Runtime contract and normalization | Enforcement and feedback |
|---|---|---|
| `/legal?lang=` and `/terms?lang=` | Optional scalar string, exactly `en`, `fr` or `es` (two lowercase ASCII characters). No trimming, coercion or case conversion. Missing, empty, unknown, padded and repeated/array values fall back to English. Other query values are ignored; no units apply. | Server page and metadata call the same `legalLocale` guard before dictionary lookup. Explicit URL locale overrides browser preferences. Public server-rendered text requires no sign-in, JavaScript or database access. |
| Legal navigation destinations | Fixed route names and supported locale only; no user-supplied redirect. Landing/profile links use the existing locale. Profile links open a new tab with `noopener noreferrer` and a localized accessible explanation. | Reading legal copy preserves unsaved profile edits and performs no acceptance, consent or profile mutation. `tests/onboarding/legal-pages.spec.ts` covers malformed locales, public reading, language/cross-document links, narrow layout, keyboard focus and unsaved edits. |

Preview publication does not capture terms acceptance. #184 owns registration
acceptance; existing matching and announcement consents are unchanged.

### Public privacy navigation (#299, 2026-10-06)

| Input | Runtime contract and normalization | Enforcement and feedback |
|---|---|---|
| `/privacy?lang=` | Optional scalar string, exactly `en`, `fr` or `es` (two lowercase ASCII characters). No trimming or case conversion. Absent, empty, unknown, whitespace-padded and repeated/array values fall back to English. No numeric bound or unit applies. Other query parameters are ignored. | Server page and metadata use the same guarded locale before dictionary access. The URL takes precedence over browser preferences, making links readable without JavaScript or a session. An unsupported locale renders the complete English policy with language links. Locale selection adds no database, Auth or storage effect; the existing root layout's client session synchronization remains separate. |
| Privacy links and section fragments | Application-generated `/privacy?lang=<validated locale>`; fixed section IDs from the policy dictionary. No return URL, email address, unsubscribe token or participant identifier is copied. Unknown fragments cause no command. | Landing, matching information, email preferences and unsubscribe links supply their displayed locale. Unsubscribe navigation retains the page's no-referrer policy and marks the policy link `noreferrer`; loading information never submits unsubscribe or changes matching consent. |

The fixed CNIL external link was removed in the international-copy update; no
replacement URL or user input is introduced.

The page contains launch-facing copy; internal release status stays in PR #300
and the framework inventory. Indexing remains disabled until production
reconciliation is complete. The new public information does not change the
`matching-v1-draft` checkbox or its evidence contract. Browser coverage is in
`tests/onboarding/privacy-policy.spec.ts` and the existing matching-consent UI suite.

### Moderated first names and bios (#236, 2026-10-01)

The founder-authorized migration `20261001000001_profile_text_moderation.sql`
was applied as remote version `20261002002836` after draft CI passed. Generated
types were reconciled, retaining SQL nullability and trigger-enforced contracts
that the generator cannot infer. Security advisors and effective grants were
checked; the real Supabase and focused Vercel regressions passed. Full hosted
run `36947171515` then passed all 98 Chromium-mobile tests with `full true`
evidence at `a4009d2` against base `05a6ac8`. The founder subsequently confirmed
manual chat bio removal, message sending in both directions and phone keyboard
usability. The photo-review label fix is published at `3a2b928`; its focused
regression passed on that commit's Vercel preview at desktop and 320px widths,
with agent screenshot inspection and no shared fixture accounts/writes. Fresh
full hosted run `37062291661` passed 97 browser cases but failed the existing
cancelled-night re-entry/profile-preview journey. All text moderation cases and
lint/logic/PostgreSQL concurrency/build passed. The PR remained draft during
investigation; its focused local reproduction passed without changing
the assertion or application code. After renewed founder direction to finish,
fresh full run `37064720090` passed all 98 Chromium-mobile cases (no failures or
skips), plus lint/logic/PostgreSQL concurrency/build, at
`8b6ee1de1d52e8fee01c3176dcd40f0498abfc97` against base
`05a6ac8ad6a95c9dbb122375cdae5095c426f877`. Its successful `CI evidence v1 ...
full true` job supplies current coverage of the admin-label fix. The prior failure's
cause remains unestablished; neither its assertion nor application code was
changed to obtain the successful result. Delivery may now proceed through the
verified ready-event gate; merging remains founder-gated.

| Input / state | Runtime contract and enforcement | Feedback / coverage |
|---|---|---|
| Published `profiles.first_name` | PostgreSQL text or null. Present names remain trimmed, required nonempty at creation, 1–30 Unicode code points, with the existing 16,384-byte raw cap and no case/Unicode normalization. Null represents a moderation-hidden name, never incomplete onboarding. Only an unforgeable private transaction authorization may clear it; only #229's exact approved request may replace it. The current normalizer and durable constraints enforce the contract, including privileged auxiliary writes. | All participant reads return null for rejected names; localized neutral labels contain no rejected-name fallback. Discovery and like writes use the same eligibility predicate. Existing matches retain authorization. |
| Published `profiles.bio` | Existing optional trimmed text/null contract, 300 code points, remains. Rejection writes null. While correction is required, any changed direct bio write is denied unless issued by exact approval. An unchanged null write does not clear the requirement. Ordinary editing resumes after approval; preference consent/cooldown state is independent. | SQL covers direct participant and privileged bypasses, bio-only discovery, independent restrictions and consent withdrawal. |
| `require_profile_text_correction` | Non-null profile UUID, field exactly `first_name` or `bio`, inspected opaque revision UUID, reason exactly `sexual`, `hateful`, `harassment`, `misleading_identity` or `inappropriate`. Optional night/report UUIDs are mutually exclusive; no trimming/coercion of command values. Founder role plus an actual participant-night, reported-party or existing correction context is required. Missing, malformed, unknown, stale or already-restricted inputs fail before effects. Profile locks follow the existing eligibility barrier; publication, request cancellation and metadata event commit atomically. | Founder must explicitly reload/reinspect after a failed or uncertain decision. SQL checks authorization, reason/field/null refusals, rollback and stale inspected values; PostgreSQL concurrency cases cover participant edits racing rejection. |
| `submit_bio_correction` | Owner inferred only from Auth. Non-null request UUID and inspected revision UUID; proposed text is string/null, at most 16,384 bytes before trimming and 300 code points after boundary trimming. No Unicode normalization/case folding. Blank normalizes to null and **still requires approval**. One immutable pending request per owner. Identical request-ID/value replay returns that receipt; different values/owners fail. No extra cooldown or quota. | Draft survives failed submission. UI counts code points, with no HTML `maxLength`. Tests cover 300/301 emoji, raw padding limits, cancellation, retries, rejection and approval of empty proposals. |
| Bio cancellation/decision | Non-null exact request UUID. Only its owner may cancel; only a founder may decide `approved` or `rejected`. Final decisions are immutable and replay returns the existing outcome. Approval must match the current correction requirement and publishes only the stored proposal. | Old decisions cannot approve a newer submission or clear any other field, photo restriction or night exclusion. |
| Existing #229 name requests | Existing request text/UUID/approval/notice contract remains. Requests created during a correction are privately bound to its requirement UUID. Starting moderation cancels any preexisting pending voluntary request, so an old review cannot clear the new restriction. The normal voluntary pending request continues to leave an acceptable current name visible. | Existing-chat notice is emitted by the reused approval transaction, without moderation context. SQL and browser regressions retain normal name editing behavior. |
| Owner correction response | Zero-argument authenticated RPC returns only own field, opaque revision, required boolean, standardized reason or null, latest applicable request UUID/text/status or null. Status is `pending`, `approved`, `rejected` or `cancelled`. No actor/report/reporter metadata. Reuse private content-free #195 signals; no new browser storage format or Realtime payload is introduced. | EN/FR/ES status/error/pending/correction feedback, foreground/reconnect recovery and superseded-read protection. |
| Founder reviews/history | Optional profile/night/report UUID filters, checked in the database. Default queue contains unresolved requirements only; explicit historical access requires a legitimate review/correction context. Review responses contain only identity and the two text fields/submissions; history contains field, request reference, action, actor, timestamp and reason. No preferences, contacts, messages or report evidence. Private tables have no participant/service-role grants and are not in Realtime. | Negative SQL authorization tests and real Supabase regression passed after the approved migration. Broader existing founder-profile policy cleanup remains #235. |
| Founder photo-review identity | `admin_photo_queue` and `admin_photo_framing` return the existing published first name as string/null under their founder authorization. Null is a moderation-hidden name; these projections do not recover rejected text. Client types retain that nullability. No new argument or normalization. | The review-list button and modal heading use “Participant” when the name is null. The scoped-review browser regression covers both labels and preserves the authorized night requirement for text actions. |

Rejected text is held only as active correction state, cleared when that correction
is approved; action events contain no copied text. No retention duration, automatic
sanction, appeal channel or private-message inspection is introduced. #234 owns
coordinated audit retention/deletion policy; its photo-specific duration is not
applied to text corrections.

### Unified profile review (#294, 2026-10-03)

Prepared on `feature/unified-profile-review` after updating from merged #291's
`origin/main` (`addeb48`). Migration `20261003000001_unified_profile_review.sql`
was applied with Aymane's explicit approval as remote version `20261003212714`.
RPC typings were reconciled with MCP-generated types, retaining existing manual
nullability and trigger refinements. Missing RPCs retain the
existing #236 screens only for an environment without this migration. Reporting RPCs, report data, report
actions and sanctions retain their existing contracts.

| Input / state | Runtime contract and enforcement | Feedback / coverage |
|---|---|---|
| Venue/filter/page query | `admin_profile_reviews` requires an existing non-null venue UUID and founder authorization. Filter is exactly `needs_review`, `awaiting_changes`, `approved`, or `all` (default `needs_review`); offset is a non-null integer 0–2147483647 (default 0); limit is a non-null integer 1–50 (default 40). No text trimming/coercion. The UI requests one profile per page. Profiles are associated through actual presence/night/venue records, including historical associations; no arbitrary directory lookup. | Wrong types, nulls, unknown enums, bounds and unauthorized access fail before effects. Switching venues clears the inspected profile and counts together. Counts cover the whole authorized venue rather than the returned page. |
| Atomic founder decisions | `approve_profile_review` and `request_profile_corrections` require non-null profile, venue and exact inspected revision UUIDs. The revision combines the cycle, text revisions, pending request identifiers and photo revision. Founder and venue scope are rechecked under the shared eligibility barrier and profile lock. Approval requires Needs review; correction requests also permit Approved, never Awaiting changes. | `PT409` means the inspected submission changed; no partial publication occurs. Unknown/network outcomes lock decisions until explicit rereview. Background count refresh never replaces an inspected snapshot. Client refs refuse duplicate gestures. |
| Correction fields/reasons | Required JSONB array of 1–3 unique objects, exactly the string keys `field` and `reason`; serialized JSONB at most 2048 bytes. Fields: `first_name`, `bio`, `photo`. Text reasons: `sexual`, `hateful`, `harassment`, `misleading_identity`, `inappropriate`. Photo reasons: `face_unclear`, `multiple_people`, `not_person`, `sexual`, `violent`. Exact case, no trimming/coercion, free text, extras or duplicate fields. The RPC uses strict validation; the private table additionally permits `legacy_unknown` for photo only, to adopt historical requests with no saved reason. This marker cannot be selected or submitted in a new request. | Empty/malformed/wrong-field reasons fail atomically. One cycle stores all selected fields/reasons, one notification and the original content. All seven combinations and refusal of `legacy_unknown` in new commands are executed on the actual isolated migration. |
| Review response | Runtime JSON checks require matching venue/filter/offset; UUID identifiers/revision; nullable name ≤30 and bio ≤300 Unicode code points; nullable photo path nonempty ≤2048 UTF-16 units without control characters; exact status; parseable timestamp string ≤64 units; literal boolean resubmission; unique changed/approved field arrays ≤3; optional original context with valid corrections. Counts are nonnegative safe integers and sum to All. The private Storage authorization remains authoritative for bytes. | Malformed or mismatched responses never enable decisions. Only identity/content enters the display; no preferences, contacts or messages. `inspectionId` is a local remount key, never a server authorization token. |
| Historical missing photo reason | Only existing null photo reasons are backfilled as the exact output marker `legacy_unknown`. Runtime response parsing permits it only for photo; nulls and the marker on text fields remain invalid. Owners are asked to choose a new picture and told the original reason is unavailable. No historical audit, photo decision or restriction is removed. | The historical cycle remains Awaiting changes until all requested edits and explicit submission, then hidden until complete approval. Isolated SQL verifies later report corrections retain it. No preset violation is invented. |
| Owner response and submission | Zero-argument `my_profile_review` infers authenticated owner; returns null without a cycle, otherwise own UUIDs, status, validated fields/reasons, unique updated fields and literal readiness/notification booleans. `submit_profile_review` requires exact non-null revision UUID and all requested fields actually changed. Redaction/cancellation is not an edit. Required text needs a valid pending proposal; photo needs an eligible updated version. Explicit submit records that exact revision; subsequent edits invalidate submission. | Partial updates never requeue. Save name/bio controls stage #236 proposals; the separate localized Submit for review action requeues the complete profile. Repeat submission of the same revision is idempotent. Discovery remains held through resubmission until full approval; account editing and existing chat access remain. |
| Notification receipt | `acknowledge_profile_correction` requires non-null active request UUID for the authenticated owner. One durable `notification_seen` boolean per cycle; acknowledgment preserves the prompt and does not alter the submitted content revision. No new localStorage or Realtime payload. Existing content-free participant signals plus bounded polling refresh the owner state. | One consolidated EN/FR/ES notice lists fields/reasons. Cross-owner/stale receipts fail; reload does not recreate an acknowledged notice. |
| Direct edit URLs/actions | Existing `/profile?edit=1` and optional validated venue slug remain. Hashes are exactly `#profile-review-first_name`, `#profile-review-bio`, `#profile-review-photo`; unknown hashes do nothing. No query/hash reaches a mutation RPC. Name opens its existing dialog after a safe read; bio retains the explicit focus intent when delayed correction data replaces the ordinary editor; photo navigation focuses the picker, while a direct click can open the file dialog. Existing text/code-point, file/crop and upload limits remain. | Keyboard/focus and 320px controlled browser regressions exercise direct edits, including a held text read. Existing report/chat controls remain reachable. Re-selecting the current admin venue/filter preserves the inspected snapshot. |
| Owner photo refresh ordering | Existing authenticated/RLS-scoped `photo_state` projection and UUID-filtered `photo_versions` query retain their arguments, column types and nullability. A successful current owner-state read publishes its decision/revision immediately. Cached metadata is retained only for the same owner and displayed/pending IDs still referenced by that state; a null/removal clears references immediately. A superseded metadata response cannot publish. Storage authorization still controls every private download. | A delayed metadata read cannot delay a rejection notice or restore a removed picture. Controlled browser coverage holds metadata across a new decision and later removal; the real photo journey retains its byte continuity and denial assertions. |

The founder-authorized cutover is applied as remote migration `20261003212714`.
The approved [full run 37258261406](https://github.com/getamourette/amourette-webapp/actions/runs/37258261406)
executed all 108 browser cases successfully on head
`23e29dbb2fb17bc8edf4c1702fae5645f0ba08b2`, base
`addeb484f9aa8183bf9daa41fac00c06bc448de6`; lint, logic, PostgreSQL 17 and build
also passed. This includes actual shared-schema unified/name/text/photo journeys,
report independence, preference cooldown/access checks and all three new refresh
regressions. Its `CI evidence v1` record is `full true`. This proves the executed
Git inputs and coverage, not permanent external-service or schema immutability.
The new confirmation states are now visually inspected on the deployed preview:
eight focused mobile/desktop cases pass, including the three refresh regressions
and EN/FR/ES layouts. Two additional controlled deployed mobile cases verify
name/bio Save, Submit for review and dismissal at 320×390, with no shared writes.
The agent inspected the resulting screens and control reachability. Reduced-height
browser emulation does not establish native iPhone/Android keyboard behavior;
physical-phone testing has not been claimed. No input contract or executable
repository file changed after the successful full gate.

### Compact corrections and approval return (#298, 2026-10-06)

The founder approved the local HTML reference on October 6. This flow supersedes
#295's field-by-field wizard and separate Ready screen. The HTML supplies visual
and interaction direction only; reasons, ownership, revisions and review status
come from the existing authenticated moderation RPCs. No migration, admin/report
policy, photo-processing rule or voluntary-editing contract changes.

| Input / state | Runtime contract and enforcement | Feedback / coverage |
|---|---|---|
| Rejection notice | Only a validated owner cycle with `awaiting_changes` and durable `notification=true` opens the shared modal. It lists exactly the server-requested fields and their existing localized preset reasons; the historical photo marker keeps its existing unavailable-reason message. One primary Edit my profile action opens the combined form and acknowledges the exact request UUID. Escape/backdrop also acknowledge; pending cycles never show a rejection popup. | Uses the selected EN/FR/ES locale, existing Modal, BrandLogo, night colors/fonts, inputs and pill buttons. No locale selector or simulated/example reasons enter the product. A new request UUID remounts the form and shows its new reasons. |
| Profile entry navigation | The request-time server page resolves query values as strings, using the first occurrence when repeated. Only exact `edit=1` selects editing. Optional `venue` retains existing slug validation before lookup; absent means no supplied destination. Optional `correction` accepts exact `1` (focused return) or `0` (account settings); absent/unknown values retain the focused default. Entry mode and venue identify the mounted owner form, so client navigation from onboarding to correction editing loads current owner data instead of reusing the static onboarding URL. Correction/account toggles within that entry preserve mounted drafts. The correction URL receipt is written only after edit mode loads. | Real mobile browser journeys cover fresh onboarding, moderator rejection and one popup tap into all requested editors, as well as rejection of an existing profile. URL values never authorize a mutation, approval or check-in. |
| Compact correction form | Only requested fields render. First name remains required, 1–30 trimmed Unicode code points; bio remains optional, 0–300, with existing raw caps/NUL/surrogate checks. Photo keeps the JPEG/PNG/WebP byte, crop, round-crop and private Storage contracts. Existing approved fields are never submitted by this form. | All seven combinations, invalid Unicode boundaries, empty bio, crop/upload failure and text/submission failure are covered in controlled browser checks. Failed operations retain mounted edits/photo for retry. Successfully staged proposals reconstruct from authenticated server state after refresh. |
| Combined Send for review | One explicit gesture stages each requested proposal through existing revision/ownership RPCs and the existing photo pipeline, then checks every requested updated field and server readiness before submitting the freshly read revision. Per-field UUID receipts retain lost-response recovery. Partial staging remains unsubmitted; saves alone never imply a submitted cycle. Only a confirmed `needs_review` owner response displays pending review. | No separate Save steps or Ready page. A failed final submission keeps the same form and saved proposals; retry does not duplicate unchanged proposals. Lost submission responses are reconciled against the exact request and submitted revision. |
| Approval return | A successful supported `my_profile_review` response with no remaining correction cycle ends a correction return. Failed, malformed or missing RPCs never authorize navigation. An explicitly opened correction URL can recover approval after reopening; ordinary account-settings URLs retain voluntary editing. The client reads only the owner's latest presence for the supplied valid venue, or the owner's latest presence when none was supplied, selecting night UUID and joined venue slug; runtime UUID/slug validation precedes navigation. No presence creates no room destination. | Full server-confirmed cycle completion returns automatically; remaining/partial cycles stay in the correction flow. Loading/error handling prevents the regular editor from flashing. Existing settings and conversations remain reachable through explicit navigation. |
| Room `reviewNight` URL | Optional exact UUID string, no trimming/coercion, bound to an owner-scoped presence-derived return path. Missing means ordinary venue entry; malformed values fail before entry effects. Present pins the access flow to that exact night, including its safe terminal projection even when a newer night is open. Presence history must contain an active row; absence never calls `check_in` automatically. An explicit rejoin still uses the existing RPC and its access checks. | Expiry, pause, ended presence, absent attendance, newer nights and malformed IDs have browser refusal coverage. Existing night expiry, closure, ejection, visibility and RLS remain authoritative; the URL grants no access. |

The founder reviewed the local screenshots and authorized a WIP preview for phone
testing. Local build, focused lint, isolated review logic/SQL, controlled mobile
states and real Supabase correction/admin regressions passed. Hosted gates and
deployed mobile inspection remain required before Ready for review. No shared
migration application or merge is authorized by this preview request.

### Focused participant corrections (#295, 2026-10-06)

Historical #295 behavior, superseded by #298 above: the approved participant reference replaced the scroll-to-field journey with
requested-field editors, a saved summary and explicit submission. Existing
moderation, discovery, report, photo-processing and voluntary-name contracts
remain authoritative; no schema or new moderation reason is introduced.

| Input / state | Runtime contract and enforcement | Feedback / coverage |
|---|---|---|
| Correction navigation | `/profile?edit=1` opens the active correction cycle by default. Optional `correction` is the exact string `1` (focused flow) or `0` (ordinary account settings); absent/unknown values retain the default focused flow. Existing validated venue slug remains. Legacy hashes accept only the three existing `#profile-review-{field}` values and open a requested editor rather than scroll; an unrequested/unknown field cannot add an editor or command. Navigation is local state/history and never supplies an authorization token. | Server `my_profile_review` fields determine which editors exist. Initial pending/failed review reads show loading/retry before mounting editors, preventing a legacy dialog or unrelated editor from opening early. Account settings and existing chats remain accessible. Saved progress is reconstructed from server updated fields and pending proposals; changing locale preserves mounted drafts. |
| Requested text editor | String draft, required first name (1–30 trimmed Unicode code points), optional bio (0–300); existing raw 16 KiB, NUL/surrogate refusals, boundary trimming and no case/Unicode normalization remain. Counters use trimmed code points; no HTML `maxLength`. Existing submit/cancel RPCs infer owner and enforce durable validation. A fresh owner read must confirm the same active correction request before replacing a proposal. Reopening does not cancel it; saving a different value cancels through the existing RPC then stages a fresh proposal with the new revision. | Refusals/failures keep entered text and show localized retry feedback. A failed replacement can leave that field incomplete and never advances to Ready. Stable UUID receipts recover failed/lost save responses; exact pending value plus server updated-field confirmation is required before advancing. Controlled browser checks cover single/multiple requests, partial return, replacement failure, empty bio and Unicode bounds. |
| Correction photo | Existing JPEG/PNG/WebP file, byte/source/crop/round-crop/revision contracts and real upload pipeline remain. Cropping only prepares a local photo; successful upload plus server updated-field confirmation saves the correction. Current owner metadata/private Storage authorization supplies real images. | Failed uploads retain the selected cropped photo for retry. No mockup customization controls or sample reasons enter the product. Photo-only and multi-field browser cases exercise real crop and upload-client transitions; actual Storage/RLS continuity remains in moderation coverage. |
| Ready and submission | Ready requires the existing validated server readiness and all requested updated fields. No local draft/success flag grants readiness or approval. Final field save never calls submit. Only the summary's explicit Send for review action uses the existing exact revision RPC and duplicate-gesture guard. Awaiting approval comes from the confirmed server status; full founder approval removes the flow. | Localized singular/plural summary and receipt copy distinguish saved/unsubmitted, submitted and approved states. Failed submissions retain the ready summary; lost-success responses reconcile without duplicate commands. Opening the focused cycle acknowledges its existing durable notification once, without a separate interruption. |

### Temporary CI browser policy (2026-10-06)

The CI selector uses runner UTC time (`Date.now()`, milliseconds since Unix epoch)
against the fixed code deadline `2026-10-12T00:00:00Z`. Before that instant, a
non-draft `pull_request` with targeted/full scope is exempt from automatic
browser execution; at or after it the normal scoped requirement returns.
`workflow_dispatch` always requires fresh full browser execution. No request,
environment override, PR label or editable event timestamp supplies this clock
or deadline. The selector emits a fixed single-line `browser_exemption` string
through GitHub job outputs, used only in check summaries, with no coercion or
user-supplied shell content. Tests cover both scope modes, drafts, manual runs,
ordinary exemptions and the exact millisecond expiry boundary. No application
input, database command or participant feedback changes.

### Public privacy contact (#141, 2026-10-06)

Email preferences, public unsubscribe and the existing privacy page use the fixed
`PRIVACY_EMAIL` string in `lib/privacy-contact.ts`. The `mailto:` destination is
exactly `privacy@getamourette.com`, with no subject, body, token, participant
identifier or other request/browser data appended. It is a required code constant,
not an environment override or user input; no normalization or runtime input
validation is needed. Activating the link opens the user's email handler and
does not submit an application command or erase data. Localized copy directs
data-rights requests to this contact and distinguishes them from unsubscribe.
Existing subscription inputs and consent versions remain unchanged.

### Welcome-email reply address (#142 / #202, 2026-09-30)

`RESEND_REPLY_TO_EMAIL` is an optional server-side environment string passed to
Resend as `reply_to`. Missing or empty values use `hello@getamourette.com`; a
nonempty override is passed unchanged, without trimming, coercion, or a local
length limit. Operators must configure a valid mailbox address. Resend enforces
the provider's address-format and size constraints; invalid provider requests
follow the existing failed-delivery policy. The subscription remains saved and
the browser does not receive provider errors or delivery details. The setting
is never accepted from a browser request and does not change consent, recipient
selection, or the sending identity. `test:email-delivery` covers the configured
override/default wiring; actual reply delivery requires a production mailbox test.

### Current email consent versions (#142 follow-up, 2026-09-30)

The service-only `subscribe_to_marketing_email` RPC requires an exact, non-null
string version for the given source, without trimming or coercion: `landing`
uses `landing-night-announcements-v2`, `subscription_management` uses
`email-preferences-v2`, and `room_popup`, `waiting_room`, and `empty_room` use
`global-live-night-email-v1`. Obsolete, unknown, missing, and mismatched versions
are refused before idempotency checks, subscription writes, or outbox effects.
The existing source/locale allowlists and email bounds remain enforced.

The storage CHECK additionally represents the historical `2026-07-24` landing
and `email-preferences-v1` preference records, without updating their versions.
Participants retain no direct table-write or subscription-RPC permission; only
the authenticated application server can issue a new subscription command.
Old pages must reload to submit current consent. RPC refusal keeps the existing
generic save-failure feedback. SQL regression coverage reads the actual app
version map, exercises every source in EN/FR/ES, and verifies history, one welcome
delivery per new subscription, idempotency, role restrictions, and refusal without
side effects. The migration does not send any real email.
### Matching-preference consent and withdrawal (#281, 2026-09-30)

October 1 integration with #282 preserves private participant revisions and
coalesced recovery. Either block outcome immediately cancels obsolete room reads
and starts replacement reconciliation. Signal composition and preference/read
deadlines use AbortController and cleaned-up timers/listeners without requiring
AbortSignal.any/timeout. Input values and authorization rules remain unchanged;
deterministic and browser tests cover compatibility, timeout retry and the block race.

Applied to shared development with Marwane's approval on 2026-09-30 as remote
version `20260930165002` (`matching_preference_consent`), after #257/#282.
Targeted Supabase and Vercel preview journeys and full hosted validation pass
(run 36843130882, October 1). Remaining physical-device verification is pending. Earlier local-only validation
paragraphs below are historical and superseded by the application record.
The #203 framework hands public-copy delivery and release reconciliation to #299.
The `matching-v1-draft` evidence version is unchanged. The surrounding information
and `/privacy` now use launch-facing copy, without a public test-only notice.
#280 must include the approved schema and wording/configuration before real
registration opens; this copy change does not establish production readiness.

The final onboarding confirmations share the existing adulthood panel style.
The photo scales into the height remaining after the controls; localized browser
checks at 320×568, 320×740 and 393×851 cover no page overflow, matching checkbox
styles, 44px touch targets and independent unchecked agreement. Input values,
wording, validation and server enforcement are unchanged.

| Input / state | Runtime contract and enforcement | Feedback / coverage |
|---|---|---|
| Final signup agreement | Separate checkbox, initially false, beside adulthood confirmation. No inferred agreement from information links, drafts or previous accounts. `matching_consent` must be the boolean literal true in the initial-profile JSON; `matching_consent_version` must equal `matching-v1-draft`; locale exactly `en`, `fr` or `es`, no normalization. HTTP validates before upload authorization/processing; signed upload tickets bind the same fields; service-only photo SQL validates and records proof in the same transaction as profile creation. The existing 16 KiB profile envelope remains. | Missing, false, null, strings, numbers, unknown version/locale and extra keys refused; UI keeps submission disabled and preserves non-sensitive drafts on errors. Changing the displayed locale requires accepting that wording. |
| Preferences in browser drafts | New scalar drafts whitelist name, bio, adulthood confirmation and step 0–2. Gender, interests and agreement are never written, even after checking the box. Existing draft records are scrubbed on application entry and load; malformed/oversized records are discarded. Answers remain only in mounted form memory and must be re-entered after reload. An offline older client cannot be remotely erased; cutover requires the new application. | Browser tests exercise storage writes, historic drafts, resume, information-only interaction and both confirmations. Photo/name/bio draft behavior remains independent. |
| Stored preferences | `gender` and `interested_in` may both be SQL NULL only when absent. Otherwise gender is one of three existing values and interests are a unique one-dimensional set of 1–3 allowed genders. Triggers refuse values without private active consent, including direct writes and the preference-edit RPC. The shared candidate/like predicate requires both participants' active consent. | Unknown legacy consent fails closed; the migration erases legacy answers without creating proof. Bio/name/photo editing and established chat access remain independent. |
| Owner consent state | `get_my_matching_consent()` accepts no identity argument. Authenticated owner only; returns boolean active, UUID revision or null, nullable server grant/withdrawal/cooldown timestamps and required server-now timestamp. Browser validates state before enabling commands. Raw state/evidence/wording tables have RLS, no participant or service-role table grants, and no Realtime publication. | Read failure disables commands without claiming withdrawal succeeded. Foreground, online, existing invalidation and 30-second recovery refresh state. |
| New agreement | `grant_my_matching_consent`: required JSON boolean literal true (JSONB argument prevents PostgreSQL boolean string coercion), exact version/locale, valid gender/interests, required UUID request ID and nullable expected UUID revision. No trimming or coercion in the UI contract. Authenticated identity comes from the session. The existing eligibility lock serializes writes. Same request retries do not duplicate evidence; old revisions/requests cannot re-enable a withdrawn agreement. | `saved`, `unchanged`, `stale`, or `cooldown`; fresh answers and unchecked agreement after withdrawal. Preserve the old cooldown deadline without its answers. Initial entry starts without a cooldown; re-consent after withdrawal starts the normal 12-hour window. |
| Withdrawal | `withdraw_my_matching_consent`: required expected UUID revision; no caller identity, reason or timestamp. Atomic state/evidence update, nullable preference erasure, deletion of both directions of likes, pair authorizations and request receipts; clear identifiable `private.night_people.gender` when #257 is present and prevent late restoration without active consent. No cooldown on withdrawal. Repeating withdrawal is harmless; a stale withdrawal cannot revoke a later agreement. | Explicit confirmation explains matching shutdown, preference removal, continued existing conversations until night end and the return waiting period. Failure remains visible with a state reread. |
| Evidence | Private server timestamps, participant reference, event revision/action, locale and immutable wording version. The exact translated agreement is stored in the version catalog. No actual preference values, email, phone, IP or device fingerprint are added as proof. Evidence follows profile deletion; a separate retention period after withdrawal awaits #203 and must be settled before public use. | Isolated SQL executes real migration/RPCs, proof recording, failed-transaction rollback and retry/replay behavior. |
| Realtime | Reuse existing owner/photo and public-night revision refresh; integrate #282's private participant invalidation when present. Capture the eligible audience before revocation. No consent state, withdrawn profile ID, preferences or reason in a public notification. Revalidate server authority for every like; old candidate tokens stay invalid after re-consent. | Existing profile editors unmount on confirmed withdrawal, clearing their preference drafts; room refresh removes stale candidates. Controlled browser tests cover active-session invalidation and failure recovery. Actual shared WebSocket delivery, concurrency and preview inspection remain unverified until the coordinated cutover. |
| QA matching inputs | A selected tester must have one allowed gender and a unique array of 1–3 allowed interests; null/absent/malformed pairs are unavailable, with no coercion. The consent database guard enforces active agreement for stored pairs. Reseeding reads and validates the tester and builds the profile plan before changing venues, nights or shared fixtures. QA partner selection rejects an unavailable tester and skips candidates with unavailable answers. | Request fresh preferences and explicit agreement in the tester profile before retrying. No consent is inferred or granted for a human tester. Synthetic lifecycle fixtures insert absent preferences then grant through their own authenticated session; their initial edit version exists with no initial cooldown. |

Withdrawal leaves existing matches, messages and presence intact. Scheduled night
expiry/terminal cleanup, blocks and moderation keep their current rules. Continued
chat processing and any sensitive inferences need the agreed #203 justification;
this consent does not authorize gender analytics. Previously finalized reports,
provider backups and safety records follow their own retention policies; this
change does not claim instant cross-system erasure. Coordinate deployment with
#257 and #282 (already applied remotely ahead of this checkout) and #276's profile
UI work. Database types were regenerated from the applied remote schema, retaining
documented nullable RPC/argument and trigger-supplied input refinements. Security
advisors were inspected; intentional private tables without policies and callable
authenticated owner RPCs are expected notices, not evidence of public table access.

Local verification on 2026-09-30: lint, production build and the full logic suite
passed. The consent SQL suite executes the migration in isolated PGlite, including
chat/match access policies: withdrawal preserves an established conversation,
outsiders cannot write, and night expiry still closes access. Twelve controlled
Chromium mobile tests cover consent and existing preference editing; 320 px
screenshots were inspected locally. The prepared hosted multi-participant test
has not run. These checks do not verify the shared Supabase migration, real
WebSocket delivery, concurrent transactions or Vercel/device rendering; those
remain required before a Ready-for-review claim.

Review corrections preserve the mounted feed and its scroll position while an
existing active agreement is revalidated. Heart buttons and double-tap likes are
disabled until verification succeeds; a failed read exposes a retry without
replacing the feed, and confirmed withdrawal removes it. The controlled room
test covers delayed polls, recovery, failures and withdrawal. Isolated script
tests execute the reseed preflight and lifecycle fixture constructor with fake
clients, verifying refusal before shared effects and authenticated consent.
The real preference-edit and venue-night lifecycle suites still require the
approved shared migration and have not been run against Supabase for this change.
Correction validation: `test:matching-consent` (SQL, input and fixture scripts),
lint, TypeScript and production build passed; seven controlled Chromium mobile
tests passed (six consent UI cases and the room polling regression), creating no
shared accounts or fixtures.

Further review corrections adopt the runtime-validated mutation state immediately
after checking its allowed result status, superseding older reads. A failed
follow-up read retains confirmed withdrawal and cannot restore the preference
editor or sensitive draft. Consent reads enforce a 15-second transport timeout
with AbortController and a cleaned-up timer/listener; timeout and supersession
cannot publish a late result. Room revalidation keeps cards and scroll mounted,
disables likes until successful reconciliation and offers retry after failure;
uncertain attendance does not become an empty room or false arrival cue.
Validation passed: consent SQL/input/fixture scripts, lint, TypeScript, production
build and nine controlled Chromium mobile tests, including missing AbortSignal
composition APIs, timeout recovery, confirmed withdrawal/read failure and delayed
or failed candidate revalidation. No shared fixtures were created. Actual Safari,
shared Supabase integration and Vercel/device inspection remain outstanding.

Concurrent-block correction: successful and refused block attempts both start a
replacement room reconciliation after invalidating older reads. Three controlled
room browser tests passed, including the two block outcomes with a delayed old
response arriving after the replacement: remaining likes recover and a confirmed
blocked participant stays absent. Lint, TypeScript and production build passed;
no shared accounts or fixtures were created. The existing hosted/device gates
remain outstanding.

Post-application validation: the real three-participant withdrawal journey,
anonymous signup-to-chat and preference-cooldown journey passed against Supabase
from localhost and against the protected Vercel checkpoint `c58fecb`. The consent
journey was repeated at 320 px; agent-inspected preview screenshots cover active
agreement, withdrawal with fresh unchecked answers, and renewed agreement with
cooldown. These tests created only owned fixture identities and venues, then ran
their teardown; permanent QA rooms were not reset. Lint, TypeScript, build and
consent SQL/input/fixture scripts passed after type regeneration. This is targeted
preview evidence, not the full hosted gate, a physical-phone/Safari check or final
public disclosure approval under #203.

The real venue-night lifecycle suite also passed after aligning its analytics
retention expectation with already-applied #257: require populated identifiable
events before terminal cleanup, their erasure afterward, exact aggregate report
counts through the admin RPC, and report stability on repeated cleanup. The
original checks for access expiry before cron, physical conversation deletion,
identity/safety/audit retention and an unaffected live night remain. All owned
lifecycle fixtures were removed; permanent QA night states remain healthy.

### Saved-profile Recrop source lifecycle (#181, 2026-09-23)

Recrop opens a cancellable modal with the existing localized processing message
before awaiting the private original. Confirmation remains disabled until the
source, decoded dimensions, restored coordinates and current preview are ready.
Escape/Cancel abort the active download; an obsolete success, error or finally
callback cannot reopen the modal, replace a draft or finish a newer request.
Failures close loading and show a localized source-load error with a fresh retry
available from Recrop. Profile editing alone does not download an original.

One successful source response may be retained in a page-local ref, keyed by the
session owner's UUID, photo-version UUID and nonnegative integer revision. These
are existing server values, without trimming or coercion; they are never persisted
to browser storage or a public/shared cache. The source remains the validated
`File` returned by `loadPhotoSource`: nonempty JPEG/PNG/WebP, at most 50 MiB,
with existing percentage-crop validation and legacy metadata. Session equality
is checked before reuse. Unmount, owner/session change, version/revision change,
photo replacement and successful submission discard the retained source. A
revision change also aborts pending loading and closes a saved-source editor.
Cancelled edits do not change the accepted crops or make the profile dirty.
Sources under mandatory correction are never retained, so the server checks
their time-dependent retention on every opening. HTTP authorization, private
no-store transport, submission revision checks and independent crop validation
remain unchanged; no prefetch or migration is introduced.

`tests/profile/recrop-source-loading.spec.ts` controls source responses and session
signals in real browsers without shared DB writes. It covers loading/dismissal,
retry, request races, memory reuse/page exit, revision/version invalidation and
session isolation. Actual source access control remains covered separately by
`tests/validation/photo-source.spec.ts`.

### Participant invalidation (#195, applied 2026-09-30)

`participant:<own UUID>` is a private Broadcast topic derived only from the current
authenticated session, including anonymous Auth sessions. Its only accepted event
is `state_changed`. Payload must be a non-null, non-array JSON object with required
numeric literal `version: 1`, optionally an `id` string containing a canonical
36-character hyphenated hexadecimal UUID. No trimming or coercion is performed.
Additional keys, wrong types, missing version and malformed IDs are ignored before
reads. The transport ID is random, unrelated to any profile/match/request, and is
never a query argument. No participant change reason or content belongs in payloads
or application logs. Topic receive policies bind both row topic and subscribed
topic to `auth.uid()`; restrictive policies reject foreign recipients and client
sends even if a future feature adds broad policies.

`my_participant_revision()` accepts no arguments and requires an authenticated
session. It returns only the caller's opaque UUID revision, or SQL/JSON null before
the first recorded invalidation; null is a valid initial state, not a failure.
Clients validate the runtime response as null or a canonical 36-character UUID
string, without normalization. Other responses fail verification and retry; no
arbitrary participant argument or private change metadata is supported. The
revision table is in `private`, has RLS and no client/service-role grants, is absent
from the Realtime publication, and cascades with the owner's profile. The revision
and last transaction ID deduplicate one recipient per transaction without exposing
event counts or keeping an unbounded history.

The local `amourette-participant-refresh` event has no data payload. It requests
currently authorized view reads, never grants access or acknowledges a chat notice.
Private signals coalesce over 200 ms; visible-tab revision
checks run every 30,000 ms, with failed reads retried after 5,000 ms and coordinated
requests bounded to 15,000 ms. Hidden tabs recover when visible. View disposal and
newer generations invalidate responses. Profile drafts are retained. Malformed
signals produce no user-facing message; existing neutral unavailable/error states
handle failed authorized reads. Missing pre-application RPC uses legacy recovery.
The visible recovery tick also retries transient photo failures at an unchanged
revision; successful photo reads clear that retry request and avoid repeated downloads.
An aborted revision read is not a successful verification: timeout keeps the forced
refresh pending and schedules the five-second retry. A superseding request or
unmount still follows the coordinator's trailing-read/disposal path. For an open
room, foreground/focus, online and channel reconnection also force the room-read
coordinator to abort an obsolete read before recovery; normal events remain coalesced.
For an open chat, an authorized empty `chat_partner_state` result closes the conversation and
clears its partner/messages before calling `match_presence_state`; the latter's
unavailable-match error must not prevent closure after a remote block.

The SQL, refresh logic and browser tests cover audience transitions, no-op/rollback,
owner-only requests, private access, burst coalescing, stale replies, drafts and
missed-event recovery. Real hosted transport and preview verification require the
founder-approved migration; local mocks do not prove those boundaries. The migration
was applied as `20260930093016` on September 30. Real own-channel delivery,
foreign-channel denial, remote-block convergence and unrelated-feed isolation passed
against Supabase from the local production build. Preview inspection remains pending.

### Live founder moderation queue (#232, 2026-09-20)

The private Realtime topic `founder-moderation` accepts only the literal event
`queue_changed` with a required JSON object payload `{ "version": 1 }`. The deployed
`realtime.send()` adds an optional `id`: a non-null, exactly 36-character UUID v4
string (hexadecimal, case-insensitive, canonical hyphens). This random transport
message ID carries no report or participant identity and is never used for reads.
Version is an integer literal; null, arrays, strings, malformed IDs, missing keys,
other extra keys and other versions are ignored before any refetch. There is no trimming, coercion, caller identity,
report ID, note, reason, timestamp, size-dependent text or unit-bearing value.
The database constructs the fixed payload; no report data travels in the signal
or application logs. The client validates the transport-added ID before refetching.

The migration's statement triggers cover inserts, updates and deletes on
`reports` and `moderation_cases`. Realtime SELECT is restricted to authenticated
founders on that topic; a restrictive policy protects it against unrelated broad
receive policies. Authenticated clients cannot INSERT signals for the reserved
topic, including founders. Existing report RLS and the founder-only
`admin_moderation_queue()` RPC remain the authority for the unchanged narrow
queue reads. Reporters retain their existing access to their own reports.
Notification failure never rolls back a safety report or moderation action.

Invalidations coalesce for 200 milliseconds. Reads serialize, with one follow-up
when invalidated in flight, and each page request times out after 15 seconds. Reconnect,
online and visible-tab return trigger immediate reads. Visible tabs also recover
every 30 seconds, covering dropped signals and time-dependent queue metadata.
Background read failures retain the last successful queue and inspected report,
show stale feedback and offer Retry; initial failures offer Retry without a false
empty state. Explicit authorization failures or session changes clear cached report
data. Selection remains by report ID; a deleted report shows an unavailable detail
rather than silently selecting another report. The clock used for report age and
suspension labels advances on successful reads; priority rules are unchanged.

Queue reads use keyset pagination: reports ordered by `id` ascending and metadata
ordered by `report_id` ascending, at most 200 rows requested per page. Each cursor
is the last returned database UUID, required to advance strictly, and is passed
unchanged to PostgREST's exclusive `gt` filter. It is internal read state, never
user-entered, trimmed or persisted. Continue until an empty page, including when
the server returns fewer rows than requested. Both complete ID sets must match
before replacing the visible queue; failed pages retain the last complete view,
and authorization refusals still clear it. Aborting a refresh stops further pages.
Independent reads are not a shared snapshot: an insert/delete between them can
still require the existing invalidation follow-up or fallback retry. No SQL,
grants, priority policy, or shared API row limit changes are required.

Validation: `test:moderation-live` executes refresh races, signal refusal and the
actual migration in isolated PostgreSQL with a Realtime transport stand-in.
`tests/moderation/queue-recovery.spec.ts` covers controlled browser read/transport
states without shared writes. `tests/moderation/live-queue.spec.ts` requires the
approved migration and checks two founder sessions, participant reporting,
review/removal/restoration, recovery and private/public channel isolation.
Local lint, the full logic gate and production build pass on Node 22.22.1.
The controlled Chromium journey passes at Pixel 7 and 1440×1000 viewports; local
screenshots cover loading, initial failure, live/stale detail and empty state.
The logic run uses a checkout-local temporary directory because the existing
pick privacy assertion falsely matches macOS's `/private` temporary path.
Aymane authorized application of the prepared migration on September 21. The
branch is rebased onto `e00dc84` (#269/#267); their input contracts and tests remain
intact. Supabase management access was verified on September 21.
Integrated local arrival-to-chat and recovery tests pass. The deployed `fa7f9c2`
preview also passes controlled recovery at Pixel 7 and 1440x1000; the agent inspected
loading, initial error, live/stale detail and empty screenshots. The harness uses
the existing optional `E2E_VERCEL_BYPASS` value unchanged and only on the application
origin, matching shared fixtures; it never forwards it to Supabase or logs it.
Draft CI passes with `full false` evidence: browser execution is explicitly deferred.
The shared migration was applied as `20260921202501_live_moderation_queue`.
Remote catalogs confirm both statement triggers, all three reserved-topic policies,
and denied direct client execution of the trigger function. Generated public types
match after retaining existing nullable-result and trigger-supplied refinements;
this migration introduces no public-schema types. Security advisors have no ERRORs;
the authenticated-role warning includes the intentional founder-only Realtime policy.
Existing project warnings remain (including public `pg_net`, callable guarded RPCs,
anonymous-session policies and disabled leaked-password protection).
The first real preview run exposed Realtime's added random UUID; the validator and
transport stand-in now cover that actual envelope. Real-session acceptance and the
full hosted gate must pass before moving the draft to Ready for review.

### Profile preference edits (#230, 2026-09-22)

Applied with founder approval on 2026-09-23, remote version `20260923081456`,
from `20260922000001_profile_preference_cooldown.sql`. `get_my_profile_edit_state()`
takes no arguments. `update_my_profile_preferences(p_gender,p_interested_in,
p_expected_version)` accepts a required exact `woman|man|nonbinary` string, a
required one-dimensional array of 1–3 distinct non-null values from that same
enum, and a required nullable UUID version. No trimming, coercion, case folding
or ordering semantics; malformed UUIDs fail at the SQL boundary. No owner ID is
accepted: both RPCs require `auth.uid()` and an existing owned profile.

Both return gender, preferences, nullable opaque UUID `version`, nullable
`available_at` timestamptz and `server_now` timestamptz. The write additionally
returns exact `saved|unchanged|stale|cooldown`. Clients runtime-validate every field,
including finite timestamps and enum/array/version bounds. Initial absence of
private state means null version/deadline. Effective changes create a fresh
version; identical sets do not. Target equality succeeds before comparing the
expected version. Otherwise a stale version or active cooldown refuses all effects.

Changing gender or adding any preference starts 12 hours (43,200 seconds), measured
after eligibility/profile lock waits. `server_now >= available_at` allows edits.
Removing choices alone neither starts nor extends the deadline. The database
trigger protects direct writes and mixed bio/preference writes atomically, with
no role exemption. Validation occurs before auxiliary state or like cleanup.
State cascades with profile deletion, has no participant grants or Realtime feed.
Existing profile column grants and `get_my_profile()` remain unchanged.

Bio saves send only normalized `bio`, retaining the existing 300-code-point rule.
Preference drafts and versions stay in memory. A short confirmation states the
12-hour restriction and remaining reduction access. The fields show proposed
values; the persistent message displays the actual server deadline. The founder
requested removing the redundant recap and indicative time on September 23.
EN/FR/ES messages distinguish loading, success, cooldown, conflict and transport
failure. On uncertain writes, reread before retry; failed rereads preserve drafts
and disable writes until verification succeeds. Foreground/expiry reads preserve
drafts; a changed version requires an explicit action to adopt the current state.
The editor receives required, non-null boolean `consentVerified` and
`consentLoading` flags from the owner consent hook, without coercion or inference
from a cached active state. During a pending background read, an existing valid
restricted draft may open its in-memory confirmation; this has no database effect.
The confirmation's write and direct reduction saves still require successful
preference and consent verification, no pending preference read/mutation, no
version conflict and the existing server cooldown contract. Completed failed
verification disables the main Save and final confirmation until a fresh read
succeeds. Existing EN/FR/ES loading/error copy appears inside an open confirmation.
Controlled browser coverage inserts a consent recheck between pointer down/up,
holds both reads independently, refuses writes while either is pending or failed,
and verifies exactly one unchanged RPC payload after recovery.
The editor's leave guard includes bio, photo, preference and unsubmitted name
correction drafts; saving one group does not clear another group's dirty state.

Remote types were regenerated after application and reconciled to the two #230
RPCs, retaining nullable version/deadline/expected-version refinements. Unrelated
photo-crop and email-campaign schema stays with its owning branches. Read-only
checks confirmed zero initial state rows, RLS enabled, no Realtime publication,
no direct state privileges for anon/authenticated/service_role, and authenticated
only RPC execution. Security advisors added only the expected private-table
no-policy notice and the two intentionally authenticated SECURITY DEFINER RPC
warnings; the owner checks and privilege boundaries are explicit above.

### Moderated first-name corrections (#229, 2026-09-21)

Applied with founder approval on 2026-09-22 at 07:27 UTC from
`20260921000002_profile_name_corrections.sql`, remote version `20260922072725`.
The shared preflight found 158 valid existing names and the expected limited
participant UPDATE grants. No existing name is rewritten by migration. Deploy the
editor without `first_name` in ordinary saves together with this behavioral cutover;
older editor saves are refused after grant revocation. Initial creation retains
the existing photo/onboarding validation, normalization and required-name contract.

- `submit_name_correction(p_request_id, p_proposed_name)`: required non-null UUID
  and string. UUID parsing rejects malformed IDs before function effects; name raw
  payload is capped at 16 KiB, boundary trimmed with the shared ECMAScript whitespace
  set, 1–30 Unicode code points, no case folding/NFC/internal whitespace rewriting.
  Reject the normalized current name. Client validation gives localized feedback
  and preserves drafts; SQL validates before writes. The private table CHECK repeats
  the bounds/normalization. Owner comes only from `auth.uid()`, with no venue requirement.
  A partial unique index allows one pending proposal. The UUID and normalized
  proposal recognize network retries, including after terminal decisions; reusing
  an ID for another owner/proposal fails. No quota or cooldown. The browser retains
  the request ID in memory on uncertain submission and blocks double submissions.
  A successful reread of that ID confirms it, allowing a fresh ID for a subsequent
  request after cancellation/decision even when the original response was lost.
- `my_name_correction()` has no arguments. Return current name plus nullable latest
  request ID/proposal/status/timestamps; no request exists when those fields are null.
  The owner never receives admin attribution. `cancel_name_correction(p_request_id)`
  requires the exact non-null owned UUID and returns its actual current status;
  only pending transitions to cancelled. Proposals and terminal decisions are immutable.
- `admin_name_corrections(p_request_id?)`: admin-only; null/omitted UUID selects
  the global oldest-first pending queue, an exact UUID selects that history row.
  `decide_name_correction(p_request_id,p_action)` requires a non-null UUID and exact
  case-sensitive `approved` or `rejected` string (no normalization, free-text reason,
  aliases or null). Check admin and input before effects. Return `applied` Boolean
  and actual status; stale/repeated decisions do not overwrite history. The UI shows
  the resulting status and requires closing/reviewing again before another decision.
  Store decision time and admin UUID privately, preserving attribution if Auth is
  subsequently removed. An approval atomically applies the proposal and versions
  existing-match notices. A private, transaction-bound permit protects auxiliary
  privileged UPDATE paths; participant name UPDATE is revoked.
- `chat_partner_state(p_match_id)`: required non-null UUID, current authenticated
  match member, live nonterminal night, unexpired match/night, and no block in either
  direction. Return zero rows otherwise. Projection includes partner ID/name/bio,
  allowed photo (nullable), latest correction UUID, seen UUID (both nullable), and
  authoritative expiry timestamp. Name/version share one SQL snapshot. Preferences
  and departure do not revoke existing profile read. Proposals/rejections and all
  correction/notice tables have no participant table grants or Realtime publication.
- `acknowledge_name_correction(p_match_id,p_correction_id)`: two required non-null
  UUIDs, no coercion/normalization; exact current applicable version plus the same
  chat authorization, evaluated against wall-clock expiry after lock waits. Returns Boolean; stale/wrong/unauthorized versions have no
  effect. Rows cascade on match deletion. Multiple unseen changes collapse to the
  latest version; matches created after approval have no historical notice.
- Local storage `amourette-name-seen:<owner UUID>:<match UUID>` stores JSON
  `{correctionId: UUID, expiresAt: number}` with expiry in Unix milliseconds,
  never names/proposals. Parse only objects up to 160 UTF-16 units with a UUID and
  finite future expiry; malformed/expired values are ignored and pruned. It is a
  local duplicate-suppression hint, never an authorization input. Write only after
  visible rendering, before the network receipt. Prune on chat mount, foreground return and expiry;
  browser suspension defers cleanup to the next active chat. Storage failure leaves
  server receipts usable; network failure leaves local suppression usable.

The visible visit notice is held independently of profile rerenders and stays until
navigation/reload, even after successful acknowledgement. Hidden reads never consume
it. Reuse chat's 15-second visible poll, foreground, online and channel reconnection
refresh; ignore superseded responses and continue refreshing after a notice is read.
EN/FR/ES participant strings follow the active locale; internal admin copy is English.

PGlite executes the migration and authorization/boundary/replay assertions; the
existing PostgreSQL 17 gate includes actual concurrent approval/refusal/cancellation,
submission replay, matching and terminal cleanup. Browser transport mocks exercise
client states independently. Remote types have been regenerated and selectively
reconciled, retaining nullable result fields and excluding unrelated #181 schema.
Security advisors report no ERRORs; private no-policy tables and authenticated
SECURITY DEFINER RPCs intentionally implement the authorization boundary. Real
Supabase/browser and Vercel viewport verification follows the authorized cutover.

### Transactional like commands (#231, 2026-09-18)

Applied with founder approval on 2026-09-21 at 17:50 UTC from
`20260918000002_like_write_authorization.sql` (remote version `20260921175045`).
The cascade follow-up `20260921000001_like_cascade_invalidation.sql` was applied
at 17:54 UTC (remote version `20260921175405`), retaining the same input contract.
`room_candidates(p_venue_id)` requires a non-null UUID venue and an authenticated
session. It returns the public card fields, `checked_in_at` (timestamptz), exact
`venue_night_id` and opaque UUID `like_token`; never gender/preferences or another
participant's likes. There is no text normalization or caller identity parameter.
The database checks the shared discovery predicate, including live wall-clock
expiry, visibility, presence, mutual preferences, photo eligibility, blocks and
unexpired ejections, before creating private pair state. No token is stored in
browser storage or published through Realtime. Presence/profile/photo discovery
first materializes candidates from the authenticated requester's exact visible,
active venue night, then applies that unchanged shared predicate. This execution
boundary prevents unrelated venues from reaching the private predicate without
weakening the authorization result.

`write_like(p_venue_night_id,p_target_id,p_action,p_request_id,p_token)` accepts:

- Night, target and request: required non-null PostgreSQL UUIDs (malformed strings
  fail at the PostgREST/PostgreSQL cast boundary); self-targets are refused.
- Action: required non-null string, exactly `like` or `unlike`, case sensitive;
  no trimming, coercion or aliases. Its enum is the length bound.
- Token: opaque UUID required for `like`, omitted/null for `unlike`; no trimming
  or token substitution. It must match this ordered pair and exact night and
  remain unexpired after locks. A token from a different pair/night fails.
- Actor: authenticated `auth.uid()` only, including anonymous Auth sessions;
  unauthenticated EXECUTE and extra caller-supplied identity arguments are denied.

Input errors fail before effects. Eligibility refusals return `accepted=false`;
valid live-night refusals consume a private request receipt. Receipts compare
all command fields with null-safe token equality. Same-ID/different-content calls
are refused; identical replays never reapply an effect. Responses contain Boolean
`accepted`, Boolean currently-authorized `liked`, and nullable UUID `match_id`.
Unlike requires prior participation in that exact live night and affects only the
caller's direction; it never removes an established match. Actor/request and
pair/night uniqueness remain database enforced. Participant INSERT/UPDATE/DELETE
on likes and matches is revoked, as are historical TRUNCATE/TRIGGER/REFERENCES
grants for participants and unauthenticated roles; trusted service fixtures retain inserts/deletes,
with new likes guarded by the same eligibility and pair locks. Like UPDATE is
also revoked from `service_role` because likes are immutable commands.

The UI captures the rendered card's token and creates a fresh UUID per gesture.
It reconciles all projections after success, refusal or uncertain transport,
discards superseded refreshes and deduplicates match reveals by ID. A neutral
EN/FR/ES notice exposes no reason for refusal and expires after six seconds,
independently of other errors. Only a successfully applied reconciliation gets
refresh-success wording; a failed/superseded reread uses unable-to-refresh
wording, including after an accepted command. Dependent read failures propagate
rather than count as successful empty results. Notices live only in component
state; a new gesture or session teardown clears them. An expired gesture is never
automatically resent with a fresh token. Failed reconciliation removes actionable
cards until a later successful refresh.

Compatibility interruptions rotate private tokens and clean unmatched ineligible
likes atomically in both directions; established-match rules remain unchanged.
No-op, compatible and bio-only edits preserve existing valid tokens. Night terminal
transitions delete pair state/receipts. The new SQL and PostgreSQL 17 tests cover
these boundaries, malformed/null inputs, direct-write refusals, replay and lock
ordering; Playwright covers stale gestures, lost HTTP responses and reveal dedup.
The full hosted gate passed on September 21 (20 Chromium mobile journeys,
including the actual REST/Realtime flows), along with the targeted shared-Supabase
venue-night lifecycle regression and its real scheduled cleanup. The deployed
Vercel preview passed the like-authorization journey at 360 × 800. Agent visual
inspection covered resting/pending, refreshed refusal, lost-response recovery,
failed refresh, match reveal and dismissal; supplementary FR/ES notice checks
covered keyboard activation, reduced motion, wrapping and timed dismissal.
This is browser emulation, not physical-device testing. See PR #269 for hosted
evidence; founder review/merge and the production application cutover remain.
RPC types were regenerated after application and reconciled to this branch's scope,
retaining nullable results and trigger-supplied fields.
Permanent venue deletion keeps its existing required UUID and admin/test-venue
validation, but now acquires the exclusive eligibility barrier before the venue
row and its foreign-key cascades. The PostgreSQL gate uses the real cascade shape
to verify both the lock order and deletion of per-night private command state.
Direct privileged venue DELETE takes the same statement barrier. Invalidation
updates only pair state whose night and profiles still exist; their FK cascades
remove pairs during parent deletion without creating intermediate FK violations.

### Server-authorized discovery and private preferences (#227, 2026-09-18)

Applied with founder approval on 2026-09-18 at 19:20 UTC from
`20260918000001_mutual_discovery_authorization.sql` (remote migration version
`20260918192025`). This is a coordinated behavioral cutover; the application PR
has completed integration and preview validation; its founder-authorized release
is tracked in PR #266.

`get_my_profile()` accepts no arguments or caller-supplied identity. PostgreSQL
uses the authenticated session UUID unchanged; no trimming, coercion, bounds or
units apply. Anonymous Auth sessions have the `authenticated` role and work;
requests without a session are denied. The result is zero or one row containing
`id`, `first_name`, nullable `bio` and `photo_url`, `gender` and `interested_in`.
Their existing stored-value constraints remain unchanged (name 1–30 and optional
bio at most 300 trimmed Unicode code points; the three gender values; 1–3 distinct
interests). No row means onboarding; RPC failures retain the existing localized
home/editor error feedback. The editor's direct owner UPDATE remains validated
by the existing input triggers and constraints; it does not request preferences
in RETURNING.

Participant card queries select only `id`, `first_name`, `bio`, `photo_url`.
Technical `created_at`/`updated_at` timestamps remain readable under the same RLS.
`gender` and `interested_in` cannot be selected, filtered, ordered or read through
joins, even for compatible candidates; column SELECT privileges enforce this
before execution. Owners use the RPC above. Founder moderation projections and
service-side analytics keep their existing authorization boundaries.

The private discovery helper accepts no inputs and returns presence UUIDs for
mutually compatible, visible, photo-eligible participants in the same live,
nonterminal, unexpired night, excluding blocks in either direction. Presence IDs
scope authorization to the exact attendance record. Profile RLS separately allows
self and established matches under the existing live-night/block rules. Match
access never grants discovery presence. `profile_photo_source` retains its UUID
input and nullable source output, and Storage uses the same profile boundary
for each fresh download. Own and founder photo access remains separate.

The removed RPCs `preview_room_profiles(uuid)` and
`set_venue_profile_preview(uuid, boolean)` have no replacement or accepted input;
old calls fail as missing functions. The unused private preview-like helper is
removed. The historical venue Boolean field is retained and constrained to false.
No participant discovery or photo authorization depends on it.

Profiles are excluded from the Realtime publication, including old UPDATE and
DELETE data. Existing presence payloads contain no profile preferences; Supabase
RLS protects current rows and delete payloads are limited to the presence primary
key. Existing night aggregate counts, owner attendance confirmation and room
invalidation contracts are unchanged. Already-rendered card invalidation is #195;
like-edit consequences and new like/match authorization remain #229/#231.

`test:discovery-sql` runs the migration in isolated PostgreSQL through the logic
gate: all 441 gender/preference combinations, direct reads/joins, forbidden
preference predicates, owner reads/edits, photo-path access, moderation, preserved
matches, blocks, hiding, departure, night expiry and removed preview functions.
The hosted moderation journey reuses existing identities for real participant
REST, Storage and WebSocket checks in `tests/helpers/discovery-authorization.ts`.
Local lint, TypeScript, the full logic gate and production build pass.
The deployed moderation/discovery journey passes on the Vercel preview with
isolated password fixture sessions, including REST, Storage and Realtime checks.
The #263 venue lifecycle/profile journey also passes locally after removing the
retired preview channel from its expected counts. Its chat-photo assertion uses
a generated 32×32 JPEG in private Storage: Chromium could not decode the hosted
favicon previously used as the fixture, independently of profile authorization.
The test-only optional image argument is a trusted Buffer generated by Sharp,
uploaded under the isolated owner UUID with JPEG content type and zero cache age;
fixture cleanup removes those bytes. It adds no application input or permission.
The browser fixture aborts only the injected Vercel feedback script, as the existing
visual harness does, because its toolbar intercepts mobile dialog controls; no
deployment protection setting changes. The first full hosted run passed
17/19 tests; its two failures were test expectations (an absent first-card primer
in an empty feed, and the removed preview subscription), corrected and verified
in targeted reruns. The full hosted gate then passed all 19 tests on `b7cfc92`
with default anonymous sessions; `d55642e` also passed all 19 tests and the final
Vercel venue lifecycle/profile/chat journey passed. Integration with #265 keeps
the explicit auth-mode argument third and moves the optional JPEG Buffer fourth.
The final merge validation follows main's ordinary password fixture default plus
the common journey's two anonymous participants; its results are tracked in PR #266.

Storage assertions use the same fresh cache nonce and `no-store` transport as the
application, and fixture uploads use `cacheControl: 0`: replaying a previously
authorized CDN response does not re-evaluate current SQL permissions. Realtime
profile edits use the owner session because the service role deliberately lacks
UPDATE on preference columns. No database permissions were widened for tests.
The preview screenshots of compatible/empty discovery, owner editing, moderation, and neutral
chat avatars were inspected at the Pixel 7 viewport; physical devices have not
been tested. E2E preflight refuses to create fixtures without that migration. Types
were regenerated and reconciled to this task, retaining nullable SQL results and
trigger-supplied fields; the unrelated remote photo-staging API was not imported.
Security advisors reported no ERROR findings. WARN findings include authenticated
SECURITY DEFINER functions (the new owner RPC is intentional and session-bound),
existing anonymous-auth policies, token-based unsubscribe RPCs, `pg_net` in public,
and disabled leaked-password protection. INFO findings concern service/helper-only
tables with RLS and no participant policies. No Auth settings were changed.
### Venue feedback (#198, 2026-09-18)

`submit_venue_feedback` accepts a required presence UUID and required text body.
The presence UUID is resolved against the signed-in profile, an active presence
(`left_at IS NULL`), and an unterminated waiting or live venue night before any
insert. Null, malformed, foreign, departed or expired presence IDs are refused.
The body is valid PostgreSQL text of at most 16 KiB raw UTF-8, with no NUL or
unpaired surrogate; boundary whitespace uses `private.trim_input`, with no
internal folding or Unicode normalization. The trimmed body must contain 1–500
Unicode code points. The form mirrors this rule with `isValidText`, counts code
points, and retains the draft on failure. The RPC and table check enforce the
same limit; one row per profile and venue night is enforced by a unique
constraint. A refusal leaves no feedback row and displays a localized error.
`has_submitted_venue_feedback` accepts one required venue-night UUID and derives
the profile identity from the authenticated session. Null input and unauthenticated
calls are refused. It returns only a boolean for that identity/night pair; it never
returns stored feedback or another participant's status. Feedback row SELECT is
founder-admin-only under RLS. The migration was applied to the shared development
database as remote version `20260919214445`; preview behavior was subsequently
verified on the deployed branch.

### Venue entry lifetime and owner-presence confirmation (#47, 2026-09-18)

The room's existing validated venue slug and authenticated bootstrap resolve the
venue UUID, night UUID and presence UUID. Departure and visibility writes target
that exact presence plus its owner, with `left_at IS NULL`; existing RLS and SQL
constraints remain authoritative. Departure writes use an untrimmed ISO timestamp
in UTC from the browser clock, as before; no new API/RPC or database constraint.
A successful departure write requests only `id, left_at`. If it returns no row,
an owner-scoped read of those same columns must confirm the outcome. Errors keep
the Leave dialog retryable with the existing localized error; they never count
as a successful departure.

The owner response is null (absent row) or an object with the exact expected
presence ID and required `left_at`. Null `left_at` means active; a non-null value
must be an ISO-shaped, parseable timestamp string of at most 64 characters.
Missing fields, another ID, arrays, non-string/non-null values and malformed dates
are rejected before changing the screen. Values are not trimmed, normalized or
coerced. Successful absence or a valid timestamp confirms a remote departure;
a failed or malformed read keeps the screen active and retries on its existing
poll. Reads remain constrained by participant RLS, including the owner exception
for historical presence; they do not expose another participant's attendance.

`venue_night_public_state` Realtime updates now serve only as invalidation signals:
no payload fields are cast into screen state. The existing typed, venue/night-scoped
REST projection supplies status, counters, timestamps and `updated_at`. Its
untrimmed PostgreSQL revision timestamp is compared for equality, never interpreted
as a client clock or authorization token. The existing status/terminal-reason,
integer count/threshold and timestamp database contracts are unchanged. A revision
is verified only after a successful owner check. Reconnect, foreground and online
events carry no data and force a check; concurrent signals coalesce into one
pending rerun. A second successful night read after an ended/absent presence gives
pause/end/cancellation precedence. Errors do not advance the verified revision.

Entry abort signals are memory-only and never grant access. Cancelled operations
cannot update candidates, matches, unread counts, overlays or status, including
after a slug change or explicit re-entry. Departed screens ignore subsequent
night/photo/focus/online triggers; Auth and global photo checks retain their
existing lifetimes. Logic tests cover resource states, cancellation, coalescing
and malformed owner responses; the isolated room browser journey observes HTTP
and WebSocket traffic and exercises departures, retries and recovery.

### Returning-home bio display (#209 review follow-up, 2026-09-18)

The optional, boundary-trimmed bio still accepts at most 300 Unicode code points;
normalization, API/database enforcement and form feedback are unchanged. The
returning-home profile card displays all accepted text, including 300 characters
without spaces, within its padding. Long words wrap when needed; ordinary prose
wraps at spaces. No ellipsis, line clamp, truncation or new migration is used.
`tests/onboarding/bio-layout.spec.ts` creates real profiles, checks persisted and
rendered text, and measures text bounds at 320, 375 and 393 CSS pixels. Its
unbroken-text case failed against the original deployed preview before the fix;
the ordinary-prose case passed. Physical-phone revalidation remains a separate
gate recorded in PR #255.

### Room-card bio display (#209 follow-up, 2026-09-18)

The room card uses the same unchanged 300-code-point input contract. Its two-line
preview remains intentionally clamped; tapping the card reveals the full bio,
retaining the existing vertical scroll limit for shorter screens. Both states
wrap long unbroken words within the text column instead of clipping a single
wide line or requiring horizontal scrolling. Ordinary prose still wraps at spaces.
`tests/profile/chat-preview.spec.ts` reuses its two isolated participants and test
venue through `tests/helpers/room-bio-layout.ts` to verify both states at 320, 375
and 393 CSS pixels, including the complete expanded text and a reachable like control. Before the fix, the real preview
failed the unbroken-bio width assertion (2,130 px in a 250 px column); prose passed.

### Private photo staging and bio boundary (#31/#209, 2026-09-18)

`POST /api/profile-photo/upload` keeps the bounded JSON manifest, signed owner
ticket and source/crop limits specified in the photo transport amendment below.
Its optional initial profile bio follows the current 300-code-point boundary
after trimming, with the same 16 KiB raw UTF-8 text cap. An otherwise valid
301-code-point bio returns HTTP 400 `{ error: "bio_too_long" }` before a staging
token or Storage object is created; a 300-code-point bio can proceed. The
legacy multipart finalization path enforces the same limit before image work,
and the client maps this refusal to the bio field. The database constraint and
photo RPC remain authoritative. `tests/validation/photo-staging.spec.ts`
covers the staged boundary; `photo-api.spec.ts` covers multipart.

### Photo revalidation responses (#256, 2026-09-18)

The existing `profile_photo_source` input remains a required profile UUID; its
authorized result is an unchanged, untrimmed source string or null (no visible
photo). Storage still checks participant RLS on each private download with a
fresh nonce and `no-store`. HTTP status is a numeric SDK response; absent/zero
Storage status, RPC status zero, HTTP 408/429 and 5xx indicate a temporary failure.
Other errors fail closed. No payload limits, source/path formats or grants change.

While a check is pending, the same participant's displayed image remains visible.
A null projection or definitive download refusal clears it; transient failures
keep the previous participant image until an existing synchronization retry.
Transient source/Storage and owner photo-state/version failures now
request a coalesced retry on the next visible 30-second recovery tick, even if
the durable invalidation revision is unchanged. A successful refresh stops these
retries; null projections and definitive refusals do not request retries.
Without a previous image the neutral avatar remains. New images decode before
display, failed decoding clears the image, and superseded responses are ignored.
Owner/founder review failures continue to clear the affected images, with the
same periodic retry for transient failures. In-memory,
payload-free refresh events request revalidation; a separate payload-free reset
event clears images on session-identity changes. Neither event grants access.
No private bytes are added to persistent browser storage. Browser regression
coverage lives in `tests/moderation/photos.spec.ts` alongside real RLS tests.

### CI selection, reuse and fixture Auth inputs (#264, 2026-09-18)

`scripts/ci-plan.mjs` accepts no argument, `--paths-only`, `--run` or `--github`;
unknown/multiple arguments fail before execution. `CI_BASE`/`CI_HEAD` are required,
untrimmed lowercase 40-character hexadecimal commit SHAs for PR/local selection.
Git must resolve both and their merge base. `GITHUB_EVENT_NAME` is absent locally
or exactly `pull_request`/`workflow_dispatch`; other nonempty values fail. Manual
dispatch always runs full validation. In `--github` mode it reads its checked-out
head and merge base with `origin/main` for evidence; PR mode requires a boolean
`pull_request.draft` in the runner-owned JSON event file. Missing/malformed JSON or
state fails selection. Ordinary local `--run` does not defer E2E as a draft.

Whole-PR paths use `git diff --name-only --no-renames -z base...head`; reuse uses
an ancestry check plus a direct tested-head/current-head diff. Outputs are bounded
to 16 MiB, NUL-separated, untrimmed and never shell-interpolated. Deleted and both
renamed paths count. Unknown/empty diffs select full coverage. Reuse admits only
the five exact Markdown paths in `scripts/ci-reuse.mjs`; everything else must be
unchanged. SHA validation precedes Git reuse commands; missing refs refuse reuse.
Dictionary exemptions still require unchanged AST structure outside plain string
property values in the three maintained dictionaries; parse/read failure refuses
exemption. Maintained suite names are passed to npm as literal argv.

GitHub event/repository/branch/run metadata and `GH_TOKEN` come from the runner.
The read-only token queries only this repository's `ci.yml` workflow (50 recent
runs, at most 100 jobs per candidate, 30 seconds and 16 MiB per API call). Evidence
must match the exact `CI evidence v1 <base SHA> <head SHA> <docs|copy|targeted|full>
<true|false>` format, the run's source SHA, workflow path, branch and repository,
and completed/success statuses. Only `pull_request` and `workflow_dispatch` sources
qualify. The current run is excluded. Base equality and sufficient coverage are
mandatory; a newer equivalent failure/incomplete run prevents older reuse. API
errors or malformed evidence fall back to execution, never success. Reused URLs
are constructed from the current repository and run ID, not arbitrary artifact
content. Runner-owned `GITHUB_OUTPUT`/`GITHUB_STEP_SUMMARY` paths receive scope,
execution status and proof links; write errors fail the command. No secrets or
participant sessions are included. No remote-state immutability is asserted.

`E2E_FIXTURE_AUTH` is optional, untrimmed and case-sensitive: absent means
`password`; only `password` and `anonymous` are accepted, empty/other values fail
before fixture creation. A typed per-identity override preserves anonymous smoke
participants regardless of the environment default. Password credentials are
fresh UUIDs with a unique `e2e-<UUID>@example.com` address, confirmed server-side;
tokens are obtained via ordinary password login with the publishable key. The
returned user must have role `authenticated` and the requested `is_anonymous`
boolean. The administrator is limited to fixture preparation/inspection/cleanup.
All returned Auth user IDs are registered before later failures. Anonymous signup
also includes a non-secret UUID run tag in user metadata; trusted cleanup uses
tracked IDs, not user-editable metadata. No automatic Auth retries are added.

The reporter classifies observed Auth/Supabase 429/rate-limit messages as
infrastructure failures, retaining the failed result. Per-test fixture-count
annotations are internal JSON `{password: number, anonymous: number}` counters,
not browser input; the summary aggregates actual creations without credentials.
Tests cover invalid mode input, partial setup/login failure ownership, wrong
identity mode, no-session refusal, and the maintained anonymous journey. Queue
capacity/scheduling, remote quota settings, runner loss and live provider state
cannot be reproduced by local deterministic tests; see `docs/workflow.md`.

### Worktree preparation input (#253, 2026-09-14)

`scripts/prepare-worktree.mjs` accepts exactly one required non-null string argument,
`feature/<slug>` or `fix/<slug>`, at most 100 characters total. The slug consists of
lowercase ASCII letters/digits separated by single hyphens. No trimming or case
normalization is performed; unknown flags, extra arguments, path traversal and
shell metacharacters are rejected before Git effects. Commands use argv arrays.
The source repository comes from the helper file location and Git's canonical
common directory, never a caller-supplied destination. The target is the canonical
main root plus `--<slug>`. Occupied/unregistered or symlink destinations and existing
unattached branches are refused before fetch/creation. Existing worktrees must
match the branch and destination; they are not reset or deleted.

The optional main `.env.local` must be a regular non-symlink file. Exclusive copy
preserves any existing destination, including a symlink; values are never logged.
Missing source env produces a setup warning. Dependency installation uses
`npm ci --no-audit --no-fund` when `node_modules/.package-lock.json` is absent;
failures propagate and preserve the prepared tree for inspection/retry. Git/npm
configuration, hooks and lifecycle scripts are trusted local development inputs,
not an isolation boundary. `test:pick` covers invalid arguments with unchanged Git
state, create/resume, collisions, env symlink refusal/non-overwrite and npm argv.

### Text, syntax and normalization

Text bounds count Unicode code points after trimming. The boundary-whitespace set
is exactly U+0009–000D, U+0020, U+00A0, U+1680, U+2000–200A, U+2028–2029,
U+202F, U+205F, U+3000 and U+FEFF, matching ECMAScript `trim`. U+0085 and U+200B
are not boundary whitespace. Preserve internal whitespace and original Unicode
composition; no NFC/NFKC transformation. PostgreSQL cannot store NUL or lone UTF-16
surrogates, so application text validation rejects them too. Raw text may occupy
at most 16,384 UTF-8 bytes before trimming. Optional blank text becomes SQL `null`.
SQL normalization triggers run before workflow triggers, with CHECK constraints
protecting persisted values. Rejected submissions retain the draft and show feedback.

| Input | Maintained write contract | Enforcement / coverage |
|---|---|---|
| First name | Required, 1–30 code points; unrestricted writing systems | Profile creation/edit/wizard, profile trigger and CHECK; logic, SQL and onboarding boundary assertions |
| Bio | Optional string/null; empty → null; at most 300 Unicode code points after boundary trimming, with the existing 16 KiB raw UTF-8 cap and invalid-text rejection | Shared creation/edit field; counter emphasized from 270, 300 valid; excessive input preserved and progress/save blocked; localized singular/plural removal feedback. Trigger, CHECK and photo RPC enforce the contract; #209 migration applied remotely on 2026-09-14; application deployment and preview inspection pending |
| Message | Required, 1–2000 code points | Submit and retry guards, trigger and CHECK; logic, SQL and chat rejected-draft assertions |
| Report reason/note | Existing five reasons; `other` requires a note; note at most 500 code points | Report RPC before case creation plus table CHECK; room/chat feedback and SQL snapshots |
| Private block reason/note | Existing five reasons; every note optional, including `other`; at most 500 code points | Room/chat submit guards, table trigger/CHECK; SQL and standalone chat-block browser assertion |
| Legacy ejection note | Optional/null, at most 500 code points | Same safety-note trigger and durable CHECK; no new admin note feature |
| Gender/preferences | `woman`, `man`, `nonbinary`; preferences contain 1–3 distinct values in one dimension | Runtime profile guards, draft restoration and PostgreSQL; duplicate/null/nested-array tests |
| Marketing email | Optional signup; submitted address required. ASCII only; 64-byte local part, 254-byte complete address | All capture surfaces share `isValidEmail`; bounded JSON API, service RPC and table CHECK; syntax and exact boundaries in logic/SQL/HTTP tests |
| Marketing locale/source/consent | `en`/`fr`/`es`; existing five sources; server chooses the matching consent version | Runtime guards; RPC validates before the idempotent return; existing enums plus source/version CHECK |
| Unsubscribe token | Exactly the generator's 32 random bytes encoded as 43 unpadded base64url characters, with canonical final bits | Page, POST, one-click and SQL functions reject malformed values before hashing. Preserve case and bytes, idempotent statuses and token expiry/revocation |
| Venue name/slug/location | Name 1–120 code points; unique slug 1–80 lowercase ASCII letters/digits/hyphens; existing Paris/Europe-Paris or New York/America-New_York pairing | UI, both venue-save RPCs, triggers and table CHECKs; direct-write and invalid RPC tests |
| Night schedule/threshold | Finite valid instants; entry < launch < close; existing nonoverlap/lifecycle rules. Threshold integer 1–2147483647 | UI integer/int4 guard, existing ordered/nonoverlap rules plus finite-date CHECK; existing venue-time tests and new SQL refusal tests |
| New admin password | At least 12 code points, unchanged bytes; confirmation must match | Independent submit checks in change/reset handlers plus native feedback. Remote Auth accepted 11-character changes in an isolated test on September 11; provider enforcement remains unresolved. Do not apply this minimum to existing login passwords |
| Moderation/other admin commands | Non-null case/venue IDs and explicit allowed action/boolean; UUIDs stay typed in SQL | NULL action/case refusal before any moderation lock or mutation; legacy live/preview boolean guards. Isolated authenticated no-side-effect tests preserve authorized review/removal/restore |
| URL and relationship identifiers | Canonical UUID shape for chat IDs; bounded venue slug for room/profile lookups | Runtime route guards plus PostgreSQL UUID/FK/RLS. UUID syntax never establishes authorization |
| Onboarding draft | Object; bounded strings; allowed gender; deduplicated interests; literal adult boolean; integer step 0–5 | Bounded raw storage read and runtime guards; profile submission remains authoritative |
| Chat retry/read/typing state | Retry records belong to the current owner and match, valid message/UUID/date/state, bounded collection; finite read-marker dates; typing is a strict boolean from the expected participant | Runtime guards, retry revalidation and logic tests. Presentation state does not confer access |
| Analytics | Existing events and acquisition limits (120/160/500); optional acquisition blank → null; properties object ≤4096 UTF-8 bytes with event-specific keys | RPC raw checks, normalizing trigger and table properties CHECK. IDs are UUID strings, visible count a nonnegative int4, source/status nonblank text ≤120. No new analytics feature |
| Dormant phone | No supported participant capture; existing values/column preserved | Participant phone INSERT/UPDATE revoked; used adult-confirmation writes retained. SQL tests prove the narrower grant |
| Webhook/worker | Signed Resend envelope with valid offset timestamp, bounded typed IDs/type/recipient list; unknown event names remain accepted. Worker limit stays normalized to 1–100, default 25 | Stream caps, runtime guards, service RPC prevalidation and event/provider-ID CHECKs; signature, malformed-calendar and no-side-effect tests |

Venue URLs are derived separately from the preserved venue name. Long generated
slugs use a shortened ASCII stem plus a random suffix; names without an ASCII stem
use a generated `venue-…` identifier. Neither case shortens or transliterates the
persisted venue name. Existing slugs remain unchanged on editing.

Marketing email syntax uses an unquoted ASCII dot-atom local part: no leading,
trailing or consecutive dots; punctuation such as `+` and apostrophes remains
allowed. Domain labels contain 1–63 ASCII letters/digits/hyphens with no leading or
trailing hyphen, at least two labels and a nonnumeric final label. Preserve the
existing lowercase storage convention for the full address. Validate ASCII before
case folding so a non-ASCII character such as the Kelvin sign cannot become an
accepted ASCII address during normalization. Quoted local parts,
domain literals and internationalized addresses are outside this V1 capture
syntax; this is not a claim that every rejected address is invalid under every mail
standard. Ownership, mailbox existence and deliverability remain in #63.

### Request and photo boundaries

| Boundary | Application ceiling / rule |
|---|---|
| Subscription JSON | 16 KiB, counted from the stream before parsing; invalid root/type → 400, oversized → 413 |
| Unsubscribe JSON | 1 KiB; malformed tokens retain `invalid_token`; oversized body → 413 |
| Email worker JSON | 1 KiB; preserve default/clamped operational limit; reject an oversized body |
| Signed Resend webhook | 256 KiB before signature/JSON processing; event/provider ID ≤200 code points, event type ≤120; up to 100 recipient strings ≤254; signature header ≤4096 characters |
| Photo multipart | 5 MiB file plus 64 KiB multipart overhead, counted before parsing; this is an application bound, **not evidence that Vercel accepts it** |
| Photo submission metadata | One file and one canonical decimal revision, integer 0–2147483647; optional single profile JSON field, at most 16 KiB UTF-8. Profile object has only first_name/bio/gender/interested_in/adult_confirmed; approved text/preferences types and literal adult `true` |
| Photo content | Nonempty genuine JPEG/PNG/WebP, ≤5 MiB; declared MIME must match full image decoding. Sharp's 25-million-pixel decode budget follows #194's resource protection. #77 adds no resize/compression |
| Storage bucket | Deployed 5 MiB and JPEG/PNG/WebP allowlist; retain #194's private bucket and all upload/reader policies |
| Local onboarding JSON | At most 32,768 UTF-16 units before parsing; field strings at most 16,384 units before restoration, with UTF-8/semantic checks on submission |
| Local chat retry JSON | At most 2 MiB raw text and 100 records; submission pauses at 100 unconfirmed messages while preserving the new draft; malformed or foreign records are ignored, never retried |

Photo filenames are untrusted labels, never proof of format. The integrated #194
uploader retains its immutable owner-prefixed UUID path, private Storage, existing
decode/re-encode transformation, revision checks and atomic submission RPC. #77
adds stream bounds, MIME/full-content validation and typed profile metadata before
Storage writes. The deployed `20260911000001_validate_photo_submission_inputs`
migration rejects null/negative revisions, absent owners/paths, noncanonical paths,
wrongly typed or excessive JSON and profile values before any RPC writes/locks;
the existing #194 transaction body and grants are preserved. SQL null metadata
means replacement; explicit JSON null is invalid profile data. No participant
profile INSERT, photo UPDATE or public upload permission is restored.

### Deliberate exceptions and release dependencies

- **#194 / PR #243:** fresh GitHub verification on 2026-09-11 found the PR merged
  at 10:11 UTC (head `0f45717`, merge `601022d`) and #194 closed. Its release note
  records production deployment. The earlier draft observation is superseded.
  Its application and generated types are now integrated locally, with #77's bounded
  reader and profile metadata checks. Existing photo processing is preserved.
- **5 MiB transport:** [Vercel's documented 4.5 MB request ceiling](https://vercel.com/docs/functions/limitations)
  is smaller than the approved photo source cap, even before multipart overhead.
  A reviewed transport change (for example, a private staged upload followed by
  server decoding/submission) is now tracked in [#249](https://github.com/getamourette/amourette-webapp/issues/249).
  Neither local decoding tests nor
  a nominal 5 MiB bucket ceiling verifies that end-to-end path. #246 remains the
  automatic optimization owner and #31 the manual crop owner.
- **Auth policy:** on 2026-09-11, a disposable Auth account tagged with
  `app_metadata.e2e_run` accepted all four password changes: 11 ASCII characters,
  11 code points including an emoji, 12 ASCII characters and 12 code points including
  an emoji. The two expected refusals failed: the deployed provider does not enforce
  the approved minimum. The account was deleted and absence confirmed; no email was
  sent and no founder credentials were used. No Auth-config inspection/update tool
  or Management API access token is available in this session, so the configuration
  value remains unread and unchanged. Follow [the Auth setup procedure](../admin-password-management.md)
  to set the minimum and repeat both ASCII and Unicode boundary checks. The finding
  and required follow-up were added to existing [#196](https://github.com/getamourette/amourette-webapp/issues/196)
  at Marwane's request; the policy mismatch remains unresolved.
- **Existing data:** `scripts/input-validation-preflight.sql` reads counts only.
  On 2026-09-11 it found one incompatible first name and two incompatible venue
  locations; all returned other text/email/preferences/slug/schedule counts were
  zero, and no stored phone values were found. Marwane then identified these as
  disposable test data and explicitly authorized deletion. Targeted cleanup removed
  the one anonymous test identity/profile and its single photo through the Storage
  API, plus `wiggle-room` and `chat-e2e-edeb6f22-9161-4a46-9029-d2e55ad33fce` and
  their two closed nights. Pre-deletion inspection found no associated presence,
  matches or reports. No shared permanent QA venue was reset. Follow-up catalog
  counts confirmed all targeted records and the photo object absent; the aggregate
  preflight now returns zero for every reported incompatibility. Empty tables may
  be absent from the text aggregate. No constraint exception or text truncation was
  introduced. Recheck before applying migrations because this is a shared database.
- **Presence clocks / adult confirmation:** retain existing ownership, timestamps
  and literal confirmation semantics. No DOB collection, new clock-skew policy or
  public authorization is introduced. Scheduled-night order, expiry and overlap
  remain authoritative; the UI's same-date/next-day editor is a convenience, not a
  new maximum night duration.
- **Historical subscription runner:** `test-email-subscriptions.mjs` still assumes
  revoked direct participant writes and is not validation evidence for #77. The new
  isolated tests assert those writes stay forbidden; targeted deployed revocation
  and delivery runners need their fixture/consent assumptions checked before use.

### Validation evidence and pending checks

`test:validation` is included in `test:logic`, so the existing required CI check
executes these regressions. It exercises the real prepared SQL against an explicitly
minimal PostgreSQL/PGlite substrate, including participant grants, invalid direct
writes and moderation snapshots. It is not a full Supabase stack: Auth HTTP,
Storage, deployed RLS/trigger composition and provider transport remain separate.
The HTTP suite under `tests/validation/api.spec.ts` exercises the production Next
handlers before any Auth/service call and creates no remote fixtures. Local lint,
`test:logic`, production build and both HTTP tests passed on 2026-09-11. SQL coverage
also verifies atomic rollback when historical content prevents constraint tightening.

After integrating #194/#247, lint, the production build and `test:logic` passed.
The combined photo SQL suite also applies #77's actual profile trigger/CHECK
statements and new submission guard, including malformed-profile snapshots and
valid 30/500-code-point inputs, while retaining #194's moderation/retention tests.
The general SQL substrate now models #194's revoked participant profile INSERT
and photo UPDATE; accepted participant metadata UPDATEs exercise the constraints.

Before the batch deployment, the full anonymous Chromium run exercised 13 tests: 11 passed, including the new
authenticated photo HTTP boundary test. Two new assertions failed for test-harness
reasons (an ambiguous alert locator and an unauthorized service-role block read).
The alert now targets the actual validation feedback; the block assertion reads
through the blocker's existing owner policy. Both affected journeys passed on a
targeted rerun. No permissions or behavior expectations were weakened. This is
coverage across the full run and two corrected reruns, not a fresh all-green full
gate run after the test corrections. Disposable fixture teardown completed.

Browser coverage now includes Unicode name limits, preserving an overlong chat
draft, optional private blocking, initial photo submission, and #194's photo
replacement/moderation journeys. The photo HTTP test rejects invalid metadata,
revision, MIME, corrupt/empty bytes and oversized envelopes before persistence,
then accepts exact Unicode boundaries. The post-deployment run and direct database boundary checks are recorded below.
Vercel preview inspection was completed during final delivery, as recorded below.
On 2026-09-11, after Marwane explicitly authorized this specific correction,
`20260909000002_reject_invalid_moderation_commands.sql` was applied through the
Supabase MCP as remote version `20260911135725`, named
`reject_invalid_moderation_commands`. A fresh pre-application catalog read confirmed
the original NULL fallthrough. Post-application inspection confirmed the exact
prepared function body, unchanged signature and unchanged execution grants. The
isolated SQL suite passed immediately before authorization; no remote moderation
command or sanction was executed. Security advisor findings were identical before
and after application, including the existing authenticated SECURITY DEFINER
[advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable);
the function retains its internal administrator check. Generated remote types
confirmed the existing `moderate_case` signature; unrelated #194 type changes were
not copied into this branch. This verifies deployment and isolated behavior, not
a complete remote moderation browser journey.

All nine #77 migrations are now applied: the earlier moderation NULL guard and
Marwane's explicitly authorized batch of eight. No Auth setting or PR merge was
performed. Final-delivery Git publication is separately authorized. Existing Auth and transport gaps
remain owned by #196 and #249 respectively.

Primary technical references: [ECMAScript whitespace](https://tc39.es/ecma262/#sec-white-space),
[trim semantics](https://tc39.es/ecma262/#sec-string.prototype.trim),
[PostgreSQL string functions](https://www.postgresql.org/docs/current/functions-string.html),
[SMTP sizes](https://www.rfc-editor.org/rfc/rfc5321#section-4.5.3.1),
[PGlite in-memory execution](https://pglite.dev/docs/filesystems), and
[Supabase Auth configuration](https://supabase.com/docs/reference/api/v1-update-auth-service-config).

### Applied shared-database deployment batch (2026-09-11)

Fresh read-only checks before requesting approval found no text, email/consent,
preference, venue, schedule, webhook, delivery-ID or analytics-property
incompatibilities. All 65 existing analytics rows fit the prepared property
contract. Before deployment, none of the eight names was recorded remotely, the
private photo bucket had no bucket-specific limits, and first names still allowed
50 characters. Marwane explicitly authorized the entire batch without individual
migration confirmations. Supabase MCP confirmed successful application in order:

| Migration under `supabase/migrations/` | Remote version | Effect |
|---|---|---|
| `20260909000003_input_validation_contract.sql` | `20260911145829` | Canonical text, email, preference, venue and schedule constraints |
| `20260909000004_validate_rpc_inputs.sql` | `20260911145832` | Reject invalid command arguments before effects |
| `20260909000005_validate_unsubscribe_tokens.sql` | `20260911145834` | Reject malformed unsubscribe tokens before hashing |
| `20260909000006_bound_dormant_inputs.sql` | `20260911145836` | Narrow dormant phone grants and bound analytics properties |
| `20260909000007_validate_analytics_rpc.sql` | `20260911145838` | Validate analytics RPC inputs |
| `20260909000008_bound_photo_storage.sql` | `20260911145839` | Private bucket: 5 MiB and JPEG/PNG/WebP allowlist |
| `20260909000009_validate_email_event_inputs.sql` | `20260911145840` | Validate provider event arguments and persisted identifiers |
| `20260911000001_validate_photo_submission_inputs.sql` | `20260911145842` | Validate #194 submission metadata before writes/locks |

Catalog checks confirmed all eight remote versions, the 30-code-point name CHECK,
a private 5,242,880-byte JPEG/PNG/WebP bucket, denied participant phone/photo writes,
denied direct profile/subscription INSERT, denied analytics TRUNCATE, and preserved
adult-confirmation UPDATE. Security advisor findings were unchanged, with no ERRORs.
Remote types were regenerated and compared: only the existing documented manual
corrections (trigger-filled likes fields and nullable RPC arguments/results) differ
from the generator. They were preserved; no type shape changed in this batch.

The batch changes shared database behavior immediately. It did not rewrite or
delete participant content, change Auth configuration (#196), solve the Vercel
upload transport (#249), or publish local application changes. The subsequent
Git publication and preview inspection are recorded below.

Post-deployment verification exercised the production build against the shared
development database. `npm run test:e2e` built successfully; four Chromium tests
passed, while nine stopped during anonymous fixture creation because Supabase's
signup rate limit was reached. The documented `E2E_FIXTURE_AUTH=password` local
fallback reran those nine with isolated confirmed accounts: eight passed. The
remaining photo moderation journey timed out at the admin gate; its trace showed
an unsuccessful `am_i_admin` network request (status -1) and the sign-in screen.
This does not establish a database permission regression or its underlying network
cause. No Auth limits, grants or test expectations were weakened.

The unchanged remaining journey passed on a targeted password-fixture rerun
(54.9 seconds). All 13 journeys therefore have post-deployment passing evidence
across the initial run and explicit reruns. That evidence alone was not a clean,
complete anonymous gate run; the subsequent full run below closes that gap.
After the final rerun, aggregate checks found zero remaining E2E-tagged Auth
accounts and zero `e2e-` venues created during the preceding 30 minutes.

A subsequent `npm run test:e2e` on September 11 passed the production build and
all 13 Chromium mobile journeys in one anonymous-fixture run (2.7 minutes), with
no retries or password fallback. Hosted checks and preview verification followed
during final delivery, as recorded below.
Post-run cleanup checks found zero E2E-tagged Auth accounts and zero `e2e-` venues
created during the preceding 15 minutes.

The passing photo boundary test also bypassed the application with ordinary
participant REST writes: PostgreSQL rejected 31-code-point names, 501-code-point
bios, excessive raw padding and duplicate preferences without changing the saved
profile. Exact 30/500 boundaries passed; ECMAScript boundary whitespace normalized
correctly, including an optional blank bio becoming null. Participant phone writes
remained forbidden. A malformed service-only photo submission was rejected before
changing the photo revision or displayed/pending pointers.

### Final-delivery preview inspection (2026-09-11)

The inspection below covered rendered input states, not successful photo upload
on Vercel. The September 14 finding below supersedes the earlier conclusion that
preview validation was sufficient for review readiness.

The agent inspected the real Vercel deployment of application commit `5191d76`
at [the branch preview](https://amourette-webapp-git-feature-input-validation-873ed8-tothe-moon.vercel.app),
using the existing project automation credential without changing deployment
protection. Two temporary Playwright inspection scripts used the repository's
isolated confirmed-account fixtures and teardown; 17 screenshots were visually
reviewed locally, not published with credentials or test sessions.

- At 360×800: onboarding empty/disabled, 31-code-point refusal, 30-code-point
  acceptance, unsupported-photo feedback, and email syntax errors in EN/ES.
- At 390×844: profile name/bio errors in EN/FR, an intact rejected chat draft,
  sending feedback, required/overlong report notes and optional private-block notes.
- At 1280×900: venue-name refusal and the 11-code-point new-password refusal.
- At 360×800: keyboard Tab/Enter sending, confirmed message feedback, Escape
  dismissal with restored profile-trigger focus, and report validation focusing
  the note. At a reduced 360×430 viewport, the report remained scrollable and its
  cancel action reachable. Reduced-motion preference was enabled.

Error copy, focus outlines, wrapping and action placement were readable in the
inspected states, with no horizontal page overflow. All fixture accounts and
venues were removed; a post-inspection aggregate check found zero recent leftovers.
This is real Chromium browser inspection with mobile emulation, not physical
iOS/Android keyboard or camera testing. It does not validate Vercel uploads at
the full 5 MiB source limit (#249), paid photo review, real email delivery or the
provider password policy (#196). Both required hosted checks passed on `5191d76`;
the final documentation-only commit must also pass them before Ready for review.

### Preview upload configuration blocker and resolution (2026-09-14)

Marwane reported five HTTP 400 photo submissions on the #208 preview on September
11 between 20:23 and 20:24 UTC, with successful authentication but no observed
Storage or submission-RPC calls. That deployment (`2b54906`) contains #194's upload
route and does not contain #77's new application guards.

A read-only Vercel environment inventory found `SUPABASE_SERVICE_ROLE_KEY` scoped
to production and only two preview branches: `feature/admin-photo-replacement`
and `feature/empty-room-states`. No general preview value or override exists for
#208 or #77. The public Supabase URL/key are available to both preview and
production. The server client is constructed after decoding the image; constructing
it without this key throws `supabaseKey is required.`. Both routes catch that
exception and incorrectly report HTTP 400 with an empty JSON body.

The failure was reproduced independently on the immutable #208 deployment
`amourette-webapp-3bp2d8a7e-tothe-moon.vercel.app` and #77's branch preview. Each
request used a newly created isolated confirmed fixture account, a fully decoded
32×32 JPEG of 275 bytes, revision zero and valid profile metadata. Both returned
400 `{}`, with no profile or Storage object created. Both accounts were removed.
This establishes a reproducible configuration blocker independently of the
original participant's image. The historical Vercel log query returned a tooling
HTTP 400; the five original requests were not independently re-inspected.

Before review readiness, configure the existing server-only key for the affected
trusted preview branches, redeploy them and verify successful profile creation
with isolated fixtures on the actual deployment. Missing server configuration
should also be distinguished from invalid image input in the upload response.
No Vercel configuration, application code or database schema was changed during
this diagnosis. Earlier local/CI upload tests had the service key and therefore
did not detect this deployed configuration gap. This is separate from #249's
large-upload transport limit and from the tested #77 database constraints.

Marwane then approved a common Preview configuration instead of repeating the
setup for each new branch. The existing development service key was added as one
sensitive project-level `SUPABASE_SERVICE_ROLE_KEY` targeting Preview with no
`gitBranch` restriction. A fresh inventory confirmed the new default and unchanged
existing variables, including production and the two prior branch overrides.
New previews inherit the default automatically; the two affected previews were
explicitly redeployed to receive it.

| Branch / code | New deployment | Verified browser outcome |
|---|---|---|
| #77 / `dfaadf5` | `dpl_5urAs9qHzv2PNVtBtXtCjcBVVEdy` | Anonymous photo onboarding passed |
| #208 / `2b54906` | `dpl_ziesCQT45ykHPDPZLVuAGrgQu7XD` | Anonymous photo onboarding passed |

Both stable branch aliases now target these ready deployments. A Chromium mobile
journey completed the real onboarding form, uploaded the same valid 32×32 JPEG,
received HTTP 200, and verified the saved profile, displayed photo pointer, one
Storage object and active venue presence. Each journey used an isolated anonymous
account and venue, removed by the existing teardown. The first diagnostic test
queried presence while the room still showed its welcome screen; it was corrected
to wait for asynchronous check-in, keeping the same assertion. Both corrected
journeys passed in approximately ten seconds each. No application code, migration,
production setting or deployment protection was changed for this fix.
Post-test aggregate checks found zero remaining E2E accounts and venues created
in the preceding fifteen minutes. The workflow and environment example now state
the shared Preview requirement and the successful deployed-upload check.

## Historical audit and approved product discussion (2026-09-09)

The remainder records the pre-implementation audit and staged approvals. Its pause
statements and observations are retained as history; use the current contract and
validation status above for ongoing work.

## Approved text contract

Marwane approved this block after reviewing the inventory:

| Field | Required state | Limit after boundary trimming |
|---|---|---|
| First name | Required, nonempty | 1–30 Unicode code points |
| Bio | Optional | At most 500 Unicode code points |
| Message | Required, nonempty | 1–2000 Unicode code points |
| Report note | Required and nonempty for reason `other`; otherwise optional | At most 500 Unicode code points |
| Block note | Always optional, including reason `other` | At most 500 Unicode code points |

Remove leading/trailing whitespace; whitespace-only input is empty. Preserve
internal spaces. Use the same Unicode code-point count in every enforcement layer,
not UTF-16 code units or grapheme clusters. Reject overlong submissions with clear
feedback rather than silently truncating persisted content. Preserve accents,
apostrophes, hyphens and non-Latin writing systems in names; do not introduce an
ASCII letters-only filter. The final rule block also approved storing optional
blank text as `null`. The exact shared whitespace definition, Unicode normalization
and raw payload caps still need to be specified; this approval does not silently
decide them.

These are approved target rules, not a claim that the implementation already
enforces them. All three proposed rule blocks have now been reviewed, but Marwane
explicitly requested that implementation not start yet.

## Approved marketing-email contract

Marwane approved the following capture scope for V1:

- Marketing signup stays optional in the participant journey. Submitting that
  signup requires a complete address shaped as `local@domain.extension`, with the
  same validation at every capture surface and enforcement boundary.
- Trim surrounding whitespace and reject internal whitespace.
- Accept ASCII addresses only for V1, with at most 254 bytes in the complete
  address and 64 bytes before `@`. Within ASCII, bytes and characters coincide.
- Preserve aliases such as `prenom+soiree@gmail.com`: do not remove plus tags or
  dots, and do not restrict signup to a list of popular mailbox providers.
- Reject malformed or overlong addresses with appropriate feedback. Syntax
  acceptance does not establish mailbox existence, ownership or deliverability;
  that work remains in #63.

ASCII-only support is an explicit V1 product restriction, not a claim that
internationalized addresses are invalid. End-to-end transport support must be
verified before expanding that scope. Existing casing behavior was not changed
or newly approved in this discussion; its cross-layer consistency remains part
of implementation review. This contract applies to marketing capture, not a new
restriction on existing founder Auth accounts.

Reference: [SMTP length limits](https://www.rfc-editor.org/rfc/rfc5321#section-4.5.3.1)
and [internationalized SMTP](https://www.rfc-editor.org/rfc/rfc6531).
The 254-byte address limit reserves the enclosing punctuation within SMTP's
256-byte path limit; the local-part limit is 64 bytes. The complete syntax rule
must also specify domain-label and local-part structure without silently treating
every address containing an `@` and a dot as acceptable.

## Approved remaining-field contract and scope

Marwane approved the final proposed block while explicitly keeping implementation
on hold:

| Input | Approved target rule |
|---|---|
| Dating preferences | 1–3 distinct choices from the existing allowed values |
| Photo | Nonempty genuine JPEG, PNG or WebP image, maximum 5 MiB; verify actual file content |
| Venue name | Required, 1–120 Unicode code points, using the approved text counting policy |
| Venue URL slug | 1–80 ASCII lowercase letters, digits or hyphens; unique |
| Launch threshold | Strictly positive integer |
| Schedule | Valid dates, entry before launch before close, no overlapping nights |
| New admin password | Retain the 12-character minimum and verify its enforcement in Supabase Auth; existing login passwords are not subject to a new minimum |
| Optional blank fields | Store optional blank text as `null` |

Reject invalid commands before any side effect, especially absent moderation
actions. Bound file/request sizes at the server and validate external identifiers,
arrays and restored browser data at runtime. Exact endpoint byte caps and relevant
platform constraints still require technical verification before implementation;
approval of a file limit is not proof that every upload path supports that size.

The photo cap is retained for this alignment task, not justified as an optimal
long-term product limit. It originated in commit `7d1a1a7` on 2026-06-20 without a
documented rationale for the exact value. Automatic resizing/compression before
upload is tracked separately in [#246](https://github.com/getamourette/amourette-webapp/issues/246),
covering onboarding and replacement, with source/output limits to decide there.
[#31](https://github.com/getamourette/amourette-webapp/issues/31) remains the related
manual crop/resize task. Coordinate upload/moderation with #194 and filename handling
with #159; do not implement photo optimization inside #77.

The future-field framework remains part of #77: engineering conventions, a
development/PR checklist, a maintained field contract and tests in the existing CI.
No implementation, migration, commit, push or shipping is authorized at this stage.

## Method and limits

Inspected all application forms, API routes, browser-storage readers, shared helpers,
local migrations and generated types. Queried the configured shared Supabase project
read-only for columns, CHECK constraints, functions, write policies/grants, migration
history and Storage bucket configuration. Confirmed that the MCP project matches the
application environment. Generated current types in memory for comparison only.

No application code, migration, remote data or configuration changed. No participant
records were read. Findings below are source/catalog analysis, supported by pure SQL
and JavaScript expressions where stated; rejected writes and browser journeys have
not been exercised. Auth provider settings, platform-wide request/upload ceilings,
and the server upload path from the separate photo work remain unverified.

## Deployment drift to reconcile before implementation

- The local first-name migration sets 30, but remote `profiles_first_name_check`
  still accepts 1–50 after SQL trimming. Do not assume a checked-in migration ran.
- Remote `photo_moderation` and `photo_conflict_status` migrations from September 9
  add four photo tables, nullable `profiles.photo_url`, a private bucket and a new
  service-only submission RPC. This branch still uploads directly and treats the
  photo URL as required public text. Coordinate with #194; do not overwrite that
  schema or regenerate unrelated changes into #77 blindly.
- Remote analytics objects exist in local generated types, but their original
  definitions are not in this branch's migrations and no runtime analytics caller
  was found here. Their callable input surface still belongs in the inventory.
- Remote migration versions can differ from local filenames. Compare migration
  names and actual definitions, not just timestamps.

## Inventory

“Required” describes the write contract unless the row explicitly distinguishes UI
and DB. Limits below are observed behavior, not a new specification. SQL text
length counts characters/code points; the browser's native `maxLength` uses UTF-16
code units. Neither is a user-perceived grapheme count.

| Input / surface | Observed UI and application rule | Remote enforcement / discrepancy |
|---|---|---|
| Profile `first_name` — creation and edit | Required string; JS trim; 30 native input units and 30 code points at submit; no alphabet restriction | NOT NULL; `length(trim(first_name))` 1–50. Raw stored length and full whitespace normalization are not bounded by this check. Local migration says 30. |
| Profile `bio` | Optional string; JS trim; empty becomes `null`; 500 native input units and 500 code points at submit | Nullable text, raw length ≤500; empty strings and whitespace-only text also accepted. |
| Profile `gender` | Required choice: `woman`, `man`, `nonbinary`; shared TS union; submit checks nonempty | NOT NULL and matching CHECK. TS row remains `string`; runtime casts do not validate external values. |
| Profile `interested_in` | At least one choice from the same set; UI toggles distinct values | NOT NULL text array; cardinality 1–3 and allowed membership. Duplicate values and multidimensional arrays are not excluded. Draft restoration filters allowed values but retains duplicates. |
| Profile photo bytes / MIME / filename | Required on creation, optional replacement; JPEG/PNG/WebP; ≤5 MiB; picker advertises broader `image/*`; no explicit nonempty-byte check; path includes original filename | Review API repeats MIME/size checks only when review is enabled; no content decoding or pre-parse body cap there. Remote bucket has no bucket-specific size/MIME caps, is now private and has no participant upload policy. New service-only photo RPC checks path, fresh object, metadata size 1–5 MiB and MIME; its uploader is absent here. A null bucket cap is not proof of unlimited platform uploads. |
| Profile `photo_url` / new photo path | This branch writes a generated public URL and requires it | Remote column is nullable unrestricted text after photo work; service RPC uses an owner-prefixed `.jpg`, `.png` or `.webp` path. Local row/insert/update types are stale for this column. |
| Private adult confirmation | Required boolean in onboarding; app writes client time as `adult_confirmed_at`; not requested again on normal edits | Nullable timestamp, ownership RLS; `check_in` requires non-null. No chronology check. New photo-creation RPC checks confirmation and writes DB time. Do not replace this with DOB collection. |
| Private `phone` | No current input or application writer found | Nullable unrestricted text, owner-write policies. Dormant writable column: explicitly retain as unused or restrict; do not invent a phone feature. |
| Marketing email — landing, live popup, waiting/empty room, preferences | Required through shared helper; JS trim + lowercase; simple `local@domain.suffix` regex. Only room surfaces have native max 254; landing disables native validation; preferences uses native email validation without a max | Service RPC requires a dot too; table CHECK only requires `local@domain`; neither RPC nor table has a length cap. Direct participant subscription writes are revoked. `abc@gmailabc` is rejected by the current shared helper/RPC: the issue's motivating example is not the full current behavior. Syntax never proves ownership or delivery (#63). |
| Marketing `locale` | `en`, `fr`, `es`; selected/preferred locale and API allowlist | Required text with matching CHECK. |
| Marketing `source` | `landing`, `room_popup`, `waiting_room`, `empty_room`, `subscription_management`; API allowlist | Required text with matching CHECK. No free-form source. |
| Consent / `consent_version` | Checkbox on room/preferences surfaces; landing uses submission and displayed copy. Server chooses the version from source; client sends email/locale/source only | Required nonblank version in DB, no max or source/version pairing CHECK. Client-controlled version is not accepted by this API. Consent UI evidence is separate from mailbox ownership. |
| Subscription JSON envelope / Authorization | JSON parsed with a TS assertion; individual field checks; Bearer token validated through Auth before service write | Root JSON `null` reaches `input.email` outside the parse catch and throws. No explicit application body-size ceiling. Wrong-shape/type cases need consistent 400 responses. |
| Unsubscribe token — page, JSON POST, one-click query | String from URL/body; missing or invalid JSON becomes invalid token; no length/format cap | Generator emits 32 random bytes as 43-character unpadded base64url; validators hash arbitrary strings and check expiry/revocation. Preserve case and exact bytes, and existing idempotent status behavior. Do not trim or lowercase tokens. |
| Chat `body` | Required after JS trim; native max 2000; submit and retry have no independent max check | NOT NULL; `length(trim(body))` 1–2000. Raw padding can exceed the nominal cap, and SQL trim does not reject all JS-whitespace-only strings. Matching membership, liveness, presence and block rules remain separate authorization requirements. |
| Chat message/match/sender IDs | Strings in TS; new message UUID generated for retry identity; route match ID forwarded to typed queries | UUID types, FKs, message PK, sender/match RLS. Malformed IDs need controlled UI errors; a valid UUID alone never establishes authorization. |
| Report reason | Fixed set: `harassment`, `fake_profile`, `underage`, `unsafe_behavior`, `other` | RPC allowlist plus NOT NULL table CHECK. Reporter derives from Auth, target/night are UUIDs and shared-night existence is checked. |
| Report note | Optional except `other`; JS trim, blank → `null`; native max 500, both room and chat | RPC requires SQL-trimmed note for `other`; nullable raw length ≤500 in table. Whitespace and counting mismatch; `other` requirement lives in RPC, not a table CHECK. |
| Block reason / note | Same reasons; default `unsafe_behavior`. Room allows blank `other` note; chat requires one. Notes trim to `null`, native max 500 | Reason required/allowlisted; note nullable, ≤500; no conditional requirement. Product choice must settle the room/chat disagreement without adding friction to blocking. |
| Block IDs / venue context | Actor/target UUIDs, optional venue ID; UI supplies current context | FKs, no-self CHECK, unique pair, actor RLS. The note's existence must not substitute for permission checks. |
| Room venue slug / profile `venue` query / `edit` query | Slug used for lookup; profile resolves venue before choosing return destination; edit only when exactly `1` | Slug stored as unique required text matching `[a-z0-9-]+`, no max. Lookup does not itself require a UUID. Validate route input without introducing alternate destinations. |
| Likes / check-in / scan / chat-start identifiers | IDs selected from app data; RPC parameters or direct typed writes | UUID/FK/ownership checks; check-in derives actor/night, like trigger derives night/expiry from shared visible live presence. Broader compatibility/concurrency work belongs to #227/#229/#231. |
| Presence `is_visible`, `last_seen_at`, `left_at` | Boolean toggle and client timestamps on own presence | Typed columns, ownership/night RLS and scoped update grants; no field chronology CHECK found. Server time/clock-skew policy needs an explicit decision if changed. |
| Admin sign-in email / current password | Email trimmed; login uses native required email; recovery click checks only nonempty. Password passed unchanged | Supabase Auth owns validation and secrets, plus admin membership gate. Live Auth email/password policy was not inspected. Do not apply marketing normalization or new-password minimum to existing login passwords. |
| Admin new password / confirmation | Native required/min 12 on both fields; handler checks equality; no explicit JS minimum or max; never trimmed | Supabase Auth is authoritative; deployed policy alignment unverified. Confirmation is local-only and is not persisted. |
| Venue `name` | Required after JS trim; no max | `save_venue_details` checks SQL-trimmed nonempty; table only NOT NULL. Authenticated admins also have direct INSERT, so RPC-only rules are not durable table invariants. |
| Venue `slug` | Generated from lowercased name, ASCII normalization, hyphens; retained on edit; no max | RPC/table pattern and unique constraint. Leading/trailing/repeated hyphens allowed by DB pattern. Non-Latin-only names can generate empty slug. No canonical size yet. |
| Venue `city`, `timezone` | Paired Paris/Europe-Paris or New York/America-New_York choices | Current details RPC checks rollout values/pair, but nullable city plus SQL null logic leaves gaps. Older callable `save_venue_configuration` lacks the same rollout validation; direct admin INSERT has only column types. |
| Night date, entry, launch, close | Required date/time; venue-local resolver rejects DST gaps/ambiguities; launch later on same date; close may roll into next date; overlap feedback | Required timestamps; ordered times, no overlapping nonterminal nights, future close and edit lock enforced. RPC/table do not require finite timestamps or all the UI's same-date/next-date restrictions. These restrictions need classification as product invariant vs UI convenience. |
| Night launch threshold | Number input, min 1, default native integer step; JS `Number` conversion; no max | Required SQL int4 >0. App type is broad `number`; no explicit finite/integer/range validation in handler. Decide whether an operational upper limit is needed beyond int4. |
| Admin moderation action / case ID | Buttons use `review`, `remove_for_night`, `restore`; UUID case ID | Admin-only `moderate_case`: `p_action NOT IN (...)` does not reject SQL NULL. NULL skips review/restore and reaches removal. Confirmed by source and SQL null expression, not an executed sanction. |
| Other admin actions / booleans / ejection note | Named RPCs for open/launch/close/reopen/cancel/delete; profile-preview toggle; legacy ejection reason/note RPC remains | UUID existence/admin checks; ejection note has no length CHECK. Legacy `set_venue_live(NULL)` takes its close branch, but authenticated/anon EXECUTE is revoked remotely, making it a latent privileged-path issue. |
| Delete-venue typed confirmation | Must exactly match venue name before UI sends UUID | Deliberate local mistake-prevention step, not a secret or DB authorization input; server checks admin and deletion eligibility. |
| Local onboarding draft | Checks scalar types, allowed genders, strict adult boolean; step accepts any number; strings unbounded at load | Browser data is untrusted; storage has no DB contract. Profile submit rechecks text; restored step/array deduplication and bounds need explicit handling. |
| Local chat retry records / read markers | JSON asserted as `StoredMessage[]`; broken parses caught; read markers parsed as dates | Object elements, lengths, IDs, owner/match, timestamps and collection size lack a full runtime guard. Retry sends restored content; RLS remains the write authority. |
| Realtime typing payload | TS assertion; checks `profile_id !== me.id` and truthy `typing` | No strict payload object/boolean check or explicit expected-other-ID check in handler; channel authorization is a separate concern, not proved by a payload validator. |
| Language preference / UI dismissal markers | Supported locale guard and fallback; local/session markers control presentation | Local-only state; cannot authorize venue access, consent ownership or admin actions. |
| Analytics event/session/acquisition values | No runtime caller in this branch; callable RPC still exists | Six event names; session length 8–120; QR/source/medium ≤120, campaign/content ≤160, referrer ≤500. Optional acquisition text SQL-trimmed to null. |
| Analytics `properties` | JSON value in generated types | RPC allowlists keys per event but not their value types/sizes. Table has no object/size/value-shape CHECK; authenticated direct INSERT remains granted. Include inactive callable paths when settling scope. |
| Email worker `limit` / secret | Service endpoint checks Bearer secret; default 25, numeric truncation and clamp 1–100; parse failure defaults | Intentional operational normalization rather than user-form rejection. Check finite values; no explicit request-size ceiling. Never persist the secret as field data. |
| Resend webhook envelope, IDs, timestamp, recipient | Signed raw body verified before processing; five-minute signature window; JSON asserted, then truthiness checks; optional recipient array accessed at index 0 | Signature establishes provider origin, not shape. Root null, wrong field types, malformed dates and nested values need guards; no application payload ceiling. SQL persists provider IDs/types without length caps. Preserve unknown-event forward compatibility deliberately. |

## Priorities and proposed rules for discussion

1. **Reject invalid administrative commands before any mutation.** Explicit NULL
   checks for action/boolean/required RPC inputs, starting with `moderate_case`.
   Preserve admin authorization; malformed founder requests must never imply a
   sanction. Include a no-side-effect rejection test with isolated fixtures later.
2. **Approved product text limits:** first name 30,
   bio 500, message 2000, safety note 500. Align required/optional states and
   boundary errors. Reject overlong submissions instead of silently truncating
   saved content. Review existing rows before any tightening migration.
3. **Approved text counting policy:** Unicode code points for persisted text,
   trim boundary whitespace, preserve internal spaces and accents. Optional blank
   text → null was approved in the final block. Native `maxLength` alone cannot express
   code-point limits. Unicode NFC and the exact whitespace set remain unspecified;
   grapheme counting was not selected. Validate raw payload bounds too: a
   post-trim length check alone leaves arbitrarily padded input possible.
4. **Approved email scope:** use the marketing-email contract above across capture
   surfaces/API/RPC/DB: ASCII for V1, 254 bytes total and 64 before `@`, boundary
   trimming, no internal whitespace, aliases preserved and no provider allowlist.
   Specify the detailed local/domain syntax in the implementation contract. #63
   retains ownership/deliverability work.
5. **Approved safety-note rules:** retain a required explanation for report reason
   `other`; an optional note for every private block lets users block quickly.
   Align room/chat behavior with the approved text contract above.
6. **Approved preferences:** 1–3 distinct allowed values. Specify one-dimensional
   payload validation and reject malformed external structures.
7. **Approved admin and technical block:** venue name 1–120, slug 1–80, positive
   integer threshold, valid ordered/nonoverlapping schedules and a 12-character
   new-password minimum. Runtime guards and server payload limits are approved;
   precise endpoint ceilings, token format and unused admin-note bounds still need
   technical specification. Preserve multipart overhead and legitimate signed
   provider events rather than inferring one global limit from a text field.
8. **Coordinate overlapping work.** Photo transport/moderation and nullable photo
   types with #194; discovery/write authorization with #227/#231; edit consequences
   with #229/#230. High-risk findings must be fixed here or linked to concrete
   follow-up scope before #77 is complete. No follow-up issue was created in this
   initial audit. Photo optimization was subsequently captured in #246. Analytics,
   dormant phone writes and legacy RPC disposition need review.

## Evidence and existing coverage

Primary local sources:

- [Profile rules](../../lib/profile.ts), [profile submit/upload](../../app/profile/page.tsx),
  [draft readers](../../app/profile/draft.ts), [field widgets](../../app/profile/fields.tsx).
- [Shared email validation](../../lib/email-subscriptions.ts),
  [subscription route](../../app/api/email/subscribe/route.ts),
  [email subscription migrations](../../supabase/migrations/20260728000001_canonical_email_subscriptions.sql),
  [delivery foundation](../../supabase/migrations/20260802000001_resend_email_delivery_foundation.sql).
- [Room safety forms](../../app/v/[venueSlug]/page.tsx),
  [chat writes and safety forms](../../app/chat/[matchId]/page.tsx),
  [current moderation/admin RPC definitions](../../supabase/migrations/20260729000001_admin_review_corrections.sql).
- [Core SQL constraints](../../supabase/migrations/20260619000001_bloc0_core_schema.sql),
  [local first-name tightening](../../supabase/migrations/20260904000001_limit_profile_first_name_to_30.sql),
  [venue UI](../../app/admin/VenueWorkspace.tsx), [venue-time logic](../../lib/venue-time.ts),
  [Auth operating contract](../admin-password-management.md).

Read-only expression checks confirmed: `length(trim(E'\t\n')) = 2` in PostgreSQL
versus JS trim length 0; 10,000 leading spaces plus `x` passes a trimmed-length
check of 1 while the stored string is 10,001 characters; `😀` is one SQL character
and one JS code point but two UTF-16 units; repeated preference values satisfy the
existing membership check. `NULL NOT IN (...)` returns NULL, not true.

Existing `test:logic` covers lifecycle/entry/admin/time/email/chat behavior but has
no unified field-boundary contract. Email UI checks largely inspect source/copy;
onboarding/chat Playwright journeys cover important interactions rather than the
full validation boundary set. `test-email-subscriptions.mjs` still expects direct
participant writes to succeed, conflicting with later write revocation; do not
reuse it as proof of the current subscription path. Inspect and adapt the current
revocation/delivery tests instead of restoring revoked permissions.

After rules are approved, target pure validation tests plus authenticated direct
write/RPC rejection tests and selected browser feedback states. Cover min/max ±1,
empty/whitespace/null, Unicode, duplicate/nested arrays, malformed JSON and IDs,
oversized raw input, and admin no-side-effect failures. Follow the existing full
review gate and preview inspection; none ran for this documentation-only audit.

## Future-field framework to finalize after alignment

The founder approved making validation part of each future field's work, rather
than repeating the whole audit per feature. Proposed concrete delivery:

- A short durable requirement in `AGENTS.md`, applicable to added **and changed**
  inputs, including API/RPC/URL/file/realtime values outside visible forms.
- A checklist in `docs/workflow.md`: type and required/null behavior; normalization;
  allowed values; min/max and units; trust boundary and DB invariant; user error;
  tests; types/migration; intentional exceptions and deployment coordination.
- Evolve the reviewed inventory into a maintained field contract. Clearly separate
  observed bugs from approved rules so this dated audit does not become misleading.
- Put a concise validation prompt in the PR template/review workflow; this branch
  currently has no PR template. Describe covered boundaries or why not applicable.
- Run committed contract tests in the existing logic/CI gate. Tests detect covered
  drift; they do not discover every new input automatically. Agents and reviewers
  remain responsible for adding coverage with each behavior change.

The exact contract layout and checklist are proposals. No new validation framework,
dependencies, CI code or PR template was implemented at this stage.

## Photo transport amendment — 2026-09-14 (#249, #31)

- Source files remain static JPEG/PNG/WebP, 1–5 MiB and at most 25 million
  decoded pixels. Full decoding and MIME matching remain server-side.
- `POST /api/profile-photo/upload` accepts authenticated JSON up to 20 KiB:
  exact MIME, integer source byte size, nonnegative revision through 2147483647,
  optional existing validated profile fields, optional crop. Crop has exactly
  four finite percentage numbers (`x`, `y`, `width`, `height`), positive size,
  and a rectangle inside the oriented source.
- A non-upsert signed token permits direct upload to one private staging path.
  The HMAC ticket binds owner, path, manifest and a ten-minute expiry. Finalization
  accepts only `{ticket}` JSON up to 40 KiB; the ticket itself is capped at 32 KiB.
  It verifies ownership/signature/expiry before download or deletion, then checks
  actual byte size/type and decoded content. Existing bounded multipart requests
  remain accepted for already-loaded clients; new clients send no photo bytes
  through Vercel.
- Uncropped image payloads are not re-encoded. Identifying metadata is removed;
  orientation and rendering information are preserved. Crops save native pixels
  as lossless PNG (16-bit when appropriate), without resizing or JPEG compression.
  Crop output exceeding 50 MiB fails with `crop_too_large` and tighter-crop guidance.
- Initial profile creation and profile editing both open the crop dialog before
  accepting a selected file. Confirmed onboarding drafts retain the original
  file plus the four-number crop in IndexedDB for at most 24 hours, keyed by
  the anonymous user. Restore revalidates MIME, source size and crop bounds,
  reconstructs only a display preview, and drops invalid/corrupt drafts.
  Cancellation keeps the previous selection. The signed server manifest remains
  the authoritative crop validator; a browser draft never grants access.
- The crop dialog's alternate file input accepts JPEG/PNG/WebP up to 5 MiB and
  rejects empty or oversized files before replacing the current crop candidate.
  Canceling the native picker leaves that candidate intact; malformed selections
  get inline feedback. The server still verifies the selected bytes and manifest.
- Returning-screen photo recovery reads the current owner's
  `photo_invalidation.revision` as a nonnegative safe integer. A missing row
  leaves the initial state unchanged; malformed or failed reads trigger a
  conservative photo access refresh. An unchanged revision leaves the visible
  image mounted; a changed revision triggers the existing authorized source
  and Storage recheck. Visibility and network-return events still force an
  access recheck, including for founder-inspected photos whose access can change
  without the founder's own revision changing. RLS limits the revision read to
  the signed-in owner.
- Staging has no participant read/list/update/delete policies. Final files remain
  service-written, immutable unique paths under the existing moderated lifecycle.
  Revision conflicts cannot delete another successful attempt's final object.
  Verified staging is removed after finalization; abandoned files older than
  three hours are collected by the service-only cleanup RPC (upload tokens last
  two hours). Unknown RPC transport outcomes defer final-object deletion to the
  existing unreferenced-object collector.
- Deployment prerequisite: founder-approved migration
  `20260915000001_private_photo_staging.sql`; verify the project's global Storage
  limit permits 50 MiB, regenerate DB types and run security advisors after apply.
  Local image fidelity/ticket tests and PostgreSQL tests cover these boundaries;
  signed Storage transport and preview checks require the migrated shared project.

### #209 implementation verification — 2026-09-14

The maintained bio limit above supersedes the dated 500-character inventory.
Counter and inline errors are associated through `aria-describedby`; they are not
live regions. Raw input stays editable without `maxLength` or truncation. Existing
bounded localStorage drafts retain excessive bios; restoration cannot reach the
final preview until the bio validates. Legacy profile reads preserve the bio.
Dedicated server-error state clears on bio edits; confirmation refusals return to
the bio step and focus the field. EN/FR/ES include counters and singular/plural
removal messages; other invalid text gets separate feedback.

Photo submission retains its request and profile JSON byte caps. An otherwise
valid profile whose bio exceeds 300 receives HTTP 400 `{ error: "bio_too_long" }`
before decoding/review/upload. The client routes this to bio feedback. SQL length
refusals use `bio_too_long`/23514; `profiles_bio_check` is also recognized without
classifying unrelated constraints as bio errors. RPC failure still removes the
uploaded object. See the 2026-09-14 decision for the authorized test-profile cleanup.

The new migration runs in the isolated photo SQL suite, including preflight
refusal without data changes, exact Unicode boundaries, raw payload rejection,
RPC refusal snapshots and existing photo transitions/grants. The shared migration
was subsequently authorized and applied (see deployment verification below).
Vercel mobile inspection remains pending; no preview has been pushed for this task.

Pre-deployment verification: lint, the complete logic gate (including isolated PostgreSQL)
and the production build passed. The full Chromium mobile suite initially had
15 passing tests and two failures: a test-only legacy-response mock shape (fixed;
both bio journeys then passed on a fresh build) and the intentional new direct-DB
301-character refusal, which the then-deployed 500-character constraint accepted.
The photo HTTP pre-validation and exact 300-character creation passed before that
DB assertion. That assertion was retained for post-migration verification. The targeted bio rerun passed creation, restored
excessive preview draft, emoji preservation, 270 emphasis, correction/save,
API/constraint error focus, unrelated constraint separation, and EN/FR/ES copy.
Physical mobile keyboard and Vercel visual inspection remain unverified.

### #209 shared deployment — 2026-09-14

Marwane explicitly authorized application of the reviewed migration. A fresh audit
found zero bios above 300 using `private.trim_input`; the existing trigger/RPC
still matched the reviewed 500-character definitions. Supabase MCP applied local
`20260914000001_limit_profile_bio_to_300.sql` as remote version
`20260914165345` (`limit_profile_bio_to_300`). No participant content was rewritten.

The deployed `profiles_bio_check` is validated and enforces 300. Both functions
emit `bio_too_long`; the photo RPC remains executable only by its owner and
`service_role`. Security advisor findings are identical before and after the
migration (excluding observation timestamps), with no new finding. Existing
[security advisor guidance](https://supabase.com/docs/guides/database/database-linter)
still applies; this task makes no unrelated policy/Auth changes.

Types were regenerated via MCP and compared with `lib/database.types.ts`. No
profile or photo-RPC type changed. Existing manual corrections for trigger-filled
likes columns, nullable photo-source results and nullable RPC arguments were
preserved instead of replacing them with the generator's less precise output.

Post-migration production build passed. The full E2E run completed with 4 passed
and 13 failures, all `AuthApiError: Request rate limit reached` during anonymous
fixture sign-in. No cleanup failure was reported. The two chat journeys passed
against the migrated database; the bio/photo journeys could not run past session
setup. Retry those journeys and the complete gate when the shared anonymous Auth
quota recovers; limits and fixture authentication were not changed. This is not a
passing post-deployment UI gate. Vercel preview/mobile keyboard inspection and
application publication remain pending.

### #209 delivery verification — 2026-09-14

PR #255 publishes the implementation. GitHub CI run `34872301978` passed both
required jobs on `41085c7`, including all 17 Chromium mobile journeys against the
migrated shared database. This verifies the formerly blocked direct 301-character
refusal as well as creation with photo, editing, chat and moderation regressions.
Local runs encountered anonymous-signup quota exhaustion; no assertions or Auth
limits were relaxed, and no password/admin-session substitution was used.

The agent visually inspected the deployed Vercel branch preview in real Chromium
with Pixel 7 emulation (393×727), plus 320×568 and a focused 390×440 reduced-height
viewport. Creation and editing were inspected empty, at 269/270/300 and excessive
301/302, including EN/FR/ES, disabled actions, focus and long emoji content. The
counter emphasis and inline errors remain legible without horizontal overflow.
Profile/session responses were mocked only for this visual pass to avoid using
more shared Auth quota; the hosted integration suite used actual anonymous
sessions, Storage and database writes. Physical phone keyboard behavior awaits
founder confirmation; reducing the viewport is not a native keyboard test.

Preview: https://amourette-webapp-git-feature-improve-profile-76ad56-tothe-moon.vercel.app
The PR remains draft until outstanding delivery checks are resolved. See its
validation section for the final local rerun and phone verification status.

### Legacy portrait-relative photo framing — #31 / PR #181 (2026-09-21)

| Boundary | Contract and enforcement | Feedback / coverage |
| --- | --- | --- |
| Signed upload manifest | Optional `roundCrop` joins `crop`; each is exactly `{x,y,width,height}`, finite numbers in percentages, x/y ≥ 0, width/height > 0, sums ≤ 100 (1e-6 floating-point allowance). No string coercion or unknown keys. HMAC binds both crops, owner, revision, source type/size, path and expiry. Existing file, pixel and ticket bounds remain unchanged. | Invalid manifests refuse before issuing upload permission; genuine decoding and pixel-square validation precede uploads/moderation. Ticket and image logic tests include malformed coordinates and all eight EXIF orientations. |
| Native crop geometry | Portrait coordinates reference the oriented complete source. Optional round coordinates reference the resulting portrait; width/height in native pixels differ by at most one rounding pixel. UI uses fixed 9:19.5 and ×1–×3; server/database permit legacy client crop proportions. Crops never resize or recompress native output lossily. | Server rejects invalid square/bounds; database CHECKs and new command enforce dimensions, containment and square shape. SQL tests assert refusals leave profile/version/state/audit unchanged. |
| Owner source GET | `/api/profile-photo/source?version=<uuid>&revision=<integer>`; exactly two query parameters, UUID (case-insensitive, normalized to lowercase), revision 0–2147483647, authenticated bearer owner. Version must be their current pending/displayed version within retention; stale revision is 409. Service downloads only an admitted private source path or a known stored legacy photo path, never an arbitrary external URL. `private, no-store`, MIME and nosniff response headers; response crop headers are parsed defensively. | Unavailable/expired legacy source prompts a new selection. No source Storage access for any authenticated client, even owner, admin or matched peer. |
| Existing-version recrop POST | JSON `{version,revision,crop,roundCrop?}` (40 KiB route limit), no extra fields, UUID and integer as above, required portrait crop, optional round crop. Owner/version/revision checked before processing or writing; command rechecks under state lock. Source reused without browser reupload. Initial-profile payload is prohibited for recrops. | Rejected content retains local work; stale commands refuse with 409; every accepted replacement stays pending until moderation. |
| `submit_profile_photo_crop` | Service-only RPC; owner/path/revision plus oriented source and resulting image dimensions (positive integers, product ≤25M pixels), validated crop JSON, optional from-version and initial-profile payload. Source and output must exist in their respective buckets; path must be UUID-owned, MIME JPEG/PNG/WebP. New sources fresh within 15 minutes; reused source must match admitted version and dimensions. Old RPC remains restricted to service role. | Atomic existing submission transition, then version metadata association in the same transaction. Tests exercise ownership, malformed input, stale revision, rejection and retention. |
| `profile_photo_presentation` | Authenticated authorized projection returns `{source: string, roundCrop: object|null}` for the displayed version in one snapshot. No original path/dimensions or pending coordinates. Missing round crop preserves centered display; the old `profile_photo_source` RPC remains available. | Definitive refusals clear images; transient errors retain the existing image and request the existing coalesced retry. |
| Browser draft and controls | IndexedDB stores original File and optional portrait/round crops; both structurally validated before restore. Existing 24-hour expiry and 5 MiB source cap unchanged. Older crop ratios/zoom are fitted to the new reference and ×1–×3, preserving the center where possible; incompatible round coordinates reset. File cancellation/invalid replacement preserve prior file, crop and draft. Confirmed main-crop changes reset round crop; reopening restores both. Range input is numeric 1–3, step .01, pinch/drag/keyboard supported. | First acceptance advances directly to gender; returning to photo shows explicit change/recrop actions. Failed sends keep work. Browser interaction coverage includes reload, cancellation, invalid replacement, independent zoom and resizing. |
| Cleanup | Service-only `expired_profile_photo_source_paths()` returns at most 100 source paths, older than 24h with no retained dependency. Current pending or displayed versions protect the source; rejected displayed sources expire after the existing 30-day correction window. Expired sources cannot be revived by recrop. Auth/profile deletion releases dependencies. | Existing secret-authenticated worker deletes through Storage API; source never becomes an indefinite version archive. Shared-dependency and profile-deletion SQL tests. |

Owner-source admission checks the requested version's membership before revision:
a foreign version returns 404 even when the caller has a different photo revision.
A replayed upload ticket refuses with 400 if staging is gone, or 409 if Storage
still serves cached staging bytes and the revision is stale; both paths leave the
photo state and version set unchanged. Integration assertions cover both outcomes.

Each crop mode keeps gestures, zoom/reset and confirmation unavailable until its
image and restored coordinates are ready. Switching quickly cannot apply a zoom
before restoration and lose it to a later media-load callback. The existing
independent-crop browser journey exercises this transition without arbitrary waits.

Deployment: Marwane authorized migration application and preview publication on
2026-09-22. Applied `20260921000001_photo_crop_sources.sql` through MCP as remote
version `20260922070910_photo_crop_sources`. Types were regenerated and reconciled
to the photo scope, preserving existing nullable and trigger-supplied refinements.
Security advisors report the intentional authenticated SECURITY DEFINER projection;
private source Storage remains service-only. No existing photo is rewritten.
Physical Safari iPhone gestures, Photos selection and browser chrome remain
unverified until a real-device pass. Ready status is retained by explicit user
instruction and does not waive these gates.

Local verification for this follow-up: lint, production build/TypeScript and the
complete `test:logic` gate pass. PostgreSQL tests execute the new migration in
PGlite, including table CHECK refusals, service-only grants, matched-peer source
privacy, revision atomicity, displayed/pending projection, rejection and source
retention after profile deletion. Image tests cover all eight EXIF orientations,
repeatable native pixels from the stripped original, native square coordinates,
legacy files above the new-upload cap, and older-draft ratio/zoom normalization.

Four local Chromium mobile journeys pass: draft/independent crop restoration,
EN/FR/ES layout and preview, legacy/pending editor reopening with a failed-send
retry, and the complete portrait/return-to-chat interaction. The latter two
explicitly stub upcoming source/presentation metadata endpoints; real fixture
sessions and stored displayed photos are used, but these are **UI contract tests,
not proof of the new hosted API**. Agent inspection of local screenshots covers
320×568 and 390×844 framing, round adjustment and feed treatment, plus the chat
portrait at 320×568 and 430×932. After migration application, both real API tests
pass against the shared remote with a local production server: owner-only source
access even after matching, source reuse, stale/invalid command refusal, pending
moderation and original downloads above 4.5 MiB. Four owned fixture accounts were
cleaned up. The same streaming route still requires deployed Vercel verification.

The earlier publication hold is superseded by Marwane's 2026-09-22 authorization.
The existing PR stays Ready for review at his request; this does not waive pending
hosted and physical-device verification. No merge or shared QA reset is authorized.

Remaining verification: run the full hosted browser gate on the new head;
inspect the updated Vercel preview; then verify physical Safari iPhone Photos
selection, drag/pinch and visible zoom/reset, cancellation, Safari bars and safe
areas, orientation changes, draft reopening, pending-photo editing and retry.
Use selfies (centered and off-center/near an edge), full-body and landscape images;
compare the same displayed profile on two phone proportions and its round crop
in matches/chat. Open the chat profile sheet to confirm the whole portrait and
accessible dismissal. Do not reset `test-crowded` or the other shared QA venues.

### Independent round framing — current #31 / PR #181 contract (2026-09-22)

This supersedes the portrait-relative round editor above. Old requests and stored
`round_crop` values retain their original meaning for compatibility.

| Boundary | Contract and enforcement | Feedback / coverage |
| --- | --- | --- |
| Upload permission/ticket and recrop JSON | Optional `roundSourceCrop` is exactly `{x,y,width,height}`, finite numeric percentages of the complete oriented source. Same bounds/tolerance as `crop`; unknown keys and simultaneous `roundCrop` + `roundSourceCrop` are rejected before effects. The signed manifest binds this field. New UI always supplies its independently selected or centered default square. Old clients may still send portrait-relative `roundCrop`. | Server checks pixel-square shape before review or uploads. Tests cover signature binding, malformed/ambiguous fields, EXIF and pixels outside the main portrait. |
| Round output | Server extracts a lossless native square PNG from the stripped source; width/height are the smaller rounded native crop dimension, at most 25M pixels and 50 MiB. No full original becomes participant-visible. Private `profile-photo-rounds` permits reads only when `private.can_read_photo` authorizes the same version's main path. No client writes. | Pending assets stay owner/founder-only; displayed assets follow existing discovery/match authorization and revocation. AI review, if enabled, checks both outputs before one submission. |
| Atomic command/metadata | Service-only `submit_profile_photo_framing` takes all existing source/portrait metadata plus required owner-scoped UUID `.png` `p_round_path`, bounded `p_round_source_crop`, and positive integer `p_round_side`. Source dimensions and square shape are validated; side must match the native extraction and Storage must contain a fresh PNG within the existing size limit. Calls the existing revision/version-checked crop command and attaches round metadata in one transaction. Durable CHECKs enforce path ownership, dimensions, containment and completeness. | Invalid/stale commands leave state, versions and audit unchanged. Both outputs enter and leave moderation as one immutable version. |
| Read projections | `profile_photo_presentation` adds nullable `roundSource` to the same displayed-version snapshot; `source` and legacy `roundCrop` stay compatible. New circular clients download `roundSource` from the round bucket, else use the legacy main/crop. `admin_photo_framing(p_night?,p_profile?)` wraps the existing founder-authorized queue and adds both displayed/pending round paths; old queue unchanged. | Founder detail/enlargement presents both images from the reviewed version. No private source coordinates/path are in participant projections. Browser tests exercise pending denial and joint approval. |
| Owner restoration and browser draft | Owner GET adds `X-Photo-Round-Source-Crop`: bounded source-relative coordinates or null. Older saved portrait-relative settings are projected into the source using native dimensions. IndexedDB now stores optional validated `roundSourceCrop`; original/portrait and 24-hour/5 MiB expiration stay unchanged. Legacy unsaved drafts retain their file and portrait but start a centered independent round crop. | Two crops use the original independently with ×1–×3 zoom. Main changes/reset do not reset the round. Round reset does not change the main. Cancellation, failed send, reopening and reload preserve the new coordinates and separate previews. |
| Retention | Service-only `expired_profile_photo_round_paths()` returns at most 100 unreferenced round assets older than 24h; displayed/pending and the existing rejected-display 30-day grace protect retained bytes. Existing cleanup worker deletes through Storage. Profile deletion releases both outputs and the source. | SQL tests cover active retention, invalid inputs, owner/founder/participant access, matching, moderation projection and deletion. Owned test fixture cleanup also removes the round bucket prefix. |

Migration `20260922000003_independent_round_photos.sql` passed isolated PostgreSQL
tests and was applied with Marwane's explicit approval as remote version
`20260922083926_independent_round_photos`. Types were reconciled with regenerated
MCP output and security advisors inspected. Real legacy/independent API and Storage
tests pass, including pending denial, joint approval, original privacy and reopening.
Hosted CI and updated Vercel/Safari verification follow publication. Main `1017720`
(#274) is integrated, so profile editing keeps the separate first-name correction
workflow and never restores direct writes.

### Crop source decoding follow-up — #181 (2026-09-22)

The browser-local image URL still references the selected/restored original File;
file formats, 5 MiB upload bound, saved coordinate validation and server contracts
are unchanged. Loading now awaits native image decoding and requires positive
natural width/height in pixels before normalization or editor initialization.
Decode rejection uses the existing load/export error feedback; pending source
decoding shows the localized processing text. The mode-specific restoration gate
still disables gestures/zoom/reset/confirmation until its media and coordinates
are ready. Cancellation/unmount still discards late asynchronous results, and the
page retains ownership of accepted previews independently of dialog-owned URLs.

`tests/profile/recrop-loading.spec.ts` covers final-step reopening when the detached
load callback is suppressed (native decoding remains real), both crop settings,
cancel/confirm and readable accepted previews. A held decode across cancellation
checks that old work cannot overwrite a later dialog or the draft. The first case
fails on the previous callback-only loader. These controlled schedules reproduce
the silent blank state; they do not establish the underlying physical Safari bug.

### Crop zoom interaction follow-up — #181 (2026-09-22)

Zoom remains a finite numeric scale from 1 to 3 inclusive, with range step 0.01
and keyboard +/- increments of 0.1 (clamped); pointer, touch, wheel and native
gesture geometry are still normalized by react-easy-crop. No string trimming,
new persisted input, upload format, API argument or server/database bound changes.
Both crops keep their existing source-relative percentage validation and independent
restoration. These browser events control only local preview scheduling, never
authorization or server admission.

During an active crop/zoom interaction, update the visible image and coordinates
but defer portrait PNG generation. Release/end, pointer/touch cancellation,
keyboard release/Tab and window blur finish the interaction after queued animation
updates settle. Confirmation and preview navigation are disabled until the final
portrait area has a matching rendered preview. Reuse that preview if the final
area/source are unchanged, including round-only edits; keep its object URL alive
until replacement or dialog unmount. Closing discards queued work and preserves
the previously accepted draft. The media/coordinate restoration gate remains intact.

`tests/profile/crop-zoom.spec.ts` exercises live pinch updates without intermediate
exports, a release with a final frame pending, one final export, independent round
restoration, slider/key/wheel input, interrupted input, cancellation and recovery
from a failed export without revoking the last valid preview. Reset also defers
exports until its remounted cropper has settled. Auth and
reads are mocked for these local browser tests; native image decoding and PNG
exports remain real. Synthetic input in Chromium/Linux WebKit is not physical
Safari performance validation. Source-loading feedback remains unchanged.


## 2026-09-23 — Larger originals without quality loss (#246)

This section supersedes earlier 5 MiB selected-source and 1600 px/JPEG
preparation contracts. Crop geometry and output quality remain unchanged.

| Input | Contract and enforcement | Feedback / verification |
|---|---|---|
| Selected source and restored draft | Required for creation, optional replacement; nonempty static genuine JPEG/PNG/WebP, 1–20 MiB inclusive (20,971,520 bytes), existing 25,000,000 decoded-pixel server ceiling. No filename trust or lossy normalization. Main picker, alternate crop picker, draft restore, signed manifest and server decoder enforce their relevant bounds; source orientation/colour/transparency retained, identifying metadata stripped. IndexedDB expiry stays 24 hours. | Existing localized 20 MiB picker error; corrupt/decode/upload errors remain recoverable, prior accepted selection retained. HEIC/animation unsupported. |
| Upload manifest / ticket | Existing exact keys, integer size/revision, crop and owner/expiry/signature validation unchanged; size now at most 20,971,520. Original bytes go straight to private staging, never through a larger Vercel multipart request. | Over-limit/invalid manifests rejected before signed upload creation. Existing multipart/review request ceiling stays 5 MiB + 64 KiB; small JSON commands unchanged. |
| Storage staging | Migration `20260923000001_larger_photo_sources.sql` changes only existing private staging file_size_limit to 20,971,520. MIME allowlist, grants, policies and three-hour staging cleanup unchanged. Source/final/round bucket and lossless-output bounds remain 50 MiB. | Applied with Aymane approval on 2026-09-24 UTC as remote version `20260924003410`; verified staging 20 MiB, other photo buckets 50 MiB, all private with unchanged MIME allowlists. Hosted end-to-end/device validation remains outstanding. |
| Cropping / recropping | Complete source retained; portrait and independent round coordinates, source authorization, pixel budget, native lossless crops, revision checks, retention and preview-only scaling unchanged. No 1600 px source substitution. | Existing browser journeys extended to >5 MiB sources and stored source sample comparisons. Deterministic tests cover colour/transparency/fidelity, full-source recrop and excessive pixel refusal. |


### Photo finalization latency (#246, 2026-09-23)

No input contract changes. Validated fresh portrait/source/round files upload
concurrently; all must finish successfully before the existing publication RPC.
Rollback waits for all writes and touches only fresh server-generated paths.
Reused sources are excluded. Authenticated, signature-verified staging cleanup
runs after the response; the existing three-hour collector covers failures.
Successful responses add Server-Timing millisecond durations for auth, source,
revision, preparation, review, storage and publication, without identifiers.
Timing is diagnostic only, not an accepted user-facing latency budget.
### Durable night-report inputs (#257, 2026-09-15)

Applied to the shared development database on 2026-09-30 after reconciling #231
and #195. Ten historical partial reports were saved before source cleanup.

| Input | Runtime contract and normalization | Enforcement and feedback |
|---|---|---|
| `record_venue_scan(p_venue_id)` | Required existing UUID, no trimming/coercion; account comes from `auth.uid()` | Authenticated RPC rejects missing/unknown venue; resolves and locks its exact waiting/live, nonterminal, unexpired night. A closed venue produces no event. First-scan profile state is server-derived and immutable; repeat scans deduplicate by account/night, including test venues. Collection failure is logged without blocking entry. |
| `record_room_arrival(p_venue_night_id, p_visible_count)` | Required UUID and non-null integer 0–2147483647, units: profiles actually available in the first successfully rendered live feed, after active matching consent and feed freshness are confirmed. No text normalization, truncation, or client-supplied account/time. | PostgreSQL UUID/int4 parsing, explicit NULL/nonnegative validation and a private CHECK; active visible presence in that exact live, unexpired night required. Invalid input fails before effects. The first accepted observation wins across retries/devices. Client failures leave the observation missing and retry on a later feed refresh. This is a client observation, not an independently verified server profile count. |
| `admin_venue_night_report(p_venue_night_id)` | Required existing UUID, no normalization | Founder check precedes lookup/lock; NULL/unknown IDs reject. Participant/no-session access rejects. Typed RPC returns nullable counters, four-bin distributions (`0,1,2,3+`), three-bin arrival distribution (`0,1–4,5+`), sample counts, seconds for the median, and version/coverage. Report errors display a retrying error state rather than zeros. |
| Report JSON aggregates | Gender rows are exactly the three allowed genders with distinct keys, nonnegative safe integer cohort/activity counts and senders/receivers no larger than cohort. Attendance is an array of finite parseable timestamp strings and nonnegative safe integer maxima. | SQL builds only these fixed shapes from private counters; no participant-linked arbitrary JSON reaches the report. Runtime client parsers reject malformed aggregate payloads as unavailable. Saved timezone comes from the validated venue configuration; counts/denominators remain visible. |
| Existing generic/legacy analytics writes | Existing event/property validation is unchanged. An event must resolve to an open exact night to be retained. Supplied source IDs are never copied into durable reports. | Scope triggers acquire the night lock for insert/update and ignore unassigned or terminal writes. Cleanup removes all five source tables' rows for the finalized night and the added private sources. Unassigned old rows are counted by table and deleted without inferred night attribution. |

Private counters accept only nonnegative integers and allowed gender values;
client roles have no source-table or report-table privileges. Reports are exposed
only through founder RPCs. Migration backfill consolidates duplicate explicit
account/night scan keys before changing uniqueness; first/last times are preserved.
SQL tests cover validation refusal without mutation, deduplication, role grants,
terminal cleanup and rollback. Browser tests use intercepted synthetic report
responses; the deployed grant check confirms RPC execution for `authenticated`
and denies direct report/source-table reads and `anon` RPC execution. End-user
Auth/RLS and Vercel remain unverified until hosted and preview checks run. The
shared fixture test has passed a real
`write_like`/arrival/cancellation race, scheduled `pg_cron` cleanup and stable
report re-read. The follow-up `night_report_guard_error_code` migration preserves
the existing `42501` rejection contract for writes after expiry.

## Native HEIC display amendment (#289, 2026-10-09)

This supersedes the normalized-PNG-only browser display requirement below, without
changing accepted source formats or server conversion/publication contracts.

| Input / boundary | Runtime contract and enforcement | Feedback / coverage |
| --- | --- | --- |
| Native display candidate | A selected, nonempty HEIC/HEIF `File` within the existing 20 MiB source bound. Attempt real `HTMLImageElement.decode()` using a private object URL; no user-agent inference or client conversion. Positive decoded dimensions, at most 25,000,000 pixels. Abortable capability attempt, at most 2,500 ms; failure uses the existing authenticated PNG preparation. The original File remains the submission/draft source. | Show the native image and permit crop gestures while server preparation runs. Confirmation and replacement selection stay disabled until server validation succeeds. Processing status and Cancel remain available. No native preview authorizes publication. |
| Validated dimensions | Authenticated preparation success additionally returns `X-Photo-Width` and `X-Photo-Height`: decimal strings representing oriented positive integer pixel dimensions generated by the strict converter's PNG IHDR; product at most 25,000,000. Only an exact match to the native decoded dimensions authorizes that display for confirmation. Missing/mismatched headers require the existing bounded full PNG download and crop reset. | Cancel the unneeded PNG response body on a match. Preserve gestures made during validation. Server refusal restores the previous candidate and retains the accepted source and independent crops. Cancellation ignores late validation and restores the previous selection. |
| Resource ownership and timing | Native object URL and decoded image share the existing mounted-page cache lifetime. Pending replacement retains the previous candidate until validation succeeds; cancellation/refusal restores it. Actual account change/unmount aborts validation and disposes owned URLs. New bounded local measures `prepare.native-decode`, `prepare.native-validation`, `selection.visible` and `crop.interactive` distinguish display/gestures from fully validated `crop.ready`. | Four deterministic browser cases cover delayed success, refusal, cancellation with late completion, and mismatched dimensions. Real WebKit preview checks supplement Chromium's simulated decoder capability. Existing HDR, corrupt-file, owner isolation, native precision/ICC/orientation and server publication tests remain authoritative. |

## HEIC/HEIF input amendment (#279, 2026-10-01)

Integration amendment (2026-10-08): the current request-time profile route keeps
the same validated entry parameters and correction-return behavior. HEIC
selection/preparation now lives in `ProfileForm`, including the focused
photo-correction picker. Its required corrected photo uses the same nonempty
File, MIME normalization, 20 MiB source, bounded private preparation and
authoritative final-submission contracts below. Preparation refusal preserves
the correction draft, shows the selected locale's HEIC feedback, and issues no
final upload or review submission. Crop confirmation remains local; only the
explicit Send for review gesture stages the photo and submits the verified
review revision. No API, database, storage or consent boundary is expanded.

This supersedes the HEIC exclusion in the larger-source amendment. The staging
MIME migration was applied with founder approval on 2026-10-01 (remote version
`20261001195731`). Deployed/device evidence and remaining acceptance checks are
recorded in [the HEIC QA audit](heic-photo-support-qa.md), a snapshot taken before
the successful final hosted validation recorded below.

| Boundary | Contract and normalization | Enforcement and feedback |
| --- | --- | --- |
| Selected file / restored draft | A required nonempty `File` for creation, optional replacement. Existing JPEG/PNG/WebP plus exact `image/heic` / `image/heif`; 1–20,971,520 bytes inclusive. Empty or `application/octet-stream` MIME may become `image/heic` only after a bounded first-4,096-byte HEVC still-image `ftyp` check. Filenames and extensions are picker hints only. Existing supported MIME takes precedence over filename. | Every profile photo picker, including focused corrections, uses the shared accept list. Server checks type, size, brands and actual decode independently. Wrong format, corrupt data and preparation errors retain the accepted photo/crops. Unsupported colour/HDR and oversized normalized output have distinct localized feedback. |
| Preparation request | Authenticated `POST /api/profile-photo/prepare`; at most 2,048 JSON bytes. Exactly `{type,size}` with required HEIC/HEIF MIME and safe integer byte count in the source range, or exactly `{ticket}`. No coercion, normalization, crop/profile fields or arbitrary paths/URLs. | Server returns an owner/UUID private staging path, signed upload token and HMAC ticket. Missing session: 401. Malformed manifest: 400 before upload authorization. |
| Preparation ticket | Purpose exactly `heic-preview`, authenticated owner UUID, server-generated owner/UUID `.heic`/`.heif` path, MIME, byte size, safe-integer expiry in milliseconds. Valid for ten minutes. Common token envelope limit 32 KiB; preparation JSON cap is narrower. | Constant-time HMAC verification, owner/path/expiry checks, no unknown fields. Preview and finalization tickets cannot be interchanged. Downloaded staging MIME and size must exactly match the signed manifest. Only verified-owner paths enter cleanup. |
| HEIC decode | HEVC still brands `heic`/`heix` required; AVIF and sequence brands refused. One top-level primary image. Native and transformed image area at most 25,000,000 pixels. Pinned libheif-js 1.23.2 raw WASM ABI; strict decoding and warnings refused. Before parsing: max 256 tiles, 512 items, 1 MiB colour profile, 200 MiB native allocation block, 256 MiB libheif-accounted memory. Other library limits stay enabled. | At most two active conversion workers per server instance, no waiting queue; 20-second timeout, termination on abort, 128 MiB JS old-generation limit. The libheif budget and V8 limit are not a total process RSS limit: codec, WASM and Sharp allocations are also bounded by the source/pixel/output checks. Busy/timeout/unavailable conversion: recoverable 503. |
| Colour and orientation | Preserve main still resolution and decoded sample precision in 16-bit PNG, retain its RGB ICC profile. NCLX-only input supports sRGB transfer with BT.709 or Display P3 primaries, attaching the matching standard ICC without changing samples. PQ/HLG, unknown unprofiled colour variants, premultiplied alpha and multiple top-level images are refused. Alpha is retained. HEIF transformations apply to decoded RGB in their declared order; legacy EXIF orientation applies only without HEIF rotation/mirroring. | No resize, lossy encode or HDR tone mapping. HEIF clean aperture defines the visible main image; its entire oriented extent is the crop source. Auxiliary depth/thumbnail/gain-map payloads are not retained: v1 supports the main SDR still, not enhanced HDR rendering. GPS/EXIF/XMP and identifying metadata are absent from the normalized result; rendering ICC remains. |
| Normalized response / browser preview | Nonempty `image/png`, at most 52,428,800 bytes inclusive. Authenticated streamed response with `private, no-store` and `nosniff`; no public URL. Browser counts response stream bytes, requires PNG MIME, and cancels oversized reads. Crop display uses this PNG; crop confirmation and IndexedDB retain the original HEIC plus existing percentage coordinates. Draft expiry remains 24 hours. | Preparation never creates a profile or photo version. Cancellation ignores late upload/response results. A transient HEIC draft conversion failure does not delete the original draft. The page retains one prepared preview blob; reopening a selected photo reuses it when available. |
| Final submission / recrop | Final upload manifest additionally permits HEIC/HEIF within the same original 20 MiB bound. The server decodes the original again through the same pinned conversion, validates the resulting PNG up to the existing 50 MiB output bound, then uses existing crop/moderation/publication logic. Full normalized source is private; both crops reference that source. Recrop uses retained PNG and never re-decodes HEIC. | Existing stale-revision checks, moderation, private-source owner authorization and 50 MiB per-output limits remain authoritative. Repeating conversion avoids trusting a client-supplied prepared source or introducing expiring prepared-source draft references. It adds preparation latency; physical preview timings remain unverified. |
| Staging configuration / cleanup | `20261001000001_heic_photo_staging.sql` adds only `image/heic` and `image/heif` to the existing private 20 MiB staging bucket. It refuses an unexpected public/mis-sized bucket. Other buckets, policies and grants unchanged. | Applied and bucket settings verified remotely with founder approval. Completed preparation removes the verified staging path; abandoned uploads use the existing three-hour collector. No HEIC original is placed in participant-readable storage. |

Coverage: `test:heic` verifies generated genuine 10-bit P3, all eight orientations,
ICC/sample retention, metadata removal, native crops/recrop, corrupt/pixel/byte/HDR
refusals, cancellation and purpose/owner/expiry/tampering boundaries. Photo SQL
checks the exact idempotent bucket change and retained privacy. Browser tests cover
onboarding/replacement cancellation/refusal with controlled transport; the real
staging test verifies preparation ownership, non-publication and full-source
retention. Real Storage transport passed against both the local development and
rebuilt production servers after fixing Turbopack's worker-data rewrite. A native
worker decoded the fixture using only the preparation route's traced deployment
files, including explicitly traced Sharp runtime dependencies.
The initial automated deployed test was blocked by Vercel Authentication before
reaching the app. A later native Safari 26.0.1 inspection on macOS 15.7.1 reached
the actual preview, rendered the synthetic 10-bit P3 fixture, and inspected the
loading, portrait and independent round-crop states. This is desktop evidence;
remaining deployed mobile/device checks are listed in the linked QA audit.
The founder reported successful Photos and Files selection/crop/recrop on an
iPhone 13 Pro Max (reported iOS 26.6.2), with approximately 10 seconds of initial
Files preparation and 9 seconds reopening recrop. Those delays are tracked in
#289; the picker-delivered MIME and exact timings were not instrumented. Android
Chrome remains unverified because no physical device is available.

Post-audit validation: the founder-approved full hosted run
[36945542753](https://github.com/getamourette/amourette-webapp/actions/runs/36945542753)
passed on `07708c23a4093ea730908a3017df971c38767404`, base
`05a6ac8ad6a95c9dbb122375cdae5095c426f877`, on 2026-10-02 UTC (2026-10-01 New York).
Lint, logic, PostgreSQL 17 ordering and production build passed, together with all
94 Chromium mobile browser cases in 13.5 minutes. This includes both HEIC browser
journeys, real private HEIC preparation/publication, crop/recrop and the three
corrected synchronization regressions. The completed run supersedes the QA audit's
pending hosted-validation status; the documented physical-device/preview gaps and
#289 performance follow-up remain open. PR #288 stays draft while those acceptance
gaps remain.

Latest physical-preview follow-up (2026-10-02 UTC / 2026-10-01 New York): the
founder confirmed that all four requested checks passed on the current `7b78ba6`
preview in iPhone Safari, using the previously reported iPhone 13 Pro Max and iOS
26.6.2. Photos and Files selections appeared clear and upright; independent
portrait/round adjustments retained their framing after confirmation and recrop;
cancelling another photo during processing retained the previous valid photo.
This supersedes the earlier audit's missing latest-iPhone crop/cancellation
evidence. Picker MIME and exact Safari version remain unrecorded; deliberately
invalid-file refusal and moderation-denial states were not part of this manual
checklist. Physical Android Chrome remains unavailable. No new latency measurement
or resolution of #289 is claimed. The code and automated-test inputs are unchanged.

Review-scope decision (2026-10-01 New York): Aymane explicitly deferred physical
Android Chrome testing because no device is available and requested the review
handoff to Marwane. Android remains untested; Chromium mobile automation does not
replace physical-device evidence. The full hosted gate and latest physical iPhone
pass above remain the completed coverage, with the recorded metadata and manual
refusal-state limitations unchanged. This supersedes the earlier draft disposition:
PR #288 may become Ready for review and #279 In review after the required promotion
checks verify the existing full-run evidence. No application code, automated-test
input, remote schema or #289 latency claim changes for this documentation handoff.

Subsequent quality report (2026-10-01 New York): before promotion, Aymane reported
blur after selecting/uploading a photo and paused review. The affected selection
path and first blurred stage are not yet identified. PR #288 remains draft and
#279 In progress while this is investigated. The prior full-run and iPhone results
do not establish resolution of the new report; no quality fix is claimed.

The founder clarified that this is a central light after saving, not blurred
detail. The feed and feed preview apply an existing `room-key` CSS spotlight;
the profile editor's small photo does not. The affected surface is being confirmed.
No input contract, stored pixels or crop processing has changed for this report.

Aymane subsequently accepted the existing light effect and confirmed that it
looks good. This resolves the review pause without an image-processing or design
change. Resume the requested handoff after required checks verify the full-run
evidence; physical Android Chrome remains explicitly deferred and untested.

### Participant photo replacement race follow-up (#279, 2026-10-01)

An authenticated participant's refused Storage download can refer to a source
superseded between the presentation read and the download. The photo component
performs at most one additional `profile_photo_presentation` read with the same
profile UUID and existing runtime projection checks. That read has a 5,000 ms
AbortController deadline; no caller-supplied URL or new RPC argument is accepted.
A different authorized portrait/round source may replace the previously displayed
photo after download and decode. An unchanged source, null/invalid/refused
projection, transient recheck failure/timeout, or failed replacement clears the
photo. Superseded component/generation results remain ignored. Owner-direct and
founder-review downloads keep their existing denial behavior. Storage RLS remains
authoritative. The existing browser journey now forces the stale-projection race
and retains denial/null-projection and stale-response assertions, including
unavailable and timed-out authority rechecks.

Test-fixture cleanup progress uses fixed operation/bucket labels and ordinal
fixture indices only; it never serializes user IDs, paths, payloads or tokens.
The CI reporter prints the last label only for incomplete cleanup. Its existing
failure semantics, owned-ID cleanup boundary and 60-second budget are unchanged.

### Photo preparation cancellation scope (#279, 2026-10-01)

Existing validated photo-state version/revision updates now invalidate only
saved-source work. Each in-memory request carries an internal boolean indicating
whether it depends on a saved version; callers derive this from the existing
recrop metadata, never from file payloads. Saved-source caches and dialogs still
expire on revision/version changes. Newly selected local files keep their
preparation and existing refusal feedback through unrelated saved-photo refreshes.
User cancellation, account changes and page unmount still abort requests and
ignore their eventual responses. File bounds, ticket ownership/purpose, server
revision enforcement, pixel conversion and crop contracts are unchanged. A
controlled delayed approval refresh covers the new-file refusal/cancellation race.
