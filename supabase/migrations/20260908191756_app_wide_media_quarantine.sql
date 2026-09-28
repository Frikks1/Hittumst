-- One reservation and quarantine boundary for all uploaded application media.
alter table private.media_uploads alter column album_id drop not null;
alter table private.media_uploads add column target_type text not null default 'album' check(target_type in ('album','profile_photo','profile_video','message','meetup'));
alter table private.media_uploads add column target_id uuid;
alter table private.media_uploads add column metadata jsonb not null default '{}';
update private.media_uploads set target_id=album_id;
-- Legacy album reservation inserts keep using album_id; other targets require target_id.
alter table private.media_uploads add constraint media_target_shape check(target_type='album' and album_id is not null or target_type<>'album' and album_id is null and target_id is not null);
update storage.buckets set file_size_limit=52428800,allowed_mime_types=array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'] where id='media-quarantine';
alter table public.messages add column media_status text check(media_status in ('pending','approved','rejected'));

create function private.media_target_available(p_owner uuid,p_type text,p_target uuid,p_album uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p_owner and deletion_requested_at is null and moderation_status='active') and case p_type
 when 'album' then exists(select 1 from public.albums where id=p_album and owner_id=p_owner and deleted_at is null)
 when 'profile_photo' then p_target=p_owner
 when 'profile_video' then p_target=p_owner
 when 'meetup' then private.meetup_feature_is_enabled() and exists(select 1 from public.meetups m join public.profiles p on p.id=m.host_id where m.id=p_target and m.host_id=p_owner and m.status in ('draft','published') and p.meetup_hosting_restricted_at is null and private.meetup_actor_is_active(p_owner))
 when 'message' then exists(select 1 from public.conversations c join public.conversation_members cm on cm.conversation_id=c.id and cm.user_id=p_owner
 join public.profiles lo on lo.id=c.participant_low join public.profiles hi on hi.id=c.participant_high
 where c.id=p_target and p_owner in(c.participant_low,c.participant_high) and cm.deleted_at is null
 and lo.deletion_requested_at is null and hi.deletion_requested_at is null and lo.moderation_status='active' and hi.moderation_status='active'
 and not exists(select 1 from public.blocks b where (b.blocker_id=c.participant_low and b.blocked_id=c.participant_high) or (b.blocker_id=c.participant_high and b.blocked_id=c.participant_low)))
 else false end;
$$;
revoke all on function private.media_target_available(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;

create function private.reserve_media_upload_impl(p_type text,p_target uuid,p_kind text,p_metadata jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); upload_id uuid:=gen_random_uuid(); used integer; maximum integer; tags text[];
begin
 if caller is null or not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 if p_type is null or p_type not in ('profile_photo','profile_video','message','meetup') or p_kind not in ('image','video')
 or p_type in ('profile_photo','message') and p_kind<>'image' or p_type='profile_video' and p_kind<>'video' then raise exception 'invalid_media_type'; end if;
 if not private.media_target_available(caller,p_type,p_target,null) then raise exception using errcode='42501',message='media_target_unavailable'; end if;
 if p_type='message' and not private.can_message(p_target) then raise exception using errcode='42501',message='conversation_access_denied'; end if;
 if p_type='meetup' and not private.meetup_current_user_can_host() then raise exception using errcode='42501',message='owned_meetup_required'; end if;
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or pg_column_size(p_metadata)>4096 then raise exception 'invalid_media_metadata'; end if;
 if p_metadata ? 'tags' and jsonb_typeof(p_metadata->'tags')<>'array' then raise exception 'invalid_media_tags'; end if;
 select coalesce(array_agg(value),'{}') into tags from jsonb_array_elements_text(coalesce(p_metadata->'tags','[]'));
 if cardinality(tags)>10 or exists(select 1 from unnest(tags) value where value is null or char_length(btrim(value)) not between 1 and 30 or btrim(value)<>value) or cardinality(tags)<>(select count(distinct lower(value)) from unnest(tags) value) then raise exception 'invalid_media_tags'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text||':media:'||p_type||':'||p_target::text,0));
 maximum:=case p_type when 'profile_photo' then 6 when 'profile_video' then 3 when 'meetup' then 8 else 20 end;
 used:=case p_type when 'profile_photo' then (select count(*) from public.profile_photos where profile_id=caller)
 when 'profile_video' then (select count(*) from public.profile_videos where profile_id=caller)
 when 'meetup' then (select count(*) from private.meetup_media where meetup_id=p_target) else 0 end;
 used:=used+(select count(*) from private.media_uploads where owner_id=caller and target_type=p_type and target_id=p_target and status in ('reserved','processing','appealed') and expires_at>now());
 if used>=maximum then raise exception using errcode='23514',message='media_limit_reached'; end if;
 insert into private.media_uploads(id,owner_id,target_type,target_id,media_type,object_path,metadata)
 values(upload_id,caller,p_type,p_target,p_kind,caller::text||'/'||upload_id::text,jsonb_build_object('tags',to_jsonb(tags)));
 if p_type='message' then
 insert into public.messages(id,conversation_id,sender_id,body,media_status) values(upload_id,p_target,caller,'[media_pending]','pending');
 end if;
 return jsonb_build_object('id',upload_id,'path',caller::text||'/'||upload_id::text,'bucket','media-quarantine','expiresAt',now()+interval '1 hour');
