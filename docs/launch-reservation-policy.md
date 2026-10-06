# Launch reservation policy

Amourette uses a EUR 10 refundable deposit to make attendance commitments
credible for its first capacity-limited bar event. The event is free after the
deposit is refunded. The deposit does not buy a drink or fund admission.

This is the implementation reference for [#183](https://github.com/getamourette/amourette-webapp/issues/183)
and its children, prepared under [#190](https://github.com/getamourette/amourette-webapp/issues/190).
The rules below consolidate the founder decisions of October 6, 2026.
[The decision log](decisions.md) preserves their rationale and history, including
superseded proposals. Use this document for the current agreed policy.

## Reservation and capacity

- Each participant reserves individually, with their own EUR 10 deposit,
  confirmation and personal QR. There are no group bookings.
- The bar supplies the capacity available for this event, accounting for its
  usual clientele. That number is the reservation quota.
- Open reservations only once the venue, event date, start and end times, quota
  and registration opening are confirmed. Close paid reservations at the event
  start or while the quota is full.
- Reservations within the last 48 hours are allowed, with an explicit warning
  before payment that free cancellation is no longer available.
- At capacity, offer a free email waitlist. Organizers contact the next person
  in signup order manually when a place becomes available. The person pays only
  when reserving. There is no automatic promotion, invitation-expiry engine or
  guaranteed place merely for joining the waitlist.
- Walk-ins pay no deposit to Amourette. The bar controls admission and available
  space. Reservations do not override its admission or capacity decisions.

The existing account and completed-profile requirement in #184 remains in scope.
Reservation acceptance does not activate visible presence in the app; only the
participant can do that separately.

## Cancellation and absence

The free-cancellation deadline is exactly 48 elapsed hours before the scheduled
event start. Cancellation confirmed at or before that instant receives a full
EUR 10 refund. Display the actual deadline, with the venue's local date, time and
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
its arrival QR. Do not classify someone as a no-show while arrivals are still
allowed during the event.

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

The participant receives the full EUR 10. Payment-processing costs are borne by
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
