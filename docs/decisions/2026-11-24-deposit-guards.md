# Deposit guards: no organizer cancellation once a night has ended or entry has opened, late acknowledgement from the hold's end (#477)

Date: 2026-11-24 (#477, bug review findings Z6-M4, Z1-M6 and part of Z5-I4).

**What was wrong.** An organizer cancellation of a night whose scheduled close had
passed still went through (stale founder tab, direct RPC call, or a night
cancellation before the next lifecycle tick). It refunded every retained deposit
(no-shows, late cancellations) and sent "event cancelled" to guests who came.
The founder page also offered the organizer cancellation on a live night, where
it is the most tempting button for ending the evening early. Separately, the
late-cancellation acknowledgement was checked only at hold creation, so a guest
who started paying ten minutes before the free-cancellation deadline could pay
twenty minutes after it without having acknowledged it.

**Decision.**

1. **The database refuses an organizer cancellation or postponement once the
   night has ended** (`closes_at` passed, or terminal for any reason other than
   this cancellation), with the error `event has ended`. The guard is in
   `private.launch_cancel_event`, the one path both `admin_cancel_launch_event`
   and the night-cancellation trigger take. Why there: a check in the founder
   RPC alone would leave `cancel_venue_night` able to trigger the same refunds.
2. **The founder page withdraws the organizer cancellation once entry has
   opened** (the same "schedule locked" moment that already hides the
   walk-in night cancellation) and says why. Why from entry rather than only
   from launch: in the waiting state guests are already at the bar, and the
   harm is the same. Ending a night early belongs to #431. The database does
   not refuse between entry and close: a real emergency stays possible by
   direct founder action, and the issue asked only for the ended-night refusal.
3. **The late acknowledgement is required whenever the payment hold can end
   after the deadline** (`hold_until > deadline`, the deadline instant itself
   still free). The booking page asks for it from 30 minutes before the
   deadline, the length of the hold (`lateAcknowledgementRequired` in
   `lib/free-cancellation.ts`). A page whose event read predates that moment
   is refused by the server and reloads with the notice, as before.

**Known gap.** In those last 30 minutes the existing late notice still says the
deadline "has passed", which is a few minutes early. Its wording belongs to the
booking-page copy work (#478) and was not changed here.