end $$;
create function public.reserve_media_upload(target_type text,target_id uuid,media_type text,metadata jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.reserve_media_upload_impl(target_type,target_id,media_type,metadata);$$;
revoke all on function private.reserve_media_upload_impl(text,uuid,text,jsonb),public.reserve_media_upload(text,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.reserve_media_upload_impl(text,uuid,text,jsonb),public.reserve_media_upload(text,uuid,text,jsonb) to authenticated;

-- Existing approval evidence remains staff-attributed. New automated approvals are
-- marked explicitly and never fabricate a reviewer account.
alter table public.profile_photos add column moderation_source text not null default 'staff' check(moderation_source in ('staff','pipeline'));
alter table public.profile_videos add column moderation_source text not null default 'staff' check(moderation_source in ('staff','pipeline'));
alter table public.profile_photos drop constraint profile_photos_review_shape;
alter table public.profile_photos add constraint profile_photos_review_shape check(
 (approval_status='pending' and reviewed_at is null and reviewed_by is null and rejection_reason is null)
 or (approval_status='approved' and reviewed_at is not null and (reviewed_by is not null or moderation_source='pipeline') and rejection_reason is null)
 or (approval_status='rejected' and reviewed_at is not null and (reviewed_by is not null or moderation_source='pipeline') and rejection_reason is not null));
alter table public.profile_videos drop constraint profile_videos_review_shape;
alter table public.profile_videos add constraint profile_videos_review_shape check(
 (approval_status='pending' and reviewed_at is null and reviewed_by is null and rejection_reason is null)
 or (approval_status='approved' and reviewed_at is not null and (reviewed_by is not null or moderation_source='pipeline') and rejection_reason is null)
 or (approval_status='rejected' and reviewed_at is not null and (reviewed_by is not null or moderation_source='pipeline') and rejection_reason is not null));

create function private.sync_media_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.target_type='message' and new.status='rejected' then update public.messages set body='[media_rejected]',media_status='rejected' where id=new.id and media_status='pending'; end if;
 return new;
end $$;
create trigger media_message_status after update of status on private.media_uploads for each row execute function private.sync_media_message();
revoke all on function private.sync_media_message() from public,anon,authenticated,service_role;

create or replace function private.claim_media_impl(p_claim uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.media_uploads;
begin
 perform private.require_service_role();
 if p_claim is null then raise exception 'claim_required'; end if;
 update private.media_uploads set status='rejected',rejection_reason='processing_failed_requires_review',claim_id=null
 where status='processing' and expires_at<now() and attempts>=5 or status='reserved' and expires_at<now();
 update private.media_uploads set status='rejected',rejection_reason='media_target_unavailable',claim_id=null
 where status in ('reserved','processing') and not private.media_target_available(owner_id,target_type,target_id,album_id);
 select * into job from private.media_uploads u where ((u.status='reserved' and u.expires_at>now()) or (u.status='processing' and u.expires_at<now()))
 and u.attempts<5 and exists(select 1 from storage.objects o where o.bucket_id='media-quarantine' and o.name=u.object_path)
 order by u.created_at for update skip locked limit 1;
 if not found then return null; end if;
 update private.media_uploads set status='processing',claim_id=p_claim,attempts=attempts+1,expires_at=now()+interval '15 minutes',last_error=null where id=job.id returning * into job;
 return to_jsonb(job);
end $$;
alter function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) rename to finish_album_media_with_cleanup_impl;
create function private.finish_media_impl(p_id uuid,p_claim uuid,p_bytes integer,p_duration integer,p_path text,p_thumbnail text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare job private.media_uploads; expected text; bucket text; slot integer; tags text[];
begin
 perform private.require_service_role();
 select * into job from private.media_uploads where id=p_id for update;
 if not found or p_claim is null or job.claim_id is distinct from p_claim or job.status<>'processing' or job.expires_at<now() then return false; end if;
 if job.target_type='album' then return private.finish_album_media_with_cleanup_impl(p_id,p_claim,p_bytes,p_duration,p_path,p_thumbnail,p_reason); end if;
 if not private.media_target_available(job.owner_id,job.target_type,job.target_id,null) then
 update private.media_uploads set status='rejected',rejection_reason='media_target_unavailable',claim_id=null where id=p_id; return false; end if;
 if p_reason is not null then update private.media_uploads set status='rejected',rejection_reason=p_reason,claim_id=null where id=p_id; return true; end if;
 expected:=case when job.target_type='meetup' then job.target_id::text else job.owner_id::text end||'/'||job.id::text||case when job.media_type='image' then '.jpg' else '.mp4' end;
 bucket:=case job.target_type when 'profile_photo' then 'profile-photos' when 'profile_video' then 'profile-videos' when 'message' then 'message-images' when 'meetup' then 'meetup-media' end;
 if p_path is distinct from expected or p_thumbnail is not null or p_bytes is null or p_bytes<1 or p_bytes>(case when job.target_type in('profile_photo','message') then 10485760 else 52428800 end)
 or job.media_type='video' and (p_duration is null or p_duration<1 or job.target_type='profile_video' and p_duration>10000) then raise exception 'invalid_verified_media'; end if;
 perform pg_advisory_xact_lock(hashtextextended(job.owner_id::text||':media:'||job.target_type||':'||job.target_id::text,0));
 select coalesce(array_agg(value),'{}') into tags from jsonb_array_elements_text(coalesce(job.metadata->'tags','[]'));
 if job.target_type='profile_photo' then
 select n into slot from generate_series(1,6) n where not exists(select 1 from public.profile_photos where profile_id=job.owner_id and position=n) order by n limit 1;
 if slot is null then raise exception 'media_limit_reached'; end if;
 insert into public.profile_photos(id,profile_id,storage_path,position,tags,approval_status,reviewed_at,moderation_source) values(job.id,job.owner_id,p_path,slot,tags,'approved',now(),'pipeline');
 elsif job.target_type='profile_video' then
 select n into slot from generate_series(1,3) n where not exists(select 1 from public.profile_videos where profile_id=job.owner_id and position=n) order by n limit 1;
 if slot is null then raise exception 'media_limit_reached'; end if;
 insert into public.profile_videos(id,profile_id,storage_path,position,tags,byte_size,duration_ms,approval_status,reviewed_at,moderation_source) values(job.id,job.owner_id,p_path,slot,tags,p_bytes,p_duration,'approved',now(),'pipeline');
 elsif job.target_type='meetup' then
 select n into slot from generate_series(0,7) n where not exists(select 1 from private.meetup_media where meetup_id=job.target_id and position=n) order by n limit 1;
 if slot is null then raise exception 'media_limit_reached'; end if;
 insert into private.meetup_media(id,meetup_id,storage_path,kind,position) values(job.id,job.target_id,p_path,case when job.media_type='image' then 'photo' else 'video' end,slot);
 elsif job.target_type='message' then
 update public.messages set body=null,image_path=p_path,message_kind='image',media_status='approved' where id=job.id and sender_id=job.owner_id and deleted_at is null and media_status in('pending','rejected');
 if not found then raise exception 'media_target_unavailable'; end if;
 end if;
 update private.media_uploads set status='approved',verified_bytes=p_bytes,verified_duration_ms=p_duration,normalized_path=p_path,claim_id=null where id=p_id;
 insert into private.media_cleanup_jobs(bucket,name) values('media-quarantine',job.object_path) on conflict do nothing;
 return true;
end $$;
create or replace function public.finish_media_upload(job_id uuid,claim_id uuid,byte_size integer,duration_ms integer,object_path text,thumbnail_path text,rejection_reason text) returns boolean language sql security invoker set search_path='' as $$select private.finish_media_impl(job_id,claim_id,byte_size,duration_ms,object_path,thumbnail_path,rejection_reason);$$;
revoke all on function private.finish_album_media_with_cleanup_impl(uuid,uuid,integer,integer,text,text,text),private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) to service_role;

-- No direct upload or overwrite may bypass decoded inspection and moderation.
drop policy profile_photo_objects_insert on storage.objects;
drop policy profile_photo_objects_update on storage.objects;
drop policy message_image_objects_insert on storage.objects;
drop policy message_image_objects_update on storage.objects;
drop policy profile_video_objects_insert on storage.objects;
drop policy meetup_media_upload on storage.objects;
create function private.require_verified_profile_media() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true)='authenticated' then raise exception using errcode='42501',message='media_inspection_required'; end if;
 return new;
end $$;
create trigger zz_profile_photo_inspection before insert on public.profile_photos for each row execute function private.require_verified_profile_media();
create trigger zz_profile_video_inspection before insert on public.profile_videos for each row execute function private.require_verified_profile_media();
create function private.require_verified_message_image() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.image_path is not null and current_setting('role',true)='authenticated' then raise exception using errcode='42501',message='media_inspection_required'; end if;
 return new;
end $$;
create trigger zz_message_image_inspection before insert on public.messages for each row execute function private.require_verified_message_image();
revoke all on function private.require_verified_profile_media(),private.require_verified_message_image() from public,anon,authenticated,service_role;
-- The existing event action remains available, but no longer accepts arbitrary raw files.
alter function private.meetup_profile_action_impl(uuid,text,jsonb) rename to meetup_profile_action_before_media_impl;
create function private.meetup_profile_action_impl(p_meetup_id uuid,p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_action='add_media' then raise exception using errcode='42501',message='media_inspection_required'; end if;
 return private.meetup_profile_action_before_media_impl(p_meetup_id,p_action,p_input);
end $$;
create or replace function public.meetup_profile_action(meetup_id uuid,action text,input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.meetup_profile_action_impl(meetup_id,action,input);$$;
revoke all on function private.meetup_profile_action_before_media_impl(uuid,text,jsonb),private.meetup_profile_action_impl(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.meetup_profile_action_impl(uuid,text,jsonb) to authenticated;

create function private.list_my_media_uploads_impl(p_type text,p_target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'status',status,'createdAt',created_at,'reason',rejection_reason) order by created_at desc) from private.media_uploads where owner_id=(select auth.uid()) and target_type=p_type and target_id=p_target),'[]');
end $$;
create function public.list_my_media_uploads(target_type text,target_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.list_my_media_uploads_impl(target_type,target_id);$$;
revoke all on function private.list_my_media_uploads_impl(text,uuid),public.list_my_media_uploads(text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.list_my_media_uploads_impl(text,uuid),public.list_my_media_uploads(text,uuid) to authenticated;

-- Owned output includes profile videos and service-written event objects.
create function private.owns_export_media(p_bucket text,p_name text,p_owner text) returns boolean language sql stable security definer set search_path='' as $$
 select p_bucket in('profile-photos','profile-videos','message-images','album-media','meetup-media') and
 (p_owner=(select auth.uid())::text or (storage.foldername(p_name))[1]=(select auth.uid())::text or
 p_bucket='meetup-media' and exists(select 1 from private.meetup_media mm join public.meetups m on m.id=mm.meetup_id where mm.storage_path=p_name and m.host_id=(select auth.uid())));
$$;
revoke all on function private.owns_export_media(text,text,text) from public,anon,authenticated,service_role;
alter function private.export_account_impl() rename to export_account_before_appwide_media_impl;
create function private.export_account_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 return private.export_account_before_appwide_media_impl()||jsonb_build_object(
 'profileVideos',coalesce((select jsonb_agg(to_jsonb(v) order by position) from public.profile_videos v where profile_id=(select auth.uid())),'[]'),
 'mediaManifest',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'bucket',o.bucket_id,'name',o.name,'createdAt',o.created_at,'bytes',o.metadata->'size','downloadPath','/api/account/media/'||o.id::text) order by o.created_at,o.id)
 from storage.objects o where private.owns_export_media(o.bucket_id,o.name,o.owner_id)),'[]'));
