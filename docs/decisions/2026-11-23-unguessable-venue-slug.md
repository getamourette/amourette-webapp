# Venue slug unguessable, venue id out of the public event (#472)

Date: 2026-11-23 (#472, bug review finding Z6-I1). Amends the premise of the
2026-11-16 decision "Pilot check-in: close venue listing, accept remote
check-in (SEC-001)" in `docs/decisions.md`; the acceptance itself stands.

**What was wrong.** That decision accepted remote check-in for the supervised
pilot because "the slug is only handed out at the venue", and said it must be
revisited if a venue id became visible to non-visitors. Both were false: the
public event endpoint (`GET /api/launch/checkout?night=`) returned the venue id
to anyone, and `createVenueSlug` built the slug from the venue name alone, which
is public as soon as the night is announced. Either path let someone at home
check in, see and like the guests who are present, and count toward the launch
threshold.

**Decision.**

1. **The slug is `<readable stem>-<16 random base32 characters>`** (80 bits).
   The stem only helps founders recognise the URL; the suffix is the secret.
   Existing venues keep their slug; a venue created before this rule gets a
   random one through the one-off statement in `docs/production-cutover.md`
   before its QR is printed.
2. **The public event no longer carries the venue id.** Shipped in two pull
   requests, client first: the guest page stops requiring `venue_id`, then a
   migration removes it from `launch_event_availability`. Why two: the current
   client refuses an event without `venue_id`, and the migrate-and-deploy
   workflow migrates the database before the code, so one pull request would
   break the booking page between the two steps.

Both are needed: a random slug changes nothing while the endpoint returns the
id, and removing the id changes nothing while the slug can be guessed.

**What remains possible, accepted for the supervised pilot.** Whoever has the
slug, because they scanned the QR on site or a guest sent it to them, can still
check in from anywhere, on the same night after leaving or on a later night at
the same venue. The founders in the room remain the control that night. The
real fix is proof of presence at check-in (#395, signed or rotating QR), still
required before any night the founders do not attend. The slug and the QR image
are never posted publicly.
