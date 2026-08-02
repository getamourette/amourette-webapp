-- Avoid a PL/pgSQL collision between the local venue id and venue_ejections.venue_id.

create or replace function public.moderate_case(p_case_id uuid, p_action text)
  returns void language plpgsql security definer set search_path = public, private
as $$
declare
  target public.moderation_cases;
  target_venue_id uuid;
  top_reason text;
  expiry timestamptz;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  if p_action not in ('review','suspend_30m','remove_for_night','restore') then
    raise exception 'invalid moderation action';
  end if;

  select * into target from public.moderation_cases where id = p_case_id for update;
  if not found then raise exception 'moderation case not found'; end if;
  select vn.venue_id into target_venue_id from public.venue_nights vn where vn.id = target.venue_night_id;
  select r.reason into top_reason from public.reports r where r.case_id = target.id
    order by case r.reason when 'underage' then 1 when 'unsafe_behavior' then 2 when 'harassment' then 3 else 4 end,
             r.created_at desc limit 1;

  if p_action = 'review' then
    update public.moderation_cases set status='reviewed', action_expires_at=null,
      reviewed_at=now(), reviewed_by=auth.uid(), updated_at=now() where id=target.id;
    return;
  end if;

  if p_action = 'restore' then
    delete from public.venue_ejections where profile_id=target.reported_id and venue_night_id=target.venue_night_id;
    update public.moderation_cases set status='pending_review', action_expires_at=null,
      reviewed_at=null, reviewed_by=null, updated_at=now() where id=target.id;
    return;
  end if;

  expiry := case when p_action = 'suspend_30m' then now() + interval '30 minutes' else null end;
  insert into public.venue_ejections(profile_id,venue_id,venue_night_id,night,reason,note,created_by,expires_at)
  select target.reported_id, target_venue_id, target.venue_night_id,
         (vn.closes_at at time zone v.timezone)::date, coalesce(top_reason,'other'),
         'Admin action from moderation case', auth.uid(), expiry
  from public.venue_nights vn join public.venues v on v.id=vn.venue_id
  where vn.id=target.venue_night_id
  on conflict(profile_id,venue_night_id) do update set
    reason=excluded.reason, note=excluded.note, created_by=excluded.created_by,
    created_at=now(), expires_at=excluded.expires_at;

  update public.presence set left_at=now()
  where profile_id=target.reported_id and venue_night_id=target.venue_night_id and left_at is null;
  update public.moderation_cases set
    status=case when p_action='suspend_30m' then 'suspended' else 'removed_for_night' end,
    action_expires_at=expiry, reviewed_at=now(), reviewed_by=auth.uid(), updated_at=now()
  where id=target.id;
end;
$$;

revoke execute on function public.moderate_case(uuid,text) from anon,public;
grant execute on function public.moderate_case(uuid,text) to authenticated;
