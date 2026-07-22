# Design & Brand — Amourette

Living design reference. Updated as the visual identity is decided. Pairs with
`docs/decisions.md` (the *why* of each choice) and `docs/brand/board.html` (the
visual board).

> Status: **DA locked (2026-07-03) — Direction A "Rouge Signature", hybrid
> red usage, signed by Marwane.** The brand name and the visual system are
> both final: the token table below is the reference, ready to wire into
> Tailwind. Directions B and C remain on the board as the record of what was
> considered and why A won.

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

## The system (Direction A — final)

### Tokens (WCAG contrast measured)

| Token | Hex | Role | Verified contrast |
|---|---|---|---|
| `velvet` | `#150E10` | App background | — |
| `bordeaux` | `#231317` | Surfaces, cards, inputs | — |
| `red` | `#D01F3C` | Signature: the ♥, CTA, hero wordmark, match screen | 3.6:1 on velvet (UI ✓); cream on it 4.5:1 (text ✓ — at the limit: button labels always cream, never taupe, ≥ 12px) |
| `wine` | `#7C1D2E` | Depth, gradients, hover — never sole information carrier | — |
| `champagne` | `#D9B779` | 1px hairlines only. Never a fill, never a button | 10.0:1 on velvet |
| `blush` | `#E9B9BC` | Soft states: invisible mode, safety confirmations, focus ring | 11.0:1 on velvet |
| `cream` | `#F4EBE1` | Primary text, everyday wordmark | 16.2:1 on velvet |
| `taupe` | `#A98F86` | Secondary text, placeholders | 6.3:1 on velvet; 5.9:1 on bordeaux |
| `ink` | `#1A0F12` | Text on light backgrounds (print, stickers, emails) | 15.9:1 on cream |

### Type system

- **Bodoni Moda** — display/headings and the wordmark (the brand face).
  Weights 400–600 + italic for the match-screen title.
- **Inter** — body text (300/400/500), readable in dim light.
- **Jost** — uppercase tracked labels and button text (300/400).
- Red is an accent, **never body text**.

### Logo lockups (3 versions — red never on a background that kills it)

- **Red** on dark/cream backgrounds (hero use).
- **Cream** on full-red or over a photo (in-app everyday header, splash).
- **Ink** on light backgrounds.
- Never red-on-bordeaux/wine, never red over a busy photo.

### Component rules

- **Primary button:** red fill, cream Jost uppercase label (≥ 12px), pill
  radius. One per screen.
- **Secondary button:** bordeaux fill or hairline border, cream label. Never a
  red outline (too weak).
- **The ♥ (like):** the only red element on the room screen. Unliked: taupe
  outline on bordeaux. Liked: solid red. No flashy animation — a fade; it's a
  secret.
- **Profile cards:** bordeaux, radius 20, photo scrim fading to velvet (never
  to pure black). Name in Bodoni Moda 600.
- **Champagne hairline:** 1px, transparent→champagne→transparent gradient,
  opacity ≤ .5. The only place gold exists.
- **Match / splash screens:** the only two full-red screens (background
  slightly darkened to `#C11B37`), wordmark and CTA inverted in cream, title
  in Bodoni italic.
- **Safety UI (report, block, invisible):** never red — red is reserved for
  love. Safety actions use blush/cream on bordeaux; "alert red" does not exist
  in this app.
- **Motion:** slow fades (300–500ms), no bounce, no confetti. The match reveal
  is a curtain rising, not a jackpot.
- **Voice:** complicit and sober, informal address ("tu"), short sentences.
  Promise the real: "She's in the room, right now." No gamification language
  (score, streak).

### Do / Don't

Always: one red element per screen (outside match/splash); running text in
cream/taupe on velvet/bordeaux; everyday wordmark in cream; scrims and shadows
tinted velvet (never pure `#000`/`#FFF`); cream labels on red buttons.

Never: red as running text, small type, or thin outline; red on bordeaux/wine
or busy photos; champagne as a fill or button (gold + red = Christmas /
fast-food); red for errors or danger; multicolour gradients, glassmorphism,
neon.

## Open decisions

None — the direction is signed (see `docs/decisions.md`, 2026-07-03).
Implementation can start with the "Next steps" below.

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

1. Wire tokens into Tailwind 4 via `@theme` in `app/globals.css`.
2. Source the fonts (Bodoni Moda + Inter + Jost) via `next/font`.
3. Apply the system to the four existing screens (landing, profile, room,
   chat) — one PR per screen or one PR total, founder's call.
4. Separate chore: rename **Paramour → Amourette** across UI copy / docs
   (code identifiers stay English; DB `bartap-` objects untouched unless a
   migration renames them).
