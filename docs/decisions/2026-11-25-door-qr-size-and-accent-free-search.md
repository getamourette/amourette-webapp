# The door reads a larger email QR two ways, and search folds accents in SQL

Date: 2026-11-25 (#484)

**Email QR at 320 px, scanner alternating two regions.** The confirmation email
shows the arrival QR at 320 CSS px instead of 240. The door camera decodes, on
alternate 250 ms ticks, the whole frame shrunk to 800 px and the centred square at
full resolution (`lib/arrival-frame.ts`).

Why both, and why the email size matters most: `scripts/test-arrival-scan.mts`
films the real email attachment at its rendered width in two dim-room scenarios.
Frames read out of 10 (close and slightly out of focus / held further away):

| Email QR | Whole frame only | Both regions |
|---|---|---|
| 240 px (before) | 0 / 0 | 0 / 2 |
| 320 px | 10 / 8 | 10 / 10 |

The full-resolution crop proposed in the review does not fix the 240 px QR on its
own, and it reads a blurred image worse than the shrunk frame, so it is added as a
second pass, never as a replacement. 320 px stays under the 360 px image and fits a
375 px phone's mail column.

**Search folds accents in SQL, without the `unaccent` extension.**
`private.search_fold` normalizes to NFD and removes combining marks U+0300 to
U+036F, then lowers the case. It covers French and Spanish names, needs no new
extension on either hosted project or in the PGlite tests, and makes NFC and NFD
input equal. Ligatures (`œ`, `æ`) are not folded; accepted.

A reservation matches when every typed word appears in its email, first name or
reference, or when its whole first name is one of the typed words. Only first
names are stored, so a typed surname must not hide the guest ("Chloé Martin" finds
Chloé); it may also list other guests named Chloé, which the door tells apart by
email and reference.
