# Launch reservation policy

Amourette uses a refundable deposit to make attendance commitments
credible for its first capacity-limited bar event. The event is free after the
deposit is refunded. The deposit does not buy a drink or fund admission.

This is the implementation reference for [#183](https://github.com/getamourette/amourette-webapp/issues/183)
and its children, prepared under [#190](https://github.com/getamourette/amourette-webapp/issues/190).
The rules below consolidate the founder decisions of October 6–7, 2026.
[The decision log](decisions.md) preserves their rationale and history, including
superseded proposals. Use this document for the current agreed policy.

The starting deposit is EUR 10 for euro-area events and USD 10 for US events.
The amount must remain configurable for future use rather than being hard-coded
as 10 throughout the model. No automatic exchange-rate conversion is required.
The amount and currency may be edited before registration opens, then remain
fixed for that event. Changes never rewrite an existing payment.
The participant wording below is the approved EUR 10 baseline. Integration must
use the event's actual amount and currency rather than publish euro-only wording
for a US event. Other countries/currencies are not yet defined.

## Reservation and capacity

- Each participant reserves individually, with their own event-priced deposit,
  confirmation and personal QR. There are no group bookings.
- The intended rule is one reservation per person per event. Without mandatory
  Amourette account linkage, absolute person-level uniqueness is not guaranteed;
  each additional purchase would still require its own deposit and capacity
  allocation. Enforce one active reservation per email per event. An existing
  confirmed booking blocks a new purchase and offers to resend its management
  link; an in-progress payment should resume the existing attempt. After
  cancellation or safe payment-attempt expiry, allow a new booking while
  registration is open and capacity remains. Different email addresses can
  circumvent this limit; that residual risk is accepted for launch. Duplicate
  submissions or repeated provider events must still be idempotent.
- The bar supplies the capacity available for this event, accounting for its
  usual clientele. That number is the reservation quota.
- The quota belongs to the specific venue night and may be edited. Increasing
  it makes additional places available through registration while booking is
  open. A decrease must still cover confirmed reservations and any active
  payment holds; editing the quota cannot cancel existing allocations. An
  increase does not introduce automatic waitlist promotion or guaranteed
  priority for waitlisted participants. The registration form reflects current
  availability, and the server rechecks it when allocating a place.
- Open reservations only once the venue, event date, start and end times, quota
  and registration opening are confirmed. Close new paid reservations exactly
  30 minutes before event start, or while the quota is full. Attempts already
  started retain their 30-minute payment window; remaining open Checkout
  sessions must expire by event start, with provider verification before release.
  This supersedes the original event-start registration cutoff. #185 must update
  server/database enforcement; #184 must reflect the cutoff in the form.
- Temporarily hold a place during payment and release abandoned holds safely.
  #182 owns durable allocation state and atomic capacity guarantees; #185 owns
  Checkout orchestration, expiry coordination and delayed-payment handling.
  The approved normal payment window is 30 minutes. #185 must coordinate this
  with Stripe session expiration; elapsed time alone never authorizes capacity
  release. New attempts are refused from the registration cutoff onward. The
  #182 transition contract below defines safe release and late-payment handling.
- Reservations within the last 48 hours are allowed, with an explicit warning
  before payment that free cancellation is no longer available.
- At capacity, offer a free email waitlist. Organizers contact the next person
  in signup order manually when a place becomes available. The person pays only
  when reserving. There is no automatic promotion, invitation-expiry engine or
  guaranteed place merely for joining the waitlist.
- Walk-ins pay no deposit to Amourette. The bar controls admission and available
  space. Reservations do not override its admission or capacity decisions.
- When registration has closed before an otherwise scheduled event, the form
  must explain that guests may still come to the venue and ask whether space is
  available, subject to the bar's admission decision. Do not imply guaranteed
  entry or show this invitation for a cancelled or ended event. #184 owns the
  participant-facing closed state; #185 supplies the authoritative cutoff/state.

Participants must be able to register and pay without first creating an
Amourette account or completing a matching profile. This supersedes #184's
previous pre-payment account/completed-profile requirement. Account creation
may be offered after payment. A later account link is optional and is never
required for reservation management or arrival. A mandatory
Amourette user/night key is no longer appropriate; the active email/event limit
above applies instead. Do not require email verification before payment. The
founder accepts the residual risk of someone paying for a booking with another
person's email rather than adding that pre-payment step. This does not make a
typed email sufficient authorization to view or manage a reservation. The local
#182 database contract below defines email normalization and guest authorization; the HTTP and email flows remain in the dependent issues.
Reservation acceptance does not activate visible presence in the app; only the
participant can do that separately. Walk-ins remain independent of reservations.

## Individual booking implementation — #184 (database applied, application local; October 13)

The participant pages now live at `/events/[nightId]`, `/reservations/[id]`,
`/reservations/access` and `/reservation-terms`. The event link is shared directly;
no landing catalogue or button is introduced. Checkout uses the existing
server-validated deposit/capacity/30-minute cutoff. Conditions use `launch-v1`,
with a distinct acknowledgement after the free-cancellation deadline. Unsupported
policy versions fail closed. The existing privacy page gains booking/payment
information; no marketing or matching consent is collected by this form.

The browser stores the original encrypted capability and submitted input in
session storage before allocation. The return redirect contains only a booking
ID and grants no access. The summary embeds #186's QR only after an authorized
paid/confirmed response; failures clear stale images. #192 still owns actual
participant cancellation. Support access here is not a completed cancellation
workflow, and real booking launch waits for #192 and the other launch gates.

Migration `20261013000004_launch_guest_booking.sql` adds public event information,
a bounded venue address with founder-only editing, and a private transactional
access-mail outbox. It was **applied with founder approval** on October 13 as
remote migration `20261013200348`. Types were regenerated/reconciled, RPC/table
grants and non-founder refusal verified, and daily retention scheduling checked.
The eight existing reservations remain unchanged and the mail queue is empty.
Existing reservations
are not backfilled with unsolicited mail. Initial access mail is queued when a
new paid reservation becomes confirmed; a guest recovery request queues mail
without changing credentials. A link fragment and explicit POST exchange prove
access before an atomic management-secret/envelope renewal. Initial links last
seven days; recovery links one day. Arrival credentials remain unchanged.

The existing authenticated launch worker also processes access mail independently
of payment failures. `LAUNCH_EMAIL_ENABLED` and verified tracking-disabled status
are required; nonproduction sends require an exact test-recipient allowlist.
No actual email or production charge was sent during local implementation.
Resend idempotency permits retrying a fixed operation within its documented
[24-hour window](https://resend.com/changelog/idempotency-keys); this implementation
stops retries at 23 hours. Sender/domain tracking, shared worker routing and
real mailbox receipt remain deployment checks. #189 reuses this foundation for
complete confirmation and lifecycle delivery rather than adding a second access
pipeline. The existing webhook maintains shared bounce/complaint suppressions;
this outbox records provider acceptance, not a guarantee of inbox delivery.

## Lifecycle email scope — #189 (approved October 17)

The agreed delivery set is one complete paid-reservation confirmation with
personal inline QR, practical details, actual venue-local cancellation deadline
and private management/cancellation link; participant cancellation confirmation;
organizer cancellation/postponement notice; and verified provider refund success.
The confirmation replaces #184's minimal initial access email. Requested recovery
remains available. Founder email correction sends one current summary with fresh
management access and the same arrival credential, without replaying history.

No event/deadline reminders, attendance confirmation, standalone refund-initiation
message or automatic refund-failure/delay message are sent. Founders handle blocked
refunds using existing monitoring/recovery and manual contact when necessary.
This supersedes the broader notification scope elsewhere in this historical
implementation reference. Provider success must still explain that bank posting
can take several business days.

### Email copy direction — October 20

Marwane requested concise EN/FR/ES emails without em dashes, marketing-subscription
footers or detailed policy/security commentary. Keep the relevant outcome,
event details, deposit/deadline, QR/reference, management/recovery links and
support. Refund-success mail retains a short warning that funds may take business
days to appear. Show venue timezone once and keep one brief QR instruction;
the reference and private reservation link remain the image-blocking fallback.
Show only the event start time, put the QR immediately after the venue/address,
omit the full-bar aside and close with a localized Amourette team signature.
Recovery mail keeps its expiry. Longer terms remain available in the existing
booking/reservation flow. This changes presentation only; authorizations,
financial rules, consent and immutable provider retries are unchanged.

### Implementation evidence — October 17

`20261017000001_launch_lifecycle_mail.sql` was applied with founder approval
as remote version `20261017205749` on October 17. The application remains local.
It extends the existing access outbox with transactional lifecycle sources,
minimal durable event receipts and encrypted immutable provider bodies. Claims,
context revisions, suppression and recipient checks fence obsolete content;
late refund failure suppresses an unsent success notice. Provider calls already
in flight cannot be recalled. No historical bookings are backfilled.

Local validation passes: production build/TypeScript, lint, nine original guest
SQL/access groups and eleven new lifecycle SQL/runtime/crypto groups; existing
reservation/cancellation, Stripe, QR, founder operations and arrival regressions;
compiled production HTTP against isolated SQL/fake Resend, including lost-response
identical replay, decoded CID QR, EN/FR/ES, EUR/USD, correction and actual refund
state. The original 38 PostgreSQL concurrency cases passed before the final mail
cases were added; the four new mail-specific cases passed separately. This is
focused evidence, not a successful full hosted gate or a full concurrency rerun.

Twenty-four synthetic email renders were checked at 320/640 px without horizontal
overflow, with representative EN/FR/ES confirmation, cancellation, postponement
and refund captures visually inspected locally. These are Chromium renders,
not Gmail/Outlook receipt or Vercel preview evidence. Shared migration/type/advisor verification is complete as detailed below. The full
hosted gate, deployed worker integration, verified domain tracking and a
founder-authorized real mailbox test remain outstanding. No push, PR, real email
or activation was performed for #189.

### Authorized shared schema verification — October 17

Marwane explicitly approved applying the prepared migration and checking types
and permissions, while keeping delivery disabled. Remote migration
`20261017205749` (`launch_lifecycle_mail`) succeeded. Generated public RPC types
were reconciled selectively, preserving existing SQL-nullable refinements and
unrelated types. TypeScript checking passes.

Before/after whole-row hashes match for all nine reservations, their payments,
seven refund records and independent credentials. Eight reservations remain paid.
The sole previously sent access mail is unchanged; there were no legacy pending
attempts to abandon, no historical mail was queued and the new event-receipt
table is empty. Both new triggers are enabled. Private tables have RLS and no
direct anon/authenticated/service-role grants; the four inspected public delivery RPCs
are service-role-only. Private helpers remain uncallable by those roles.

Rolled-back SQL checks verify anon/authenticated refusal and service-only
missing-claim refusal. Hosted PostgREST checks independently verify the public
anonymous key cannot call either new RPC and the service key reaches the expected
missing-claim rejection without effects. Security advisors have no new WARN or
ERROR finding. The sole added INFO is intentional RLS-without-policy on the private
event-receipt table, whose access is through definer functions only. No full suite
was repeated. The application has not been published and email delivery has not
been enabled; real mailbox and deployed integration remain separate gates.

## Guest reservation access and recovery

October 13 ownership update: #184 now owns the minimal initial secure
management-link email and guest access recovery, using the existing Resend
foundation. This supersedes references below assigning all access delivery and
renewal to #189. #189 reuses that foundation for complete confirmation emails
with QR and practical details, reminders and lifecycle notifications, and
founder-corrected recipient delivery. Coordinate confirmation delivery to avoid
redundant messages. This scope change does not indicate completed implementation.

Guests manage reservations through a personal secure link, without requiring an
Amourette account. If the confirmation email is lost or the link expires, a
"Find my reservation" flow sends a fresh management link to the booking email
address. Entering an email address alone never exposes or authorizes management
of the reservation.

For an incorrectly entered or inaccessible email address, the participant
contacts support. A founder verifies the reservation and payment before
correcting the address. Recovery does not require pre-payment email verification.

Management credentials remain separate from the arrival QR. Renewing management
access must not invalidate the arrival credential. The local #182 implementation below uses seven-day management credentials,
independent arrival credentials, and audited founder correction. Delivery and
recovery screens remain to be implemented.

## Cancellation and absence

The free-cancellation deadline is exactly 48 elapsed hours before the scheduled
event start. Cancellation confirmed at or before that instant receives a full
deposit refund. Display the actual deadline, with the venue's local date, time and
time zone, before payment and in the reservation details. Compare instants on
the server rather than calendar days or the participant's device clock.

| Situation | Deposit outcome |
| --- | --- |
| Participant cancels at or before the deadline | Full refund |
| Participant cancels after the deadline | Deposit retained |
| Participant does not attend | Deposit retained |
| Another person later occupies a cancelled or unused place | Does not change the original refund eligibility |
| Founder grants an exceptional refund | Full refund |

Participants cancel through their reservation link and confirm the action before
it takes effect. Cancellation releases the reservation's capacity and invalidates
its arrival QR. A participant may reserve again if booking remains open and a
place is available, with a new deposit. Preserve each reservation's attempt,
payment and cancellation history without requiring a single participant/event
reservation record. Rebooking does not change the previous cancellation's refund
outcome. Do not classify someone as a no-show while arrivals are still allowed
during the event.

Participants can email **hello@getamourette.com** with their reservation reference
and a short explanation to request an exception. Founders decide case by case;
there is no guaranteed list of exceptions or requirement for medical documents.
Retained deposits remain with Amourette to contribute to organization costs;
the current arrangement provides no share to the bar.

## Arrival and presence verification

Participants may arrive throughout the scheduled event. There is no earlier
arrival cutoff or late penalty. A registered participant who presents themselves
receives a full refund, including if the bar refuses entry because it is full.
Staff must be able to verify presence outside in that case.

Each confirmed reservation receives an individual QR. Staff scan it, inspect the
reservation and explicitly confirm arrival to trigger the refund. Repeated scans
show the existing validation instead of triggering another refund. Manual lookup
is available when the QR or phone is unavailable; first name alone is insufficient
when people share a name.

Recording arrival establishes attendance for the refund. It must not claim that
the person entered the bar or activate public room presence. Scanning the bar's
shared QR alone is not evidence for refunding a reservation. Entry QR credentials
remain separate from the permanent venue QR.

#191 owns audited founder correction of a missed arrival, including after the
event when attendance was actually verified retrospectively. Keep this separate
from an exceptional refund: correcting attendance must also correct attendance
reporting and queue any outstanding full refund through #187's mechanism. Require
a founder and a verification note; preserve history and never automatically
reverse or collect back a refund already issued. #187 can grant a financial
exception before this arrival correction interface is delivered.

For V1, only founders use the arrival interface under existing admin controls.
External staff access is deferred; it will require limited permissions rather
than membership in the founder allowlist.

#191 also owns correction of an arrival confirmed by mistake. Require explicit
founder confirmation and a verification note, preserve the prior state and audit
history, and update attendance reporting. A correction preserves every refund
already triggered, including queued, pending, failed and review-needed work.
Never cancel, replace or duplicate that obligation or collect back issued funds.
An unverified reservation remains eligible for a genuine arrival during the event;
after the event it is absent unless attendance is retrospectively verified.
Verification timestamps describe when the founder recorded the evidence, not an
invented physical arrival time.

For launch, encode only the opaque arrival code, without a web link. The staff
scanner in #191 uses the phone camera inside the admin interface. Regeneration
is deferred from #186 by the October 7 scope decision: lost emails or changed
phones recover the same code through authorized reservation access. Cancellation
and expiry still invalidate its use.

### Personal QR integration — #186 (database applied; application local)

The secret prepared by #185 stays undisclosed as a usable QR until the database
confirms the reservation and payment. `POST /api/launch/arrival-qr`, with JSON `{}`
and the existing encrypted guest bearer capability, returns an authorized PNG
data URL and reservation/night/timing/verification metadata. `ReservationQr`
provides EN/FR/ES alt text, instructions, a reservation reference and a manual
lookup fallback for #184 to embed alongside its event summary. #184 handles
loading, expired management access, unavailable QR and retry states; a stale
image must be cleared after an unavailable response.

For #189, `getLaunchArrivalEmailAsset` supplies PNG bytes, the stored recipient
and locale, and the same metadata through a service-only delivery read. Embed
the PNG as an inline attachment, with localized alt text, reference and fallback
from `launchQrStrings`. Do not expose a public image URL, use a third-party QR
service, or use the arrival secret as reservation-management authorization.
The existing encrypted delivery envelope survives seven-day management expiry.

The strict #186 lookup passes both selected `p_night` and raw `p_secret` to
`admin_lookup_launch_arrival`. Lookup can inspect a paid reservation before start
but has no effect. Explicit `admin_verify_launch_arrival` requires reservation
ID, selected night, method and the same scanned secret for QR verification;
manual verification instead requires a note and no secret. Both commands reject
wrong-night, revoked, cancelled, terminal or expired credentials under the night
lock. Confirmation also requires the scheduled start to have arrived. Repeated
scans during the event return the original verification, without another refund.
After expiry, founder history remains available through the ordinary reservation
detail command. Saved images cannot reflect later cancellation; staff must check
the server and never treat offline decoding as arrival validation.

Migration `20261007000004_launch_arrival_qr.sql` replaces the original unscoped
arrival RPC signatures and adds guest/trusted-delivery commands. No arrival UI
currently calls the old signatures. Marwane authorized shared development
application on October 13: remote version `20261013091903` (`launch_arrival_qr`).
Catalog/grant/RLS checks, eight rolled-back refusal assertions, MCP type
reconciliation and TypeScript checking passed. Security advisors show no ERRORs
or increase in findings; the existing founder-function warnings reflect the new
signatures. The four existing reservations were preserved, with no new fixture
or business changes. Publication, deployed integration and Vercel inspection
remain outstanding. This work does not deploy the #184 reservation page, #191
scanner or #189 email workflow.

### Founder arrival integration — #191 (migration applied, application WIP)

The admin mode opens from the selected night's reservation operations.
`admin_inspect_launch_arrival` binds that night to exactly one reservation ID or
raw scanned code and may identify cancelled or ended bookings to explain refusal.
It is founder-only and read-only; it does not relax the strict #186 lookup or QR
delivery contracts. `admin_confirm_launch_arrival` adds a revision check and
delegates to #186's locked verification, including the same scanned secret for
QR confirmation and a required note for manual verification. Repeated verified
scans show the original evidence and refund status.

`admin_correct_launch_arrival` requires the current attendance revision, an
explicit target and a verification note. It preserves prior evidence in the audit,
updates attendance counts and queues only any outstanding full refund when adding
attendance. Undo leaves existing refund work unchanged. The attendance revision
survives undo/reverification; stale corrections and scans after an undo must reload.
The correction timestamp records when evidence was entered, including after the
event. The interface reads back after commands, including uncertain network
responses, and requires a successful refresh before retrying an unchecked result.

Camera frames are decoded locally with jsQR and discarded. No arrival code is
stored in URLs, browser storage or logs; camera tracks stop when the page is hidden
or the camera is closed. There is no offline attendance queue. Marwane authorized
shared application on October 13; migration `20261013195428` preserves the eight
existing reservations and triggers no refund. MCP types were reconciled and
security advisors checked; founder reads and nonfounder refusals pass against
the shared database. Deployed inspection and physical-camera checks remain
outstanding; the application remains WIP.

## Organizer cancellation and postponement

If organizers cancel or postpone the event, initiate full refunds of the deposits
held for affected reservations without requiring participants to ask. Do not
refund an already-refunded payment twice. A new date requires a new reservation;
do not transfer attendance commitments or deposits to it automatically.

This includes deposits previously retained after a participant's late
cancellation: organizer cancellation or postponement refunds all paid deposits
for the event that have not already been refunded.

Venue changes are deferred, not a special-case policy or product flow to implement
for this first event. No venue-change cancellation deadline has been approved.
While registration has opened for a noncancelled, nonterminal booked evening
that has not ended, venue address, city and timezone changes are frozen by one
private predicate shared by `admin_set_venue_address` and `save_venue_details`.
The window extends through the evening, including after the booking cutoff.
Unchanged location values and venue name changes remain allowed. New venue
creation is unaffected; cancellation, terminal closure or event end lifts the freeze. #350's
behavioral migration is prepared locally and must be announced before shared application.

## Refund operations and payment operator

| Trigger | Required action |
| --- | --- |
| Staff confirm arrival | Initiate the full refund |
| Participant confirms an eligible cancellation | Initiate the full refund |
| Organizers confirm cancellation or postponement | Initiate full refunds for affected reservations |
| Founders approve an emailed exception | Initiate the full refund |

Initiation begins at the qualifying action rather than in a next-day manual batch.
Implement it through reliable asynchronous work: staff do not wait for Stripe to
respond before continuing arrival validation. Track queued, pending, succeeded,
failed and review-needed outcomes without equating a queued request with completed
bank processing. Preserve safe retries, reconciliation and audited founder recovery.

#185 owns the reusable Stripe refund execution mechanism: worker scheduling,
provider calls, status reconciliation and safe retries against #182's durable
refund intents. It must exercise this mechanism for payments received after a
reservation is no longer valid, returning the full deposit without reviving the
reservation. #187 integrates the mechanism with attendance, eligible cancellation,
organizer cancellation and founder exceptions, and supplies operational monitoring
and audited recovery controls. The participant cancellation and arrival interfaces
remain owned by #192 and #191 respectively. This lets #185 validate the complete
payment-to-refund cycle before the operational interfaces are delivered.

#187 includes a founder-initiated full refund action on a paid reservation, with
explicit confirmation and a required reason. It uses the same durable refund
mechanism and duplicate protection as automatic eligibility; it does not mark
attendance or imply that a bank refund has completed.

#187 also owns audited reconciliation of a full refund issued directly in the
Stripe Dashboard. Verify the original payment, amount, currency and current
provider outcome before associating it with the reservation's refund obligation;
do not issue another refund. Partial or ambiguous external refunds remain under
review rather than being silently treated as a completed full refund.

The participant receives the full deposit. Payment-processing costs are borne by
the organizers as launch acquisition costs. Funds may take several business days
to appear on the participant's account after initiation; #185 verifies the
account-specific fees and provider timing before final publication. Do not promise
instant credit or invent an exact bank deadline.

**InboxPilot, Inc.** is the confirmed Amourette operator. Marwane confirmed that
the dedicated Stripe account is available. Use Stripe-hosted Checkout; signed
server-side provider events establish payment state, not the browser return URL.
Amourette does not collect raw card data. Keep test and production configuration
separate. Account availability is not evidence that this integration is built.

For launch, accept card payments through hosted Checkout, including Apple Pay
and Google Pay when available for the account and participant's device/browser.
Exclude delayed-confirmation payment methods from this initial integration to
keep payment resolution compatible with the 30-minute booking window. #185
must configure and verify the allowed methods in Stripe; this is an approved
scope choice, not a claim that the account configuration has been completed.

## Participant wording

The French pre-payment direction was approved in discussion. The following EN,
FR and ES versions express that policy for integration review. They do not add
new refund rules. Replace placeholders with real event values; do not publish
placeholder dates, links or unverified provider-specific promises.

Repository explanations remain in English; localized participant strings below
are the EN/FR/ES deliverable of #190. #184 owns the form, policy access and
reservation summary; #192 owns cancellation states; #189 owns complete
transactional email templates and their delivery.

### English

**Before payment**

> Free event — reserve your place with a EUR 10 refundable deposit.
>
> Your deposit is refunded in full when our team confirms your arrival. You may
> arrive at any time during the event.
>
> Cancel by **{cancellation_deadline}** for a full refund. If you cancel after this
> deadline or do not attend, your deposit is retained.
>
> We initiate your refund when your arrival or eligible cancellation is confirmed.
> It may take several business days to appear in your account.
>
> If the bar is full and you cannot enter, your deposit will be refunded after
> our team verifies your presence at the venue.

- Payment action: **Reserve with a EUR 10 deposit**
- Policy acceptance: **I accept the reservation and cancellation conditions.**
- Late-booking notice: **The free-cancellation deadline has passed. Your deposit
  will be refunded when our team confirms your arrival.**
- Organizer cancellation: **If we cancel or postpone the event, we will initiate
  a full refund automatically. A new date requires a new reservation.**
- Support: **Questions or exceptional refund requests: hello@getamourette.com.
  Exceptions are reviewed individually and are not guaranteed.**

### French

**Before payment**

> Soirée gratuite — réservez votre place avec une caution remboursable de 10 €.
>
> Votre caution est intégralement remboursée lorsque notre équipe confirme votre
> arrivée. Vous pouvez arriver à tout moment pendant la soirée.
>
> Annulez jusqu’au **{cancellation_deadline}** pour être intégralement remboursé.
> Après cette échéance, ou si vous ne venez pas, la caution est conservée.
>
> Nous déclenchons le remboursement dès la confirmation de votre arrivée ou de
> votre annulation dans les délais. Son affichage sur votre compte peut prendre
> plusieurs jours ouvrés.
>
> En cas de refus d’entrée faute de place, votre caution vous sera remboursée
> après constat de votre présence sur place par notre équipe.

- Payment action: **Réserver avec une caution de 10 €**
- Policy acceptance: **J’accepte les conditions de réservation et d’annulation.**
- Late-booking notice: **La période d’annulation gratuite est terminée. Votre
  caution sera remboursée lorsque notre équipe confirmera votre arrivée.**
- Organizer cancellation: **Si nous annulons ou reportons la soirée, nous
  déclencherons automatiquement un remboursement intégral. Une nouvelle date
  nécessite une nouvelle réservation.**
- Support: **Questions ou demandes exceptionnelles de remboursement :
  hello@getamourette.com. Les exceptions sont examinées au cas par cas et ne
  sont pas garanties.**

### Spanish

**Before payment**

> Evento gratuito — reserva tu plaza con un depósito reembolsable de 10 €.
>
> Te devolveremos el depósito íntegro cuando nuestro equipo confirme tu llegada.
> Puedes llegar en cualquier momento durante el evento.
>
> Cancela hasta el **{cancellation_deadline}** para recibir un reembolso íntegro.
> Si cancelas después de ese plazo o no asistes, conservaremos el depósito.
>
> Iniciaremos el reembolso cuando se confirme tu llegada o tu cancelación dentro
> del plazo. Puede tardar varios días hábiles en aparecer en tu cuenta.
>
> Si el bar está completo y no puedes entrar, te devolveremos el depósito después
> de que nuestro equipo compruebe tu presencia en el lugar.

- Payment action: **Reservar con un depósito de 10 €**
- Policy acceptance: **Acepto las condiciones de reserva y cancelación.**
- Late-booking notice: **El plazo de cancelación gratuita ha terminado. Te
  devolveremos el depósito cuando nuestro equipo confirme tu llegada.**
- Organizer cancellation: **Si cancelamos o aplazamos el evento, iniciaremos
  automáticamente un reembolso íntegro. Una nueva fecha requiere una nueva reserva.**
- Support: **Consultas o solicitudes excepcionales de reembolso:
  hello@getamourette.com. Las excepciones se evalúan caso por caso y no están
  garantizadas.**

### Conditions and privacy integration

Link policy acceptance to the complete reservation conditions, covering the rules
above and the confirmed operator. Keep reservation acceptance separate from
matching consent and optional marketing consent. Operational reservation emails
do not subscribe participants or waitlist members to marketing.

Use the existing operator details and privacy policy as the base. #184/#185/#189
must reconcile booking/payment information with the actual implementation:
reservation and contact data, arrival verification, payment/refund references,
Stripe's role and transactional email delivery. Do not label every provider
solely as a processor or invent financial-record retention periods. General
notices and Terms of Use remain coordinated with #292; payment-specific terms
belong to this workstream. These are integration requirements, not a new operator
investigation or approval of unimplemented data handling.

## Delivery ownership and order

The board and GitHub issues own progress; this table maps policy responsibilities
and dependencies, not completion status. The listed order is a recommended
topological sequence. Independent paths may proceed once their prerequisites exist.

| Order | Issue | Responsibility | Direct prerequisites |
| --- | --- | --- | --- |
| 1 | #190 | Policy reference and EN/FR/ES payment wording | None |
| 2 | #182 | Event booking settings, quota, individual reservations, waitlist data, payment and refund states | #190 |
| 3 | #185 | Server Checkout, capacity and timing enforcement, signed payment events, reusable Stripe refund execution/reconciliation, account fees/timing | #182 |
| 4 | #187 | Founder booking settings, cancellation/postponement actions, operational refund integration, exceptions, monitoring and audited recovery | #185 |
| 5 | #186 | Personal reservation QR and secure credential lifecycle | #185 |
| 6 | #184 | Registration, policy display/acceptance, late booking, waitlist signup and reservation summary | #185, #186 |
| 7 | #192 | Participant cancellation and capacity release; founder manual waitlist handling | #184, #187 |
| 8 | #191 | Staff QR scan, explicit presence confirmation, manual lookup, including capacity refusal | #186, #187 |
| 9 | #189 | Confirmation, reminders, cancellation/postponement and refund emails | #192, #191 |
| 10 | #188 | Complete payment, cancellation, arrival, refund and recovery rehearsal | #189 |

#186 does not require the registration UI: confirmed test reservations and the
Checkout model suffice to build credentials. #184 integrates that credential.
#189 integrates the event sources from both participant cancellation and staff
arrival; #188's prerequisites transitively include every implementation child.
The parent #183 has no implementation branch or PR and closes only after every
child is complete and final operational QA is accepted.

Each implementation issue must update the maintained
[input contract](reports/input-validation-audit.md) for its actual APIs, URLs,
tokens, timestamps, forms and provider payloads. Validate commands before effects
and cover refusal boundaries, ownership, duplicate actions and concurrency in
the existing relevant tests. This policy does not define unimplemented API shapes.

## Event values and completion boundaries

Before opening reservations, set the venue, quota, event start/end and time zone,
registration opening, and derived cancellation deadline. These values await the
venue agreement; do not substitute invented values for the first event.

#185 must record exact account fees and provider timing; implementation issues
own deployed configuration and payment tests. #190 supplies the policy and copy
without waiting for the bar to be selected or claiming the payment feature is
already delivered. A first-drink alternative remains deferred, as do special
venue-change handling and automatic waitlist allocation.

## Local database foundation — #182 (2026-10-07)

Status: applied to shared development Supabase with Marwane's explicit approval
on 2026-10-07, remote version `20261007095253` (`launch_reservations`). Generated
types were reconciled into `lib/database.types.ts` and security advisors reviewed.
No Checkout, email delivery, reservation screen or QR scanner is built by #182.

### Identity, credentials and permissions

`private.launch_reservations` is independent of Auth users and matching profiles.
An individual purchase has its own UUID, accepted policy version/server instant,
contact email, first name and locale. Rebooking creates a new UUID and payment;
retries reuse the original UUID and identical normalized input. An active partial
unique index covers `(night_id, email)` for `holding` and `confirmed` only.

Reuse the existing email syntax validator: trim Unicode boundary whitespace,
lowercase ASCII with the C collation, accept at most 254 ASCII bytes with a
64-byte local part, and preserve dots and plus suffixes. No provider-specific
alias collapsing, Unicode case folding or email verification is added. Reusing
the syntax validator has no marketing subscription effect.

The future server facade uses `service_role` RPCs; a browser gets no table or
service-command access, even through Supabase anonymous sign-in. Private tables
have RLS enabled with no client policies or direct grants, including no service
DML grants. Founder RPCs grant execution to `authenticated` and check the existing
`private.is_admin()` allowlist. Guest ownership is proved inside service-only
read/cancel commands by an expiring management secret, never by email or Auth ID.
Service credentials must remain on the server.

The server generates **two independent cryptographically random 32-byte secrets**,
encoded as exactly 64 lowercase hexadecimal characters. Only SHA-256 digests
are stored in `launch_credentials`. Management access lasts seven elapsed days;
renewal replaces that digest and starts a new seven-day lifetime. Arrival access
has no independent short timeout: lookup requires a confirmed reservation and
an unrevoked digest, and recording arrival checks the event window. Cancellation
and hold release revoke arrival access. Renewing management access never touches
it. No raw secret is returned by a read, founder list or audit.

#185/#186/#189 must arrange durable, confidential delivery of the originally
issued secrets (for example the transactional outbox's encrypted payload), rather
than trying to recover them from hashes. The management link and arrival QR must
use separate routes/purposes. Do not put secrets into analytics, logs or referrers.
#184/#189 own bounded, rate-limited HTTP endpoints, same-origin mutation protection,
explicit cancellation confirmation, private/no-store responses and generic recovery
acknowledgements. Link GETs only inspect; they do not cancel or validate arrival.

`create_launch_reservation` returns only `{access_required:true}` for an existing
active email under a different request ID. The server must offer email recovery,
not give that caller the existing ID, secret or Checkout URL. A browser retaining
its original management secret may securely resume through `get_launch_reservation`;
otherwise a fresh link is sent to the stored email. Confirmation blocks purchase;
holding resumes the same Checkout attempt. Public HTTP responses must avoid
turning the internal result into an email-enumeration endpoint.

`find_launch_reservations_for_delivery` and `renew_launch_access` are trusted
**delivery-only** handoffs. Neither is an email-authorized browser lookup. Renewal
returns the stored recipient address, ID and locale only to the server; deliver
the newly generated secret to that address and keep it out of the recovery HTTP
response. Repeating renewal with the same secret makes no further change.
`admin_correct_launch_email` requires a founder, a paid reservation and a
verification note; it respects active-email uniqueness, expires existing management
access and preserves the arrival QR. The founder verifies reservation/payment
before invoking it; #187 supplies that UI and #189 sends renewed access afterward.

### Schedule, allocation and payment contract

The scheduled event begins at `venue_nights.waiting_opens_at` and ends at
`closes_at`; `guaranteed_launch_at` is the matching-room launch, not admission time.
The applied #182 foundation closes booking at event start, with half-open
intervals `[opening, start)` and `[start, end)` for arrival. The subsequent #185
decision moves the new-booking cutoff to `start - interval '30 minutes'`, making
the booking interval `[opening, start - 30 minutes)`. This enforcement change is
implemented in the local #185 migration but not applied remotely; the arrival
interval remains unchanged.
Free cancellation uses `start - interval '48 hours'`, inclusive, independent of
local daylight-saving changes. Eligibility is evaluated using database wall time
**after** acquiring the night lock. The recorded cancellation instant is the one
used for eligibility.

`admin_configure_launch_event` sets explicit amount/currency, opening, quota and
policy version. EUR/USD use integer minor units (1000 means the launch baseline
10); the model does not select a currency from venue location or convert money.
Before opening, settings may change. From opening onward, amount, currency,
registration opening, accepted policy version and the night schedule are frozen.
A bound night cannot change venue. Postponement cancels the old event; configure a
new night. Quota remains editable before event start, including increases, but
never below all `holding` plus `confirmed` allocations. Late cancellations release
a place without altering their financial history.

All allocation-changing commands lock **night → booking settings → reservation**.
Triggers enforce the quota and frozen settings; a partial unique index enforces
active email uniqueness. Financial tables prevent repricing existing payments or
refunding a different amount/currency. A booking night has a restrictive foreign
key: permanent venue/night deletion fails rather than erasing financial history.
Unconfigured nights keep their existing behavior. Financial retention/purge policy
is a separate future decision; this migration does not invent a retention period.

| Command | Contract for the next issue |
|---|---|
| `launch_event_availability` | Service projection of times, timezone, price, accepted policy version and current available places. Availability is advisory; allocation rechecks atomically. |
| `create_launch_reservation` | #184/#185 supply a stable request UUID, accepted policy version, late-cancellation acknowledgement when necessary, contacts, two server-generated secrets and an explicit hold deadline after now and no later than start. Amount/currency come only from event settings. |
| `get_launch_reservation` / `cancel_launch_reservation` | Require ID and the current management secret. Projection includes booking/payment/arrival/refund state but no provider identifiers or secrets. Cancellation and eligible refund queuing commit together. |
| `bind_launch_checkout` | #185 creates one provider Checkout per reservation UUID using provider idempotency, then binds its immutable identifier. Binding may finish after cancellation solely to reconcile that original provider attempt, without reopening the booking. If creation times out, reconcile that same provider request; never create another purchase/session blindly. |
| `release_launch_hold` | #185 asserts a bound Checkout's verified terminal-unpaid result and supplies an opaque evidence reference. A closed browser, redirect, timeout or local hold deadline is insufficient. No automatic clock-based release exists in #182. For an uncertain unbound creation, resolve and bind the same provider request before release. |
| `record_launch_payment` | Only verified server evidence, with exact bound Checkout, payment identifier, amount and currency. Repeated identical success does nothing. A still-held allocation can confirm after its advisory deadline, including during the event, but never after terminal closure/end. |
| Success after release/cancellation/end | Preserve the paid record, never revive the booking or consume a second place, and queue a full `unallocated_payment` refund. This technical compensation prevents retaining money for an unfulfilled reservation. The provider integration still needs real delayed-payment tests. |
| `admin_lookup_launch_arrival` / `admin_verify_launch_arrival` | Founder-only lookup followed by explicit confirmation by reservation UUID. Manual confirmation requires a verification note; first name alone is not identification. Repetition returns the existing verification. Never writes room presence or claims admission. |
| `finalize_launch_no_shows` | Service reconciliation only at/after scheduled end; records absent confirmed bookings without overwriting verified arrival. #185/#187 own scheduling this command. No new cron job is installed. |
| `admin_cancel_launch_event` | Audited cancellation/postponement queues all outstanding paid deposits, cancels allocations and revokes QRs. Also uses the existing room lifecycle. The existing terminal-cancellation path gets the same booking hook; ordinary room closure/end never deletes these records. |

Implementing the approved 30-minute payment window and advance booking cutoff,
the approved card/wallet configuration, webhook signature verification and real
provider reconciliation are #185 responsibilities. There is no claim that these
provider behaviors have been tested by the database tests.

### Refunds, founder operations and waitlist

`launch_payments`, `launch_arrivals` and `launch_refunds` are separate from the
reservation's lifecycle. A paid/confirmed reservation can have a verified arrival
and a refund still pending. One refund intent per paid reservation stores the
full original amount and currency and moves through `queued`, `pending`,
`succeeded`, `failed` or `review_needed`.

`claim_launch_refund` atomically leases one queued/expired-pending item with
`FOR UPDATE SKIP LOCKED`. Lease duration is 10–300 seconds, default 60. The claim
returns an **operation UUID as the provider idempotency key**, stable across
reconciliation/retries of that operation. The refund UUID identifies the single
financial obligation, and the claim UUID fences workers. Every claim after the
first for that operation reports
`reconcile_first:true`: query provider status before attempting a new external
operation, including when the provider's own idempotency retention may have ended.
The database cannot make an external network operation exactly-once by itself.

`complete_launch_refund` accepts outcomes only under the current unexpired claim;
provider refund IDs are immutable within an operation. #187 supersedes the original success-finality assumption: a verified later Stripe failure must correct the outcome and totals without creating another refund. Pending results are
polled after lease expiry; failed/uncertain work is visible for founder review.
`admin_retry_launch_refund` requires an audited reconciliation note and requeues
the **same operation**, preserving its idempotency key and provider reference.
This command only reconciles uncertain/retryable outcomes; it cannot revive a
provider object known to have failed terminally.

After verifying terminal failure, returned funds and permission to refund again,
a founder can call `admin_replace_failed_launch_refund` with the inspected
operation UUID, exact failed provider reference, evidence reference and a note.
It archives the full failed attempt in `launch_refund_attempts` and queues one
replacement operation with a new UUID/key under the **same refund obligation**.
The amount/currency and original refund reason stay fixed. Existing provider IDs
remain permanently bound to their operations, including archived failures.
Repeated approval of the same inspected operation is harmless, even if a later
operation has since failed; uncertainty, pending or succeeded states cannot be
replaced. Old worker claims cannot complete a replacement. A replacement's first
claim reports `reconcile_first:false`; uncertain retries of it keep its new key.
Founder detail includes the failed-attempt snapshots and verification evidence.
#185/#187 must verify actual provider status and returned funds before calling;
a timeout or error string alone is never evidence permitting another refund.
`admin_refund_launch_reservation` queues a discretionary full refund with a note.
#185 owns the reusable worker, scheduling, provider reconciliation and external
refund call; #187 owns operational integration and the reconciliation/recovery UI.
All these operations remain callable after room terminal cleanup.

`join_launch_waitlist` collects email/locale only while registration is open and
full, deduplicating by normalized email/night without charging or allocating.
The monotonically increasing entry ID is the signup ordering key; sequence gaps
are harmless. `admin_update_launch_waitlist` tracks `waiting`, `contacted` and
`closed` without automatic promotion. Founder lists are paginated at 100 entries:
`admin_launch_list` for waitlist/audit (bigint cursor), and
`admin_launch_reservations` for bookings (UUID cursor). `admin_launch_reservation`
adds payment/refund references for support/reconciliation, never credential hashes.

### Local verification evidence

On 2026-10-07, 13 isolated SQL groups and 18 PostgreSQL 17 concurrency cases
passed, including the final Checkout-binding/cancellation regression. The current
night-report SQL/presentation suite passed with this migration loaded, including
financial survival and deletion protection. Repository lint passed; the changed
scripts also received focused lint checks. `git diff --check` passed.

The existing complete PostgreSQL concurrency gate passed once with the booking
cases integrated. After the final binding/time-capture refinements, only the
focused booking SQL/concurrency tests were repeated. No full `test:logic`, build,
Playwright, hosted CI, Supabase application, generated-type regeneration or
security-advisor run was performed for this local implementation. There are no
application/Next.js changes or UI states to inspect in #182 itself.

Review follow-up on 2026-10-07: terminal provider failure now has an explicit,
audited replacement-operation path as specified above. Fourteen isolated SQL
groups, 21 focused PostgreSQL concurrency cases, the night-report tests, focused
lint and whitespace checks passed. The complete gate was not repeated; provider
verification remains an integration requirement of #185/#187.

### Authorized shared database deployment

On 2026-10-07, the migration above was applied as remote version `20261007095253`.
All nine private tables have RLS and no direct SELECT/INSERT/UPDATE/DELETE grants
for `anon`, `authenticated` or `service_role`. Catalog checks verified all new
function grants. A transaction rolled back after role-based smoke checks confirmed
nonfounder read/replacement refusal, founder lookup, anonymous execution refusal
and service-only lookup. No booking event was configured or test data retained.

MCP generation supplied the 25 public RPC contracts; reconciliation preserves
existing schema refinements and explicitly nullable SQL arguments. TypeScript
checking passed. Security advisors reported nine additional private tables with
RLS and no policy (INFO) and twelve additional authenticated SECURITY DEFINER
functions (WARN). These implement the intended command-only/founder-checking
boundary; grant and role checks verified it. Existing unrelated findings remain.
No full suite was repeated. Hosted Auth/PostgREST, provider, email and end-to-end
reservation flows still require the dependent issues and integration QA.

## Local Stripe integration — #185 (2026-10-07)

Status: a protected branch preview is deployed for sandbox validation; the two database migrations were applied
to shared development Supabase with Marwane's explicit approval on 2026-10-07.
`20261007000002_launch_stripe.sql` maps to remote `20261007141235`;
`20261007000003_launch_stripe_schedule.sql` maps to remote `20261007141253`.
Preflight found zero configured booking events/reservations, so no existing-data
repair was needed. The 30-minute booking cutoff is now enforced in the shared
database. MCP-generated types were reconciled and security advisors reviewed.
The schedule's Vault URL/secret and preview bypass are configured for the approved
test deployment. It has processed the preview's EUR/USD refunds successfully.

### Guest and downstream integration

The server facade is under `/api/launch`:

1. `POST /credentials` with `{}` returns `{id, access}`. This has no booking effect.
   #184 must retain `access` before sending a purchase command. It is an opaque
   bearer capability, never an email lookup or something to put into analytics,
   query strings or referrers. Browser storage integration belongs to #184.
2. `GET /checkout?night=<uuid>` exposes availability, fixed price/policy, cutoff,
   `status` (`not_open`, `open`, `closed`, `cancelled`, `ended`), available places
   and `walk_ins_possible`. `open` describes the time window; use `available` to
   distinguish a full event. The last flag applies only after the booking cutoff
   and before an otherwise valid event ends; the venue still decides admission.
3. `POST /checkout`, `Authorization: Bearer <access>`, accepts
   `{action:"create", booking:{night,email,name,locale,policy,late_ack}}` or
   `{action:"resume"}` / `{action:"status"}`. No account/profile is needed.
   New allocations recheck the cutoff, policy, late acknowledgement and quota
   under the existing night lock. Browser-supplied prices, currency, deadlines,
   raw secrets and redirect URLs are rejected. Replays use the same capability
   and normalized inputs; changed attempt inputs are refused.
4. Only the authorized guest receives the projection and, while still payable,
   `checkout_url`. `checkout_state` exposes pending/done/review-needed orchestration
   without provider references or errors. An email collision offers the generic
   recovery handoff; #189 must deliver recovery before that feature can work.
   It does not send an email or reveal the existing attempt/session.
5. `/return` is currently a nonmutating JSON handoff. It never interprets query
   parameters as payment proof. #184 supplies the localized return/reservation
   screen and resumes with the retained capability. The complete participant UI
   is intentionally not delivered by #185.

The encrypted access capability contains two independently generated 32-byte
secrets and expires seven days after issuance. Database management authorization
is also checked on every guest read/resume. The delivery envelope is encrypted
separately with purpose-bound AES-256-GCM and stored atomically with the booking.
`read_launch_delivery` is a service-only handoff of ciphertext and stored recipient,
not a browser endpoint. #186 consumes the original arrival secret; #189 owns
sending, renewal, corrected recipients and delivery deduplication. Renewed
management access must issue fresh delivery material; the initial envelope does
not magically acquire a renewed secret. Keep `LAUNCH_SECRET_KEY` privately backed
up; arbitrary key replacement makes existing ciphertext unreadable. Every trusted
worker/facade serving the same reservation database must use that same key; use
a separate key/database boundary for eventual production.

All guest responses are private/no-store. Mutations require the configured exact
Origin and JSON content type, and refuse cross-site sec-fetch-site headers before
rate scope selection. The database allows 30 requests per ten minutes per
HMAC-hashed scope/address. Valid access credentials share one
`launch-manage:<credential.id>` scope for checkout resume/status,
cancellation preview/confirm and arrival QR. One budget for credential reads and
mutations keeps the guard simple while isolating timely cancellation and payment
resumption from shared-IP public traffic. Checkout creation, availability polling,
credential issuance, access recovery/exchange and waitlist retain the conservative
`launch-http` scope: an active-email collision does not consume the capability, so
a per-capability creation budget would multiply the reservation-enumeration oracle;
missing or invalid credentials also fall back to it. The address remains Vercel's
platform-provided IP, or one shared local/other-host value. No raw IP is stored.
Database management authorization is still required independently. These limits
do not claim person-level uniqueness or immunity to distributed abuse.

### Expiration, interrupted requests and payment evidence

The database derives the immutable hold deadline from wall time under the night
lock: 30 minutes, rounded down by less than one second for Stripe Unix timestamps.
The creation request supplies that same `expires_at`, which cannot exceed
admission start. Its parameters, account binding and idempotency identity remain
stable. Stripe-hosted Checkout uses card/eligible Apple Pay/Google Pay, with
Adaptive Pricing disabled and no delayed methods, discounts, taxes or recovery
sessions added by this integration. Explicitly disable Link with
`wallet_options.link.display=never`: deployed inspection found Bank/Klarna offers
through Link despite the card-only filter. Apple Pay/Google Pay remain eligible.

[Stripe's documented creation minimum](https://docs.stripe.com/api/checkout/sessions/create)
is 30 minutes. Latency can put a fixed deadline below this minimum. Sandbox
probes accepted 30 minutes, 29m50s and 29 minutes, but implementation does **not**
depend on that tolerance. Never push the deadline later to make a retry work.
A first-call `expires_at` validation rejection carrying a Stripe request ID,
under the claim that made the first provider request, with automatic SDK retries
disabled, proves that no Checkout operation started. `start_launch_checkout_request`
atomically records `first_request_claim` with `first_requested_at`, never replacing
either. Earlier claims may have failed before reaching the provider, so claim
count is not evidence. `reject_launch_checkout_creation` requires that same current
claim with a live lease, recorded request time, no bound Checkout, pending payment
and valid request-ID evidence, then records the unpaid rejection and releases the
allocation. An ambiguous/repeated call cannot use this exception. Existing rows
with request time but no first-request claim retain the conservative review path.
The participant may start a new attempt only while the normal booking window
remains open; near-cutoff network failures can therefore
prevent a purchase. An exact cutoff plus arbitrarily long network latency cannot
guarantee a fresh full-length provider session.

After uncertain creation, retrieve/list the original provider operation, then
replay identical parameters/key only within a conservative 23-hour horizon.
[Stripe retains idempotency keys for at least 24 hours](https://docs.stripe.com/api/idempotent_requests).
An empty listing, timeout, local expiration or browser return does not release
capacity. Unresolved work becomes `review_needed`, preserving its allocation;
`admin_retry_launch_checkout` requires a founder and reconciliation note, retains
all identifiers and cannot override the replay horizon. Founder detail includes
orchestration status/error codes, never delivery ciphertext or credentials.

A bound Checkout releases its hold only after retrieving terminal-unpaid Stripe
state; if an attached PaymentIntent is still processing, retain the hold. Success
requires the same session, exact price/currency, reservation metadata, test account,
and succeeded PaymentIntent with the full received amount. Repeated or out-of-order
signed events retrieve current state rather than trusting old snapshots.
Notification delay on a retained allocation follows #182's existing confirmation
contract. Payment after release, cancellation or terminal event end is recorded
and queued for full compensation without restoring the booking. The provider's
fixed expiration prevents starting a new purchase past the payment deadline;
notification receipt time is not used as purchase time.

### Refund worker, configuration and recovery

`/process` claims Checkout work and refund intents with 120-second fenced leases.
The pg_cron dispatcher runs every minute, in batches of five; pending Checkout
retries are scheduled at least 30 seconds later; healthy open sessions are
checked at their expiration, so they do not crowd out interrupted operations.
Cancelled/confirmed reservations bypass that delay. Refund polling waits for its
lease. Interrupted leases are reclaimable. Each invocation bounds item count and
work time; infrastructure interruption leaves durable state for the next tick.
The worker also calls `finalize_launch_no_shows` for ended events.

Charge eligibility is checked only immediately before a Checkout creation call,
including a replay that might create a missing session. Shared provider setup
continues when `charges_enabled` is false or `card_payments` is inactive/missing:
existing sessions can still be retrieved, expired and reconciled, and existing
refund obligations can still execute or recover. A blocked creation stays pending
with `stripe_cards_unavailable`, preserving its allocation and operation identity;
actual provider refund responses still determine whether a refund succeeds.

The refund operation UUID is the Stripe key. On uncertain retries, retrieve a
known refund or finish a paginated list for that PaymentIntent before replay.
Outside 23 hours without a found object, require review rather than recreate.
Unrecognized manual refunds also require review. `pending`, `succeeded`, `failed`
and `review_needed` remain distinct; `requires_action` requires review. Existing
founder retry and verified terminal-failure replacement commands retain their
#182 behavior. An old failed operation's provider object never becomes evidence
for its replacement. #187 owns their operational integration and UI.

Server configuration is documented in `.env.example`: test `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, 64-hex `LAUNCH_SECRET_KEY`, exact `LAUNCH_SITE_ORIGIN`, and
64-hex `LAUNCH_WORKER_SECRET`. Live keys are deliberately rejected. Configure the
Stripe **test** endpoint `/api/launch/webhook` for Checkout completed/expired and
async succeeded/failed events, pinned to API `2026-09-30.endive`. A Stripe CLI
listener is sufficient for local forwarding; it is not a persistent hosted endpoint.
Refund status is reconciled by polling, so it does not depend on refund webhooks.

The authorized test deployment uses Vault `launch_worker_url` (HTTPS
`/api/launch/process`), `launch_worker_secret`, and optionally
`launch_worker_bypass` for a protected preview. The worktree’s `.env.local` now has generated encryption/worker keys, the localhost
origin and a test CLI signing secret; the main checkout’s environment was not
changed. The protected preview at `https://amourette-launch-185-test.vercel.app`
has branch-specific server secrets and a dedicated Stripe test webhook. Vault now
targets that preview with the matching worker secret and existing Vercel automation
bypass. Stripe uses the bypass only in its private endpoint URL, as required for
third-party webhook delivery; never publish that URL/token. Production settings
remain unchanged. Missing Vault URL or secret still makes the dispatcher inert.

### Validation evidence and activation boundary

Local checks cover 14 foundation SQL groups, 16 orchestration groups using actual
isolated SQL and controlled provider failures, and 24 PostgreSQL 17 concurrency
cases. The latter include the final place, email/request duplicates, cutoff after
lock wait, refunds/replacements, atomic preparation and worker fencing. Actual
Next HTTP tests cover guest access, body/origin/rate limits, invalid commands,
price injection and nonauthoritative returns. Stripe sandbox tests exercised
hosted card payments in EUR and USD, repeated real provider events, payments after
cancellation and full succeeded refunds without duplicates. A separate EUR journey
confirmed a valid reservation through a real signed HTTP event forwarded by Stripe
CLI, then cancelled/refunded it. Test sessions were completed or expired; the
listener was stopped. A focused USD fault-injection journey also loses the real
creation/refund responses after Stripe processes them, then reconciles the same
objects. No shared Supabase fixtures were written.

Repository lint, TypeScript and a production build passed. Following the build,
a focused review tightened array-versus-string command/locale validation and
automatic recovery after database transport errors. Focused logic/HTTP/type checks
cover those corrections without repeating the full build. No full logic or
browser suite, hosted CI, deployed Supabase/PostgREST exercise, preview inspection,
wallet-device payment or live payment has been performed for #185. The HTTP tests
use a local PostgREST adapter against the actual migration, not shared Supabase.
The new deterministic orchestration checks join `test:logic`; the isolated HTTP
checks run after CI's existing build. Sandbox tests require explicit opt-in and
never run in CI. Do not mark a future PR Ready until its required hosted checks
and relevant preview states are verified under the current workflow policy.

**Account fees and timing remain an activation gate.** The test API verified a US
account with active card capability and USD default currency. Test configuration
now reports card, Apple Pay and Google Pay available; wallet visibility/payment
still depends on device/browser and is not proven by this setting. Sandbox
success does not establish the account's contracted processing, international-card,
FX, refund or payout fees, settlement schedule, reserves or negative-balance rules.
Record those exact Dashboard/contract terms before enabling live payments; do not
substitute a public generic tariff or a test balance transaction. Custom deposit
values must also meet the account's settlement-currency-dependent
[Stripe charge minimum](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts).

[Stripe's general refund guidance](https://docs.stripe.com/refunds#trace-a-refund)
says bank presentation often takes about 5–10 business days and early refunds may
appear as reversals; this is not an account-specific or participant bank promise.
Keep participant wording at "several business days" until the applicable terms
are verified. Organizers bear the fees; the participant's refund request remains
the full original amount and currency.

Review follow-up: the shared charge-eligibility guard was moved to Checkout
creation. Controlled-provider regressions cover disabled charges, inactive/missing
card capability, recovery of an unbound session, existing payment/expiry processing,
and refund recovery after response loss without duplicate effects. These are local
regressions; the real Stripe account was not disabled to test them. The review's
production HTTP run used the earlier stale build and failed; it is not current-source
validation. The fix is checked with the focused orchestration suite, source-mode
Next HTTP tests, TypeScript and scoped lint. No full build or long suite was repeated.

### Shared migration verification (2026-10-07)

After the authorized application, catalog checks confirmed all five cutoff/guard
functions, RLS on the three new private tables, no direct application-role table
grants, service-only worker RPCs, founder-only recovery, and exactly one minute
cron job. A rolled-back SQL smoke test verified anonymous/participant RPC denial,
the founder guard, service access, empty queues, the 30/31-request rate boundary,
invalid bucket refusal and the inert dispatcher. Read-only calls through actual
Supabase PostgREST verified new RPC visibility, null for unknown attempts/delivery,
and anonymous denial. No booking fixture or rate bucket persisted.

Security advisors returned no ERRORs. Relative to the preflight, there are three
additional [RLS-without-policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
for deliberately private tables and one additional
[authenticated SECURITY DEFINER warning](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
for `admin_retry_launch_checkout`; its internal founder guard was tested. Other
findings are unchanged. The ten new RPC types were reconciled from MCP generation,
preserving SQL-nullable arguments, the empty-object contract for the no-argument
maintenance RPC (generated as `never`), and unrelated existing refinements.
TypeScript checking passed after retaining those refinements. Three subsequent
scheduled executions succeeded with the dispatcher inert; final counts confirmed
zero booking fixtures, provider work items and rate buckets.

At migration application, this verified shared schema/access and the unconfigured
dispatcher only. Hosted integration was subsequently authorized and validated below.
No full build or long suite was repeated for migration application itself.

### Authorized sandbox preview evidence (2026-10-07)

The WIP feature branch was published with `cb8f790`, followed by the visually
discovered Link correction in `5423bba`. The tested corrected deployment is
`https://amourette-webapp-1hqp6z6ht-tothe-moon.vercel.app`, with stable test origin
`https://amourette-launch-185-test.vercel.app`. Both are protected Preview targets;
no production deployment or final-review PR was created. The fixed test alias
must be explicitly advanced and reverified on subsequent branch deployments.
Vercel's current-source build and TypeScript check passed. The initial automatic
preview preceded branch-specific environment provisioning; validation used the
configured redeployment and then the corrected build, not that initial preview.

Real deployed checks passed against shared Supabase and Stripe test mode:

- Guest capability issuance, independent guest denial, email-only denial,
  duplicate email rejection, price injection refusal, private/no-store responses,
  origin refusal, unsigned webhook refusal and unauthorized worker refusal.
- A closed booking window rejects creation without a hold and permits the
  conditional walk-in flag. Cancelled fixtures subsequently report cancelled with
  both registration and walk-in flags false.
- Concurrent retries of one capability create one provider session. Simultaneous
  different-email requests for the last place produce exactly one winner. A real
  Stripe session expiration via its test API yields unpaid/expired state and
  restores one place; this check did not wait through the natural 30-minute timer.
- EUR 10 card payment, automatic signed hosted webhook confirmation, browser
  return handoff and timely cancellation. USD 10 payment after prior cancellation
  records payment, preserves cancellation and queues compensation. Valid repeated
  signed notifications have no additional effect. Before observing those automatic
  webhook results, the harness did not invoke payment transitions or the worker.
- The database minute cron delivered HTTP 200 with `{checkouts:2,refunds:2}` and
  completed both full refunds. Each Stripe payment has exactly one succeeded
  refund in its original currency. Further worker invocations do not duplicate it.
- After the Link fix, another deployed USD 10 card payment completed and confirmed,
  then received one full scheduled refund. The corresponding cron response was
  HTTP 200 with `{checkouts:2,refunds:1}`. Final work count: four done Checkout work
  items (three refunded paid attempts and one unpaid expired attempt), none pending.

Inspected real hosted Checkout at 390×844 and 1440×1000, plus the mobile JSON return
handoff. The original USD form exposed Bank/Klarna through Link. The corrected
session reports `wallet_options.link.display=never` and the inspected mobile and
desktop forms show the card entry without Link's bank/financing options. A direct
unpaid sandbox probe was expired after inspection. Screenshots and the private
one-off execution harness/results remain under ignored `.vercel/`; they contain
synthetic recipients and must not publish bearer capabilities or webhook URLs.

The isolated 16-group orchestration regression, scoped lint and TypeScript check
passed for the correction. No full logic/browser suite or GitHub final-review
workflow was rerun. Shared synthetic fixtures `test-launch-185-eur`,
`test-launch-185-usd` and `test-launch-185-closed` were cancelled through the founder
command after verification; their financial audit records remain, and the permanent
QA rooms were untouched. The preview webhook and sandbox worker remain configured.

Remaining validation: #184's full participant form/confirmation UI, physical-device
Apple Pay/Google Pay, final scoped hosted review checks and the production-specific
fees/settlement/activation gate. Creation/refund response-loss recovery and disabled
charge-capability behavior retain the earlier controlled/sandbox test evidence;
no artificial network failure or Stripe account disablement was injected into the
hosted deployment. This is a verified payment foundation, not a finished launch UI.

## Founder operations implementation in progress (#187, 2026-10-13)

The feature branch adds the founder screens and
`20261013000001_launch_operations.sql`; this migration was applied with Marwane’s explicit approval on October 13. The follow-up `20261013000002_launch_refund_observations.sql` was also approved and applied after Stripe’s documented late-failure behavior was identified.
Refund creation remains the existing minute-dispatched worker's responsibility.
The recovery endpoint only verifies/links provider evidence or queues a verified
replacement; it never creates a Stripe refund synchronously.

Founder procedure for an unresolved deposit:

1. Open the event and reservation; inspect booking, payment, attendance and refund
   separately. Use **Take responsibility for refund** and record the follow-up
   plan when a refund needs investigation or funding. Ownership is audited.
2. For insufficient Stripe balance, coordinate funding with the payment operator
   and check the account's available balance. Keep the original pending refund;
   refreshing/reconciling it must not create another. The operator still bears
   unrecovered payment/foreign-exchange fees. See [Stripe's refund funding guide](https://docs.stripe.com/refunds).
3. Use **Reconcile refund** for an uncertain/failed recorded operation. It preserves
   operation identity. **Replace failed refund** is separately confirmed and
   requires server-retrieved terminal failure, the positive linked returned-funds
   balance transaction and no competing active refund or dispute. Partial or
   ambiguous evidence requires investigation, not another full refund.
4. For a full refund already made in the Stripe Dashboard, use **Link Stripe
   refund**, enter its `re_` reference and a verification note. Payment identity,
   account, original amount/currency and current status are rechecked. This action
   never sends money. A pending association remains pending until polling confirms
   success. It does not assert attendance.

Before shared integration testing, obtain founder approval for the concrete
behavioral migration and the worker destination change. Deploy the new worker
code, apply the migration, and route the existing Vault `launch_worker_url` to
that deployment's `/api/launch/process` with its existing authorized secret/bypass
configuration. The #185-only worker does not understand externally bound refunds;
it must not remain the processor while external recovery is exercised. Do not
rotate secrets or activate live keys as part of this step. After application,
regenerate/reconcile public types, inspect security advisors/grants, and verify
real sandbox pending/external/refund-recovery scenarios and the Vercel UI before
final review. Until then the branch remains WIP and its local tests are not proof
of deployed financial behavior.

Local evidence for this implementation: lint, TypeScript and production build
pass; 14 reservation SQL groups, 16 Stripe orchestration groups and 10 founder
operations groups pass with the new migration installed in isolated databases.
26 PostgreSQL 17 concurrency cases pass with separate connections, including
competing recovery/exception commands. 36 targeted browser cases pass across
mobile and desktop for the reservation screens and their venue navigation;
these use mocked Supabase responses and create no shared accounts or reservations.
Agent inspection of the 320 px detail and mobile error-confirmation captures found
no horizontal clipping or inaccessible action. These local checks are supplemented by the shared sandbox evidence below.

Refund observations now retrieve current provider truth for `refund.created`,
`refund.updated` and `refund.failed` notifications. A fallback checks previously
successful refunds after an hour, including a turn after queued/pending work so a persistent
pending refund cannot starve late-failure detection. Founder
**Reconcile refund** can request that check immediately while keeping the last
known successful status until contrary evidence arrives. Observations compare the
operation, provider ID and last-update version before changing state, so stale
reads and events for replaced operations cannot overwrite newer evidence. A
verified late failure moves the existing obligation to failed and restores the
outstanding amount; it never creates a replacement automatically.


### Shared sandbox evidence for #187 (2026-10-13)

With Marwane's explicit approval, migrations `launch_operations` (remote version
`20261013101634`) and `launch_refund_observations` (`20261013102517`) were applied.
Generated public types were reconciled and security advisors/grants checked:
recovery and observation RPCs are service-only; founder projections still enforce
admin membership. No new security ERROR was reported.

The branch-scoped Stripe test key and existing worker secret are configured on
PR #315. The shared integration scenarios ran with the minute cron routed to
the verified `ca70a4c` deployment:
`https://amourette-webapp-a1pqhly4d-tothe-moon.vercel.app/api/launch/process`.
The subsequent worker fairness fix gives observations a turn even when another
refund remains pending; its focused regression is included in the 10 operations
groups above. Vault `launch_worker_url` is the authoritative current deployment
destination. The previous #185 worker must
not be restored while external refund bindings exist. No secrets were rotated.
The existing checkout webhook remains unchanged. Real refund-event delivery to
the new endpoint has not been configured or verified; successful refunds are
rechecked by the hourly fallback and founder-requested reconciliation. Signed
refund event handling has isolated regression coverage.

A dedicated synthetic test venue, `qa-refunds-187-1791887250549`, and night
`71150439-8c50-4e28-8dec-a2da05ccf3cc` exercised actual hosted Stripe Checkout and
the deployed founder/worker APIs. No permanent QA room was reset.

- A EUR 10 founder exception was dispatched by the actual shared cron and produced
  exactly one full refund, without changing attendance.
- A full external Stripe refund without integration metadata was linked through
  the authenticated deployed founder endpoint. Repeating the command was safe;
  provider count remained one and attendance remained unset.
- Stripe's asynchronous-failure card initially returned success, then failed.
  The deployed reconciliation recorded the failure, restored the outstanding
  total and verified the linked positive returned-funds balance transaction.
  The founder replacement command archived the failed operation exactly once.
  Stripe then refused a new refund on that card following its previous failure;
  the worker correctly stopped in `review_needed`, with no additional refund.
  This verifies safe refusal, not a successful replacement payout. Successful
  replacement execution remains covered by controlled provider tests.
- Organizer cancellation closed all four synthetic reservations and initiated
  the fourth full refund. Its asynchronous-success card first returned `pending`,
  then `succeeded`; polling retained the same provider ID and only one refund.
  Final test totals were EUR 40 charged, EUR 30 refunded and EUR 10 outstanding
  for the deliberately failed card, with attendance still unset.

A returned-funds balance transaction authorizes checking a replacement; it does
not guarantee that Stripe or the card issuer will accept one. When Stripe refuses
further refunds, retain the outstanding obligation and assign founder follow-up.
Arrange an alternative reimbursement with the participant as described in
[Stripe's failed-refund procedure](https://docs.stripe.com/refunds#failed-refunds).
Do not mark an off-platform payment completed through the Stripe-linking action;
that action requires a real, verified Stripe refund. Off-platform settlement
recording is not implemented in #187.

Agent visual inspection on the deployed preview covered real founder data at
320 px, 390 px and 1440 px: event totals, independent states, an unresolved refund,
archived attempt, responsibility dialog and keyboard dismissal. There was no
horizontal clipping; long synthetic addresses and references wrapped. Five
additional preview browser cases covered mocked search, validation/errors,
capacity freezing, postponement confirmation and email/history interactions.
Physical-device keyboard behavior remains unverified.

PR #315 remains draft and #187 remains In progress. Vercel built the current
runtime successfully, but GitHub has not produced the required CI workflow runs
for this draft. The scoped hosted review gate is still required before promotion.
No full suite was repeated for this checkpoint, no PR was merged and no live
payment was made. Participant-facing booking, email delivery and arrival
corrections retain their separate issue ownership.

The dedicated test event was cancelled and its synthetic financial history retained
for preview inspection. The temporary founder grant was revoked; the deployed
recovery API then correctly returned HTTP 403 for that session. Its temporary Auth
account was deleted. The intentionally unresolved test deposit remains visible as
an anomaly rather than being falsely marked complete.


### Founder-authorized merge exception (2026-10-13)

After main's QR delivery (#314) was integrated and conflicts resolved, Marwane
explicitly authorized merging #315 without running another test suite. Ten
operations groups, five QR groups and TypeScript passed on the combined tree.
The full hosted gate remains unverified; the approval waives it for this merge
and does not convert earlier focused or sandbox evidence into full coverage.
Shared sandbox worker routing remains on the verified #187 preview deployment;
this merge does not activate production payments or move the worker to production.

## Participant cancellation and founder waitlist — #192 (migration applied; preview WIP)

`POST /api/launch/cancellation` uses the existing guest bearer capability for a
read-only preview and explicit confirmation. `manage_launch_cancellation` locks
night/settings/reservation before sampling database time. Confirmed paid bookings
without recorded arrival may cancel until event end. Repeated cancellation reads
back the committed state without another refund or audit action. Timely
cancellation commits capacity release, QR revocation and the existing full-refund
obligation together. Late cancellation requires explicit acceptance of retained
deposit wording. Crossing the deadline after preview returns a refreshed late
confirmation without effects; no cancellation occurs until another action.
Uncertain responses require readback before retry. Existing refund obligations,
including founder exceptions, remain unchanged; the screen explains that existing
refund instead of claiming the deposit will be retained. Matching presence is untouched.

The founder waitlist view reads 100 entries per page in signup order and exposes
email, language, signup time and Waiting/Contacted/Closed state. Compose manually
from hello@getamourette.com using the ordinary public event link. An email draft
does not send mail or change follow-up. Mark Contacted after sending; close after
booking, refusal or abandonment. Booking completion is checked manually. Founders
decide when to contact the next guest after no response; no timeout or held place
is introduced. Returning an entry to Waiting preserves its original order.
`admin_follow_up_launch_waitlist` checks the selected night and inspected prior
state under the night lock; stale updates require refresh and identical retries
are harmless. Existing audit records preserve actor, state and time.

Migration `20261016000001_launch_participant_cancellation.sql` was **applied with
founder approval** on October 16 as `20261016142843`. Generated remote RPC types
were reconciled. Catalog grants and nonfounder refusals pass; security advisors
add only the intentional authenticated founder-function warning, with no ERRORs.
All nine reservations remain unchanged. No Stripe charge, refund or email was
created by migration application. Deployed controlled UI inspection is recorded
below; the full hosted delivery gate and physical-phone rehearsal remain
outstanding. #189 owns lifecycle email delivery.

Local #192 evidence: 14 existing reservation SQL groups and seven new
cancellation/waitlist groups pass; the disposable PostgreSQL 17 gate passes 38
separate-session concurrency cases, including deadline crossing while waiting
for the night lock and competing founder follow-up. The production Next HTTP
harness passes strict input, origin, ownership, preview, cancellation/retry,
QR and existing access/mail checks. All 27 focused participant/founder Chromium
cases pass, including EN/FR/ES confirmation at 320 px, lost mutation response,
stale QR delivery and waitlist pagination. Narrow local screenshots were visually
inspected; this is not Vercel preview acceptance. No full hosted browser suite
was run, and no shared migration, operational mail or provider refund was issued.


#192 review corrections: a successful preview or refused late confirmation that
keeps the booking confirmed/paid automatically reloads reservation status and its
authorized QR. This also replaces an initial QR read invalidated by the command.
Uncertain confirmations still keep the QR hidden until successful readback, and
older requests cannot restore a QR after cancellation. Retained-deposit wording
requires a paid booking with `cancellation_refundable = false` and no existing
refund; unpaid organizer cancellations never imply deposit retention. The guest
response validator now requires that existing nullable database boolean explicitly.
These corrections change no SQL, shared configuration or payment behavior.


### #192 draft preview evidence — October 16

Draft PR [#318](https://github.com/getamourette/amourette-webapp/pull/318),
application commit `338b8a4`, publishes the protected branch preview at
https://amourette-webapp-git-feature-reservation-canc-bf6a25-tothe-moon.vercel.app.
All 34 focused mobile and three desktop browser cases pass against that deployed
application using controlled participant/founder API responses. EN/FR/ES 320 px
cancellation confirmations, restored active QR and manual waitlist captures were
inspected, along with the desktop reservation capture. The actual deployed
cancellation handler also refuses missing/unknown guest access, malformed boolean
commands and cross-origin requests, with private/no-store responses. These checks
create no booking, arrival, refund or operational email. All nine reservation
snapshots remain identical after inspection.

Configured only this branch's Preview origin, original encryption key and Stripe
test key, reusing the original values preserved by the #184 local environment.
No key rotation, production settings, shared worker destination or webhook was
changed; automatic email remains disabled. A same-code redeploy picked up those
branch-specific values. GitHub run `38916378369` passes lint, all logic, PostgreSQL
ordering, production build and isolated HTTP checks on base `0ade231`; its evidence
explicitly records browser coverage as false. The focused deployed checks above
are separate evidence, not a successful full hosted browser gate. Keep PR draft
and the card In progress. Real paid cancellation/refund delivery and physical
phone acceptance remain for the launch rehearsal/final delivery.


### #192 final delivery exception — October 17

Marwane explicitly authorized squash merging PR #318 using the successful hosted
non-browser run `38916378369` and the 34 mobile/three desktop focused deployed
checks, without another full CI run. Application and tests are unchanged after
`338b8a4`; main remains `0ade231`. The full hosted browser suite has not run for
#192 and is waived for this merge only, rather than represented as successful.
Cancel automatically triggered validation for the documentation/promotion steps;
do not change CI rules or protections. The physical-phone and real Stripe-test
cancellation/refund acceptance remain explicitly unchecked in #188, as approved
on October 17. This supersedes the draft-only delivery restriction above and does
not authorize reapplying migrations or activating production payment/email.
