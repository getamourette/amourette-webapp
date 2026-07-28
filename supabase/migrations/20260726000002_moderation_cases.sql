-- #131 — action-oriented moderation cases and verified report submission.
--
-- BEHAVIORAL: reports must pass through submit_report(), which verifies that
-- both people participated in the same durable venue night. Admin actions are
-- recorded on one case per reported person and venue night. Apply to the shared
-- development database only after founder approval.

alter table public.reports
  add column if not exists venue_night_id uuid references public.venue_nights (id) on delete set null,
  add column if not exists interaction_evidence text,
  add column if not exists interaction_verified_at timestamptz;

alter table public.reports
  add constraint reports_interaction_evidence_check check (
    interaction_evidence is null or interaction_evidence in (
      'shared_venue_night', 'mutual_match', 'conversation_started', 'two_way_conversation'
    )
  );

-- Preserve as much context as possible for reports created before this change.
update public.reports r
set venue_night_id = (
  select vn.id
  from public.venue_nights vn
  where vn.venue_id = r.venue_id
    and r.created_at >= vn.waiting_opens_at
    and r.created_at < vn.closes_at
  order by vn.waiting_opens_at desc
  limit 1
)
where r.venue_night_id is null
  and exists (
    select 1 from public.venue_nights vn
    where vn.venue_id = r.venue_id
      and r.created_at >= vn.waiting_opens_at
      and r.created_at < vn.closes_at
  );

create unique index reports_one_per_pair_per_night
  on public.reports (reporter_id, reported_id, venue_night_id)
  where venue_night_id is not null;

create table public.moderation_cases (
  id                   uuid primary key default gen_random_uuid(),
  reported_id          uuid not null references public.profiles (id) on delete cascade,
  venue_night_id       uuid not null references public.venue_nights (id) on delete cascade,
  status               text not null default 'pending_review' check (
                         status in ('pending_review', 'suspended', 'removed_for_night', 'reviewed')
                       ),
  action_expires_at    timestamptz,
  reviewed_at          timestamptz,
  reviewed_by          uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint moderation_cases_unique unique (reported_id, venue_night_id),
  constraint moderation_cases_action_expiry check (
    (status = 'suspended' and action_expires_at is not null)
    or (status <> 'suspended' and action_expires_at is null)
  )
);

alter table public.reports
  add column if not exists case_id uuid references public.moderation_cases (id) on delete set null;

create index moderation_cases_queue
  on public.moderation_cases (status, updated_at desc);
create index reports_by_case
  on public.reports (case_id, created_at desc);

insert into public.moderation_cases (reported_id, venue_night_id, created_at, updated_at)
select r.reported_id, r.venue_night_id, min(r.created_at), max(r.created_at)
from public.reports r
where r.venue_night_id is not null
group by r.reported_id, r.venue_night_id
on conflict (reported_id, venue_night_id) do nothing;

update public.reports r
set case_id = mc.id
from public.moderation_cases mc
where r.case_id is null
  and r.reported_id = mc.reported_id
  and r.venue_night_id = mc.venue_night_id;

alter table public.moderation_cases enable row level security;
revoke all on public.moderation_cases from anon, public;
grant select on public.moderation_cases to authenticated;

create policy moderation_cases_select_admin on public.moderation_cases
  for select to authenticated using (private.is_admin());

-- Reports can no longer be inserted directly. The RPC below owns identity,
-- eligibility, duplicate prevention, and the immutable evidence snapshot.
revoke insert on public.reports from authenticated;
drop policy if exists reports_insert_own on public.reports;

