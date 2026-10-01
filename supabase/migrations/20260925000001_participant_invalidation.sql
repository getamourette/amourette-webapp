-- #195. Prepare only: founder approval is required before shared application.
begin;
-- The revision is private recovery state, not an event history or a change count.
create table private.participant_revisions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  revision uuid not null default gen_random_uuid(),
  transaction_id bigint not null
);
alter table private.participant_revisions enable row level security;
revoke all on private.participant_revisions from public, anon, authenticated, service_role;

create function public.my_participant_revision() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  return (select r.revision from private.participant_revisions r where r.profile_id=auth.uid());
end $$;
revoke all on function public.my_participant_revision() from public,anon,authenticated,service_role;
grant execute on function public.my_participant_revision() to authenticated;

create function private.invalidate_participant(p_recipient uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- BEFORE/AFTER audiences and overlapping changes earn only one signal per
  -- recipient and transaction. Rollback removes both revision and notification.
  insert into private.participant_revisions(profile_id,transaction_id)
    select p_recipient,txid_current() where exists(select 1 from public.profiles where id=p_recipient)
    on conflict(profile_id) do update set revision=gen_random_uuid(),transaction_id=excluded.transaction_id
    where participant_revisions.transaction_id<>excluded.transaction_id;
  if not found then return; end if;
  -- Never include a subject, match, reason, old/new values or revision in a signal.
  -- The durable revision still recovers delivery failures, including send()'s
  -- own swallowed errors. No application logging of mutation/exception data.
  begin
    perform realtime.send('{"version":1}'::jsonb,'state_changed','participant:' || p_recipient::text,true);
  exception when others then null;
  end;
end $$;
revoke all on function private.invalidate_participant(uuid) from public,anon,authenticated,service_role;

create function private.invalidate_profile_audience(p_subject uuid, p_content boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  -- Scope by active night before evaluating eligibility; never scan every profile.
  -- Invoked BEFORE and AFTER writes: removed AND newly eligible viewers converge.
  for recipient in
    with scoped as materialized (
      select theirs.profile_id,n.id as night_id from public.presence mine
      join public.venue_nights n on n.id=mine.venue_night_id
      join public.presence theirs on theirs.venue_night_id=mine.venue_night_id
      where mine.profile_id=p_subject and mine.left_at is null and mine.is_visible
        and theirs.left_at is null and theirs.is_visible and theirs.profile_id<>p_subject
        and n.status='live' and n.terminal_at is null and n.closes_at>clock_timestamp()
    )
    select p_subject
    union
    select profile_id from scoped where private.like_pair_eligible(p_subject,profile_id,night_id)
    union
    select case when m.profile_a=p_subject then m.profile_b else m.profile_a end
      from public.matches m join public.venue_nights n on n.id=m.venue_night_id
      where p_content and p_subject in (m.profile_a,m.profile_b)
        and m.expires_at>clock_timestamp() and n.status='live' and n.terminal_at is null and n.closes_at>clock_timestamp()
        and not exists(select 1 from public.blocks b where
          (b.blocker_id=m.profile_a and b.blocked_id=m.profile_b) or
          (b.blocker_id=m.profile_b and b.blocked_id=m.profile_a))
    order by 1
  loop perform private.invalidate_participant(recipient); end loop;
end $$;
revoke all on function private.invalidate_profile_audience(uuid,boolean) from public,anon,authenticated,service_role;

create function private.invalidate_preference_audience(p_subject uuid,p_old_gender text,p_old_interests text[],p_new_gender text,p_new_interests text[]) returns void
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  for recipient in
    with scoped as materialized (
      select theirs.profile_id,n.id as night_id from public.presence mine
      join public.venue_nights n on n.id=mine.venue_night_id
      join public.presence theirs on theirs.venue_night_id=mine.venue_night_id
      join public.profiles peer on peer.id=theirs.profile_id
      where mine.profile_id=p_subject and mine.left_at is null and mine.is_visible
        and theirs.left_at is null and theirs.is_visible and theirs.profile_id<>p_subject
        and n.status='live' and n.terminal_at is null and n.closes_at>clock_timestamp()
        and (p_old_gender=any(peer.interested_in) and peer.gender=any(p_old_interests))
          is distinct from (p_new_gender=any(peer.interested_in) and peer.gender=any(p_new_interests))
    )
    select p_subject union
    select profile_id from scoped where private.like_pair_eligible(p_subject,profile_id,night_id)
    order by 1
  loop perform private.invalidate_participant(recipient); end loop;
end $$;
revoke all on function private.invalidate_preference_audience(uuid,text,text[],text,text[]) from public,anon,authenticated,service_role;

create function private.notify_participant_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare subject uuid; content_changed boolean:=false;
begin
  if tg_table_name='profiles' then
    if tg_op='UPDATE' then
      content_changed:=row(old.first_name,old.bio,old.photo_url) is distinct from row(new.first_name,new.bio,new.photo_url);
      if not content_changed and old.gender is not distinct from new.gender
        and old.interested_in @> new.interested_in and new.interested_in @> old.interested_in then return new; end if;
      if not content_changed then
        perform private.invalidate_preference_audience(new.id,old.gender,old.interested_in,new.gender,new.interested_in);
        return new;
      end if;
    else content_changed:=true;
    end if;
    subject:=coalesce(new.id,old.id);
  elsif tg_table_name='blocks' then
    if tg_op='UPDATE' and row(old.blocker_id,old.blocked_id) is not distinct from row(new.blocker_id,new.blocked_id) then return new; end if;
    -- Includes the recipient whose former match may already have been deleted.
    if tg_op<>'INSERT' then
      perform private.invalidate_participant(old.blocker_id); perform private.invalidate_participant(old.blocked_id);
    end if;
    if tg_op<>'DELETE' then
      perform private.invalidate_participant(new.blocker_id); perform private.invalidate_participant(new.blocked_id);
    end if;
    return coalesce(new,old);
  elsif tg_table_name='name_corrections' then
    -- Pending proposals and refusals invalidate only the owner. Approval also
    -- updates profiles, which independently signals currently authorized viewers.
    perform private.invalidate_participant(coalesce(new.profile_id,old.profile_id));
    return coalesce(new,old);
  elsif tg_table_name='photo_state' then
    subject:=coalesce(new.profile_id,old.profile_id);
    if tg_op='UPDATE' and row(old.displayed_id,old.correction_required) is not distinct from row(new.displayed_id,new.correction_required) then
      if old is distinct from new then perform private.invalidate_participant(subject); end if;
      return new;
    end if;
    content_changed:=true;
  elsif tg_table_name='presence' then
    if tg_op='UPDATE' and row(old.profile_id,old.venue_night_id,old.is_visible,old.left_at)
      is not distinct from row(new.profile_id,new.venue_night_id,new.is_visible,new.left_at) then return new; end if;
    subject:=coalesce(new.profile_id,old.profile_id);
    content_changed:=true; -- chat co-presence changes even when discovery is hidden
  else -- ejection/restoration, including privileged deletion
    if tg_op='UPDATE' and old is not distinct from new then return new; end if;
    subject:=coalesce(new.profile_id,old.profile_id);
    content_changed:=true;
  end if;
  if tg_when='BEFORE' and tg_op<>'INSERT' and tg_table_name not in ('profiles') then
    subject:=old.profile_id;
  end if;
  perform private.invalidate_profile_audience(subject,content_changed);
  return coalesce(new,old);
end $$;
revoke all on function private.notify_participant_change() from public,anon,authenticated,service_role;

-- Existing #231 locks protect eligibility mutations before row locks. Content
-- updates must use the same ordering while collecting the authorized audience.
create trigger aaa_participant_content_lock before update of first_name,bio,photo_url on public.profiles
for each statement execute function private.before_like_eligibility_change();

do $$
declare tbl text;
begin
  foreach tbl in array array['profiles','blocks','photo_state','presence','venue_ejections'] loop
    execute format('create trigger a90_participant_before before insert or update or delete on public.%I for each row execute function private.notify_participant_change()',tbl);
    execute format('create trigger z90_participant_after after insert or update or delete on public.%I for each row execute function private.notify_participant_change()',tbl);
  end loop;
end $$;
create trigger name_correction_participant after insert or update on private.name_corrections
for each row execute function private.notify_participant_change();

-- These owner RPCs previously needed only a profile lock. Revisions now share
-- recipient rows with eligibility writers, so acquire the existing barrier first.
do $$
declare fn regprocedure; definition text; patched text;
begin
  foreach fn in array array['public.submit_name_correction(uuid,text)'::regprocedure,'public.cancel_name_correction(uuid)'::regprocedure] loop
    definition:=pg_get_functiondef(fn);
    patched:=replace(definition,'perform 1 from public.profiles',E'perform private.lock_like_eligibility();\n  perform 1 from public.profiles');
    if patched=definition then
      patched:=replace(definition,'select first_name into current_name from public.profiles',E'perform private.lock_like_eligibility();\n  select first_name into current_name from public.profiles');
    end if;
    if patched=definition then raise exception 'name correction locking requires review'; end if;
    execute patched;
  end loop;
end $$;

grant select on realtime.messages to authenticated;
create policy participant_receive on realtime.messages for select to authenticated
using (extension='broadcast' and topic='participant:' || (select auth.uid())::text and realtime.topic()=topic);
-- Reserve the entire namespace against future broad allow policies.
create policy participant_receive_guard on realtime.messages as restrictive for select to authenticated
using (topic not like 'participant:%' or
  (extension='broadcast' and topic='participant:' || (select auth.uid())::text and realtime.topic()=topic));
create policy participant_send_guard on realtime.messages as restrictive for insert to authenticated
with check (topic not like 'participant:%');

-- Keep legacy photo/public-state notifications during the deployment overlap.
-- New clients use the private revision and do not refetch feeds for those signals.
-- Photo variants/crops can change without replacing displayed_id. Extend the
-- existing notification entry point without replacing another branch's photo SQL.
do $$
declare definition text; patched text;
begin
  definition:=pg_get_functiondef('private.notify_photo_change(uuid)'::regprocedure);
  patched:=regexp_replace(definition,E'(\nbegin\n)',E'\nbegin\n  perform private.invalidate_profile_audience(p_profile_id,true);\n','i');
  if patched=definition then raise exception 'photo notification definition requires review'; end if;
  execute patched;
end $$;

commit;
