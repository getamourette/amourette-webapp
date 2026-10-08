# #294 implementation and cutover evidence

Prepared on `feature/unified-profile-review`, based on main `addeb48` after #291's
squash merge. This is a WIP checkpoint, not Ready for review. #236, #162 and #279
worktrees are untouched; the pre-integration stash/backup remains preserved.

The correction layout follows the ticket attachment. Approval uses the same
complete profile card with a primary Approve & next action. There was no approval
attachment in the ticket. Venue filters/counts, original request comparison,
resubmission priority, unchanged approval badges and nonactionable Awaiting changes
are implemented. The participant gets one consolidated prompt, direct field edits
and a separate explicit whole-profile submission.

## Prepared database change

`supabase/migrations/20261003000001_unified_profile_review.sql` adds private review
state and founder/owner RPCs around the merged field-level moderation functions.
It changes discovery eligibility for **every active correction**, including
bio-only corrections, until complete-profile approval. It does not ban accounts,
delete matches/messages, restore voluntarily hidden presence, clear independent
night sanctions or handle/close reports. Initial unverified profiles retain their
existing discovery behavior until a correction is requested.

Existing report photo/text RPC signatures and field decisions remain. New wrappers
consolidate actual correction requirements without losing other active fields;
voluntary photo rejection retains its prior behavior. Original content is held
only during the open cycle and cleared on full approval. Text publication/reasons,
photo bytes/crops and existing-chat name notices reuse the foundation.

Application was explicitly authorized by Aymane on 2026-10-03; see the matching
entry in `docs/decisions.md`. The migration takes the existing global
eligibility barrier, rejects unexpected discovery function structure, and fails
atomically if existing correction reasons cannot map to the preset vocabulary.
Preflight inspected the effective deployed #236/#194 definitions and requirements.
One historical photo request had no saved reason; its backfill now uses the
explicit `legacy_unknown` display marker, preserving its correction hold without
inventing a violation. New requests cannot use that marker. Unknown non-null
reasons and missing text reasons still fail the migration atomically.

Supabase MCP authentication succeeded through the existing project-scoped
configuration. The migration was applied as remote version `20261003212714`,
with file SHA-256 `695d35b3bc4d32fef1cf5fd21b183fa2d5971a3b90eb5eb90a180ef7c9585bcd`.
All 177 existing profiles received review records; the old photo correction and
combined name/bio correction remain Awaiting changes. MCP types were regenerated
and compared with the maintained types: all six new RPC contracts match, and
existing manual nullability/trigger refinements are retained.

Security advisors were checked before and after application. The delta is the
intentionally inaccessible private table ([RLS without direct policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy))
and the six authenticated, guarded RPCs ([SECURITY DEFINER advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)).
Catalog checks confirm no direct table privileges for anon/authenticated/service
roles, no anonymous/private-helper execution, and authenticated-only new RPCs.
Existing project advisory findings are unchanged.

## Validation and remaining gates

- Production build, strict TypeScript and lint passed during integration.
- Actual isolated migration covers all seven correction combinations, authorized
  venue counts, malformed commands, stale decisions, explicit submission,
  resubmission priority, notice receipts, old-draft adoption, voluntary photo
  rejection, legacy report field actions and unchanged matches/voluntary hiding.
  The cutover regression also covers a historical reasonless photo correction,
  its preserved hold, later report-field additions, explicit resubmission/full
  approval and refusal of the historical marker in new requests.
- Controlled mounted-screen regressions cover admin decisions/advancement/counts,
  exact revision refusal, venue switching, owner acknowledgment, direct name/bio
  edits, partial versus explicit submission, lost-success-response confirmation
  and a reachable existing-chat composer at 320px. Three mounted-screen cases and
  the focused lost-response rerun passed. Existing name/text controlled
  journeys continue to exercise the pre-cutover foundation.
- Independent layout fixtures cover errors/empty states, correction selection,
  enlarged picture dismissal/focus, resubmission comparison and EN/FR/ES at 320px;
  all three passed. These fixtures never touch shared
  data and are excluded from the production route inventory.
