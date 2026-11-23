# The email link opens the reservation without a button

Date: 2026-11-20 (#405)

- **The access page runs the proof exchange by itself on load and keeps "Open my
  reservation" only as a fallback.** Why: the intermediate page with one button
  read as a pointless step on a phone. The protection the button gave is kept
  by other means: the proof lives in the URL fragment, which never reaches the
  server, and the exchange is still a POST issued by the page script after the
  session-storage probe, so a mail scanner or link preview that only fetches
  the page does nothing. The script also waits for a visible document, so a
  page prerendered or opened in the background rotates no credential. A
  scanner that runs scripts in a visible page could exchange the proof; that
  does not lock the guest out, because repeating one proof returns the same
  renewed credential for the life of the link.
- **Shipped as its own commit** so it can be reverted alone if Marwane prefers
  the explicit button.
