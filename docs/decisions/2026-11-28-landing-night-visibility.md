# A founder can hide a night from the landing page

**Decision (2026-11-28, escaped defect after #603):** every launch night has a
founder setting "shown on the landing page", on by default and editable in the
admin night overview at any time, including after its bookings open.
`launch_next_booking_event()` skips hidden nights. A hidden night keeps its own
page, reachable by its link, and its reservations.

**Why:** right after #603 shipped, `getamourette.com` offered a Stripe rehearsal
night instead of the real launch night, because the rehearsal starts sooner and the
function picks the earliest upcoming night. The rehearsal night carries a real
reservation and must not be cancelled or edited.

**Alternatives rejected:**

- **Filter on `venues.is_test_venue`:** the rehearsal runs on a real venue setup to
  test real payments, and a founder may need to hide a real night too (a private
  night, a night being reorganised). A flag on the venue is the wrong grain.
- **A column on `private.launch_events`:** the event guard trigger freezes most
  fields once registration opens; a separate hide-list table
  (`private.launch_landing_hidden`, a row means hidden) avoids touching that
  logic and keeps the default "shown" without a backfill.
- **A hardcoded night id or venue name:** forbidden; the landing reads the data.

**Lesson recorded:** the next-night test now covers "a test night exists before
the real one" (`scripts/test-launch-next-event.mjs`).
