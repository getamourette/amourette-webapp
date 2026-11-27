# Reservation reminders two days before and on the morning of the night (#558)

Date: 2026-11-25. Supersedes the "No event/deadline reminders" line of the #189
lifecycle email scope (October 17, `docs/launch-reservation-policy.md`).

**Problem.** The launch email set had no reminder: a guest who booked two weeks
ahead heard nothing until the night. The first night has 15 to 20 seats, so each
no-show is a visible gap, and a guest who cancels late gives the venue no time to
offer the seat to someone else.

**Decision.** Marwane reverses the October exclusion. Each confirmed reservation
receives two service emails, at 10:00 venue time two days before the night and
at 10:00 on the day.

**Why.**

1. **Fewer no-shows, and cancellations in time for the bar.** The two-day
   reminder lands, for an evening night, about ten hours before the
   free-cancellation deadline (48 hours before the start), so a guest whose plans
   changed can still cancel for free and the seat can go to the waitlist. The
   morning reminder catches the guest who forgot.
2. **10:00 venue time,** not a fixed offset from the start: a predictable
   morning slot, and a time no guest is asleep or already at the bar.
3. **Service message only:** practical details, the deposit rule and the
   link to the reservation, nothing promotional. It needs no marketing consent
   and no unsubscribe link, like the confirmation.
4. **Remind, never push to cancel** (Marwane, November 27). The emails are a
   reminder that the evening is on, not an invitation to drop out. Only the
   two-day reminder, while free cancellation is still possible, adds one
   discreet line saying so; the morning reminder, after the deadline, says
   nothing about cancelling. The link reads "View my reservation", not
   "Manage or cancel".
5. **Never late, never misleading.** A reservation confirmed after the reminder
   time already has its confirmation; a reminder hours late (job down) or after
   the deadline it states would mislead. So a reminder goes out only inside its
   window (at most 6 hours, never after the night starts, and for a two-day
   reminder written before the deadline, never after the deadline), and never to
   a cancelled, refunded, arrived or revoked reservation.
6. **Same pipeline, no new one.** The reminders are two new kinds in the existing
   outbox: same worker, retries, Resend idempotency key, founder alert and
   resend (#489). A `pg_cron` job queues them, as every scheduled job here runs
   in the database, not on Vercel.

**Not decided here.** A next-day survey email (#559) is a separate question: its
legal basis (service message or marketing) is open.
