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

## Guest reservation access and recovery

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

## Organizer cancellation and postponement

If organizers cancel or postpone the event, initiate full refunds of the deposits
held for affected reservations without requiring participants to ask. Do not
refund an already-refunded payment twice. A new date requires a new reservation;
do not transfer attendance commitments or deposits to it automatically.

Venue changes are deferred, not a special-case policy or product flow to implement
for this first event. No venue-change cancellation deadline has been approved.

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
provider refund IDs are immutable within an operation and success cannot regress. Pending results are
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
Origin and JSON content type. A shared database limit allows 30 requests per ten
minutes per HMAC-hashed Vercel-provided IP; other hosting/local requests share one
conservative bucket. No raw IP is stored. This limits automated holds but does
not claim person-level uniqueness or immunity to distributed abuse.

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
under the original worker claim with automatic SDK retries disabled, proves that
no Checkout operation started. `reject_launch_checkout_creation` records that
unpaid rejection and releases the allocation. An ambiguous/repeated call cannot
use this exception. The participant may start a new attempt only while the
normal booking window remains open; near-cutoff network failures can therefore
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

This verifies shared schema/access and the unconfigured dispatcher, not an active
cron-to-hosted-worker cycle, persistent hosted Stripe webhook, preview interaction
states or a complete shared-database payment/refund journey. Those remain pending
deployment/configuration and focused integration QA; production activation is
still excluded. No full build or long suite was repeated for migration application.
