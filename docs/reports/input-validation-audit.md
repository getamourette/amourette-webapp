# Input validation contract and audit — #77

Date: 2026-09-09. Branch: `feature/input-validation-constraints`, commit `3d5bd33`.
Status: local implementation authorized on 2026-09-09 and resumed on 2026-09-11; all nine #77 migrations applied remotely on 2026-09-11; release validation pending.

## Current maintained contract

Implementation authorized on 2026-09-09, resumed on 2026-09-11. The earlier pause
statements below describe the historical audit session and are superseded by that
authorization. **All nine #77 migrations are applied remotely; this branch is not ready for review**.
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
| Bio | Optional/null, at most 500 code points | Creation/edit/wizard, trigger and CHECK; logic and SQL |
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
Vercel preview inspection remains pending during final-delivery preparation;
publication is now authorized to obtain the deployment for that inspection.
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
upload transport (#249), or publish local application changes. Preview validation
remains pending.

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
no retries or password fallback. Required hosted checks on the eventual PR commit
and Vercel visual inspection of the current application changes remain pending.
Post-run cleanup checks found zero E2E-tagged Auth accounts and zero `e2e-` venues
created during the preceding 15 minutes.

The passing photo boundary test also bypassed the application with ordinary
participant REST writes: PostgreSQL rejected 31-code-point names, 501-code-point
bios, excessive raw padding and duplicate preferences without changing the saved
profile. Exact 30/500 boundaries passed; ECMAScript boundary whitespace normalized
correctly, including an optional blank bio becoming null. Participant phone writes
remained forbidden. A malformed service-only photo submission was rejected before
changing the photo revision or displayed/pending pointers.

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
