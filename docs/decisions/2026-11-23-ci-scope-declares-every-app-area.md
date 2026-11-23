# CI scope: every app area is declared, and a new one cannot be forgotten

Date: 2026-11-23 (#414)

- **Launch reservations and the founder console get their own browser selection**:
  the admin, moderation, security, reservation and reservation API suites, plus the
  room identity spec and the three profile specs that end in the console. Why: these areas were unmapped, so any change ran the full
  suite, and `app/admin` selected the participant profile and chat suites without
  ever selecting `tests/admin`.
- **The review screens of the console keep the photo selection** (they share their
  components with the participant side) and add the review layout spec.
- **Room code adds `tests/room`; legal, terms and privacy pages run their two specs.**
  Reservation terms and `lib/booking-privacy.ts` run both the reservation selection
  and the legal specs, because the privacy page links to the reservation section.
- **A changed logic test (`scripts/test-*`) adds no browser suite.** Why: it is
  imported only by other logic tests; no browser spec executes it. Replayed on the last 60
  merged pull requests, the area mapping alone moved none from full to targeted,
  because reservation and admin changes travel with a logic test; with this rule
  three do. Shared database helpers under `scripts/` still run everything.
- **`npm run test:ci-plan` fails on an undeclared file under `app/`.** It
  lists every file, so route groups and nested folders cannot hide one. An area is either mapped in `suitesFor` or listed in `fullSuiteAreas` (full suite
  on purpose: layout, global styles, logo, language selector, icons).
- **A targeted selection gets one runner per 12 spec files, at most four.** Why: the
  console and reservation selection is 245 of the 410 browser tests; on the single
  runner targeted selections used before, it would finish after the full suite on
  its four runners. It now takes three runners instead of four.
- **Older review and correction helpers stay undeclared.** Their honest selection is
  47 of the 63 spec files (profile, chat, room, moderation), which needs the same
  four runners as the full suite, so declaring them would save nothing.
- **Left on the full suite on purpose:** SQL, database types, dependencies, test
  helpers, CI, auth and presence helpers, reservation email templates, and helpers
  shared beyond one area (`lib/admin-venue-workspace.ts` is used by the proxy,
  `lib/admin-password-recovery.ts` by the Supabase client).
