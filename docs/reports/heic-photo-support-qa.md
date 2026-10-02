# HEIC/HEIF acceptance audit — #279

Audited on 2026-10-01 against application commit `436abf5` and the subsequent test
corrections in draft PR [#288](https://github.com/getamourette/amourette-webapp/pull/288).

## Requirements and evidence

| Ticket requirement | Implementation and coverage | Remaining evidence |
| --- | --- | --- |
| Accept HEIC/HEIF during onboarding and replacement | Shared picker types; bounded byte detection for missing/generic MIME; authenticated preparation; existing final publication path. `tests/profile/heic-photo.spec.ts` covers both browser modes; `tests/validation/photo-staging.spec.ts` uses real private Storage and publication. | Physical picker MIME, source dimensions/size and Safari version were not recorded. |
| Preserve orientation and recognition quality | Native precision and RGB ICC are retained in a full-resolution 16-bit PNG. `scripts/test-heic.mts` checks genuine 10-bit P3, exact decoded samples and all eight orientations. Unsupported HDR/colour variants are refused. | Synthetic fixtures do not establish equivalence with Apple's rendering for every camera variant. |
| Retain complete source and independent crops | Private normalized source is retained; portrait and round coordinates reference it independently. HEIC logic tests compare source/crop/recrop pixels; existing photo-crop and recrop-source-loading browser journeys cover framing, cancellation, retries, revisions and account isolation. | Latest replacement/denial states still need deployed mobile interaction inspection. |
| Recover from corrupt, oversized and unsupported files | Source, pixel and output limits remain authoritative. HEIC tests cover corrupt/truncated, byte/pixel bounds, HDR refusal and cancellation. Browser tests preserve the prior crop through refusal/cancellation and a late saved-photo refresh. | Physical-device refusal and cancellation states have not been recorded. |
| Keep private staging, metadata removal and moderation | Purpose/owner/expiry-bound tickets; byte/type checks; metadata scrub; bounded workers; unchanged moderation/publication and source authorization. Real Storage test verifies preparation does not publish and another owner cannot consume its ticket. | No new schema work is pending. The staging MIME migration was applied with founder approval. |
| Document the conversion contract | See the HEIC amendment in `input-validation-audit.md` and the 2026-10-01 entries in `../decisions.md`. | None for documentation of the chosen policy. |

## Device and preview inspection

Preview: [HEIC branch](https://amourette-webapp-git-feature-heic-photo-support-tothe-moon.vercel.app/profile).

- **Founder, physical iPhone 13 Pro Max:** High Efficiency enabled; Photos and
  Files selection and crop/recrop reported successful. iOS **26.6.2 as reported**;
  exact Safari version and picker-delivered file type were not captured. These
  results came from the earlier `7a4c808` preview, before the saved-photo refresh
  race correction. No claim is made that both pickers supplied original HEIC.
- **Agent, Safari 26.0.1 on macOS 15.7.1:** inspected the actual Vercel preparation
  loading screen, successful synthetic 10-bit P3 image rendering, portrait editor,
  round editor, and portrait framing retained after changing round zoom. This was
  a desktop viewport, not physical iPhone or Android evidence.
- **Agent, Chrome 154.0.8037.93 on macOS 15.7.1:** opened the actual preview at
  390 × 844 and inspected the photo-selection state. The extension refused file
  upload, so mobile crop/error/replacement inspection was not completed there.
- **Physical Android Chrome:** unavailable. Do not equate Chromium mobile
  emulation with this ticket's physical-device check.
- All three permanent QA rooms passed the read-only fixture health check; no
  shared-room reset or moderation changes were made for this audit.

## Validation and disposition

The latest completed full hosted run is
[36941670197](https://github.com/getamourette/amourette-webapp/actions/runs/36941670197)
on `4bcc716`, base `05a6ac8`. Lint, logic, PostgreSQL checks and production build
passed; the browser gate failed with **91 passed and 3 failed**. Both HEIC browser
journeys, actual HEIC Storage preparation/publication, arrival-to-chat and the
crop/recrop cases passed. A green draft PR check defers browser execution and does
not replace this failed full gate.

The three failures were investigated before another full run:

- **Overlapping photo refreshes:** the single stale-presentation fixture could be
  consumed by an obsolete request before any download. Holding the first read and
  starting another refresh reproduced the exact `staleDownloads = 0` failure.
  Keep serving the stale projection until the refused download actually occurs.
  The controlled regression now passes and remains in the browser journey.
- **Late legacy-bio response:** removing routing while `route.fetch()` was still
  running resumed the request before its mock could fulfill it. Holding a late
  read reproduced `Route is already handled!`; draining active handlers with
  `unrouteAll({ behavior: 'wait' })` passed the same probe. The temporary probe was
  removed; the existing bio assertions remain intact.
- **Realtime readiness:** read-only logs show subscription database timeouts at
  23:42:49 and 23:42:52 UTC, immediately before the lost positive-control event.
  Wait for the server's `postgres_changes` readiness message as well as channel
  subscription before writing. The isolated check passes with real participant
  sessions. Only the specific unpublished-profiles refusal is accepted; generic
  channel errors no longer count as proof of privacy.

These corrections change test synchronization only. Image pixels, crops,
application behavior, assertions and timeout budgets are unchanged. Targeted
ESLint and TypeScript checks pass. The final combined focused run passed all three
corrected cases in 2.4 minutes, with normal cleanup of its 11 owned synthetic
accounts. A fresh hosted full gate is pending founder approval.

The reported approximately 10-second Files preparation and 9-second recrop waits
remain open in [#289](https://github.com/getamourette/amourette-webapp/issues/289).
They are not presented as fixed or as measured upload-only timings.

Keep #288 draft and #279 In progress until the required deployed/device evidence
is completed or the founders explicitly revise that acceptance scope. Passing
automation establishes the covered cases, not a guarantee that no bugs exist.
