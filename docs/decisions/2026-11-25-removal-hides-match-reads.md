# A removal for the night hides the removed person's matches instead of deleting them

**Date:** 2026-11-25 · **Issue:** #368 (SEC-005)

## Decision

When a founder removes a participant for the night (`eject_from_venue`, or
`moderate_case` with `remove_for_night`), the removed person stops reading
everything tied to that night's matches: the match rows, their messages, the
partner card (`chat_partner_state`), the partner's live presence
(`match_presence_state`) and the partner's profile and photo
(`private.visible_profile_ids`). Each of those read paths refuses a caller with an
active removal for the match's night (`private.is_ejected_from_venue_night`). The
matches and messages themselves are kept.

## Why

The audit offered two fixes: delete the removed person's matches, as a block does,
or filter the reads. Filtering was chosen because:

- A removal can be undone for the night (`restore_to_venue`, `moderate_case`
  `restore`). Deleting would make a mistaken removal destroy every conversation of
  that night for good; filtering gives the reads back with the access.
- Deleting would also erase the partner's side of the conversation in the middle of
  the night. Filtering leaves the partner the paused chat they already see when the
  other person leaves the bar, and they can still block or report.
- Night reports and founder counts read the match and message tables; a mid-night
  deletion would change them depending on moderation timing.

A block keeps deleting the pair's likes and matches: it is the participant's own
hard stop, not a founder action that can be reversed.
