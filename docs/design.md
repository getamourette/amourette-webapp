# Design & Brand — Amourette

Living design reference. Updated as the visual identity is decided. Pairs with
`docs/decisions.md` (the *why* of each choice) and `docs/brand/board.html` (the
visual exploration board).

> Status: **DA in progress.** The brand *name* is locked; the visual system is
> proposed and awaiting final sign-off on three points (see "Open decisions").

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

## Visual direction

### Decided
- **Dark UI.** Amourette is opened *in a bar, at night, discreetly* — a dark,
  dim theme is the product's ambiance, not an option (screen doesn't light up
  the whole table; intimate; premium). This deliberately overrides Marwane's
  personal "no dark mode" rule, which is scoped to Reza, a different project.
- **Wordmark font: Bodoni Moda** (high-contrast fashion serif — Vogue / rouge à
  lèvres / theatre-curtain energy). Chosen over Cormorant, Italiana, Playfair,
  Fraunces, Cinzel, Jost.
- **Red is the signature colour**, and the whole palette is derived from it
  (monochrome-red system) rather than adding competing hues.
- **Logo lives in 3 versions**, never forced onto a background that kills it:
  - **Red** on dark / cream backgrounds (hero use)
  - **Cream** on a full-red background or over a photo (in-app header, splash)
  - **Ink** on light backgrounds
  Rule: red never sits on a background that kills it (never red-on-bordeaux,
  never red over a busy photo). Day-to-day in the app the header wordmark is
  **cream**; red is reserved for strong moments (the ♥, the CTA, the match screen).
- **Type system:** Bodoni Moda for display/headings (the brand face), **Inter**
  for body, **Jost** for uppercase labels/caps. Red is an accent, **never body text**.

### Proposed palette (awaiting sign-off)
| Token | Role | Hex |
|---|---|---|
| `velvet` | app background | `#150E10` (warm near-black) |
| `bordeaux` | surfaces / cards | `#231317` |
| `red` | **signature** — logo, like ♥, CTA | `#D01F3C` (ruby couture) |
| `wine` | depth, gradients, hover | `#7C1D2E` |
| `champagne` | luxe accent — thin hairlines only (never fills) | `#D9B779` |
| `blush` | softness / women-first touches | `#E9B9BC` |
| `cream` | primary text | `#F4EBE1` |
| `taupe` | secondary text | `#A98F86` |

Notes:
- Red is **not** for running text (insufficient contrast, unreadable small) —
  text stays cream/taupe. Red = logo, big numbers, the ♥, primary button.
- Champagne is the trap: gold + red can read "Christmas" / "fast-food". Keep it
  desaturated and in **thin lines only**, never as a fill.
- Exact red not final: candidates `#D01F3C` (ruby, reco), `#C8102E` (cardinal),
  `#D2213F` (vivid), `#E5405C` (warm/pink), `#A81D3B` (deep carmine).

## Open decisions (blocking final sign-off)
1. **Red usage philosophy** — three directions shown on the board:
   - *Rouge ponctuation* (reco): dark + cream, red only punctuates (the ♥). Sober, premium.
   - *Rouge surface*: red as signature surface (theatre-curtain). Bold, ownable, but heavy over photos.
   - *Hybride* (reco): "ponctuation" system for ~95% of the app, **full-red**
     reserved for celebration screens (match / splash / onboarding). Red becomes
     an event, not background noise — matches Amourette's tempo (discreet, then spark).
2. **Exact red hex** (default `#D01F3C`).
3. **Palette confirmation** — as-is, or push a slider (more/less champagne, blush more present).

## The board
Visual exploration lives in **`docs/brand/board.html`** (self-contained, pulls
Google Fonts). Headless Chrome can't screenshot in this environment (GPU
compositor hangs), so view it in a real browser. To serve on the LAN:

```bash
python3 -m http.server 8099 --bind 0.0.0.0 --directory docs/brand
# then open http://192.168.1.67:8099/board.html  (192.168.1.67 = DEV_LAN_ORIGIN)
```

Board sections: (01) wordmark 3 lockups, (02) palette + red candidates,
(03) the three red-usage directions as phone mocks, (04) type pairing.

## Next steps (once the 3 open decisions land)
1. Wire tokens into Tailwind 4 via `@theme` in `app/globals.css`.
2. Write the `docs/design.md` do/don't for components (buttons, cards, the ♥).
3. Source the fonts (Bodoni Moda + Inter + Jost) — self-host or `next/font`.
4. Separate chore: rename **Paramour → Amourette** across UI copy / docs
   (code identifiers stay English; DB `bartap-` objects untouched unless a
   migration renames them).
