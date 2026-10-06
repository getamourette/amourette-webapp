# Amourette — record of processing activities

Working version 0.1 · Prepared 2026-10-01 · Framework: #203

## Document control and scope

This is InboxPilot, Inc.'s working record for Amourette's first pilot of
approximately 50 adults, probably in Paris. It describes activities and categories,
not individual participants. It is not a register of InboxPilot's unrelated services.

The reference document is `docs/reports/data-processing-register.md` in the
Amourette repository. The repository is public, verified October 1; Marwane
accepted keeping this version in Git with that visibility. It contains activity
descriptions and general safeguards, not participant records or access secrets.
Keep actual requests, incident evidence, credentials and confidential provider
attachments outside this public document.

Update the record when purposes, data, recipients, locations, retention or security
change. It serves internal recordkeeping and must be available to the supervisory
authority on request. Public repository availability is a chosen storage approach,
not a routine CNIL filing or a replacement for the participant privacy policy.

**Status:** drafted from approved decisions and dated technical evidence in the
[framework inventory](data-framework-inventory.md) and
[decision log](../decisions.md). Retention below states the agreed rules, not a
claim that every cleanup mechanism is deployed. The production configuration
and implementation evidence still need reconciliation through the existing issues.
This document neither changes the product nor reopens closed discussions.

October 2 update: the [working pilot DPIA](pilot-data-protection-impact-assessment.md)
records its applicability screening, participant risks and release-verification
dependencies. It is not a completed production-risk validation.

## Responsible organization and contacts

