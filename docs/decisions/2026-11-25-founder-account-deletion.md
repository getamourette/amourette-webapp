# Founder account deletion: one console action, the Auth cascade, open safety matters first

Date: 2026-11-25 (#258)

Before this, a guest's deletion request had no tool: deleting the Auth user by
hand in the dashboard would have left every photo file in Storage (no cascade
reaches it) and would have erased open reports with the profile.

**Decision.** A founder deletes a guest's profile and account from profile
review (Moderation, Profile review, the person's card, "Account deletion"),
after typing `DELETE`. The server route `/api/admin/account-deletion`:

1. checks the founder session, then asks `admin_account_deletion_check` with
   that session whether the account may go now;
2. removes every file under `<user id>/` in the four photo buckets;
3. deletes the Auth user through the Admin API, whose cascade removes every
   application row that names the person;
4. sweeps the buckets again for an upload that was in flight.

Why this shape:

- **The Auth deletion is the delete.** Every table that references the account
  or the profile already cascades or sets the reference to null (checked on the
  replayed schema). A hand-written list of deletes would drift from the schema;
  `scripts/test-account-deletion-sql.mjs` instead scans every uuid column of the
  application after a deletion and fails on any id left that is not listed below.
- **Files before the account, every step repeatable.** Once the account is gone
  nothing points at the files. A failure at any step leaves the account in
  place or the files already gone, and pressing Delete again resumes. A retry on
  an account already deleted only sweeps the files.
- **Refused while a safety matter is open.** Reports made or received and their
  case cascade with the profile, so the check refuses while a report is
  undecided, a case awaits review, or the person is removed from a night still
  running (deleting would also lift the removal). The founder decides first.
- **Never a founder account, never one's own.** Founder accounts are handled by
  hand (`docs/admin-password-management.md`).
- **No deletion log table.** The request and its answer are kept with the
  privacy correspondence (data register, entry 7). The founder actions taken
  about the person stay in `private.moderation_events`.

**Kept after a deletion, on purpose:**

- `private.moderation_events` (founder action history, #234): bare ids, no
  foreign key. Retention still undecided there.
- `private.matching_consent_events`: the consent proof, kept 12 months after
  account deletion (data register, entry 2). Its expiry job is #287.
- `private.night_people` and `private.night_intervals` (#257): the night
  report sources, bare id and counters with no foreign key so the night's
  totals stay right. They go when the night is finalized, so only for a night
  still running, and only until its end.
- Reservation and payment records: they are not linked to an account
  (`docs/launch-reservation-policy.md`) and keep their own retention.
- Email delivery records, suppressions and unsubscribe tokens keyed by address
  (#259 owns their retention), provider copies and database backups.

**Consequence to know:** a decided report about someone else that the deleted
person made disappears with the profile; the decision taken on it remains in the
action history, without the reporter, as #234 designed.

**Not built here:** guest self-service deletion and the two-year inactivity
cleanup. Both stay on #258's scope for later.

**Procedure for a request.** Check that the request comes from the person (the
privacy contact thread, details only they would know such as the night and
first name). Open the venue in profile review with the "All" filter, find the
card, decide any open report first, then delete. Answer the request and keep the
thread under the privacy-request retention.