end $$;
revoke all on function private.export_account_before_appwide_media_impl(),private.export_account_impl() from public,anon,authenticated,service_role;
grant execute on function private.export_account_impl() to authenticated;
create or replace function public.export_account() returns jsonb language sql stable security invoker set search_path='' as $$select private.export_account_impl();$$;
create or replace function public.export_my_account() returns jsonb language sql stable security invoker set search_path='' as $$select private.export_account_impl();$$;
create or replace function private.get_account_media_impl(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.account_is_active() or not private.has_current_session() then raise exception using errcode='42501',message='account_unavailable'; end if;
 select jsonb_build_object('bucket',o.bucket_id,'name',o.name) into result from storage.objects o where o.id=p_id and private.owns_export_media(o.bucket_id,o.name,o.owner_id);
 if result is null then raise exception using errcode='42501',message='media_unavailable'; end if;
 return result;
end $$;

-- Logging out of a staff session revokes sensitive evidence access immediately.
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select private.has_current_session() and coalesce((select auth.jwt()->>'aal')='aal2',false) and jsonb_array_length(private.current_staff_roles())>0;
$$;
create or replace function private.get_staff_access_impl() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',u.id,'email',u.email,'name',coalesce(u.raw_app_meta_data->>'display_name',split_part(u.email,'@',1)),
 'roles',private.current_staff_roles(),'mfaRequired',not private.is_admin())
 from auth.users u where u.id=(select auth.uid()) and private.has_current_session() and jsonb_array_length(private.current_staff_roles())>0;
