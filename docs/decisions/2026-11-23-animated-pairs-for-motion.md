# A change about motion is proven by an animated before/after pair

Date: 2026-11-23

When a change is about movement (animation, transition, flash, loading state,
scroll, reveal), still captures are not proof. The pull request shows an animated
`BEFORE` / `AFTER` pair, side by side, recorded by the browser test at the mobile
viewport (`AGENTS.md`, "Proof by change type"; method in `docs/workflow.md`,
"Motion needs an animated pair"). Motion that cannot be recorded honestly is named
on the Risk line of the founder card.

The format is an animated GIF, hosted like the other captures on
`refs/pr-evidence/<N>`, with no commit on the pull request branch. The original
video is embedded in the T3 Code thread message that presents the pull request.

*Why:* a flash or a transition lives between two stills; the founder could only
judge it by testing on his phone, which the proof rule exists to avoid. GIF is not
a preference but the only format that works from an agent: GitHub plays a GIF given
as an image address, but does not play a video given as an address (broken image,
plain link, `<video>` tag removed; checked on #470). Only a video dragged into the
web editor plays, and GitHub has no API for that upload. The video stays the better
recording, so it goes where the founder actually reads, in T3 Code.

This extends "Captures as before/after pairs" (same date); it replaces nothing.
First real use: #469 (the Reserve button without a flash).
