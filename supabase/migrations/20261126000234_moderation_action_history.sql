-- #234: every founder moderation action leaves an attributable, append-only event.
--
-- Until now a removal lived only in public.venue_ejections, which a restore
-- deletes and the night's terminal transition deletes with the night's other
-- interactions, and a case decision overwrote the case row in place. After a
-- night nothing showed who was removed, when, by whom, or that access was given
-- back. Each command below now writes its event in its own transaction: a
-- refused or failed command leaves no event. The terminal cleanup is unchanged
-- and never touches this table.
--
-- Data kept: references (target profile, night, case, report, founder), the
-- action, the reason category and the time. No founder note, report note,
-- message, photo or preference, and never the reporter. References are plain
-- uuids without foreign keys so a later profile, venue or night deletion does
-- not erase the trail; the readable labels come from live rows at read time.
-- No automatic expiry yet: the retention period is an open founder decision
-- (docs/decisions/2026-11-25-moderation-action-history.md).
create table private.moderation_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  action text not null check (action in ('removed_for_night','access_restored','case_reviewed','case_reopened','report_reviewed')),
  actor_id uuid not null,
  target_profile_id uuid,
  venue_night_id uuid,
  case_id uuid,
  report_id uuid,
  reason text check (reason in ('harassment','fake_profile','underage','unsafe_behavior','other')),
  constraint moderation_events_target check (action = 'report_reviewed' or (target_profile_id is not null and venue_night_id is not null)),
  constraint moderation_events_removal_reason check ((action = 'removed_for_night') = (reason is not null)),
  constraint moderation_events_report check (action <> 'report_reviewed' or report_id is not null)
);
create index moderation_events_target on private.moderation_events (target_profile_id, venue_night_id, id);
create index moderation_events_night on private.moderation_events (venue_night_id, id);

-- No API role reaches the table: commands write it as their owner, founders read
-- it through admin_moderation_history().
alter table private.moderation_events enable row level security;
revoke all on private.moderation_events from public, anon, authenticated, service_role;

-- Append-only even for a future function written by mistake. A retention purge,
-- once decided, replaces this function to let expired rows go.
create function private.refuse_moderation_event_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'moderation history is append-only';
end;
$$;
revoke execute on function private.refuse_moderation_event_change() from public, anon, authenticated;
create trigger moderation_events_append_only before update or delete on private.moderation_events
  for each row execute function private.refuse_moderation_event_change();
create trigger moderation_events_no_truncate before truncate on private.moderation_events
  for each statement execute function private.refuse_moderation_event_change();

