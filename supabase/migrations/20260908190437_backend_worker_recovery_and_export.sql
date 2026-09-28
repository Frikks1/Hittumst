-- Retryable processing and durable deletion of approved raw originals. No retention
-- period for rejected/appealed evidence is invented by this engineering change.
alter table private.media_uploads add column last_error text;
create index media_upload_claims on private.media_uploads(expires_at,created_at) where status in ('reserved','processing');
create table private.media_cleanup_jobs (
 id uuid primary key default gen_random_uuid(),
 bucket text not null check(bucket='media-quarantine'), name text not null,
 status text not null default 'pending' check(status in ('pending','processing','failed','complete')),
 attempts integer not null default 0, claim_id uuid, lease_until timestamptz,
 available_at timestamptz not null default now(), completed_at timestamptz,
 unique(bucket,name)
);
alter table private.media_cleanup_jobs enable row level security;
revoke all on private.media_cleanup_jobs from public,anon,authenticated,service_role;
create index media_cleanup_pending on private.media_cleanup_jobs(available_at) where status in ('pending','processing');
insert into private.media_cleanup_jobs(bucket,name)
 select 'media-quarantine',u.object_path from private.media_uploads u
 join storage.objects o on o.bucket_id='media-quarantine' and o.name=u.object_path where u.status='approved'
 on conflict do nothing;

