-- Event-room media uses the existing quarantine worker and current room admission.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('meetup-room-media','meetup-room-media',false,52428800,array['image/jpeg','video/mp4']) on conflict(id) do nothing;
alter table private.media_uploads drop constraint media_uploads_target_type_check;
alter table private.media_uploads add constraint media_uploads_target_type_check check(target_type in
 ('album','profile_photo','profile_video','message','meetup','meetup_memory','showcase','strax','meetup_room_message','meetup_room_avatar'));
alter table private.media_cleanup_jobs drop constraint media_cleanup_jobs_bucket_check;
alter table private.media_cleanup_jobs add constraint media_cleanup_jobs_bucket_check check(bucket in
 ('media-quarantine','meetup-media','showcase-media','profile-photos','strax-media','meetup-room-media'));
alter table public.meetup_room_messages drop constraint meetup_room_messages_kind_check;
alter table public.meetup_room_messages add constraint meetup_room_messages_kind_check check(kind in ('text','system','photo','video'));
alter table public.meetup_room_messages drop constraint meetup_room_messages_body_check;
alter table public.meetup_room_messages add constraint meetup_room_messages_body_check check
 (char_length(btrim(body)) between case when kind in ('photo','video') then 0 else 1 end and 2000);

create table private.meetup_room_message_media(
 message_id uuid primary key references public.meetup_room_messages(id) on delete cascade,
 upload_id uuid not null unique references private.media_uploads(id) on delete cascade,
 room_id uuid not null references public.meetup_rooms(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade
);
create table private.meetup_room_avatars(
 room_id uuid primary key references public.meetup_rooms(id) on delete cascade,
 upload_id uuid not null unique references private.media_uploads(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade,
 storage_path text not null
);
create table private.meetup_room_avatar_requests(
 room_id uuid primary key references public.meetup_rooms(id) on delete cascade,
 upload_id uuid not null unique references private.media_uploads(id) on delete cascade
);
revoke all on private.meetup_room_message_media,private.meetup_room_avatars,private.meetup_room_avatar_requests from public,anon,authenticated,service_role;

create function private.room_can_post(p_room uuid,p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.room_is_active_member(p_room,p_actor) and exists(select 1 from public.meetup_rooms
 where id=p_room and status='open' and locked_at is null and posting_closes_at>now());
$$;
create function private.room_can_manage_avatar(p_room uuid,p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.room_can_post(p_room,p_actor) and exists(select 1 from public.meetup_rooms r join public.meetups m on m.id=r.meetup_id
 where r.id=p_room and m.host_id=p_actor);
$$;
create function private.room_profile_payload(p_profile uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('id',p.id,'displayName',coalesce(p.display_name,'Hittumst member'),
 'avatarPath',(select storage_path from public.profile_photos where profile_id=p.id and approval_status='approved' order by position,id limit 1)))
 from public.profiles p where p.id=p_profile and private.meetup_actor_is_active(p.id);
$$;
create function private.list_meetup_room_members_impl(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.account_is_active() or not private.room_is_active_member(p_room,(select auth.uid())) then
 raise exception using errcode='42501',message='active_room_membership_required'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('profile',private.room_profile_payload(rm.profile_id),'role',rm.role)
 order by case rm.role when 'host' then 0 else 1 end,p.display_name,rm.profile_id)
 from public.meetup_room_memberships rm join public.profiles p on p.id=rm.profile_id
 where rm.room_id=p_room and private.room_is_active_member(p_room,rm.profile_id)
 and not private.meetup_block_exists((select auth.uid()),rm.profile_id)),'[]');
end $$;
create function public.list_meetup_room_members(room_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select private.list_meetup_room_members_impl(room_id);$$;

alter function private.get_meetup_room_summary_impl(uuid) rename to get_meetup_room_summary_before_media;
create function private.get_meetup_room_summary_impl(p_meetup_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare summary jsonb; room uuid; begin
 summary:=private.get_meetup_room_summary_before_media(p_meetup_id); if summary is null then return null; end if;
 room:=(summary->>'id')::uuid;
 return summary||jsonb_strip_nulls(jsonb_build_object('title',(select title from public.meetups where id=p_meetup_id),
 'canManageAvatar',private.room_can_manage_avatar(room,(select auth.uid())),
 'avatarPath',case when private.room_is_active_member(room,(select auth.uid())) then
 (select a.storage_path from private.meetup_room_avatars a join private.media_uploads u on u.id=a.upload_id
 where a.room_id=room and u.status='approved') end)); end $$;
create or replace function public.get_meetup_room_summary(meetup_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select private.get_meetup_room_summary_impl(meetup_id);$$;

create or replace function private.room_message_payload(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('id',msg.id,'roomId',msg.room_id,
 'sender',private.room_profile_payload(msg.sender_id),'kind',msg.kind,'body',msg.body,'linkHostnames',msg.link_hostnames,'createdAt',msg.created_at,
 'media',case when msg.kind in ('photo','video') then jsonb_strip_nulls(jsonb_build_object('kind',msg.kind,
 'status',case when u.status='approved' then 'approved' when u.status='rejected' or u.id is null then 'rejected' else 'pending' end,
 'storagePath',case when u.status='approved' then u.normalized_path end,'thumbnailPath',case when u.status='approved' then u.thumbnail_path end)) end))
 ||jsonb_build_object('sender',private.room_profile_payload(msg.sender_id))
 from public.meetup_room_messages msg left join private.meetup_room_message_media mm on mm.message_id=msg.id
 left join private.media_uploads u on u.id=mm.upload_id where msg.id=p_id;
$$;

alter function private.media_target_available(uuid,text,uuid,uuid) rename to media_target_available_before_room_media;
create function private.media_target_available(p_owner uuid,p_type text,p_target uuid,p_album uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when p_type='meetup_room_message' then private.room_can_post(p_target,p_owner)
 when p_type='meetup_room_avatar' then private.room_can_manage_avatar(p_target,p_owner)
 else private.media_target_available_before_room_media(p_owner,p_type,p_target,p_album) end;
$$;
alter function private.reserve_media_upload_impl(text,uuid,text,jsonb) rename to reserve_media_upload_before_room_media;
create function private.reserve_media_upload_impl(p_type text,p_target uuid,p_kind text,p_metadata jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); upload_id uuid:=gen_random_uuid(); client_id uuid; existing private.media_uploads; begin
 if p_type not in ('meetup_room_message','meetup_room_avatar') then return private.reserve_media_upload_before_room_media(p_type,p_target,p_kind,p_metadata); end if;
 if p_kind is null or p_kind not in ('image','video') or p_type='meetup_room_avatar' and p_kind<>'image' then raise exception using errcode='22023',message='invalid_media_type'; end if;
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or pg_column_size(p_metadata)>4096
 or p_metadata-array['tags','clientMessageId']<>'{}'::jsonb or p_metadata ? 'tags' and p_metadata->'tags'<>'[]'::jsonb then
 raise exception using errcode='22023',message='invalid_media_metadata'; end if;
 client_id:=(p_metadata->>'clientMessageId')::uuid;
 if p_type='meetup_room_avatar' and client_id is not null then raise exception using errcode='22023',message='invalid_media_metadata'; end if;
 perform 1 from public.meetup_rooms where id=p_target for update;
 perform 1 from public.meetup_room_memberships where room_id=p_target and profile_id=caller for share;
 if not private.account_is_active() or not private.media_target_available(caller,p_type,p_target,null) then
 raise exception using errcode='42501',message='media_target_unavailable'; end if;
 if client_id is not null then
 select * into existing from private.media_uploads where owner_id=caller and target_type=p_type
 and metadata->>'clientMessageId'=client_id::text and rejection_reason is distinct from 'upload_cancelled' order by created_at desc limit 1;
 if existing.id is not null and (existing.status in ('approved','rejected','appealed') or existing.expires_at>now()) then
 if existing.media_type<>p_kind or existing.target_id<>p_target then raise exception using errcode='23505',message='message_id_conflict'; end if;
 return jsonb_build_object('id',existing.id,'bucket','media-quarantine','path',existing.object_path,'expiresAt',existing.expires_at,
 'alreadyUploaded',existing.status<>'reserved' or exists(select 1 from storage.objects where bucket_id='media-quarantine' and name=existing.object_path)); end if;
 end if;
 if (select count(*) from private.media_uploads where owner_id=caller and target_type=p_type and target_id=p_target
 and status in ('reserved','processing','appealed') and expires_at>now())>=20 then raise exception using errcode='23514',message='media_limit_reached'; end if;
 perform private.consume_write_quota('message',60,interval '1 minute');
 insert into private.media_uploads(id,owner_id,target_type,target_id,media_type,object_path,metadata)
 values(upload_id,caller,p_type,p_target,p_kind,caller::text||'/'||upload_id::text,coalesce(jsonb_strip_nulls(jsonb_build_object('clientMessageId',client_id)),'{}'));
 if p_type='meetup_room_avatar' then
 insert into private.meetup_room_avatar_requests(room_id,upload_id) values(p_target,upload_id)
 on conflict(room_id) do update set upload_id=excluded.upload_id;
 update private.media_uploads set status='rejected',rejection_reason='upload_cancelled',claim_id=null where target_type=p_type
 and target_id=p_target and id<>upload_id and status in ('reserved','processing','appealed'); end if;
 return jsonb_build_object('id',upload_id,'bucket','media-quarantine','path',caller::text||'/'||upload_id::text,'expiresAt',now()+interval '1 hour'); end $$;
create or replace function public.reserve_media_upload(target_type text,target_id uuid,media_type text,metadata jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select private.reserve_media_upload_impl(target_type,target_id,media_type,metadata);$$;

create function private.send_meetup_room_media_once_impl(p_room uuid,p_id uuid,p_upload uuid,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); job private.media_uploads; existing public.meetup_room_messages; hosts text[]; begin
 if p_id is null then raise exception using errcode='22023',message='message_id_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 perform 1 from public.meetup_rooms where id=p_room for update;
 perform 1 from public.meetup_room_memberships where room_id=p_room and profile_id=caller for share;
 if not private.account_is_active() or not private.room_is_active_member(p_room,caller) then raise exception using errcode='42501',message='active_room_membership_required'; end if;
 select * into existing from public.meetup_room_messages where id=p_id;
 if existing.id is not null then
 if existing.room_id<>p_room or existing.sender_id is distinct from caller or existing.body is distinct from btrim(p_body) or existing.hidden_at is not null
 or not exists(select 1 from private.meetup_room_message_media where message_id=p_id and upload_id=p_upload) then
 raise exception using errcode='23505',message='message_id_conflict'; end if; return private.room_message_payload(p_id); end if;
 if not private.room_can_post(p_room,caller) then raise exception using errcode='55000',message='room_posting_closed'; end if;
 if p_body is null or length(btrim(p_body))>2000 or p_body ~* '(^|[[:space:]])(ftp|file|data|javascript):' then raise exception using errcode='22023',message='invalid_message_body'; end if;
 select * into job from private.media_uploads where id=p_upload for update;
 if job.id is null or job.owner_id<>caller or job.target_type<>'meetup_room_message' or job.target_id<>p_room
 or job.rejection_reason='upload_cancelled' or job.status='reserved' and job.expires_at<=now()
 or job.metadata ? 'clientMessageId' and job.metadata->>'clientMessageId'<>p_id::text then
 raise exception using errcode='42501',message='media_upload_unavailable'; end if;
 select coalesce(array_agg(distinct lower(substring(match[1] from '^https?://([^/:?#]+)'))),'{}') into hosts
 from regexp_matches(p_body,'(https?://[^[:space:]<>]+)','gi') as match;
 insert into public.meetup_room_messages(id,room_id,sender_id,kind,body,link_hostnames)
 values(p_id,p_room,caller,case job.media_type when 'image' then 'photo' else 'video' end,btrim(p_body),hosts);
 insert into private.meetup_room_message_media(message_id,upload_id,room_id,owner_id) values(p_id,p_upload,p_room,caller);
 return private.room_message_payload(p_id); end $$;
create function public.send_meetup_room_media_once(room_id uuid,message_id uuid,upload_id uuid,body text default '') returns jsonb
language sql security invoker set search_path='' as $$select private.send_meetup_room_media_once_impl(room_id,message_id,upload_id,body);$$;

alter function private.send_room_message_once_impl(uuid,uuid,text) rename to send_room_message_once_before_media;
create function private.send_room_message_once_impl(p_room uuid,p_id uuid,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_id is null then raise exception using errcode='22023',message='message_id_required'; end if;
 if not private.account_is_active() or not private.room_is_active_member(p_room,(select auth.uid())) then
 raise exception using errcode='42501',message='active_room_membership_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if exists(select 1 from public.meetup_room_messages where id=p_id and kind<>'text') then
 raise exception using errcode='23505',message='message_id_conflict'; end if;
 return private.send_room_message_once_before_media(p_room,p_id,p_body); end $$;
create or replace function public.send_meetup_room_message_once(room_id uuid,message_id uuid,body text) returns jsonb
language sql security invoker set search_path='' as $$select private.send_room_message_once_impl(room_id,message_id,body);$$;

alter function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) rename to finish_media_before_room_media;
create function private.finish_media_impl(p_id uuid,p_claim uuid,p_bytes integer,p_duration integer,p_path text,p_thumbnail text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare job private.media_uploads; expected text; begin
 perform private.require_service_role(); select * into job from private.media_uploads where id=p_id;
 if job.id is null or job.target_type not in ('meetup_room_message','meetup_room_avatar') then
 return private.finish_media_before_room_media(p_id,p_claim,p_bytes,p_duration,p_path,p_thumbnail,p_reason); end if;
 perform 1 from public.meetup_rooms where id=job.target_id for update;
 perform 1 from public.meetup_room_memberships where room_id=job.target_id and profile_id=job.owner_id for share;
 select * into job from private.media_uploads where id=p_id for update;
 if p_claim is null or job.claim_id is distinct from p_claim or job.status<>'processing' or job.expires_at<=now() then return false; end if;
 if not private.media_target_available(job.owner_id,job.target_type,job.target_id,null) then
 update private.media_uploads set status='rejected',rejection_reason='media_target_unavailable',claim_id=null where id=p_id; return false; end if;
 if job.target_type='meetup_room_avatar' and not exists(select 1 from private.meetup_room_avatar_requests where room_id=job.target_id and upload_id=job.id) then
 update private.media_uploads set status='rejected',rejection_reason='upload_cancelled',claim_id=null where id=p_id; return false; end if;
 if p_reason is not null then update private.media_uploads set status='rejected',rejection_reason=p_reason,claim_id=null where id=p_id; return true; end if;
 expected:=job.target_id::text||'/'||job.id::text||case when job.media_type='image' then '.jpg' else '.mp4' end;
 if p_path is distinct from expected or p_bytes is null or p_bytes<1 or p_bytes>(case job.media_type when 'image' then 10485760 else 52428800 end)
 or job.media_type='video' and (p_duration is null or p_duration<1 or p_thumbnail is distinct from job.target_id::text||'/'||job.id::text||'-thumb.jpg')
 or job.media_type='image' and (p_duration is not null or p_thumbnail is not null) then raise exception using errcode='22023',message='invalid_verified_media'; end if;
 update private.media_uploads set status='approved',verified_bytes=p_bytes,verified_duration_ms=p_duration,normalized_path=p_path,thumbnail_path=p_thumbnail,claim_id=null where id=p_id;
 if job.target_type='meetup_room_avatar' then
 insert into private.meetup_room_avatars(room_id,upload_id,owner_id,storage_path) values(job.target_id,job.id,job.owner_id,p_path)
 on conflict(room_id) do update set upload_id=excluded.upload_id,owner_id=excluded.owner_id,storage_path=excluded.storage_path;
 end if;
 insert into private.media_cleanup_jobs(bucket,name) values('media-quarantine',job.object_path) on conflict do nothing;
 return true; end $$;
create or replace function public.finish_media_upload(job_id uuid,claim_id uuid,byte_size integer,duration_ms integer,object_path text,thumbnail_path text,rejection_reason text) returns boolean
language sql security invoker set search_path='' as $$select private.finish_media_impl(job_id,claim_id,byte_size,duration_ms,object_path,thumbnail_path,rejection_reason);$$;

create function private.remove_meetup_room_avatar_impl(p_room uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.meetup_rooms where id=p_room for update;
 if not private.account_is_active() or not private.room_can_manage_avatar(p_room,(select auth.uid())) then raise exception using errcode='42501',message='owned_room_required'; end if;
 update private.media_uploads set status='rejected',rejection_reason='upload_cancelled',claim_id=null where target_type='meetup_room_avatar' and target_id=p_room and status in ('reserved','processing','appealed');
 delete from private.meetup_room_avatar_requests where room_id=p_room;
 delete from private.meetup_room_avatars where room_id=p_room;
end $$;
create function public.remove_meetup_room_avatar(room_id uuid) returns void language sql security invoker set search_path='' as $$select private.remove_meetup_room_avatar_impl(room_id);$$;

create function private.can_read_meetup_room_media(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.account_is_active() and (exists(select 1 from private.meetup_room_message_media mm join public.meetup_room_messages msg on msg.id=mm.message_id
 join private.media_uploads u on u.id=mm.upload_id where u.status='approved' and p_path in(u.normalized_path,u.thumbnail_path)
 and msg.hidden_at is null and private.room_is_active_member(mm.room_id,(select auth.uid())) and private.meetup_actor_is_active(mm.owner_id)
 and not private.meetup_block_exists((select auth.uid()),mm.owner_id))
 or exists(select 1 from private.meetup_room_avatars a join private.media_uploads u on u.id=a.upload_id where a.storage_path=p_path
 and u.status='approved' and private.room_is_active_member(a.room_id,(select auth.uid()))));
$$;
create policy meetup_room_media_read on storage.objects for select to authenticated using(bucket_id='meetup-room-media' and private.can_read_meetup_room_media(name));
create function private.can_read_room_profile_photo(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.account_is_active() and exists(select 1 from public.profile_photos photo where photo.storage_path=p_path and photo.approval_status='approved'
 and photo.id=(select first_photo.id from public.profile_photos first_photo where first_photo.profile_id=photo.profile_id and first_photo.approval_status='approved' order by first_photo.position,first_photo.id limit 1)
 and private.meetup_actor_is_active(photo.profile_id) and not private.meetup_block_exists((select auth.uid()),photo.profile_id)
 and (exists(select 1 from public.meetup_room_memberships rm where rm.profile_id=photo.profile_id
 and private.room_is_active_member(rm.room_id,photo.profile_id) and private.room_is_active_member(rm.room_id,(select auth.uid())))
 or exists(select 1 from public.meetup_room_messages msg where msg.sender_id=photo.profile_id and msg.hidden_at is null and private.room_is_active_member(msg.room_id,(select auth.uid())))));
$$;
create policy meetup_room_profile_photo_read on storage.objects for select to authenticated using(bucket_id='profile-photos' and private.can_read_room_profile_photo(name));

-- Media completion and avatar changes invalidate authorized clients using IDs only.
create function private.broadcast_room_media() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.target_type='meetup_room_message' and new.status is distinct from old.status then
 perform realtime.send(jsonb_build_object('roomId',new.target_id),'message_changed','hittingur:'||new.target_id::text,true); end if;
 return new; end $$;
create trigger meetup_room_upload_broadcast after update of status on private.media_uploads for each row execute function private.broadcast_room_media();
create function private.cleanup_room_avatar() returns trigger language plpgsql security definer set search_path='' as $$
declare room uuid; begin
 room:=case when tg_op='DELETE' then old.room_id else new.room_id end;
 if tg_op='DELETE' or tg_op='UPDATE' and old.storage_path is distinct from new.storage_path then
 insert into private.media_cleanup_jobs(bucket,name) values('meetup-room-media',old.storage_path) on conflict do nothing; end if;
 perform realtime.send(jsonb_build_object('roomId',room),'membership_changed','hittingur:'||room::text,true);
 return null; end $$;
create trigger meetup_room_avatar_cleanup after insert or update or delete on private.meetup_room_avatars for each row execute function private.cleanup_room_avatar();
create function private.cleanup_room_upload() returns trigger language plpgsql security definer set search_path='' as $$
declare item private.media_uploads; available timestamptz; begin
 item:=case when tg_op='DELETE' then old else new end;
 if item.target_type not in ('meetup_room_message','meetup_room_avatar') then return item; end if;
 if tg_op='DELETE' or item.status='rejected' and item.rejection_reason in ('upload_cancelled','media_target_unavailable') then
 available:=greatest(now(),case when old.status='processing' then old.expires_at else now() end);
 insert into private.media_cleanup_jobs(bucket,name,available_at) values('meetup-room-media',item.target_id::text||'/'||item.id::text||case when item.media_type='image' then '.jpg' else '.mp4' end,available) on conflict do nothing;
 if item.media_type='video' then insert into private.media_cleanup_jobs(bucket,name,available_at) values('meetup-room-media',item.target_id::text||'/'||item.id::text||'-thumb.jpg',available) on conflict do nothing; end if;
 if tg_op='DELETE' or item.rejection_reason in ('upload_cancelled','media_target_unavailable') then
 insert into private.media_cleanup_jobs(bucket,name,available_at) values('media-quarantine',item.object_path,available) on conflict do nothing; end if;
 end if; return item; end $$;
create trigger meetup_room_upload_cleanup after update of status or delete on private.media_uploads for each row execute function private.cleanup_room_upload();
create function private.cleanup_room_message_media() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.media_uploads set status='rejected',rejection_reason='media_target_unavailable',claim_id=null where id=old.upload_id;
 return old; end $$;
create trigger meetup_room_message_media_cleanup after delete on private.meetup_room_message_media for each row execute function private.cleanup_room_message_media();

alter function private.list_meetup_chats_impl() rename to list_meetup_chats_before_media;
create function private.list_meetup_chats_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin return coalesce((select jsonb_agg(item||jsonb_strip_nulls(jsonb_build_object(
 'avatarPath',case when not (item->>'isPaused')::boolean then (select a.storage_path from private.meetup_room_avatars a join private.media_uploads u on u.id=a.upload_id where a.room_id=(item->>'id')::uuid and u.status='approved') end,
 'lastMessageKind',(select msg.kind from public.meetup_room_messages msg where msg.room_id=(item->>'id')::uuid and msg.hidden_at is null
 and not (item->>'isPaused')::boolean and (msg.sender_id is null or not private.meetup_block_exists((select auth.uid()),msg.sender_id)) order by msg.created_at desc,msg.id desc limit 1))) order by ord)
 from jsonb_array_elements(private.list_meetup_chats_before_media()) with ordinality rows(item,ord)),'[]'); end $$;
create or replace function public.list_meetup_chats() returns jsonb language sql stable security invoker set search_path='' as $$select private.list_meetup_chats_impl();$$;

alter function private.account_owns_stored_object(uuid,text,text,text) rename to account_owns_stored_object_before_room_media;
create function private.account_owns_stored_object(p_account uuid,p_bucket text,p_name text,p_owner text) returns boolean language sql stable security definer set search_path='' as $$
 select private.account_owns_stored_object_before_room_media(p_account,p_bucket,p_name,p_owner) or p_bucket='meetup-room-media' and exists(select 1 from private.media_uploads u
 where u.owner_id=p_account and u.target_type in ('meetup_room_message','meetup_room_avatar') and p_name in(u.target_id::text||'/'||u.id::text||'.jpg',u.target_id::text||'/'||u.id::text||'.mp4',u.target_id::text||'/'||u.id::text||'-thumb.jpg'));
$$;
alter function private.owns_export_media(text,text,text) rename to owns_export_media_before_room_media;
create function private.owns_export_media(p_bucket text,p_name text,p_owner text) returns boolean language sql stable security definer set search_path='' as $$
 select private.owns_export_media_before_room_media(p_bucket,p_name,p_owner) or p_bucket='meetup-room-media' and private.can_read_meetup_room_media(p_name)
 and private.account_owns_stored_object((select auth.uid()),p_bucket,p_name,p_owner);
$$;
alter function private.export_account_impl() rename to export_account_before_room_media;
create function private.export_account_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 return private.export_account_before_room_media()||jsonb_build_object('meetupRoomMedia',coalesce((select jsonb_agg(to_jsonb(mm)) from private.meetup_room_message_media mm where owner_id=caller),'[]'),
 'meetupRoomAvatars',coalesce((select jsonb_agg(to_jsonb(a)) from private.meetup_room_avatars a where owner_id=caller),'[]')); end $$;
alter view private.recoverable_media rename to recoverable_media_before_room_media;
create view private.recoverable_media as select * from private.recoverable_media_before_room_media
 union select 'meetup-room-media'::text,path,mm.owner_id from private.meetup_room_message_media mm join public.meetup_room_messages msg on msg.id=mm.message_id
 join private.media_uploads u on u.id=mm.upload_id join public.meetup_rooms r on r.id=mm.room_id join public.meetups m on m.id=r.meetup_id
 cross join lateral unnest(array[u.normalized_path,u.thumbnail_path]) paths(path)
 where u.status='approved' and path is not null and msg.hidden_at is null and r.status in ('open','locked') and r.reading_closes_at>now()
 and m.status='published' and private.meetup_actor_is_active(mm.owner_id) and private.meetup_actor_is_active(m.host_id)
 union select 'meetup-room-media',a.storage_path,a.owner_id from private.meetup_room_avatars a join public.meetup_rooms r on r.id=a.room_id
 join private.media_uploads u on u.id=a.upload_id join public.meetups m on m.id=r.meetup_id where u.status='approved'
 and r.status in ('open','locked') and r.reading_closes_at>now() and m.status='published' and private.meetup_actor_is_active(a.owner_id);
revoke all on private.recoverable_media,private.recoverable_media_before_room_media from public,anon,authenticated,service_role;

-- Expired rooms become inaccessible immediately; their normalized files drain through cleanup.
alter function private.process_hittumst_lifecycle_impl() rename to process_hittumst_lifecycle_before_room_media;
create function private.process_hittumst_lifecycle_impl() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; begin
 perform private.require_service_role(); result:=private.process_hittumst_lifecycle_before_room_media();
 update private.media_uploads u set status='rejected',rejection_reason='media_target_unavailable',claim_id=null
 from public.meetup_rooms r where u.target_type in ('meetup_room_message','meetup_room_avatar') and u.target_id=r.id
 and u.status<>'rejected' and (r.reading_closes_at<=now() or r.status in ('closed','hidden'));
 delete from private.meetup_room_avatars a using public.meetup_rooms r where a.room_id=r.id and r.reading_closes_at<=now();
 return result; end $$;
create or replace function public.process_hittumst_lifecycle() returns jsonb language sql security invoker set search_path='' as $$select private.process_hittumst_lifecycle_impl();$$;

revoke all on function private.room_can_post(uuid,uuid),private.room_can_manage_avatar(uuid,uuid),private.room_profile_payload(uuid),
 private.list_meetup_room_members_impl(uuid),public.list_meetup_room_members(uuid),private.get_meetup_room_summary_impl(uuid),
 private.media_target_available(uuid,text,uuid,uuid),private.reserve_media_upload_impl(text,uuid,text,jsonb),private.finish_media_impl(uuid,uuid,integer,integer,text,text,text),
 private.send_meetup_room_media_once_impl(uuid,uuid,uuid,text),public.send_meetup_room_media_once(uuid,uuid,uuid,text),
 private.send_room_message_once_impl(uuid,uuid,text),
 private.remove_meetup_room_avatar_impl(uuid),public.remove_meetup_room_avatar(uuid),private.can_read_meetup_room_media(text),private.can_read_room_profile_photo(text),
 private.broadcast_room_media(),private.cleanup_room_avatar(),private.cleanup_room_upload(),private.cleanup_room_message_media(),
 private.list_meetup_chats_impl(),private.account_owns_stored_object(uuid,text,text,text),private.owns_export_media(text,text,text),private.export_account_impl(),private.process_hittumst_lifecycle_impl()
 from public,anon,authenticated,service_role;
grant execute on function private.list_meetup_room_members_impl(uuid),public.list_meetup_room_members(uuid),private.get_meetup_room_summary_impl(uuid),
 private.reserve_media_upload_impl(text,uuid,text,jsonb),private.send_meetup_room_media_once_impl(uuid,uuid,uuid,text),public.send_meetup_room_media_once(uuid,uuid,uuid,text),
 private.send_room_message_once_impl(uuid,uuid,text),
 private.remove_meetup_room_avatar_impl(uuid),public.remove_meetup_room_avatar(uuid),private.can_read_meetup_room_media(text),private.can_read_room_profile_photo(text),
 private.list_meetup_chats_impl(),private.export_account_impl() to authenticated;
grant execute on function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text),private.process_hittumst_lifecycle_impl() to service_role;
