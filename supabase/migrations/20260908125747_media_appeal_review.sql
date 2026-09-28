-- An appeal is a human decision, never an automatic retry of the same model.
alter table private.media_uploads add column review_approved boolean not null default false;

create function private.admin_media_appeals_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception using errcode='42501',message='admin_required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(q)) from (
    select id,media_type,created_at,rejection_reason from private.media_uploads
    where status='appealed' order by created_at limit 100
  ) q),'[]'::jsonb);
end $$;
create function public.admin_media_appeals() returns jsonb language sql stable security invoker set search_path='' as $$select private.admin_media_appeals_impl();$$;

create function private.admin_media_evidence_impl(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.media_uploads;
begin
  if not private.is_admin() then raise exception using errcode='42501',message='admin_required'; end if;
  select * into job from private.media_uploads where id=p_id and status='appealed';
  if not found or job.owner_id=(select auth.uid()) then raise exception 'case_unavailable'; end if;
  insert into private.admin_audit_log(actor_id,action,target_type,target_id,details)
  values((select auth.uid()),'media_appeal_evidence','media_upload',p_id,'{}');
  return jsonb_build_object('path',job.object_path,'mediaType',job.media_type);
end $$;
create function public.admin_media_evidence(upload_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.admin_media_evidence_impl(upload_id);$$;

create function private.admin_review_media_impl(p_id uuid,p_approved boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare job private.media_uploads;
begin
  if not private.is_admin() then raise exception using errcode='42501',message='admin_required'; end if;
  if p_approved is null or p_reason is null or char_length(btrim(p_reason)) not between 20 and 500 then raise exception 'review_reason_required'; end if;
  select * into job from private.media_uploads where id=p_id and status='appealed' for update;
  if not found or job.owner_id=(select auth.uid()) then raise exception 'case_unavailable'; end if;
  update private.media_uploads set status=case when p_approved then 'reserved' else 'rejected' end,
    review_approved=p_approved,attempts=0,claim_id=null,expires_at=now()+interval '1 day',
    rejection_reason=case when p_approved then null else 'appeal_rejected' end where id=p_id;
  insert into private.admin_audit_log(actor_id,action,target_type,target_id,details)
  values((select auth.uid()),'media_appeal_decision','media_upload',p_id,jsonb_build_object('approved',p_approved,'reason',btrim(p_reason)));
end $$;
create function public.admin_review_media(upload_id uuid,approved boolean,reason text) returns void language sql security invoker set search_path='' as $$select private.admin_review_media_impl(upload_id,approved,reason);$$;

revoke all on function private.admin_media_appeals_impl(),public.admin_media_appeals(),private.admin_media_evidence_impl(uuid),public.admin_media_evidence(uuid),private.admin_review_media_impl(uuid,boolean,text),public.admin_review_media(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function private.admin_media_appeals_impl(),public.admin_media_appeals(),private.admin_media_evidence_impl(uuid),public.admin_media_evidence(uuid),private.admin_review_media_impl(uuid,boolean,text),public.admin_review_media(uuid,boolean,text) to authenticated;
