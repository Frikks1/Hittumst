-- Service-only financial context never exposes locations, URLs or join codes.
create function private.finance_event_context_impl(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare event public.meetups;
begin
  select * into event from public.meetups where id=p_id and not is_explicit;
  if not found then raise exception 'event_unavailable'; end if;
  return jsonb_build_object('id',event.id,'hostId',event.host_id,'startsAt',event.starts_at,
    'endsAt',event.effective_end,'cancelled',event.status<>'published',
    'eligibleAttendees',coalesce((select jsonb_agg(profile_id) from public.meetup_participations where meetup_id=p_id and status in ('joined','approved')),'[]'::jsonb));
end $$;
create function public.finance_event_context(meetup_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.finance_event_context_impl(meetup_id); $$;
revoke all on function private.finance_event_context_impl(uuid),public.finance_event_context(uuid) from public,anon,authenticated,service_role;
grant execute on function private.finance_event_context_impl(uuid),public.finance_event_context(uuid) to service_role;

create table private.media_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  album_id uuid not null references public.albums(id) on delete cascade,
  media_type text not null check(media_type in ('image','video')),
  object_path text not null unique,
  status text not null default 'reserved' check(status in ('reserved','processing','approved','rejected','appealed')),
  created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '1 hour',
  claim_id uuid, attempts integer not null default 0, verified_bytes integer, verified_duration_ms integer,
  rejection_reason text, normalized_path text, thumbnail_path text
);
alter table private.media_uploads enable row level security;
revoke all on private.media_uploads from public,anon,authenticated,service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('media-quarantine','media-quarantine',false,31457280,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']) on conflict(id) do nothing;

create function private.reserve_album_upload_impl(p_album uuid,p_type text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); reservation uuid:=gen_random_uuid(); object_name text; limits jsonb; used integer; cap integer;
begin
  if caller is null or not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if p_type not in ('image','video') then raise exception 'invalid_media_type'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text||':tier',0));
  if not exists(select 1 from public.albums where id=p_album and owner_id=caller and deleted_at is null) then raise exception 'album_unavailable'; end if;
  limits:=private.tier_limits(private.member_tier(caller));
  if (select count(*) from public.albums where owner_id=caller and deleted_at is null)>(limits->>'albums')::integer then raise exception 'album_downgrade_limit'; end if;
  cap:=(limits->>case when p_type='image' then 'photos' else 'videos' end)::integer;
  select count(*) into used from public.album_items where album_id=p_album and media_type=p_type and deleted_at is null;
  used:=used+(select count(*) from private.media_uploads where album_id=p_album and media_type=p_type and status in ('reserved','processing','appealed') and expires_at>now());
  if used>=cap then raise exception using errcode='23514',message='album_media_limit_reached'; end if;
  object_name:=caller::text||'/'||reservation::text;
  insert into private.media_uploads(id,owner_id,album_id,media_type,object_path) values(reservation,caller,p_album,p_type,object_name);
  return jsonb_build_object('id',reservation,'path',object_name,'bucket','media-quarantine','expiresAt',now()+interval '1 hour');
