# Founders remove a participant for tonight from the Tonight screen

Date: 2026-11-24 (#482)

`eject_from_venue` existed but had no caller since the old admin UI was removed
(#149). A founder who saw a problem at the door could only remove someone after a
guest filed a report, and reporting from the founder's own phone usually failed
because the room only shows compatible profiles.

Decision: Tonight, the door screen, gets a "Remove someone" section. It lists
everyone checked in tonight (`admin_photo_queue(p_night)`, already restricted to
founders), with a first-name search and each person's photo, and marks people
already removed (`venue_ejections`, founder read policy). "Remove" opens a
confirmation with the photo, a reason and an optional note, then calls the
existing `eject_from_venue`. No migration.

Why this shape: it reuses audited server paths. The ejection row records who
removed whom, why and for which night; the presence closes immediately and
check-in refuses that person for the rest of the night; the night's terminal
transition deletes the ejection with the night's other interactions, as the
lifecycle rules require. The list loads only when opened or refreshed by hand,
so no background repaint moves a row under a tap at the door.

Known limit: the removal is tied to the profile. Someone removed can come back
the same night with a new anonymous profile (finding Z3-I12). The runbook stays:
walk the person out, then watch tonight's photo queue.

`eject_from_venue` acts on the venue's current night and takes no night argument.
Right before calling it, the dialog checks that the venue's current night is still
the one shown and refuses otherwise. A night replaced in the few milliseconds
between that check and the command is not covered; a night-scoped server command
would close it but needs a migration, which is not worth it before the first night
since nights at one venue are not back to back.
