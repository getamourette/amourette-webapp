# B and C in context

Round 14, authorized by Marwane on 2026-09-08 for issue #39. This is a
standalone visual comparison, not application integration or a logo selection.

## Design read

A restrained design-workshop page for comparing the two existing candidates
in Amourette's warm nocturnal identity. Native HTML, CSS and original SVGs.
`DESIGN_VARIANCE: 3`, `MOTION_INTENSITY: 1`, `VISUAL_DENSITY: 3`: paired layouts
and still artwork make the visual comparison repeatable. The existing brand
palette and fonts take precedence over generic frontend defaults. Repeated
layouts, A6 light paper on dark staging, and the static landing reproduction
are intentional comparison requirements.

## Preserved references

- B: `../round-10/fleeting-tie.svg` (The fleeting tie).
- C: `../round-10/first-exchange.svg` (The first exchange).
- Lettering: `../round-09/balanced-wordmark.svg` and
  `../round-09/fuller-wordmark.svg`, fetched unchanged at runtime.
- Source and provenance: `../round-10/generated-concepts.png` and
  `../round-10/prompts.md`.

No emblem contour, wordmark path, R construction or R/E spacing is edited.
Both candidates use identical SVG boxes and placement in each support. Their
round 10 proportions within those boxes are retained, including B's 430-unit
and C's 385-unit maximum visible extents inside the 512-unit square. This is
not a claim of equal ink area or equal perceptual weight.

At 160px and 64px, the emblem's SVG box is 85% of the icon tile. The 32px, 24px
and 16px standalone specimens use their labelled SVG box widths. All sizes
refer to CSS pixels at 100% browser zoom, not physical pixels or millimetres.
The existing `-small.svg` stroke-lift experiments are deliberately not used,
so viewers assess the original contours. Minimum sizes remain open.

## Supports

1. A phone icon, enlarged and at everyday sizes. A shared control changes
   both icon backgrounds between velvet and ruby; the emblem stays cream.
2. A static reproduction of the current new-visitor landing composition,
   based on `app/page.tsx`, `app/WaitlistForm.tsx`, `app/globals.css`, the
   English copy in `lib/strings.ts`, and the earlier `landing-new.png` visual.
   It retains the centred hierarchy, wine glow, red identity, Figtree body,
   Jost labels, champagne hairline and waitlist. The emblem is added above
   the outlined uppercase wordmark. Language, email and footer controls are
   visual specimens, with no inputs, navigation or submission behavior.
3. A flat A6 QR card on a neutral dark counter. The 105:148 aspect ratio is
   the print-format reference; on-screen size is not a physical calibration.
   Card copy and composition are new proposals, not approved product copy.
4. The agent-proposed free composition moves the invitation to the top and
   the brand to a smaller horizontal signature at the bottom. It is shown
   with both original emblems, not a new symbol or a fusion of B and C.

The shared weight control swaps only the round 9 SVG source. The initial
setting is `fuller`, matching round 10's starting view, not selecting a final
weight. The companion-emblem control hides the symbol while retaining its
layout space, so the wordmark, message and QR stay at the same coordinates.
Phone icons stay visible when companion emblems are hidden.

No generative image processing is used in this round: all artwork is placed
directly as vector assets, and the supports are native HTML/CSS. No invented
photo environment or photo-composited brand geometry is involved.

## QR

`sample-qr.svg` is a real QR encoding `https://getamourette.com`, identical in
all four cards. It does not encode a shared test venue or perform a check-in.
It is generated using the repository's existing `qrcode` dependency, with
error correction M, a four-module quiet zone, ink `#1A0F12` and cream
`#EFE6E0`. This sample destination is also disclosed below the main cards.

Regenerate the SVG string with the existing package:

```bash
node -e 'require("qrcode").toString("https://getamourette.com", {type:"svg", errorCorrectionLevel:"M", margin:4, color:{dark:"#1A0F12", light:"#EFE6E0"}}).then(console.log)'
```

## Fonts

Unmodified variable fonts and SIL Open Font Licenses are self-hosted under
`fonts/`, sourced from the official Google Fonts repository on 2026-09-08:

| Local file | Official source | Usage |
| --- | --- | --- |
| `figtree.ttf` | [Figtree](https://github.com/google/fonts/tree/main/ofl/figtree) | Studio and product body |
| `jost.ttf` | [Jost](https://github.com/google/fonts/tree/main/ofl/jost) | Product labels |
| `fraunces-italic.ttf` | [Fraunces](https://github.com/google/fonts/tree/main/ofl/fraunces) | QR invitation headline |

Their corresponding `*-OFL.txt` files are stored alongside the fonts. These
are existing brand families, supplied locally to make this comparison
independent of Google Fonts requests. They are not added to the app stack.
Cormorant is already outlined in the preserved wordmark SVGs.

## Preview

The existing HTTP service serves a copy, not this repository. Copy only this
new `round-14` directory into the existing exploration copy's `round-04/`
directory. It depends on that copy's already-present round 9 and 10 assets.
The service root and all earlier exploration pages remain unchanged.

Open:
`http://100.100.155.8:8079/round-04/round-14/`

## Verification

Checked in headless Chromium at 320, 360, 390, 768, 1024 and 1440 CSS pixels.
All eight specimens render, the page and phone screens do not overflow, and
all four cards retain 105:148 proportions with their content inside the card.
The weight, emblem visibility and icon-colour controls were exercised; hiding
an emblem leaves the card's title coordinates unchanged. A missing SVG shows
an inline failure state and keeps the controls disabled. All normal page
requests stay on the preview server, including the fonts. Desktop, mobile
and reduced-motion views were inspected.

The final Lighthouse mobile run scored 100 for performance and 100 for
accessibility, with CLS 0 and LCP about 1.8 seconds in this environment.
Best practices scored 78 because the existing preview service uses HTTP;
its service configuration was not changed. These automated results are not
physical phone or printed-card validation.

A SHA-256 aggregate over the 95 pre-existing exploration files matched before
and after this round. `node --check comparison.js` and `git diff --check`
passed. No app files, package manifests or dependency locks changed.

## Still open

Founder preference after context comparison; whether either emblem should
proceed to manual contour refinement; final wordmark weight and emblem scale;
final minimum sizes; print production; app integration. Nothing in this round
selects B or C, resolves the previously documented visual similarities, or
claims a finished identity master.
