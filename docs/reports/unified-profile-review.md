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

Application remains founder-gated. The migration takes the existing global
eligibility barrier, rejects unexpected discovery function structure, and fails
atomically if existing correction reasons cannot map to the preset vocabulary.
Before applying, inspect effective deployed #236/#194 definitions and unresolved
requirements, announce that the behavioral cutover affects the shared development
DB, and obtain explicit application authorization. Supabase MCP is unavailable in
this session; no remote schema/type/advisor operation has occurred. After authorized
application, regenerate/reconcile types and inspect security advisors/grants.

## Validation and remaining gates

- Production build, strict TypeScript and lint passed during integration.
- Actual isolated migration covers all seven correction combinations, authorized
  venue counts, malformed commands, stale decisions, explicit submission,
  resubmission priority, notice receipts, old-draft adoption, voluntary photo
  rejection, legacy report field actions and unchanged matches/voluntary hiding.
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
- Shared-schema browser journeys, full hosted CI and deployed visual/device review
  remain **unverified**. The live regression tests fail before creating fixtures
  when the new RPCs are absent; they never apply migrations.

A combined controlled run passed 16 of 17 cases, including 1,001-report
pagination/recovery. The remaining existing focus check raced the name dialog's
close autofocus; it now verifies dialog removal and focus restoration before
editing the bio. Its focused EN/FR/ES rerun passed with the original field focus
assertions retained. The latest production build/lint passed after the last UI
change. Local screenshots of the integrated admin correction, owner readiness,
pending state and short-viewport chat were inspected by the agent.

Until the migration is applied, a WIP preview intentionally keeps the current
moderation foundation available. It cannot test #294's new lifecycle end to end.
After cutover, test `/admin` → Moderation at desktop and 320px, then the owner prompt
and existing chat on a phone. Verify one multi-field request, partial edits staying
Awaiting changes, explicit prioritized resubmission, approval restoring discovery,
and an existing report staying open until handled separately. Use shared QA rooms
only after verifying their health; never reset them implicitly.
