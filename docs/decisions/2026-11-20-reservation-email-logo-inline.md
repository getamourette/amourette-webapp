# Reservation emails carry the real logo as an inline attachment

Date: 2026-11-20 (#406)

**Decision.** Reservation emails show the cream horizontal signature (emblem and
lettering) instead of the word "Amourette" typed in italic Georgia. The image
travels inside each email as an inline CID attachment, the same mechanism as the
arrival QR, from a constant in `lib/launch-mail-logo.ts`.

**Why.** Marwane noticed during the #406 review that the header was not the
logo. Two ways to ship an image were compared. A PNG hosted on
`getamourette.com` keeps emails lighter and shows no attachment, but it only
appears once the change is deployed to production, never on protected Vercel
previews where rehearsals run, and it depends on the mail client loading remote
images. The inline attachment shows everywhere immediately and adds no remote
request to credential mail. Marwane chose the more reliable option even though
it changes how the mail body is built.

**Cost accepted.** About 12 KB per email, and some clients show a paperclip on
emails that previously had no attachment (recovery, cancellation, refund).
The logo is part of the sealed, immutable provider body, so each mail row also
stores about 16 KB more until its 30-day retention; negligible at tens of
emails per evening, to revisit if volume grows.
The welcome email uses another delivery path and keeps its text signature for now.
