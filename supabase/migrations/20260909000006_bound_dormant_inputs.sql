-- #77: dormant public inputs still have a trust boundary.
-- Phone capture has no product writer. Preserve stored data, close new participant writes.
revoke insert, update, truncate, references, trigger on public.profile_private from authenticated, anon;
revoke insert (phone), update (phone) on public.profile_private from authenticated, anon;
grant insert (id,adult_confirmed_at), update (id,adult_confirmed_at) on public.profile_private to authenticated;
-- RLS cannot guard TRUNCATE. Only the intentional event INSERT remains available.
revoke truncate, references, trigger on public.analytics_events from authenticated, anon;

create or replace function private.valid_analytics_properties(event text, properties jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare allowed text[]; item record; value text;
begin
  if properties is null or jsonb_typeof(properties)<>'object' or octet_length(properties::text)>4096 then return false; end if;
  allowed:=case event when 'profile_viewed' then array['viewedProfileId','source']
    when 'chat_opened' then array['matchId'] when 'venue_experience_opened' then array['status']
    when 'discovery_opened' then array['visibleCount'] else array[]::text[] end;
  for item in select * from jsonb_each(properties) loop
    if not (item.key=any(allowed)) then return false; end if;
    value:=item.value #>> '{}';
    if item.key='visibleCount' then
      if jsonb_typeof(item.value)<>'number' or value !~ '^[0-9]{1,10}$' or value::numeric>2147483647 then return false; end if;
    elsif item.key in ('viewedProfileId','matchId') then
      if jsonb_typeof(item.value)<>'string' or value collate "C" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
    else
      if jsonb_typeof(item.value)<>'string' or not private.valid_input_text(value,120,true) then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;
create or replace function private.normalize_analytics_inputs()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not private.valid_input_text(new.qr_code_id,120,false) or not private.valid_input_text(new.source,120,false)
    or not private.valid_input_text(new.medium,120,false) or not private.valid_input_text(new.campaign,160,false)
    or not private.valid_input_text(new.content,160,false) or not private.valid_input_text(new.referrer,500,false)
    then raise exception 'invalid analytics acquisition input' using errcode='23514'; end if;
  new.qr_code_id:=nullif(private.trim_input(new.qr_code_id),'');
  new.source:=nullif(private.trim_input(new.source),''); new.medium:=nullif(private.trim_input(new.medium),'');
  new.campaign:=nullif(private.trim_input(new.campaign),''); new.content:=nullif(private.trim_input(new.content),'');
  new.referrer:=nullif(private.trim_input(new.referrer),''); return new;
end;
$$;
create trigger a00_validate_analytics_inputs before insert or update on public.analytics_events for each row execute function private.normalize_analytics_inputs();
alter table public.analytics_events add constraint analytics_properties_contract check(private.valid_analytics_properties(event_name,properties));
revoke all on function private.valid_analytics_properties(text,jsonb),private.normalize_analytics_inputs() from public,anon;
grant execute on function private.valid_analytics_properties(text,jsonb) to authenticated,service_role;
