---
name: qa
description: Prepare and guide repeatable QA on Amourette's shared permanent test venues. Use when the user says /qa, test this branch, prepare QA, generate a preview QR, reset test venues, prepare a match, test messages or presence, or asks which QA room to use. Discovers the real Vercel preview, verifies shared Supabase fixtures, detects the current preview's anonymous tester, and provides a focused smoke checklist. Never merges, ships, applies migrations, or silently resets shared data. Works the same under Claude Code and Codex.
---

# QA

Use the repo CLI for deterministic operations; do not reproduce its database logic with
ad-hoc SQL. The Supabase development database and all three QA venues are shared between
both founders.

## Start safely

Run `npm run qa -- status --venue auto` unless the user explicitly selected `crowded`,
`empty`, or `waiting`. Report:

- the suggested venue and reason from the branch diff;
- the stable deployed Vercel branch URL, or that the current commit has no ready preview yet;
- fixture health for all three rooms.

An explicit venue always overrides the suggestion. If a fixture is unhealthy, stop the
scenario and offer the guarded reset; never repair or reset it silently.

## Permanent fixture contract

- `test-crowded`: one live year-9999 night and exactly 36 active synthetic profiles.
- `test-empty`: one live year-9999 night and no synthetic profiles. Human testers may be
  present; each still sees no other profiles.
- `test-waiting`: one waiting year-9999 night, unreachable launch threshold, and no
  synthetic profiles. Human waiting participants are expected.
- Every target must be marked `is_test_venue`. Never act on another venue.

## Reset only with explicit consent

Explain that reset removes presence, likes, matches, and messages in all three shared QA
rooms for both founders. Only after the user explicitly confirms, run:

`npm run qa -- reset --confirm-shared-reset`

The command restores a clean baseline without assuming a stable tester UUID. Never use
`seed:test-venues clear` as a substitute.

## Prepare interactive scenarios

For a reciprocal match, run
`npm run qa -- prepare-match --confirm-shared-write`. Keep the command running while the
founder scans the printed `test-crowded` QR and finishes onboarding. It snapshots current
humans, excludes seeded accounts, and accepts exactly one new arrival. If detection is
ambiguous, stop; use `--tester-profile-id <UUID>` only when the founder identifies it.
The command chooses an already-compatible synthetic profile, removes only that tester/fixture
pair, and prepares `fixture → tester`; the founder must like the named fixture in the UI so
the real double-opt-in path creates the match.

For the four-match stack, pass `--count 4`. Start with the default count of one and complete
the one-match geometry check first; the command names every compatible fixture, and the founder
must still like each one in the UI to create the matches through the real double-opt-in path.

After the founder confirms the match exists, simulate one incoming message from that fixture with
`npm run qa -- reply --confirm-shared-write`. Add `--tester-profile-id <UUID>` when more
than one human is active. If that tester has multiple synthetic matches, target the conversation
with `--match-id <UUID>` or `--partner-name <name>`; ambiguous replies are refused. Never insert
a message without exactly one targeted synthetic/tester match.

For Realtime presence, run
`npm run qa -- presence --action leave --confirm-shared-write`, ask the founder to observe
the UI without refreshing, then always restore Ariel with
`npm run qa -- presence --action join --confirm-shared-write`.

## Guide the smoke test

Keep the checklist concise and adapt it to the diff:

- Crowded: vertical scroll/snap, profile actions, discreet like, fixture match reveal, chat
  send, synthetic incoming reply, unread/realtime behavior.
- Empty: live room opens, no candidates are shown, waiting/filling copy and profile CTA
  remain usable.
- Waiting: no participant identities leak, aggregate count is correct, refresh/foreground
  recovery works, and the page remains waiting.
- Presence: Ariel leave/join updates without refresh and the join step restores baseline.
- Admin start/stop: only when explicitly requested; temporarily close, verify pause, reopen,
  verify fresh check-in, and restore the expected permanent state. Never cancel a QA night.

Finish with `npm run qa -- status --venue <selected>` and report any drift. Do not ship,
merge, apply a schema migration, or change board status.
