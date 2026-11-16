-- Behavioral: announce before applying to the shared database.
-- A new match reaches both participants over the private participant channel,
-- which the room already listens to, instead of only the generic change feed
-- (measured at 1.3-5.4 s for a match, against 0.8-1.4 s for this channel).
begin;
create function private.notify_match_participants() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- profile_a < profile_b: one global order keeps concurrent likes deadlock-free.
  -- The signal carries no match, peer or reason; each room rereads its own state.
  perform private.invalidate_participant(new.profile_a);
  perform private.invalidate_participant(new.profile_b);
  return new;
end $$;
revoke all on function private.notify_match_participants() from public,anon,authenticated,service_role;
create trigger z90_match_participant_after after insert on public.matches
for each row execute function private.notify_match_participants();
commit;
