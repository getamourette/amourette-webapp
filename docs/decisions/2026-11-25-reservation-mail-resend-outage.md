# Reservation emails survive a broken Resend setup; founders see and resend the rest (#489)

Date: 2026-11-25 (#489, review finding Z1-I3). Scope before the first night only;
the other items of #489 (Z1-M3, Z1-M11, Z4-M2, Z4-M3) stay open.

**Problem.** Any Resend 4xx other than 409 and 429 marked a reservation email
`unknown`, a final state. A revoked API key (401) or an unverified sending domain
(403) therefore lost every confirmation with QR, cancellation and refund email
while guests kept paying, and no admin screen showed it.

**Decision.**

1. **401 and 403 are retried like 429 and 5xx** (`launchMailFailureState` in
   `lib/email-transport-policy.ts`). Why: they are configuration faults, not the
   guest's, and the same request succeeds once a founder fixes the key or domain.
   Other 4xx (422 invalid payload) would fail identically: they still stop.
2. **Cadence and cap are the existing outbox rules, unchanged:** one retry every
   2 minutes, stopped (`unknown`) 23 hours after the first attempt. Why: once the
   setup is fixed, waiting mails leave within 2 minutes with no per-email action;
   the 23-hour cap keeps every automatic retry inside Resend's 24-hour
   idempotency window, so an automatic retry can never send a second copy. No
   attempt-count cap: the time cap is what bounds the duplicate risk.
3. **Founders see the problem on every admin screen**, in the shell slot of the
   report alert (#503): "N reservation emails not delivered", with first name,
   email kind, venue and night, never an address. Retrying mails say so; a
   stopped one has a Resend button. Only mails a send could still deliver are
   listed (the worker's own eligibility rule), the oldest 50 with the exact total.
   A poll every 30 seconds, no sound:
   unlike a report, nobody is at risk in the room.
4. **A resend requeues the same outbox row** (`admin_resend_launch_mail`): same
   `launch-access/<id>` idempotency key, same frozen body and link, new 23-hour
   window. Why: if Resend accepted the first request within 24 hours, it answers
   with that message instead of sending another. Past 24 hours a stopped mail that
   was ambiguous (timeouts rather than refusals) could in theory arrive twice; that
   is why a stopped mail is never resent automatically, only by a founder tap.
