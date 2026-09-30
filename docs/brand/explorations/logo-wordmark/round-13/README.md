# Handwritten AMOURETTE + two people and a heart

Exploration requested by Marwane on 2026-09-08. B (the ribbon) and C (the first
exchange) remain his favourites; this test does not replace or modify them.
The earlier serif wordmark also stays intact. No app integration is included.

## Scope

- Uppercase `AMOURETTE` in real, reproducible handwriting fonts.
- The same emblem above each wordmark: two identical faceless people side by
  side, at the same size and height, with a heart in the middle. No hair,
  clothing, skin tone, or differing anatomy is used to imply gender.
- Line and solid treatments use the same two-person arrangement. The heart
  can share the ink or use brand ruby. All remain unapproved design studies.
- Letter-spacing options are 0, 0.040em, and 0.080em. The last is the initial
  setting, carrying forward the preference for airy uppercase specimens.
- Oooh Baby is the deliberately different, agent-proposed lettering option.

This round uses native SVG and real fonts, not image generation. Lettering
is live browser text in SVG, not outlined export artwork. The browser fits
the SVG text width and actual canvas-measured ink height to a shared specimen
area, with a common maximum visible height and width. This avoids normalizing
handwriting by its much larger ascender/descender line box. No fallback font
is shown under another font's name.

## Self-hosted fonts

Unmodified font binaries and their accompanying SIL Open Font License files
were downloaded from the official Google Fonts repository on 2026-09-08.
These are exploration assets, not new application font dependencies.

| Specimen | Weight | Local file | Upstream source |
| --- | --- | --- | --- |
| Caveat | 500 | `fonts/caveat.ttf` | [Caveat](https://github.com/google/fonts/tree/main/ofl/caveat) |
| Bad Script | 400 | `fonts/bad-script.ttf` | [Bad Script](https://github.com/google/fonts/tree/main/ofl/badscript) |
| Kalam | 400 | `fonts/kalam.ttf` | [Kalam](https://github.com/google/fonts/tree/main/ofl/kalam) |
| Oooh Baby | 400 | `fonts/oooh-baby.ttf` | [Oooh Baby](https://github.com/google/fonts/tree/main/ofl/ooohbaby) |

Each licence is preserved beside its font as `<slug>-OFL.txt`.

## Segoe specimens

Microsoft describes [Segoe UI](https://learn.microsoft.com/en-us/typography/font-list/segoe-ui)
as a sans-serif screen/interface family. Its handwritten relatives are
[Segoe Print](https://learn.microsoft.com/en-us/typography/font-list/segoe-print)
and [Segoe Script](https://learn.microsoft.com/en-us/typography/font-list/segoe-script).
Segoe UI is included as a comparison, not labelled as handwriting.

No Microsoft font binary is downloaded, bundled, or redistributed here.
The page attempts a local font lookup for only those three requested families
on the viewing device. A specimen is enabled only after its `FontFace.load()`
succeeds; an unavailable or browser-blocked family is labelled as not detected
and never silently substituted. This is not a full installed-font inventory,
and no font-detection result is transmitted or persisted. The Linux server
does not have the Segoe fonts, so their actual appearance must be viewed on a
device that supplies them, such as the founder's Windows PC.

## Assets

- `people-heart-line.svg`: the initial line treatment.
- `people-heart-solid.svg`: the filled alternative, same identical figures.
- `index.html`: responsive font comparison, local Segoe detection, spacing,
  emblem and colour controls, a focus view, and small-size specimens.

Choosing a font, final custom lettering, emblem refinement, final colour,
minimum size, and production licensing/integration remain open.
