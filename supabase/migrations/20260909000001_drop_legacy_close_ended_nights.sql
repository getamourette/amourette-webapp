-- #50: scheduled venue nights replaced the legacy 06:00-local rollover.
-- Remove the unused administrative entry point so it cannot bypass the current
-- lifecycle. Keep the existing cron job, lifecycle functions and data intact.
do $$
begin
  if not exists (
    select 1 from cron.job
    where jobname = 'bartap-close-ended-nights'
      and active
      and schedule = '* * * * *'
      and command = 'select public.run_venue_night_lifecycle();'
  ) then
    raise exception 'Expected the active one-minute scheduled-night lifecycle job before removing legacy rollover';
  end if;

  if exists (
    select 1 from cron.job
    where command ilike '%close_ended_nights%'
  ) then
    raise exception 'A cron command still references close_ended_nights';
  end if;
end;
$$;

-- RESTRICT refuses removal if a database object still depends on this function.
drop function if exists public.close_ended_nights() restrict;
