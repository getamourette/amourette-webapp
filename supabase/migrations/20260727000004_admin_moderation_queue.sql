-- Deterministic founder moderation queue. The score is explainable, uses only
-- report metadata, and never inspects message content.

create or replace function public.admin_moderation_queue()
returns table (
  report_id uuid,
  total_reports bigint,
  unique_reporters bigint,
  reporter_activity bigint,
  priority_score integer,
  priority_reason text,
  is_handled boolean,
  handled_at timestamptz
)
language plpgsql security definer stable set search_path=public,private
as $$
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  return query
  with report_context as (
    select
      r.id,
      r.reporter_id,
      r.reported_id,
      r.venue_night_id,
      r.reason,
      r.created_at,
      r.reviewed_at,
      mc.status as case_status,
      mc.updated_at as case_updated_at
    from public.reports r
    left join public.moderation_cases mc on mc.id=r.case_id
  ), reported_stats as (
    select reported_id,venue_night_id,count(*) as received_count,
      count(distinct reporter_id) as unique_count,
      count(*) filter(where created_at>=now()-interval '30 minutes') as burst_count
    from public.reports group by reported_id,venue_night_id
  ), reporter_stats as (
    select reporter_id,venue_night_id,count(*) as submitted_count
    from public.reports group by reporter_id,venue_night_id
  )
  select
    rc.id,
    rs.received_count,
    rs.unique_count,
    submit.submitted_count,
    (
      case rc.reason when 'underage' then 1000 when 'unsafe_behavior' then 300 when 'harassment' then 200 else 0 end
      + greatest(rs.unique_count-1,0)*250
      + rs.received_count*20
      + rs.burst_count*50
      + greatest(0,120-floor(extract(epoch from (now()-rc.created_at))/60)::integer)
    )::integer,
    case
      when rc.reason='underage' then 'Underage concern'
      when rs.unique_count>1 then 'Reported by '||rs.unique_count||' people'
      when rs.burst_count>=3 then rs.burst_count||' reports in 30 minutes'
      when rc.created_at>=now()-interval '1 hour' then 'New report'
      when rc.reason='unsafe_behavior' then 'Unsafe behavior'
      else 'Single report'
    end,
    rc.reviewed_at is not null or coalesce(rc.case_status,'pending_review')<>'pending_review',
    case
      when rc.reviewed_at is not null then rc.reviewed_at
      when coalesce(rc.case_status,'pending_review')<>'pending_review' then rc.case_updated_at
      else null
    end
  from report_context rc
  join reported_stats rs on rs.reported_id=rc.reported_id
    and rs.venue_night_id is not distinct from rc.venue_night_id
  join reporter_stats submit on submit.reporter_id=rc.reporter_id
    and submit.venue_night_id is not distinct from rc.venue_night_id;
end;
$$;

revoke execute on function public.admin_moderation_queue() from anon,public;
grant execute on function public.admin_moderation_queue() to authenticated;
