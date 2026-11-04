begin;
-- Real synthetic sessions for member JWT fixtures; rows roll back with this test.
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
set local search_path=extensions,public,private;
select no_plan();
select ok(not has_table_privilege('authenticated','private.billing_members','select'),'provider facts are private');
select ok(not has_table_privilege('service_role','private.billing_periods','insert'),'service has only bounded command access');
select ok(not has_function_privilege('authenticated','public.billing_service(text,jsonb)','execute'),'members cannot forge provider snapshots');
select ok(not has_function_privilege('anon','public.billing_sync_access(boolean)','execute'),'anonymous sync denied');
select ok(has_function_privilege('service_role','public.billing_service(text,jsonb)','execute'),'worker can reconcile provider data');
insert into auth.sessions(id,user_id) values('97000000-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claims','{"session_id":"97000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.billing_sync_access(false)->>'configured','false','billing defaults disabled');
select throws_ok($$select public.billing_service('apply','{}')$$,'42501',null,'real member role cannot apply snapshots');
reset role;
update private.billing_configuration set environment='PRODUCTION',enabled=true;
set local role authenticated;
select is(public.billing_sync_access(false)->>'purchaseAllowed','false','production checkout remains closed independently of entitlements');
select set_config('test.billing_sync',public.billing_sync_access(true)::text,true);
select is(public.billing_sync_access(true)->>'jobId',current_setting('test.billing_sync')::jsonb->>'jobId','concurrent member sync reuses pending job');
reset role;
select is((select context->'identities'->>0 from private.billing_jobs where id=(current_setting('test.billing_sync')::jsonb->>'jobId')::uuid),'10000000-0000-0000-0000-000000000001','sync identity comes from session');
delete from auth.sessions where id='97000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.billing_sync_access(true)$$,'42501','billing_authentication_required','revoked sessions cannot queue provider calls');
reset role;
select throws_ok($$select public.billing_service('claim','{"environment":"SANDBOX"}')$$,'55000','billing_environment_unavailable','environment boundary cannot be changed by caller');
-- Helpers return normalized server facts; no customer-provided data is used in this contract.
create function pg_temp.snapshot(p_account integer,p_key text,p_tier text default 'plebba_kongur',p_paid boolean default true,p_refunded boolean default false,p_active boolean default true) returns jsonb
language sql as $$select jsonb_build_object('accountId','10000000-0000-0000-0000-'||lpad(p_account::text,12,'0'),'providerUpdatedAt',now(),'needsReview',false,'periods',
case when p_key is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('key',repeat(p_key,64),'tier',p_tier,'startsAt',now()-interval '1 day','endsAt',now()+interval '29 days','accessUntil',now()+interval '29 days','paid',p_paid,'refunded',p_refunded,'active',p_active)) end);$$;
create function pg_temp.context(p_accounts integer[],p_from integer[] default '{}',p_to integer[] default '{}',p_ms bigint default null) returns jsonb
language sql as $$ select jsonb_build_object('identities',(select jsonb_agg('10000000-0000-0000-0000-'||lpad(x::text,12,'0')) from unnest(p_accounts) x),
 'transferFrom',coalesce((select jsonb_agg('10000000-0000-0000-0000-'||lpad(x::text,12,'0')) from unnest(p_from) x),'[]'),
 'transferTo',coalesce((select jsonb_agg('10000000-0000-0000-0000-'||lpad(x::text,12,'0')) from unnest(p_to) x),'[]'),
 'eventType',case when p_ms is null then 'RENEWAL' else 'TRANSFER' end,'eventTimestampMs',p_ms,'source','webhook');$$;
create function pg_temp.receipt(p_id text,p_context jsonb,p_environment text default 'PRODUCTION',p_hash text default 'a') returns jsonb
language sql as $$select public.billing_service('receipt',jsonb_build_object('environment','PRODUCTION','eventEnvironment',p_environment,'eventId',p_id,'hash',repeat(p_hash,64),'eventType',p_context->>'eventType','context',p_context));$$;
create function pg_temp.run(p_id text,p_context jsonb,p_snapshots jsonb) returns jsonb
language plpgsql as $$declare receipt jsonb; claim uuid:=gen_random_uuid(); begin
 receipt:=pg_temp.receipt(p_id,p_context);
 perform public.billing_service('claim',jsonb_build_object('environment','PRODUCTION','jobId',receipt->>'jobId','claimId',claim));
 return public.billing_service('apply',jsonb_build_object('environment','PRODUCTION','jobId',receipt->>'jobId','claimId',claim,'snapshots',p_snapshots));end;$$;
