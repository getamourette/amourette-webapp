# Ending a night early reuses the scheduled-end transition

**Date:** 2026-11-25 · **Issue:** #431

## Decision

1. A founder ends an opened night before `closes_at` with the new RPC
   `end_venue_night_now`, offered on the night page and on Tonight as
   **End night now**, behind a confirmation that states what is deleted and kept.
2. The RPC calls `private.transition_venue_night(night, 'ended', 'manual',
   founder)`, the same transition the minute cron runs at `closes_at`. Nothing is
   reimplemented: presence is closed, the night report is finalized, and likes,
   matches (with their messages) and removals for the night are deleted.
3. It is offered from the moment entry opens (waiting, live or paused) until the
   night is terminal. Before entry opens, cancellation remains the tool.
4. `terminal_reason` stays `scheduled_end`. The early end is recorded on the
   transition row: event `ended`, reason `manual`, the founder as actor.
5. Reservations are untouched. Arrival scanning stops because the night is
   terminal; no-show reconciliation still waits for the scheduled `closes_at`.

## Why

The issue asked for "the same effects as the scheduled end". Calling the one
transition that owns those effects guarantees it, and a test compares the two
results row for row. A new `terminal_reason` value would have meant replacing
the central transition function and widening a constraint read by the report,
the admin and the gender-erasure job, for information the audit trail already
holds. Organizer cancellation was never the right tool for a live night: it
refunds every deposit and emails "event cancelled" to guests already in the bar
(#477).

## Not decided here

- Extending a live night (later `closes_at`) is still tracked nowhere (bug review
  Z5-I4).
- The Realtime burst when every presence closes at once (Z3-M8) applies to this
  action as to the scheduled end; it is fine at launch size.
- Whether a reserved guest who arrives after an early end keeps their deposit is
  a founder decision under the existing exceptional-refund path.
