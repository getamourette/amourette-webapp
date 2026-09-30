-- #232: invalidate founder views without transmitting report rows or identities.
-- Requires founder approval before application to the shared development DB.
create or replace function private.notify_moderation_queue()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform realtime.send('{"version":1}'::jsonb, 'queue_changed', 'founder-moderation', true);
  return null;
exception when others then
  -- Notification failure must never prevent a safety report or founder action.
  -- The visible-tab fallback reads recover it; do not log report/exception data.
  return null;
end;
$$;
revoke all on function private.notify_moderation_queue() from public, anon, authenticated;

create trigger reports_notify_moderation_queue
after insert or update or delete on public.reports
for each statement execute function private.notify_moderation_queue();

create trigger cases_notify_moderation_queue
after insert or update or delete on public.moderation_cases
for each statement execute function private.notify_moderation_queue();

grant select on realtime.messages to authenticated;
create policy founder_moderation_receive on realtime.messages
for select to authenticated
using (
  topic = 'founder-moderation'
  and realtime.topic() = 'founder-moderation'
  and extension = 'broadcast'
  and private.is_admin()
);

-- Keep this reserved topic protected even if another feature adds broad policies.
create policy founder_moderation_receive_guard on realtime.messages
as restrictive for select to authenticated
using (topic <> 'founder-moderation' or (extension = 'broadcast' and private.is_admin()));

-- Only the database emits invalidations; founders and participants cannot forge them.
create policy founder_moderation_send_guard on realtime.messages
as restrictive for insert to authenticated
with check (topic <> 'founder-moderation');
