alter table private.media_uploads drop constraint media_uploads_target_type_check;
alter table private.media_uploads add constraint media_uploads_target_type_check check(target_type in ('album','profile_photo','profile_video','message','meetup','group','message_video'));
update storage.buckets set allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm'] where id='media-quarantine';
update storage.buckets set file_size_limit=52428800,allowed_mime_types=array['image/jpeg','image/png','image/webp','video/mp4'] where id='message-images';
create table private.group_media (
 id uuid primary key references private.media_uploads(id) on delete cascade,
 group_id uuid not null references public.groups(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade,
 path text not null unique, kind text not null check(kind in ('image','video')),
 caption text not null default '' check(char_length(caption)<=500),
 cover boolean not null default false, created_at timestamptz not null default now()
);
create index group_media_group on private.group_media(group_id,created_at desc);
alter table private.group_media enable row level security;
revoke all on private.group_media from public,anon,authenticated;

alter function private.media_target_available(uuid,text,uuid,uuid) rename to media_target_before_trains;
create function private.media_target_available(p_owner uuid,p_type text,p_target uuid,p_album uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when p_type='group' then private.group_member_role(p_target,p_owner) is not null and exists(select 1 from public.groups where id=p_target and status='active')
 when p_type='message_video' then private.media_target_before_trains(p_owner,'message',p_target,p_album)
 else private.media_target_before_trains(p_owner,p_type,p_target,p_album) end;
$$;
alter function private.reserve_media_upload_impl(text,uuid,text,jsonb) rename to reserve_media_before_trains;
create function private.reserve_media_upload_impl(p_type text,p_target uuid,p_kind text,p_metadata jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); v_id uuid:=gen_random_uuid();
begin
 if p_type not in ('group','message_video') then return private.reserve_media_before_trains(p_type,p_target,p_kind,p_metadata); end if;
 if not private.current_user_is_ready(false) or not private.media_target_available(caller,p_type,p_target,null) then raise exception using errcode='42501',message='media_target_unavailable'; end if;
 if p_type='message_video' and not private.can_message(p_target) then raise exception using errcode='42501',message='conversation_access_denied'; end if;
 if p_kind is null or p_kind not in ('image','video') or (p_type='message_video' and p_kind<>'video') then raise exception 'invalid_media_type'; end if;
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or pg_column_size(p_metadata)>4096 or char_length(coalesce(p_metadata->>'caption',''))>500 then raise exception 'invalid_media_metadata'; end if;
 if coalesce((p_metadata->>'cover')::boolean,false) and (p_type<>'group' or private.group_member_role(p_target,caller) not in ('owner','admin')) then raise exception using errcode='42501',message='group_admin_required'; end if;
 perform private.consume_write_quota('camera_media',20,interval '1 minute');
 insert into private.media_uploads(id,owner_id,target_type,target_id,media_type,object_path,metadata)
 values(v_id,caller,p_type,p_target,p_kind,caller::text||'/'||v_id::text,jsonb_build_object('cover',coalesce((p_metadata->>'cover')::boolean,false),'caption',coalesce(p_metadata->>'caption','')));
 if p_type='message_video' then insert into public.messages(id,conversation_id,sender_id,body,media_status) values(v_id,p_target,caller,'[media_pending]','pending');
 else insert into public.group_messages(id,group_id,sender_id,body) values(v_id,p_target,caller,'[media_pending]'); end if;
 return jsonb_build_object('id',v_id,'path',caller::text||'/'||v_id::text,'bucket','media-quarantine');
end; $$;
create or replace function public.reserve_media_upload(target_type text,target_id uuid,media_type text,metadata jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select private.reserve_media_upload_impl(target_type,target_id,media_type,metadata); $$;

alter function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) rename to finish_media_before_trains;
create function private.finish_media_impl(p_id uuid,p_claim uuid,p_bytes integer,p_duration integer,p_path text,p_thumbnail text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare job private.media_uploads; expected text;
begin
 perform private.require_service_role();
 select * into job from private.media_uploads where id=p_id for update;
 if job.target_type not in ('group','message_video') then return private.finish_media_before_trains(p_id,p_claim,p_bytes,p_duration,p_path,p_thumbnail,p_reason); end if;
 if job.id is null or p_claim is null or job.claim_id is distinct from p_claim or job.status<>'processing' or job.expires_at<now() then return false; end if;
 if not private.media_target_available(job.owner_id,job.target_type,job.target_id,null) then p_reason:='media_target_unavailable'; end if;
 if p_reason is not null then
   update private.media_uploads set status='rejected',rejection_reason=p_reason,claim_id=null where id=p_id;
   update public.messages set body='[media_rejected]',media_status='rejected' where id=p_id and media_status='pending';
   update public.group_messages set body='[media_rejected]' where id=p_id;
   return true;
 end if;
 expected:=job.owner_id::text||'/'||job.id::text||case when job.media_type='image' then '.jpg' else '.mp4' end;
 if p_path is distinct from expected or p_thumbnail is not null or p_bytes is null or p_bytes not between 1 and 52428800
  or (job.media_type='video' and (p_duration is null or p_duration not between 1 and 60000)) then raise exception 'invalid_verified_media'; end if;
 if job.target_type='group' then
   if not exists(select 1 from public.group_messages where id=p_id and hidden_at is null) then raise exception 'media_target_unavailable'; end if;
   insert into private.group_media(id,group_id,sender_id,path,kind,cover,caption) values(p_id,job.target_id,job.owner_id,p_path,job.media_type,
    coalesce((job.metadata->>'cover')::boolean,false) and private.group_member_role(job.target_id,job.owner_id) in ('owner','admin'),coalesce(job.metadata->>'caption',''));
   update public.group_messages set body=case when job.media_type='video' then '[video]' else '[photo]' end where id=p_id;
 else
   update public.messages set body=null,image_path=p_path,message_kind='image',media_status='approved' where id=p_id and sender_id=job.owner_id and deleted_at is null and media_status in ('pending','rejected');
   if not found then raise exception 'media_target_unavailable'; end if;
 end if;
 update private.media_uploads set status='approved',verified_bytes=p_bytes,verified_duration_ms=p_duration,normalized_path=p_path,claim_id=null where id=p_id;
 insert into private.media_cleanup_jobs(bucket,name) values('media-quarantine',job.object_path) on conflict do nothing;
 return true;
end; $$;
create or replace function public.finish_media_upload(job_id uuid,claim_id uuid,byte_size integer,duration_ms integer,object_path text,thumbnail_path text,rejection_reason text) returns boolean
language sql security invoker set search_path='' as $$select private.finish_media_impl(job_id,claim_id,byte_size,duration_ms,object_path,thumbnail_path,rejection_reason);$$;

create function private.can_read_group_media(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.current_user_is_ready(false) and exists(select 1 from private.group_media m join public.group_messages gm on gm.id=m.id
 where m.path=p_path and gm.hidden_at is null and private.group_member_role(m.group_id,(select auth.uid())) is not null
 and not private.meetup_block_exists((select auth.uid()),m.sender_id));
$$;
create policy group_media_read on storage.objects for select to authenticated using(bucket_id='message-images' and private.can_read_group_media(name));
create function private.group_media_list_impl(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.current_user_is_ready(false) or private.group_member_role(p_id,(select auth.uid())) is null then raise exception using errcode='42501',message='active_group_membership_required'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'path',path,'kind',kind,'caption',caption,'cover',cover,'senderId',sender_id,'createdAt',created_at) order by created_at desc)
 from (select * from private.group_media where group_id=p_id and private.can_read_group_media(path) order by created_at desc limit 100) m),'[]');
end; $$;
create function public.group_media_list(group_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.group_media_list_impl(group_id); $$;
create function private.cleanup_group_media() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into private.media_cleanup_jobs(bucket,name) values('message-images',old.path) on conflict do nothing; return old; end; $$;
create trigger group_media_cleanup after delete on private.group_media for each row execute function private.cleanup_group_media();
revoke all on function private.media_target_before_trains(uuid,text,uuid,uuid),private.media_target_available(uuid,text,uuid,uuid),
 private.reserve_media_before_trains(text,uuid,text,jsonb),private.reserve_media_upload_impl(text,uuid,text,jsonb),
 private.finish_media_before_trains(uuid,uuid,integer,integer,text,text,text),private.finish_media_impl(uuid,uuid,integer,integer,text,text,text),
 private.can_read_group_media(text),private.group_media_list_impl(uuid),public.group_media_list(uuid),private.cleanup_group_media() from public,anon,authenticated,service_role;
grant execute on function private.reserve_media_upload_impl(text,uuid,text,jsonb),private.can_read_group_media(text),private.group_media_list_impl(uuid),public.group_media_list(uuid) to authenticated;
grant execute on function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) to service_role;
notify pgrst,'reload schema';

create or replace view private.recoverable_media as
select 'profile-photos'::text bucket,x.storage_path name,p.id owner_id
from public.profile_photos x join public.profiles p on p.id=x.profile_id
where x.approval_status='approved' and p.deletion_requested_at is null and p.moderation_status='active'
union
select 'profile-videos',x.storage_path,p.id
from public.profile_videos x join public.profiles p on p.id=x.profile_id
where x.approval_status='approved' and p.deletion_requested_at is null and p.moderation_status='active'
union
select 'album-media',x.storage_path,p.id
from public.album_items x join public.albums a on a.id=x.album_id join public.profiles p on p.id=x.owner_id
where x.deleted_at is null and a.deleted_at is null and p.deletion_requested_at is null and p.moderation_status='active'
union
select 'album-media',u.thumbnail_path,p.id
from private.media_uploads u join public.album_items x on x.storage_path=u.normalized_path
join public.albums a on a.id=x.album_id join public.profiles p on p.id=x.owner_id
where u.status='approved' and u.thumbnail_path is not null and x.deleted_at is null and a.deleted_at is null
and p.deletion_requested_at is null and p.moderation_status='active'
union
select 'message-images',x.image_path,p.id
from public.messages x join public.profiles p on p.id=x.sender_id
where x.deleted_at is null and x.media_status='approved' and x.image_path is not null
and p.deletion_requested_at is null and p.moderation_status='active'
union
select 'meetup-media',x.storage_path,p.id
from private.meetup_media x join public.meetups m on m.id=x.meetup_id join public.profiles p on p.id=m.host_id
where m.status in ('draft','published') and p.deletion_requested_at is null and p.moderation_status='active'
union
select 'message-images',gm.path,p.id from private.group_media gm join public.group_messages m on m.id=gm.id
join public.profiles p on p.id=gm.sender_id join public.groups g on g.id=gm.group_id
where m.hidden_at is null and g.status<>'removed' and p.deletion_requested_at is null and p.moderation_status='active';

create function private.sync_train_media_failure() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='rejected' and new.target_type in ('group','message_video') then
   update public.messages set body='[media_rejected]',media_status='rejected' where id=new.id and media_status='pending';
   update public.group_messages set body='[media_rejected]' where id=new.id and body='[media_pending]';
 end if;
 return new;
end; $$;
create trigger train_media_failure after update of status on private.media_uploads for each row execute function private.sync_train_media_failure();
revoke all on function private.sync_train_media_failure() from public,anon,authenticated,service_role;

alter function private.export_account_impl() rename to export_account_before_trains;
create function private.export_account_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; caller uuid:=(select auth.uid());
begin
 result:=private.export_account_before_trains();
 return result||jsonb_build_object(
 'trainPlans',coalesce((select jsonb_agg(to_jsonb(p)) from private.train_plans p where recommended_by=caller),'[]'),
 'trainGoing',coalesce((select jsonb_agg(to_jsonb(g)) from private.train_going g where profile_id=caller),'[]'),
 'trainLocationShares',coalesce((select jsonb_agg(to_jsonb(l)) from private.train_locations l where profile_id=caller and expires_at>now()),'[]'),
 'groupMedia',coalesce((select jsonb_agg(to_jsonb(m)) from private.group_media m where sender_id=caller),'[]'));
end; $$;
create or replace function public.export_account() returns jsonb language sql stable security invoker set search_path='' as $$select private.export_account_impl();$$;
create or replace function public.export_my_account() returns jsonb language sql stable security invoker set search_path='' as $$select private.export_account_impl();$$;
revoke all on function private.export_account_before_trains(),private.export_account_impl() from public,anon,authenticated,service_role;
grant execute on function private.export_account_impl() to authenticated;
