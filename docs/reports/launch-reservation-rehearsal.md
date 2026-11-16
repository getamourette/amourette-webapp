# Launch reservation rehearsal (#188)

Working record of the end-to-end reservation rehearsal: payment, cancellation,
arrival and refund recovery on a physical phone. It becomes the founder runbook
once both passes are done. Policy reference:
[launch-reservation-policy.md](../launch-reservation-policy.md).

**Status on 2026-11-16: pass 1 is prepared and not yet run.** Every checklist
line below is unverified until observed on a physical device.

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
- Waitlist: `/api/launch/waitlist`, while the Thursday night was full.

### Nights (venue time, Europe/Paris)

| Night | Schedule | Capacity | Purpose |
| --- | --- | --- | --- |
| Tonight `dcb18ed9-5161-4500-b4c9-9c1fb4515279` | Nov 16, 15:00 to Nov 17, 03:00 | 12 | Arrivals; every booking is already past the free-cancellation deadline |
| Thursday `11a26b83-5d1a-45c9-a002-af4e5da66a10` | Nov 19, 20:00 to Nov 20, 02:00; free cancellation until Nov 17, 20:00 | 3 (full) | Timely cancellation, waitlist, capacity, unpaid holds |
| Ended `1a54e3d6-65cf-4bba-8559-2036cb107228` | Nov 16, 14:15 to 14:45 | 2 | Expired QR, no-show classification, missed arrival corrected after the end |
| Deadline (created on demand) | Starts 48 hours and a few minutes after the tester is ready | 2 | Cancellation confirmation opened before the deadline and submitted after it |

### Guests

All paid EUR 10 in Stripe test mode. Addresses under `example.com` receive no
mail. The Gmail aliases belong to Marwane, the approved test recipient.

| Night | First name | Email | Use |
| --- | --- | --- | --- |
| Tonight | Camille | `camille.a.rehearsal188@example.com` | QR scan, confirmation, repeated and concurrent scan |
| Tonight | Camille | `camille.b.rehearsal188@example.com` | Manual lookup with a duplicate first name |
| Tonight | Inès | `marwaneazzouzi1+ines@gmail.com` | Confirmation email and its QR |
| Tonight | Jade | `jade.rehearsal188@example.com` | Mistaken validation corrected |
| Tonight | Nina | `nina.rehearsal188@example.com` | Staff network loss and readback |
| Tonight | Hugo | `marwaneazzouzi1+hugo@gmail.com` | Late cancellation from the phone |
| Tonight | Tom | `tom.rehearsal188@example.com` | Cancelled late during preparation: refused QR, retained deposit |
| Thursday | Léa | `marwaneazzouzi1+lea@gmail.com` | Timely cancellation and full refund |
| Thursday | Zoé | `marwaneazzouzi1+zoe@gmail.com` | Cancellation preview without cancelling |
| Thursday | Malo | `malo.rehearsal188@example.com` | Wrong-night QR |
| Ended | Sacha | `sacha.rehearsal188@example.com` | Expired QR, no-show |
| Ended | Yanis | `yanis.rehearsal188@example.com` | Missed arrival corrected after the end |

Thursday waitlist, in signup order: `marwaneazzouzi1+attente1@gmail.com` (fr),
`attente2.rehearsal188@example.com` (en), `attente3.rehearsal188@example.com` (es).

The unpaid attempts are made by the tester during the pass: a hold lasts 30
minutes and the cap counts the tester's own connection.

## Findings during preparation (2026-11-16)

1. **The scheduled reservation worker reaches no deployment.** The Vault value
   `launch_worker_url` still names a deployment removed since October; every
   minute the dispatcher receives `410 Gone`. Until it is pointed at a live
   deployment, refunds stay queued, a requested hold expiry never completes,
   no-shows are not finalized and no reservation mail leaves.
2. **No Stripe webhook reaches the rehearsal preview.** The only sandbox
   endpoint targets the October `#185` test domain, and the branch has no
   `STRIPE_WEBHOOK_SECRET`. A payment is confirmed when the guest returns to the
   reservation page, or by the worker once it runs.
3. **Reservation mail is disabled on the preview** (sending and tracking flags
   false, empty recipient list). A management link only exists in an email, so
   the phone cannot open a prepared reservation until mail is enabled.
   Confirmation mail for the prepared guests is queued, not lost.
4. **Four end-to-end test accounts are in the founder allowlist** (`admins`) of
   the shared database, which is also today's production database. They must
   not be carried into the EU production project.
5. The Stripe-hosted form now renders its card fields inside an iframe;
   `scripts/test-launch-sandbox.mjs` still looks for `#cardNumber` in the page
   and would time out. Not changed here.

