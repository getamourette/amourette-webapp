# Next-day thank-you email with a short survey, off by default (#559)

Date: 2026-11-27. Builds on the reservation reminders decision
(`docs/decisions/2026-11-25-reservation-reminders.md`), which left this email out.

**Problem.** After a night, the founders learn nothing from the guests who came:
did they match, did they talk in person, did they feel at ease, how did they hear
about the night. A guest who enjoyed it also has no simple way to hear about the
next one.

**Decision.** The email and its survey are built and ship switched off. A founder
turns them on per night, from the night page in the admin ("Next-day survey"), with
a confirmation step. Nothing is sent for a night without that action.

**Open question, not decided here: the legal basis of this email.** A thank-you
with a satisfaction survey, sent to a guest who came, without promotional content,
may be a service message tied to the reservation the guest made, or it may be
treated as marketing, which in France needs prior consent for email. Marwane has
not decided. Until he does, no night is switched on. If the answer is "service
message", turn it on per night as is; if it is "marketing", it needs prior consent
at booking (a separate box on the reservation form) before any send, which this
change does not add. Before the first send, the participant privacy policy should
also name this email, the survey and its retention.

**How it is built, and why.**

1. **Only guests who arrived.** A verified arrival whose credential was not revoked,
   on a night that was not cancelled and has ended. Never an absent, no-show,
   removed or cancelled guest. Checked when queued and again at send time, so
   turning the survey off stops emails already queued.
2. **Once, the next morning.** 11:00 venue time the day after the night starts,
   for three days at most (a job that was down does not send a week later). One
   email per reservation, by the existing event receipt. Same outbox, worker,
   retries and founder alert as every reservation email (#541).
3. **Answers tied to no one.** The answers table holds the night and the four
   answers only: no reservation, email or account, so an answer cannot be joined
   to likes, matches or a person. The survey shows nothing about likes or matches;
   each answer is the guest's own statement. A private link (hashed token, 14 days)
   allows one answer.
4. **Next-night opt-in is a separate consent.** An unticked box on the survey page.
   Ticked, it subscribes the reservation's email to the existing next-nights list
   with its own source (`next_day_survey`) and consent version
   (`next-day-survey-v1`), through the existing subscription function, welcome
   email and unsubscribe path. Like every subscription, it belongs to a Supabase
   identity: the browser's own anonymous session, created only when the box is
   ticked.
5. **No promotional content in the email.** A thank-you, the survey link, the
   privacy sentence and a line saying this email is sent once.

**Not decided here.** The retention of survey answers (they carry no identity) and
of survey links (deleted with their reservation).
