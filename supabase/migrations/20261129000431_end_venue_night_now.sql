-- #431: a founder can end an opened night before its scheduled close.
-- Additive: one new function. It does not reimplement the end of a night: it
-- calls the same private transition the minute cron uses at closes_at
-- (private.transition_venue_night(..., 'ended')), so presence is closed, the
-- night report is finalized, and likes, matches (cascading messages) and
-- removals for the night are deleted exactly as at the scheduled end.
-- The transition row keeps reason 'manual' and the founder as actor, which is
-- what distinguishes an early end from the cron's 'scheduled_end'.
create function public.end_venue_night_now(p_venue_night_id uuid)
  returns public.venue_nights
  language plpgsql
  security definer
  set search_path = public, private
as $$
declare
  night public.venue_nights;
begin
  if not private.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_venue_night_id is null then raise exception 'venue night not found'; end if;
  -- Same lock order as the transition itself: eligibility barrier, then the night row.
  perform private.lock_like_eligibility();
  select * into night from public.venue_nights where id = p_venue_night_id for update;
  if not found then raise exception 'venue night not found'; end if;
  if night.terminal_at is not null then raise exception 'night has already ended'; end if;
  -- Before entry opens there is nothing to end: cancellation is the tool then.
  if night.opened_at is null then raise exception 'night has not opened'; end if;
  return private.transition_venue_night(night.id, 'ended', 'manual', auth.uid());
end;
$$;

comment on function public.end_venue_night_now(uuid) is
  'Founder command (#431): end an opened, nonterminal night now through the scheduled-end transition.';

revoke execute on function public.end_venue_night_now(uuid) from public, anon;
grant execute on function public.end_venue_night_now(uuid) to authenticated;