-- Door screen (#513) and any direct founder removal.
create or replace function public.eject_from_venue(p_profile_id uuid,p_venue_id uuid,p_reason text,p_note text default null)
returns integer language plpgsql security definer set search_path=public,private as $$
declare night_id uuid; closed_count integer;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  if p_profile_id is null or p_venue_id is null then raise exception 'ejection target and venue are required'; end if;
  if p_reason is null or p_reason not in ('harassment','fake_profile','underage','unsafe_behavior','other') then raise exception 'invalid ejection reason'; end if;
  if not private.valid_input_text(p_note,500,false) then raise exception 'invalid safety note'; end if;
  select id into night_id from public.venue_nights where venue_id=p_venue_id and terminal_at is null
    and status in ('waiting','live') and now()<closes_at for update;
  if night_id is null then raise exception 'no active venue night'; end if;
  insert into public.venue_ejections(profile_id,venue_id,venue_night_id,night,reason,note,created_by)
  select p_profile_id,p_venue_id,night_id,(vn.closes_at at time zone v.timezone)::date,p_reason,
    nullif(private.trim_input(coalesce(p_note,'')),''),auth.uid()
  from public.venue_nights vn join public.venues v on v.id=vn.venue_id where vn.id=night_id
  on conflict(profile_id,venue_night_id) do update set reason=excluded.reason,note=excluded.note,created_by=excluded.created_by,created_at=now();
  insert into private.moderation_events(action,actor_id,target_profile_id,venue_night_id,reason)
  values('removed_for_night',auth.uid(),p_profile_id,night_id,p_reason);
  update public.presence set left_at=now() where profile_id=p_profile_id and venue_night_id=night_id and left_at is null;
  get diagnostics closed_count=row_count; return closed_count;
end;
$$;

-- Direct restore: an event only when a removal was actually lifted.
create or replace function public.restore_to_venue(p_profile_id uuid,p_venue_id uuid)
  returns void language plpgsql security definer set search_path=public,private
as $$
declare night_id uuid;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  select id into night_id from public.venue_nights where venue_id=p_venue_id and terminal_at is null
    and status in ('waiting','live') and now()<closes_at;
  if night_id is null then raise exception 'no active venue night'; end if;
  delete from public.venue_ejections where profile_id=p_profile_id and venue_night_id=night_id;
  if found then
    insert into private.moderation_events(action,actor_id,target_profile_id,venue_night_id)
    values('access_restored',auth.uid(),p_profile_id,night_id);
  end if;
end;
$$;

-- Moderation queue case actions.
create or replace function public.moderate_case(p_case_id uuid, p_action text)
returns void language plpgsql security definer set search_path=public,private
as $$
declare
  target public.moderation_cases;
  target_venue_id uuid;
  top_reason text;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  if p_case_id is null then raise exception 'moderation case is required'; end if;
  if p_action is null or p_action not in ('review','remove_for_night','restore') then
    raise exception 'invalid moderation action';
  end if;
  select * into target from public.moderation_cases where id=p_case_id for update;
  if not found then raise exception 'moderation case not found'; end if;

  if p_action='review' then
    update public.moderation_cases set status='reviewed',action_expires_at=null,
      reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=target.id;
    insert into private.moderation_events(action,actor_id,target_profile_id,venue_night_id,case_id)
    values('case_reviewed',auth.uid(),target.reported_id,target.venue_night_id,target.id);
    return;
  end if;
  if p_action='restore' then
    delete from public.venue_ejections where profile_id=target.reported_id and venue_night_id=target.venue_night_id;
    -- Without a removal to lift (already lifted, or the night ended), the action
    -- only reopens the case: say so rather than claim access was restored.
    insert into private.moderation_events(action,actor_id,target_profile_id,venue_night_id,case_id)
    values(case when found then 'access_restored' else 'case_reopened' end,auth.uid(),target.reported_id,target.venue_night_id,target.id);
    update public.moderation_cases set status='pending_review',action_expires_at=null,
      reviewed_at=null,reviewed_by=null,updated_at=now() where id=target.id;
    return;
  end if;

  select vn.venue_id into target_venue_id from public.venue_nights vn where vn.id=target.venue_night_id;
  select r.reason into top_reason from public.reports r where r.case_id=target.id
    order by case r.reason when 'underage' then 1 when 'unsafe_behavior' then 2 when 'harassment' then 3 else 4 end,
      r.created_at desc limit 1;
  insert into public.venue_ejections(profile_id,venue_id,venue_night_id,night,reason,note,created_by,expires_at)
  select target.reported_id,target_venue_id,target.venue_night_id,
    (vn.closes_at at time zone v.timezone)::date,coalesce(top_reason,'other'),
    'Admin action from moderation case',auth.uid(),null
  from public.venue_nights vn join public.venues v on v.id=vn.venue_id
  where vn.id=target.venue_night_id
  on conflict(profile_id,venue_night_id) do update set
    reason=excluded.reason,note=excluded.note,created_by=excluded.created_by,
    created_at=now(),expires_at=null;
  insert into private.moderation_events(action,actor_id,target_profile_id,venue_night_id,case_id,reason)
  values('removed_for_night',auth.uid(),target.reported_id,target.venue_night_id,target.id,coalesce(top_reason,'other'));
  update public.presence set left_at=now()
  where profile_id=target.reported_id and venue_night_id=target.venue_night_id and left_at is null;
  update public.moderation_cases set status='removed_for_night',action_expires_at=null,
    reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=target.id;
end;
$$;

-- Moderation queue "Mark reviewed" on one report; closing the case is its own event.
create or replace function public.review_report(p_report_id uuid)
  returns void language plpgsql security definer set search_path=public,private
as $$
declare target public.reports;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  update public.reports set reviewed_at=now(), reviewed_by=auth.uid()
    where id=p_report_id returning * into target;
  if not found then raise exception 'report not found'; end if;
  insert into private.moderation_events(action,actor_id,target_profile_id,venue_night_id,case_id,report_id)
  values('report_reviewed',auth.uid(),target.reported_id,target.venue_night_id,target.case_id,target.id);
  if target.case_id is not null and not exists (
    select 1 from public.reports where case_id=target.case_id and reviewed_at is null
  ) then
    update public.moderation_cases set status='reviewed', action_expires_at=null,
      reviewed_at=now(), reviewed_by=auth.uid(), updated_at=now()
      where id=target.case_id and status='pending_review';
    if found then
      insert into private.moderation_events(action,actor_id,target_profile_id,venue_night_id,case_id)
      select 'case_reviewed',auth.uid(),c.reported_id,c.venue_night_id,c.id
      from public.moderation_cases c where c.id=target.case_id;
    end if;
  end if;
end;
$$;

-- Founder-only read. Newest first, at most 200 events per read; optional filters
-- narrow it to one person and/or one night.
create function public.admin_moderation_history(p_profile_id uuid default null, p_venue_night_id uuid default null)
returns table(
  id bigint, occurred_at timestamptz, action text, reason text,
  target_profile_id uuid, target_first_name text,
  venue_night_id uuid, venue_name text, night_starts_at timestamptz,
  case_id uuid, report_id uuid, by_me boolean
)
language plpgsql stable security definer set search_path = public, private as $$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  return query
  select e.id, e.occurred_at, e.action, e.reason, e.target_profile_id, p.first_name,
    e.venue_night_id, v.name, vn.waiting_opens_at, e.case_id, e.report_id, e.actor_id = auth.uid()
  from private.moderation_events e
  left join public.profiles p on p.id = e.target_profile_id
  left join public.venue_nights vn on vn.id = e.venue_night_id
  left join public.venues v on v.id = vn.venue_id
  where (p_profile_id is null or e.target_profile_id = p_profile_id)
    and (p_venue_night_id is null or e.venue_night_id = p_venue_night_id)
  order by e.id desc
  limit 200;
end;
$$;
revoke execute on function public.admin_moderation_history(uuid, uuid) from public, anon;
grant execute on function public.admin_moderation_history(uuid, uuid) to authenticated;
