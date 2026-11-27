# Reservation links carry a closed `via` channel, recorded once beside the reservation

**Date:** 2026-11-25 · **Issue:** #561

## Decision

1. A reservation link may end with `?via=street`, `?via=instagram`,
   `?via=venue_flyer` or `?via=venue_story`. These four exact values are the whole
   vocabulary; any other value, casing or a repeated parameter is recorded as no
   channel, and the booking goes through exactly as without one.
2. The channel travels inside the booking the browser already submits and
   stores for resume. It adds no cookie, no new storage key and no third-party
   request. The Stripe redirect never sees it: the channel is written before the
   guest leaves for Checkout.
3. It is stored in its own private table, `private.launch_reservation_channels`,
   written once by the service-only `record_launch_reservation_channel`, not as a
   new argument of `prepare_launch_checkout` or a column of the reservation row.
4. Founders see it only as totals of confirmed bookings per channel on the night
   page (`admin_launch_channel_counts`), like the gender totals of #354.
5. The gender split asked in the same issue already existed (#354): the form
   asks for gender at reservation and the night page shows confirmed totals.
   No form change.

## Why

- A closed set keeps the input trivially bounded and the totals comparable from
  one night to the next; free-form tags would split one channel into spellings.
  Refusing a booking over a bad tag would cost a real guest for an analytics
  value, so an unknown value is dropped instead.
- Changing the arguments of a function the live code calls is a removal under
  the migration rules (#434) and would need a renamed function and a later drop.
  A new table and two new functions are additive: the code in production keeps
  working on the new schema with no special run, and no other pull request that
  replaces `admin_launch_overview` or the reservation functions can silently
  undo this one.
- Write-once means a resume, a replay or a later link opened in the same tab
  never rewrites the first attribution. A failed write is ignored by the route
  (attribution never blocks a payment) and repeated by the next resume.
- Confirmed bookings are the figure that answers "which posted link fills the
  night"; holds expire on their own and would count abandoned attempts.