select set_config('test.billing_receipt',pg_temp.receipt('receipt',pg_temp.context(array[1]))::text,true);
select is(pg_temp.receipt('receipt',pg_temp.context(array[1]))->>'duplicate','true','same signed receipt is durable and idempotent');
select throws_ok($$select pg_temp.receipt('receipt',pg_temp.context(array[1]),'PRODUCTION','b')$$,'23505','billing_receipt_conflict','event ID cannot accept a changed body');
select is(pg_temp.receipt('sandbox',pg_temp.context(array[1]),'SANDBOX')->>'disposition','ignored_environment','sandbox event is recorded without a production job');
select is((select count(*)::integer from private.billing_jobs where id=(select job_id from private.billing_receipts where event_id='sandbox')),0,'ignored environment never enqueues fulfillment');
select is(pg_temp.run('premium',pg_temp.context(array[1]),jsonb_build_array(pg_temp.snapshot(1,'a')))->>'status','verified','production snapshot is applied');
select is(private.member_tier('10000000-0000-0000-0000-000000000001'),'plebba_kongur','digital entitlement follows current provider snapshot');
select is((select allowance_pending from private.billing_periods where period_key=repeat('a',64)),1000,'premium monthly allowance is pending only');
select is(pg_temp.run('repeat',pg_temp.context(array[1]),jsonb_build_array(pg_temp.snapshot(1,'a')))->>'status','verified','repeated current snapshots are safe');
select is((select sum(allowance_pending)::integer from private.billing_periods),1000,'same transaction cannot create duplicate pending allowances');
select is(pg_temp.run('alias',pg_temp.context(array[2]),jsonb_build_array(pg_temp.snapshot(2,'a')))->>'status','review','alias without a signed transfer cannot steal ownership');
select is(private.member_tier('10000000-0000-0000-0000-000000000002'),'plebbi','ambiguous alias receives no paid access');
select is(pg_temp.run('transfer',pg_temp.context(array[1,2],array[1],array[2],1000),jsonb_build_array(pg_temp.snapshot(1,'a'),pg_temp.snapshot(2,'a')))->>'status','verified','signed transfer handles provider aliases presenting same transaction');
select is((select owner_id::text from private.billing_periods where period_key=repeat('a',64)),'10000000-0000-0000-0000-000000000002','only the explicit transfer recipient owns the transaction');
select is(private.member_tier('10000000-0000-0000-0000-000000000001'),'plebbi','transfer removes source digital entitlement');
select is(private.member_tier('10000000-0000-0000-0000-000000000002'),'plebba_kongur','transfer recipient has current entitlement');
select is((select sum(allowance_pending)::integer from private.billing_periods),1000,'transfer changes ownership without another pending grant');
select is(pg_temp.run('old-transfer',pg_temp.context(array[1,2],array[2],array[1],999),jsonb_build_array(pg_temp.snapshot(1,'a'),pg_temp.snapshot(2,'a')))->>'status','review','late older transfer does not override newer ownership');
select is((select owner_id::text from private.billing_periods where period_key=repeat('a',64)),'10000000-0000-0000-0000-000000000002','provider clock prevents ownership reversal');
select is(pg_temp.run('refund',pg_temp.context(array[2]),jsonb_build_array(pg_temp.snapshot(2,'a','plebba_kongur',false,true,false)))->>'status','verified','refund applies current authoritative state');
select is((select allowance_pending from private.billing_periods where period_key=repeat('a',64)),0,'refund voids the unfunded allowance');
select is(private.member_tier('10000000-0000-0000-0000-000000000002'),'plebbi','refund revokes digital access');
insert into private.member_subscriptions(account_id,tier,paid_until,source) values('10000000-0000-0000-0000-000000000002','plebba_kongur',now()+interval '1 year','sandbox') on conflict(account_id) do update set tier=excluded.tier,paid_until=excluded.paid_until,source='sandbox';
update private.commerce_configuration set mode='sandbox';
select is(private.member_tier('10000000-0000-0000-0000-000000000002'),'plebbi','refunded provider state cannot fall back to stale sandbox entitlement');
select is(pg_temp.run('trial',pg_temp.context(array[3]),jsonb_build_array(pg_temp.snapshot(3,'b','plebba_kongur',false)))->>'status','verified','trial may carry digital access');
select is((select allowance_pending from private.billing_periods where period_key=repeat('b',64)),0,'trial is never represented as a paid grant');
select is(pg_temp.run('multi-alias',pg_temp.context(array[1,2]),jsonb_build_array(pg_temp.snapshot(1,'c'),pg_temp.snapshot(2,'c')))->>'status','review','new shared transaction with no explicit recipient enters review');
select is((select count(*)::integer from private.billing_periods where period_key=repeat('c',64)),0,'ambiguous identities cannot double grant or choose arbitrary owner');
-- A crashed worker may be replaced, but cannot commit its obsolete claim later.
select set_config('test.billing_claim',gen_random_uuid()::text,true);
select set_config('test.billing_job',pg_temp.receipt('retry',pg_temp.context(array[1]))->>'jobId',true);
select public.billing_service('claim',jsonb_build_object('environment','PRODUCTION','jobId',current_setting('test.billing_job'),'claimId',current_setting('test.billing_claim')));
select is(public.billing_service('claim',jsonb_build_object('environment','PRODUCTION','jobId',current_setting('test.billing_job'),'claimId',gen_random_uuid())),'null'::jsonb,'live claim cannot be acquired twice');
update private.billing_jobs set lease_until=now()-interval '1 second' where id=current_setting('test.billing_job')::uuid;
select public.billing_service('claim',jsonb_build_object('environment','PRODUCTION','jobId',current_setting('test.billing_job'),'claimId',gen_random_uuid()));
select is(public.billing_service('apply',jsonb_build_object('environment','PRODUCTION','jobId',current_setting('test.billing_job'),'claimId',current_setting('test.billing_claim'),'snapshots',jsonb_build_array(pg_temp.snapshot(1,null)))),'false'::jsonb,'obsolete worker cannot commit after replacement');
select is((select mode from private.commerce_configuration where id),'sandbox','billing never widens FinanceState mode to production');
select is((select count(*)::integer from private.subscription_receipts where environment='PRODUCTION'),0,'production reconciliation never enters sandbox cash grant receipts');
select ok(not has_function_privilege('authenticated','public.billing_provider_guard(uuid,uuid,uuid,boolean,jsonb)','execute'),'member cannot authorize provider erasure');
select set_config('test.billing_active_claim',(select claim_id::text from private.billing_jobs where id=current_setting('test.billing_job')::uuid),true);
select is(public.billing_provider_guard('10000000-0000-0000-0000-000000000001',current_setting('test.billing_job')::uuid,current_setting('test.billing_active_claim')::uuid)->>'state','allowed','live claim can perform provider lookup');
update public.profiles set deletion_requested_at=now() where id='10000000-0000-0000-0000-000000000001';
select is(public.billing_provider_guard('10000000-0000-0000-0000-000000000001',current_setting('test.billing_job')::uuid,current_setting('test.billing_active_claim')::uuid)->>'state','deleted','deletion request blocks queued provider get-or-create');
insert into private.account_deletion_jobs(id,account_id,status,claim_token,lease_until) values('97000000-0000-4000-8000-000000000011','10000000-0000-0000-0000-000000000001','processing','97000000-0000-4000-8000-000000000012',now()+interval '10 minutes');
select is(public.billing_provider_guard('10000000-0000-0000-0000-000000000001','97000000-0000-4000-8000-000000000011','97000000-0000-4000-8000-000000000012',true)->>'state','processing','provider erasure waits out current lookup lease');
update private.billing_jobs set lease_until=now()-interval '11 seconds' where context->'identities' @> '["10000000-0000-0000-0000-000000000001"]' and status='processing';
select is(public.billing_provider_guard('10000000-0000-0000-0000-000000000001','97000000-0000-4000-8000-000000000011','97000000-0000-4000-8000-000000000012',true)->>'state','ready','drained leases permit provider erasure');
select is(public.billing_provider_guard('10000000-0000-0000-0000-000000000001','97000000-0000-4000-8000-000000000011','97000000-0000-4000-8000-000000000012',true,'["10000000-0000-0000-0000-000000000002"]')->>'state','alias_review_required','erasure cannot delete another active member alias');
select throws_ok($$select public.billing_provider_guard('10000000-0000-0000-0000-000000000001','97000000-0000-4000-8000-000000000011','97000000-0000-4000-8000-000000000099',true)$$,'42501','deletion_claim_expired','provider erasure needs the actual current deletion worker claim');
select * from finish();
rollback;

