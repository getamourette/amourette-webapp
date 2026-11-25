# Pause, leave and hide clear unmatched likes, and the copy says so

**Date:** 2026-11-25 · **Issue:** #483 (bug review finding Z2-I4)

## Decision

1. A founder pausing the room, a participant leaving the night and a participant
   hiding their profile delete every like of that night that is not mutual, in
   both directions. Matches and their conversations are kept until the
   definitive end of the night. This is the behavior #231 shipped
   (`private.invalidate_like_pairs`), now stated as the rule.
2. Every surface that explains it says so, in English, French and Spanish: the
   leave confirmation, the screen after leaving, the hidden-profile screen, the
   founder pause and reopen controls, the Terms and the Privacy Policy.
   `scripts/test-like-retention-copy.mts` fails on copy that promises likes are
   kept.

This supersedes, for likes only, two entries in the frozen archive
`docs/decisions.md`: "Venue-night closure has two deliberately different
meanings" (a manual close "preserves that night's likes, matches, and messages")
and "Pause discovery and leaving a venue are distinct controls" (leaving "does
not delete the night's likes, matches, or messages"). Their statements about
matches and messages still hold.

## Why

The copy was written from the two old entries after #231 had changed the
behavior, so a founder who paused briefly, believing "existing interactions are
preserved", wiped every pending like in the room without knowing it, and the
Terms and Privacy Policy described a retention that does not exist. Fixing the
words is the correct fix: the error runs in the protective direction (data
deleted earlier than announced), and keeping pending likes across a pause would
reopen the like/eligibility concurrency work of #231. Keeping pending likes over
a pause stays a possible post-launch question, not a decision.
