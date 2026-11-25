# Founder moderation actions leave an append-only history

Date: 2026-11-25 (#234)

Before this, a removal lived only in `venue_ejections`: restoring access deleted
the row, and the night's terminal transition deleted every removal of the night.
Case decisions overwrote the case row. After a night, nothing showed who was
removed, when, by which founder, or that access was given back, so a guest's
dispute could not be answered.

Decision: one table, `private.moderation_events`, written by the four commands
that remove someone, give access back or decide a report or case:
`eject_from_venue` (door screen), `restore_to_venue`, `moderate_case` (review,
remove for the night, restore) and `review_report`. Each writes its event in the
same function, so a refused or failed command leaves nothing. Founders read it
through `admin_moderation_history`, shown in the moderation view: the latest
actions across nights, and the trail of the person and night of an opened report.

Why this shape:

- **Written by the commands, not by triggers.** A trigger on `venue_ejections`
  would also fire on the terminal cleanup and on profile deletion and would have
  to guess which deletes are founder actions. The command knows the action, the
  case and the reason. A logic test scans every database function that changes a
  removal or a case and fails if one does not write the history (only the
  guest's own report and the terminal cleanup are exempt), so a new removal path
  cannot skip it silently.
- **Private schema, no API grant, append-only trigger.** No participant or
  founder session can read or write the table directly; update, delete and
  truncate raise even for the owner. A retention purge, once decided, replaces
  the trigger function to let expired rows go.
- **References only.** Founder, target profile, night, case and report ids, the
  action, the reason category and the time. No founder note (it can name people
  and stays in `venue_ejections` until the night ends), no report note, message,
  photo or preference, and never the reporter. Names and venues are read from live
  rows at read time, so a deleted profile shows as "Deleted profile".
- **No foreign keys.** A profile, venue or night deletion does not erase the
  trail. The trail of a deleted profile is a bare id.
- **Founders see "by you" or "by another founder"**, not raw ids or emails; the
  founder id stays in the table for a dispute.
- **Photo decisions stay in `public.photo_audit`** (#194). Both trails have the
  same shape (actor, action, reason, time); merging them into one view is left
  until a founder needs it.

Open, not decided here: **retention**. The register approves 12 months after
closure for reports and 12 months after resolution for photo decisions, but says
nothing explicit for removal events. The recommendation is 12 months after the
event, with the ongoing-dispute exception, and the same period after the target
deletes their account. Until a founder decides, there is no automatic expiry.
