-- One public picture. Legacy media stays owned, exportable and recoverable in place.
alter table public.profile_photos add column archived_at timestamptz;
alter table public.profiles add column main_photo_generation bigint not null default 0;

with ranked as (
 select photo.id, row_number() over (partition by photo.profile_id order by
   (photo.id=p.cover_photo_id) desc nulls last, photo.position,photo.id) as rank
 from public.profile_photos photo join public.profiles p on p.id=photo.profile_id
 where photo.approval_status='approved'
)
update public.profile_photos photo set archived_at=now()
where photo.approval_status<>'approved' or photo.id in(select id from ranked where rank>1);
update public.profiles p set cover_photo_id=(select photo.id from public.profile_photos photo
 where photo.profile_id=p.id and photo.approval_status='approved' and photo.archived_at is null);

-- Archived positions are historical metadata, not occupied replacement slots.
alter table public.profile_photos drop constraint profile_photos_profile_id_position_key;
create unique index profile_photos_current_main on public.profile_photos(profile_id)
 where approval_status='approved' and archived_at is null;

create function private.main_profile_photo_id(p_profile uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select photo.id from public.profile_photos photo join public.profiles p on p.id=photo.profile_id
 where photo.profile_id=p_profile and photo.approval_status='approved' and photo.archived_at is null
 order by (photo.id=p.cover_photo_id) desc nulls last,photo.position,photo.id limit 1;
$$;
revoke all on function private.main_profile_photo_id(uuid) from public,anon,authenticated,service_role;
grant execute on function private.main_profile_photo_id(uuid) to authenticated;

create or replace function private.validate_profile_cover() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.cover_photo_id is not null and not exists(select 1 from public.profile_photos photo
 where photo.id=new.cover_photo_id and photo.profile_id=new.id and photo.approval_status='approved' and photo.archived_at is null) then
 raise exception using errcode='23514',message='cover_requires_own_approved_photo'; end if;
 return new;
end $$;

-- Never publish an old queued upload, a staff approval of an old slot, or an
-- arbitrary direct insert. Only this generation's explicit replacement promotes.
create function private.guard_main_profile_photo() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.archived_at is null and (tg_op='INSERT' or old.archived_at is not null
   or old.approval_status is distinct from new.approval_status) then
   if not exists(select 1 from private.media_uploads u join public.profiles p on p.id=u.owner_id
     where u.id=new.id and u.owner_id=new.profile_id and u.target_type='profile_photo'
     and u.status='processing' and u.metadata->>'purpose'='main_profile_photo'
     and u.metadata->>'generation'=p.main_photo_generation::text) then
     new.archived_at:=coalesce(case when tg_op='UPDATE' then old.archived_at end,now());
   end if;
 end if;
 return new;
end $$;
create trigger main_profile_photo_guard before insert or update of archived_at,approval_status on public.profile_photos
for each row execute function private.guard_main_profile_photo();
revoke all on function private.guard_main_profile_photo() from public,anon,authenticated,service_role;

alter function private.reserve_media_upload_impl(text,uuid,text,jsonb) rename to reserve_media_before_main_photo;
create function private.reserve_media_upload_impl(p_type text,p_target uuid,p_kind text,p_metadata jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); upload_id uuid:=gen_random_uuid(); generation bigint; tags text[];
begin
 if p_type is distinct from 'profile_photo' then
   return private.reserve_media_before_main_photo(p_type,p_target,p_kind,p_metadata);
 end if;
 if caller is null or not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 if p_kind is distinct from 'image' then raise exception 'invalid_media_type'; end if;
 if not private.media_target_available(caller,p_type,p_target,null) then raise exception using errcode='42501',message='media_target_unavailable'; end if;
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or pg_column_size(p_metadata)>4096 then raise exception 'invalid_media_metadata'; end if;
 if p_metadata?'tags' and jsonb_typeof(p_metadata->'tags')<>'array' then raise exception 'invalid_media_tags'; end if;
 select coalesce(array_agg(value),'{}') into tags from jsonb_array_elements_text(coalesce(p_metadata->'tags','[]'));
 if cardinality(tags)>10 or exists(select 1 from unnest(tags) value where value is null or char_length(btrim(value)) not between 1 and 30 or btrim(value)<>value)
 or cardinality(tags)<>(select count(distinct lower(value)) from unnest(tags) value) then raise exception 'invalid_media_tags'; end if;
 -- Reservation and finalization share an advisory-before-row lock order.
 perform pg_advisory_xact_lock(hashtextextended(caller::text||':main_profile_photo',0));
 update private.media_uploads set status='rejected',rejection_reason='upload_expired',claim_id=null
 where owner_id=caller and target_type='profile_photo' and metadata->>'purpose'='main_profile_photo' and status='reserved' and expires_at<=now();
 select main_photo_generation into generation from public.profiles where id=caller for update;
 if exists(select 1 from private.media_uploads where owner_id=caller and target_type='profile_photo'
   and metadata->>'purpose'='main_profile_photo' and metadata->>'generation'=generation::text and status in('reserved','processing','appealed')) then
 raise exception using errcode='23514',message='main_photo_replacement_pending'; end if;
 generation:=generation+1;
 update public.profiles set main_photo_generation=generation where id=caller;
 insert into private.media_uploads(id,owner_id,target_type,target_id,media_type,object_path,metadata)
 values(upload_id,caller,'profile_photo',caller,'image',caller::text||'/'||upload_id::text,
   jsonb_build_object('tags',to_jsonb(tags),'purpose','main_profile_photo','generation',generation));
 return jsonb_build_object('id',upload_id,'path',caller::text||'/'||upload_id::text,'bucket','media-quarantine','expiresAt',now()+interval '1 hour');
end $$;
create or replace function public.reserve_media_upload(target_type text,target_id uuid,media_type text,metadata jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select private.reserve_media_upload_impl(target_type,target_id,media_type,metadata);$$;
revoke all on function private.reserve_media_before_main_photo(text,uuid,text,jsonb),private.reserve_media_upload_impl(text,uuid,text,jsonb)
from public,anon,authenticated,service_role;
grant execute on function private.reserve_media_upload_impl(text,uuid,text,jsonb) to authenticated;

create function private.get_main_profile_photo_upload_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 return (select jsonb_build_object('id',u.id,'status',case when u.status in('reserved','processing') then 'pending' else u.status end,'reason',u.rejection_reason)
 from private.media_uploads u join public.profiles p on p.id=u.owner_id
 where u.owner_id=(select auth.uid()) and u.target_type='profile_photo' and u.metadata->>'purpose'='main_profile_photo'
 and u.metadata->>'generation'=p.main_photo_generation::text and u.status<>'approved' order by u.created_at desc,u.id desc limit 1);
end $$;
create function public.get_main_profile_photo_upload() returns jsonb
language sql stable security invoker set search_path='' as $$select private.get_main_profile_photo_upload_impl();$$;
revoke all on function private.get_main_profile_photo_upload_impl(),public.get_main_profile_photo_upload() from public,anon,authenticated,service_role;
grant execute on function private.get_main_profile_photo_upload_impl(),public.get_main_profile_photo_upload() to authenticated;

alter function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) rename to finish_media_before_main_photo;
create function private.finish_media_impl(p_id uuid,p_claim uuid,p_bytes integer,p_duration integer,p_path text,p_thumbnail text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare job private.media_uploads; expected text; generation bigint; tags text[]; is_gif boolean;
begin
 perform private.require_service_role();
 select * into job from private.media_uploads where id=p_id;
 if job.id is null or job.target_type<>'profile_photo' then
   return private.finish_media_before_main_photo(p_id,p_claim,p_bytes,p_duration,p_path,p_thumbnail,p_reason);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(job.owner_id::text||':main_profile_photo',0));
 select * into job from private.media_uploads where id=p_id for update;
 if job.status='approved' then return job.normalized_path=p_path and job.thumbnail_path is not distinct from p_thumbnail; end if;
 if p_claim is null or job.claim_id is distinct from p_claim or job.status<>'processing' or job.expires_at<=now() then return false; end if;
 if not private.media_target_available(job.owner_id,job.target_type,job.target_id,null) then
   update private.media_uploads set status='rejected',rejection_reason='media_target_unavailable',claim_id=null where id=p_id; return false;
 end if;
 if p_reason is not null then
   update private.media_uploads set status='rejected',rejection_reason=p_reason,claim_id=null where id=p_id; return true;
 end if;
 select main_photo_generation into generation from public.profiles where id=job.owner_id for update;
 if job.metadata->>'purpose' is distinct from 'main_profile_photo' or job.metadata->>'generation' is distinct from generation::text then
   update private.media_uploads set status='rejected',rejection_reason='stale_main_photo_replacement',claim_id=null where id=p_id;
   return false;
 end if;
 expected:=job.owner_id::text||'/'||job.id::text;
 is_gif:=right(p_path,4)='.gif';
 if job.media_type<>'image' or p_bytes is null or p_bytes not between 1 and 10485760 or p_duration is not null
 or (is_gif and (p_path is distinct from expected||'.gif' or p_thumbnail is distinct from expected||'-thumb.jpg'))
 or (not is_gif and (p_path is distinct from expected||'.jpg' or p_thumbnail is not null)) then raise exception 'invalid_verified_media'; end if;
 select coalesce(array_agg(value),'{}') into tags from jsonb_array_elements_text(coalesce(job.metadata->'tags','[]'));
 -- No DELETE, path rewrite or cleanup job is used to retire the old picture.
 update public.profile_photos set archived_at=now() where profile_id=job.owner_id and archived_at is null;
 insert into public.profile_photos(id,profile_id,storage_path,position,tags,approval_status,reviewed_at,moderation_source)
 values(job.id,job.owner_id,p_path,1,tags,'approved',now(),'pipeline');
 update public.profiles set cover_photo_id=job.id where id=job.owner_id;
 update private.media_uploads set status='approved',verified_bytes=p_bytes,verified_duration_ms=null,
   normalized_path=p_path,thumbnail_path=p_thumbnail,claim_id=null where id=p_id;
 insert into private.media_cleanup_jobs(bucket,name) values('media-quarantine',job.object_path) on conflict do nothing;
 return true;
end $$;
create or replace function public.finish_media_upload(job_id uuid,claim_id uuid,byte_size integer,duration_ms integer,object_path text,thumbnail_path text,rejection_reason text) returns boolean
language sql security invoker set search_path='' as $$select private.finish_media_impl(job_id,claim_id,byte_size,duration_ms,object_path,thumbnail_path,rejection_reason);$$;
revoke all on function private.finish_media_before_main_photo(uuid,uuid,integer,integer,text,text,text),private.finish_media_impl(uuid,uuid,integer,integer,text,text,text)
from public,anon,authenticated,service_role;
grant execute on function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) to service_role;

