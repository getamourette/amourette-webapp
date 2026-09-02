# Roadmap

This is Amourette's strategic map: what exists, what the current milestone must
prove, and what follows if it works. The
[Amourette project board](https://github.com/orgs/getamourette/projects/1) is the
source of truth for individual tasks and their status. Code and git history are
the source of truth for what has shipped; `AGENTS.md` holds the durable engineering
contract and `docs/decisions.md` records why durable choices were made.

## Current state (2026-09-02)

The complete web-first core loop exists:

- A QR opens a venue-specific flow with anonymous authentication and persistent
  profile creation.
- Venue nights have scheduled waiting, live, paused, cancelled, and ended states.
  Presence, likes, matches, and chat are scoped to the active venue night and
  ephemeral data is removed when it closes.
- Participants see only mutually compatible people who are present and visible in
  the same room. Likes remain secret unless reciprocal; chat is reachable only from
  a mutual match.
- Participants can pause discovery, leave and re-enter explicitly, report, and
  block. Founders have protected moderation, venue operations, scheduling, QR, and
  aggregate analytics surfaces under `/admin`.
- The public experience is localized in French, English, and Spanish. Amourette's
  current visual system is applied across the main participant surfaces.
- Shared permanent QA venues cover crowded, empty, and pre-launch waiting states.
  Preview-aware tooling supports repeatable match, message, presence, and lifecycle
  checks against the shared development database.
- Optional future-night email capture, preference management, unsubscribe, Resend
  delivery, webhook suppression, and operational recovery are implemented.
- `getamourette.com` is the canonical production domain; physical venue QR codes
  always target that origin.

The product has moved beyond its original implementation blocs. The remaining work
is no longer “build basic matching”; it is to make the whole launch system safe,
coherent, testable, and capable of producing enough simultaneous attendance to
validate the in-person behavior.

## Current milestone: prove the spark at one concentrated venue night

The first meaningful validation is a deliberately concentrated night at one partner
venue, with enough compatible people present at the same time. The goal is to learn
whether discreet mutual interest reliably leads to a real conversation in the room.
Total registrations, downloads, and long chat threads are not substitutes for that
signal.

Before inviting the public, four launch tracks must converge:

1. **Participant experience.** Finish the remaining onboarding, room, match, chat,
   realtime, accessibility, and mobile-browser hardening required for a calm flow
   from QR scan to in-person contact.
2. **Safety and trust.** Complete launch moderation operations, photo handling,
   founder authentication hardening, privacy/legal work, and an exhaustive security
   and mobile QA pass.
3. **Venue and event operations.** Secure the first venue and audience, define the
   launch-night operating plan, and rehearse venue scheduling, permanent QR entry,
   attendance monitoring, support, moderation, and incident recovery.
4. **Attendance commitment.** If the refundable-deposit launch model proceeds,
   complete the legal/operator decision and build reservation, Stripe Checkout,
   individual entry QR, founder check-in, refund, notification, and reconciliation
   flows before enabling real payments.

The board owns the concrete tasks within these tracks. A task appearing here would
quickly become stale; a strategic constraint or durable product choice belongs in
`docs/decisions.md` instead.

## Validation and the next decision

The launch should measure the funnel for one venue night: invited or registered,
arrived, entered the room, completed a profile, viewed people, liked, matched,
started a chat, and made real-life contact. Qualitative feedback, safety incidents,
gender and preference balance, no-shows, and venue operations matter alongside the
conversion counts.

After the night, decide from evidence whether to:

- repeat the same format and improve density or balance;
- change a specific part of the core loop;
- pause expansion until a safety or trust problem is resolved; or
- begin the replication and retention work below.

## After the core loop is validated

### Retention and identity

Decide when device-bound anonymous profiles become recoverable accounts and how a
future native app inherits identity. Add retention mechanisms only when they bring
people back to another real venue night without turning Amourette into an async
dating inbox. PWA installation and Web Push remain deferred for V1.

### Venue replication

Move from founder-operated pilots to repeatable venue operations: several venues per
city, clearer partner reporting, self-serve configuration where justified, reliable
night scheduling, reusable QR assets, and a playbook that preserves simultaneous
density rather than spreading the audience too thin.

### Native product and monetization

Start native iOS/Android planning only when repeated web nights show that the live,
in-person loop deserves deeper investment. Venue subscriptions, consumer premium,
event economics, and broader discovery are later hypotheses; none may weaken live
presence, discreet double opt-in, ephemerality, or women's control.
