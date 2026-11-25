# Door scan shows a verdict, never an automatic confirmation

Date: 2026-11-25 · Issue #520

At the door, in noise, low light and with a queue, the founder must understand a
scan without reading. The scan result is now a verdict: a coloured panel with an
icon and one short title, shown with a short entrance animation and, where the
browser has the Vibration API (Android Chrome, not Safari), a haptic pattern.

- **Green, "Valid reservation":** the only state with a Confirm arrival button.
- **Solid green, "Arrived":** shown only right after this founder confirmed.
- **Amber:** "Already arrived" (the code was used before: possible QR sharing),
  "Wrong night", "Too early", "Arrivals closed". Talk to the guest.
- **Red:** "Cancelled", "Event cancelled", "Not paid", "QR no longer valid",
  "Unknown code", "Not a reservation QR". Do not admit on this code.
- **Grey, "Not checked":** the server did not answer; nothing is known.

While the lookup runs after a camera read, a "Code read" panel marks the moment the
code was read, so the swap from camera to result is never silent.

**Why:** confirming an arrival requests the deposit refund, so the verdict never
confirms by itself; the founder's tap stays the only trigger. Already arrived is
amber rather than green so a reused code is never mistaken for a valid one. No
sound: a bar is too loud for it to help, and Safari blocks audio without a
gesture. Animations are dropped under `prefers-reduced-motion`; the colours and
titles carry the meaning on their own.
