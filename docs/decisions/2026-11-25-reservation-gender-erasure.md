# Reservation gender erasure: 30 days after the earlier of scheduled close and terminal transition, hourly (#388)

Date: 2026-11-25 (#388). Completes the retention item of the 2026-11-16 decision
"Gender at reservation (#354)" in `docs/decisions.md`, whose erasure job was not
written yet.

**Promise.** The reservation privacy section (`lib/booking-privacy.ts`, EN/FR/ES)
says the gender given at reservation is erased from the reservation record 30
days after the evening ends.

**Decision.**

1. **The value is cleared, not the column.** An hourly pg_cron job
   (`amourette-launch-gender-erasure`, `private.erase_launch_reservation_gender()`)
   sets `gender` to null. Why: the column, its check and the functions that read
   it stay valid for the code already live, and the merge workflow refuses
   schema removals.
2. **"The evening ends" is the earlier of the night's scheduled close and its
   terminal transition.** Why: the scheduled close is frozen once registration
   opens and is authoritative even when the lifecycle job has not yet recorded
   the end; a night ended early or cancelled ends at that transition. Either way
   the answer is never kept past the promised date. Consequence to note: for a
   night cancelled ahead of its date, the 30 days run from the cancellation.
3. **Hourly, not daily.** Why: the answer outlives the 30 days by less than an
   hour instead of up to a day; a run with nothing due writes nothing, so the
   cost is one small read per hour.
4. **The founder totals keep their block** and show erased answers as
   `Not recorded`, the label already used for bookings made before #354. Why: the
   page already handles it (browser test), the totals stop being useful 30 days
   after the night anyway, and hiding the block would need a UI change for no
   decision value.
5. **Only the gender is erased.** Retention of the rest of the reservation
   record remains a separate decision (`docs/launch-reservation-policy.md`).
