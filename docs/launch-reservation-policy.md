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
  and registration opening are confirmed. Close paid reservations at the event
  start or while the quota is full.
- Temporarily hold a place during payment and release abandoned holds safely.
  #182 owns durable allocation state and atomic capacity guarantees; #185 owns
  Checkout orchestration, expiry coordination and delayed-payment handling.
  #185 must choose and verify the provider-compatible hold duration. The #182
  transition contract below defines safe release and late-payment handling.
- Reservations within the last 48 hours are allowed, with an explicit warning
  before payment that free cancellation is no longer available.
- At capacity, offer a free email waitlist. Organizers contact the next person
  in signup order manually when a place becomes available. The person pays only
  when reserving. There is no automatic promotion, invitation-expiry engine or
  guaranteed place merely for joining the waitlist.
- Walk-ins pay no deposit to Amourette. The bar controls admission and available
  space. Reservations do not override its admission or capacity decisions.

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
| 3 | #185 | Server Checkout, capacity and timing enforcement, signed payment events, account fees/timing | #182 |
| 4 | #187 | Founder booking settings, cancellation/postponement actions, refund queue, exceptions and reconciliation | #185 |
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
Booking opens at the configured registration instant and closes at event start,
with half-open intervals `[opening, start)` and `[start, end)` for arrival.
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

Hold duration, payment-method selection, webhook signature verification and real
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
#185/#187 own the worker, scheduling, reconciliation UI and external refund call.
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
