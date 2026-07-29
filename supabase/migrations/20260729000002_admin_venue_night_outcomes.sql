-- #131 / PR #149 — bind founder outcome metrics to the exact durable night.
-- ADDITIVE: apply to the shared development database only after founder approval.

create or replace function public.admin_venue_night_outcomes()
returns table (
  venue_night_id uuid,
  profile_completions integer,
  likes integer,
  matches integer,
  conversations integer
)
language plpgsql security definer stable set search_path=public,private
as $$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  return query
  select vn.id,
    (
      select count(distinct vse.user_id)::integer
      from public.venue_scan_events vse
      join public.profile_private pp on pp.id=vse.user_id and pp.adult_confirmed_at is not null
      where vse.venue_night_id=vn.id
    ),
    (select count(*)::integer from public.likes l where l.venue_night_id=vn.id),
    (select count(*)::integer from public.matches m where m.venue_night_id=vn.id),
    (
      select count(distinct outcome.match_id)::integer
      from (
        select vce.match_id from public.venue_conversation_events vce where vce.venue_night_id=vn.id
        union
        select vcse.match_id from public.venue_chat_start_events vcse where vcse.venue_night_id=vn.id
        union
        select msg.match_id from public.messages msg
        join public.matches m on m.id=msg.match_id where m.venue_night_id=vn.id
      ) outcome
    )
  from public.venue_nights vn;
end;
$$;

revoke execute on function public.admin_venue_night_outcomes() from anon,public;
grant execute on function public.admin_venue_night_outcomes() to authenticated;
