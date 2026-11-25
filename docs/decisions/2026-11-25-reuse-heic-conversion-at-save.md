# The photo save reuses the server's HEIC conversion from the selection

**Date:** 2026-11-25 · **Issue:** #278 · **Supersedes:** the "repeating conversion" choice in the HEIC section of `docs/reports/input-validation-audit.md` (#288)

## Decision

1. When `/api/profile-photo/prepare` converts a HEIC selection, it also stores the
   converted, metadata-free PNG in the private `profile-photo-sources` bucket at a
   server-chosen `<owner>/<uuid>.png` path, and returns an HMAC reference to it
   (`X-Photo-Source-Ticket`, purpose `heic-source`, owner, path, ten-minute expiry).
2. The save sends `{source, revision, profile?, crop, roundSourceCrop}` instead of
   uploading and converting the HEIC again. The server downloads that stored PNG,
   validates it fully as it does any source, and publishes it as the version's
   source without uploading it a second time.
3. An expired, foreign or missing reference answers `400 source_missing`, and the
   client falls back once to the previous path (upload the original, convert it).

## Why

Measured on a real 24 MP iPhone HEIC, server stages only (local, 3 runs): the save
spent 19.6 to 24.4 s preparing the photo, because it converted the HEIC again
(10.6 to 13.9 s for the conversion alone, against a 20 s converter limit). From the
stored conversion the same stage takes 7.3 to 8.1 s. The second conversion was also
what made a busy converter fail the save at the door (#485).

The #288 reason for converting again was not to trust a client-supplied prepared
source and not to depend on an expiring reference. Neither applies here: the bytes
are written by the server into a bucket no client can write, the client only holds
an owner-bound signed reference, and an expired reference falls back to the old path.

## Cost

Each HEIC selection now stores its PNG (about 30 MB for 24 MP) even if the guest
picks another photo or never saves. Unreferenced sources are removed by the existing
collector after 24 hours (`expired_profile_photo_source_paths`).
