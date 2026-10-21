-- #330. Stop wasted Disk IO on the shared project.
-- 1. Statement triggers fired even for zero-row statements, including the FK
--    cascade/set-null statements run on reports and moderation_cases whenever a
--    user, profile, venue or night is deleted. Broadcast only when rows changed.
-- 2. cron.job_run_details was never purged; keep about a week of run history.
-- Behavioral trigger change: announce before applying to the shared database.
begin;

create or replace function private.notify_moderation_queue()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- Every trigger below names its transition table changed_rows.
  if exists (select 1 from changed_rows) then
    perform realtime.send('{"version":1}'::jsonb, 'queue_changed', 'founder-moderation', true);
  end if;
  return null;
exception when others then
  -- Notification failure must never prevent a safety report or founder action.
  -- The visible-tab fallback reads recover it; do not log report/exception data.
  return null;
end;
$$;
revoke all on function private.notify_moderation_queue() from public, anon, authenticated;

-- Transition tables require one event per trigger.
drop trigger reports_notify_moderation_queue on public.reports;
create trigger reports_notify_moderation_queue_insert
after insert on public.reports referencing new table as changed_rows
for each statement execute function private.notify_moderation_queue();
create trigger reports_notify_moderation_queue_update
after update on public.reports referencing new table as changed_rows
for each statement execute function private.notify_moderation_queue();
create trigger reports_notify_moderation_queue_delete
after delete on public.reports referencing old table as changed_rows
for each statement execute function private.notify_moderation_queue();

drop trigger cases_notify_moderation_queue on public.moderation_cases;
create trigger cases_notify_moderation_queue_insert
after insert on public.moderation_cases referencing new table as changed_rows
for each statement execute function private.notify_moderation_queue();
create trigger cases_notify_moderation_queue_update
after update on public.moderation_cases referencing new table as changed_rows
for each statement execute function private.notify_moderation_queue();
create trigger cases_notify_moderation_queue_delete
after delete on public.moderation_cases referencing old table as changed_rows
for each statement execute function private.notify_moderation_queue();

-- Runs that never started have no end_time; fall back to their start time.
select cron.schedule('amourette-cron-history-retention', '41 3 * * *',
  $$delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '7 days'$$);

commit;
