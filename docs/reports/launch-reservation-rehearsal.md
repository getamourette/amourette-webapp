# Launch reservation rehearsal (#188)

Working record of the end-to-end reservation rehearsal: payment, cancellation,
arrival and refund recovery on a physical phone. It becomes the founder runbook
once both passes are done. Policy reference:
[launch-reservation-policy.md](../launch-reservation-policy.md).

**Status on 2026-11-19: pass 1 is done.** Money and access rules held on every
step; the defects found are interface and copy issues, plus the rate limit
tracked in #400. Pass 2 (EU production) is not run yet.

## Two passes

| Pass | Database | Application | Data |
| --- | --- | --- | --- |
| 1 | Shared development Supabase (`us-east-1`) | Branch preview of `feature/launch-reservation-rehearsal` | Prepared in advance by the agent, described below |
| 2 (final) | EU production (#280), after cutover | `https://getamourette.com` | Recreated by hand through the real journey, then cleaned up |

No seed script exists for these fixtures and none must be written against
production. Pass 2 follows "Recreating the fixtures by hand" below.

## Pass 1 environment

- Preview: `https://amourette-webapp-git-feature-launch-reservati-70abf7-tothe-moon.vercel.app`
  (Vercel-protected; the tester signs in to Vercel on the phone).
- Stripe: the sandbox account ("amourette sandbox", test mode). Test card
  `4242 4242 4242 4242`, any future expiry, any CVC.
- Venue: `Rehearsal 188 (test)`, slug `rehearsal-188-test`, created for this
  rehearsal only. The permanent QA rooms and the `demo` venue were not touched.
  The venue resolves by slug only, so it works before and after the venue
  listing is closed (#364).
- Settings applied with founder approval on 2026-11-16, before the pass:
  - Vault `launch_worker_url` pointed at the preview's `/api/launch/process`
    (the existing worker secret and protection bypass already matched);
  - preview reservation mail enabled, limited to eight founder-owned Gmail
    aliases through `LAUNCH_EMAIL_TEST_RECIPIENTS`, tracking disabled;
  - a Stripe sandbox webhook endpoint for the preview and its
    `STRIPE_WEBHOOK_SECRET`; one preview redeploy.

### How the fixtures were created

- Venue, nights and reservation settings: the ordinary founder commands
  (`save_venue_details`, `admin_set_venue_address`, `schedule_venue_night`,
  `admin_configure_launch_event`), run through the Supabase MCP under Marwane's
  founder identity. Nothing was inserted directly into a table.
- Reservations: the public guest journey of the preview (`/api/launch/credentials`,
  `/api/launch/checkout`, Stripe-hosted Checkout paid with the test card in a
  headless browser, `/api/launch/checkout` resume, `/api/launch/arrival-qr`).
  The helper holds no database or Stripe credential, refuses any other origin
  and is kept outside the repository with the guests' access capabilities.
- Waitlist: `/api/launch/waitlist`, while the night was full.

The pass was planned for 2026-11-16 and run on 2026-11-19. The first set of
nights had moved past their deadlines, so two nights were added on the same
venue on the morning of the pass and booked again through the same journey.

### Nights used on 2026-11-19 (venue time, Europe/Paris)

| Night | Schedule | Capacity | Purpose |
| --- | --- | --- | --- |
| Arrivals `88ecc2ae-737a-4b94-9f85-9e3bc4428ad6` | Nov 19, 11:00 to 19:30 | 12 | Arrivals; already past the free-cancellation deadline (late cancellation) |
| Monday `e4ba7645-af89-45b9-9201-e6379ff508a0` | Nov 23, 20:00 to Nov 24, 02:00; free cancellation until Nov 21, 20:00 | 3 (full) | Timely cancellation, recovery, waitlist |
| Deadline `5134b98c-811b-49ad-a209-7f9c214bb0b3` | Starts Nov 21, 11:08; free cancellation until Nov 19, 11:08 | 8 | Deadline crossed during cancellation, unpaid holds |
| Thursday `11a26b83-5d1a-45c9-a002-af4e5da66a10` | Nov 19, 20:00 to Nov 20, 02:00 | 3 | Wrong-night QR (Malo) |
| Ended `1a54e3d6-65cf-4bba-8559-2036cb107228` | Nov 16, 14:15 to 14:45 | 2 | Expired QR, missed arrival corrected after the end |

### Guests

All paid EUR 10 in Stripe test mode. Addresses under `example.com` receive no
mail. The Gmail aliases belong to Marwane, the approved test recipient.

| Night | First name | Email | Use |
| --- | --- | --- | --- |
| Arrivals | Camille | `camille.a2.rehearsal188@example.com` | QR scan, confirmation, repeated scan |
| Arrivals | Camille | `camille.b2.rehearsal188@example.com` | Manual lookup with a duplicate first name |
| Arrivals | Inès | `marwaneazzouzi1+ines@gmail.com` | Confirmation email; left unscanned |
| Arrivals | Jade | `jade2.rehearsal188@example.com` | Mistaken validation corrected |
| Arrivals | Nina | `nina2.rehearsal188@example.com` | Staff network loss and readback |
| Arrivals | Hugo | `marwaneazzouzi1+hugo@gmail.com` | Late cancellation from the phone |
| Arrivals | Tom | `tom2.rehearsal188@example.com` | Cancelled late during preparation |
| Monday | Léa | `marwaneazzouzi1+lea@gmail.com` | Timely cancellation and full refund |
| Monday | Zoé | `marwaneazzouzi1+zoe@gmail.com` (EN) | Recovery link, cancellation preview, network loss |
| Monday | Lina | `lina2.rehearsal188@example.com` | Fills the night |
| Thursday | Malo | `malo.rehearsal188@example.com` | Wrong-night QR |
| Ended | Sacha | `sacha.rehearsal188@example.com` | Expired QR, no-show |
| Ended | Yanis | `yanis.rehearsal188@example.com` | Missed arrival corrected after the end |

Monday waitlist, in signup order: `marwaneazzouzi1+attente1@gmail.com` (fr),
`attente2b.rehearsal188@example.com` (en), `attente3b.rehearsal188@example.com` (es),
then the tester's own signup during the pass.

## Findings during preparation (2026-11-16)

1. **The scheduled reservation worker reached no deployment.** The Vault value
   `launch_worker_url` named a deployment removed since October; every minute
   the dispatcher received `410 Gone`, so no refund, hold expiry, no-show
   finalization or reservation mail was processed. Pointed at the preview for
   pass 1; on restart it processed six October test refunds that had been
   stuck. **It must point at production (or the EU project after #280) once
   the rehearsal ends.**
2. **No Stripe webhook reached the rehearsal preview.** The only sandbox
   endpoint targeted the October `#185` test domain. Fixed for pass 1 as above.
3. **Reservation mail was disabled on the preview.** A management link only
   exists in an email, so the phone could not open a prepared reservation.
   Fixed for pass 1 as above.
4. **Four end-to-end test accounts are in the founder allowlist** (`admins`) of
   the shared database, which is also today's production database. They must
   not be carried into the EU production project.
5. The Stripe-hosted form now renders its card fields inside an iframe;
   `scripts/test-launch-sandbox.mjs` still looks for `#cardNumber` in the page
   and would time out. Not changed here.

## Pass 1 step sheet

`P` is the preview origin above. Participant steps run on the phone; founder
steps at `P/admin/nights/<night id>`. The test guests' QR codes are shown on a
second screen (one at a time) and scanned with the phone.

### Participant: cancellation and waitlist (checklist carried from #192)

| Step | Action | Expected |
| --- | --- | --- |
| C1 | Open the management link from Léa's confirmation email. Then use "Find my reservation" with Zoé's address and open the link it sends; reopen Léa's link | Event details, deadline in Paris time, EUR 10, personal QR. Typing an email shows nothing and only sends a link. A reused link reopens the reservation for its seven-day lifetime (the exchange is idempotent); a newer link invalidates older unused ones |
| C2 | Léa: cancel, read the confirmation, confirm; reload | Full refund announced; one refund in Stripe test mode and its status on the page; one place released; no second refund |
| C3 | Hugo (arrivals night, past the deadline): cancel from his link | Retained-deposit warning, then a second tap confirms; no refund; place released; QR refused at the door |
| C4 | Deadline night: book from the phone, open the cancellation confirmation before the deadline, submit after it | First submission leaves the booking active and asks for consent again. "Keep my reservation" brings the QR back without a reload |
| C5 | Zoé: open the cancellation and keep the reservation; repeat with the phone offline during confirmation | QR stays valid when nothing was cancelled. During uncertainty the QR is hidden and the real outcome is read back before any retry |
| C6 | Deadline night: start four bookings with four addresses from the same connection, each in a new tab, and pay none. Founder: "Expire unpaid hold" on one; guest refreshes that tab | The fourth attempt is refused with the pending-payment message and no place is taken. Guests cannot cancel an unpaid hold; it expires or a founder expires it. The expiry is a request: the place frees once Stripe confirms the session is unpaid, and the guest page never mentions a retained deposit |
| C7 | Full night: join the waitlist from the phone. Founder: inspect order, language, email; Mark Contacted, Close entry, Return to Waiting; change the same entry from two sessions | Free signup, no payment. Order preserved. No mail sent, no place reserved. A stale change asks for a refresh |

### Founder: arrivals (checklist carried from #191)

| Step | Action | Expected |
| --- | --- | --- |
| A1 | Scan Camille (first address). Check the record, then Confirm arrival | Camera permission, readable preview, camera off after decode. Nothing is confirmed until the explicit action. Counts move by one, exactly one refund requested |
| A2 | Scan the same QR again; then from two founder sessions at once | Original verification and refund state shown; no second attendance or refund |
| A3 | Jade: confirm arrival, then Correct mistaken validation with a note and the checkbox | Attendance removed, counts updated, history kept, the refund already requested continues |
| A4 | Yanis (ended night): Correct a missed arrival with a note | Correction time recorded, attendance restored, one refund requested |
| A5 | Find a guest without QR: search "Camille" | Two results, told apart by email or reference; a verification note is required; keyboard, scrolling and submit stay reachable |
| A6 | Scan Tom, Hugo (cancelled), Malo (other night), Léa, Sacha (ended night), the venue QR and an unrelated QR; refuse camera permission once | Each is refused with its reason and no effect; manual lookup remains available without the camera |
| A7 | Nina: scan, cut the phone's network, confirm, restore the network | The result is read back before any retry; no duplicate attendance or refund |
| A8 | Scan a guest and tap Next guest without confirming; then Skip, not arrived (#474) | An "Arrival not confirmed" prompt appears first. Confirm arrival records the arrival and moves on; Skip leaves the guest unconfirmed and records nothing |

## Pass 1 results

| Field | Value |
| --- | --- |
| Date | 2026-11-19, 09:20 to 12:55 Paris |
| Device and browser | iPhone 17 Pro, Safari (guest and arrivals); desktop Chrome (admin waitlist, missed arrival, hold expiry) |
| Application | Commit `8a16bf2` (main at `2ec7c33` plus the step sheet), deployment `amourette-webapp-ctzr0582f` |
| Preview URL | `https://amourette-webapp-git-feature-launch-reservati-70abf7-tothe-moon.vercel.app` |
| Stripe evidence | Sandbox refunds, for example `re_3UdQaiPgZ5eRzHuD0p1bQq8M` (Léa, timely cancellation) and `re_3UdQXyPgZ5eRzHuD1kSAmCr4` (Camille, arrival) |

| Step | Result | Defects and notes |
| --- | --- | --- |
| C1 | Pass | Noticeable delay after "Open my reservation"; recovery shows only the neutral message. Reused links reopen by design (expectation corrected above) |
| C2 | Pass | Refund succeeded in Stripe 5 s after cancelling; one refund. "Refresh status" has no feedback and repeated taps hit the rate limit |
| C3 | Pass (rules), defect (consent) | Tester did not notice the warning between the two taps: #401 |
| C4 | Pass | Deadline crossed between preview and confirm was refused and asked again; tester then confirmed (retained). "Keep my reservation" path not exercised |
| C5 | Pass with defect | QR visible during the uncertain state: #402 |
| C6 | Pass | Fourth hold refused before Stripe; founder expiry released holds in 16 s and 41 s. Refusal message rendered out of view; the guest page kept stale state while rate-limited (#400) |
| C7 | Pass with defect | Order, language, no mail verified. Admin clicks jumped and changed the wrong entry: #404. Stale-change guard verified on the server; on-screen conflict message not seen. Léa's freed place was booked directly, not offered to the waitlist (by design) |
| A1 | Pass | One arrival, one refund succeeded within a minute |
| A2 | Pass (single session) | Concurrent scan from two sessions not exercised |
| A3 | Pass | Correction recorded with `refund_preserved = true` |
| A4 | Pass | One refund for the corrected missed arrival |
| A5 | Pass | |
| A6 | Pass (no effect), defect (reasons) | Other-night and ended-night QR get one vague "check your connection" message: #403. Camera refusal not exercised |
| A7 | Pass | Offline confirm read back as not confirmed; one arrival, one refund |

### Totals after the pass

| Night | Charged | Refunded | Retained |
| --- | --- | --- | --- |
| Arrivals | 7 × EUR 10 | EUR 40 (Camille ×2, Jade, Nina) | Tom, Hugo (late cancellations); Inès still confirmed |
| Monday | 4 × EUR 10 | EUR 10 (Léa) | none |
| Ended | 2 × EUR 10 | EUR 10 (Yanis) | Sacha (no-show) |
| Deadline | 1 × EUR 10 | none | Delphine (late cancellation); three unpaid holds released |

No refund was pending, failed or awaiting review at the end of the pass.

### Issues opened from pass 1

- #400 Keep launch reservation rate limits from blocking guests who share an
  address (opened separately). In pass 1, two refusals came from the tester's
  phone during a normal journey; founder scan and manual lookup are not limited,
  so the door cannot be fully blocked.
- #401 Require an explicit acknowledgement before a late cancellation forfeits
  the deposit.
- #402 Hide the arrival QR while a cancellation outcome is uncertain.
- #403 Give the door a clear reason when a scanned reservation is for another or
  ended night.
- #404 Fix waitlist admin clicks that scroll, collapse or change the wrong entry.
- #405 Guest reservation pages: UX pass from the launch rehearsal.
- #406 Rewrite reservation emails to be short and focused in EN, FR and ES.
- #407 Make founder night and reservation views readable at a glance at the door.

### Not covered by pass 1

- A refund parked by Stripe for lack of available balance (`pending` with
  `pending_reason: insufficient_funds`) and its automatic resume. The worker
  logic is covered with a fake provider in `scripts/test-launch-operations.mjs`
  and the founder settings show "Funding needed"; the sandbox balance had funds,
  so no real test-mode refund was parked. See pass 2.
- "Keep my reservation" after a crossed deadline, concurrent scans from two
  devices, refusing camera permission, the on-screen waitlist conflict message.

## Recreating the fixtures by hand (pass 2)

1. In the admin, create a clearly named test venue and four nights as in the
   table above: one starting about an hour later and lasting until the end of
   the session, one three days later, one short night that ends before the
   arrival steps, and the deadline night when the tester reaches step C4.
   Registration closes 30 minutes before a night starts, so book before then.
2. Set up reservations on each night (EUR 10, capacity as above) and copy the
   booking link.
3. Book each guest from the booking link with founder-owned addresses and the
   payment method agreed for that pass. Keep each confirmation email: it holds
   the management link and the QR.
4. Fill the waitlist night, then join its waitlist three times. A cancellation
   frees a place, so refill the night before the waitlist step.
5. Cancel one guest of the arrivals night before the arrival steps.
6. After the pass, cancel the test nights from the admin so every remaining
   deposit is refunded, verify the totals against Stripe, and remove the test
   venue as agreed for the production project.

Before pass 2, the production project needs its own worker URL and secret in
Vault, a Stripe webhook endpoint with its signing secret, and the reservation
mail settings, as listed in the cutover plan of #280.

To exercise a refund parked for lack of funds, use a Stripe test-mode account
whose available balance cannot cover the refund (for example a fresh sandbox
whose test charges have not become available), trigger an arrival refund,
check the founder "Funding needed" state and the guest's pending wording, then
add test funds and confirm the refund completes without a founder action. Check
Stripe's current test-mode guidance on balances first. The operational side is
tracked on the board card "Fund the Stripe balance so arrival refunds do not
stall (fees and payouts)".

## Real-money pass on production (2026-11-21, #408)

Run on `getamourette.com` with the live Stripe account, by a founder with a
personal card (Apple Pay, Visa), on an unannounced venue "Test paiement".
Each night: EUR 10 deposit, capacity 2. The Stripe available balance was not
funded beforehand.

| Step | Night | Result |
|---|---|---|
| Booking and payment | A, same evening | Reservation confirmed 43 s after the hold; Checkout session and payment in live mode |
| Confirmation mail with QR | A | Sent 50 s after payment, received in the inbox |
| Arrival before the scheduled start | A | Refused by design ("arrival outside scheduled event"); see #435 |
| Arrival confirmed by a founder, manual lookup | A | Refund accepted by Stripe 8 s later; refund mail sent within a minute |
| Booking, then cancellation by the guest one minute later | B, four days out | Place released; one full refund accepted 18 s later; cancellation and refund mails received; guest page moved from "in progress" to "processed" |
| Confirmation mail of a booking cancelled before it was sent | B | Suppressed, as intended; no QR sent for a cancelled reservation |

### What Stripe actually did

- **Both refunds were reversals, not refunds.** The payments were 1 minute and
  2 hours old, so Stripe cancelled the card authorization (state "Cancelled"
  in the Dashboard, with a STAN reference) instead of sending money back from
  the balance. This pass therefore does **not** prove a refund of a payment
  that is several days old, which is the case of every guest on a real night.
- **The processing fee is kept on a reversed payment too.** Payment settled in
  USD (2 hours old): EUR 10.00 converted to USD 10.97, processing fee
  USD 0.78, currency conversion fee USD 0.11, net after reversal USD -0.89.
  Payment reversed before settlement (1 minute old): fee EUR 0.69, net
  EUR -0.69, no conversion. The reversal used the same rate as the payment
  (USD 10.97 both ways).
- **Deposits never cover their own refunds.** A EUR 10 payment brings
  USD 10.08 to the balance and its refund takes USD 10.97: each refunded
  reservation leaves the balance short by the fees, about USD 0.89.
- **The account may go negative.** Two days later the Dashboard showed
  incoming funds at USD -1.65 and an upcoming debit of USD 0.89 on the linked
  bank account.
- **Funds stay pending for about a week** on this recent account (payment of
  21 November announced for 28 to 30 November).
- Payouts were switched from daily to manual on 2026-11-21.

### Findings

- Arrival cannot be confirmed before the scheduled start, while guests do
  arrive early: #435.
- The "Reserve" button makes the screen flash before Checkout opens. The
  reservation was created once; display only: #438.
- A manual arrival confirmation requires a verification note; a QR scan does
  not. Acceptable as an audit trail, to revisit if it slows the door.
- A night opened less than 48 hours before its start shows "Free cancellation
  until" with a date already in the past. The booking still asks the guest to
  acknowledge the late cancellation; the page should say that free
  cancellation is no longer possible: #439.
- The admin night schedule is frozen as soon as a reservation exists, so a
  test night cannot be moved earlier.

### Aged payment refunded (2026-11-25, night C)

Reservation `d0fa202d` paid EUR 10 on 2026-11-23 at 09:21 Paris time (Visa,
card entered on Checkout, no wallet) for night C, starting 2026-11-25 at
09:00. Arrival confirmed by a founder QR scan in `/admin` (the guest's QR shown
on a computer screen, scanned with the founder's phone) a few minutes before 10:24; the exact scan
time was not noted. Times
below are Paris time; the Stripe Dashboard shows UTC.

| What | Result |
|---|---|
| Kind of operation | **A real refund, not a reversal.** Dashboard state "Refunded" (labels translated from the French Dashboard); the 21 November payments show "Cancelled" |
| Timing | Refund created at 10:24:01, within minutes of the scan, and reported as completed in the same second |
| Balance at the time | Nothing available; the refund was **not** held pending. Balances afterwards: total USD -0.16, EUR 0.00, incoming USD 7.79 in two currencies (mostly night D's deposit, still pending) |
| Fee | EUR 0.69 kept by Stripe; net of the reservation EUR -0.69 |
| Currency | Payment, fee and refund in EUR, no conversion (the 21 November payments were converted to USD) |
| Guest mail | Refund mail received |
| Card | Stripe: "funds will be credited within 5 to 10 business days"; the acquirer reference (ARN) is available within 3 business days |

What this changes:

- **A guest's deposit is refunded for real on the night**, end to end, from
  the founder's scan to the guest's mail, within minutes.
- **Stripe did not wait for available funds**, although its documentation
  says a card refund stays pending while the available balance is short
  (`docs/production-cutover.md`, "Reservation payments go-live", step 8). It
  appears to have taken the refund from incoming funds. One observation on a
  small amount; the balance is still funded before a real night.
- **Each attending guest costs EUR 0.69** in Stripe fees, the price of a
  refunded EUR 10 card payment.
- Balances showed an upcoming debit of USD -0.89 on 2026-11-28 labelled with a
  daily schedule; the founder confirmed on 2026-11-25 that payouts are still
  manual, so the label concerns that debit, not payouts.
- **The balance is funded for the fees only** (founder decision, 2026-11-25):
  each guest's deposit covers its own refund; see
  `docs/production-cutover.md`, "Reservation payments go-live", step 8.

Still open for this night: the credit line on the bank statement (5 to 10
business days), and what the admin and the guest page show, which were not
captured.

### Still to run

- Night D, 2026-12-02 09:00: a payment nine days old. Its funds become
  available around 2026-11-28 and stay on the account (payouts are manual).
  Expected state at the scan: about EUR 8.62 available on the EUR balance
  (night D's EUR 9.31 net minus night C's EUR -0.69), no other payment
  incoming, a refund of EUR 10. So night D observes **a refund larger than the
  available balance with nothing pending**: refunded at once with the balance
  going negative, or held pending. The balance is not funded before it.
  Record the same observations as night C, plus the date the payment became
  available. Then remove the test venue and its rows by count, founder
  approved (`docs/production-cutover.md`, "Reservation payments go-live",
  step 7).
