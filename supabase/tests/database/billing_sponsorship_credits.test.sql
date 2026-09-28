begin;
set local search_path=extensions,public,private;
select no_plan();
select ok(not has_function_privilege('authenticated','public.finance_billing_snapshot()','execute'),'provider period facts are service only');
select ok(not has_function_privilege('authenticated','public.finance_billing_save(bigint,jsonb,text)','execute'),'clients cannot mint sponsorship credit from provider facts');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select is(public.finance_billing_snapshot(),null::jsonb,'disabled commerce never exposes a funding snapshot');
update private.commerce_configuration set mode='sandbox';
select is(public.finance_billing_snapshot(),null::jsonb,'disabled provider billing cannot fund credit');
update private.billing_configuration set enabled=true,environment='PRODUCTION';
select is(public.finance_billing_snapshot(),null::jsonb,'production provider facts never fund sandbox money');
update private.billing_configuration set environment='SANDBOX';
insert into private.billing_members(environment,account_id,tier,paid_until,provider_updated_at)
values('SANDBOX','10000000-0000-0000-0000-000000000001','flottari_plebbi',now()+interval '1 month',now());
insert into private.billing_periods(environment,period_key,owner_id,tier,starts_at,ends_at,paid,refunded,provider_updated_at,allowance_pending)
values('SANDBOX',repeat('a',64),'10000000-0000-0000-0000-000000000001','flottari_plebbi',now(),now()+interval '1 month',true,false,now(),500),
 ('SANDBOX',repeat('b',64),null,'plebba_kongur',now()-interval '1 month',now(),true,true,now(),1000);
create temporary table verified_billing_fixture as select public.finance_billing_snapshot() snapshot;
select is((select jsonb_array_length(snapshot->'members') from verified_billing_fixture),1,'snapshot includes verified sandbox member');
select is((select jsonb_array_length(snapshot->'periods') from verified_billing_fixture),2,'snapshot retains refunded periods and lost ownership for reconciliation');
select is((select snapshot#>>'{periods,1,refunded}' from verified_billing_fixture),'true','refund fact survives snapshot');
select is((select snapshot->>'fingerprint' from verified_billing_fixture),public.finance_billing_snapshot()->>'fingerprint','unchanged facts have a stable fingerprint');
update public.profiles set moderation_status='banned' where id='10000000-0000-0000-0000-000000000001';
select is(public.finance_billing_snapshot()#>>'{members,0,needsReview}','true','profile ban keeps provider credit reconciliation in review');
update public.profiles set moderation_status='active' where id='10000000-0000-0000-0000-000000000001';
update auth.users set banned_until=now()+interval '1 day' where id='10000000-0000-0000-0000-000000000001';
select is(public.finance_billing_snapshot()#>>'{members,0,needsReview}','true','Auth suspension keeps provider credit reconciliation in review');
update auth.users set banned_until=null where id='10000000-0000-0000-0000-000000000001';
update private.billing_periods set owner_id='10000000-0000-0000-0000-000000000002' where period_key=repeat('a',64);
select ok(not public.finance_billing_save(0,'{"environment":"sandbox","members":{},"journal":[],"balances":{}}',(select snapshot->>'fingerprint' from verified_billing_fixture)),'ownership transfer invalidates in-flight credit commit');
select is((select revision from private.finance_state where id),0::bigint,'stale facts do not advance financial ledger');
update verified_billing_fixture set snapshot=public.finance_billing_snapshot();
select ok(public.finance_billing_save(0,'{"environment":"sandbox","members":{},"journal":[],"balances":{}}',(select snapshot->>'fingerprint' from verified_billing_fixture)),'current verified facts can commit with financial CAS');
select ok(not public.finance_billing_save(0,'{"environment":"sandbox","members":{},"journal":[],"balances":{}}',(select snapshot->>'fingerprint' from verified_billing_fixture)),'stale ledger revision cannot replay a grant');
update private.billing_members set needs_review=true;
select ok(not public.finance_billing_save(1,'{"environment":"sandbox","members":{},"journal":[],"balances":{}}',(select snapshot->>'fingerprint' from verified_billing_fixture)),'review status change invalidates in-flight credits');
update private.billing_configuration set environment='PRODUCTION';
select ok(not public.finance_billing_save(1,'{"environment":"sandbox","members":{},"journal":[],"balances":{}}',(select snapshot->>'fingerprint' from verified_billing_fixture)),'switch to production closes the bridge before commit');
select is((select allowance_pending from private.billing_periods where period_key=repeat('a',64)),500,'provider allowance fact is preserved for reconciliation');
select * from finish();
rollback;