## Pass 1 step sheet

`P` is the preview origin above. Participant steps run on the phone; founder
steps on the phone at `P/admin/nights/<night id>`, section **Reservations &
deposits**. The test QR codes are shown on a second screen.

### Participant: cancellation and waitlist (checklist carried from #192)

| Step | Action | Expected |
| --- | --- | --- |
| C1 | Open the management link from Léa's confirmation email. Then use "Find my reservation" on `P/events/11a26b83-5d1a-45c9-a002-af4e5da66a10` with Zoé's address; reopen an already used link | Event details, deadline in Paris time, EUR 10, personal QR. Typing an email shows nothing and only sends a link. A used or expired link is refused |
| C2 | Léa: cancel, read the confirmation, confirm; confirm again or reload | Full refund announced; one refund in Stripe test mode and its status on the page; one place released; her QR refused at the door; no second refund |
| C3 | Hugo (tonight): cancel from his link | Retained-deposit wording to accept; no refund; place released; QR refused. A new booking does not change Hugo's outcome |
| C4 | Deadline night: open the cancellation confirmation before the deadline, submit after it | First submission leaves the booking active and asks for consent again. "Keep my reservation" brings the QR back without a reload |
| C5 | Zoé: open the cancellation and leave without confirming; repeat with the phone offline during confirmation | QR stays valid when nothing was cancelled. During uncertainty the QR is hidden and the real outcome is read back before any retry |
| C6 | Thursday night, after the founder raised the capacity: start four bookings with four addresses from the same connection and pay none. Cancel one from the phone. Founder: "Expire unpaid hold" on another | The fourth attempt is refused with the pending-payment message and no place is taken. A cancelled unpaid booking never says a deposit was retained. The expiry is a request: the place frees once Stripe confirms the session is unpaid |
| C7 | Thursday night while full: join the waitlist from the phone. Founder: inspect order, language, email; Mark Contacted, Close entry, Return to Waiting; change the same entry from two sessions | Free signup, no payment. Order preserved. No mail sent, no place reserved. A stale change asks for a refresh |

### Founder: arrivals (checklist carried from #191)

Open `P/admin/nights/dcb18ed9-5161-4500-b4c9-9c1fb4515279`, then the arrivals
mode and the personal QR scanner.

| Step | Action | Expected |
| --- | --- | --- |
| A1 | Scan Camille (first address). Check the record, then Confirm arrival | Camera permission, readable preview, camera off after decode. The booking is identified, nothing is confirmed until the explicit action. Counts move by one, exactly one refund requested, no room presence |
| A2 | Scan the same QR again; then scan it from two founder sessions at once | Original verification and refund state shown; no second attendance or refund |
| A3 | Jade: confirm arrival, then Correct mistaken validation with a note and the checkbox | Attendance removed, counts updated, history kept, the refund already requested continues |
| A4 | Yanis (ended night `1a54e3d6-65cf-4bba-8559-2036cb107228`): Correct a missed arrival with a note | Correction time recorded, attendance restored, one refund requested |
| A5 | Find a guest without QR: search "Camille" | Two results, told apart by email or reference; a verification note is required; keyboard, scrolling and submit stay reachable |
| A6 | Scan Tom (cancelled), Malo (Thursday), Sacha (ended night), the venue QR and an unrelated QR; refuse camera permission once | Each is refused with its reason and no effect; manual lookup remains available without the camera |
| A7 | Nina: scan, cut the phone's network, confirm, restore the network | The result is read back before any retry; no duplicate attendance or refund |

### After the pass

Charged, refunded and retained totals of each night must match Stripe test
mode. Sacha stays absent with a retained deposit; no guest is classified as a
no-show before the end of a night.

## Pass 1 results

To fill during the pass.

| Field | Value |
| --- | --- |
| Date | |
| Device and browser | |
| Application commit | |
| Preview URL | |
| Stripe evidence | |

| Step | Result | Defects and notes |
| --- | --- | --- |
| C1 | | |
| C2 | | |
| C3 | | |
| C4 | | |
| C5 | | |
| C6 | | |
| C7 | | |
| A1 | | |
| A2 | | |
| A3 | | |
| A4 | | |
| A5 | | |
| A6 | | |
| A7 | | |

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
4. Fill the Thursday night, then join its waitlist three times.
5. Cancel one tonight guest before the arrival steps.
6. After the pass, cancel the test nights from the admin so every remaining
   deposit is refunded, verify the totals against Stripe, and remove the test
   venue as agreed for the production project.

Before pass 2, the production project needs its own worker URL and secret in
Vault, a Stripe webhook endpoint with its signing secret, and the reservation
mail settings, as listed in the cutover plan of #280.