- The unified shared-schema browser journey passed on desktop and 320px mobile
  against the local production build (two cases, six owned password accounts,
  normal fixture teardown). It verifies full approval, a bio-only discovery hold,
  durable notice acknowledgment, explicit resubmission, unchanged approvals,
  existing chat use and independent report handling.
- Eight focused moderation regressions passed against the local production build
  after cutover: existing name/text corrections, photo replacements and cancellation,
  the live unified review cycle, and three mounted-screen cases. The mounted cases
  also verify unchanged filter/venue selections and delayed bio-editor replacement.
- The deployed shared-schema journey passed at 320×740 and 1440×1000 on application
  commit `60bed73245a85bc74e03d2a5c75e26cd527c645d` (two cases, six owned password
  accounts with fixture teardown). The agent inspected the captured approval,
  correction selection, original-request comparison, owner ready/pending and
  existing-chat screens. These screenshots use fixture placeholder pictures;
  actual photo upload/replacement remains covered by the focused foundation tests.
- The remaining preview interaction/content matrix passed on the deployed branch:
  five focused mounted cases plus loading, empty, stale-decision, failed-read/retry,
  lost-decision-response/reload, enlarged-picture dismissal/focus, reduced motion,
  all three correction fields, partial/ready/pending submissions and EN/FR/ES at
  320px. The agent inspected the resulting screenshots. Temporary locale
  exploration initially restored English on reload; correcting that fixture's
  locale setup made the focused French/Spanish rerun pass without changing the app.
  Physical phone keyboard inspection remains **unverified**. The tests never
  apply migrations. Vercel CLI login was refreshed to restore existing
  preview automation access. Initial deployed checks found a same-filter/venue
  click clearing the inspected snapshot without triggering a read, and direct bio
  focus being lost when delayed field data replaced the ordinary editor. The fix
  preserves the snapshot for unchanged selections and the user's focus intent
  through editor replacement. Controlled coverage holds the text read to reproduce
  that ordering; existing focus assertions remain unchanged. Local verification
  passed, and the refreshed deployed journey passed with both fixes.

### Delivery checkpoint on 2026-10-03

