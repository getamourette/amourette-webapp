-- A visibility change does not alter attendance, but it does alter the set of
-- profiles discoverable by other participants. Touch the participant-safe
-- public projection so every client receives an anonymous invalidation event.

drop trigger if exists presence_update_public_state on public.presence;

create trigger presence_update_public_state
after update of venue_night_id, left_at, is_visible on public.presence
for each row execute function private.refresh_venue_night_public_state_from_presence();
