-- #348. Founder profile review learns about photo change requests at once.
-- Reuses the #232 content-free founder signal: same topic, event, payload and
-- founder-only Realtime policies. No new channel, grant or readable column.
-- Behavioral trigger change: requires founder approval before application to
-- the shared development DB. Until then the admin keeps its 15-second poll.
begin;

-- A new or replaced photo, and every founder decision on one, writes photo_state.
-- Transition tables keep zero-row statements silent (#330) and forbid a column
-- list, so unrelated photo_state updates also signal; the client collapses bursts.
create trigger photo_state_notify_moderation_queue_insert
after insert on public.photo_state referencing new table as changed_rows
for each statement execute function private.notify_moderation_queue();
create trigger photo_state_notify_moderation_queue_update
after update on public.photo_state referencing new table as changed_rows
for each statement execute function private.notify_moderation_queue();

-- A required photo correction returns to Needs review only when its owner
-- submits the profile, which writes profile_reviews rather than photo_state.
create trigger profile_reviews_notify_moderation_queue_update
after update on private.profile_reviews referencing new table as changed_rows
for each statement execute function private.notify_moderation_queue();

-- No delete triggers: removing a profile cascades into both tables, and a
-- deleted profile leaves the venue-scoped review through presence anyway.
commit;
