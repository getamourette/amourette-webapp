-- Bloc 1 — night rollover. The "room of tonight" ends at a fixed local hour
-- (06:00 in the venue's timezone, see docs/decisions.md, 2026-06-19): a cron
-- closes every presence whose night has passed that boundary. This is what
-- empties the room for good — there is no short heartbeat timeout by design.

-- ---------------------------------------------------------------------------
-- close_ended_nights() — set left_at on every active presence that has passed
-- the first 06:00 local strictly after its check-in. Handles after-midnight
-- check-ins (02:00 still belongs to the night that ends that same morning at
-- 06:00). SECURITY DEFINER, run only by the cron job (not reachable by clients).
-- ---------------------------------------------------------------------------
create or replace function public.close_ended_nights()
  returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  closed integer;
begin
  update public.presence p
    set left_at = now()
    from public.venues v
    where p.venue_id = v.id
      and p.left_at is null
      and (now() at time zone v.timezone) >= (
        case
          when (p.checked_in_at at time zone v.timezone)
               < date_trunc('day', p.checked_in_at at time zone v.timezone) + interval '6 hours'
          then date_trunc('day', p.checked_in_at at time zone v.timezone) + interval '6 hours'
          else date_trunc('day', p.checked_in_at at time zone v.timezone) + interval '1 day' + interval '6 hours'
        end
      );
  get diagnostics closed = row_count;
  return closed;
end;
$$;

revoke execute on function public.close_ended_nights() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Schedule it every 15 minutes. cron.schedule upserts by job name, so re-runs
-- are safe. The 15-min cadence means presence is closed within 15 min of the
-- local 06:00 boundary — fine for a room people have long since left.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule(
  'bartap-close-ended-nights',
  '*/15 * * * *',
  $$select public.close_ended_nights();$$
);
