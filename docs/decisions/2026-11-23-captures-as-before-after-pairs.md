# Pull request captures are shown as before/after pairs

Date: 2026-11-23 (follow-up to #419)

Captures in a pull request description are grouped by screen and language. Each
group has a level 3 title naming the screen and the language, then a two-column
table: `BEFORE` on the left, `AFTER` on the right, in bold capitals, always in
that order. A new screen writes `new` in the left cell. Several captures of the
same screen are rows of the same table. Listing all the "before" captures and
then all the "after" captures is not allowed. The format is in
`docs/workflow.md`, "Proof and the founder card".

*Why:* on the first pull request that used the founder card (the shorter
reservation emails), the founder received two "before" captures followed by two
"after" captures, with plain-text captions. He could not compare a screen with
its new version without scrolling back and forth, and could not tell at a glance
which was which. This is the "learn from escaped defects" rule applied to the
process itself: his remark becomes a line of the rule, the template and the
`ship` skill, so the next pull request arrives in the right shape unasked.

Verified on the pull request that introduced it: on GitHub at 390 px both
captures of a pair stay side by side (about 140 px each, no horizontal scroll),
and on a computer they display at full size. Stacking a pair vertically under
one title was the alternative; it keeps every word readable on a phone but
brings the scrolling back, so it was not kept.