create or replace function public.submit_report(
  p_reported_id uuid,
  p_venue_night_id uuid,
  p_reason text,
  p_note text default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  me uuid := auth.uid();
  report_id uuid;
  case_id uuid;
  target_venue_id uuid;
  evidence text := 'shared_venue_night';
  matched_id uuid;
  participant_senders integer;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if me = p_reported_id then raise exception 'cannot report yourself'; end if;
  if p_reason not in ('harassment','fake_profile','underage','unsafe_behavior','other') then
    raise exception 'report reason is required';
  end if;
  if p_reason = 'other' and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'a note is required for other reports';
  end if;

  select vn.venue_id into venue_id
  from public.venue_nights vn
  where vn.id = p_venue_night_id;
  if venue_id is null then raise exception 'venue night not found'; end if;

  if not exists (
    select 1 from public.presence mine
    where mine.profile_id = me and mine.venue_night_id = p_venue_night_id
  ) or not exists (
    select 1 from public.presence theirs
    where theirs.profile_id = p_reported_id and theirs.venue_night_id = p_venue_night_id
  ) then
    raise exception 'You can only report users you shared a venue night with.';
  end if;

  select m.id into matched_id
  from public.matches m
  where m.venue_night_id = p_venue_night_id
    and m.profile_a = least(me, p_reported_id)
    and m.profile_b = greatest(me, p_reported_id)
  limit 1;

  if matched_id is not null then
    evidence := 'mutual_match';
    select count(distinct msg.sender_id) into participant_senders
    from public.messages msg where msg.match_id = matched_id;
    if participant_senders >= 2 then
      evidence := 'two_way_conversation';
    elsif participant_senders = 1 then
      evidence := 'conversation_started';
    end if;
  end if;

  insert into public.moderation_cases (reported_id, venue_night_id)
  values (p_reported_id, p_venue_night_id)
  on conflict (reported_id, venue_night_id) do update
    set status = case
          when moderation_cases.status = 'reviewed' then 'pending_review'
          else moderation_cases.status
        end,
        reviewed_at = case when moderation_cases.status = 'reviewed' then null else moderation_cases.reviewed_at end,
        reviewed_by = case when moderation_cases.status = 'reviewed' then null else moderation_cases.reviewed_by end,
        updated_at = now()
  returning id into case_id;

  insert into public.reports (
    reporter_id, reported_id, venue_id, venue_night_id, case_id,
    reason, note, interaction_evidence, interaction_verified_at
  ) values (
    me, p_reported_id, venue_id, p_venue_night_id, case_id,
    p_reason, nullif(trim(coalesce(p_note, '')), ''), evidence, now()
  ) returning id into report_id;

  return report_id;
exception
  when unique_violation then
    raise exception 'You already reported this person for this venue night.';
end;
$$;

revoke execute on function public.submit_report(uuid, uuid, text, text) from anon, public;
grant execute on function public.submit_report(uuid, uuid, text, text) to authenticated;

alter table public.venue_ejections
  add column if not exists expires_at timestamptz;

-- Existing ejections remain full-night removals. An unexpired timestamp means a
-- temporary suspension; expired rows remain as the audit trail but stop gating.
create or replace function private.is_ejected_from_venue_night(p_venue_night_id uuid)
  returns boolean language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.venue_ejections ve
    where ve.venue_night_id = p_venue_night_id
      and ve.profile_id = auth.uid()
      and (ve.expires_at is null or ve.expires_at > now())
  )
$$;

create or replace function public.moderate_case(p_case_id uuid, p_action text)
  returns void language plpgsql security definer set search_path = public, private
as $$
declare
  target public.moderation_cases;
  venue_id uuid;
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

revoke execute on function public.moderate_case(uuid, text) from anon, public;
grant execute on function public.moderate_case(uuid, text) to authenticated;

-- check_in() owns re-entry and must ignore expired temporary suspensions.
create or replace function public.check_in(p_venue_id uuid)
  returns public.presence language plpgsql security definer set search_path=public,private
as $$
declare me uuid:=auth.uid(); night public.venue_nights; result public.presence; eligible integer;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into night from public.venue_nights where venue_id=p_venue_id and terminal_at is null
    and status in ('waiting','live') and now()<closes_at for update;
  if not found then raise exception 'venue not open'; end if;
  if not exists (select 1 from public.profiles p join public.profile_private pp on pp.id=p.id
                 where p.id=me and pp.adult_confirmed_at is not null) then
    raise exception 'complete adult-confirmed profile required';
  end if;
  if exists(select 1 from public.venue_ejections where profile_id=me and venue_night_id=night.id
    and (expires_at is null or expires_at>now())) then raise exception 'ejected from venue'; end if;
  update public.presence set left_at=now() where profile_id=me and left_at is null
    and venue_night_id<>night.id;
  update public.presence set last_seen_at=now() where profile_id=me and left_at is null
    and venue_night_id=night.id returning * into result;
  if not found then
    insert into public.presence(profile_id,venue_id,venue_night_id)
      values(me,p_venue_id,night.id) returning * into result;
  end if;
  if night.status='waiting' then
    select count(*)::integer into eligible from public.presence p
    join public.profiles pr on pr.id=p.profile_id
    join public.profile_private pp on pp.id=p.profile_id
    where p.venue_night_id=night.id and p.left_at is null and pp.adult_confirmed_at is not null;
    if eligible >= night.launch_threshold then
      perform private.transition_venue_night(night.id,'launched','threshold',null);
    end if;
  end if;
  return result;
end;
$$;

revoke execute on function public.check_in(uuid) from anon, public;
grant execute on function public.check_in(uuid) to authenticated;
