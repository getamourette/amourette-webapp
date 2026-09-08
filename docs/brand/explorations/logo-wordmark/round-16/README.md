# B1 usage proposals

Round 16 for #39, 2026-09-08. Marwane selected B1 after round 15 and
approved moving on to a comparison of lettering weight, compositions,
colour applications and small sizes. This page proposes an identity set;
it does not declare the remaining choices approved.

## Preserved sources

- Emblem: `../round-15/ribbon-refined.svg` (selected B1).
- Balanced lettering: `../round-09/balanced-wordmark.svg` (500-weight base).
- More presence lettering: `../round-09/fuller-wordmark.svg` (600-weight base).

The page fetches these local files and imports their complete original
artwork. Only outer translation, uniform scale and inherited colour are
applied. All ribbon paths, nine letter contours, original group transforms,
custom R and optical spacing are preserved. No bitmap generation, retracing,
retyped lettering or font substitution is involved. Earlier exploration
files remain unchanged; these compositions are not replacement masters.

## What to compare

The first pair always shows both weights. The preview control changes the
other compositions and the standalone header specimen, not this fixed pair
or the small-size lettering comparison. More presence is the initial
preview and the agent's recommendation, not a founder-approved setting.

- **Vertical:** proposed main signature for public welcome, QR cards and posters.
- **Horizontal:** companion composition for wider placements.
- **Compact signature:** the agent-proposed free variation, placing a smaller
  ribbon after the name. A quiet card-footer option, not a third required logo.
- **Separate uses:** wordmark alone for an in-app header; ribbon alone inside
  a phone icon. Cream on ruby and cream on velvet are both shown.

## Geometry

Measurements use visible artwork bounds (`getBBox()`), not the transparent
padding in the original root viewBoxes. The spacing unit **x** is the flat
capital height of the first E, transformed into the source SVG coordinates.
Each weight is normalized to the same capital height before composition.
The small difference in wordmark width between weights is retained.

| Composition | Visible ribbon width | Gap between visible artwork | Proposed outside clear space |
| --- | --- | --- | --- |
| Vertical | 2.4x | 0.65x above the wordmark | 1x |
| Horizontal | 1.8x | 0.65x beside the wordmark | 1x |
| Compact, name first | 1.15x | 0.6x after the wordmark | 1x |

The vertical ribbon is centred over the visible wordmark width. Horizontal
and compact ribbons are vertically centred on the capital letters, not
on the R's descending leg. Clear space is measured around the union of
all visible artwork, including that leg. The guide controls are diagnostic
overlays and do not modify the logo.

These are proposed composition rules, not finalized export specifications.
Standalone emblem/wordmark clear-space rules remain to be defined alongside
the final set. Phone-icon examples use a visible ribbon width of 72% of the
tile width; rounded containers belong to the mockup, not the emblem master.

## Colour proposals

The specimens use the existing project palette:

- Cream `#EFE6E0` on velvet `#120A0F`: in-app starting point.
- Ruby `#CC1436` on velvet: public welcome at a generous size.
- Ink `#1A0F12` on cream: light print-surface study.
- Ruby on cream: brand communication and QR-card study.
- Cream ribbon on ruby or velvet: phone-icon background candidates.

Combined emblem and name share one colour in these proposals. Champagne
remains an interface hairline rather than a proposed logo colour. These
screen colour studies are not CMYK or physical print proofs.

## Small sizes

View at 100% browser zoom. Ribbon samples are 64, 48, 32, 24 and 16 CSS pixels
**of visible artwork width**. Round 15 labels described the wider original
SVG canvas instead; its same-number specimens are not directly comparable.
Both wordmarks appear at 240, 190, 160 and 120 pixels of visible width.
The phone-icon tiles are 60 pixels, including their internal padding.

Proposed screen starting minimums are 32 pixels for the standalone ribbon
and 160 pixels for the standalone wordmark. They are review candidates,
not approved minimums. Device pixel density, colour and reproduction matter.
The 24/16px ribbon and 120px wordmark are stress tests, not recommended uses.
No separate favicon drawing has been made or silently substituted: the
fine crossing remains fragile at 16px and needs its own optical review.
Complete-lockup minimums and print minimums remain open.

## Review and next step

The agent proposes More presence lettering, the vertical main signature,
a horizontal companion, the wordmark alone for app headers and cream on
ruby for the phone icon. The fuller letters hold their presence more
consistently against the ribbon, particularly at header size. The quieter
Balanced weight remains a valid candidate for its finer appearance.

Founder confirmation of weight, compositions and colour rules comes before
the final export pack and usage sheet. No app integration, commit, push,
PR or shipping is authorized by this comparison.

## Preview

`http://100.100.155.8:8079/round-04/round-16/`

The existing service serves a copy. Only this new directory is copied into
its `round-04/` directory; the existing round 9 and 15 source dependencies,
earlier pages and service root destination remain unchanged.
