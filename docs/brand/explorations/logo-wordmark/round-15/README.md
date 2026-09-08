# Ribbon refinement

Round 15 for #39, 2026-09-08. After the context comparison, Marwane selected
the ribbon as the direction to pursue and requested refinement while keeping
the current version available as a fallback. C and the earlier studies stay
preserved history. The final ribbon drawing and wordmark weight remain open.

## Three specimens

- **B / Original:** loaded directly from `../round-10/fleeting-tie.svg`.
  This file and its earlier compositions are not edited or replaced.
- **B1 / Refined:** `ribbon-refined.svg`, a native SVG redraw of the original
  three filled ribbon shapes. The asymmetry, upper-loop height, left-loop
  breadth, crossing position and longer left end are retained as reference
  landmarks. Fewer explicit cubic curves smooth the upper and lower left
  loop, clean the tiny point on the upper loop's return, and simplify the
  crossing and tail contours. The new contours are an interpretation, not
  a lossless simplification of the original or an approved identity master.
- **B2 / Shorter ends:** `ribbon-shorter-ends.svg`, the agent-proposed free
  variation. It uses the same new loop geometry as B1, while shortening the
  descending left end and the right end. The right end's top moves down
  slightly to leave more space below the crossing. No other candidate is
  fused into this drawing.

## Method

The original path endpoints and control points were inspected in normalized
512 × 512 coordinates, applying its existing group transforms. New cubic
curves were then authored directly in that coordinate system. There is no
new bitmap generation, image tracing or automatic smoothing pass in this
round. The SVG source is the editable drawing; no build script is required.

All three specimens use the same viewBox, scale and placement. Neither new
drawing is recentered or enlarged to disguise its differences. In particular,
B2's shorter ends intentionally leave more empty space below the emblem.

The comparison embeds the unchanged round 9 `balanced-wordmark.svg` and
`fuller-wordmark.svg`, preserving every letter contour and the R/E spacing.
The weight control changes all three wordmarks together. More presence is
only the initial viewing setting, not a final weight decision.

The inspection area shows a complete mark and a crossing crop with viewBox
`225 273 130 92`. “Overlay original outline” adds the original contours as a
thin blush outline (wine on paper), in the same coordinates. This outline
is a diagnostic aid and is never added to the actual emblem files. The page
also compares unmodified 64px, 32px, 24px and 16px SVG specimens in cream,
ruby, and ink on paper. No micro-size optical master is claimed: at 16px,
the fine crossing still loses detail.

## Preview

`http://100.100.155.8:8079/round-04/round-15/`

The existing service serves a copy of this folder and already contains the
round 9 and 10 dependencies. Only this new directory is copied into the
preview. Earlier pages and the service's root destination stay unchanged.

## Review

The agent's provisional preference is B1: it retains the longer left end's
movement while making the contour construction more deliberate. B2 is a
useful compact alternative, but its shorter ends slightly reduce that sense
of movement. Marwane has not selected either refinement.

Next feedback should compare B1 against original B at normal size before
judging the enlarged contours. Whether to keep these changes, make another
local correction, develop a distinct small-size version, or return to the
original remains open. No application integration, commit, push or PR is
included in this exploration.
