# Session handoff — #38 design-system rework (2026-07-22)

Read this first, then `docs/design.md` ("The system (v2)") and the memory
`amourette-brand-da`. This file = the session-continuity specifics the docs
don't carry.

## IMPORTANT: "locked" = the direction, NOT the final pixels

The mockups are **low-fidelity directional proofs**, not a pixel spec. Do not
reproduce them literally (they use gradient-blob placeholder photos and have no
states/motion). What is locked: composition, palette, type, the signature moves
(full-bleed chiaroscuro card; overlapping-portraits reveal; Fraunces/ink/deep
red). What the real build must ADD and will make it look markedly better:
- **Real photos** (the single biggest jump — the chiaroscuro card and the reveal
  read as flat blobs here only because the placeholder is a gradient).
- **States**: hover/focus/pressed/loading/empty; the ♥ blooming on tap; the
  reveal rising like a curtain.
- **Implementation polish**: precise spacing, responsive, accessibility, real
  motion (Expo.out easing, press scale 0.97).
- Use `frontend-design` as a QUALITY BAR and `ui-ux-pro-max` for detail sourcing
  during the build. Refining beyond the mockups is expected, not a re-litigation
  of the locked direction. If Marwane wants to adjust a detail when he sees it
  real, that is normal iteration — the direction stays.

## State: both hero screens LOCKED (direction-level)

Method used throughout: render comparable variants as self-contained HTML →
screenshot to PNG → present side by side → Marwane picks/mixes → iterate. Do not
hard-code a direction without showing options first. Marwane wants opinions, not
a survey; French casual.

**Winners (the mockups that won each round, in this folder):**
- **Room feed card** → `room-d1-gold.html`, variant **B**. Direction "Sous les
  projecteurs": full-bleed cinematic photo, person emerges from warm light on
  near-black (chiaroscuro), no card frame; first name in Fraunces italic; kicker
  with red live-dot; 2-line bio; **one champagne 1px hairline in the footer**;
  ♥ = **filled deep red present** at rest ("Tap").
- **Match reveal** → `match-reveal-r2.html`, variant **C**. Direction "Les deux
  visages" + chevauchement nu: full-red screen (radial red→red-deep→wine), two
  **overlapping** circular portraits, **no badge** between them (front one
  ringed red+champagne); "You both tapped" Fraunces italic; champagne hairline;
  cream-inverted CTAs ("Start the chat" / "See who else is here").

**Earlier rounds (history / rationale):** `room-directions.html` (V1/V2/V3 brand
directions), `room-converged.html` (A/B red discreet vs present — B won),
`room-signature.html` (D1/D2/D3 signature — D1 won), `match-reveal.html`
(R1/R2/R3 — R2 won).

**Docs are authoritative and up to date:**
- `docs/design.md` → "The system (v2 — reworked 2026-07-22)": palette (token
  names kept from 07-03, values shifted cooler/deeper — velvet `#120A0F`,
  bordeaux `#1D0F15`, red `#CC1436`, red-deep `#A51330`, wine `#7C0F24`,
  champagne `#D9B779`, blush `#E9B9BC`, cream `#EFE6E0`, taupe `#9D8A86`, ink
  `#1A0F12`); type (Fraunces/Figtree/Jost); spacing/radius/elevation/motion;
  component specs for both heroes + core components; do/don't.
- `docs/decisions.md` → entry 2026-07-22 (partially supersedes 07-03/07-04;
  heads-up for Aymane that the shipped app still shows the old Bodoni/velvet/ruby
  look until the refonte lands).

**Nothing is committed.** `git status`: `docs/design.md` + `docs/decisions.md`
modified, `docs/brand/explorations/` untracked. Branch
`feature/design-system-shadcn`. Marwane said do NOT commit/ship/merge without his
go.

## Next step — Étape 0 (foundation), NOT started

1. **shadcn init** on Tailwind 4 (skill `vercel:shadcn`).
2. **Wire v2 tokens** into `@theme` in `app/globals.css` — keep the names
   (velvet/bordeaux/red/red-deep/wine/champagne/blush/cream/taupe/ink), change
   the values to the v2 table in `design.md`.
3. **Fonts via `next/font`**: Fraunces (display, italic), Figtree (body), Jost
   (labels) — replaces Bodoni/Inter in `app/layout.tsx`.
4. **Re-measure WCAG contrasts** for the v2 values (open point: `#CC1436` is
   darker than `#D01F3C` — recheck cream-on-red ≥ 4.5:1 and red-on-velvet ≥ 3:1).

Then: refonte surface by surface (1 PR/screen), starting by translating the two
locked hero mockups into real React components. Read `node_modules/next/dist/docs/`
before routing/data code (Next 16 breaking changes).

## Open points
- **"Red present" ♥ vs "red is an event"**: validate the card's standing red
  does not dilute the full-red reveal.
- **Wordmark / logo = separate dedicated pass, after the system.** Reopens the
  07-03 Bodoni wordmark. The unused **"wax seal"** idea (mock D3) is a strong
  app-icon / emblem candidate — resurface it there.
- 21st.dev MCP: deferred, needs Marwane's API key (non-blocking).

## Tooling
- Design skills installed **user-level** (`~/.claude/skills/`, not in repo):
  `frontend-design` (Anthropic — use as a QUALITY BAR, not a direction chooser;
  its "avoid Inter / pick a bold new direction" advice conflicts with our locked
  choices), `ui-ux-pro-max` (DB + `scripts/search.py` for fonts/styles/palettes),
  `design-system`, `ui-styling`, `brand`.
- **Screenshot recipe (works in this env — the old "headless hangs" belief is
  false):**
  `~/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome --headless=new
  --no-sandbox --disable-gpu --force-device-scale-factor=2 --window-size=W,H
  --virtual-time-budget=9000 --screenshot=out.png in.html`
- **Serve mockups on LAN:** `python3 -m http.server 8099 --bind 0.0.0.0
  --directory docs/brand` → `http://192.168.1.67:8099/explorations/<file>.html`
  (Marwane views from Windows on the same wifi).
