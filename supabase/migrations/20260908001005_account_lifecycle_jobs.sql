-- Durable account deletion. Requesting deletion removes access before asynchronous cleanup.
alter table public.profiles add column deletion_requested_at timestamptz;
create table private.account_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique,
  status text not null default 'pending' check(status in ('pending','processing','failed','complete')),
  objects jsonb not null default '[]' check(jsonb_typeof(objects)='array'),
  attempts integer not null default 0,
  claim_token uuid,
  lease_until timestamptz,
  available_at timestamptz not null default now(),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text
);
create index account_deletion_pending on private.account_deletion_jobs(available_at) where status in ('pending','processing');
alter table private.account_deletion_jobs enable row level security;
revoke all on private.account_deletion_jobs from public, anon, authenticated, service_role;

create function private.account_is_active() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=(select auth.uid()) and p.deletion_requested_at is null);
$$;
revoke all on function private.account_is_active() from public;
grant execute on function private.account_is_active() to authenticated, anon, service_role;

-- Restrictive policies also protect Storage and authorized Realtime reads from old JWTs.
do $$ declare rel record; begin
  for rel in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and c.relrowsecurity and (n.nspname='public' or (n.nspname='storage' and c.relname='objects') or (n.nspname='realtime' and c.relname='messages'))
  loop
    execute format('create policy account_must_be_active on %I.%I as restrictive for all to authenticated using ((select private.account_is_active())) with check ((select private.account_is_active()))',rel.nspname,rel.relname);
  end loop;
end; $$;

create function private.check_account_access_impl() returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is not null and not private.account_is_active()
    and coalesce(current_setting('request.path',true),'') <> '/rpc/delete_my_account' then
    raise exception using errcode='42501',message='account_unavailable';
  end if;
end; $$;
create function public.check_account_access() returns void
language sql stable security invoker set search_path='' as $$ select private.check_account_access_impl(); $$;
revoke all on function private.check_account_access_impl(),public.check_account_access() from public;
grant execute on function private.check_account_access_impl(),public.check_account_access() to anon,authenticated,service_role;
alter role authenticator set pgrst.db_pre_request = 'public.check_account_access';
notify pgrst, 'reload config';

create or replace function private.delete_my_account_impl() returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid := (select auth.uid()); hosted record;
begin
  if caller is null or not exists(select 1 from auth.users where id=caller) then
    raise exception using errcode='28000',message='authentication_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text||':delete',0));
  if exists(select 1 from private.account_deletion_jobs where account_id=caller) then return; end if;
  insert into private.account_deletion_jobs(account_id,objects)
    select caller,coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'name',o.name)),'[]'::jsonb)
    from storage.objects o where o.owner_id=caller::text or (storage.foldername(o.name))[1]=caller::text;
  -- Cancel before hiding the host, so only one cancellation notice is enqueued.
  for hosted in update public.meetups set status='cancelled',cancelled_at=now(),moderation_reason=null
    where host_id=caller and status in ('published','moderation_hidden') and published_at is not null returning id
  loop
    perform private.capture_meetup_revision(hosted.id,'cancelled',caller);
    perform private.notify_meetup_participants(hosted.id,'meetup_cancelled','{}'::jsonb);
  end loop;
  update public.meetup_series set status='cancelled' where host_id=caller and status<>'cancelled';
  update public.meetup_participations set status='removed',removed_at=now()
    where profile_id=caller and status in ('joined','approved','pending');
  update public.meetup_room_memberships set status='removed',pause_reason=null where profile_id=caller;
  update public.album_shares set status='revoked',revoked_at=now() where caller in (owner_id,recipient_id) and status in ('pending','accepted');
  update public.album_view_sessions set closed_at=now() where viewer_id=caller or share_id in (select id from public.album_shares where owner_id=caller);
  update public.conversation_members set deleted_at=now() where conversation_id in (select id from public.conversations where caller in (participant_low,participant_high));
  update private.push_tokens set enabled=false,disabled_at=now(),disabled_reason='account_deletion' where profile_id=caller and enabled;
  perform private.prepare_account_deletion_impl();
  update public.profiles set deletion_requested_at=now(),is_profile_visible=false,is_location_sharing_enabled=false where id=caller;
  delete from private.private_locations where profile_id=caller;
  delete from auth.sessions where user_id=caller;
end; $$;

create function private.claim_account_deletions_impl(p_token uuid,p_batch integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.require_service_role();
  if p_token is null then raise exception 'claim_token_required'; end if;
  update private.account_deletion_jobs set status='failed',last_error='cleanup_retry_required'
    where status='processing' and attempts>=10 and lease_until<now();
  with picked as (
    select id from private.account_deletion_jobs where attempts<10 and
      ((status='pending' and available_at<=now()) or (status='processing' and lease_until<now()))
      order by available_at for update skip locked limit least(greatest(p_batch,1),2)
  ), claimed as (
    update private.account_deletion_jobs j set status='processing',attempts=attempts+1,claim_token=p_token,lease_until=now()+interval '10 minutes',
      objects=(select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'name',o.name)),'[]'::jsonb) from storage.objects o where o.owner_id=j.account_id::text or (storage.foldername(o.name))[1]=j.account_id::text)
      where id in (select id from picked) returning j.id,j.account_id,j.objects
  ) select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into result from claimed c;
  return result;
end; $$;
create function public.claim_account_deletions(claim_token uuid,batch_size integer default 1) returns jsonb
language sql security invoker set search_path='' as $$ select private.claim_account_deletions_impl(claim_token,batch_size); $$;

create function private.finish_account_deletion_impl(p_id uuid,p_token uuid,p_succeeded boolean) returns void
language plpgsql security definer set search_path='' as $$
declare job private.account_deletion_jobs%rowtype;
begin
  perform private.require_service_role();
  select * into job from private.account_deletion_jobs where id=p_id for update;
  if job.status='complete' then return; end if;
  if job.id is null or job.status<>'processing' or job.claim_token is distinct from p_token or job.lease_until<now() then
    raise exception using errcode='42501',message='deletion_claim_expired';
  end if;
  if p_succeeded then
    if exists(select 1 from auth.users where id=job.account_id) or exists(select 1 from storage.objects where owner_id=job.account_id::text or (storage.foldername(name))[1]=job.account_id::text) then
      raise exception 'deletion_cleanup_incomplete';
    end if;
    update private.account_deletion_jobs set status='complete',objects='[]',completed_at=now(),last_error=null,claim_token=null,lease_until=null where id=p_id;
  else
    update private.account_deletion_jobs set status=case when attempts>=10 then 'failed' else 'pending' end,
      last_error='cleanup_retry_required',available_at=now()+make_interval(secs=>least(3600,30*(2^attempts)::integer)),claim_token=null,lease_until=null where id=p_id;
  end if;
end; $$;
create function public.finish_account_deletion(job_id uuid,claim_token uuid,succeeded boolean) returns void
language sql security invoker set search_path='' as $$ select private.finish_account_deletion_impl(job_id,claim_token,succeeded); $$;
revoke all on function public.claim_account_deletions(uuid,integer),private.claim_account_deletions_impl(uuid,integer),public.finish_account_deletion(uuid,uuid,boolean),private.finish_account_deletion_impl(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_account_deletions(uuid,integer),private.claim_account_deletions_impl(uuid,integer),public.finish_account_deletion(uuid,uuid,boolean),private.finish_account_deletion_impl(uuid,uuid,boolean) to service_role;
