# Roadmap

Living status doc. Update it as work ships. The authoritative record of what is built is the code and git history; this is the human-readable plan and snapshot. See `AGENTS.md` for the durable contract and `docs/decisions.md` for the decision log.

## Current state (2026-06-19)

Bloc 0 (foundations), Bloc 2 (discreet like/match) and Bloc 1 (QR check-in + live presence) are shipped. Aymane's original scaffold (generic *signup → global directory → open DM*, violating invariants 3 and 1) has been replaced: the data model, RLS, auth-backed identity, the core like/match mechanic and now real venue presence exist. Anonymous sign-in is enabled on the project. Chat (Bloc 3) is the next mechanic; the first test on a real night (with a real venue and people) is Bloc 5.

**Verified:** a 20-check API smoke test confirmed the like/match invariants at the database (a like is invisible to its target, a match appears only on reciprocity and only to its two members, messages are gated by a match, email/phone never leak). The Bloc 1 night-rollover boundary math (06:00 local, including after-midnight check-ins) is verified by a SQL test, and the app type-checks and builds. **Not yet exercised through the browser UI on a phone** — that is the Bloc 5 scrappy test.

**Exists today:**
- `app/page.tsx`: landing — ensures an anonymous session, routes to `/profile` (no profile yet) or to the dev default venue room.
- `app/profile/page.tsx`: profile setup (first name, optional bio, gender + interested_in, photo upload to the `profile-photos` Storage bucket). Inserts a row in `profiles`.
- `app/v/[venueSlug]/page.tsx`: the live room. Scanning checks you in (`check_in` RPC), the grid shows only mutually-compatible people **checked in here now**, discreet like, realtime match reveal, realtime presence (room fills/empties live), explicit "leave" + re-join.
- `lib/strings.ts`: FR/EN UI dictionary; locale from the venue city (Paris → fr, NYC → en) inside a room, browser language on pre-venue pages.
- `lib/auth.ts` (anon session bootstrap), `lib/profile.ts` (gender vocabulary + compatibility), `lib/supabase.ts` (typed browser client).
- DB: `presence` is live; `check_in()` RPC; `profiles`/`presence` SELECT scoped to co-present (+ matched) users; `private.*` RLS helpers; `bartap-close-ended-nights` pg_cron job closing the room at 06:00 local.

**Known gaps and debt (addressed during Phase 1):**
- No chat yet. A match reveals "go say hi" with no messaging — Bloc 3 opens chat gated by the match.
- No safety layer beyond the explicit "leave": no report/block, no 18+ gate, no go-invisible toggle — Bloc 4.
- `matches` have no TTL yet (presence does, via the rollover cron). The "match dies with the night" cleanup lands with Bloc 3 (ephemeral chat).
- Real QR generation and a real venue are Bloc 5; the room is reachable today via the seeded `paris-test` / `nyc-test` slugs and the dev default redirect.

## Phase 1: prove the spark

Goal: prove people actually like and match when in the same room, at one recurring venue per city (Paris and New York), web-first. Build order: Bloc 0, then 2, then 1, then 3, then 4.

- **Bloc 0, Foundations** (done): real data model (venues, presence, likes, matches, reworked messages), RLS + auth, local env running. Migrations in `supabase/migrations/`, dev seed (`paris-test`, `nyc-test` venues) in `supabase/seed.sql`, generated types in `lib/database.types.ts`.
  - **Auth:** Supabase anonymous sign-in — scanning the QR auto-creates a real `auth.users` session (UUID + JWT), zero friction, no signup wall. This gives `auth.uid()` so RLS is enforceable from day one. Optional later upgrade (add email/phone to the same anon user) keeps the UUID and makes the profile cross-device recoverable.
  - **Identity model:** persistent profile, ephemeral everything else. The profile persists (first name + photo required, bio optional). Presence and the match/chat are ephemeral and die with the night — the ephemeral match is the forcing function to talk IRL. We never let users "retrieve" past matches.
  - **Privacy:** other users only ever see first name + photo + bio. Email (optional, collected after onboarding to notify about the next live night) is PII — never exposed via RLS, never `select("*")`. Settle Supabase region (EU vs US) and the RGPD stance with Aymane before any public test.
  - **Matching filter:** `profiles` carries `gender` and `interested_in` (set of `woman`/`man`/`nonbinary`) — `interested_in` can't filter without the other person's `gender`, so both ship in the foundations schema.
  - See `docs/decisions.md` (2026-06-19) for the full rationale.
  - **Carry-overs to wire later (don't forget):**
    - *Tighten `profiles` SELECT in Bloc 1:* **done** — `profiles` (and `presence`) SELECT is now scoped to co-present (+ matched) users via `private.visible_profile_ids()` / `private.my_active_venue_ids()`. PII stays locked in `profile_private` regardless.
    - *Add expiry/cleanup in Bloc 1/3:* **presence done** (the `bartap-close-ended-nights` cron closes presence at 06:00 local). `matches` still have no TTL — `matches` is unique per `(profile_a, profile_b, venue)` so it persists across nights at the same venue; the "match dies with the night" cleanup lands with Bloc 3 (ephemeral chat).
- **Bloc 1, QR check-in and live presence** (done): `/v/[venueSlug]` checks you in on entry (`check_in` RPC), the room is scoped to who is checked in here now, presence is a night-session that fades on explicit leave or the 06:00-local rollover cron (no short heartbeat timeout — see `docs/decisions.md`). UI strings centralized into a FR/EN dictionary (`lib/strings.ts`), locale from `venues.city` (Paris → fr, NYC → en) with browser-language fallback on pre-venue pages. Real QR-code generation for a physical venue is deferred to Bloc 5.
- **Bloc 2, Discreet like and match** (done, verified by API smoke test): secret like (zero notification), reciprocal detection creates a match. Anonymous-auth bootstrap (`lib/auth.ts`), profile onboarding rewritten on the new schema, and the room at `/v/[venueSlug]` (compatible-profiles grid, discreet like, realtime match reveal). Chat is deliberately deferred to Bloc 3 — a match currently reveals "go say hi" with no messaging. Built before Bloc 1, so it uses a seeded stand-in venue (`DEV_DEFAULT_VENUE_SLUG` in `lib/config.ts`) instead of real QR check-in.
- **Bloc 3, Chat gated by match**: chat opens only between matched profiles, remove open DM, ephemeral in v1.
- **Bloc 4, Safety / women first**: one-tap report and block, 18+ gate, go invisible.
- **Bloc 5, First scrappy test**: deploy (Vercel), generate a venue QR, test on a real night even among friends.

This file is the shared, founder-visible plan. Each founder tracks their own granular tasks in their own tool.

## Later phases (summary)

Full detail in the Google Doc. Phase 2: retention and hardening (persistent accounts, push, photo verification, moderation, GDPR; native app likely starts here). Phase 3: replication and venue side (3 to 5 venues per city, venue dashboard, self-serve QR, discovery map, first venue subscriptions). Phase 4: monetization and scale (consumer premium, full discovery map, events, more cities).
