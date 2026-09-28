-- Private worker liveness and aggregate queue diagnostics. No member data in responses.
create table private.worker_heartbeats (
 name text primary key check(name in ('account-deletion','media','commerce','push','voice')),
 state text not null check(state in ('running','passed','failed')),
 updated_at timestamptz not null default now(),
 last_success_at timestamptz,
 batches integer not null default 0 check(batches between 0 and 100)
);
alter table private.worker_heartbeats enable row level security;
revoke all on private.worker_heartbeats from public,anon,authenticated,service_role;

create function private.record_worker_heartbeat_impl(p_name text,p_state text,p_batches integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_service_role();
 if p_name not in ('account-deletion','media','commerce','push','voice') or p_state not in ('running','passed','failed')
   or p_batches is null or p_batches not between 0 and 100 then raise exception 'invalid_worker_heartbeat'; end if;
 insert into private.worker_heartbeats(name,state,batches,last_success_at)
 values(p_name,p_state,p_batches,case when p_state='passed' then now() end)
 on conflict(name) do update set state=excluded.state,batches=excluded.batches,updated_at=now(),
 last_success_at=case when excluded.state='passed' then now() else private.worker_heartbeats.last_success_at end;
end $$;
create function public.record_worker_heartbeat(worker_name text,worker_state text,batches integer default 0)
returns void language sql security invoker set search_path='' as $$
 select private.record_worker_heartbeat_impl(worker_name,worker_state,batches);
$$;

create function private.worker_health_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare workers jsonb; queues jsonb;
begin
 perform private.require_service_role();
 select coalesce(jsonb_object_agg(name,jsonb_build_object('state',state,
 'ageSeconds',greatest(0,extract(epoch from(now()-updated_at))::integer),
 'successAgeSeconds',case when last_success_at is null then null else greatest(0,extract(epoch from(now()-last_success_at))::integer) end)), '{}')
 into workers from private.worker_heartbeats;
 select jsonb_build_object(
 'media',jsonb_build_object(
 'pending',(select count(*) from private.media_uploads u where u.status in ('reserved','processing') and exists(select 1 from storage.objects o where o.bucket_id='media-quarantine' and o.name=u.object_path)),
 'overdue',(select count(*) from private.media_uploads u where u.status in ('reserved','processing') and u.created_at<now()-interval '15 minutes' and exists(select 1 from storage.objects o where o.bucket_id='media-quarantine' and o.name=u.object_path)),
 'failed',(select count(*) from private.media_uploads where status='rejected' and rejection_reason='processing_failed_requires_review')),
 'cleanup',jsonb_build_object(
 'pending',(select count(*) from private.media_cleanup_jobs where status in ('pending','processing')),
 'overdue',(select count(*) from private.media_cleanup_jobs where status in ('pending','processing') and available_at<now()-interval '15 minutes'),
 'failed',(select count(*) from private.media_cleanup_jobs where status='failed')),
 'accountDeletion',jsonb_build_object(
 'pending',(select count(*) from private.account_deletion_jobs where status in ('pending','processing')),
 'overdue',(select count(*) from private.account_deletion_jobs where status in ('pending','processing') and requested_at<now()-interval '15 minutes'),
 'failed',(select count(*) from private.account_deletion_jobs where status='failed')),
 'push',jsonb_build_object(
 'pending',(select count(*) from private.notification_outbox where status in ('pending','processing','failed')),
 'overdue',(select count(*) from private.notification_outbox where status in ('pending','processing','failed') and created_at<now()-interval '15 minutes'),
 'failed',(select count(*) from private.notification_outbox where status='failed' and attempts>=10))
 ) into queues;
 return jsonb_build_object('workers',workers,'queues',queues);
end $$;
create function public.get_worker_health() returns jsonb
language sql security invoker set search_path='' as $$select private.worker_health_impl();$$;
revoke all on function private.record_worker_heartbeat_impl(text,text,integer),public.record_worker_heartbeat(text,text,integer),
 private.worker_health_impl(),public.get_worker_health() from public,anon,authenticated,service_role;
grant execute on function private.record_worker_heartbeat_impl(text,text,integer),public.record_worker_heartbeat(text,text,integer),
 private.worker_health_impl(),public.get_worker_health() to service_role;

