# The Stripe balance is funded for the fees, not for the deposits

**Decision (#408).** Before each night, the founder adds to the Stripe EUR
balance only the fees the night's refunds will lose (capacity x EUR 0.69 on a
EUR 10 card deposit, plus a margin and any negative balance): EUR 30 for 30
places. Payouts stay manual so the deposits remain on the account until their
refunds. The procedure is step 8 of "Reservation payments go-live" in
`docs/production-cutover.md`.

**Why.** Each guest's deposit is on the account on the night, available or
still pending, and pays for that guest's refund; only the fee Stripe keeps is
missing. On 2026-11-25 a two-day-old payment was refunded at once with nothing
available, so Stripe did not wait for funds. Funding the full capacity (about
EUR 330) would only shorten a delay that was never observed: if Stripe held a
refund back as its documentation says, it would wait for that deposit to
become available, about a week, far from the 45-day failure. The founder
watches pending refunds the morning after each night instead. Night D
(2026-12-02) tests a refund larger than the available balance with nothing
pending; revisit this decision if that refund is held.