create or replace function private.claim_media_impl(p_claim uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.media_uploads;
begin
 perform private.require_service_role();
 if p_claim is null then raise exception 'claim_required'; end if;
 update private.media_uploads set status='rejected',rejection_reason='processing_failed_requires_review',claim_id=null
 where status='processing' and expires_at<now() and attempts>=5;
 select u.* into job from private.media_uploads u
 join public.profiles p on p.id=u.owner_id join public.albums a on a.id=u.album_id
 where ((u.status='reserved' and u.expires_at>now()) or (u.status='processing' and u.expires_at<now()))
 and p.deletion_requested_at is null and p.moderation_status='active' and a.deleted_at is null
 and u.attempts<5 and exists(select 1 from storage.objects o where o.bucket_id='media-quarantine' and o.name=u.object_path)
 order by u.created_at for update of u skip locked limit 1;
 if not found then return null; end if;
 update private.media_uploads set status='processing',claim_id=p_claim,attempts=attempts+1,expires_at=now()+interval '15 minutes',last_error=null
 where id=job.id returning * into job;
 return to_jsonb(job);
end $$;

alter function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) rename to finish_media_before_cleanup_impl;
create function private.finish_media_impl(p_id uuid,p_claim uuid,p_bytes integer,p_duration integer,p_path text,p_thumbnail text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare job private.media_uploads; result boolean;
begin
 perform private.require_service_role();
 select * into job from private.media_uploads where id=p_id for update;
 if not found or p_claim is null or job.claim_id is distinct from p_claim or job.status<>'processing' or job.expires_at<now() then return false; end if;
 if not exists(select 1 from public.profiles p join public.albums a on a.owner_id=p.id where p.id=job.owner_id and p.deletion_requested_at is null and p.moderation_status='active' and a.id=job.album_id and a.deleted_at is null) then return false; end if;
 if p_reason is null and p_thumbnail is distinct from job.owner_id::text||'/'||job.album_id::text||'/'||job.id::text||'-thumb.jpg' then raise exception 'invalid_verified_thumbnail'; end if;
 result:=private.finish_media_before_cleanup_impl(p_id,p_claim,p_bytes,p_duration,p_path,p_thumbnail,p_reason);
 if result and p_reason is null then
   insert into private.media_cleanup_jobs(bucket,name) values('media-quarantine',job.object_path) on conflict do nothing;
 end if;
 return result;
end $$;
create or replace function public.finish_media_upload(job_id uuid,claim_id uuid,byte_size integer,duration_ms integer,object_path text,thumbnail_path text,rejection_reason text) returns boolean
language sql security invoker set search_path='' as $$select private.finish_media_impl(job_id,claim_id,byte_size,duration_ms,object_path,thumbnail_path,rejection_reason);$$;
revoke all on function private.finish_media_before_cleanup_impl(uuid,uuid,integer,integer,text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) to service_role;

create function private.fail_media_upload_impl(p_id uuid,p_claim uuid,p_permanent boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare job private.media_uploads;
begin
 perform private.require_service_role();
 select * into job from private.media_uploads where id=p_id for update;
 if not found or p_claim is null or job.claim_id is distinct from p_claim or job.status<>'processing' or job.expires_at<now() then return false; end if;
 update private.media_uploads set claim_id=null,
 status=case when p_permanent or attempts>=5 then 'rejected' else 'processing' end,
 rejection_reason=case when p_permanent then 'invalid_media' when attempts>=5 then 'processing_failed_requires_review' else null end,
 last_error=case when p_permanent then 'invalid_media' else 'processing_retry_required' end,
 expires_at=now()+make_interval(secs=>least(3600,30*(2^attempts)::integer)) where id=p_id;
 return true;
end $$;
create function public.fail_media_upload(job_id uuid,claim_id uuid,permanent boolean default false) returns boolean language sql security invoker set search_path='' as $$select private.fail_media_upload_impl(job_id,claim_id,permanent);$$;

create function private.claim_media_cleanup_impl(p_claim uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_service_role();
 if p_claim is null then raise exception 'claim_required'; end if;
 update private.media_cleanup_jobs set status='failed',claim_id=null where status='processing' and lease_until<now() and attempts>=10;
 with picked as (select id from private.media_cleanup_jobs where attempts<10 and
 ((status='pending' and available_at<=now()) or (status='processing' and lease_until<now()))
 order by available_at for update skip locked limit 20), claimed as (
 update private.media_cleanup_jobs set status='processing',attempts=attempts+1,claim_id=p_claim,lease_until=now()+interval '5 minutes'
 where id in (select id from picked) returning id,bucket,name)
 select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from claimed c;
 return result;
end $$;
create function public.claim_media_cleanup(claim_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.claim_media_cleanup_impl(claim_id);$$;
create function private.finish_media_cleanup_impl(p_id uuid,p_claim uuid,p_succeeded boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare job private.media_cleanup_jobs;
begin
 perform private.require_service_role();
 select * into job from private.media_cleanup_jobs where id=p_id for update;
 if not found or p_claim is null or job.claim_id is distinct from p_claim or job.status<>'processing' or job.lease_until<now() then return false; end if;
 if p_succeeded and exists(select 1 from storage.objects where bucket_id=job.bucket and name=job.name) then raise exception 'media_cleanup_incomplete'; end if;
 update private.media_cleanup_jobs set status=case when p_succeeded then 'complete' when attempts>=10 then 'failed' else 'pending' end,
 completed_at=case when p_succeeded then now() else null end,claim_id=null,lease_until=null,
 available_at=now()+make_interval(secs=>least(3600,30*(2^attempts)::integer)) where id=p_id;
 return true;
end $$;
create function public.finish_media_cleanup(job_id uuid,claim_id uuid,succeeded boolean) returns boolean language sql security invoker set search_path='' as $$select private.finish_media_cleanup_impl(job_id,claim_id,succeeded);$$;
revoke all on function private.fail_media_upload_impl(uuid,uuid,boolean),public.fail_media_upload(uuid,uuid,boolean),private.claim_media_cleanup_impl(uuid),public.claim_media_cleanup(uuid),private.finish_media_cleanup_impl(uuid,uuid,boolean),public.finish_media_cleanup(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function private.fail_media_upload_impl(uuid,uuid,boolean),public.fail_media_upload(uuid,uuid,boolean),private.claim_media_cleanup_impl(uuid),public.claim_media_cleanup(uuid),private.finish_media_cleanup_impl(uuid,uuid,boolean),public.finish_media_cleanup(uuid,uuid,boolean) to service_role;

-- Sensitive bearer requests require a live session, not just an unexpired JWT.
create function private.has_current_session() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s where s.user_id=(select auth.uid()) and s.id::text=(select auth.jwt()->>'session_id') and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function private.has_current_session() from public,anon,authenticated,service_role;
create function private.get_financial_access_impl() returns boolean language sql stable security definer set search_path='' as $$
 select private.has_current_session() and private.account_is_active() and coalesce((select auth.jwt()->>'aal')='aal2',false)
 and exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=(select auth.uid())
 and u.raw_app_meta_data->'financial_operator'='true'::jsonb and p.moderation_status='active');
$$;
create function public.get_financial_access() returns boolean language sql stable security invoker set search_path='' as $$select private.get_financial_access_impl();$$;
revoke all on function private.get_financial_access_impl(),public.get_financial_access() from public,anon,authenticated,service_role;
grant execute on function private.get_financial_access_impl(),public.get_financial_access() to authenticated;

-- Metadata export includes owned stored files and the newest event-profile data.
-- Rejected/unprocessed quarantine bytes are not redistributed as downloads.
alter function private.export_account_impl() rename to export_account_before_media_impl;
create function private.export_account_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid());
begin
 if caller is null or not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 return private.export_account_before_media_impl()||jsonb_build_object(
 'mediaManifest',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'bucket',o.bucket_id,'name',o.name,'createdAt',o.created_at,
 'bytes',o.metadata->'size','downloadPath','/api/account/media/'||o.id::text) order by o.created_at,o.id)
 from storage.objects o where o.bucket_id in ('profile-photos','message-images','album-media','meetup-media')
 and (o.owner_id=caller::text or (storage.foldername(o.name))[1]=caller::text)),'[]'),
 'meetupGenderPreference',(select to_jsonb(g) from private.meetup_gender_preferences g where profile_id=caller),
 'meetupInvitations',coalesce((select jsonb_agg(to_jsonb(i)) from private.meetup_invitations i where profile_id=caller or exists(select 1 from public.meetups m where m.id=i.meetup_id and m.host_id=caller)),'[]'),
 'authoredMeetupReviews',coalesce((select jsonb_agg(to_jsonb(r)) from private.meetup_reviews r where author_id=caller),'[]'),
 'ownedMeetupMedia',coalesce((select jsonb_agg(to_jsonb(mm)) from private.meetup_media mm join public.meetups m on m.id=mm.meetup_id where m.host_id=caller),'[]'));
