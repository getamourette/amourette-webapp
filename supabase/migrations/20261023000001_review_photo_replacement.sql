-- Reject a voluntary replacement without opening a correction cycle (#340).
begin;

create or replace function private.profile_review_snapshot(p_profile uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',p.id,
    'revision',md5(concat(r.revision,':',n.revision,':',b.revision,':',nr.id,':',br.id,':',s.revision))::uuid,
    'firstName',case when nr.id is not null then nr.proposed_name else coalesce(p.first_name,n.rejected_text) end,
    'bio',case when br.id is not null then br.proposed_text else coalesce(p.bio,b.rejected_text) end,
    'photoPath',coalesce(pv.path,dv.path,p.photo_url),
    'photoReplacement',coalesce(pv.id is not null and dv.status='approved' and not s.correction_required,false),
    'currentPhotoPath',case when pv.id is not null and dv.status='approved' and not s.correction_required then dv.path end,
    'nameRequest',nr.id,'bioRequest',br.id,'photoVersion',coalesce(pv.id,dv.id),
    'photoRevision',s.revision,'photoStatus',coalesce(pv.status,dv.status),
    'nameRevision',n.revision,'bioRevision',b.revision,
    'nameRequired',coalesce(n.required,false),'bioRequired',coalesce(b.required,false),
    'submittedAt',r.submitted_at,
    'approvedFields',to_jsonb(array_remove(array[
      case when r.approved_name_revision=n.revision and nr.id is null then 'first_name' end,
      case when r.approved_bio_revision=b.revision and br.id is null then 'bio' end,
      case when r.approved_photo_id=coalesce(pv.id,dv.id) and coalesce(pv.status,dv.status)='approved' then 'photo' end
    ],null)),
    'correction',case when r.correction_id is not null then jsonb_build_object(
      'fields',r.corrections,'original',jsonb_build_object('firstName',r.original_name,'bio',r.original_bio,'photoPath',r.original_photo_path)) end,
    'correctionId',r.correction_id,'notification',r.correction_id is not null and not r.notification_seen,
    'submittedRevision',r.submitted_revision,
    'changedFields',to_jsonb(array_remove(array[
      case when r.correction_id is not null and (not n.required or nr.id is not null) and (case when nr.id is not null then nr.proposed_name else p.first_name end) is distinct from r.original_name then 'first_name' end,
      case when r.correction_id is not null and (not b.required or br.id is not null) and (case when br.id is not null then br.proposed_text else p.bio end) is distinct from r.original_bio then 'bio' end,
      case when r.correction_id is not null and (not s.correction_required or pv.id is not null)
        and coalesce(pv.status,dv.status) in ('unverified','approved')
        and coalesce(pv.id,dv.id) is distinct from r.original_photo_id then 'photo' end
    ],null))
  )
  from public.profiles p join private.profile_reviews r on r.profile_id=p.id
  left join private.profile_text_state n on n.profile_id=p.id and n.field='first_name'
  left join private.profile_text_state b on b.profile_id=p.id and b.field='bio'
  left join lateral (select c.id,c.proposed_name from private.name_corrections c
    where c.profile_id=p.id and c.status='pending' and (not n.required or c.requirement_id=n.requirement_id)
    order by c.created_at desc,c.id desc limit 1) nr on true
  left join lateral (select c.id,c.proposed_text from private.bio_corrections c
    where c.profile_id=p.id and c.status='pending' and c.requirement_id=b.requirement_id
    order by c.created_at desc,c.id desc limit 1) br on true
  left join public.photo_state s on s.profile_id=p.id
  left join public.photo_versions dv on dv.id=s.displayed_id
  left join public.photo_versions pv on pv.id=s.pending_id
  where p.id=p_profile
$$;

revoke all on function private.profile_review_snapshot(uuid) from public,anon,authenticated,service_role;

create function public.reject_profile_photo_replacement(p_profile uuid,p_venue uuid,p_revision uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
  if not private.can_review_at_venue(p_profile,p_venue) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_profile is null or p_venue is null or p_revision is null or p_reason is null
    or p_reason not in ('face_unclear','multiple_people','not_person','sexual','violent') then
    raise exception 'invalid replacement rejection' using errcode='22023'; end if;
  perform private.lock_like_eligibility();
  perform 1 from public.profiles where id=p_profile for update;
  if not private.can_review_at_venue(p_profile,p_venue) then raise exception 'not authorized' using errcode='42501'; end if;
  snapshot:=private.profile_review_snapshot(p_profile);
  if snapshot->>'revision' is distinct from p_revision::text or private.profile_review_status(snapshot) is distinct from 'needs_review'
    or (snapshot->>'photoReplacement')::boolean is distinct from true then raise exception 'review changed' using errcode='PT409'; end if;
  perform private.decide_profile_photo_foundation(p_profile,(snapshot->>'photoVersion')::uuid,(snapshot->>'photoRevision')::integer,'rejected',p_reason);
  if exists(select 1 from public.photo_state where profile_id=p_profile and correction_required) then
    raise exception 'review changed' using errcode='PT409'; end if;
  -- A resubmitted correction cycle stays submitted: rejecting the founder-side
  -- replacement is not an owner edit and must not send it back to Awaiting changes.
  if snapshot->>'submittedRevision'=snapshot->>'revision' then
    snapshot:=private.profile_review_snapshot(p_profile);
    if private.profile_review_ready(snapshot) then
      update private.profile_reviews set submitted_revision=(snapshot->>'revision')::uuid where profile_id=p_profile;
    end if;
  end if;
  -- photo_state's participant triggers already invalidate the owner on pending
  -- and decision changes. The displayed photo and its audience stay unchanged.
end $$;
revoke all on function public.reject_profile_photo_replacement(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.reject_profile_photo_replacement(uuid,uuid,uuid,text) to authenticated;

commit;
