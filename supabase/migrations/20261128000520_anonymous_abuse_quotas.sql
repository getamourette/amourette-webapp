-- #376 (SEC-013): anonymous sessions are free, so every per-user limit is a limit
-- per free identity. These quotas bound what one session can make the server do,
-- without adding any step to the guest's path at the door: a guest who scans,
-- builds a profile and likes people all night stays far below each of them.
--
-- Behaviour kind (triggers on existing tables): one table, one function, two triggers.
--   1. Photo upload tickets: at most 30 per hour per account, and none while the
--      account already has 10 staging objects waiting (20 MB each at most).
--   2. Like request receipts: at most 500 per participant per night.
--   3. Analytics events: at most 120 per hour per account.

create table private.photo_upload_tickets (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);
create index photo_upload_tickets_owner_time on private.photo_upload_tickets(owner_id,created_at);
alter table private.photo_upload_tickets enable row level security;
revoke all on private.photo_upload_tickets from public,anon,authenticated,service_role;

-- Called by the upload and HEIC-preview routes before they sign an upload URL.
-- Returns false when the account is over quota; the route answers 429.
create function public.claim_photo_upload_ticket(p_owner uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_owner is null then raise exception 'invalid photo upload owner'; end if;
  -- Serializes one account's claims so two parallel requests cannot both pass.
  perform pg_advisory_xact_lock(hashtextextended('photo-upload-ticket:'||p_owner::text,0));
  -- An hour is the only window used; older rows are never needed again.
  delete from private.photo_upload_tickets where owner_id=p_owner and created_at<=clock_timestamp()-interval '1 hour';
  if (select count(*) from private.photo_upload_tickets where owner_id=p_owner)>=30 then return false; end if;
  -- Staging objects live under "<owner>/"; the scheduled collector removes
  -- abandoned ones after three hours, which frees this budget again.
  if (select count(*) from storage.objects where bucket_id='profile-photo-staging'
    and name like p_owner::text||'/%')>=10 then return false; end if;
  insert into private.photo_upload_tickets(owner_id) values(p_owner);
  return true;
end $$;
revoke all on function public.claim_photo_upload_ticket(uuid) from public,anon,authenticated;
grant execute on function public.claim_photo_upload_ticket(uuid) to service_role;

-- Each like or unlike request leaves a receipt for replay safety until the night
-- ends. A script sending fresh request ids could otherwise grow the table
-- without bound; the night's terminal cleanup deletes the receipts as before.
create function private.bound_like_request_receipts() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (select count(*) from private.like_request_receipts
    where actor_id=new.actor_id and venue_night_id=new.venue_night_id)>=500 then
    raise exception 'like request limit reached' using errcode='P0429';
  end if;
  return new;
end $$;
revoke all on function private.bound_like_request_receipts() from public,anon,authenticated,service_role;
create trigger like_request_receipts_bound before insert on private.like_request_receipts
  for each row execute function private.bound_like_request_receipts();

-- `track_analytics_event` has no participant caller today, but stays callable by
-- any session: bound it so it cannot be used to fill the table.
create function private.bound_analytics_events() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.user_id is not null and (select count(*) from public.analytics_events
    where user_id=new.user_id and occurred_at>clock_timestamp()-interval '1 hour')>=120 then
    raise exception 'analytics event limit reached' using errcode='P0429';
  end if;
  return new;
end $$;
revoke all on function private.bound_analytics_events() from public,anon,authenticated,service_role;
create trigger analytics_events_bound before insert on public.analytics_events
  for each row execute function private.bound_analytics_events();
