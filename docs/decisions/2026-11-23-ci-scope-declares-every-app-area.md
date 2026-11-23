# CI scope: every app area is declared, and a new one cannot be forgotten

Date: 2026-11-23 (#414)

- **Launch reservations and the founder console get their own browser selection**:
  the admin, moderation, security, reservation and reservation API suites, plus the
  room identity spec. Why: these areas were unmapped, so any change ran the full
  suite, and `app/admin` selected the participant profile and chat suites without
  ever selecting `tests/admin`.
- **The review screens of the console keep the photo selection** (they share their
  components with the participant side) and add the review layout spec.
- **Room code adds `tests/room`; legal, terms and privacy pages run their two specs.**
- **A changed logic test (`scripts/test-*`) adds no browser suite.** Why: it runs in
  the checks job and is imported only by other logic tests. Replayed on the last 60
  merged pull requests, the area mapping alone moved none from full to targeted,
  because reservation and admin changes travel with a logic test; with this rule
  three do. Shared database helpers under `scripts/` still run everything.
- **`npm run test:ci-plan` fails on an undeclared area under `app/` or `app/api/`.**
  An area is either mapped in `suitesFor` or listed in `fullSuiteAreas` (full suite
  on purpose: layout, global styles, logo, language selector, icons).
- **Left on the full suite on purpose:** SQL, database types, dependencies, test
  helpers, CI, auth and presence helpers, reservation email templates, and helpers
  shared beyond one area (`lib/admin-venue-workspace.ts` is used by the proxy,
  `lib/admin-password-recovery.ts` by the Supabase client).
