-- The empty live room (#118) captures the next-nights email on its own inline
-- card, not through the 2-minute room popup it replaces on that screen. Without
-- this value the card has to report `room_popup`, which makes `source` lie about
-- where consent was obtained and permanently merges the two surfaces in the
-- data. The consent record itself is unaffected: the card renders the waiting
-- room's consent wording, and every live-night surface maps to the same
-- `global-live-night-email-v1` version.
--
-- Widening a check constraint is permissive: no existing row can become invalid,
-- and code that predates this migration cannot produce the new value.

alter table public.email_subscriptions
  drop constraint email_subscriptions_source_valid,
  add constraint email_subscriptions_source_valid
    check (source in ('landing', 'room_popup', 'waiting_room', 'subscription_management', 'empty_room'));
