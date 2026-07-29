-- Individual report rows need individual review state. User restrictions remain
-- case-level because they apply to the reported person for the venue night.

alter table public.reports
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

create or replace function public.review_report(p_report_id uuid)
  returns void language plpgsql security definer set search_path=public,private
as $$
declare target_case_id uuid;
begin
  if not private.is_admin() then raise exception 'not authorized'; end if;
  update public.reports set reviewed_at=now(), reviewed_by=auth.uid()
    where id=p_report_id returning case_id into target_case_id;
  if not found then raise exception 'report not found'; end if;
  if target_case_id is not null and not exists (
    select 1 from public.reports where case_id=target_case_id and reviewed_at is null
  ) then
    update public.moderation_cases set status='reviewed', action_expires_at=null,
      reviewed_at=now(), reviewed_by=auth.uid(), updated_at=now()
      where id=target_case_id and status='pending_review';
  end if;
end;
$$;

revoke execute on function public.review_report(uuid) from anon,public;
grant execute on function public.review_report(uuid) to authenticated;
