-- #77: align input constraints without rewriting historical participant content.
-- Apply atomically only after the documented preflight. Existing invalid rows
-- abort this migration; never leave safety updates blocked by unvalidated checks.
create or replace function private.trim_input(value text)
returns text language sql immutable strict set search_path = '' as $$
  select btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;

create or replace function private.valid_input_text(value text, maximum integer, required boolean)
returns boolean language sql immutable set search_path = '' as $$
  select case when value is null then not required else
    octet_length(value) <= 16384 and length(private.trim_input(value)) <= maximum
    and (not required or length(private.trim_input(value)) > 0) end;
$$;

create or replace function private.valid_interests(value text[])
returns boolean language sql immutable set search_path = '' as $$
  select case when array_ndims(value) is distinct from 1 then false else coalesce(cardinality(value) between 1 and 3
    and value <@ array['woman','man','nonbinary']::text[]
    and array_position(value, null) is null
    and cardinality(value) = (select count(distinct item) from unnest(value) item), false) end;
$$;

create or replace function private.valid_marketing_email(value text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare email text := lower(private.trim_input(value) collate "C"); local_part text; domain text; labels text[]; label text;
begin
  if value is null or octet_length(value)>16384 or octet_length(email)>254
    or private.trim_input(value) collate "C" !~ '^[!-~]+$' or length(email)-length(replace(email,'@',''))<>1 then return false; end if;
  local_part:=split_part(email,'@',1); domain:=split_part(email,'@',2);
  if length(local_part)>64 or local_part collate "C" !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~-]+([.][a-z0-9!#$%&''*+/=?^_`{|}~-]+)*$' then return false; end if;
  labels:=string_to_array(domain,'.');
  if cardinality(labels)<2 or labels[cardinality(labels)] ~ '^[0-9]+$' then return false; end if;
  foreach label in array labels loop
    if label collate "C" !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then return false; end if;
  end loop;
  return true;
end;
$$;

-- Runs before existing workflow triggers: reject raw padding before trimming.
create or replace function private.normalize_profile_inputs()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.valid_input_text(new.first_name,30,true) or not private.valid_input_text(new.bio,500,false)
    or not private.valid_interests(new.interested_in) then raise exception 'invalid profile input' using errcode='23514'; end if;
  new.first_name:=private.trim_input(new.first_name);
  new.bio:=nullif(private.trim_input(new.bio),'');
  return new;
end;
$$;
create trigger a00_validate_profile_inputs before insert or update of first_name,bio,interested_in on public.profiles
for each row execute function private.normalize_profile_inputs();

create or replace function private.normalize_message_input()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.valid_input_text(new.body,2000,true) then raise exception 'invalid message body' using errcode='23514'; end if;
  new.body:=private.trim_input(new.body); return new;
end;
$$;
create trigger a00_validate_message_input before insert or update of body on public.messages
for each row execute function private.normalize_message_input();

create or replace function private.normalize_safety_note()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.valid_input_text(new.note,500,false) then raise exception 'invalid safety note' using errcode='23514'; end if;
  new.note:=nullif(private.trim_input(new.note),''); return new;
end;
$$;
create trigger a00_validate_report_note before insert or update of note on public.reports for each row execute function private.normalize_safety_note();
create trigger a00_validate_block_note before insert or update of note on public.blocks for each row execute function private.normalize_safety_note();
create trigger a00_validate_ejection_note before insert or update of note on public.venue_ejections for each row execute function private.normalize_safety_note();

create or replace function private.normalize_venue_input()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.valid_input_text(new.name,120,true) then raise exception 'invalid venue name' using errcode='23514'; end if;
  new.name:=private.trim_input(new.name); return new;
end;
$$;
create trigger a00_validate_venue_input before insert or update of name on public.venues for each row execute function private.normalize_venue_input();

alter table public.profiles drop constraint profiles_first_name_check,
  add constraint profiles_first_name_check check (private.valid_input_text(first_name,30,true) and first_name=private.trim_input(first_name)),
  drop constraint profiles_bio_check,
  add constraint profiles_bio_check check (bio is null or (private.valid_input_text(bio,500,true) and bio=private.trim_input(bio))),
  drop constraint profiles_interested_in_check,
  add constraint profiles_interested_in_check check (private.valid_interests(interested_in));
alter table public.messages drop constraint messages_body_check,
  add constraint messages_body_check check (private.valid_input_text(body,2000,true) and body=private.trim_input(body));
alter table public.reports add constraint reports_note_contract check (note is null or (private.valid_input_text(note,500,true) and note=private.trim_input(note))),
  add constraint reports_other_note_required check (reason <> 'other' or note is not null);
alter table public.blocks add constraint blocks_note_contract check (note is null or (private.valid_input_text(note,500,true) and note=private.trim_input(note)));
alter table public.venue_ejections add constraint venue_ejections_note_contract check (note is null or (private.valid_input_text(note,500,true) and note=private.trim_input(note)));
alter table public.venues add constraint venues_name_contract check (private.valid_input_text(name,120,true) and name=private.trim_input(name)),
  add constraint venues_slug_contract check (slug collate "C" ~ '^[a-z0-9-]{1,80}$'),
  add constraint venues_rollout_location check (city is not null and ((city='Paris' and timezone='Europe/Paris') or (city='New York' and timezone='America/New_York')));
alter table public.venue_nights add constraint venue_nights_finite_schedule check (isfinite(waiting_opens_at) and isfinite(guaranteed_launch_at) and isfinite(closes_at));
alter table public.email_subscriptions drop constraint email_subscriptions_email_normalized,
  add constraint email_subscriptions_email_normalized check (private.valid_marketing_email(email) and email=lower(private.trim_input(email) collate "C")),
  add constraint email_subscriptions_consent_contract check (consent_version = case source
    when 'landing' then '2026-07-24' when 'subscription_management' then 'email-preferences-v1'
    else 'global-live-night-email-v1' end);

-- Helpers are private-schema implementation details, not PostgREST RPCs.
revoke all on function private.trim_input(text), private.valid_input_text(text,integer,boolean), private.valid_interests(text[]), private.valid_marketing_email(text),
  private.normalize_profile_inputs(), private.normalize_message_input(), private.normalize_safety_note(), private.normalize_venue_input() from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.trim_input(text), private.valid_input_text(text,integer,boolean), private.valid_interests(text[]), private.valid_marketing_email(text) to authenticated, service_role;