end $$;
create function public.reserve_album_upload(album_id uuid,media_type text) returns jsonb language sql security invoker set search_path='' as $$ select private.reserve_album_upload_impl(album_id,media_type); $$;
create function private.can_upload_quarantine(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select private.account_is_active() and exists(select 1 from private.media_uploads where owner_id=(select auth.uid()) and object_path=p_name and status='reserved' and expires_at>now());
$$;
create policy quarantine_reserved_insert on storage.objects for insert to authenticated with check(bucket_id='media-quarantine' and private.can_upload_quarantine(name));
-- No member read/update policy: raw uploads stay invisible and cannot be replaced after inspection.
revoke all on function private.reserve_album_upload_impl(uuid,text),public.reserve_album_upload(uuid,text),private.can_upload_quarantine(text) from public,anon,authenticated,service_role;
grant execute on function private.reserve_album_upload_impl(uuid,text),public.reserve_album_upload(uuid,text),private.can_upload_quarantine(text) to authenticated;

create function private.claim_media_impl(p_claim uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.media_uploads;
begin
 update private.media_uploads set status='rejected',rejection_reason='processing_failed_requires_review',claim_id=null where status='processing' and expires_at<now() and attempts>=5;
 select u.* into job from private.media_uploads u where ((u.status='reserved' and u.expires_at>now()) or (u.status='processing' and u.expires_at<now()))
 and u.attempts<5 and exists(select 1 from storage.objects o where o.bucket_id='media-quarantine' and o.name=u.object_path)
 order by u.created_at for update skip locked limit 1;
 if not found then return null; end if;
 update private.media_uploads set status='processing',claim_id=p_claim,attempts=attempts+1,expires_at=now()+interval '15 minutes' where id=job.id;
 return to_jsonb(job);
end $$;
create function public.claim_media_upload(claim_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.claim_media_impl(claim_id); $$;
create function private.finish_media_impl(p_id uuid,p_claim uuid,p_bytes integer,p_duration integer,p_path text,p_thumbnail text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare job private.media_uploads; slot integer;
begin
 select * into job from private.media_uploads where id=p_id for update;
 if not found or job.status<>'processing' or job.claim_id<>p_claim or job.expires_at<now() then return false; end if;
 if p_reason is not null then update private.media_uploads set status='rejected',rejection_reason=p_reason,claim_id=null where id=p_id; return true; end if;
 if p_bytes is null or p_bytes not between 1 and 31457280 or (job.media_type='video' and (p_duration is null or p_duration not between 1 and 15000)) or p_path is null or p_path<>(job.owner_id::text||'/'||job.album_id::text||'/'||job.id::text||(case when job.media_type='image' then '.jpg' else '.mp4' end)) then raise exception 'invalid_verified_media'; end if;
 perform pg_advisory_xact_lock(hashtextextended(job.owner_id::text||':tier',0));
 select n into slot from generate_series(1,33) n where not exists(select 1 from public.album_items where album_id=job.album_id and position=n and deleted_at is null) order by n limit 1;
 insert into public.album_items(id,album_id,owner_id,storage_path,media_type,position,byte_size,duration_ms)
 values(job.id,job.album_id,job.owner_id,p_path,job.media_type,slot,p_bytes,p_duration);
 update private.media_uploads set status='approved',verified_bytes=p_bytes,verified_duration_ms=p_duration,normalized_path=p_path,thumbnail_path=p_thumbnail,claim_id=null where id=p_id;
 return true;
end $$;
create function public.finish_media_upload(job_id uuid,claim_id uuid,byte_size integer,duration_ms integer,object_path text,thumbnail_path text,rejection_reason text) returns boolean language sql security invoker set search_path='' as $$ select private.finish_media_impl(job_id,claim_id,byte_size,duration_ms,object_path,thumbnail_path,rejection_reason); $$;
revoke all on function private.claim_media_impl(uuid),public.claim_media_upload(uuid),private.finish_media_impl(uuid,uuid,integer,integer,text,text,text),public.finish_media_upload(uuid,uuid,integer,integer,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.claim_media_impl(uuid),public.claim_media_upload(uuid),private.finish_media_impl(uuid,uuid,integer,integer,text,text,text),public.finish_media_upload(uuid,uuid,integer,integer,text,text,text) to service_role;

drop policy album_media_objects_insert on storage.objects;
create function private.require_verified_album_media() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role',true)='authenticated' then raise exception using errcode='42501',message='media_inspection_required'; end if;
  return new;
end $$;
create trigger zz_album_media_inspection before insert on public.album_items for each row execute function private.require_verified_album_media();
revoke all on function private.require_verified_album_media() from public,anon,authenticated,service_role;

create function private.list_media_uploads_impl(p_album uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'status',status,'createdAt',created_at,'reason',rejection_reason)) from private.media_uploads where owner_id=(select auth.uid()) and album_id=p_album),'[]');
end $$;
create function public.list_media_uploads(album_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.list_media_uploads_impl(album_id);$$;
create function private.appeal_media_impl(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 update private.media_uploads set status='appealed',expires_at=now()+interval '7 days' where id=p_id and owner_id=(select auth.uid()) and status='rejected';
 if not found then raise exception 'appeal_unavailable'; end if;
end $$;
create function public.appeal_media_upload(upload_id uuid) returns void language sql security invoker set search_path='' as $$ select private.appeal_media_impl(upload_id); $$;
revoke all on function private.list_media_uploads_impl(uuid),public.list_media_uploads(uuid),private.appeal_media_impl(uuid),public.appeal_media_upload(uuid) from public,anon,authenticated,service_role;
grant execute on function private.list_media_uploads_impl(uuid),public.list_media_uploads(uuid),private.appeal_media_impl(uuid),public.appeal_media_upload(uuid) to authenticated;
