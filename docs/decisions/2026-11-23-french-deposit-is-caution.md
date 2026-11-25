# The French deposit is a "caution", and a retained deposit is "not refunded"

Date: 2026-11-23 (#478), decided by Marwane

The approved reservation policy (`docs/launch-reservation-policy.md`) always said
"caution" in French, but the guest copy shipped with "dépôt", and no decision
recorded the switch. The bug review of 2026-11-20 also found that "le dépôt est
conservé" reads in French as "your money is kept safe for you", the opposite of
the rule, and the Spanish "se conserva" has the same problem.

Decision:

- Every French guest surface of the reservation (event page, reservation
  conditions, reservation and cancellation screens, lifecycle emails) says
  "caution", never "dépôt". "Caution" is the word a French guest already knows
  for money held against a commitment and returned when it is kept.
- A retained deposit is worded as "n’est pas remboursée" in French and "no se
  reembolsa" in Spanish, never "conservé(e)" or "se conserva". English keeps
  "retained", which is unambiguous. "Caution retenue" stays acceptable in French
  where a noun phrase is needed.

This changes wording only: the refund rule and the policy version are unchanged.
The app Terms and the privacy policy (`lib/legal-content.ts`,
`lib/booking-privacy.ts`) still say "dépôt" and are left for their next dated
legal update. `scripts/test-booking-copy.mts` fails if "dépôt" or the ambiguous
verbs come back in the guest copy.
