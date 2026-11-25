-- #388: keep the promise made to guests in the reservation privacy notice
-- (lib/booking-privacy.ts, since #354): "the gender given at reservation is
-- erased from the reservation record 30 days after the evening ends".
--
-- The value is cleared, never the column: the column, its check constraint and
-- every function that reads it stay as they are, so the code already live keeps
-- working. The founder totals then count an erased answer as "unspecified",
-- which the night page already shows as "Not recorded".
--
-- The evening ends at the earlier of its scheduled close and its terminal
-- transition (ended early, cancelled). The scheduled close is frozen once
-- registration opens (private.launch_night_guard) and is authoritative even if
-- the lifecycle job has not recorded the terminal transition yet, so an answer
-- is never kept longer than promised. Only the gender changes: state, payment,
-- refund, arrival and audit records are untouched (their retention is a
-- separate decision, docs/launch-reservation-policy.md).
create function private.erase_launch_reservation_gender() returns integer
language plpgsql security definer set search_path = '' as $$
declare erased integer;
begin
  update private.launch_reservations r set gender = null
    from public.venue_nights n
    where n.id = r.night_id and r.gender is not null
      and least(n.closes_at, n.terminal_at) <= clock_timestamp() - interval '30 days';
  get diagnostics erased = row_count;
  return erased;
end $$;
revoke all on function private.erase_launch_reservation_gender() from public, anon, authenticated, service_role;

-- Hourly, so an answer outlives the 30 days by less than an hour. A run with
-- nothing due writes no row; cron.job_run_details stays bounded by
-- amourette-cron-history-retention.
select cron.schedule('amourette-launch-gender-erasure', '23 * * * *', $$select private.erase_launch_reservation_gender();$$);
