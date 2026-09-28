-- Approved, still-referenced media only. Quarantine/evidence and deleted accounts are excluded.
create view private.recoverable_media as
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
where m.status in ('draft','published') and p.deletion_requested_at is null and p.moderation_status='active';
revoke all on private.recoverable_media from public,anon,authenticated,service_role;

create function private.recovery_media_manifest_impl(p_after text,p_limit integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_service_role();
 if p_after is null or length(p_after)>1024 or p_limit is null or p_limit not between 1 and 500 then raise exception 'invalid_manifest_page'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('bucket',r.bucket,'name',r.name,'ownerId',r.owner_id) order by r.bucket,r.name)
 from (select bucket,name,owner_id from private.recoverable_media where bucket||'/'||name>p_after order by bucket,name limit p_limit) r),'[]');
end $$;
create function public.get_recovery_media_manifest(after_key text default '',batch_size integer default 500) returns jsonb
language sql stable security invoker set search_path='' as $$select private.recovery_media_manifest_impl(after_key,batch_size);$$;
create function private.recovery_media_current_impl(p_bucket text,p_name text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_service_role();
 return exists(select 1 from private.recoverable_media where bucket=p_bucket and name=p_name);
end $$;
create function public.recovery_media_is_current(bucket text,object_path text) returns boolean
language sql stable security invoker set search_path='' as $$select private.recovery_media_current_impl(bucket,object_path);$$;
revoke all on function private.recovery_media_manifest_impl(text,integer),public.get_recovery_media_manifest(text,integer),
private.recovery_media_current_impl(text,text),public.recovery_media_is_current(text,text) from public,anon,authenticated,service_role;
grant execute on function private.recovery_media_manifest_impl(text,integer),public.get_recovery_media_manifest(text,integer),
private.recovery_media_current_impl(text,text),public.recovery_media_is_current(text,text) to service_role;
