# Pilot personal-data framework and inventory

Prepared on 2026-09-09 for [#203](https://github.com/getamourette/amourette-webapp/issues/203).
Consolidated through 2026-10-02. This contains approved pilot decisions, an unpublished
privacy-policy draft and dated technical evidence. It is not a blanket compliance
finding or a completed processing register. Historical proposals are not policy.
The [meeting outcome](data-framework-meeting-brief.md) is the nontechnical companion.

Status update (2026-09-14): Marwane reports that Aymane's brother accepted having
his Delaware company officially operate Amourette and provide a dedicated Stripe
account. The September 30 operator section below supersedes the earlier missing
company details; the operating role is settled and must not be reopened.
The original technical evidence below dates to September 9. Subsequent evidence
and approved decisions are recorded separately below; the original proposals are
not approved except where these later updates explicitly supersede them.

## Workstream status refresh — 2026-10-02

**Framework discussion complete; documentation prepared for review.** The discussed
choices have an approved rule, an assessment or an explicit founder deferral.
No new policy decision is being added by this handoff. This is not launch approval
or a finding that the production controls and DPIA residual-risk review are complete.

| Deliverable | Location and delivery boundary |
|---|---|
| Privacy-policy wording | Eleven reviewed sections in this inventory; unpublished English draft. The existing board task **Publish the reviewed privacy policy and integrate EN/FR/ES links** owns final public copy, release alignment and integration. |
| Processing record | [Register](data-processing-register.md); reference draft approved for Git tracking, with pending production facts explicit. |
| DPIA | [Pilot assessment](pilot-data-protection-impact-assessment.md); working assessment, with actual controls and residual-risk completion tied to #280/#48 and existing implementation scopes. |
| Operator background | [Meeting outcome](data-framework-meeting-brief.md); historical rationale, not another operator meeting. |
| Decision history | [Append-only decisions](../decisions.md); preserve the explicit closures and deferrals. |

Remaining execution belongs to its existing scopes: #280 for production facts,
the policy publication card and #141 for public information, #292 for legal
notices/terms, #184/#190 for registration/booking rules, and the retention issues
listed below. Browser-storage wording must reflect the launched behavior; the
policy publication work does not presume a cookie banner or reopen statistics.
Retention implementation includes its actual operator or manual fallback; merely
listing an issue is not evidence that cleanup runs. Several retention issues
remain unassigned, so no new overall retention owner is inferred here.

The consolidated #203 issue and this section supersede older status/action lists
in this inventory. Preserve the dated evidence below without treating historical
proposals or superseded questions as current work. The documentation is delivered
through the #203 PR; the participant policy remains unpublished.

**Settled:** InboxPilot's operating role/details; the privacy contact and manual
handling; approved legal-ground choices and retention rules; manual photo review;
EU production/US development separation; the eleven policy sections' wording.
The statistics and continued-chat justification discussions are explicitly closed,
not legal-compliance findings. The detailed Resend/Cloudflare/Gmail investigation
is deferred, and the account/customer verification was rejected. Do not reopen
these through a generic publication checklist or a replacement task.

| Follow-up | Dated state, refreshed where noted | Meaning for #203 |
|---|---|---|
| #281 / PR #285 | Closed/Done; PR merged October 1 | Consent flow implemented; final public wording and #287 retention remain separate. |
| #142 | Closed/Done; September 30 closing comment confirms operational checks | Marwane primary, Aymane backup; monitoring arrangements satisfactory. No new cadence decision inferred from lack of a recorded number. |
| #257 / PR #283 | Merged October 1, verified October 2 | Main includes the report and terminal-source cleanup. The earlier draft status is superseded; production release is not verified by the merge. |
| #280 | Ready, P0 | EU production/cutover, Supabase/Vercel locations and transfer checks, chosen plans/logs/backups. |
| #258 | Backlog | Profile/account deletion and two-year inactivity rule; actual requests handled manually meanwhile. |
| #259 | Backlog, expanded October 1 | Subscription, three-year unsubscribe-record and 30-day delivery-record cleanup, with manual fallback. |
| #260 | Backlog | Approved report-retention cleanup. |
| #234 | Inbox | Moderation audit, including approved photo-decision expiry and supporting version-reference handling. |
| #286 | Backlog | Approved 24-hour onboarding-draft expiry. |
| #287 | Backlog | Approved minimal matching-consent evidence retention and expiry. |
| #141 / policy publication board item | Ready / Backlog, verified October 2 | Public contact and final policy/link/localized integration. Initial drafting and eleven-section wording review are already done. |

Marwane deferred the additional discussion of hypothetical sensitive information
in reports on October 1 as too granular for this pilot. Revisit only if a concrete
need arises; no replacement task, form change or publication gate is requested.
Keep the approved safety purpose, legal basis in principle and retention rules.
This records a workstream deferral, not a completed legal assessment.

Processing-record applicability is assessed below and Marwane authorized drafting
it on October 1. Version 0.1 is in
`docs/reports/data-processing-register.md`; Marwane subsequently accepted Git
tracking despite the repository's public visibility. It is not a completed
production record; #280 still supplies the missing production facts.
The October 2 DPIA screening and working assessment are recorded below. The
EU-representative designation was deferred by Marwane on October 2: no appointment
for now. Remove it from active #203 actions without a replacement task. This is
a founder disposition, not a verified legal exemption. The DPO assessment reported
October 2 identifies no appointment obligation for the described small Amourette
pilot; it does not assess InboxPilot's unrelated activities or appoint the privacy
handler as DPO. These findings do not require outside legal advice. Do not reopen agreed
report retention, matching/chat behavior, statistics or operator identity.

Before publication, reconcile promises with release evidence/manual procedures,
use #280's verified hosting facts and finish the actual policy links/localized
copy. Residual technical metadata notes should be checked within the relevant
implementation scopes; they are not automatically separate founder decisions or
launch blockers, and indefinite retention is not silently approved. Keep the
settled pilot treatment of operational presence. #203 delivers this framework.
The existing policy-publication card coordinates release reconciliation and DPIA
completion using #280/#48 and the existing implementation tasks; closing #203
does not mark those release checks or deferred automation complete.

## DPIA screening and working assessment — 2026-10-02

Marwane authorized progressing the DPIA if warranted. The
[pilot DPIA](pilot-data-protection-impact-assessment.md) records the assessment:
sensitive/intimate data plus systematic observation of identified attendance and
interactions warrant a proportionate DPIA for the planned pilot. This is an
application judgment based on the actual design and official criteria, not a
claim that every small dating pilot is automatically covered or a new statistics
justification task. No uncertain profiling classification is needed for the conclusion.

Version 0.1 includes the processing description, necessity/proportionality review,
risks to participants and existing safeguards. Production facts and residual-risk
completion use #280/#48 and existing implementation scopes, including #235; no
duplicate implementation issue is created. The assessment remains a working draft,
not operator validation, deployment proof or a blanket legal finding.

The CNIL confirms there is no obligation to publish the DPIA. This working draft
is included in the authorized public repository delivery; it has not been
published on the participant website or submitted to the CNIL. A high remaining risk despite safeguards, not writing a DPIA alone,
is the relevant prior-consultation trigger. Public GitHub visibility is recorded
in the document so repository delivery is not mistaken for private storage.

Read-only evidence: main at `05a6ac8ad6a95c9dbb122375cdae5095c426f877`; #283 merged
October 1 at 13:34:39 UTC. That evidence was checked before the documentation delivery rebase. See the DPIA for
source links and the distinction between merged implementation and released controls.

## Public legal documents — separate follow-up

Public legal notices and Terms of Use are a separate delivery task:
[#292](https://github.com/getamourette/amourette-webapp/issues/292), created at
Marwane's request on October 2. It covers drafting, EN/FR/ES copy and site/app
integration, with legal notices for the public landing and terms before real
pilot registration. #190 retains booking/cancellation/refund terms; #184/#185
retain registration/payment implementation. #203's data decisions are inputs,
not a reason to expand or restart this framework.

## Formalities assessment: processing record — 2026-10-01

**Verified rule:** GDPR Article 30(5)'s exemption for organizations with fewer
than 250 employees does not cover non-occasional processing or processing of
Article 9 data. These are alternative triggers, not cumulative conditions.
**Application to the agreed pilot:** maintain an Article 30 processing record
for Amourette's relevant activities. Persistent participant accounts are part of
normal service operation, and matching uses preferences revealing sexual
orientation. The approximately 50-person scope does not exempt those activities.
This conclusion does not depend on hypothetical sensitive report content.

The record is internal, written and available to the supervisory authority on
request; no specific software or routine filing is prescribed. Its entries cover
the controller/contact, purposes, categories of people and data, recipients,
international transfers, erasure periods and a general security description where
possible. Existing inventory sections supply much of this information.

**Execution authorized October 1:** Marwane requested drafting the record. A
separate working version now exists at `docs/reports/data-processing-register.md`,
reusing this inventory's approved decisions. It has eight activity entries with
shared controller, recipients/location and security sections. Production facts
and implementation evidence remain explicitly incomplete where relevant.

GitHub visibility was verified as public on October 1. Marwane subsequently
requested keeping this version in Git, superseding the initial local-only storage
choice. The reference copy is now alongside the framework reports; no separate
private-folder task remains. Participant records, credentials and confidential
attachments stay outside this public document. No new platform, participant
checkbox or repeat policy review is needed.
The subsequent October 2 dispositions for DPIA, representative and DPO are
recorded above and supersede the original open-question status.

Sources checked October 1: [CNIL processing-record guidance](https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement)
and [GDPR Article 30](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4).

## Operator information and service accounts — 2026-09-30

Marwane reports that Supabase and Vercel use Aymane's personal accounts, while
Resend uses Marwane's personal account. He confirms that the intended operating
arrangement is through Aymane's brother's company. He subsequently supplied the
opening of an InboxPilot privacy policy dated June 17, 2025, as a source for that
same company's details. It identifies InboxPilot at 2810 N Church St PMB 16104,
Wilmington, Delaware 19802-4447, USA. Record this as a supplied contact address,
not independently verified registered-office evidence. Marwane corrected the
earlier name to InboxPilot and directed inspection of its public legal documents.
The [hosted DPA PDF](https://www.inboxpilot.co/DPA%20InpoxPilot.pdf) explicitly names
InboxPilot, Inc. on its first page. The [online DPA](https://www.inboxpilot.co/legal/dpa)
and [privacy policy](https://www.inboxpilot.co/legal/privacy) use the shorter
InboxPilot name with the same Wilmington address. Use InboxPilot, Inc. and that
contact address as sourced drafting inputs; the online pages do not supply a
registration number or independently establish the address as a registered office.
This resolves the drafting-name question without claiming a corporate-registry audit.
InboxPilot's operating role is settled by Marwane's confirmation. Personal founder
logins are not a reason to reopen that decision. Marwane rejected the additional
Supabase customer/accepting-person verification introduced by the assistant;
that section has been removed from #280. Do not request it again or treat it as
an additional launch prerequisite in this workstream. The existing EU production
preparation and agreed hosting-plan checks remain unchanged.

## Full privacy policy — working draft v0.1, 2026-09-30

**Internal draft for section-by-section review. Not for publication.** This is a
complete first drafting pass, not a finalized policy: numbered review markers
identify unresolved content or release checks. Remove them only after resolving
the corresponding note below. Earlier approved decisions remain authoritative.

Section review: Marwane approved section 1 as presented in French on September 30
(operator, responsibility for the described processing, contact address/privacy
email, policy scope and 18+ audience). For section 2, he approved replacing vague
support-request wording with emails addressed to the team and in-app reports;
this does not imply an in-app support feature. Marwane also approved the section 3
purpose list presented in French: profiles/participation, compatible discovery and
mutual matching, matched chat, manual photo review/reports/blocks, night statistics,
opt-in announcements, email/rights responses, and service operation/security.
This approves the description of uses, not the unresolved legal-ground candidates.
Marwane approved section 4's French wording on explicit matching consent and
withdrawal: immediate removal from discovery, no new likes/matches, covered
preference use stopped and deletion initiated, existing chats until night end
under presence/safety rules, and no automatic account deletion or marketing change.
Marwane closed the additional ongoing-chat justification discussion on October 1;
the behavior remains approved, without a legal-compliance finding.
Marwane approved the revised section 5 in French: participant visibility,
purpose-based authorized team access and the Supabase/Vercel/Resend/Cloudflare/
Google-Gmail provider list. The approved public version omits the technical
administrator-access explanation and the manual-review/disabled-AI sentence.
Marwane approved section 6's French wording describing EU database/photo hosting
and possible processing outside the EU by the US operator, team or providers.
EU hosting remains the #280 release target; the transfer safeguards disclosure
still needs completion. Approval of the wording does not verify the cutover.
Marwane approved section 7's French retention summary, including the grouped
statistics wording and the distinction between participation records and chat.
Later October 1 decisions below settle pilot presence, email-delivery,
unsubscribe-record and consent-evidence retention. Remaining technical-copy
checks follow the consolidated status above; approval does not establish implementation.
Marwane approved section 8's French explanation of browser-stored session,
settings, profile drafts and conversation read state, including the effect of
clearing browser data on drafts and session access. Storage lifetimes and any
applicable consent requirements remain to complete against the released behavior.
Marwane approved section 9's French wording on data rights, the privacy contact,
response deadlines, proportionate identity verification, separate consent/email
controls and the right to complain directly to the competent supervisory authority.
Marwane approved section 10's French wording on access controls, authenticated
sessions, restricted photo storage, encrypted network connections and incident
response/required notifications. Deployed-control verification remains open as
noted below; wording approval does not certify those controls.
Marwane approved section 11's French wording on dated updates, notice of material
changes and separate consent where required; continued use does not itself give
consent to a new purpose. All eleven sections have now been reviewed for wording.
The explicit review notes below remain open before publication; wording approval
does not resolve legal-ground candidates or verify pending implementation.

### 1. Who we are and how to contact us

Amourette is operated by **InboxPilot, Inc.**, the organization responsible for
the personal-data processing described in this policy.

Contact address: **2810 N Church St PMB 16104, Wilmington, Delaware 19802-4447, USA**.

For questions about your personal data or to exercise your rights, email
**privacy@getamourette.com**.

This policy explains how we use personal data when you visit Amourette, create
a profile, participate in a venue night or contact our team. Amourette is intended
for adults aged 18 and over.

### 2. What data we use and where it comes from

You provide your profile information, including your first name, photographs,
optional biography, gender, dating preferences and confirmation that you are
at least 18. We also receive the messages and in-app reports you choose to send,
and record how those reports are handled. We receive emails you address to the
team, including questions and requests about your personal data. We collect your
email address if you subscribe to future-night announcements or email us.

Using the service generates account and session identifiers, records of joining
and leaving a venue night, activity timestamps, likes, mutual matches and
conversation activity. Participation records indicate the venue you attended.
Other participants may supply information about you through a report or a message.

Technical services also process information needed to deliver and protect the
app, such as request paths, IP addresses, browser information and error records.
Your browser stores session information, settings and draft data as explained below.

Your profile and an adult confirmation are required to enter the participant
experience. Matching requires your agreement to the covered use of gender and
dating preferences. A biography and subscription to announcements are optional.

**[Review 1: verify this field list against the release, including consent-first
draft storage and any booking/payment collection.]**

### 3. Why we use your data

We use your data to:

- maintain your profile and session and show who is participating in a venue night;
- suggest mutually compatible participants, process discreet likes and open a
  conversation when two participants like each other;
- deliver messages between matched participants during the venue night;
- review photos manually, handle reports and blocks, and protect participants;
- evaluate and improve venue nights through statistics on entry into the app,
  participation, likes, matches and conversations started;
- send future-night announcements when you choose to subscribe;
- respond to requests, maintain the service and meet applicable legal obligations.

These statistics help us identify entry difficulties, understand whether matches
are spread across participants and measure whether matches lead to an exchange.
They do not establish whether participants actually spoke in person. After the
night, the retained report contains grouped statistics without participant names
or account identifiers, message content or individual interaction histories.

**Legal grounds.** Use of gender and dating preferences for matching is subject
to your explicit consent. Future-night marketing emails use a separate consent.
We process the data necessary to manage your account and session and enable
your participation in venue nights to perform our service contract with you.
We use the data necessary to handle reports and protect participants and the
service on the basis of our legitimate interests in preventing abuse and
maintaining a safe service, while respecting the rights of those involved.
We use the information necessary to handle your data-rights requests and comply
with our legal obligations under data-protection law.
We measure QR scans, profile completions and room entries to understand how the
entry flow works and improve it, on the basis of our legitimate interest in
evaluating and improving the service, using only the data necessary for that purpose.
Other purposes require their own legal grounds.

**[Review 2: complete the purpose-by-purpose grounds before publication. Legitimate
interests for participant protection/report handling and service security are
approved in principle. The additional report-content assessment was deferred by
Marwane on October 1; do not recreate it as a publication gate or a generic safety
assessment task. Deferral does not establish a legal finding. Legal obligation is approved for
handling applicable data-rights requests. Legitimate interests are approved in
principle for entry-flow measurements. The later explicit statistics-discussion
closure supersedes separate reassessment instructions; it does not establish an
exemption for browser tracking. The additional continued-chat justification discussion was
closed by Marwane on October 1; it is not a pending assessment. The separate statistics-justification
discussion was closed at Marwane's explicit request; see the disposition below.]**

Internal approval (September 30): Marwane approved contractual necessity for
account/session management and access to venue nights after the plain-language
explanation. This is limited to data objectively necessary to provide those
functions; it does not resolve sensitive-data conditions, continued chat after
withdrawal, statistics or retention of past participation records.

Marwane also approved legitimate interests in principle for participant protection,
report handling and service security: the team needs to investigate reports and
act without obtaining the reported person's consent. This does not authorize
unrestricted access or retention, and does not by itself permit processing
sensitive report content. The existing retention choices remain unchanged.
The later October 1 deferral removes the additional hypothetical-content
discussion from active work; revisit only for a concrete need.

Marwane approved legal obligation for handling applicable data-rights requests,
using only the information necessary to process and answer them. This describes
the agreed manual privacy-email workflow; it creates no new tooling or retention
period and does not assign that basis to unrelated contact emails.

Marwane approved legitimate interests in principle for measuring the entry flow
(QR scans, profile completions and room entries) to identify friction and improve
the service. This does not approve gender/preference breakdowns, like/match/chat
analytics or a new collection mechanism. The agreed report and source-cleanup
requirements remain unchanged. The later founder closure below supersedes the
previous instruction to keep a separate statistics-basis follow-up open.

Marwane rejected the proposed separate optional consent for like/match analytics.
Do not add that control or change #257/#281 on the strength of the proposal. The
assistant proposed it before establishing whether it was necessary for the actual
calculations. This rejection does not establish that legitimate interests alone
cover sensitive inputs, or that the agreed report is already legally validated.
The later founder closure ends the proposed additional reassessment work.

Research note (September 30): [EDPB Guidelines 02/2026, version 1.0, paragraph
38](https://www.edpb.europa.eu/system/files/2026-07/edpb_guidelines_202602_anonymisation_v1_en_0.pdf)
state that anonymisation itself needs an Article 6 basis and, where applicable,
an Article 9 condition. Those may coincide with the preceding processing when
anonymisation belongs to the same activity and pursues the same purposes. This
is guidance under public consultation, not a finding that Amourette's statistical
evaluation shares the matching purpose. Producing an effectively anonymous report
as part of terminal cleanup is a route to assess, not an approved exemption.

### 4. Your matching preferences and choices

**Disposition (2026-10-01): discussion closed by Marwane.** Keep the current
withdrawal behavior: stop the feed and new likes/matches immediately, stop covered
preference use and perform its cleanup, and keep existing conversations until
definitive night end under the existing presence and safety rules. Marwane
explicitly rejected keeping this point open or referring it for legal advice.
Remove it from active #203 follow-ups; do not create a replacement review task,
new consent control or implementation change. This supersedes earlier requests
to establish a separate chat justification before publication. It records the
founder's workstream decision, not a legal-compliance finding or evidence of
production deployment. The proposed contract basis below is not separately
approved merely by closing the discussion.

Historical research update (2026-10-01), retained as analysis rather than an
active recommendation, approved new basis or public copy:
contractual necessity is the recommended Article 6 basis for delivering the
existing matched-chat service requested by participants, limited to necessary
conversation routing, access and message storage until terminal night end.
It would apply from the start of that service, not replace withdrawn matching
consent retrospectively. [CNIL contract guidance](https://www.cnil.fr/fr/les-bases-legales/contrat)
requires objective necessity; merely adding the processing to terms is insufficient.

This does not settle Article 9. The [GDPR text](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre2)
requires an applicable exception for sensitive processing; contract is not one.
The [CJEU's C-184/20 judgment, paragraphs 119–128](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A62020CJ0184)
also addresses indirectly revealing sensitive data. Applying that principle here,
retained dating pairs and message content may reveal sexual orientation even
after profile preferences are erased; this is an application to assess, not a
ruling about Amourette or a claim that every message is sensitive.

Inspection of #281 at `a81d28e` confirms the express agreement covers gender and
preferences for suggestions/profile visibility. The information panel describes
continued chat, but that disclosure alone does not establish separate explicit
chat consent. The assistant's subsequent recommendation for a focused legal review
was rejected by Marwane and is withdrawn. No new checkbox, change to withdrawal
behavior or implementation task is authorized.

We use your gender and the genders you want to meet to suggest compatible people
at the same venue night and show your profile to them. These choices can reveal
information about your sexual orientation.

You can withdraw your matching consent from your profile at any time. Withdrawal
immediately removes your profile from discovery and stops new likes and matches.
We stop the covered use of your preferences and initiate their deletion.

Your existing conversations remain available until the definitive end of the
venue night, subject to the usual presence, blocking and moderation rules. They
are then deleted. Withdrawing this consent is different from deleting your account.

Withdrawal does not change the lawfulness of processing carried out before it.
It does not subscribe or unsubscribe you from future-night emails.

**[Review 3: the continued-chat behavior is a founder-approved product choice;
the additional justification discussion is closed. Verify working withdrawal,
preference cleanup, and handling of consent evidence before publishing this text.]**

### 5. Who can receive your data

Other eligible participants see the profile information presented by the app,
such as your first name, photo and biography, within the venue experience.
Likes are discreet: a conversation opens only when interest is mutual. Messages
are made available to the matched participants.

Authorized team members handle service operation, photo moderation, reports and
privacy requests, with access to the data needed for these tasks.

We use service providers for these functions:

| Provider | Function for Amourette |
|---|---|
| Supabase | Database, account sessions, photo storage and real-time communication. |
| Vercel | Website and server-side application hosting. |
| Resend | Delivery of application emails and configured outgoing team replies. |
| Cloudflare | Domain/DNS services and routing emails sent to our contact addresses. |
| Founder mailbox providers | Receipt and handling of forwarded contact emails; current routing uses Gmail. |

**[Review 4: verify released participant/admin access, current provider functions
and any additional recipients. Identify applicable payment recipients separately
if booking is enabled. Do not import InboxPilot's email-product provider list.]**

Internal wording correction (September 30): Marwane requested removal of the
public explanation of privileged database access as well as the unnecessary
sentence about first-evening manual review and disabled AI. The public wording
now describes authorized team access by purpose without interface/database details
or a claim that the team cannot access messages.
Keep those facts in the technical inventory only. Inspection of `origin/main`
admin components found no conversation-content reader; read-only live role metadata
confirms `postgres` and `service_role` can SELECT messages and bypass RLS. No message
content was retrieved. Do not claim all team members are technically unable to
read messages, or invent an exceptional-access-only policy not yet established.

### 6. Hosting and international access

Our production database and photo storage are hosted in the European Union.
Our operator is based in the United States, and members of the team or service
providers may process or access data outside the European Economic Area.

**[Review 5: the EU sentence describes the approved launch target, not the current
US test environment. Confirm #280 cutover before publication. Complete the actual
locations, recipients and applicable transfer safeguards, with a way to request
a copy, without implying that an EU database means all processing stays in the EU.
Keep these as factual provider/transfer questions, not a renewed operator-account
verification task.]**

### 7. How long we keep data

| Data | Retention rule |
|---|---|
| Profile and current photos | Between nights, then deletion after two years without voluntary app use, or earlier following a valid deletion request. Automatic session refresh does not renew the period. |
| Gender and dating preferences | The profile period applies while consent remains active; withdrawal stops covered use and initiates deletion earlier. |
| Matching-consent evidence | While we rely on the consent, then 12 months after withdrawal or account deletion, whichever occurs first. Keep only the account reference, grant/withdrawal dates and accepted wording version, without preferences, photos or messages. A new agreement does not extend older evidence's expiry. Necessary evidence may be kept longer for an ongoing dispute, until resolution. |
| Unfinished onboarding draft on your device | Available to resume for 24 hours from your last deliberate edit, then discarded and cleared when the app next runs its cleanup. Cleared earlier when the profile is successfully created. Simply reopening or reloading does not extend the period. |
| Night likes, matches and conversations | Deleted at definitive venue-night end. Temporary pauses do not end the night. |
| Replaced photos and refused proposed replacements | Removed by scheduled cleanup once no current or pending photo needs the file and it is more than 24 hours old from upload. This is not an extra 24 hours after replacement. |
| A displayed photo rejected by moderation | Hidden from participant profile surfaces immediately. File protection ends upon an approved replacement or after 30 days without correction, subject to the ordinary upload-age threshold and scheduled cleanup. |
| Photo-moderation decisions | While correction remains active, then 12 months after resolution; necessary evidence may be retained longer for an ongoing dispute. Deleted images are not kept through this decision-history rule. |
| Blocks | While both profiles exist. |
| Participant reports | During handling and for 12 months after case closure, unless a specific continuing need is documented and reviewed, such as an ongoing dispute or justification for an active sanction. |
| Future-night email subscription | Three years from subscription or the last explicit subscription confirmation. Unsubscribe stops announcements immediately. Sends, opens and ordinary app activity do not restart the period. |
| Announcement unsubscribe record | Three years from unsubscribe, retaining only the email address, unsubscribe date and do-not-send status to prevent unwanted announcements. Deleting this record at expiry does not resubscribe anyone; resuming announcements requires a new explicit agreement. |
| Application email-delivery records | 30 days after successful sending or definitive abandonment after failure. This covers the recipient address in the delivery record, delivery data, dates, status and errors. Information needed to respect unsubscribe choices and prevent sending to blocked addresses is handled separately. |
| Privacy requests and responses | 12 months after closure. Supporting documents and copies of participant data are removed sooner when no longer needed. Necessary evidence may be retained longer for an ongoing dispute. |

Arrival, departure and other participation records are separate from chat and
are not automatically erased when the night ends.

We use activity data from the venue night to understand registrations,
participation, likes, matches and conversations started. At the end of the night,
we retain grouped statistics without participant names or account identifiers,
message content or individual interaction histories.

**[Review 6: verify #257's agreed cleanup/report scope against the released behavior.
Preserve the settled pilot treatment of operational presence and the closed
statistics discussion. Reconcile necessary technical metadata and email suppression
within existing implementation scopes, without silently approving indefinite
retention. Consent-evidence retention is decided; verify expiry and account-deletion
handling under #287/#258. Email-delivery and announcement-unsubscribe retention
are also decided; their cleanup is tracked in #259.]**

Technical logs and backups can have separate retention periods. Deleting data
from the active application does not necessarily erase every backup immediately.
Database backups do not include the actual photo files stored through Supabase
Storage. We cannot recall copies that another participant has already downloaded.

**[Review 7: insert actual production log/backup periods and restoration treatment
from #280. Confirm each promised deletion rule can be fulfilled, manually where
agreed, while #258/#259/#260/#234 automation remains pending. Do not publish
unverified provider-copy deadlines.]**

### 8. Browser storage

The app uses browser storage for the session, interface preferences, profile
drafts and functions such as conversation read state. This can keep some
information on your device between visits. Clearing browser data can remove
local drafts and interrupt access to your existing session.

You can resume an unfinished profile draft for 24 hours after your last deliberate
edit. This covers the first name, biography, photo and form progress saved on your
device; gender and dating preferences are not saved in the persistent draft.
We clear the draft when your profile is successfully created. An expired draft
is no longer restored and is cleared when the app next runs its cleanup, including
when you reopen it. The app cannot clear device storage while it is closed.
Simply reopening or reloading does not extend the draft's lifetime.

**[Review 8: finish the released browser-storage inventory, its purposes and
lifetimes, and the treatment of any optional tracking. Do not claim all storage
is exempt from consent or that analytics are absent without checking. #281 must
prevent sensitive draft persistence before consent. The October 1 draft-retention
rule is approved; verify its implementation before publishing these promises.]**

### 9. Your rights

Depending on the processing and applicable law, you can request access to your
personal data, correction, deletion or restriction of use. You can also object
to processing based on legitimate interests and request portability where its
conditions apply. You can withdraw consent without affecting the lawfulness of
earlier processing.

For these requests, contact **privacy@getamourette.com**. We respond without
undue delay and normally within one month. If complexity or the number of requests
requires an extension, we will explain the reason within that first month; the
extension can be up to two additional months.

We may ask for proportionate information if we have reasonable doubts about
your identity. We do not require identity documents systematically. We protect
other people's rights when responding and explain any applicable limits to a request.

You can stop future-night announcements using the unsubscribe link in our emails.
This does not itself delete your profile. Matching consent can be withdrawn from
your profile as described above.

You can complain to the competent data protection authority, including the
[CNIL in France](https://www.cnil.fr/fr/adresser-une-plainte). You do not need to
contact us before doing so.

### 10. Security

We use access controls, authenticated sessions, restricted photo storage and
encrypted network connections to protect personal data. We investigate incidents
and take appropriate measures to contain their effects. When required, we notify
the competent authority and affected people.

**[Review 9: align these statements with the deployed controls. EU-representative
designation was deferred October 2; no exemption, DPO designation, certification
or security guarantee is asserted by this draft.]**

### 11. Changes to this policy

We will date updates to this policy and inform you of material changes through
an appropriate channel. Where a change requires consent, we will ask for it
separately. Continued use alone does not constitute consent to a new purpose.

**Publication date: [insert when the approved policy is published].**

### Internal review references and boundary

The review markers are drafting notes, not participant-facing text. Section 1
uses the confirmed InboxPilot identity; it does not reopen that operating choice.
This draft adds no new retention decision or implementation authorization.
It does not claim that unresolved legal bases or pending release behavior have
been validated. Review section by section with Marwane in French, retain the
repository source in English, and prepare final EN/FR/ES copy after agreement.

Rights/information references:
[GDPR Articles 12–22](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3),
[CNIL transparency](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence).
Matching-consent and provider sources remain in the factual sections below.

## Pilot statistics justification — closed discussion, 2026-09-30

**Disposition: closed at Marwane's explicit request.** Use the agreed pilot
statistics because they are needed to evaluate the evenings. Remove the additional
statistics-justification review from active #203 follow-ups; do not create another
task or revive the rejected extra consent proposal. #257 retains its already
agreed implementation scope. This records a founder/workstream decision, not a
legal validation of the calculations. The assessment below is historical context,
not an outstanding action list; the closure supersedes its review instructions.

### Purpose and necessary inputs

Amourette needs a grouped night report to evaluate the approximately 50-adult
pilot and improve subsequent events. The report answers whether participants
can enter the app, whether likes and matches are broadly distributed, whether
matched conversations begin and receive a reply, and whether enough people are
present at the same time. Message activity is not proof of an in-person meeting.

Distinct-person counts require temporary deduplication; match distributions need
per-participant counters; reply conversion needs to distinguish the two senders;
attendance measurements need bounded presence intervals. Message text, names,
photos and a lasting individual interaction history are unnecessary for these
questions. Feedback alone cannot provide the same denominators or distributions,
though it can complement them. This necessity argument does not make every
available metric or breakdown necessary by default.

### Factual check and safeguards

Read-only inspection of the separate #257 worktree on September 30 found the
current migration at `supabase/migrations/20260930000002_durable_night_reports.sql`
(the earlier issue description names a superseded September 15 filename):

- `private.night_people` holds account references, gender and individual counters;
  `private.night_conversations` holds match references and a first-sender reference.
  The message collector records started/replied states without copying message text.
- `private.finalize_night_report` saves aggregates and removes five analytics-event
  sources plus the three temporary collector tables for that night. The terminal
  transition then deletes likes and matches. This is a code observation, not proof
  of remote application or successful production cleanup.
- The report includes gender breakdowns and counts for small groups. The inspected
  report builder stores those counts without a minimum-group suppression rule.
  Its own comment explicitly warns that identifier removal does not ensure anonymity.

The intended safeguards are a founder-only report, temporary identifying inputs,
terminal source cleanup and no retained message text or individual interaction
history. The small pilot and sensitive context increase the risk of recognizing
people from small groups or combining results with retained presence records.
These risks prevent treating the present report as proven anonymous. Existing
#257 small-group requirements remain relevant; this assessment changes no code.

### Assessment recorded before closure

The concrete interest is evaluating and improving the live service. Legitimate
interests are already approved in principle for the entry funnel; the balancing
and actual input checks remain required. This rationale supports considering
that basis for other necessary measurements, but does not settle their legality.

For like/match/chat calculations involving data that reveal sexual orientation,
Article 9 requires an additional applicable condition. Article 5(1)(b)'s treatment
of compatible statistical purposes is not itself such a condition. Article
9(2)(j) is not a general commercial-statistics exemption: it requires a supporting
Union or Member State legal basis, which has not been identified for this pilot.

Anonymising while deleting operational data is worth assessing, but labelling
evaluation as cleanup does not establish that it has the same purpose as matching.
No sufficiently supported justification has yet been established here for the
full current interaction report without additional consent. The precise question
for targeted legal review is whether this documented calculation and deletion
sequence can rely on an existing applicable Article 9 condition, and for which
metrics. This is not a new requirement to obtain consent, nor approval to add it.

### Earlier design proposal — not adopted; follow-up closed

Marwane explicitly reaffirmed that the statistics will be used and asked to solve
the issue here, rather than leave an undifferentiated legal-review dependency.
This preserves the report as the product objective; it does not settle the lawful
basis of every calculation or authorize implementation in this worktree.

The next proposal separates numerical activity measurement from analysis of
partners or preferences. A numerical count is not automatically Article 9 data,
but the complete processing and reasonably available combinations must be assessed.
The absence of an intention to infer orientation is not sufficient: see
[CJEU C-252/21, paragraphs 68–73](https://eur-lex.europa.eu/legal-content/FR/TXT/PDF/?uri=ecli%3AECLI%3AEU%3AC%3A2023%3A537).

| Required result | Minimal candidate calculation inputs | Boundary to resolve |
|---|---|---|
| Total likes and matches | Night-scoped event counts | Avoid copying participant pairs or preferences into analytics; the event-to-counter operation still needs assessment. |
| Share liking/matching and 0/1/2/3+ distribution | Temporary per-participant numerical counters | Preserve denominators without partner lists; account references are still personal data and cannot simply be relabelled anonymous. |
| Conversations started and replied | Per-conversation state: no message, one speaker, two speakers | Avoid retaining the actual first-sender account in analytics where state can be maintained without it; assess the operational-to-statistical transition. |
| Gender breakdowns and timing details | Only the fields required for each approved breakdown | Assess additional inference and small-group risk separately; neither remove these metrics nor declare them safe without agreement. |

Candidate basis for activity inputs established as non-sensitive: legitimate
interests in evaluating the live service, with a documented necessity/balancing
assessment, transparent information and applicable objection handling. No blanket
extension beyond the approved entry-flow scope has been adopted. Calculations
that still reveal sensitive information need an applicable Article 9 condition;
moving code, hashing IDs or shortening retention is not an exemption.

Keep #257's existing terminal-cleanup and small-group protections as acceptance
requirements. This is a concrete design route for discussion, not a finding that
the present implementation meets it, a metric-removal decision, or a new consent
control. No application or issue implementation was changed by this assessment.

Sources: [CNIL legitimate-interest assessment](https://www.cnil.fr/fr/les-bases-legales/interet-legitime),
[GDPR Articles 5, 6 and 9](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre2),
[EDPB anonymisation guidelines, paragraph 38](https://www.edpb.europa.eu/system/files/2026-07/edpb_guidelines_202602_anonymisation_v1_en_0.pdf)
(version 1.0 remains under public consultation on this assessment date).

## Public privacy copy working brief — 2026-09-30

This dated section assembles the inputs used for drafting. The complete draft
above has since received its eleven-section wording review and remains unpublished.
#281 has merged through PR #285; this does not establish production release.
Repository copy stays in English; French wording is reviewed with Marwane.

### Operator introduction: working adaptation of the supplied excerpt

This privacy policy explains how Amourette collects and uses personal data when
you use its website, participate in a venue night, or contact its team.

Amourette is operated by **InboxPilot, Inc.** Contact address:
**2810 N Church St PMB 16104, Wilmington, Delaware 19802-4447, USA**.
For privacy questions or to exercise your rights, email
**privacy@getamourette.com**.

You may lodge a complaint with the competent data protection authority, including
the CNIL in France. You may contact us for help without first doing so being a
condition for complaining to an authority.

We will date updates to this policy and inform you of material changes. Where a
change requires your consent, we will request it separately.

Editorial notes: the company name is sourced from the hosted PDF and the contact
address from the online legal pages, consistent with Marwane's same-company
instruction. Finalize controller identification from actual roles. Do not transplant InboxPilot's business-customer
controller/processor split into a participant dating service, reuse its privacy
mailboxes, copy its historical publication date, or treat continued use as consent
to every future data-use change. The supplied excerpt is drafting input, not
evidence that Amourette's contracts or processing roles are already aligned.

### Matching information panel: proposed copy for #281

**Your gender and dating preferences**

Amourette uses your gender and the genders you want to meet to suggest compatible
participants at the same venue night and show your profile to them. These choices
can reveal information about your sexual orientation. This use requires your
explicit consent.

You can decline or withdraw your consent at any time from your profile. Withdrawal
immediately removes your profile from discovery and stops new likes and matches.
It stops the covered use of your preferences and initiates their deletion.
Existing conversations remain available until the definitive end of the venue
night, subject to the usual presence and safety rules, and are then deleted.
Withdrawal does not change the lawfulness of processing carried out beforehand.

Your profile and preferences are kept between nights, up to two years without
voluntary app use, unless you request deletion or withdraw this consent earlier.

Amourette is operated by **InboxPilot, Inc.**, at 2810 N Church St PMB 16104,
Wilmington, Delaware 19802-4447, USA.
For questions or to exercise your data rights, contact
**privacy@getamourette.com**. See **[Privacy Policy: final working link]** for
recipients, hosting, retention details and your rights.

Marwane accepted the preceding explanation in substance and then clarified the
withdrawal behavior above: preserve existing conversations until night end.
The updated chat sentence reflects the approved product direction. On October 1,
Marwane explicitly closed the additional legal-justification discussion and
rejected an external-review follow-up. The earlier analysis remains recorded in
section 4; it is not an active publication action or a legal-compliance finding.

Editorial conditions: finalize the controller role and policy link, and align the withdrawal sentence
with the tested #281 behavior before public collection. Consent-evidence retention
is set by the October 1 decision below and the full policy table. This panel does
not authorize analytics, promise EU-only access,
or claim every provider copy disappears instantly. No new general acceptance box
is proposed. Use the previously agreed checkbox wording alongside this panel.

### Night statistics: agreed wording direction

We use activity data from the venue night to understand how Amourette works:
registrations, participation, likes, matches and conversations started. At the
end of the night, we retain grouped statistics without participant names or
account identifiers, message content or individual interaction histories.

Marwane approved describing the outcome as grouped statistics without identifiers
rather than making an unverified full-anonymity claim. This wording describes
the agreed #257 target; verify released behavior before publication. It does not
relax #257's removal of identifying source events or small-group protections,
settle the basis for processing before aggregation, or authorize indefinite
retention of any results that remain identifiable.

### Full privacy page: approved inputs and remaining qualifications

| Public section | Agreed input | Drafting or release qualification |
|---|---|---|
| Operator and contact | InboxPilot, Inc. is the confirmed operator, at the Wilmington contact address recorded above; privacy contact is privacy@getamourette.com, handled by Marwane. | Identity is filled in. Do not restart the operator meeting, information request or rejected service-account verification. |
| Service and data | Profile/photographs, adult confirmation, preferences, venue participation, discreet likes, mutual matches and chat; safety and optional email functions. | Explain purpose, necessary/optional fields, recipients and legal basis by processing; matching consent does not authorize all uses. |
| Matching preferences | Specific explicit agreement, with withdrawal in the profile; two years without voluntary app use for retained profile/preferences unless earlier withdrawal/deletion. | #281 owns working collection, evidence and withdrawal. Evidence is retained while relied on, then 12 months after withdrawal or account deletion, whichever occurs first; implementation must align with #258. The separate analytics-justification discussion is closed by founder direction. |
| Night interactions and evaluation | Conversations end with definitive venue-night closure; retain useful aggregate night reports. | Verify #257 release and anonymity limits; do not claim removal of identifiers alone makes every small-group statistic anonymous. |
| Profile and participation | Keep profiles/photos between nights, delete after two years without voluntary use or on valid earlier request. Keep current presence records for the pilot. | #258 tooling is deferred; real requests need manual handling. Presence has no separately approved unlimited retention or new history feature. |
| Photos | Manual review for early evenings; approved existing image cleanup and correction handling. | Explain former/refused files using the verified upload-age and correction rules above. #234 owns decision-history expiry while correction is active and 12 months after resolution, with ongoing-dispute exceptions. |
| Safety | Blocks while both profiles exist; reports during handling and 12 months after closure unless a documented continuing need applies. | #260 automation pending; coordinate deletion with #258. No general post-night chat archive. |
| Optional announcements | Three years from subscription or last explicit subscription confirmation; unsubscribe stops sending immediately. Minimal unsubscribe record: three years from unsubscribe, only to prevent announcements. Delivery records: 30 days after successful sending or definitive abandonment after failure. | #259 subscription automation pending; coordinate unsubscribe-record expiry without automatic resubscription. Sends, opens and ordinary app use do not restart the subscription period. Delivery cleanup needs implementation; technical suppression and other email evidence remain separate. |
| Rights and request records | Manual rights contact; request/response kept 12 months after closure, unnecessary supporting material removed earlier, ongoing-dispute exception. | Explain applicable access/correction/deletion/withdrawal/objection and other rights, complaint route and ordinary one-month response period. Do not promise unconditional deletion of legally necessary evidence. |
| Hosting, recipients and copies | EU production planned in #280; current test project is US. Supabase, Vercel, email routing/delivery and founder mailbox providers matter. | Publish the actual released setup and verified transfer arrangements. Provider logs/backups follow confirmed production tiers/options, not the old test configuration. OpenAI photo review is disabled. |
| Payments if introduced | Dedicated Stripe setup is intended; separate booking/refund information is owned by the payment work. | Do not describe unimplemented payment collection as current. Confirm operator/payment roles and financial retention when included. |

### Remaining work before publication

Use the consolidated status section above for current ownership and dispositions.
The following checks concern accurate release
claims; they do not reopen closed choices or require every deferred automation
to ship before #203 can finish.

- Keep the confirmed operator identity and finish factual recipient and
  international-access disclosures without reopening the rejected account check.
  The detailed email-provider investigation proposed for Resend, Cloudflare and
  Gmail was deferred by Marwane on October 1; it is not an active publication
  checklist item. Use the known provider roles and avoid unsupported assurances.
- The additional hypothetical sensitive-report discussion is deferred until a
  concrete need arises, with no replacement task or publication gate.
- Preserve the recorded formalities dispositions: the register and DPIA are
  drafted, no DPO obligation is identified for the described pilot, and Marwane
  deferred EU-representative designation. Do not present these as blanket legal sign-off.
- The additional statistics-justification discussion is closed; do not reopen it
  through this publication checklist or create an equivalent follow-up.
- The additional continued-chat justification discussion is also closed by
  founder direction on October 1; no legal-referral or replacement action remains.
- Reconcile technical metadata and email/provider copies with actual release
  behavior within the relevant task scopes; surface only concrete unaddressed
  needs. Preserve the already-approved pilot treatment of operational presence.
- Verify implementation of the approved consent-evidence rule under #287,
  coordinated with #258: expiry, minimal evidence surviving account deletion,
  and no extension of old evidence when consent is renewed.
- Implement and verify the approved 30-day email-delivery cleanup, preserving
  unsubscribe and suppression protections; see the October 1 handoff below.
- Implement and verify the approved three-year unsubscribe-record rule with
  #259, preserving immediate cessation of announcements and requiring new
  explicit agreement before resuming them, including after record expiry.
- Implement and verify the approved 24-hour onboarding-draft expiry in #286 across text
  and photo storage, without extending the deadline on passive reads or reloads;
  coordinate with #281's draft sanitization. See the local handoff below.
- Verify #257/#281/#280 and manual processes before publishing their promises;
  complete the full policy and its link, then provide equivalent EN/FR/ES copy.

Source guidance for the layered draft:
[CNIL consent](https://www.cnil.fr/fr/les-bases-legales/consentement) and
[CNIL transparency](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence).

## Onboarding draft retention — approved 2026-10-01

Marwane approved a 24-hour resumption window from the last deliberate edit to an
unfinished onboarding draft. It covers the first name, biography, photo and form
progress stored on the device. Clear the draft earlier on successful profile
creation. At expiry, do not restore it; remove expired data when the app next
executes cleanup, including on reopening. Passive reads, reloads and reopening
must not restart the window. Do not promise physical deletion at the deadline
while the app is closed. Gender and dating preferences remain excluded from
persistent onboarding drafts under #281.

Why: allow someone interrupted during the evening to finish registration without
keeping an abandoned draft indefinitely. Twenty-four hours is the chosen pilot
period, not a statutory duration. The [CNIL retention guidance](https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees)
describes selecting a period according to the purpose.

Read-only inspection of #281's worktree at `43fe1e0` found a 24-hour age check on
photo-draft loading, no age limit on scalar drafts, and removal of gender and
preference answers from persistent drafts. Successful profile creation calls
both draft-clear functions. This is source evidence, not production verification
or proof that the newly approved common expiry rule is implemented.

Implementation follow-up is tracked in
[#286](https://github.com/getamourette/amourette-webapp/issues/286), created in
Backlog at Marwane's request on October 1 (Kind: chore; Area: onboarding).
Keep it separate from #281, which Marwane reports is being merged. Align text
and photo draft expiry and cleanup with this rule, coordinated with #281. Its legacy-draft
sanitization rewrites local storage, so it must preserve expiry metadata without
renewing the deadline. Verify deliberate edits, passive restoration/reloads,
expiry on reopening and successful creation. The policy choice is closed and the
board fields were verified. Issue capture authorizes no code, migration, commit,
push or public-policy publication.

## Photo moderation correction and verification — 2026-09-30

Marwane confirmed manual photo moderation for the first evenings, with no automated
external photo review. After fetching origin, inspected `origin/main` at `0d5a601`:
`app/api/profile-photo/route.ts` calls the optional external precheck only when
`PROFILE_PHOTO_REVIEW_ENABLED` is exactly `true`; the review endpoint itself has
the same guard. `app/admin/PhotoQueue.tsx` implements founder approval/rejection.
A read-only GET to `https://getamourette.com/api/profile-photo/review` returned
`{"enabled":false}` on September 30. No photo was submitted for this check.

The optional OpenAI integration remains in source but is disabled on the checked
public deployment. Do not describe it as an active pilot photo recipient. Keep it
disabled for the first evenings; reassess data handling before any future activation.
This verifies the current flag, not historical provider traffic or every preview.
Technical file validation and image preparation still run and are distinct from
external content moderation. The older September 9 observations below are historical;
photo version, source-file and audit retention still need a separate current review.

## Photo retention factual refresh — 2026-09-30

Read-only shared-database function definitions confirm the existing cleanup rules:

- Current displayed and pending-review image dependencies are protected from cleanup.
- Retired images, refused pending replacements and abandoned files become eligible
  once unreferenced by protected state and more than 24 hours old **from upload**,
  not 24 hours after replacement or rejection. An old image can therefore become
  eligible immediately upon replacement.
- A rejected displayed photo is hidden from participant surfaces immediately but
  its files remain protected while correction is outstanding, until 30 days from
  `correction_since`. An approved correction removes that protection earlier;
  the ordinary upload-age threshold still applies.
- Source images retained for recropping and round-avatar files use the same
  dependency/age rules; a source shared with a current version remains necessary.
- Unfinished private staging uploads become eligible after three hours.
- Each candidate function returns at most 100 paths per run. The active
  `amourette-photo-cleanup` cron runs every 15 minutes. Its latest three dispatcher
  runs succeeded, but dispatcher success alone does not prove HTTP worker success
  or physical deletion. No image or participant record was read or deleted.

The current `origin/main` cleanup route removes Storage files through the API,
not `photo_versions` or `photo_audit` rows. Those tables contain identifying
metadata; no independent expiry was found in the inspected photo migrations or
cleanup worker. Their retention remains separate from image retention.

[#243](https://github.com/getamourette/amourette-webapp/pull/243) merged September 11;
its release record confirms production configuration, a successful isolated
deletion test and legacy public URL checks at that time. The September 9
release/cutover warning below is superseded.

Marwane subsequently approved keeping the existing photo-file cleanup behavior
for the pilot: unused replaced/refused files use the 24-hour upload-age threshold;
rejected displayed files remain protected until an approved correction or 30 days
from the correction requirement, while participant visibility ends immediately.
Keep the existing scheduled cleanup, without a new implementation task. These
are chosen operational periods, not statutory deadlines or a guarantee against
worker failures. This approval concerns image files, not metadata expiry.

Marwane separately approved keeping photo-moderation decision history while a
correction remains active, then for 12 months after resolution. Keep the necessary
profile reference, decision, reason, timestamp and moderator; do not retain a
deleted image under this rule. An ongoing dispute can justify extending necessary
evidence until that need ends. #234 tracks the implementation follow-up, coordinated
with #258 profile deletion. Existing file cleanup does not expire these rows.
Technical version metadata and decisions with no correction lifecycle still need
their expiry trigger mapped during implementation; this is not approval to keep
all photo metadata indefinitely or to reset retention through unrelated activity.

## Provider logs and backup evidence — 2026-09-30

Public provider documentation was checked separately from account configuration:

- [Supabase pricing](https://supabase.com/pricing) lists one day of API/database
  logs on Free and seven days on Pro. Free does not include the automatic-backup
  product; Pro includes seven days of daily backups. These are plan features, not
  proof of this project's current plan or all internal provider retention.
- Supabase's [backup availability note](https://supabase.com/docs/guides/troubleshooting/will-backups-be-accessible-from-the-dashboard-immediately-after-upgrading-to-a-paid-plan-hXY4rs)
  says it currently takes up to seven daily backups for free projects, accessible
  after upgrading, without guaranteeing that practice will continue. Therefore
  “automatic backups not included in Free” must not become “no provider copies.”
- [Database backup documentation](https://supabase.com/docs/guides/platform/backups)
  says backups contain Storage metadata, not Storage object bytes; restoring a
  database backup does not restore deleted photo files.
- [Vercel runtime logs](https://vercel.com/docs/logs/runtime) lists one hour on
  Hobby, one day on Pro, and 30 days on Pro with Observability Plus. Request logs
  can include paths, IP addresses and user agents. These runtime-log limits are
  not a universal deletion promise for build logs, security records or exports.
- `origin/main` decisions on September 22 record continued use of Vercel Hobby.
  This is dated repository evidence, not a current billing-dashboard inspection.
- A focused search of `origin/main` API/server code found no explicit
  `console.log/error/warn` or logger calls; searched package/config/workflow/script
  files revealed no custom backup or log-drain integration. This is not proof
  that provider-generated logs or externally configured exports do not exist.

Available project-scoped Supabase tools do not expose billing, backup inventory
or log-drain configuration, and no Vercel account connector is available in this
session. Marwane subsequently confirmed current Supabase Free and Vercel Hobby
use, with no separately configured backups or log exports. This is founder-provided
evidence, not a dashboard audit; no participant log entries, credentials or database
dumps were read.
Repeat the applicable configuration check for the EU production project in #280
before writing public retention promises. No provider setting or retention policy
was changed by this factual check.

Plan changes must be reflected in the factual retention inputs: standard Supabase
Pro changes API/database log retention to seven days and includes seven days of
daily backups; Vercel Pro changes standard runtime-log retention to one day.
Actual add-ons and settings must be checked when the production plan is selected.
#280 tracks this launch check; no paid upgrade has been approved.

Separately, [Vercel's commercial-use rules](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)
restrict Hobby to non-commercial personal use and require Pro or Enterprise for
commercial deployments, including deployments intended for financial gain.
Assess the Amourette launch on that basis, not solely traffic or whether the first
participants pay. This is a provider eligibility constraint, not a GDPR requirement.

## Supabase international-access assessment — tracking update 2026-10-01

At Marwane's request, #280 now includes the Supabase-specific international-access
and transfer assessment alongside EU production preparation. Produce a proportionate
internal record of relevant data flows, recipients/countries, applicable DPA/transfer
clauses and effective safeguards, using provider evidence and identifying concrete
gaps. For relevant SCC-based transfers, assess destination laws/practices and any
needed supplementary measures. Feed verified facts into #203's public-policy inputs.
This is assigned follow-up, not a completed assessment or proof of EU cutover.

The October 1 public-document check confirmed that the
[Supabase DPA](https://supabase.com/legal/customer-resources/data-processing-addendum)
provides regional primary storage/processing in section 6.1 and incorporates SCCs
in section 12, with agreement acceptance having the effect of signature. These
contractual provisions do not by themselves establish the actual production flows
or complete the transfer assessment. Distinguish internal operator access from
disclosure to a separate recipient rather than treating every overseas founder
connection as an independent transfer.

InboxPilot's role and the founder service accounts remain settled. #280 explicitly
excludes the rejected contractual-customer/accepting-person recheck. No new consent
control, provider change, external legal advice or paid service is prescribed by
default. This update authorizes tracking only, not implementation or publication.

## Vercel processing-location assessment — tracking update 2026-10-01

At Marwane's request, #280 now also includes a focused Vercel check: identify the
effective production regions and data handled by the released photo/email and
other relevant server functions; distinguish function execution from network/CDN,
logs and support processing; document applicable DPA, subprocessors and transfer
safeguards, including effectiveness assessment where relevant SCC-based transfers
apply. Reuse the existing plan/log-retention checks and feed verified facts into
#203's privacy-policy inputs. Record justified configuration changes for separately
authorized execution rather than assuming EU Supabase storage configures Vercel.

The original issue content was preserved and the addition verified. This is
tracked work, not a completed provider assessment or verified regional cutover.
The settled operator and founder-account decisions remain unchanged, including
the exclusion of the rejected contractual-customer/accepting-person check.
No code, deployment, paid upgrade or public-policy publication is authorized.

## Production environment decision — 2026-09-30

Marwane approved a separate EU production project prepared and validated before
launch, with the public application switching at launch (before real participant
collection). Paris (`eu-west-3`) is the discussed target. Keep the current US
project for development and tests; synthetic user data need not be migrated.
Implementation is tracked as P0 in
[#280](https://github.com/getamourette/amourette-webapp/issues/280). No provisioning
or cutover has occurred in this session. #280 now also owns the Supabase and Vercel
processing-location/access/transfer checks described above; #203 retains overall
framework coordination. The detailed email-provider investigation is deferred,
as recorded in the October 1 status section.

## Matching consent decision — 2026-09-30

Marwane approved a dedicated, initially unchecked onboarding consent checkbox for
gender/preference use in matching, separate from adulthood and email consent.
The agreement is visible beside the checkbox, with a link for further information.
[#281](https://github.com/getamourette/amourette-webapp/issues/281) owns collection,
versioned proof, server enforcement and simple in-profile withdrawal/cleanup.
It can be developed alongside #257 with shared schema changes coordinated.
Final public information remains to complete under #203; matching consent does not
automatically cover analytics. The initial inspection predated the implementation;
#281 has since merged through PR #285. The old worktree is not evidence of its
absence from current main, nor is that merge proof of production readiness.

Marwane subsequently confirmed a decision made with the #281 implementation agent:
withdrawal immediately stops discovery and new likes/matches, but existing chats
remain active until definitive night end under existing presence/safety rules.
This does not authorize continued preference use or cancel preference cleanup.
Marwane closed the additional chat-justification discussion on October 1 while
retaining this behavior. It is no longer an active #203 follow-up; closure is not
a completed legal finding. The information-panel draft follows that direction.

## Announcement unsubscribe retention — approved 2026-10-01

Marwane approved retaining only the email address, unsubscribe date and
do-not-send status for three years from unsubscribe. Use this minimal record
exclusively to prevent unwanted announcements, not as an active mailing list.
Delete it at expiry without reactivating a subscription or treating the absence
of an opposition record as consent. Resuming announcements requires a new
explicit agreement. The purpose is to prevent accidental recontact while
limiting the retained record to what is needed for that protection.

The [CNIL opposition-list guidance](https://www.cnil.fr/fr/comment-utiliser-une-liste-repoussoir-pour-respecter-lopposition-la-prospection-commerciale)
recommends at least three years for opposition information. Three years is the
chosen pilot policy; it is not described as a statutory fixed duration.
This decision concerns participant unsubscribe choices, not a blanket expiry
rule for hard bounces, provider complaints or other technical sending blocks.
The approved subscription and delivery-record periods remain unchanged.

Implementation follow-up: coordinate minimal unsubscribe-record retention and
expiry with #259. Verify immediate cessation, protection during the retention
period, no automatic reactivation on deletion and new explicit agreement before
future announcements. At Marwane's explicit request, this scope was added to
[#259](https://github.com/getamourette/amourette-webapp/issues/259) on October 1
and read back successfully. This is tracked work, not implemented cleanup;
no code, migration, commit, push or public-policy publication was authorized.

## Email-delivery record retention — approved 2026-10-01

Marwane approved deleting application delivery records 30 days after successful
sending or definitive abandonment after failure. The scope includes the recipient
address in the delivery record, delivery payload, dates, status, provider reference
and errors. The purpose of the short troubleshooting window is to investigate
missing or failed emails without keeping an indefinite identifiable send history.
Thirty days is the chosen pilot rule, not a statutory duration.

Preserve separately the information needed to respect unsubscribe choices and
prevent further sending to blocked addresses. Pending/retryable sends are not
definitively abandoned merely because an attempt failed. This decision does not
change the approved three-year subscription rule or the separate privacy-request
retention rule. It does not set suppression, consent-evidence, unsubscribe-token,
webhook-deduplication or provider-backup retention periods.

The [CNIL retention guidance](https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees)
supports selecting retention by purpose where no specific period applies.
[Resend security information](https://resend.com/security), checked October 1,
states 30-day email/log retention on Free, Pro and Scale. That provider statement
does not establish this account's plan or delete Amourette's database copies.

Implementation handoff under #203: add and verify application delivery cleanup,
including successful sends, definitive failures and preservation of unsubscribe/
suppression protections. At Marwane's explicit request, #259 was updated on
October 1 to include delivery cleanup alongside subscription and unsubscribe
retention, with focused checks and a manual fallback. The update was read back
successfully; the issue remains open and no status change was requested.
The inspected email code retains delivery records separately from subscriptions;
no delivery-retention cleanup was established. GitHub main was `1b9473c` at the
October 1 check; a merged commit is not proof of deployed retention behavior.
The follow-up is now recorded in #259 as well as locally. No code, migration,
commit, push or public-policy publication was performed or authorized.

## Matching-consent evidence retention — approved 2026-10-01

Marwane approved keeping the minimal evidence while the service relies on the
consent, then for 12 months after withdrawal or account deletion, whichever
occurs first. Delete it at expiry. A new grant does not extend the expiry of
earlier withdrawn consent evidence. For an ongoing dispute, retain only necessary
evidence until resolution.

Keep the account reference, grant/withdrawal dates and the accepted wording
version (with its corresponding text available); do not retain preferences,
photos or messages as part of the proof. The reason for the 12-month period is
to answer challenges during the following year without an indefinite participant
history. It is an approved operating choice, not a statutory retention period.
The [EDPB consent guidelines, section 5.1](https://www.cnil.fr/sites/cnil/files/atoms/files/lignes_directrices_du_cepd_sur_le_consentement.pdf)
describe demonstrating consent during the processing and limiting subsequent
proof retention to necessity; they do not prescribe this 12-month period.

Implementation follow-up is now tracked separately in
[#287](https://github.com/getamourette/amourette-webapp/issues/287), created in
Backlog at Marwane's request (Kind: chore; Area: onboarding), coordinated with
#258 and #280. #281 is closed and its PR #285 merged on October 1; this does not
establish deployment of the new retention rule. Read-only
inspection of the #281 worktree at `43fe1e0` on October 1 found that migration
`20260930000010_matching_preference_consent.sql` still cascades profile deletion
to consent state and then consent events. The inspected migration does not
implement the approved evidence expiry. Preserve the minimal evidence for its
approved period without preserving the profile or restoring matching eligibility;
verify withdrawal, account deletion, expiry, re-consent and dispute exceptions.
The issue and its board fields were verified. The retention choice is closed;
execution remains. Issue capture is not proof of the live schema and authorizes
no implementation, migration, deployment or public-policy publication.

## Privacy request ownership and retention — 2026-09-30

Marwane confirmed that he handles requests received at `privacy@getamourette.com`
for the first pilot, with manual handling and no new request-management tool.
The September 30 closing comment on #142, checked October 1, confirms Marwane as
primary and Aymane as backup, satisfactory monitoring arrangements, founder
inbound/sending access checks and successful production welcome/reply tests.
#142 is closed/Done. No numerical cadence was recorded; that does not reopen the
confirmed monitoring arrangement. These are recorded operational confirmations,
not a fresh email-delivery test by this framework session.

Marwane approved retaining requests and responses for 12 months after closure,
then deleting them. Supporting identity documents and exported participant data
are removed as soon as no longer needed. An ongoing dispute can justify retaining
necessary evidence longer, until that need ends. Cleanup is manual for the pilot
and covers relevant forwarded, received and sent mailbox copies. Twelve months is
the selected policy, not a statutory period; no automation issue is required by
this decision. The workflow below remains a proposal except for this confirmed
ownership and retention rule.

## Limited retention refresh — 2026-09-15

- Marwane reports the Supabase project region as `us-east-1` (North Virginia,
  United States, per the [provider region list](https://supabase.com/docs/guides/platform/regions)).
  This is founder-provided configuration evidence, not an independent dashboard
  inspection. No migration or region split was approved.
- The public [Supabase DPA](https://supabase.com/legal/customer-resources/data-processing-addendum)
  inspected on September 15 is version 1, dated August 1, 2026. It states that it
  forms part of the customer agreement and incorporates Standard Contractual
  Clauses (section 12); accepting the agreement has the effect of signing those
  clauses. Section 6.1 addresses regional storage and primary processing while
  allowing other processing locations subject to transfer safeguards. These are
  published terms, not evidence of which agreement/customer entity governs this
  project's completed transfer assessment. The former account-owner/operator
  alignment recheck was explicitly rejected on September 30 and is not an action.
- Report retention is approved: retain during handling, then delete 12 months
  after case closure unless a continuing need is documented and reviewed, such as
  an ongoing dispute or justification for an active sanction. Cleanup automation
  is in Backlog under [#260](https://github.com/getamourette/amourette-webapp/issues/260),
  coordinated with profile-deletion cascades in #258. This supersedes the earlier
  proposed 90-day review checkpoint for closed reports; it is not implemented yet.
- Block retention is approved: preserve blocks while both participant profiles
  exist so protection carries across nights. Read-only live foreign-key inspection
  on September 15 confirms that deleting either profile cascades to its block
  records. Keep the current implementation; no new implementation task was requested.
  Reports follow the separate closure-based rule above; necessary audit-retention
  dependencies belong in existing implementation scopes. The additional sensitive-
  allegation discussion was deferred on October 1 until a concrete need arises.
- Marketing retention is approved: three years from subscription or the last
  explicit subscription confirmation, with immediate cessation of announcements
  on unsubscribe. Sending/opening messages or ordinary app activity does not renew
  the period. Automation is in Backlog in
  [#259](https://github.com/getamourette/amourette-webapp/issues/259); manual handling
  must meet the commitment if automation is not yet available. This supersedes the
  original twelve-month discussion proposal below. Delivery retention was later
  approved on October 1: 30 days after successful sending or definitive abandonment
  after failure. Minimal unsubscribe records were subsequently approved for three
  years from unsubscribe, without automatic resubscription on expiry. Separate
  evidence, technical suppression and provider-copy retention remains to resolve
  under #203.
- Presence discussion outcome: keep current presence records unchanged for the
  first pilot. Do not add terminal timestamp cleanup or a participant-facing
  history screen in this workstream. Possible future participation history was
  discussed, but no new feature or indefinite retention period was approved.
  This does not change the separate analytics cleanup scope in #257.
- Profile-deletion tooling is deferred to Backlog in
  [#258](https://github.com/getamourette/amourette-webapp/issues/258) at Marwane's
  request. Any pilot request will require case-by-case founder handling; the
  operational details remain under #203. Profile and photo retention is approved:
  delete after two years without voluntary app use, or earlier on request.
  Automatic session refresh does not count as voluntary use. This deferral does
  not establish an implemented deletion procedure.
- Discussion outcome: Marwane approved deleting conversations at definitive night
  end and keeping anonymous night-level totals for pilot analysis. See the
  [September 15 decisions](../decisions.md#2026-09-15). The approved report covers
  the entry funnel, like participation, match distribution, conversation conversion
  and attendance over time. Implementation and identifiable analytics cleanup are
  tracked in [#257](https://github.com/getamourette/amourette-webapp/issues/257),
  with historical-night selection remaining in #160. Metric implementation details
  and validation are pending; other retention periods and hosting proposals remain
  open. This session authorized issue capture, not application implementation.
- Marwane confirms that the request for the operator's company information has
  already been sent. The operator meeting is complete; no new meeting preparation
  is needed.
- Fetched `origin` without switching or rebasing the current branch. Current
  `origin/main` is `ad1ccdd` (September 14); the working branch remains
  `feature/define-legal-framework-for-data` with its existing documentation edits.
- Read-only shared-DB metadata confirms that
  `private.transition_venue_night` deletes likes, matches and venue ejections on
  terminal end/cancellation. It ends presence through `left_at` without deleting
  those rows. A temporary closure does not delete likes or matches.
- The live `messages.match_id` foreign key still uses `ON DELETE CASCADE`, so
  deleting a match deletes its database messages. This does not establish erasure
  from backups or participant devices.
- The active jobs listed are the every-minute night lifecycle job, the
  five-minute email worker and the fifteen-minute photo cleanup. No separate
  general retention job appears in that list; job execution success was not tested.
- Live metadata still includes `venue_conversation_events.first_sender_id`,
  message counts and interaction timestamps, plus `analytics_events` user/session
  identifiers and JSON properties. Deleting chat content alone must not be
  described as erasing all interaction traces.
- This refresh inspected definitions and metadata only, without reading
  participant records. It does not refresh the full inventory, verify the deployed
  application, or approve any retention period. Profiles, photos, safety records,
  email, provider settings and backups need their own focused checks as discussed.

## Evidence boundary

- Worktree inspected at `2bf891d87589a5a60d195cd8dfcd26acb17dcb3a`.
- Fetched and compared `origin/main` at
  `3d5bd33c783d49eb86c31579de6b94a5136e034d` without rebasing the working branch.
  Main adds an IndexedDB photo draft, among other changes.
- Read-only Supabase metadata inspection covered `public`/`private` column
  definitions, bucket visibility, scheduled-job names/schedules, and the current
  `private.transition_venue_night` and `private.visible_profile_ids` definitions.
  No participant records, images, messages, emails, Auth rows, logs or secrets
  were retrieved.
- Shared development already contains photo-moderation changes from draft
  [PR #243](https://github.com/getamourette/amourette-webapp/pull/243), reviewed at
  head `e4e9a1b6ff401d60049de53d3370d5bfffee6cd3` via its description/file list.
  That description is implementation evidence, not independently repeated QA.
- Current region, provider account ownership/contracts, feature flags, log and
  backup retention, and the exact production deployment were not verified.

Reconcile the release commit, applied migrations and provider settings again
before approving public privacy wording. Source-code capability does not prove
that a feature is enabled or that an event has been collected.

## Data and behavior found

| Category and purpose | Data and locations | Access / recipients | Current retention evidence and gap |
|---|---|---|---|
| Session and persistent profile: recognize participants and authorize actions | Supabase Auth identifier/session; `profiles`: first name, photo URL, bio, gender, selected genders, timestamps | Supabase; participant profile reads use RLS; founder access is being narrowed in #235 | No general profile/Auth inactivity purge or complete user-deletion journey found. Anonymous Auth is not anonymization. |
| Adult confirmation | `profile_private.adult_confirmed_at`; unused nullable `phone` also exists | Owner-scoped private profile access | Timestamp, not birth date or identity proof. No phone collection path found in the inspected UI. No independent retention limit found. |
| Profile photo and moderation (refreshed September 30) | Displayed, source, round and staging files; `photo_versions`, `photo_state`, `photo_audit`, `photo_invalidation` metadata | Supabase Storage, Vercel image preparation, authorized participants/founders; external automated review disabled on checked public deployment | #243 released September 11. Live cleanup rules protect active dependencies, expire unused files after the 24-hour upload-age threshold, uncorrected rejected displays after 30 days, and staging after three hours. See detailed refresh above; metadata expiry remains separate and unresolved. |
| Attendance and live discovery | `presence`: profile, venue/night, entry, last-seen, departure and visibility; `venue_scan_events`: user and scan timestamps | Supabase; authorized room queries and founder aggregate statistics | Terminal closure sets `left_at`; it does not delete presence rows. No recurring presence/scan retention purge found in inspected migrations/job list. No browser GPS collection found; venue attendance still conveys location. |
| Secret likes and mutual matches | `likes`, `matches`: participants, venue/night, timestamps and expiry | Supabase; likes intended for sender only, matches for their participants | Terminal end/cancellation deletes these rows. A temporary night pause ends presence but preserves likes/matches. Derived events and reports can survive. |
| Text chat and live signals | `messages`: sender, match, body, timestamps; Supabase Realtime; browser typing signals, read markers and unresolved outgoing messages | Match participants and Supabase; administrative DB capability is separate from ordinary participant access | Messages cascade on match deletion. Browser unresolved messages use sessionStorage; read markers use localStorage. Server deletion does not erase downloaded copies or every browser cache. |
| Safety and moderation | `blocks`, `reports`, `moderation_cases`, `venue_ejections`; pair IDs, venue/night, reason/note, evidence category, reviewer and timestamps | Reporter/owner access where permitted; authorized founders; Supabase | Reports, blocks and cases survive night end; ejections are deleted on terminal closure. Evidence is an interaction category rather than an automatic transcript copy, but free-text notes can contain sensitive allegations. Deleting profiles cascades into some safety records; reconcile this with evidence needs. |
| Product measurement | `analytics_events` can hold user/session IDs, attribution/referrer and JSON profile/match references; scan, match, chat-start and conversation-event tables | Supabase; founder UI receives aggregate statistics | Aggregate display does not anonymize source rows. Conversation events retain `first_sender_id`; some JSON IDs lack FK cleanup. No general analytics purge found. General tracking RPC exists but no application call was found; scan calls and match/message triggers exist. |
| Optional future-night marketing | `email_subscriptions`: normalized address, user, locale, source, consent version/status/timestamps | Owner-readable subscription; server-side writes; Supabase and Resend for delivery | Unsubscribe changes status, not full deletion. No age-based subscription purge found. Current version/timestamps do not constitute a complete immutable history of all consent changes. |
| Email operations | `email_deliveries`: recipient, payload, status/errors/provider IDs; `email_suppressions`: address/reason; private unsubscribe tokens and webhook deduplication events | Supabase; privileged server worker; Resend receives recipient and rendered content, including unsubscribe links | Token validity defaults to 12 months, but expiration does not delete the row/address. No general outbox/suppression/token purge found. These email copies do not all cascade from Auth deletion. |
| Browser drafts and preferences | localStorage stores scalar onboarding draft, locale, hints and email-prompt/read markers; photo blob, filename and timestamps use IndexedDB. Inspected #281 excludes gender/preferences from persistent drafts. | Participant's browser; submitted values later reach the server | Approved October 1: 24-hour draft resumption from the last deliberate edit, earlier cleanup on successful creation, and expired-draft removal when the app next runs cleanup. Inspected #281 has photo-load expiry but no scalar expiry; the full approved rule remains to implement. Other browser settings/markers are separate. |
| Founder administration and infrastructure | Auth/admin accounts, venue-night transition/configuration audits; hosting/network/security metadata; support and prospecting tools | Authorized founders, selected providers, future operator and any assigned advisers as appropriate | App audit rows persist. Provider logs/backups, local exports, email forwarding, outreach lists and AI-tool access remain to inventory with account owners. Do not infer absence from application schemas. |
| Reservation/payment: planned | Reservation, payment/refund status and provider references; Stripe-hosted card entry | Proposed operator, Stripe and banking/payment participants; scoped door access | #182–#192 remain implementation work; no reservation tables or Stripe integration found in the inspected main/schema. Accounting and dispute retention remains to establish separately. |

## Material findings for launch preparation

1. **Presence fading is not historical-data deletion.** Both the migration and
   inspected live transition function preserve presence rows. The currently active
   one-minute lifecycle job handles scheduled nights, not a universal 06:00 purge.
2. **Photo release completed; retention needs accurate wording.** The September 30
   refresh supersedes the original transition warning: #243 merged and records
   production cleanup/cache checks on September 11. Current live cleanup rules
   are documented above. Distinguish image deletion, retained audit metadata and
   copies already downloaded; a scheduled dispatcher is not a deletion guarantee.
3. **Mutual compatibility is not yet a proven database boundary.** The inspected
   remote visibility helper includes photo eligibility, venue presence and blocks
   but no gender/preference compatibility predicate. #227 already owns closing
   profile/preference exposure; #235 owns founder access limits. Do not claim
   incompatible attendees cannot obtain preferences until the full paths are tested.
4. **Deletion needs a cross-system procedure.** Auth deletion and SQL cascades do
   not cover all email copies, analytics JSON, Storage objects, browser state,
   providers and backups. Conversely, some safety evidence cascades immediately.
5. **Consent categories must be separated.** Adult confirmation and marketing
   consent exist; no dedicated, versioned Article 9 consent/withdrawal record was
   found for dating preferences. A UI choice alone is not proof that all required
   consent information was supplied.

Source anchors:
[core schema](../../supabase/migrations/20260619000001_bloc0_core_schema.sql),
[lifecycle](../../supabase/migrations/20260724000001_durable_venue_night_lifecycle.sql),
[analytics](../../supabase/migrations/20260717000002_founder_analytics.sql),
[reports](../../supabase/migrations/20260726000002_moderation_cases.sql),
[email outbox](../../supabase/migrations/20260802000001_resend_email_delivery_foundation.sql),
[unsubscribe tokens](../../supabase/migrations/20260728000003_email_subscription_management.sql),
[profile photo route](../../app/api/profile-photo/review/route.ts),
[main photo draft at inspected commit](https://github.com/getamourette/amourette-webapp/blob/3d5bd33c783d49eb86c31579de6b94a5136e034d/app/profile/draft.ts).

The board marks #155 (photo messages) Done, but the inspected main and remote
message schema support text only. Confirm whether that item was deferred/closed
or exists on another release before adding chat media to a launch inventory.

## Email-provider investigation — deferred 2026-10-01

Marwane rejected the proposed detailed investigation into how and where Resend,
Cloudflare and Gmail process email as disproportionate to the current pre-customer,
unfunded stage. Remove this investigation from active #203 work; do not create
an equivalent backlog task, launch prerequisite or repeated request for review.
Revisit if a concrete need arises as the service develops.

Keep the already-known provider roles in the privacy draft: Resend sends email,
Cloudflare routes incoming contact email, and founder Gmail inboxes receive and
handle it. Preserve the approved subscription, delivery-record, unsubscribe and
privacy-request retention rules. This deferral does not establish that every email
operation stays in the EU or that a legal assessment has been completed. It does
not revoke the separate Supabase/Vercel work already requested in #280.

## Provider facts to collect

This original collection checklist is historical. The September 30 operator
decision supersedes its contracting-entity/account-owner verification requests;
do not repeat the rejected check. Later confirmed provider facts and approved
decisions take precedence over the rows below.
The October 1 deferral above also supersedes these historical rows as an active
request for a detailed email-provider locations/processing investigation.

For each account record the contracting entity, service/plan, administrators,
data actually sent, processing/support locations, applicable terms/DPA and
subprocessors, transfer mechanism, retention/deletion controls and incident contact.
Do not copy credentials or personal participant samples into this report.

| Provider | Observed or intended use | Still to verify |
|---|---|---|
| Supabase | Auth, Postgres, Storage, Realtime, database jobs; region `us-east-1` reported by Marwane on September 15 | Contract owner/applicable DPA, production separation, backups/logs and restore/deletion procedure. See the September 15 refresh and [provider guidance](https://supabase.com/docs/guides/security/gdpr-compliance). |
| Vercel | App and server routes, including email and photo upload/preparation; external photo review is disabled on the public deployment checked September 30 | Team/account owner, execution locations, request/log retention and provider access. [DPA](https://vercel.com/legal/dpa). |
| Resend | Welcome-email delivery and delivery/bounce/complaint webhooks | Production flag and account, provider retention, open/click tracking settings, suppression handling and enabled email types. [DPA](https://resend.com/legal/dpa). |
| Cloudflare | Repository records domain registration and DNS | Whether proxying, analytics, protection or email routing is enabled; actual processing depends on those services and the receiving mailbox provider. DNS use alone does not prove application payloads traverse Cloudflare. |
| OpenAI | Optional photo-review integration remains in source but is disabled on the public deployment checked September 30; manual moderation is approved for the first evenings | Not an active pilot photo recipient under this decision. Reassess provider terms and retention before any activation. This does not determine use of separate founder-operated AI tools. |
| Stripe | Intended deposit/refund processor; dedicated account promised by the accepted interim operator | Legal entity details/account access, activity approval, banking destination, fees/currencies and provider roles/retention. Some provider purposes can have independent controller obligations; do not label every provider solely a processor. |
| Founder-operated tools | Repo/issue tools, local development, QA, email, prospecting lists and potentially AI assistants with infrastructure access | Actual tool list, permission scope, exports/prompts, retention, recipients and whether any real participant data reaches them. No such content was retrieved in this audit. |

## Proposed legal and operational positions, not approved

For ordinary core-service processing, examine contractual necessity where the
data is actually needed. For preferences and interactions revealing sexual
orientation, assess an Article 9 condition in addition to Article 6; explicit
consent is the proposed route to validate, with evidence and practical withdrawal.
Do not reuse marketing consent or an adult checkbox. Assess safety/security
legitimate interests separately, including any sensitive data or alleged-offence
information in reports. The earlier preference-derived analytics assessment
follow-up was closed by founder direction on September 30; it is not an active
action in this section. Core matching consent does not automatically authorize
a separate analytics purpose.
[GDPR Articles 5–10](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre2).

Keep marketing optional. Inventory browser storage by purpose and determine
which operations are strictly necessary and which require consent. First-party
analytics is not automatically exempt. Avoid introducing a generic cookie banner
without determining what it must control.
[CNIL tracker guidance](https://www.cnil.fr/fr/questions-reponses-lignes-directrices-modificatives-et-recommandation-cookies-traceurs).

### Retention starting proposals

These numbers are discussion inputs chosen for a small pilot, not legal periods
or implemented guarantees. Each needs an owner, deletion mechanism and evidence.

| Category | Starting proposal and reason |
|---|---|
| Live likes, matches and text | Preserve terminal-night deletion; verify jobs, failure recovery and browser cleanup. Avoid longer message storage just for analytics. |
| Attendance and identifiable measurement | Consider 30 days after the night for support and pilot analysis, then delete or produce genuinely non-identifying totals. Coordinate report eligibility before removing presence evidence; remove linked JSON identifiers too. |
| Profile and displayed photo | Consider 90 days without meaningful use for this early pilot, then deletion unless the participant returns. Define the activity signal and align it with the persistent-identity promise before adoption. |
| Replaced/rejected images and photo audits | Use #194/#243's reviewed version lifecycle as input; separately justify any evidence exception and audit duration. Do not infer that image deletion also deletes audit metadata or CDN/browser copies. |
| Safety records | Review closed cases after 90 days as an initial operational checkpoint, not an unconditional deletion deadline. Agree justified limits for blocks, evidence and specific legal holds with counsel. |
| Marketing | Superseded by approved rules: three years from subscription or last explicit confirmation for subscriptions; three years from unsubscribe for the minimal do-not-send record. Unsubscribe stops announcements immediately; expiry never resubscribes a participant. Other email evidence remains separate. |
| Email delivery and technical logs | Delivery-record retention was approved October 1: 30 days after successful sending or definitive abandonment after failure. Other technical logs, pending deliveries, suppression evidence and unsubscribe tokens remain separate. |
| Backups and financial records | Obtain actual backup expiry and restoration controls; set financial retention with the operator/accountant. No invented universal duration. |

### Manual rights and incident workflow for the pilot

Propose one monitored privacy inbox, a named handler and backup, and a restricted
request log. Acknowledge requests, verify only the identity information needed,
locate affected systems, act, and record the response. Use an authenticated
session where practical; a name/photo alone is not sufficient proof of ownership.
Cover access, correction, erasure, restriction, objection, consent withdrawal,
portability where applicable, and complaint instructions. Protect other people's
identities, secret likes and report confidentiality in exports.

The ordinary response deadline is one month; a permitted extension of up to two
additional months requires timely explanation. Record justified retention
exceptions rather than promising unconditional erasure.
[GDPR Articles 12–22](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3).

For an incident, contain access, preserve necessary evidence, notify the operator
and assess notification obligations immediately. The authority-notification
deadline is generally 72 hours from awareness unless the breach is unlikely to
risk people's rights; high-risk breaches can also require notifying affected
people. Record the assessment. A mailbox handler is not automatically a DPO.
[GDPR Articles 33–34](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4).

### Original region proposal — superseded by the September 30 decision

Prefer investigating one production project in an explicitly EU region for the
likely Paris pilot, separated from development as the repository already plans.
No reason for simultaneous EU/US production databases has been established.
On September 15, Marwane reported the current region as `us-east-1`. On September
30, he approved preparing a separate EU production project and cutting over at
launch, tracked in #280. No workload was moved in this framework session.

EU hosting is not a complete transfer solution. Review the US operator, founder
access, provider support and subprocessors against the exact arrangement. Where
relying on the EU–US DPF, verify that the specific recipient and processing are
covered by active certification; do not assume the brother's company is covered.
Other appropriate mechanisms may need assessment.
[CNIL transfer guidance](https://www.cnil.fr/fr/adequation-des-etats-unis-les-premieres-questions-reponses).

## Current follow-ups and completion boundary

The October 2 status section at the top and the consolidated #203 issue own the
current disposition. They replace the old routing table, including its stale
missing-consent-issue, unfinished-mailbox and operator-verification statements.
The GitHub board remains authoritative for task status. Booking/payment inputs,
if enabled, remain with the existing payment work rather than this email/privacy
consolidation.

The listed formalities now have an assessment or explicit founder disposition;
EU-representative designation is deferred, not a verified exemption. The additional hypothetical sensitive-
report discussion is deferred until a concrete need arises. Its agreed
implementation work is already routed; deferred automation alone does not keep
#203 open. Publication additionally requires accurate release facts and completed
public copy/links. This consolidation neither closes #203 nor authorizes launch,
and it does not re-review the approved eleven-section wording.
