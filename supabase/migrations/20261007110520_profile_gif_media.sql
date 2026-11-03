-- Animated profile photos use the existing reservation, moderation and six-slot budget.
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'image/gif')
where id in ('media-quarantine', 'profile-photos') and not ('image/gif' = any(allowed_mime_types));

alter table private.media_cleanup_jobs drop constraint media_cleanup_jobs_bucket_check;
alter table private.media_cleanup_jobs add constraint media_cleanup_jobs_bucket_check
check(bucket in ('media-quarantine','meetup-media','profile-photos'));
create function private.cleanup_retired_profile_gif() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.storage_path=old.profile_id::text||'/'||old.id::text||'.gif'
 and (tg_op='DELETE' or new.storage_path is distinct from old.storage_path) then
 insert into private.media_cleanup_jobs(bucket,name) values('profile-photos',old.storage_path),
 ('profile-photos',old.profile_id::text||'/'||old.id::text||'-thumb.jpg') on conflict do nothing;
 end if;
 return null;
end $$;
revoke all on function private.cleanup_retired_profile_gif() from public,anon,authenticated,service_role;
create trigger cleanup_retired_profile_gif after delete or update of storage_path on public.profile_photos
for each row execute function private.cleanup_retired_profile_gif();

-- Preserve the existing photo visibility checks for the first-frame accessibility poster.
create function private.can_view_profile_gif_poster(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profile_photos photo
 where photo.approval_status='approved'
 and photo.storage_path=photo.profile_id::text||'/'||photo.id::text||'.gif'
 and p_name=photo.profile_id::text||'/'||photo.id::text||'-thumb.jpg'
 and private.can_view_profile_photo_object(photo.storage_path));
$$;
revoke all on function private.can_view_profile_gif_poster(text) from public,anon,authenticated,service_role;
grant execute on function private.can_view_profile_gif_poster(text) to authenticated;
create policy profile_gif_poster_select on storage.objects for select to authenticated
using(bucket_id='profile-photos' and private.can_view_profile_gif_poster(name));

alter function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) rename to finish_media_before_profile_gifs;
create function private.finish_media_impl(p_id uuid,p_claim uuid,p_bytes integer,p_duration integer,p_path text,p_thumbnail text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare job private.media_uploads; expected text; slot integer; tags text[];
begin
 perform private.require_service_role();
 select * into job from private.media_uploads where id=p_id for update;
 if not found or job.target_type<>'profile_photo' or right(p_path,4) is distinct from '.gif' or p_reason is not null then
 return private.finish_media_before_profile_gifs(p_id,p_claim,p_bytes,p_duration,p_path,p_thumbnail,p_reason); end if;
 if p_claim is null or job.claim_id is distinct from p_claim or job.status<>'processing' or job.expires_at<now() then return false; end if;
 if not private.media_target_available(job.owner_id,job.target_type,job.target_id,null) then
 update private.media_uploads set status='rejected',rejection_reason='media_target_unavailable',claim_id=null where id=p_id; return false; end if;
 expected:=job.owner_id::text||'/'||job.id::text;
 if job.media_type<>'image' or p_path is distinct from expected||'.gif' or p_thumbnail is distinct from expected||'-thumb.jpg'
 or p_bytes is null or p_bytes not between 1 and 10485760 or p_duration is not null then raise exception 'invalid_verified_media'; end if;
 perform pg_advisory_xact_lock(hashtextextended(job.owner_id::text||':media:profile_photo:'||job.target_id::text,0));
 select n into slot from generate_series(1,6) n where not exists(select 1 from public.profile_photos where profile_id=job.owner_id and position=n) order by n limit 1;
 if slot is null then raise exception 'media_limit_reached'; end if;
 select coalesce(array_agg(value),'{}') into tags from jsonb_array_elements_text(coalesce(job.metadata->'tags','[]'));
 insert into public.profile_photos(id,profile_id,storage_path,position,tags,approval_status,reviewed_at,moderation_source)
 values(job.id,job.owner_id,p_path,slot,tags,'approved',now(),'pipeline');
 update private.media_uploads set status='approved',verified_bytes=p_bytes,verified_duration_ms=null,
 normalized_path=p_path,thumbnail_path=p_thumbnail,claim_id=null where id=p_id;
 insert into private.media_cleanup_jobs(bucket,name) values('media-quarantine',job.object_path) on conflict do nothing;
 return true;
end $$;
-- The public SQL wrapper must resolve the new implementation after the old function is renamed.
create or replace function public.finish_media_upload(job_id uuid,claim_id uuid,byte_size integer,duration_ms integer,object_path text,thumbnail_path text,rejection_reason text) returns boolean
language sql security invoker set search_path='' as $$select private.finish_media_impl(job_id,claim_id,byte_size,duration_ms,object_path,thumbnail_path,rejection_reason);$$;
revoke all on function private.finish_media_before_profile_gifs(uuid,uuid,integer,integer,text,text,text),private.finish_media_impl(uuid,uuid,integer,integer,text,text,text)
from public,anon,authenticated,service_role;
grant execute on function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) to service_role;

-- Posters remain part of the existing approved-media backup/deletion lifecycle.
do $$ declare definition text; begin
 definition:=pg_get_viewdef('private.recoverable_media'::regclass,true);
 definition:=regexp_replace(definition,';\s*$','');
 execute 'create or replace view private.recoverable_media as '||definition||
 ' union select ''profile-photos''::text,photo.profile_id::text||''/''||photo.id::text||''-thumb.jpg'',photo.profile_id
 from public.profile_photos photo join public.profiles p on p.id=photo.profile_id
 where photo.approval_status=''approved'' and photo.storage_path=photo.profile_id::text||''/''||photo.id::text||''.gif''
 and p.deletion_requested_at is null and p.moderation_status=''active''';
end $$;
revoke all on private.recoverable_media from public,anon,authenticated,service_role;