October 6 publication reconciliation (#299): the EN/FR/ES application policy and
contact links are prepared in draft PR #300 with launch-facing public copy. The dated evidence table in the
[framework inventory](data-framework-inventory.md#publication-preparation--2026-10-06-299)
records the remaining production and retention facts. #280 and #48 are still open;
no production location, transfer, log/backup or released-control verification is
added by this UI work. Local scalar onboarding drafts still lack the approved
24-hour expiry (#286); #287/#258/#259/#260/#234 execution remains to verify.
The retention rows below remain approved targets, not newly certified operation.
The official contact is centralized in `lib/privacy.ts`; this changes its display,
not request ownership, routing or retention.

| Field | Recorded information |
|---|---|
| Controller for the described Amourette activities | InboxPilot, Inc. |
| Contact address | 2810 N Church St PMB 16104, Wilmington, Delaware 19802-4447, USA |
| Privacy contact | privacy@getamourette.com |
| Operational privacy handling | Marwane, with Aymane as backup; manual handling confirmed in #142. |
| Record maintenance | Founder-maintained under #203; a separate custodian has not been assigned. |
| EU representative | None designated. Marwane deferred designation on October 2: no representative for now. This is a founder disposition, not a verified legal exemption; it is not an active #203 task. |
| DPO | No designation. The October 2 assessment identifies no mandatory appointment for the described small Amourette pilot; this is not an assessment of InboxPilot's unrelated activities. The privacy contact is not described as a DPO. |

## Common systems, recipients and locations

The entries below incorporate this section and the common security description.
Recipient access is tied to the function stated, not unrestricted distribution.

| System or recipient | Role and data involved | Location/transfer record |
|---|---|---|
| Supabase | Auth, database, profile photos, realtime communication and scheduled jobs; application data identified in each entry. | Current shared development project is in the US (`us-east-1`), as recorded by the founder. Dedicated EU production before real collection is approved under #280; cutover is not verified. Relevant recipients, access countries and transfer safeguards for production will be recorded from #280. |
| Vercel | Web application, request handling and applicable server routes, including photo preparation and email delivery. | Effective execution, network/log/support locations and applicable safeguards remain with #280. EU Supabase storage does not establish EU-only Vercel processing. |
| Resend | Sends configured application emails; receives recipient addresses and email content and returns delivery events. | Exact email processing/access locations and safeguards are not verified in this record. The detailed email-provider investigation was explicitly deferred; no new investigation is created here. |
| Cloudflare and founder Gmail mailboxes | Contact-email routing and receipt/handling of correspondence. Cloudflare also provides domain/DNS services. | Exact email processing/access locations and safeguards are not verified. Do not infer EU-only processing; the same approved investigation deferral applies. |
| Authorized operator team | Service operation, manual photo review, participant safety, statistics and rights handling as appropriate to the activity. | InboxPilot is based in the US; founders operate from Paris and New York. Access abroad is not automatically a disclosure to a separate recipient. #280 owns the agreed relevant access/transfer assessment. |
| Eligible participants | Receive the profile information and matched messages described below. | Through the venue-night experience; participant device copies are not controlled by server deletion. |

No reviewed production transfer mechanism or certification is claimed merely
because a provider publishes a DPA. #280 supplies the actual Supabase/Vercel
destinations and safeguards; reference its dated evidence here, keeping any
confidential attachments separately with restricted access.
This section preserves known facts and gaps without restarting operator identity,
account ownership or the deferred email-provider investigation.

## 1. Account, profile and interrupted onboarding

| Field | Description |
|---|---|
| Purpose and people | Recognize adult participants across visits, provide their profile and session, and let a prospective participant resume an interrupted registration. |
| Data and source | Participant-entered first name, biography, photo and adult confirmation; account/session identifiers, profile dates and voluntary-use timestamps; local form progress and photo drafts. Gender/preferences and their consent are covered in entry 2. Adult confirmation is not an identity-document check. |
| Systems and recipients | Supabase Auth/database/Storage, participant browser, Vercel where requests or photos pass through it, authorized team for the stated operational purposes. Eligible participants see the displayed profile within the venue flow; private account data is not public profile content. |
| Retention | Profile/current photo: two years without voluntary app use, or earlier valid deletion request; automatic session refresh does not renew activity. Draft: 24 hours after the last deliberate edit, cleared earlier on successful creation. Expired drafts are not restored and are removed when the app next executes cleanup; no physical deletion promise while the app is closed. |
| Execution evidence | #258 owns profile/account cleanup, with actual rights requests handled manually meanwhile. #286 owns the full approved draft-expiry behavior. Do not infer completed automation from these rules. |

## 2. Matching, presence, consent evidence and conversations

| Field | Description |
|---|---|
| Purpose and people | Show compatible adults who are present at the same venue night, support discreet mutual likes and matched conversations, and record matching agreement/withdrawal. |
| Data and source | Participant gender and genders sought; account/venue/night references; entry, last-seen, departure and visibility state; likes, match pairs, text messages and timestamps; typing/read state and pending outgoing messages on the device; consent dates and accepted wording/version. Preferences can reveal sexual orientation. |
| Systems and recipients | Supabase database/Auth/Realtime and participant browsers; Vercel where the application request path handles data; eligible participants for visible profiles and each match's participants for messages. Authorized team access follows service operation, safety and rights purposes. |
| Retention and withdrawal | Withdrawal immediately stops discovery and new likes/matches, stops covered preference use and initiates cleanup. Existing chats continue until definitive night end under presence/safety rules. Likes, matches and conversations are deleted at definitive end, not a temporary pause. Keep current operational presence records for the pilot; this is not an approved indefinite period. Persistent preferences otherwise follow the profile rule. |
| Evidence retention | Minimal account reference, grant/withdrawal dates and accepted wording/version while relied on, then 12 months after withdrawal or account deletion, whichever occurs first. New consent does not extend an earlier withdrawn proof. Only necessary evidence for an ongoing dispute remains until resolution. No photo, preference or message copies in that proof. |
| Execution evidence | #281 merged through #285, with development validation recorded; this is not evidence of production cutover. #287 owns evidence expiry and preservation after account deletion, coordinated with #258. #257/#283 owns terminal cleanup and associated report sources; #283 merged October 1, verified October 2. Device markers and participant-downloaded copies do not automatically share the server deadline. |

## 3. Manual photo moderation

| Field | Description |
|---|---|
| Purpose and people | Review participant profile photos and handle corrections for the initial evenings. |
| Data and source | Uploaded/displayed and processed photo versions, version references, review status/reason, reviewer and decision/correction dates. |
| Systems and recipients | Supabase database/Storage, Vercel photo preparation and authorized manual reviewers. Eligible participants see displayed photos permitted by the moderation rules. |
| Retention | Current photo follows the profile rule. Replaced/refused files become eligible for cleanup after 24 hours from upload when no protected dependency needs them. A rejected displayed photo is hidden immediately; protection ends on approved correction or 30 days after the correction request, subject to ordinary upload-age eligibility. Recorded staging cleanup is three hours. Decision history remains during active correction and 12 months after resolution; necessary ongoing-dispute evidence only until resolution. Do not retain deleted photos through the audit. |
| Execution evidence | Inventory records #243's released file lifecycle and September checks. #234 owns approved audit expiry and supporting version-reference cleanup. File deletion does not prove deletion of all metadata or downloaded copies. |

## 4. Participant safety, blocks and reports

| Field | Description |
|---|---|
| Purpose and people | Protect participants, investigate reports and apply proportionate moderation. Includes reporters, reported participants and moderators. |
| Data and source | Account and venue/night references, block relationships, report reason and participant note, interaction-evidence category, case status, reviewer actions, sanctions and dates. |
| Systems and recipients | Supabase and authorized moderation team; owner/reporter access where permitted by the service. No general post-night message archive is added. |
| Retention | Blocks while both profiles exist. Reports during handling and 12 months after closure, unless a continuing need is documented and reviewed. Necessary evidence for an ongoing matter is handled under that exception. Venue ejections follow terminal-night cleanup as recorded in the inventory. |
| Execution evidence | #260 owns report cleanup; coordinate profile deletion under #258 and moderation audit under #234. Handling can be manual for the pilot. The additional hypothetical sensitive-content discussion is deferred until a concrete need, with no new control or task implied by this entry. |

## 5. Pilot evaluation and night reports

| Field | Description |
|---|---|
| Purpose and people | Evaluate entry and participation at the pilot evenings and understand the agreed activity metrics for adult participants. |
| Data and source | Scan/entry/profile-completion events and agreed night activity inputs, including likes, matches and conversations started; derived grouped report. The inventory records identifiers in existing source tables; a grouped UI alone does not erase them. |
| Systems and recipients | Supabase, applicable application requests and authorized founders viewing the report. |
| Retention | Delete identifying report sources at definitive night end within #257's agreed scope, retaining the agreed grouped report without participant names/account IDs, message content or individual interaction histories. No fixed expiry was approved for the retained grouped report. Operational presence follows entry 2. Do not equate identifier removal alone with guaranteed anonymity. |
| Execution evidence | #257/#283 merged October 1 and records development migrations and validation; production behavior is not verified here. Preserve its agreed scope and small-group protections. Additional statistics justification is explicitly closed, not a new analysis or consent task and not a legal-compliance finding. |

## 6. Optional announcements and email delivery

| Field | Description |
|---|---|
| Purpose and people | Send optional future-night announcements to subscribers, deliver configured application emails and respect unsubscribe/delivery-block choices. |
| Data and source | Submitted email, associated account where present, locale/source, consent version/status/dates, unsubscribe record; delivery recipient/content/status/errors/provider references; technical suppressions, unsubscribe tokens and delivery webhook records. |
| Systems and recipients | Supabase, applicable Vercel worker/routes and Resend; recipient receives the email, authorized team handles delivery issues. |
| Retention | Subscription: three years from subscription or explicit reconfirmation; sends/opens/app use do not renew it. Unsubscribe stops announcements immediately. Minimal email/date/do-not-send record: three years from unsubscribe, solely to prevent announcements; expiry does not resubscribe. Application delivery records: 30 days after successful sending or definitive abandonment after failure. Technical suppressions/tokens are separate and do not automatically inherit these deadlines. |
| Execution evidence | #259 owns the approved cleanup, including manual fallback for the earlier delivery deadline. Provider-side copies do not acquire an invented deletion guarantee; the detailed email-provider investigation remains deferred. |

## 7. Privacy requests and team correspondence

| Field | Description |
|---|---|
| Purpose and people | Receive and respond to participants' applicable data-rights requests and correspondence. Includes requesters and people necessarily mentioned in a request. |
| Data and source | Sender/contact address, request/response content and dates, necessary account references, proportionate identity-verification information, extracted data and action/outcome record. |
| Systems and recipients | Cloudflare contact-email routing, founder Gmail mailboxes, configured outgoing replies through Resend, authorized handlers and relevant application systems/temporary exports needed to answer. Marwane is primary; Aymane is backup. |
| Retention | Privacy requests/responses: 12 months after closure. Remove identity documents and exports sooner when no longer necessary. Keep only necessary ongoing-dispute evidence until resolution. This rule includes relevant mailbox copies and does not silently set a universal deadline for unrelated correspondence. |
| Execution evidence | #142 confirms the operational contact channel. Requests and deletion are handled manually; temporary extracts remain restricted to those handling the request. Public contact integration is tracked in #141. |

## 8. Service administration, security and technical operation

| Field | Description |
|---|---|
| Purpose and people | Operate and protect the app, manage venue nights, troubleshoot faults and handle incidents. Includes participants and founder administrators. |
| Data and source | Administrator accounts, configuration/transition actions, request/security/error metadata, and technical logs/backups as actually generated by the chosen services. No participant-message archive is created for troubleshooting. |
| Systems and recipients | Authorized founders, Supabase and Vercel in their respective operational roles. No default export of participant data to development tools is assumed. |
| Retention | Production log/backup periods and restoration treatment remain to be recorded from #280's chosen plans/configuration. No universal log period is invented. Backup deletion is distinct from active database deletion; database backups do not contain the photo-object bytes. |
| Execution evidence | Founder-reported current Supabase Free/Vercel Hobby with no separately configured log exports/backups is a dated input, not the future production setup. #280 owns release-specific configuration and evidence. |

## General technical and organizational safeguards

The recorded application design uses authenticated sessions, database row-level
permissions, restricted photo storage and protected founder administration.
Network communication uses HTTPS. Participant visibility, discreet likes and
matched chat have scoped access paths. The released configuration and migrations
must substantiate these descriptions; this record is not a new security audit.

Authorized team access is used for operation, moderation, safety and rights
handling. Do not describe the team as technically incapable of reading messages.
Manual photo moderation, separate matching/announcement choices and the agreed
withdrawal controls form part of the pilot's operating safeguards.

Keep development/QA separate from real participant collection under #280. Use
synthetic data for rehearsals. Restrict request-related exports and delete them
when no longer needed. Existing manual rights and incident procedures are recorded
in the inventory; no additional platform or general message archive is prescribed.

## Remaining factual completion and maintenance

| Input | Existing owner/source |
|---|---|
| EU production region/cutover; Vercel execution; relevant destinations/safeguards; selected log/backup periods | #280 and release evidence. |
| Actual cleanup versus approved retention, and applicable manual procedures | Existing #257, #258, #259, #260, #234, #286 and #287 scopes. Update entries when their verified behavior changes. |
| Maintained reference copy | This repository document, updated by the founders as processing changes. No separate private-copy task remains for this version. |

This is a record of the described pilot, not a reason to add new controls or reopen
statistics, continued chat, hypothetical report content or the detailed email-provider
investigation. Known gaps remain visible without asserting that every gap is a new
launch blocker. Payment/booking processing is not recorded as active: add its actual
data, recipients and retention if that flow is enabled, using the existing payment work.

Reference: [CNIL — record of processing activities](https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement),
checked 2026-10-01. The inventory preserves supporting technical evidence and
approved legal-ground choices; this record does not invent grounds for closed topics.
