# Recovery mail: one link per unpaid hold, ten per address, 200 a day in total

**Date:** 2026-11-25 · **Issue:** #371 (SEC-008)

## Decision

`request_launch_access` ("Find my reservation") keeps its generic answer and now
queues a recovery mail only within three limits, all checked in the database:

1. **Unpaid hold:** one recovery mail at most per hold, and none if the address
   already received a recovery mail in the last 24 hours, whatever the
   reservation or night. A new hold for the same address does not reset it.
2. **Per address:** at most ten recovery mails per 24 hours across every
   reservation and night. The existing two-minute cooldown and ten per
   reservation per day stay.
3. **Global ceiling:** at most 200 recovery mails per 24 hours for everyone
   together (`private.launch_recovery_daily_ceiling()`). When it is reached, the
   founders' mail alert, shown on every admin screen, says so. Confirmation,
   cancellation and refund mail never count against it and are never held back.

## Why

The reservation email is unverified by design, so an unpaid hold can carry
anybody's address. Before this, each hold allowed ten recovery mails a day and a
new hold after expiry opened ten more: anyone could make a dating-event sender
mail a stranger repeatedly, and spend the provider quota that carries the
confirmation QR codes.

- One mail per unpaid hold still serves the real case: a guest who closed the
  Stripe tab before paying gets one link back to finish. Once paid, the normal
  budget applies again, so a paying guest is never locked out by it.
- Ten per address per day is far above any honest need (the cooldown is two
  minutes and one link revokes the earlier ones) and bounds what one stranger
  can receive.
- 200 per day is about twice the guests of a full night all losing their link at
  once. Past it, recovery stops instead of starving confirmations. An attacker
  can still use up the ceiling with many addresses, which stops recovery for
  real guests that day: that is why it raises an alert, and why it covers
  recovery only. A guest without a link still has the support contact.
- Silent refusals keep the response identical to an unknown address, so the
  limits do not reveal whether a reservation exists.

## Rejected

- **Sending recovery only for paid reservations.** It would strand the guest
  whose payment page closed during a hold.
- **An alert by mail or push.** It needs a channel the app does not have; the
  admin banner is polled every 30 seconds on every admin screen and is where
  founders already watch undelivered reservation mail (#489).
