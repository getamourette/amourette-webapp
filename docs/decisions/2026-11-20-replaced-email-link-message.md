# A replaced email link says so, only to its own holder

Date: 2026-11-20 (#405, point 11)

- **`/reservations/access` answers "This link was replaced by a newer one. Use
  the most recent email you received." instead of the generic refusal when the
  link was superseded.** Why: at the launch rehearsal the generic "missing,
  expired or no longer valid" sent guests to request yet another link while the
  working one was already in their inbox.
- **The server discloses it (401 `superseded_access`) only when the identifier
  and the token both match an unexpired proof still addressed to the
  reservation's current email.** Why: an identifier alone, or a wrong token,
  must learn nothing; those keep the same 401 `invalid_access` as before, and
  the extra lookup runs only after the token matched, so nothing separates them
  in status, body or work done. The proof row and its token digest are kept
  after a replacement, which is what makes this check possible without storing
  anything new.
- **"Superseded" is said only when the most recent link issued to that address
  is another one, was delivered (recorded as sent, or already opened) and works
  now.** Why: the message tells the guest to use their latest email, so that
  email must be the working one. With three links where the middle one was
  opened, the latest email is dead, so both stale links keep the generic
  wording, which points to "Find my reservation"; so does a link sent to an
  address a founder has since corrected. Nothing else about the reservation is
  revealed. Open option, not taken: direction-neutral copy ("another of your
  emails holds the working link") would also cover a newest link invalidated by
  opening an older one, at the cost of not saying which email; it needs new
  validated wording.
- **A replaced link is a terminal state on the page:** the message alone, with
  no "Open my reservation" retry and no prompt to request another link. Why:
  both contradict the message and the retry can never succeed.
- **Migration `20261123000002_superseded_launch_access.sql` redefines
  `inspect_launch_access` (behavioral) and adds an index on
  `launch_access_mail(reservation_id, created_at)` for the sibling lookup.** It ships in the PR and is applied to
  development, then production, only with Marwane's approval.
