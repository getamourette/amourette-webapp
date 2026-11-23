# Room entry waits for a settled feed read

Date: 2026-11-18 (#385)

A first entry into a live venue opened on the empty live room for a moment and
then swapped to the feed. Cause: the entry's own `check_in` writes a presence
row, which sends the participant signal back to the same phone. Each signal
moves the participant generation twice: once when it is received, once when the
revision read it triggers returns (about 200 ms plus one request later). One of
the two usually lands while the bootstrap is loading the room. The bootstrap
rightly refuses a feed read that an invalidation overlapped (it may list
someone no longer authorized), but it then published `ready` with an empty
feed and let the live resync fill it.

- **The bootstrap now reads the feed again, behind the doorway, until a read is
  not overlapped, for at most `FEED_SETTLE_MS` (2 s).** Why: an overlapped read
  is expected on every first entry, so it must not be shown as an empty room.
  The first read keeps the previous window (feed, likes and matches loaded
  together); a re-read is compared over the feed request alone.
- **A time limit, not a number of reads.** Why: two people scanning within a
  second produce four generation changes, which a small fixed count would not
  outlast; on an arrival the re-reads mostly fit inside the doorway's minimum
  hold.
- **Past the limit the room still opens without a feed and the live resync
  fills it**, as before. Why: entry must not hang on a busy room.
- **Guarded by** `tests/onboarding/first-entry-feed.spec.ts`, which holds the
  first feed read so the overlap always happens and records whether the empty
  room was ever in the page.
- **Not changed:** returning from invisible still shows the empty room until
  its resync completes; same family, not part of #385.
