# Guest reservation pages: UX pass from the launch rehearsal

Date: 2026-11-20 (#405)

Marwane's 18 points from the 2026-11-19 rehearsal on a phone. Presentation only:
no payment, credential or schema change.

- **The event page opens on the form.** Venue, date and address fit in a short
  header; the deposit rule and the free-cancellation deadline sit in one notice
  just above the consent box. Why: the guest came to reserve, and the long
  explanation pushed the first field below the fold. The full rules stay one tap
  away in the reservation conditions.
- **A refusal is rendered just above the button that caused it and scrolled into
  view.** Why: the unpaid-hold refusal appeared under the submit button and the
  payment note, out of sight.
- **The form keeps its waiting state until the next page replaces it.** Why: the
  saved-attempt prompt ("Already started a reservation?") flashed between the
  credential and the redirect to Checkout. A page restored from the
  back/forward cache resets that state.
- **Venue times name their zone only on a device whose clock reads differently.**
  The dedicated "Venue time zone" row is gone. Why: for a guest in Paris it was
  noise; for a guest elsewhere the inline note ("Paris time") is clearer. The
  comparison uses the wall clock at that instant, so Berlin shows no note.
- **The displayed reference is the first eight characters of the identifier.**
  The full identifier stays in a "Need help?" area and in the support email
  subject. Why: staff search matches any part of the identifier, so the short
  form is enough at the door and readable aloud.
- **On the reservation page the QR comes first, one status block states the
  outcome (refunded, refund in progress, deposit kept, payment window closed)
  with the amount, cancellation is separated from the other actions, and
  "Find my reservation" is offered only when the reservation could not be
  opened.**
- **The form's privacy line no longer names the operator.** It reads "We use your
  details to manage your reservation" with the privacy-policy link; the operator
  is named in the reservation conditions and the privacy policy. To confirm
  with the privacy policy owner, together with the removed waitlist sentence
  "You have not been subscribed to marketing emails" (no legal requirement was
  found for it in the code or the policy).
- **Left open, on the issue:** the cancellation readback wording (9), single-use
  email links (10), the wording of a superseded link (11), the "non-binary" label
  (16) and the saved-attempt prompt on a new attempt in the same tab (18).
