# Companion emblem exploration — round 10

Mode: built-in image generation for a new board, followed by an edit using that
board as the reference image. The selected image is `generated-concepts.png`.
The lettering was not generated or edited in this round: all live compositions
reuse the outlined round 9 wordmarks without changing their paths or spacing.

## Initial generation

Use case: logo-brand. Create a polished designer's exploration board for three original companion SYMBOLS for AMOURETTE. This is a new emblem exploration, not a typography board. Amourette is an elegant discreet live dating app for adults physically in the same bar tonight: secret reciprocal attraction, a chat only when both choose, and a gentle first hello in person. Existing wordmark is uppercase widely spaced Cormorant Garamond with a custom elegant swash R. These emblems must harmonize with its moderate thick-thin serif contrast. Brand should feel intimate, assured, warm, a little flirtatious, never bridal, infantilized, sleazy or exclusive luxury.

Layout: one 1536 by 1024 or similarly high resolution board, three evenly separated vertical columns, each showing ONE large isolated emblem and the exact same emblem smaller underneath. Small quiet labels A, B, C only. No wordmarks, captions, descriptions, names or extra text. Flat near-black wine background #120A0F everywhere. All symbols solid cream #EFE6E0, perfectly sharp flat vector-like silhouettes. NO lighting, gradients, bloom, shadows, texture or dimensional effects.

A: 'The shared A'. A bespoke capital A monogram, an original simplified elegant serif A silhouette built from two sweeping tapered strokes which meet at the top. Its crossbar is an airy shallow curved bridge, giving the rigid letter one quiet gesture of connection. Fine-to-thick calligraphic variation, confident not spindly. Graceful but compact, small distinct feet, no circle around it. It MUST still read A immediately. One memorable structural detail, not many flourishes.

B: 'The fleeting tie'. An exquisitely drawn compact ribbon knot, two asymmetric fluid open loops touching at a tiny woven crossing and two very short tapered tails. Sophisticated continuous calligraphic form with beautiful thick-to-thin transitions, compact near-square silhouette that survives as an app icon. A gesture of two lives briefly tying together. NOT a cute gift bow, no long dangly tails, no decorative wedding ribbons, no infinity glyph, no cartoon bow. Make this bespoke and confident rather than generic outline clipart.

C: 'The exchanged glance', the intentionally unexpected direction. Two complementary short curved organic forms turn toward each other, like two people noticing each other. Their shared empty space suggests a quiet spark or almond aperture. An abstract balanced compact symbol, bold enough to recognize small, smooth sculpted thick-to-thin forms. NOT a literal eye, no pupils, no faces, no yin-yang, no heart, no infinity sign, no interlocking C letters, no tech star. Strive for an unexpected memorable mark that suggests reciprocity and anticipation while remaining simple.

Strict constraints: exactly three genuinely different concepts. The lower small examples must faithfully repeat each large shape. Professional original identity design with few intentional contours and balanced negative space. Avoid extra ornaments, frames, hearts, generic sparks, champagne gold and typography.

## Selected edit

Edit this three-emblem exploration board. Preserve the first A monogram and the second asymmetric ribbon knot as the same designed forms, but REMOVE ALL BLOOM, glow, shading, blur, shadows, gradients, white fine outlines and lighting effects. Render the emblems as entirely SOLID FLAT CREAM #EFE6E0 with sharp clear contours, including flat dark negative-space openings; background must be PERFECTLY UNIFORM #120A0F with NO illumination whatsoever. Flat black-and-white-style vector artwork. Remove the vertical divider lines. Keep the three-column layout, large emblem above a faithful smaller repetition.

Replace ONLY the third design with a genuinely new horizontal emblem named 'The first exchange': exactly two elegant complementary curved quotation-mark forms facing one another, slightly staggered vertically, with a small shared space between them. Each form is a single solid tapered calligraphic comma-like silhouette, simple and precise, linked visually to the thick-thin contrast of the serif A. The pair should evoke two voices or two people responding to each other, the first hello. NOT interlocked, not touching, not two C letters. Overall orientation horizontal, NOT vertical. NO flame, no yin-yang symbol, no leaves, no infinity, no heart, no literal eye or pupils, no star. The interior empty space and the small separation are crucial. Original, compact, assured, memorable, restrained, intimate. Use the exact same new emblem for the small repetition. No text or labels. Only these three designs on one clean flat dark board.

## Vector preparation

`build.mjs` isolates the three large symbols, thresholds them, and fits SVG
contours using Potrace. The live page uses exact flat brand colours, not the
generated source's texture. Each small-size SVG has a slight stroke lift; it is
an optical test rather than a finished micro-size drawing. Compositions embed
the existing round 9 wordmark contours without modification.

These emblems remain open concepts. Manual contour refinement, final weight,
minimum size, founder approval, and any similarity clearance are still open.
