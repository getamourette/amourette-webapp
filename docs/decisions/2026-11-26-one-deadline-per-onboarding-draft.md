# One 24-hour deadline per onboarding draft, renewed only by a changed answer

**Date:** 2026-11-26 · **Issue:** #286

## Decision

1. The unfinished onboarding draft (text in `localStorage`, photo in IndexedDB) has
   one deadline: 24 hours after the later of the text's `editedAt` and the photo's
   `savedAt`. Text and photo are restored or cleared together.
2. Only a changed first name, bio or adulthood answer renews `editedAt`; confirming a
   photo or its framing renews `savedAt`. Restoring, reloading, moving between steps
   and the sanitizing rewrites keep both timestamps.
3. A draft without a valid timestamp (saved before this change, malformed, or in the
   future) is removed on its next read and never restored.
4. Expired drafts are cleared when a draft is read and on every page load, from the
   root `PhotoSync`. No server job is involved: before profile creation the draft
   exists only on the device. The server copies an abandoned onboarding can leave
   (an upload in staging, a converted HEIC source) are already removed by the
   existing scheduled photo cleanup, after 3 and 24 hours respectively.

## Why

The privacy policy promises "24 hours after your last deliberate edit" for the draft
as a whole. Separate clocks would let the photo vanish while the guest is still
editing the text, or keep an old photo alive behind a fresh name. Step moves do not
count as edits so that a restoration, which may move the step back, cannot extend
the draft. Expiring untimestamped drafts costs, at most, one interrupted onboarding
on the day this ships; granting them a fresh lifetime would keep abandoned drafts
indefinitely, which is what #286 exists to stop.
