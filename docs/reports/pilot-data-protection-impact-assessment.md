# Amourette pilot — data protection impact assessment

Working version 0.1 · 2026-10-02 · #203 · Prepared for founder review

## Outcome and document status

**Screening conclusion:** a proportionate DPIA is warranted for the planned
approximately 50-adult pilot. The assessment identifies sensitive/intimate data
and systematic observation of identifiable participation and interactions. This
is a reasoned application of Article 35 to the planned service, not a claim that
every dating app or every small pilot automatically requires a DPIA.

This document provides the initial assessment. Production safeguards and residual
risks remain conditional on the existing release checks below. It does not certify
compliance, establish deployment, or record the operator's final acceptance.

The DPIA serves internal accountability; publication on the participant website
is not required. Marwane authorized delivering the framework documents through
the public Git repository on October 2, including this working assessment.
It is not a participant-facing policy or a submission to the CNIL. No participant
samples, credentials or detailed vulnerability instructions are included. Keep
confidential evidence outside public documentation.

## 1. Scope and evidence

Controller: **InboxPilot, Inc.**, 2810 N Church St PMB 16104, Wilmington,
Delaware 19802-4447, USA. Contact: **privacy@getamourette.com**; Marwane handles
requests, with Aymane as backup. No DPO has been designated in this workstream.

Scope: the first local venue-night test, approximately 50 adults, probably Paris.
The app supports an enduring profile, voluntary venue participation, compatible
discovery, discreet likes, mutual matches, temporary chat, manual photo review,
blocks/reports, grouped night reports, optional email and manual rights handling.
It does not claim coverage of InboxPilot's unrelated activities or future payments.

The [processing register](data-processing-register.md) supplies the categories,
recipients and approved retention rules. The
[framework inventory](data-framework-inventory.md) supplies dated evidence and
the unpublished public-policy draft. Supabase handles application data; Vercel
handles application hosting/routes; Resend and contact-email providers perform
their recorded email functions. The EU production setup remains with #280.

Evidence refreshed October 2:

- GitHub `main` at `05a6ac8ad6a95c9dbb122375cdae5095c426f877`, read remotely
  without rebasing or replacing this worktree.
- #281/#285 is merged. The matching-consent migration guards preference writes
  and extends candidate/like eligibility with valid consent.
- #257/#283 merged October 1 at 13:34:39 UTC. The report migration records
  identified presence intervals and interaction counters during the night and
  deletes its identified sources at terminal finalization. Merge is not proof
  of production application or successful production cleanup.
- #227 (mutual discovery compatibility) is closed. #235 (founder profile access),
  #280 (production preparation) and #48 (launch QA) remain open at inspection.

No real participant records, photos, messages or credentials were read. Older
inventory observations must not override this newer implementation evidence.

## 2. Applicability screening

The verified rule is that likely high-risk processing requires a DPIA before it
starts. The CNIL uses the European screening criteria, including sensitive data
and systematic monitoring. An exception needs a reasoned justification; small
headcount alone does not establish one. [S1, S2]

| Criterion | Application to this pilot |
|---|---|
| Sensitive or highly personal data | Present: identifiable dating preferences, private messages and attendance at a known venue. This follows the core service, not hypothetical sensitive report text. |
| Systematic observation | Retained in this assessment: automatic, structured collection of identified arrival/departure intervals and like/match/chat-start activity throughout the night. This is more than incidental server error logging. Terminal cleanup limits duration but does not remove the collection stage. |
| Evaluation/profiling | Compatibility uses declared preferences. No separate scoring or prediction is established here; the conclusion does not depend on classifying that filtering as profiling. |
| Large scale | Not retained for this approximately 50-person, local pilot. Persistent profiles still matter to duration. |
| Significant automated decisions / exclusion from a right or contract | Not established merely by mutual matching or consent-controlled discovery. No credit, employment or comparable consequential automated decision is described. |
| Vulnerable subjects | Adults are the intended participants; no child, employee or dependent-population targeting is described. |
| External dataset matching / innovative technology | Not established: linking the app's own events is not automatically external-data matching, and standard matching/manual photo review is not novel technology merely because the app is new. |

