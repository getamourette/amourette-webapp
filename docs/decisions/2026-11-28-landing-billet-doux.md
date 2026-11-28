# The landing page is a "billet doux": one printed object per section, booking first

**Decision (2026-11-28, #603, chosen by Marwane over ten rounds of mocks):** the
landing page `/` is redesigned as a set of printed objects on the dark bar
background, each section a different one, so the page reads like a night out and
not like a template:

- **Hero:** the horizontal logo with a plain Instagram icon at the top right, the
  headline `Savoir si tu lui plais aussi.`, then a cream **ticket** for the next
  night: date, `au bar <venue>`, the address, three fields (hours, deposit,
  refunded on arrival), an `Entrée gratuite` rubber stamp, a perforation and the
  ruby `Réserver sa place` button with the approved line under it.
- **How it works:** tear-off coupons. **Reassurance:** a sheet marked with a red
  felt pen and one handwritten note. **FAQ:** toggles with a one-line answer.
  An Instagram block, then a footer shaped as the ticket's stub.

Choices inside it, each with its reason:

- **The eyebrow and the subhead paragraph are removed.** In every mock the
  paragraph under the headline read as filler and pushed the ticket down; the
  ticket now carries the date, the venue and the deposit, and the coupons explain
  the mechanism. `docs/voice.md` is updated to match.
- **The hours appear once,** on the ticket. They are also on the night's page and
  on Instagram; repeating them made every block heavier.
- **The `Entrée gratuite` stamp sits on the deposit and refund fields.** The voice
  rule is never to write *gratuit* without the deposit in the same sentence. The
  stamp is read together with `Caution 10 €` and `Remboursée à l'arrivée` it
  overlaps, and the line under the button repeats the full sentence.
- **The button goes to the next open night read from the data, never a hardcoded
  id.** A new service-only function `launch_next_booking_event()` returns the open
  night whose waiting room opens first, through `GET /api/launch/next`. The page
  reads it in the browser, not at build or on the server: the build has no
  database, and the browser read keeps the page static and lets the browser tests
  mock the night. While it loads, or when no night can be booked or the read
  fails, the waitlist replaces the button rather than showing a dead link.
- **`?via=` is relayed** to the night's page with the same closed set as #561, and
  nothing else: no cookie, no storage.
- **The page paints in French on the server** (`useBrowserLocale("fr")`), then
  follows the stored or browser language. The audience is Paris; an English first
  paint flashed before switching for most visitors.
- **Two fonts are added for this page only.** Caveat Brush for the single
  handwritten note. Fraunces with its optical-size axis, self-hosted under its own
  family name in `app/(landing)/fonts/` (OFL): a second `next/font/google`
  Fraunces would share the root instance's family name and one would silently win;
  adding the axis to the root instance changes the headings of every other page;
  and the build `next/font` downloads drops the "e" crossbar at large optical
  sizes. The rest of the app keeps its fonts unchanged.
- **A returning participant still gets the existing home** (their profile and
  nights), not the ticket, and the session error view is unchanged. This page is
  for first visits from Instagram.
- **The stub footer is kept "for now".** Marwane will review it on the real page.

**Not decided here:** English and Spanish copy are agent translations of the
approved French, to be reviewed. The ticket's top right shows the city from the
data, not a night number.