$$;

create function private.cancel_media_upload_impl(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 update private.media_uploads set status='rejected',rejection_reason='upload_cancelled',claim_id=null where id=p_id and owner_id=(select auth.uid()) and status='reserved';
 return found;
end $$;
create function public.cancel_media_upload(upload_id uuid) returns boolean language sql security invoker set search_path='' as $$select private.cancel_media_upload_impl(upload_id);$$;
revoke all on function private.cancel_media_upload_impl(uuid),public.cancel_media_upload(uuid) from public,anon,authenticated,service_role;
grant execute on function private.cancel_media_upload_impl(uuid),public.cancel_media_upload(uuid) to authenticated;

-- Worker-owned event outputs use event prefixes; retain ownership across cleanup
-- through the durable manifest before profile foreign keys disappear.
create function private.account_owns_stored_object(p_account uuid,p_bucket text,p_name text,p_owner text) returns boolean language sql stable security definer set search_path='' as $$
 select p_owner=p_account::text or (storage.foldername(p_name))[1]=p_account::text or p_bucket='meetup-media' and (
 exists(select 1 from private.meetup_media mm join public.meetups m on m.id=mm.meetup_id where mm.storage_path=p_name and m.host_id=p_account)
 or exists(select 1 from private.media_uploads u where u.owner_id=p_account and u.target_type='meetup' and p_name=u.target_id::text||'/'||u.id::text||case when u.media_type='image' then '.jpg' else '.mp4' end));
$$;
revoke all on function private.account_owns_stored_object(uuid,text,text,text) from public,anon,authenticated,service_role;
-- Preserve the tested deletion behavior and extend only its ownership predicate.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.claim_account_deletions_impl(uuid,integer)'::regprocedure);
 definition:=replace(definition,'o.owner_id=j.account_id::text or (storage.foldername(o.name))[1]=j.account_id::text','private.account_owns_stored_object(j.account_id,o.bucket_id,o.name,o.owner_id)');
 execute definition;
 definition:=pg_get_functiondef('private.finish_account_deletion_impl(uuid,uuid,boolean)'::regprocedure);
 definition:=replace(definition,'owner_id=job.account_id::text or (storage.foldername(name))[1]=job.account_id::text',
 'private.account_owns_stored_object(job.account_id,bucket_id,name,owner_id) or exists(select 1 from jsonb_array_elements(job.objects) manifest where manifest->>''bucket''=bucket_id and manifest->>''name''=name)');
 execute definition;
end $$;
create function private.defer_deletion_for_media() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Requests revoke access immediately; object deletion waits out already-issued
 -- processing leases so a late service upload cannot recreate a deleted file.
 new.available_at:=greatest(new.available_at,coalesce((select max(expires_at) from private.media_uploads where owner_id=new.account_id and status='processing'),now()));
 return new;
end $$;
create trigger account_deletion_media_drain before insert on private.account_deletion_jobs for each row execute function private.defer_deletion_for_media();
revoke all on function private.defer_deletion_for_media() from public,anon,authenticated,service_role;
