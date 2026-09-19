-- #198: founder-only feedback from a participant currently at a venue.
create table public.venue_feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  venue_night_id uuid not null references public.venue_nights(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint venue_feedback_once_per_night unique (profile_id, venue_night_id),
  constraint venue_feedback_body_valid check (private.valid_input_text(body, 500, true) and body = private.trim_input(body))
);

create index venue_feedback_recent on public.venue_feedback (created_at desc);
alter table public.venue_feedback enable row level security;
revoke all on public.venue_feedback from public, anon, authenticated;
grant select on public.venue_feedback to authenticated;
grant insert, select on public.venue_feedback to service_role;

-- Stored feedback is founder-only. Participants use the boolean RPC below to
-- suppress repeat prompts without receiving the stored body or row metadata.
create policy venue_feedback_read on public.venue_feedback for select to authenticated
  using (private.is_admin());

create or replace function public.has_submitted_venue_feedback(p_venue_night_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to check feedback status.' using errcode = '42501';
  end if;
  if p_venue_night_id is null then
    raise exception 'Venue night is required.' using errcode = '22023';
  end if;
  return exists (
    select 1 from public.venue_feedback feedback
    where feedback.profile_id = auth.uid()
      and feedback.venue_night_id = p_venue_night_id
  );
end;
$$;

revoke execute on function public.has_submitted_venue_feedback(uuid) from public, anon;
grant execute on function public.has_submitted_venue_feedback(uuid) to authenticated;

create or replace function public.submit_venue_feedback(p_presence_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  active_presence public.presence%rowtype;
  result_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to submit feedback.' using errcode = '42501';
  end if;
  if p_presence_id is null or not private.valid_input_text(p_body, 500, true) then
    raise exception 'Feedback must be between 1 and 500 characters.' using errcode = '22023';
  end if;

  select p.* into active_presence
  from public.presence p
  join public.venue_nights vn on vn.id = p.venue_night_id
  where p.id = p_presence_id and p.profile_id = auth.uid() and p.left_at is null
    and vn.terminal_at is null and now() < vn.closes_at
    and vn.status in ('waiting', 'live')
  for update of p;
  if not found then
    raise exception 'You must be checked in to submit feedback.' using errcode = '42501';
  end if;

  insert into public.venue_feedback (profile_id, venue_night_id, body)
  values (auth.uid(), active_presence.venue_night_id, private.trim_input(p_body))
  returning id into result_id;
  return result_id;
exception when unique_violation then
  raise exception 'You have already shared feedback for this night.' using errcode = '23505';
end;
$$;

revoke execute on function public.submit_venue_feedback(uuid, text) from public, anon;
grant execute on function public.submit_venue_feedback(uuid, text) to authenticated;