Aymane approved the admin preview. Participant simplification is tracked separately
in [#295](https://github.com/getamourette/amourette-webapp/issues/295); this branch
does not implement that redesign. [PR #296](https://github.com/getamourette/amourette-webapp/pull/296)
targets main and remains draft; #294 remains In progress.

The first full hosted [run 37157740407](https://github.com/getamourette/amourette-webapp/actions/runs/37157740407)
on head `e50d69fb4c244430417902011b04b7a73e8cc6ae` and base
`addeb484f9aa8183bf9daa41fac00c06bc448de6` passed lint, logic, build and
PostgreSQL 17 concurrency coverage. Browser coverage finished with **102 passed,
3 failed**, using 82 password and 2 anonymous owned fixtures with normal teardown.
The successful earlier draft checks deferred browsers and are not merge evidence.

- The name-correction/report integration failure reproduced locally. Its trace
  showed the report read starting before the approval response completed, so it
  legitimately returned the reporter's previous name. The test now waits for the
  actual approval response and asserts success before refreshing reports; the
  reporting implementation and existing assertions are unchanged. The corrected
  real-schema journey passed on the deployed 320px preview (one case, three owned
  password fixtures, normal teardown).
- The existing private Realtime block test observed one unrelated room read in CI;
  the focused local reproduction passed with the original zero-read assertion.
  The existing room lifecycle/chat-preview case timed out on first room entry in
  CI; its complete focused local reproduction also passed. Neither hosted failure
  is proven resolved, and no production change or weaker assertion was made for
  them. The encrypted hosted artifact is retained, but its decryption key is not
  available in this worktree; the reproducible approval failure was inspected via
  its local trace instead.

A fresh full hosted run is still required on the corrected head, followed by the
Ready-for-review checks. Per AGENTS.md, repeating a long suite requires founder
approval. Physical-device evidence also remains pending; the PR must not be merged
in this state.

### Founder-approved full rerun

Aymane explicitly approved the rerun. [Run 37165359720](https://github.com/getamourette/amourette-webapp/actions/runs/37165359720)
tested head `7e3201108620941c7856af96d1f5bf1319fd2c5a` against the unchanged
`addeb484f9aa8183bf9daa41fac00c06bc448de6` base. Lint, logic, PostgreSQL 17
concurrency and production build passed. All #294 admin/participant/moderation
cases, the corrected approval/report integration and the unchanged private
Realtime zero-unrelated-read case passed. Full browser coverage finished with
**104 passed, 1 failed** (12.3 minutes), again using 82 password and 2 anonymous
owned fixtures with normal teardown.

The remaining `tests/profile/chat-preview.spec.ts` failure is at a different
point from the first run: after updating Bob's prose bio and reloading the room,
`room-profile-name` did not appear within the existing 10-second assertion. The
complete unchanged local reproduction passed (one case, 1.2 minutes, two owned
password fixtures, normal teardown). This does not establish the hosted cause.
Its [encrypted diagnostic artifact](https://github.com/getamourette/amourette-webapp/actions/runs/37165359720/artifacts/11288944680)
is retained; the existing `E2E_ARTIFACT_KEY` must be supplied locally before its
trace can be inspected. No assertion was relaxed, no retry was added, and no
application change was made to hide this failure. #296 remains draft and #294
In progress. Another full run and promotion remain founder-gated; physical phone
keyboard evidence is also pending.

The initial Git push did not trigger a Vercel build. Rebuilding the existing
preview through Vercel's documented `withLatestCommit` API produced
`dpl_DF6U9L2NEHnPq4WYviv6kPVoqe4M`, confirmed Ready on the exact application
commit above with a null (preview) target. Its stable branch alias is
https://amourette-webapp-git-feature-unified-profile-review-tothe-moon.vercel.app.
No production deployment or project-setting change was made. Read-only QA status
verified all three permanent rooms healthy; no shared-room reset was performed.

A combined controlled run passed 16 of 17 cases, including 1,001-report
pagination/recovery. The remaining existing focus check raced the name dialog's
close autofocus; it now verifies dialog removal and focus restoration before
editing the bio. Its focused EN/FR/ES rerun passed with the original field focus
assertions retained. The latest production build/lint passed after the last UI
change. Local screenshots of the integrated admin correction, owner readiness,
pending state and short-viewport chat were inspected by the agent.

The authorized migration now enables the new flow on the WIP preview. Test
`/admin` → Moderation at desktop and 320px, then the owner prompt
and existing chat on a phone. Verify one multi-field request, partial edits staying
Awaiting changes, explicit prioritized resubmission, approval restoring discovery,
and an existing report staying open until handled separately. Use shared QA rooms
only after verifying their health; never reset them implicitly.

### Protected failure investigation on 2026-10-04

Aymane approved a one-time diagnostic recovery and the GitHub CLI workflow
permission needed to publish it. The helper is isolated on
`fix/294-diagnostic-recovery`, based on the unchanged main commit
`addeb484f9aa8183bf9daa41fac00c06bc448de6`; it is outside #296's diff.
[Recovery run 37250946015](https://github.com/getamourette/amourette-webapp/actions/runs/37250946015)
succeeded. The saved `E2E_ARTIFACT_KEY` was used only inside GitHub Actions,
with read-only repository permissions and no Supabase credentials. The job
authenticated the original failed-run artifact, decrypted it in memory and
encrypted it to this computer's public recipient key. Only that encrypted
copy was uploaded, with one-day retention. The shared key was not displayed,
downloaded or added to local environment files; decrypted diagnostics remain
local, and only the failed journey's files were extracted.

The screenshot shows the room's matching-consent loading state when the
existing 10-second `room-profile-name` assertion expired. The trace shows the
reload's prerequisite database reads taking approximately 0.6–2.2 seconds
each and `get_my_matching_consent` still pending at failure. Other room reads
completed successfully. This identifies the blocked stage, but does not prove
why the transport slowed or that the problem is resolved. The complete
unchanged focused local journey had already passed. No production fix,
relaxed assertion or automatic retry was introduced based on that uncertainty.

Aymane approved one fresh full hosted validation after this investigation.
Latest execution and review-readiness evidence belongs in the PR's checks and
`docs/decisions.md`; the previous 104/105 run remains historical failed evidence.
Physical-phone keyboard confirmation is still outstanding at this checkpoint.

### Photo-refresh gate investigation on 2026-10-04

The approved [full run 37252083615](https://github.com/getamourette/amourette-webapp/actions/runs/37252083615)
tested `154933dcdfc9daf70b222e3ff5840374e7ef932b` against unchanged base
`addeb484f9aa8183bf9daa41fac00c06bc448de6`. Lint, logic, PostgreSQL 17 and
build passed; browsers finished **104 passed, 1 failed** (16.5 minutes).
The previous room/chat failure passed. All unified-review cases and the photo
journey's correction, chat and report-handling steps passed. The remaining
failure was the feed's original-image continuity assertion during approval of
a replacement photo.

The approved isolated diagnostic helper was updated only to select this exact
failed run/artifact/head. [Recovery run 37253654053](https://github.com/getamourette/amourette-webapp/actions/runs/37253654053)
succeeded with the same protection boundaries: the shared key stayed inside
GitHub, only recipient-encrypted evidence was transferred, and only the failed
photo journey was extracted locally. Neither the helper nor its public recipient
key is part of #296.

The trace establishes a test ordering problem. A background presentation read
selected the previous photo before approval; the test held its Storage download
until after approval replaced that version. Storage returned HTTP 400
`not_found`, so the existing photo component correctly cleared denied bytes.
The new version then loaded successfully. Its production component and this
test helper were unchanged from main at the failing checkpoint.

The replacement-continuity step now holds the presentation read until approval
commits, then delays Storage for the authorized replacement. It retains the
original-byte and same-node continuity assertions. The following denial/null
projection and real rejection checks remain unchanged. No application fix,
relaxed assertion or automatic retry was added. A direct preview-focused
attempt stopped during fixture setup because the upload endpoint redirected;
it provides no browser validation. The complete focused regression passed
against the existing local production build and shared schema (1.1 minutes,
seven owned password fixtures, no anonymous signups, normal teardown).
Its unchanged denial, null-projection and real rejection assertions also passed.
Another full hosted run requires fresh founder approval; #296 stays draft and
#294 In progress. Physical-phone keyboard evidence remains pending.

### Latest approved full gate: 37254287219

Aymane approved a fresh full run after the focused replacement-order correction
passed. [Run 37254287219](https://github.com/getamourette/amourette-webapp/actions/runs/37254287219)
tested `e9d11a935e490ea5718ea570a8e190ae187c6ed6` against unchanged base
`addeb484f9aa8183bf9daa41fac00c06bc448de6`. Lint, logic, PostgreSQL 17 and
build passed. Browsers finished **103 passed, 2 failed** (14.3 minutes), with
every #294 unified-review case and the previous room/chat case passing.

The photo journey failed earlier than the corrected replacement-continuity step:
the second voluntary rejection notice was absent at its unchanged 10-second
deadline. The approved protected helper recovered only this run's exact artifact
through [run 37255411654](https://github.com/getamourette/amourette-webapp/actions/runs/37255411654).
Only these two failed journeys were extracted. The photo trace shows several
database reads taking 3–13 seconds and a `room_candidates` response with database
error `57014` (statement timeout). The owner's rejected state was read successfully;
its subsequent photo-version read completed just after the assertion deadline.
This identifies late refresh completion, not the cause of the database slowdown.

The unchanged real preference-edit test timed out waiting for its confirmation
dialog. The trace shows its Save click overlapping a participant/consent refresh
that temporarily makes preference controls unavailable. The page retained the
draft, no update-preferences request was issued, and the confirmation was absent.
This supports a click/readiness race; it does not establish a #294 production
regression. MatchingPreferences, PreferencesEditor, useMatchingConsent, usePhotoState
and PhotoSync are unchanged from main.

The complete two-case focused reproduction passed on the existing local
production build and shared schema with every current assertion preserved
(1.2 minutes, nine owned password fixtures, no anonymous signups, normal teardown).
No additional application change, assertion relaxation, timeout increase or retry
was introduced for these failures. That local result is not a replacement for
successful hosted full coverage. #296 remains draft/#294 In progress pending
resolution and a successful current-head/base hosted gate, physical-phone
keyboard confirmation, then the workflow's Ready-for-review checks. Another long
execution or promotion that would trigger one needs fresh founder approval.

### Targeted refresh-race fixes after 37254287219

On Aymane's request to fix the failures, deterministic controlled tests first
reproduced the delayed photo decision and the consent refresh between Save's
pointer down/up. The owner photo hook now publishes an authorized decision before
awaiting version metadata, retaining only the current owner's referenced versions.
A later removal clears the picture immediately and superseded metadata cannot
restore it. Photo bytes remain subject to their existing Storage authorization.

The preference editor now distinguishes reviewing a draft from submitting it.
Its confirmation gesture stays available during pending background verification;
the actual write remains blocked until both preference and consent reads verify.
Completed verification failures still disable Save. The open dialog shows existing
localized loading/error copy and retains its draft and dismissal behavior.

The affected four-file browser run passed 17 cases; its remaining new assertion
incorrectly expected the already-selected gender to be disabled during cooldown.
The maintained rule leaves that choice selected and disables other genders.
After correcting only that new assertion, all three focused preference recovery
cases passed (5.9 seconds). Together these runs cover all 18 affected cases,
including both complete real-data photo/preference journeys and all three new
regressions. Existing journey assertions were preserved. The photo denial step
now waits for preceding in-flight requests to finish before installing its
controlled stale-success/denial transport; its exact count, revocation and byte
continuity assertions remain. Owned fixtures were torn down normally; no anonymous
signups or permanent QA resets were used.

Lint, complete logic and production build pass. Logic used a workspace temporary
directory because the existing pick privacy assertion mistakes macOS's real
`/private` temporary path for secret output; no assertion was changed. Latest
origin/main and the PR base remain `addeb484f9aa8183bf9daa41fac00c06bc448de6`.
Deployed visual review of the changed pending/error states and a fresh approved
full hosted run are next. Physical-phone keyboard evidence remains pending.
#296 stays draft and #294 In progress; these fixes authorize no additional shared
database change, merge, branch deletion or sibling-worktree edit.

The fixes are pushed in `e1ef7b2f62a2d88fa9491ac235a5dabc24dc2fee`.
[Draft run 37257496388](https://github.com/getamourette/amourette-webapp/actions/runs/37257496388)
passed lint, logic and build; its browser job explicitly deferred execution
(`full false`), so this is not full merge coverage. GitHub deployment
`6850415906` confirms that exact commit's Vercel preview completed successfully.
Direct automated inspection stopped at Vercel's login screen before reaching
the application. The existing managed helper then failed its team lookup with
HTTP 403 before obtaining an automation credential or launching the tests.
These attempts supply no deployed behavior evidence. No protection was changed
and no credential value was emitted. The ordinary Chrome preview opens the
onboarding screen for its current session, so it cannot inspect the editor's
pending/error states without an existing participant session.

Agent visually inspected the passing local 320px pending confirmation and
393px failed-verification confirmation: text and controls fit, loading/error
feedback is visible, disabled Save and Keep editing remain reachable. This
does not substitute for deployed inspection or actual-phone keyboard evidence.
The existing draft state and remaining gates are preserved.
