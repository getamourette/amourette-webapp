# Roadmap

Living status doc. Update it as work ships. The authoritative record of what is built is the code and git history; this is the human-readable plan and snapshot. See `AGENTS.md` for the durable contract and `docs/decisions.md` for the decision log.

## Current state (2026-06-19)

Aymane shipped a first scaffold. The Supabase wiring works (DB, Storage, Realtime), but the scaffold is a generic *signup, then global directory, then open DM* flow. It does **not** yet implement the core mechanic and violates invariants 3 (discreet double opt-in) and 1 (live). It is the technical base to build the real product on, not Phase 1 already started.

**Exists today:**
- `app/page.tsx`: onboarding (email + phone), looks up an existing profile, routes to `/dashboard` or `/profile`.
- `app/profile/page.tsx`: profile setup (name, bio, photo upload to the `profile-photos` Storage bucket). Inserts a row in `profiles`.
- `app/dashboard/page.tsx`: "Discover people", lists **all** profiles, click routes straight to chat.
- `app/chat/[id]/page.tsx`: direct messaging between two profile ids, Supabase Realtime on the `messages` table.
- `lib/supabase.ts`: single browser client (publishable/anon key).

**Known gaps and debt (addressed during Phase 1):**
- No QR check-in, no venue, no live presence. The dashboard shows the whole user table, not "who is checked in here tonight".
- No discreet like, no mutual-match gate. Anyone can DM anyone. This is the invariant-3 violation to fix first.
- No safety layer: no report/block, no 18+ gate, no visibility control.
- No auth and likely no RLS: the client key inserts directly into tables, and `select("*")` exposes every profile's email and phone. Lock this down before any real test with strangers.
- Numeric auto-increment profile ids passed in URLs; consider non-enumerable ids.

## Phase 1: prove the spark

Goal: prove people actually like and match when in the same room, at one recurring venue per city (Paris and New York), web-first. Build order: Bloc 0, then 2, then 1, then 3, then 4.

- **Bloc 0, Foundations** (in progress): real data model (venues, presence, likes, matches, reworked messages), RLS + auth, local env running.
  - **Auth:** Supabase anonymous sign-in — scanning the QR auto-creates a real `auth.users` session (UUID + JWT), zero friction, no signup wall. This gives `auth.uid()` so RLS is enforceable from day one. Optional later upgrade (add email/phone to the same anon user) keeps the UUID and makes the profile cross-device recoverable.
  - **Identity model:** persistent profile, ephemeral everything else. The profile persists (first name + photo required, bio optional). Presence and the match/chat are ephemeral and die with the night — the ephemeral match is the forcing function to talk IRL. We never let users "retrieve" past matches.
  - **Privacy:** other users only ever see first name + photo + bio. Email (optional, collected after onboarding to notify about the next live night) is PII — never exposed via RLS, never `select("*")`. Settle Supabase region (EU vs US) and the RGPD stance with Aymane before any public test.
  - **Matching filter:** `profiles` carries `gender` and `interested_in` (set of `woman`/`man`/`nonbinary`) — `interested_in` can't filter without the other person's `gender`, so both ship in the foundations schema.
  - See `docs/decisions.md` (2026-06-19) for the full rationale.
  - **Carry-overs to wire later (don't forget):**
    - *Tighten `profiles` SELECT in Bloc 1:* it is currently readable by any authenticated session so Bloc 2 (like/match) can be built before presence exists. Once presence lands, restrict SELECT to co-present users at the same venue (live invariant). PII stays locked in `profile_private` regardless.
    - *Add expiry/cleanup in Bloc 1/3:* `matches` and `presence` have no TTL yet. `matches` is unique per `(profile_a, profile_b, venue)` so it persists across nights at the same venue. The "match dies with the night" behaviour needs a cleanup job (cron) on stale `left_at`/`last_seen_at` and on old matches.
- **Bloc 1, QR check-in and live presence**: `/v/[venueSlug]` route, dashboard scoped to who is checked in here now, presence that fades on leave/timeout.
- **Bloc 2, Discreet like and match** (the core hypothesis): secret like (zero notification), reciprocal detection creates a match.
- **Bloc 3, Chat gated by match**: chat opens only between matched profiles, remove open DM, ephemeral in v1.
- **Bloc 4, Safety / women first**: one-tap report and block, 18+ gate, go invisible.
- **Bloc 5, First scrappy test**: deploy (Vercel), generate a venue QR, test on a real night even among friends.

This file is the shared, founder-visible plan. Each founder tracks their own granular tasks in their own tool.

## Later phases (summary)

Full detail in the Google Doc. Phase 2: retention and hardening (persistent accounts, push, photo verification, moderation, GDPR; native app likely starts here). Phase 3: replication and venue side (3 to 5 venues per city, venue dashboard, self-serve QR, discovery map, first venue subscriptions). Phase 4: monetization and scale (consumer premium, full discovery map, events, more cities).