-- Existing member/staff/owner authorization remains in place; add the main-only
-- predicate to discovery, activity, inbox, friends, meetup hosts and room avatars.
-- Do not narrow owner exports, moderation queues or recoverable-media manifests.
do $$
declare fn record; definition text; aliases text[]; photo_alias text;
begin
 for fn in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.prokind='f' loop
   definition:=pg_get_functiondef(fn.oid);
   if definition !~* 'public\.profile_photos' or fn.proname ~ '(finish|reserve|guard|validate|cleanup|export|deletion|admin|recovery|main_profile_photo)'
     or fn.proname in('can_view_profile_photo_object','can_view_profile_gif_poster','can_read_room_profile_photo','content_target_is_visible','showcase_source') then continue; end if;
   select array_agg(distinct captures[1]) into aliases from regexp_matches(definition,'(?:from|join)\s+public\.profile_photos\s+(\w+)','gi') captures;
   foreach photo_alias in array coalesce(aliases,'{}') loop
     -- Ignore SQL keywords when a reader uses the unaliased table.
     if photo_alias in('where','join','order','on','as') then continue; end if;
     definition:=regexp_replace(definition,'('||photo_alias||'\.approval_status\s*=\s*''approved'')',
       '\1 and '||photo_alias||'.archived_at is null','g');
   end loop;
   if fn.proname='get_public_profile_impl' then
     definition:=replace(definition,'''videos'', p.videos','''videos'', ''[]''::jsonb');
     definition:=regexp_replace(definition,'''profile_videos'', coalesce\(\(select jsonb_agg\([\s\S]*?from public\.profile_videos v[\s\S]*?''\[\]''::jsonb\)',
       '''profile_videos'', ''[]''::jsonb');
   end if;
   execute definition;
 end loop;
end $$;

create or replace function private.room_profile_payload(p_profile uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('id',p.id,'displayName',coalesce(p.display_name,'Hittumst member'),
   'avatarPath',(select photo.storage_path from public.profile_photos photo where photo.id=private.main_profile_photo_id(p.id))))
 from public.profiles p where p.id=p_profile and private.meetup_actor_is_active(p.id);
$$;

create or replace function private.can_view_profile_photo_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(exists(select 1 from public.profile_photos photo join public.profiles p on p.id=photo.profile_id
 where photo.storage_path=p_name and (
   photo.profile_id=(select auth.uid()) or private.is_admin() or (
   photo.id=private.main_profile_photo_id(p.id) and p.is_profile_visible and p.is_location_sharing_enabled
   and p.onboarding_completed_at is not null and p.moderation_status<>'banned'
   and (p.moderation_status<>'suspended' or p.suspended_until<=now())
   and private.current_user_is_ready(true) and private.discovery_target_allowed(p.id)
   and not private.meetup_block_exists((select auth.uid()),p.id)))),false);
$$;
create or replace function private.can_read_room_profile_photo(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.account_is_active() and exists(select 1 from public.profile_photos photo
 where photo.storage_path=p_path and photo.id=private.main_profile_photo_id(photo.profile_id)
 and private.meetup_actor_is_active(photo.profile_id) and not private.meetup_block_exists((select auth.uid()),photo.profile_id)
 and (exists(select 1 from public.meetup_room_memberships rm where rm.profile_id=photo.profile_id
 and private.room_is_active_member(rm.room_id,photo.profile_id) and private.room_is_active_member(rm.room_id,(select auth.uid())))
 or exists(select 1 from public.meetup_room_messages msg where msg.sender_id=photo.profile_id and msg.hidden_at is null
 and private.room_is_active_member(msg.room_id,(select auth.uid())))));
$$;
create or replace function private.can_view_profile_gif_poster(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profile_photos photo
 where photo.approval_status='approved' and photo.storage_path=photo.profile_id::text||'/'||photo.id::text||'.gif'
 and p_name=photo.profile_id::text||'/'||photo.id::text||'-thumb.jpg'
 and (private.can_view_profile_photo_object(photo.storage_path) or private.can_read_room_profile_photo(photo.storage_path)
   or private.social_feed_author_photo_read(photo.storage_path)));
$$;

-- Park public profile video/gallery and showcase exposure while retaining owners'
-- files and private-album sharing. Permissive policies combine with OR, so every
-- alternate media path must be constrained too.
create or replace function private.can_view_profile_video_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profile_videos v where v.storage_path=p_name and
   (v.profile_id=(select auth.uid()) or private.is_admin()));
$$;
drop policy profile_videos_select_public on public.profile_videos;
create policy profile_videos_select_own on public.profile_videos for select to authenticated
using(profile_id=(select auth.uid()));
create or replace function private.content_target_is_visible(p_type text,p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case p_type when 'profile' then exists(select 1 from public.profiles p where p.id=p_id
   and p.is_profile_visible and p.moderation_status='active')
 when 'photo' then exists(select 1 from public.profile_photos photo join public.profiles p on p.id=photo.profile_id
   where photo.id=p_id and photo.id=private.main_profile_photo_id(photo.profile_id) and p.is_profile_visible and p.moderation_status='active')
 when 'video' then false else false end;
$$;
create or replace function private.showcase_visible(p_showcase private.profile_showcases,p_viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$select false;$$;
alter function private.showcase_can_read_media(text,text) rename to showcase_can_read_media_before_main_photo;
create function private.showcase_can_read_media(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.account_is_active() and case
 when p_bucket='profile-photos' then exists(select 1 from public.profile_photos photo
   where photo.profile_id=(select auth.uid()) and (photo.storage_path=p_path
     or photo.storage_path=photo.profile_id::text||'/'||photo.id::text||'.gif' and p_path=photo.profile_id::text||'/'||photo.id::text||'-thumb.jpg'))
 when p_bucket='profile-videos' then private.can_view_profile_video_object(p_path)
 when p_bucket='showcase-media' then exists(select 1 from private.showcase_media media
   where media.owner_id=(select auth.uid()) and p_path in(media.storage_path,media.poster_path))
 else false end;
$$;
-- Rebind the storage policy after renaming the original function's OID.
drop policy showcase_media_read on storage.objects;
create policy showcase_media_read on storage.objects for select to authenticated
using(private.showcase_can_read_media(bucket_id,name));
revoke all on function private.showcase_can_read_media_before_main_photo(text,text),private.showcase_can_read_media(text,text)
from public,anon,authenticated,service_role;
grant execute on function private.showcase_can_read_media(text,text) to authenticated;

-- Defense in depth for current and future permissive avatar policies (e.g. feed
-- authors): those policies may authorize a relationship, never an archived file.
create function private.profile_photo_is_current_or_owned(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profile_photos photo where
 (photo.storage_path=p_path or photo.storage_path=photo.profile_id::text||'/'||photo.id::text||'.gif'
   and p_path=photo.profile_id::text||'/'||photo.id::text||'-thumb.jpg')
 and (photo.profile_id=(select auth.uid()) or private.is_admin()
   or photo.id=private.main_profile_photo_id(photo.profile_id)));
$$;
revoke all on function private.profile_photo_is_current_or_owned(text) from public,anon,authenticated,service_role;
grant execute on function private.profile_photo_is_current_or_owned(text) to authenticated;
create policy profile_photo_current_boundary on storage.objects as restrictive for select to authenticated
using(bucket_id<>'profile-photos' or private.profile_photo_is_current_or_owned(name));
create policy profile_video_owner_boundary on storage.objects as restrictive for select to authenticated
using(bucket_id<>'profile-videos' or private.can_view_profile_video_object(name));
