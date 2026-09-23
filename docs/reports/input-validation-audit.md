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
