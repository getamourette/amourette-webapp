# Design & Brand — Amourette

Living design reference. Updated as the visual identity is decided. Pairs with
`docs/decisions.md` (the *why* of each choice) and `docs/brand/board.html` (the
visual board).

> Status: **Design-system rework (#38, 2026-07-22).** The 2026-07-03 DA ("Rouge
> Signature": Bodoni / warm velvet / ruby `#D01F3C`) was a one-shot generation,
> not a considered system, so it was pressure-tested against real product
> screens and reworked. **Both hero screens are locked** (room feed card + match
> reveal) and the reworked **v2 system** is written below ("The system (v2)").
> Still open: the WCAG re-measure at token-wiring time, the "red present" ♥
> tension, and the wordmark/logo pass. The brand *name* (Amourette) is unaffected.

## Design-system rework (in progress — #38, since 2026-07-22)

Rebuilding the visual language from the locked-but-thin 07-03 DA into a real
design *system*, screen by screen, by rendering comparable variants on the real
product surface and choosing (mockups live in `docs/brand/explorations/`).
Marwane's call: **pressure-test the brand** — the 07-03 palette and fonts are
provisional; **dark stays** (anchored to the product: a bar at night, not a
graphic taste). Both hero screens are now locked (room feed card + match
reveal); the definitive token system is codified in **The system (v2)** below.

### Hero screen #1 — room feed card (LOCKED 2026-07-22)

Direction "Sous les projecteurs" + champagne footer (mock variant D1 + B):

- **Composition:** full-bleed cinematic photo; the person emerges from a warm
  light on near-black (chiaroscuro). No card frame, minimal chrome. This is
  "the night is the set" taken literally.
- **Bottom content over a velvet-ink scrim:** kicker (red live-dot + "in the
  room · N here"), first name in **Fraunces italic** (~48px), 2-line bio, a
  single **champagne 1px hairline**, then the action row (♥ + count).
- **The ♥ is filled deep red at rest** ("red present" — Marwane's pick over the
  discreet taupe outline). See open point below.

### Emerging system choices (provisional until the token rewrite)

- **Palette shifts cooler and deeper** vs 07-03: ground velvet `#150E10` → ink
  `#120A0F`; surface bordeaux `#231317` → `#1D0F15`; signature ruby `#D01F3C` →
  deep `#CC1436`; cream `#F4EBE1` → `#EFE6E0`; taupe `#A98F86` → ~`#9D8A86`.
  Champagne `#D9B779` unchanged (still hairline-only). Photo lit with a cool
  rose key light.
- **Type system changes:** display/wordmark Bodoni Moda → **Fraunces** (italic
  for names and the wordmark); body Inter → **Figtree**; labels stay **Jost**
  (uppercase, tracked).

### Open points (settle at the reveal / token step)

- **"Red present" ♥ vs "red is an event".** A permanent red heart on every card
  softens the 07-03 rule that red is rare (reserved for like + match). Must be
  validated when the match reveal (the full-red screen) is designed, so the
  card's standing red does not dilute the reveal's red.
- **Wordmark / logo** is a separate dedicated pass, after the system settles. It
  reopens the 07-03 Bodoni wordmark. The unused "wax seal" idea (mock variant
  D3) is a strong app-icon / emblem candidate to resurface there.

---

## Brand name — Amourette (locked 2026-07-01)

The product is renamed **Paramour → Amourette**. Domain: **`getamourette.com`**
(`amourette.com` is taken; `.app/.co/.io/.love/.us` and `join/try/…app.com`
were free at time of check).

Due-diligence summary (why it's usable but needed care):
- **App Store / Play Store:** no dating app named Amourette. One low-profile
  hidden-object *game* "Amourette: Objets Cachés" exists on the FR App Store —
  App Store display names are not required unique, so not a blocker.
- **Trademarks:** no dating/software mark (Class 9 / Class 45) found. Existing
  marks are in *other* classes — Triumph **Amourette** lingerie (Class 25),
  *Une Amourette* perfume (Class 3), L'Amourette chocolate. Class-specific
  protection means these don't block a dating app, but "amourette" is a common
  French dictionary word (a light/fleeting love affair), so the mark is
  **diluted** — weak SEO ownership, harder to protect. Accepted trade-off; the
  *meaning* (live, discreet, ephemeral romance) fits the product perfectly.
- Not legal advice — a proper clearance by an IP counsel is the move before any
  actual trademark filing.
- **Codename note:** internal DB objects still use the old `bartap-` codename
  (e.g. the `bartap-close-ended-nights` cron). Those stay as-is unless a
  migration explicitly renames them (per the 2026-06-28 decision). The
  Paramour→Amourette rename in *code/UI/docs* is a separate TODO (below).

## Design principles (derived from the product invariants)

Every visual choice is judged against these five — they are the invariants
translated into design language:

1. **Discreet.** The screen must not shout "dating app" across the table.
   Dark, calm, nothing flashing.
2. **The night is the set.** The app background *is* the venue's ambiance:
   dimness, warm materials, scarce light.
3. **The accent is an event.** The signature colour is reserved for the like,
   the match, the CTA. Rare, therefore precious.
4. **Women first.** Elegance is a safety signal. Never racy, never sleazy.
5. **Tonight only.** The DA carries the soft urgency of the ephemeral: what
   happens here expires at dawn.

## The three directions (board v3)

The v2 board explored *one* aesthetic (dark + couture red) with three
red-usage variants. V3 confronts it with two genuinely different, fully
executed alternatives so the choice is real. All three are dark (decided:
Amourette is opened in a bar at night — this deliberately overrides Marwane's
personal "no dark mode" rule, which is scoped to Reza, a different project).
All three palettes pass WCAG contrast (measured, see board).

| | A · Rouge Signature | B · Heure Bleue | C · Dernière Danse |
|---|---|---|---|
| Mood | Couture, lipstick, theatre curtain | Blue hour, candlelight, cinema | Neon bar sign, flirty, playful |
| Background | Warm near-black `#150E10` | Ink blue `#0B0F1C` | Warm black `#0F0A0E` |
| Signature | Ruby red `#D01F3C` | Amber glow `#E4A14F` | Neon pink `#FF4F7B` |
| Display type | Bodoni Moda | Fraunces | Instrument Serif italic |
| Says "love" | Immediately | Never (says "premium bar") | Yes, flirt-flavoured |
| Discretion | Good | Best | Weakest (neon draws the eye) |
| Ownable | Strong (no dating app owns couture red) | Weak (premium-dark is saturated) | Weak (pink = generic dating code) |
| Women-first risk | Low if red discipline holds | Lowest | Highest (neon slides to sleazy) |

**Decision (2026-07-03): Direction A — Rouge Signature, "hybrid" red usage,
signed by Marwane.** It is the only direction that wins on the three axes
that matter: it *says love* (B never does), it is *ownable* (C is Tinder
territory), and it holds women-first through premium elegance. It is also the
natural continuation of the v2 work — the existing lead was right, it needed
real alternatives to confirm it.

### How the three v2 open points closed

1. **Red usage philosophy → hybrid.** Punctuation system on ~95% of the app
   (dark + cream, red only for the ♥ and the primary CTA); full-red reserved
   for the match reveal and the splash. Red becomes an event, like the match.
2. **Exact red → `#D01F3C`.** Settled objectively: of the five candidates,
   only `#D01F3C` and `#C8102E` pass WCAG both as a button fill under cream
   text (4.5:1) and as a UI element on the velvet background (3:1) —
   `#D2213F` (4.42) and `#E5405C` (3.41) fail the button check, `#A81D3B`
   (2.63) fails on velvet. `#D01F3C` is the more couture of the two survivors.
3. **Palette → confirmed as-is**, with two guard-rails hardened: champagne is
   *only* ever a 1px hairline (never a fill, never a button), and blush gets a
   defined job (soft states: invisible mode, safety confirmations, focus ring).

## The system (v2 — reworked 2026-07-22, drawn from the two hero screens)

This is the current system, replacing the 07-03 table. **Token *names* are kept
from 07-03 so the code migration is mostly value changes, not renames**; the
values move cooler and deeper. Contrasts must be re-measured for the new values
at token-wiring time (the 07-03 measurements no longer apply — `red #CC1436` is
darker than `#D01F3C`, so cream-on-red and red-on-velvet both need re-checking
against the 4.5:1 text / 3:1 UI bars).

### Tokens — palette (primitives)

| Token | Hex (v2) | Was (07-03) | Role |
|---|---|---|---|
| `velvet` | `#120A0F` | `#150E10` | App ground — near-black ink, cooler and deeper |
| `bordeaux` | `#1D0F15` | `#231317` | Surfaces, cards, inputs |
| `red` | `#CC1436` | `#D01F3C` | Signature: the ♥, primary CTA, live-dot, reveal |
| `red-deep` | `#A51330` | `#C11B37` | Full-red screen base (the match reveal / splash) |
| `wine` | `#7C0F24` | `#7C1D2E` | Depth: full-red vignette edge, gradients, hover |
| `champagne` | `#D9B779` | = | The only gold. 1px hairline only, opacity ≤ .5 |
| `blush` | `#E9B9BC` | = | Soft/safety states: invisible, safety confirms, focus ring |
| `cream` | `#EFE6E0` | `#F4EBE1` | Primary text; wordmark; inverted CTA fill on red |
| `taupe` | `#9D8A86` | `#A98F86` | Secondary text, placeholders, kickers |
| `ink` | `#1A0F12` | = | Text on light backgrounds (print, stickers, emails) |

Two recipe tokens (gradients, not flat colours):
- `rose-key` — the warm portrait key light on the card: a soft radial of
  `rgba(216,180,170,.4)` fading out, so the person emerges from the dark.
- On `red-deep`, secondary text is a rose tint of cream (`~#F3D9DD`) and the
  kicker is `~#F2CDD2` — cream/blush family, not new primitives.

### Type

- **Fraunces** — display, headings, names, wordmark, reveal titles. **Italic is
  the brand voice** (names, wordmark, reveal). Weights 400–600. (Replaces Bodoni.)
- **Figtree** — body text (300/400/500), readable in dim light. (Replaces Inter.)
- **Jost** — uppercase tracked labels, buttons, kickers, counts (300/400). Kept.
- Red is never body text.

| Role | Size / line-height | Font | Use |
|---|---|---|---|
| `display-hero` | 48 / 1.0 | Fraunces italic 500 | Card first name |
| `display-reveal` | 44 / 1.0 | Fraunces italic 500 | Reveal title |
| `wordmark` | 19–21 / 1 | Fraunces italic 500 | In-app header wordmark |
| `title` | 30 / 1.1 | Fraunces italic 500 | Secondary headings |
| `body` | 14–14.5 / 1.55 | Figtree 300 | Bio, body copy |
| `label` | 12 / tracking .16em | Jost 400 upper | Button labels |
| `kicker` | 10–11 / tracking .3em | Jost 400 upper | Kickers, venue line |
| `caption` | 10 / tracking .14em | Jost 400 upper | Counts, micro-labels |

### Spacing — 4px base

Scale `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48`. Screen content gutter
**24–26**; bottom safe padding **36–40**. Inside a content block
(kicker → name → bio) 12–14; block → action row 22–24.

### Radius

`sm 12 · md 16 · lg 20 · xl 28 · pill 9999`. Inputs = 14. Cards/panels = 20–28.
Buttons, tags, the ♥, reveal CTAs = pill.

### Elevation (tinted velvet, never pure black)

- **0 — ground:** flat `velvet`, one soft wine glow (radial, top) for depth.
- **1 — surface/card:** `bordeaux`, shadow `0 18px 60px rgba(velvet,.45)`,
  optional 1px champagne hairline border (≤ .3 alpha).
- **2 — panel/overlay:** `0 30px 70px rgba(velvet,.55)` + inner top highlight
  `rgba(255,255,255,.05)`.
- Scrims fade to `velvet`, never `#000`. Every shadow is velvet-tinted.

### Motion

- Durations **300–500ms**. Fades. No bounce, no confetti.
- Easing: entrances `cubic-bezier(0.16, 1, 0.3, 1)` (Expo.out); press `scale(0.97)`.
- Signature moments: the ♥ blooms once on tap (soft red halo, fading out); the
  reveal rises like a curtain (slow fade + slight translate), never a jackpot.
- Respect `prefers-reduced-motion`.

### Component rules

- **Hero #1 — Room feed card (locked):** full-bleed cinematic photo, the person
  emerges from a `rose-key` warm light on near-black (chiaroscuro), grain, bottom
  scrim to `velvet`. Bottom content: kicker (red live-dot + "in the room · N
  here"), first name in Fraunces italic (`display-hero`), 2-line bio, one
  champagne 1px hairline, then the action row (♥ + count). No card frame.
- **Hero #2 — Match reveal (locked):** full-`red-deep` screen (radial
  `red → red-deep → wine`, never flat), grain. Centred: two **overlapping**
  circular portraits (front one ringed 3px `red` + 1px champagne), **no badge**.
  Kicker (rose tint) "Mutual energy", title "You both tapped" Fraunces italic
  (cream), 60px champagne hairline, body (rose tint). Two CTAs: primary =
  **cream fill, red-deep label** ("Start the chat"); ghost = cream hairline
  outline. This + the splash are the ONLY full-red screens.
- **Primary button:** `red` fill, `cream` Jost label (≥ 12px), pill. One per
  screen. On full-red screens it inverts: `cream` fill, `red-deep` label.
- **Secondary / ghost:** transparent or `bordeaux`, cream label, 1px hairline
  border. Never a red outline.
- **The ♥ (like) — CHANGED from 07-03:** filled **`red` present** at rest on the
  card (Marwane's pick), Jost "Tap" label, pill, blooms once on tap. This
  supersedes the old "idle taupe outline → solid when liked" rule. Tension
  logged: a standing red ♥ must not out-shout the reveal — held in check by the
  reveal being *full* red and everything else staying dark.
- **Champagne hairline:** 1px, `transparent → champagne → transparent`, opacity
  ≤ .5. The only gold. One per screen max.
- **Safety UI (report, block, invisible):** never red — red is love. Blush/cream
  on bordeaux; "alert red" does not exist.
- **Voice:** complicit, sober, informal ("tu"). Short. Promise the real: "She's
  in the room, right now." No gamification (score, streak).

### Logo lockups (provisional — the wordmark/logo is a separate pending pass, #38)

Interim: wordmark in Fraunces italic — `cream` in-app / on photo, `red` on
dark-or-cream hero use, `ink` on light. Never red on bordeaux/wine or a busy
photo. The dedicated logo pass reopens this (font, custom logotype, the wax-seal
app-icon idea).

### Do / Don't

Always: dark ground; red rare (the ♥ + primary CTA + reveal); one champagne
hairline max per screen; scrims/shadows tinted velvet (never pure `#000`/`#FFF`);
Fraunces italic for names/wordmark/reveal; cream labels on red, red-deep labels
on cream (full-red screens).

Never: red as running text or small type; champagne as a fill or button; red for
errors or danger; multicolour gradients, glassmorphism, neon; flat photos or
pure-black scrims.

## Open decisions

Both hero screens are locked and the v2 system is written above. Still open:
(1) re-measure WCAG contrasts for the v2 values when wiring tokens; (2) the "red
present" ♥ vs "red is an event" tension (validate it does not dilute the
reveal); (3) the wordmark/logo pass (reopens the Bodoni wordmark; the wax-seal
app-icon idea). See "Design-system rework" near the top for the full narrative.

## The board

Visual exploration lives in **`docs/brand/board.html`** (v3, self-contained,
pulls Google Fonts). View it in a real browser (rendering was verified with
headless Chromium screenshots in the remote agent environment; local headless
Chrome may still hang on the GPU compositor). To serve on the LAN:

```bash
python3 -m http.server 8099 --bind 0.0.0.0 --directory docs/brand
# then open http://192.168.1.67:8099/board.html  (192.168.1.67 = your LAN IP)
```

Board sections: (00) design principles from the invariants, (01–03) the three
complete directions (palette, wordmark, type, room + match mocks, honest
pros/cons), (04) comparison table + recommendation, (05) the full system for
Direction A (tokens with measured contrast, component rules, do/don't).
The v2 board (single-direction exploration) is in git history.

## Next steps

**Étape 0 — foundation (done, 2026-07-23).** shadcn/ui initialised on Tailwind 4
(base radix, style radix-nova); the v2 tokens are wired into `@theme` in
`app/globals.css` with shadcn's semantic tokens mapped onto the Amourette
palette (dark-only, so `:root` carries the dark values directly, no `.dark`
class); fonts swapped to **Fraunces / Figtree / Jost** via `next/font` in
`app/layout.tsx` (replacing Bodoni / Inter). WCAG re-measured for the v2 values —
all pass (cream-on-red 4.59:1, red-on-velvet 3.46:1, red-on-bordeaux 3.29:1), so
open point (1) is closed. See the `2026-07-23` entry in `docs/decisions.md` for
the token-mapping choices.

Remaining:

1. Translate the two locked hero mockups into real React components — the room
   feed card first, then the match reveal — rendering states/variants and
   choosing before freezing (mockups in `docs/brand/explorations/`).
2. Apply the system to the four existing screens (landing, profile, room,
   chat) — one PR per screen, founder's call.
3. The wordmark/logo pass (separate, reopens the Bodoni wordmark; the wax-seal
   app-icon idea).
4. Separate chore: rename **Paramour → Amourette** across UI copy / docs
   (code identifiers stay English; DB `bartap-` objects untouched unless a
   migration renames them).
