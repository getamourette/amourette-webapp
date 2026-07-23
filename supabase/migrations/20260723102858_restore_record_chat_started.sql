-- Restore the chat-start analytics RPC expected by the chat client.
--
-- The original definition is tracked in
-- 20260709000002_admin_scan_completion_stats.sql, but the function is absent
-- from the shared database while the event table and related analytics objects
-- are present. Keep this repair migration focused and idempotent.

create or replace function public.record_chat_started(p_match_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  me uuid := auth.uid();
  match_venue_id uuid;
  match_night date;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select m.venue_id,
         (private.night_ends_at(now(), v.timezone))::date
    into match_venue_id, match_night
  from public.matches m
  join public.venues v on v.id = m.venue_id
  where m.id = p_match_id
    and me in (m.profile_a, m.profile_b);

  if match_venue_id is null then
    raise exception 'match not found';
  end if;

  insert into public.venue_chat_start_events (match_id, venue_id, night)
  values (p_match_id, match_venue_id, match_night)
  on conflict (match_id) do nothing;
end;
$$;

revoke execute on function public.record_chat_started(uuid) from anon, public;
grant execute on function public.record_chat_started(uuid) to authenticated;
