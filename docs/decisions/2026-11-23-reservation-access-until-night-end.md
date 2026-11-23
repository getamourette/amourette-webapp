# Reservation access lasts until the night is over; the confirmation link no longer revokes the paying tab

Date: 2026-11-23 (#476)

- **Management access and every email link (confirmation, corrected summary,
  recovery) last until 24 hours after the reserved night closes, and at least
  24 hours from issue.** It replaces seven days for the access and the
  confirmation link and one day for recovery links. Why: reservations open more
  than seven days before the first night, so a guest who booked early arrived
  with a dead link and could miss the free-cancellation deadline. The night's
  end bounds how long a forwarded link stays useful, which a fixed duration did
  not. The 24 hours after closing leave the next day to read a refund or an
  outcome; the floor keeps a link requested after the night usable for a day, as
  recovery links were. The lifetime is computed when the access or the link is
  issued; a night later moved by more than a day leaves earlier links dead, and
  "Find my reservation" issues fresh ones.
- **Opening a confirmation or corrected-summary link hands out the access that
  already exists instead of replacing it.** Why: the replacement revoked the tab
  that paid as soon as the link was opened in a mail app's browser, on a
  desktop, or by a scanner that runs scripts, and that tab then offered
  "Continue payment" on a paid reservation. Keeping it alive gives a third party
  nothing: whoever holds the link gets the same access either way.
- **A recovery link still replaces the access when opened.** Why: it remains the
  guest's one way to cut off every earlier link and tab, for example after
  forwarding the email by mistake, and #405's "replaced by a newer link" answer
  relies on it. The cost: opening a recovery link on one device ends the access
  of the others, which then send the guest back to the latest email.
- **A tab whose access is refused says to reopen the link from the email (whose
  attached QR works at the door) and offers no payment to resume.** A link that
  is itself refused keeps the generic wording, which points to "Find my
  reservation".
- **The browser envelope and tab storage keep only an outer 365-day bound;** the
  database expiry decides.
- **Migration `20261123000476_launch_access_until_night_end.sql`** (behaviour:
  four functions replaced with the same arguments, one helper added, existing
  rows updated) extends still-valid access and links to the new rule, never
  shortens one, and keeps each link bound to the access it names. It is applied
  to development, then production, only with Marwane's approval, in the same
  release as the application code. Between the two, the previous code refuses a
  confirmation link only for a booking made more than seven days earlier, so
  the order is harmless before 28 November, seven days after the first real
  payment.
