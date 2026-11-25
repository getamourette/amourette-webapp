# The photo picker asks iOS for a JPEG instead of the original HEIC

**Date:** 2026-11-25 · **Issue:** #278

## Decision

The profile photo picker no longer lists HEIC or HEIF (`PHOTO_ACCEPT` in
`lib/heic.ts` is `image/jpeg,image/png,image/webp`). On an iPhone, iOS then gives
the browser a JPEG copy of the photo rather than the original HEIC. The server keeps
its HEIC conversion path unchanged as a safety net for HEIC that still arrives.

This supersedes the part of the 2026-10-01 HEIC decision (#279, archived in
`docs/decisions.md`) that preserved each iPhone photo at its native precision: an
iPhone photo now arrives as 8-bit JPEG, which the existing browser step resizes to
fit 2560 px before upload, like any other JPEG.

## Why

Most guests are on iPhones, and every HEIC photo goes through a server conversion
that dominates the waiting time at the door. Measured locally on 2026-11-25 with a
real iPhone photo (3 runs each): preparing the profile photo at save takes 13.8 s
from the HEIC and 0.44 s from the JPEG the browser would upload, and the upload
falls from 2.1 MB to 0.46 MB. Selection also stops waiting for the server
conversion and the download of its PNG preview, since the phone shows a JPEG itself.

Marwane accepted the quality loss: a profile photo is shown small, as an 8-bit
WebP, so the 16-bit source the HEIC path preserved was never visible to anyone.

The server path stays because iOS is not guaranteed to transcode: HEIC from the
Files app, other browsers and WebKit regressions reported since Safari 17 can still
send the original. That path keeps its own speed-up (#553, reuse of the conversion
made at selection).

## Not verified

No automated browser can show what the iOS photo library hands over, and no device
check was run. After deployment, the share of `/api/profile-photo/prepare` calls
(made only for HEIC) among photo saves tells whether iPhones now send JPEG.
