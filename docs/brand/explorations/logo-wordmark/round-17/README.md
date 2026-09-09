# Small-size ribbon comparison

Round 17 for #39, 2026-09-08. Marwane approved moving on to a favicon
comparison after confirming the core identity: B1, More presence lettering,
vertical main signature, horizontal companion, wordmark alone in the app
header, and cream ribbon on velvet for the phone icon.

This round explores an optical favicon drawing only. It does not reopen
the main emblem or lettering and does not authorize app integration.

## Candidates

- **B1 / Unchanged ribbon:** fetched directly from
  `../round-15/ribbon-refined.svg`. No path or source transform is changed.
- **F1 / Optical ribbon:** `ribbon-optical.svg`. A separate, native SVG
  adaptation in the same 512 × 512 coordinates. The two loops have broader
  fine returns and less tapered inner terminals. The long left end is
  separated from the upper loop into its own filled shape, replacing the
  fragile crossing junction. The short right end starts lower, with a wider
  root. Four filled paths replace the reference's three compound shapes;
  the loop heights, broad left loop and unequal loose ends remain recognizable.
- **F2 / Loop shorthand:** `ribbon-shorthand.svg`. The agent's free variation
  uses exactly F1's two loop paths and omits both loose ends. Its simpler
  silhouette is a test of how much the ribbon can lose before becoming a
  different sign. It is not a proposal to replace B1 at standard sizes.

Neither F1 nor F2 is a lossless simplification or an approved favicon master.
No image generation, bitmap tracing, filter or automatic contour offset is
used. The separate SVG files are the editable drawings.

## Shared framing and colour

All candidates retain the same source viewBox, `0 0 512 512`. There is no
candidate-specific centring, scale or stretch. Original B1 occupies about
84% of that width. F2 intentionally leaves the former ends' space empty;
it is not recentered to conceal the omission.

`artwork.mjs` wraps each complete source drawing with the same cream
`#EFE6E0` colour and velvet `#120A0F` background. The background's 80-unit
corner radius is a favicon-container proposal, not a new phone-icon rule.
The rounded tile remains separate from each transparent emblem SVG.

**Size labels describe the full square tile**, not visible ribbon width.
The 16px favicon contains roughly 13.4px of ribbon width. This differs from
round 16's visible-width specimen labels. The 32px row is a larger tile
specimen, not a claim that browser tabs display a 32px CSS icon.

## Rendering modes

- **1× PNG:** source and displayed sizes match (16→16 and 32→32 pixels).
  This is the initial, stricter low-density test.
- **2× PNG:** double-density sources at the same displayed sizes (32→16
  and 64→32). A 32px file can therefore represent a 16px tile on a 2× display.
- **Live SVG:** the browser rasterizes the same framed drawing at the
  current screen density and zoom.

Set browser zoom to 100%. OS display scaling and device pixel ratio still
matter; the page reports the current ratio when a control is used. Each
candidate is shown against both light and dark browser-chrome mockups,
while the icon background itself stays velvet.

The inspection section pairs a 128px vector with its 16px PNG enlarged 8×
using nearest-neighbour display. This is diagnostic, not the selection size.
The inspection raster always stays 16px/1×, independently of the rendering
control above.

“Try in this tab” updates only this page's two favicon links, to that
candidate's 16px and 32px PNGs. The browser chooses which it uses; some
browsers may delay an icon refresh. Controls do not persist or record an
approval. Reloading restores original B1 and the 1× specimen setting.

## Reproducing the PNGs

From the repository root:

```sh
node docs/brand/explorations/logo-wordmark/round-17/render-previews.mjs
```

The script uses the already available `sharp` package and the same SVG
wrapper as the browser page. It writes nine review-only PNGs under
`previews/`: three candidates at 16, 32 and 64 pixels. There are no dependency
changes, app assets, ICO bundle or final export pack in this round.

## Review status

The agent provisionally favours F1 for the favicon: its added weight helps
the small low-density sample retain the loops and ends. It is visibly
heavier in the enlarged view, which is why it must not replace the main B1
drawing. F2 is readable but loses the ribbon's dangling movement and feels
more like an abbreviated pair of loops. Keeping unchanged B1 is still a
valid outcome if the optical alteration is too far from the selected mark.

Founder selection remains open. General minimum sizes, clear space,
other colour applications and the final export pack remain separate work.
All previous exploration files are preserved. No application integration,
commit, push, PR, shipping or preview-service reconfiguration is included.

## Preview

`http://100.100.155.8:8079/round-04/round-17/`

Only this new directory is copied into the existing preview service's
`round-04/` directory. Its round 15 source dependency, earlier pages and
the service root redirect remain unchanged.
