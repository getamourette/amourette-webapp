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
