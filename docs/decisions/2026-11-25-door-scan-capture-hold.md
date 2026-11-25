# Door scan holds the read frame for a moment, without slowing the lookup

Date: 2026-11-25 · Issue #534 · Builds on `2026-11-25-door-scan-verdict.md`

When the door scanner decodes a QR, the camera frame freezes with a green frame
on the code and a short flash, and stays on screen for 350 ms, or until the
server answers if that is later, with "Code read · Checking reservation…" under
it. Then the verdict appears.

**Why:** the live video used to vanish the instant a code was decoded, so on a
fast network the swap to the verdict still felt like a jump; the founder needs to
see that this code, the one in front of the camera, was read. The reservation
lookup starts at the decode, during the hold, so the hold only costs time when the
server answers in under 350 ms (at most about half a minute over a hundred
guests). An idle delay before the lookup was rejected: it would slow every guest
without telling the founder anything. Under `prefers-reduced-motion` the frozen
frame and green frame stay, without the flash or the closing motion.