No direct pilot match was identified in the CNIL mandatory list or exemption list
(S3, S4). In particular, ordinary participant reporting is not reclassified as
employment whistleblowing, and a single bar test is not large-scale geolocation.
The general Article 35 test still applies.

**Application judgment:** the two retained criteria and the consequences of
linking an identifiable person to intimate activity warrant this DPIA. Voluntary
entry, limited attendance and temporary interactions reduce exposure; they do
not make disclosure harmless. This supports preparing this bounded assessment,
not expanding the closed legal discussions or adding a general audit project.

## 3. Necessity, proportionality and participant control

| Processing | Assessment using the agreed design |
|---|---|
| Profile and venue presence | Identity continuity and a venue/night reference support recognition and live participation. An account identifier is not anonymous. Profile/current-photo retention is two years without voluntary use or earlier valid request. Keep the already-decided pilot presence treatment; no indefinite-retention finding is made here. |
| Matching and chat | Declared preferences support compatible discovery; discreet mutual choice precedes chat. Explicit matching agreement, server enforcement and withdrawal restrict the covered preference use. Existing chats continue until definitive night end as agreed; this assessment does not invent an additional legal basis for that behavior. |
| Photos and safety | Manual review, blocking and reports serve participant protection. The approved photo lifecycle and report/block retention apply. Additional hypothetical sensitive-report analysis remains deferred; no new archive or form change is introduced. |
| Pilot evaluation | Keep the agreed grouped report, founder-only access and #257's terminal cleanup. Small cohorts remain visible to founders; no threshold suppression or anonymity guarantee is assumed. This DPIA records disclosure risks and existing safeguards without reopening justification, metrics or consent choices. |
| Email and rights | Announcements are optional and separate from matching. Approved subscription, unsubscribe and delivery-record periods apply. Rights requests use the monitored contact and manual workflow; privacy correspondence is retained 12 months after closure, with earlier deletion of unnecessary identity documents/exports. |

Recorded grounds remain those agreed in #203: contractual necessity for the
account/session, explicit matching and optional-announcement consent, legitimate
interests in principle for safety and entry-flow measurement, and legal obligation
for applicable rights requests. Closed discussions are not legal findings. This
assessment cannot turn those dispositions into blanket compliance approval.

Participants receive purpose-based information, separate choices and a contact
for access/deletion and other applicable rights. The eleven policy sections have
wording approval; final links/copy and actual production facts must match release.
EU storage is an approved target, not proof of EU-only access; #280 supplies the
actual locations/safeguards. The detailed email-provider investigation stays deferred.

## 4. Risks to people and existing safeguards

Qualitative scale: **severity** describes consequences for a person (moderate or
serious); **likelihood** describes a plausible route in this small pilot (low or
plausible). These are assessment judgments, not measured probabilities. A serious
impact is not downgraded merely because only a few people are affected. Conditional
residual assessments assume the described controls work in the released system.

| Risk, source and consequence | Initial assessment | Existing safeguards / verification owner | Conditional residual assessment |
|---|---|---|---|
| Another participant or an unauthorized caller obtains private preferences, secret likes, messages or attendance through overbroad access. Consequences include unwanted disclosure of orientation, distress and harassment at a known location. | Serious impact; plausible without effective access boundaries. | Authenticated sessions, database permissions, mutual compatibility, match-scoped chat and restricted photos. #227 merged; release verification through #48/#280. | Lower likelihood if direct unauthorized access is rejected; potential impact remains serious. Production evidence is pending, so this is not accepted as resolved. |
| A privileged account is misused, compromised or used to obtain unnecessary profile information. | Serious impact; plausible with excessive access. | Purpose-based founder access, protected administration and #235's existing scope. #280 includes founder access configuration. | Depends on effective privileges and access protection. No claim that administrators technically cannot read messages. |
| Data continues to be used or retained after withdrawal, terminal night end or an applicable deletion deadline. This can expose intimate activity longer than expected and defeat participant choices. | Serious impact; plausible where cleanup is incomplete. | #281's consent enforcement, #257's terminal finalization, and existing #258/#259/#260/#234/#286/#287 retention work with agreed manual handling where applicable. | Reduced only for paths with verified cleanup or a workable manual procedure. Merge and a written duration alone do not demonstrate execution. No need to ship every deferred automation to maintain this document. |
| A displayed profile, message screenshot or small-group report lets someone identify intimate activity. | Serious impact; plausible even with correct server permissions. | Limited venue visibility, discreet likes, matched chat, existing block/report controls and founder-only reports without participant names/account IDs. Small cohorts remain visible. | Some inference and recipient-copy risk remains. Do not promise anonymity or recall of downloaded copies. #48 checks the intended visible surfaces; no metric redesign is added. |
| A mistaken moderation action or loss/corruption of profile, block or request data affects participation or prevents correction. | Moderate impact; plausible. | Manual moderation, privacy-contact correction route, existing audit work #234 and backup/restore checks #280. | Lower likelihood with those controls, but recovery and correction must remain practical; no unverified restore guarantee. |
| Application/email-provider access, mishandled exports or inappropriate environment configuration discloses participant data. | Serious impact; plausible without scoped access and separation. | EU production/dev separation and relevant Supabase/Vercel safeguards under #280; restricted manual request handling and short-lived necessary exports. | Depends on verified configuration and actual safeguards. Deferred email investigation remains a recorded limitation, not a new workstream. |

