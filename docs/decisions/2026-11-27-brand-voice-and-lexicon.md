# Establish participant-facing voice and lexicon guide

Date: 2026-11-27

Added `docs/voice.md` and referenced it from `AGENTS.md` (#601) so every agent
touching landing copy, UI strings, emails or notifications in `amourette-webapp`
uses the same founder-approved French vocabulary and tone as the marketing
repository (`getamourette/amourette-marketing`, `brand/voice.md`).

Key rules recorded in `docs/voice.md`:
- Call Amourette « une soirée » rather than an app or concept in participant copy.
- Pair discreet reciprocity with Women-first comfort (no messages without a
  mutual like).
- Use natural spoken French with no em dashes (`U+2014`) and avoid *célibataires*,
  *app*/*appli* for Amourette, *via*, *liker en douce*, *sans te griller*,
  *dans la salle*, *osez*/*le premier pas*, *tout s'efface* in writing (the
  profile persists while likes and messages disappear at closing) and hollow
  marketing buzzwords.
- Keep the approved four-section French landing copy ready for `getamourette.com`.

*Why:* keeping participant wording rules beside `AGENTS.md` prevents UI and
landing copy from drifting into generic dating-app wording or violating product
invariants, while keeping private street-recruitment and social-media operations
outside this public repository.
