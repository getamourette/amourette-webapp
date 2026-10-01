-- #257. Preserve the existing authorization error contract for late writes.
create or replace function private.guard_stats_interaction() returns trigger
language plpgsql security definer set search_path=public,private as $$
declare night_id uuid;
begin
 if tg_table_name='messages' then
   select venue_night_id into night_id from public.matches where id=new.match_id;
 else night_id:=new.venue_night_id; end if;
 if not private.lock_stats_night(night_id) then
   raise exception 'venue night ended' using errcode='42501';
 end if;
 return new;
end;
$$;
revoke all on function private.guard_stats_interaction() from public,anon,authenticated,service_role;
