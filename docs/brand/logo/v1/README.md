# Amourette — logo usage, v1

Design delivery, 2026-09-08 / issue #39. Core drawings and usage roles were
selected by Marwane. This pack completes their digital production setup
without changing the app or replacing any exploration source.

## The identity set

| Form | Drawing | Role |
| --- | --- | --- |
| Vertical signature | B1 + More presence | Main signature; public welcome, venue cards, posters |
| Horizontal signature | B1 + More presence | Companion when the format is wide |
| Wordmark alone | More presence | In-app headers and name-led compact placements |
| Emblem alone | B1 | Standalone brand symbol; not an interactive UI icon |
| Phone icon | B1, cream on velvet | Square icon source for platform-specific masking |
| Favicon | F1, cream on velvet | Browser-tab identity only |

The wordmark is outlined Cormorant Garamond, 600-weight base, with the
approved custom R and round 9 optical spacing. Never retype it, extend the
R, close the R/E gap or adjust individual letters. The two ribbons are not
interchangeable: F1's added optical weight is for the favicon, not large
brand applications or the phone icon.

## Fixed proportions and clear space

Let **x** be the flat capital height of the first E, excluding the R's
descending leg and other overshoots. The combined compositions retain the
round 16 geometry:

- Vertical: visible ribbon width 2.4x; visible gap above the wordmark 0.65x.
- Horizontal: visible ribbon width 1.8x; visible gap beside the wordmark 0.65x.
  The emblem is vertically centred on the capitals, not the R's lower tip.
- Combined signatures and standalone wordmark: at least 1x clear space on
  every side of all visible artwork, including the R's leg.
- Standalone B1: at least one quarter of its visible width on every side.

**This minimum clear space is already included in every `svg/` and `png/`
file's canvas.** Do not crop it, use cover-style fitting, or count it twice
when measuring the minimum sizes below. Additional space is welcome.
Background colours may extend through clear space; other text, graphics
and clipping edges may not enter it. Scale the whole file uniformly.

The phone icon is an opaque square: B1 is centred at 72% of the tile width.
No rounded corners are baked into this source; the platform or mockup
provides its mask. The favicon retains round 17's 512-unit frame, cream on
velvet and 80-unit background corner radius. It is not a cropped phone icon.

## Screen minimums

All widths below mean **the complete supplied file, including its clear
space**, in CSS pixels at 100% browser zoom. These are v1 working minimums,
checked on screen, not a guarantee for every display or printing process.

| File | Minimum width | Approximate visible artwork at that width |
| --- | --- | --- |
| Vertical signature | 200px | Wordmark 169px; ribbon 38px |
| Horizontal signature | 280px | Wordmark 198px; ribbon 33px |
| Wordmark alone | 192px | Wordmark 162px |
| B1 alone | 48px | Ribbon 32px |
| Phone-icon tile | 48px | Ribbon 35px |
| F1 favicon tile | 16px | Optical drawing within the whole 16px tile |

Use the wordmark alone when a combined signature cannot fit its minimum.
Use F1 only for the favicon, not as a blanket replacement for small UI
symbols. Ruby on dark needs a generous display size; use cream for small
in-app branding. Check actual screen rendering if the setting is difficult.

The SVGs can be supplied for print, but the pack is sRGB, not a CMYK proof.
Do not convert these pixel minimums into a universal millimetre rule.
Paper, ink and printing process affect the fine strokes: validate a
physical proof at final size before producing venue cards or posters.

## Colour rules

The emblem and lettering share one colour in combined signatures.

- **Cream `#EFE6E0`:** default on velvet `#120A0F` and in the app. On a
  photo, provide a calm, sufficiently dark area or velvet backing.
- **Ruby `#CC1436`:** public landing/hero identity and cream-background
  brand communication. Keep it out of small in-app branding, bordeaux/wine
  backgrounds and busy photos. This continues the existing public/in-app
  colour distinction; it does not turn ruby into a permanent in-app accent.
- **Ink `#1A0F12`:** light and cream backgrounds, including print layouts.
- **Phone icon and favicon:** cream on velvet only in this set.

Use the supplied colour variants, not arbitrary recolouring, gradients,
shadows, outlines or two-tone ribbon/wordmark combinations. Champagne
remains an interface hairline, not a logo colour.

## Files

- `svg/`: 12 transparent vector files: four forms × cream, ruby, ink.
  All lettering is paths; there is no font dependency.
- `png/`: the same 12 forms on transparent backgrounds. Vertical files are
  2000px wide, horizontal and wordmark files 2400px, emblem files 1024px.
  Preserve their aspect ratio and included padding.
- `icons/amourette-phone.svg` and PNGs at 180, 192, 512 and 1024px:
  opaque square B1 sources. These sizes are provided for convenience;
  platform manifests, store submission requirements and masks are not
  configured or certified by this design delivery.
- `icons/favicon.svg`, PNGs at 16, 32, 48 and 64px, and `icons/favicon.ico`:
  F1 only. ICO contains the 16, 32 and 48px PNG representations.
  A 32px source can serve a 16px tile on a double-density screen.
- `manifest.json`: source hashes, geometry and output-file hashes.
- `licenses/Cormorant-Garamond-OFL.txt`: retained source-font attribution
  and licence text. No font binary is bundled.

The asset set is **14 SVGs, 20 PNGs and 1 ICO**. The ZIP also includes this
guide, the visual HTML sheet, stylesheet, licence and manifest. The HTML
sheet works offline after extraction; its ZIP download link is hidden for
local-file viewing because the archive does not contain itself.

## Provenance and boundaries

Exact selected references, preserved in the repository:

- B1: `docs/brand/explorations/logo-wordmark/round-15/ribbon-refined.svg`.
- More presence: `docs/brand/explorations/logo-wordmark/round-09/fuller-wordmark.svg`.
- F1: `docs/brand/explorations/logo-wordmark/round-17/ribbon-optical.svg`.

The generator adds composition transforms, explicit colours and padding;
it does not redraw the paths. Earlier alternatives stay archived. V1 is
a design delivery, not an app release or trademark clearance. Application
integration, commits, pushes, PRs and shipping require explicit authority.
