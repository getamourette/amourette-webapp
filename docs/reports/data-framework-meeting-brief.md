# Pilot operator: meeting outcome and next steps

Meeting outcome recorded on 2026-09-14 for [#203](https://github.com/getamourette/amourette-webapp/issues/203);
framework pointers refreshed on 2026-10-01.
This replaces the pre-meeting proposal. The outcome below is Marwane's report of
his conversation with Aymane's brother, not an independently reviewed agreement
or a completed legal framework. The [data inventory](data-framework-inventory.md)
now contains the consolidated framework status, approved rules and unpublished policy.

## Confirmed outcome

- Marwane reported that Aymane's brother agreed to have his existing Delaware
  company officially operate Amourette and to provide a dedicated Stripe account.
  His agreement covers the operating role, not just access to payment processing.
- The intended arrangement lasts until the founders can establish their own
  company, which would then take over the activity. No transfer date, jurisdiction
  or detailed handover terms have been agreed in this conversation.
- Marwane and Aymane intend to handle daily operations, including the app,
  participant requests and refunds. Access and operational procedures still need
  to be configured; this is not a promise that the brother will never be needed.
- Keep preparation proportionate to validating the first event. The meeting did
  not approve every earlier proposal about contracts, budgets or data handling.
- Planning assumptions remain one bar, approximately 50 adults, probably Paris.
  The venue and date are not confirmed. The existing EUR 10 attendance-deposit
  decision remains in place; discussing a free test did not replace it.

## Payment facts to retain

- Separate Stripe accounts can use the same legal entity and tax information,
  with the same or different payout bank accounts. Separation helps track
  Amourette; it does not create a separate company or tax treatment.
  [Stripe multiple accounts](https://docs.stripe.com/get-started/account/multiple-accounts).
- A sandbox simulates payments and refunds without moving real money. Integration
  can start before live activation. Give scoped sandbox access first; agree live
  permissions separately. The Developer role supports API keys and refunds but
  grants broad capabilities. Secret keys belong in server configuration, not git.
  [Sandboxes](https://docs.stripe.com/sandboxes),
  [access](https://docs.stripe.com/sandboxes/dashboard/manage-access),
  [roles](https://docs.stripe.com/get-started/account/teams/roles).
- Stripe lists online dating and matchmaking as restricted activities requiring
  additional review. Present Amourette's actual model, including the bar event,
  EUR 10 reservation and refund rules. Approval for another business and successful
  sandbox tests do not establish approval for Amourette. Stripe determines the
  additional information required; no fixed checklist or acceptance is assumed.
  [Restricted businesses](https://stripe.com/legal/restricted-businesses).
- Payments enter the Stripe balance, pending then available; payouts move funds
  to the configured bank account. Refunds use available funds and can remain
  pending when funding is insufficient. The bank destination, currency, payout
  schedule and refund funding are not yet agreed.
  [Payouts](https://docs.stripe.com/payouts), [refunds](https://docs.stripe.com/refunds).
- Fifty fully refunded EUR 10 reservations require EUR 500 in refunds plus the
  original processing costs that Stripe normally retains. Refundable money is
  not an advertising budget. Fee and refund-liquidity notes were already added to
  [#185](https://github.com/getamourette/amourette-webapp/issues/185#issuecomment-5605464353)
  and [#187](https://github.com/getamourette/amourette-webapp/issues/187#issuecomment-5605464632);
  [#190](https://github.com/getamourette/amourette-webapp/issues/190) owns participant
  refund wording. [Stripe fees](https://support.stripe.com/questions/understanding-fees-for-refunded-payments).
- The ordinary spending route discussed is Stripe payout to the company bank,
  then an authorized company payment for ads or suppliers. Marwane also explored
  personally funding ads. No spending budget, reimbursement arrangement or
  founder compensation was agreed; preserve receipts for any personal advances.
- Leaving earnings in Stripe does not by itself prevent taxation. The company's
  actual tax classification and the treatment of refundable reservations,
  refunds and expenses remain unknown. Do not assume the brother has an accountant
  or that the pilot has no reporting/tax consequences.
  [IRS accounting methods](https://www.irs.gov/publications/p538),
  [LLC taxation](https://www.irs.gov/businesses/small-businesses-self-employed/single-member-limited-liability-companies).

## Public documents: terminology and purpose

| Document | Purpose |
|---|---|
| Legal notice | Identify the actual service operator and provide applicable legal/contact disclosures. |
| Terms of Use / Terms of Service | Explain access, account, conduct and moderation rules. These are the CGU; “conditions of use” is not another document. |
| Privacy Policy | Explain actual personal-data use, responsible entity/person, purposes, recipients, retention and participant rights. |
| Booking Terms, including Refund Policy | Explain the reservation, payment, cancellation, arrival and refund conditions. These can be combined rather than split into multiple pages. |

GDPR is a regulation, not another document. Real participant-data processing in
this pilot is not exempt just because the service is experimental or free. GDPR
also does not, by itself, require a company: a natural person can be a controller.
The company's actual role must support the public wording; naming it alone does
not establish exclusive controller status or complete compliance.
[CNIL scope](https://www.cnil.fr/fr/rgpd-de-quoi-parle-t-on),
[roles](https://www.cnil.fr/fr/rgpd-comment-bien-identifier-son-role),
[information duties](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence).

## Later framework updates

Update (2026-09-30): Marwane supplied an InboxPilot privacy-policy excerpt naming
2810 N Church St PMB 16104, Wilmington, Delaware 19802-4447, USA as its contact
address, and says the same company will operate Amourette. He clarified that the
company is InboxPilot. Its [hosted DPA PDF](https://www.inboxpilot.co/DPA%20InpoxPilot.pdf)
names InboxPilot, Inc.; its online privacy policy and DPA corroborate the contact
address. The inventory and drafts now use those sourced details. No registration
number or registered-office status was independently verified.
Stripe access remains unverified in this workstream. The operator decision is
settled; do not repeat this meeting or the rejected account/customer verification.
Subsequent update (2026-09-30): Marwane approved preparing a separate EU Supabase
production project before launch and switching the public application at launch,
while preserving the current US project for development. Implementation is tracked
in [#280](https://github.com/getamourette/amourette-webapp/issues/280) as P0; this
was a later framework decision, not an outcome of the operator meeting. Other
inventory suggestions remain discussion inputs unless explicitly adopted, and
approved policies must not be confused with implemented guarantees.

October 1 consolidation: the eleven privacy-policy sections have been reviewed
for wording, retention decisions have implementation owners, #281 is merged and
#142 confirms the privacy channel with Marwane primary and Aymane backup. October 2
refresh: #257/#283 merged October 1, and a working pilot DPIA is now drafted with
release-evidence completion assigned to existing work. No DPO appointment
obligation is identified for the described pilot. Marwane subsequently deferred
EU-representative designation on October 2: none for now, without a verified legal
exemption or a replacement task. The inventory records these dispositions. It also
records explicit closures and deferrals, including statistics, continued chat,
the detailed email-provider investigation and the additional discussion of
hypothetical sensitive information in reports. The latter was deferred on
October 1 until a concrete need arises, without a replacement task or publication gate.
These must not be recreated as open actions. Framework completion is separate
from implementing every deferred automation and from publishing the policy.

The company's agreement does not establish the founders' personal legal capacity
to perform their intended activities. Personal status details stay outside these
project notes. Asset ownership, future handover mechanics and spending authority
have not been changed by this discussion.

This update records the conversation only. It does not complete #203, establish
Stripe approval, or authorize application changes, deployment or public launch.
