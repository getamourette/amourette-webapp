# The night report keeps the booking totals, taken when the night ends

**Date:** 2026-11-25 · **Issue:** #560

## Decision

1. The durable night report (`public.venue_night_reports`, #257) is the single
   snapshot of a night's totals. It already kept the room side after the
   end-of-night purge: scanners, participants, gender at entry, likes (also by
   gender), matches, opened conversations, replies and the attendance curve.
   #560 adds the booking side to the same row: `booked`, `arrived`, `absent`,
   `arrival_times` (verified arrivals per 30 minutes) and `bookings_by_gender`
   (booked and arrived per answer, `unspecified` included).
2. They are written by `private.finalize_night_report`, the function every end
   of a night already calls inside `private.transition_venue_night` before it
   deletes likes, matches and messages: the scheduled end (minute job), a
   cancellation and a founder ending the night early (#431). Same transaction:
   if the snapshot fails, the night does not end and nothing is deleted. No new
   end-of-night path was added and the transition function is unchanged.
3. Definitions follow the founder arrivals summary: a booking is a confirmed,
   paid reservation; arrived means verified; the other bookings are absent. The
   figures are as of the end of the night: an arrival corrected later is not
   reflected, and a stored report is never rewritten.
4. A cancelled night, or a night without a booking event, stores nulls for the
   booking totals; its room totals are kept as before.
5. Reports stored before this change were backfilled from the reservation
   records, which outlive the room cleanup.

## Why

The reservation records survive the room cleanup, but the gender answered at
reservation is erased 30 days after the night (#388), and the financial
retention of reservations is still an open decision. The aggregate split would
then be lost. Putting the totals in the existing report, written by the
existing finalization, covers every end path without touching the lifecycle
state machine that #431 was changing in parallel.

A separate snapshot table or a trigger on the report insert was rejected: the
first duplicates the report and its access rules, the second hides the write.

## Privacy

Totals only: no reservation, guest or account identifier is copied. On a 15 to
20 seat night a small count can still point at one person, so the columns stay
behind the founder-only `admin_venue_night_report` RPC (the table has no client
grant). Keeping an aggregate count of an answer is not keeping the answer on the
reservation record, which #388 still erases on time.