## 5. Completion within existing work

This draft does not establish a current unmitigated-high-risk finding requiring
automatic CNIL submission. Nor does it establish that the actual residual risk is
acceptable before the release evidence is available. Article 36 consultation is
relevant if high residual risk remains despite the planned measures; merely
writing a DPIA does not trigger routine submission. [S1, S5]

Complete the assessment with existing work rather than create duplicate tasks:

| Concrete input | Existing scope |
|---|---|
| Production locations, applicable transfer safeguards, access configuration, log/backup periods and restore treatment | #280; reference the resulting evidence here and in the register. |
| Actual visibility, consent/withdrawal, block/report and terminal-cleanup behavior on the release | #48 and the implementation evidence for #227/#281/#257; address founder-access work in #235. |
| What actually enforces each promised retention rule | Existing retention issues and agreed manual procedures. Record the release facts, not a claim that all backlog work is already complete. |
| Residual-risk conclusion using those facts | The existing policy-publication card coordinates completion of this document with #280/#48 release evidence; no separate consultant, DPO appointment or paid tool is prescribed. |

No participant consultation has been performed or represented as completed.
Article 35(9) makes seeking views contextual. For this draft, actual participants
are not yet identified and no new survey is prescribed; use any available pilot
preparation feedback and record the operator's eventual disposition. No favorable
participant opinion or final operator validation is invented.

Revisit the assessment when the pilot's scope or risks materially change, rather
than impose a new fixed review calendar. Expansion, different sensitive-data uses
or changed access/retention are examples. Marwane deferred EU-representative
designation on October 2; no appointment for now, with no legal exemption inferred
and no replacement task. This task changes no code, migrations, provider settings
or public policy.

## Sources and reproducible evidence

- **S1:** [CNIL DPIA FAQ](https://www.cnil.fr/fr/ce-quil-faut-savoir-sur-lanalyse-dimpact-relative-la-protection-des-donnees-aipd), checked October 2, 2026.
- **S2:** [European DPIA guidelines, WP248 rev.01](https://www.cnil.fr/sites/default/files/atoms/files/wp248_rev.01_fr.pdf), screening criteria and publication guidance.
- **S3:** [CNIL mandatory DPIA list](https://linc.cnil.fr/sites/default/files/atoms/files/liste-traitements-aipd-requise.pdf).
- **S4:** [CNIL DPIA exemption list](https://www.cnil.fr/sites/cnil/files/atoms/files/liste-traitements-aipd-non-requise.pdf).
- **S5:** [GDPR Articles 35–36](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4).
- [Matching-consent migration at the inspected main commit](https://github.com/getamourette/amourette-webapp/blob/05a6ac8ad6a95c9dbb122375cdae5095c426f877/supabase/migrations/20260930000010_matching_preference_consent.sql).
- [Night-report migration at the inspected main commit](https://github.com/getamourette/amourette-webapp/blob/05a6ac8ad6a95c9dbb122375cdae5095c426f877/supabase/migrations/20260930000002_durable_night_reports.sql), particularly presence/interaction collectors and finalization.
- [Merged report PR #283](https://github.com/getamourette/amourette-webapp/pull/283); linked issue states were checked October 2. None is deployment evidence by itself.
