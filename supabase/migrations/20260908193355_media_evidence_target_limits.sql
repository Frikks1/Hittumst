-- Human appeal playback uses the original feature's decoded-media limits.
create or replace function private.admin_media_evidence_impl(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.media_uploads;
begin
 if not private.is_admin() then raise exception using errcode='42501',message='admin_required'; end if;
 select * into job from private.media_uploads where id=p_id and status='appealed';
 if not found or job.owner_id=(select auth.uid()) then raise exception 'case_unavailable'; end if;
 insert into private.admin_audit_log(actor_id,action,target_type,target_id,details) values((select auth.uid()),'media_appeal_evidence','media_upload',p_id,'{}');
 return jsonb_build_object('path',job.object_path,'mediaType',job.media_type,'targetType',job.target_type);
end $$;
