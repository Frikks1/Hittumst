-- Durable subscription reconciliation runs in the same dedicated worker.
alter table private.worker_heartbeats drop constraint worker_heartbeats_name_check;
alter table private.worker_heartbeats add constraint worker_heartbeats_name_check check(name in ('account-deletion','media','commerce','push','voice','billing'));
create or replace function private.record_worker_heartbeat_impl(p_name text,p_state text,p_batches integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_service_role();
 if p_name not in ('account-deletion','media','commerce','push','voice','billing') or p_state not in ('running','passed','failed')
   or p_batches is null or p_batches not between 0 and 100 then raise exception 'invalid_worker_heartbeat'; end if;
 insert into private.worker_heartbeats(name,state,batches,last_success_at)
 values(p_name,p_state,p_batches,case when p_state='passed' then now() end)
 on conflict(name) do update set state=excluded.state,batches=excluded.batches,updated_at=now(),
 last_success_at=case when excluded.state='passed' then now() else private.worker_heartbeats.last_success_at end;
end $$;

create or replace function private.worker_health_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare workers jsonb; queues jsonb;
begin
 perform private.require_service_role();
 select coalesce(jsonb_object_agg(name,jsonb_build_object('state',state,
 'ageSeconds',greatest(0,extract(epoch from(now()-updated_at))::integer),
 'successAgeSeconds',case when last_success_at is null then null else greatest(0,extract(epoch from(now()-last_success_at))::integer) end)), '{}')
 into workers from private.worker_heartbeats;
 select jsonb_build_object(
 'billing',jsonb_build_object(
 'pending',(select count(*) from private.billing_jobs where status in ('queued','processing','retry')),
 'overdue',(select count(*) from private.billing_jobs where status in ('queued','processing','retry') and created_at<now()-interval '15 minutes'),
 'failed',(select count(*) from private.billing_jobs where status='review')),
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