end $$;
revoke all on function private.export_account_impl(),private.export_account_before_media_impl() from public,anon,authenticated,service_role;
grant execute on function private.export_account_impl() to authenticated;
create or replace function public.export_account() returns jsonb language sql stable security invoker set search_path='' as $$select private.export_account_impl();$$;
create or replace function public.export_my_account() returns jsonb language sql stable security invoker set search_path='' as $$select private.export_account_impl();$$;
create function private.get_account_media_impl(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; caller uuid:=(select auth.uid());
begin
 if caller is null or not private.account_is_active() or not private.has_current_session() then raise exception using errcode='42501',message='account_unavailable'; end if;
 select jsonb_build_object('bucket',o.bucket_id,'name',o.name) into result from storage.objects o where o.id=p_id
 and o.bucket_id in ('profile-photos','message-images','album-media','meetup-media')
 and (o.owner_id=caller::text or (storage.foldername(o.name))[1]=caller::text);
 if result is null then raise exception using errcode='42501',message='media_unavailable'; end if;
 return result;
end $$;
create function public.get_account_media(object_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.get_account_media_impl(object_id);$$;
revoke all on function private.get_account_media_impl(uuid),public.get_account_media(uuid) from public,anon,authenticated,service_role;
grant execute on function private.get_account_media_impl(uuid),public.get_account_media(uuid) to authenticated;

-- Text sends carry a client UUID so an uncertain response can be retried safely.
-- Existing participant and sender RLS checks remain mandatory.
grant insert(id) on public.messages to authenticated;
