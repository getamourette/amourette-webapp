# Founder account deletion: one console action, the Auth cascade, open safety matters first

Date: 2026-11-25 (#258)

Before this, a guest's deletion request had no tool: deleting the Auth user by
hand in the dashboard would have left every photo file in Storage (no cascade
reaches it) and would have erased open reports with the profile.

**Decision.** A founder deletes a guest's profile and account from profile
review (Moderation, Profile review, the person's card, "Account deletion"),
after typing `DELETE`. The server route `/api/admin/account-deletion`:

1. checks the founder session, then runs `admin_delete_guest_account` with that
   session: it locks the account and profile rows, checks that the account may
   go now and deletes the `auth.users` row, whose cascade removes every
   application row that names the person;
2. then removes every file under `<user id>/` in the four photo buckets.

Why this shape:

- **Check and delete under one lock.** A report, case or removal written
  between a separate check and the deletion would be erased by the cascade.
  `for update` on the profile row conflicts with the key-share lock of every
  foreign-key insert, so such a writer either committed first (the check sees
  it) or waits and then fails. The row is deleted in SQL, as the Auth Admin
  API's own deletion does.
- **The account deletion is the delete.** Every table that references the account
  or the profile already cascades or sets the reference to null (checked on the
  replayed schema). A hand-written list of deletes would drift from the schema;
  `scripts/test-account-deletion-sql.mjs` instead scans every uuid column of the
  application after a deletion and fails on any id left that is not listed below.
- **Files after the account, every step repeatable.** A refused deletion keeps
  every photo. If the file sweep fails after the deletion, the founder is told
  and presses Delete again: the account reads as already gone and only the files
  are swept.
- **Accepted gap: a photo upload already in flight.** A guest's photo request
  authenticated before the deletion can write one file after the sweep (HEIC
  conversion takes seconds). A deletion request arrives by email, after the
  night, so this needs the guest to upload while the founder deletes. Not
  covered by a durable cleanup; noted on the pull request.
- **Open: no recovery target once the card is gone.** If the file sweep fails
  after the deletion and the profile card unmounts (reload, background refresh),
  the console offers no way to retry the sweep. A durable fix is an orphan-folder
  sweep in the photo cleanup job; left for the founder to decide.
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
