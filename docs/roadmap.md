# Roadmap

This is Amourette's strategic map: what exists, what the current milestone must
prove, and what follows if it works. The
[Amourette project board](https://github.com/orgs/getamourette/projects/1) is the
source of truth for individual tasks and their status. Code and git history are
the source of truth for what has shipped; `AGENTS.md` holds the durable engineering
contract and `docs/decisions.md` records why durable choices were made.

## Current state (2026-09-11)

The complete web-first core loop exists:

- A QR opens a venue-specific flow with anonymous authentication and persistent
  profile creation.
- Venue nights have scheduled waiting, live, paused, cancelled, and ended states.
  Presence, likes, matches, and chat are scoped to the active venue night and
  ephemeral data is removed when it closes.
- The discovery UI shows mutually compatible people present and visible in the
  same room. Server-side enforcement and owner-only preference reads from #227
  were applied with founder approval on September 18. PR #266 carries the
  coordinated application cutover, with full E2E and Vercel preview validation.
  Older clients asking for preferences fail closed. Likes remain
  secret unless reciprocal; chat is reachable only from a mutual match.
- Transactional like authorization (#231) was applied to the shared development
  database with founder approval on September 21. The branch client uses exact-night
  candidate tokens and idempotent commands; older clients' direct like writes now
  fail closed. PR #269 carries the application cutover: all 20 hosted browser
  journeys, PostgreSQL concurrency, targeted lifecycle checks and mobile Vercel
  preview inspection passed. Founder review and merge remain required.
- Participants can pause discovery, leave and re-enter explicitly, report, and
  block. Founders have protected moderation, venue operations, scheduling, QR, and
  aggregate analytics surfaces under `/admin`.
- The public experience is localized in French, English, and Spanish. Amourette's
  current visual system is applied across the main participant surfaces.
- Shared permanent QA venues cover crowded, empty, and pre-launch waiting states.
  Preview-aware tooling supports repeatable match, message, presence, and lifecycle
  checks against the shared development database.
- Pull requests run lint, deterministic logic checks, production builds and isolated
  Chromium mobile journeys for onboarding, matching/chat and profile preview. The
  checks are required before merge; preview and physical-device inspection remain
  separate requirements for relevant UI changes.
- Optional future-night email capture, preference management, unsubscribe, Resend
  delivery, webhook suppression, and operational recovery are implemented.
- `getamourette.com` is the canonical production domain; physical venue QR codes
  always target that origin.

Human photo moderation and private replacements (#194) shipped through PR #243
on September 11. The founder-authorized migrations, private-image cutover, manual
QA, mobile/desktop preview inspection and required automated checks are complete.
The one remaining cached legacy test photo was removed with founder approval;
all 103 retained legacy public URLs then returned no image. The production
application is deployed on `getamourette.com`, and the cleanup dispatcher now
calls that origin with its production credential, without the preview bypass.
A real dispatch returned HTTP 200 and deleted an isolated expired Storage object.
The issue is closed and its board card is Done.

Input validation alignment (#77, PR #250) now has a maintained field contract,
cross-layer enforcement and boundary regressions in the existing gate. All nine
founder-authorized migrations are applied to the shared development database;
the application changes are published for review, with the full anonymous browser
suite and rendered preview inspection completed. On September 14, a missing preview
server credential was fixed by configuring one sensitive default for all Preview
branches. After redeployment, anonymous photo onboarding passed on #77 and #208.
Auth password enforcement (#196)
and the 5 MiB photo/Vercel transport gap (#249) remain explicit follow-ups.

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
