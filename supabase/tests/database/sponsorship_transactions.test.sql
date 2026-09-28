begin;
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users on conflict do nothing;
set local search_path=extensions,public,private;
select no_plan();
update private.commerce_configuration set mode='sandbox';
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
update private.private_locations set verified_at=now();
insert into private.member_subscriptions(account_id,tier,paid_until,source)
values ('10000000-0000-0000-0000-000000000001','flottari_plebbi',now()+interval '1 year','sandbox');
create function pg_temp.event(p_n integer) returns uuid language sql immutable as $$ select ('94000000-0000-0000-0000-'||lpad(p_n::text,12,'0'))::uuid $$;
create function pg_temp.member(p_n integer) returns uuid language sql immutable as $$ select ('10000000-0000-0000-0000-'||lpad(p_n::text,12,'0'))::uuid $$;
create function pg_temp.session(p_n integer) returns uuid language sql immutable as $$ select md5('pgtap-session:'||pg_temp.member(p_n)::text)::uuid $$;
insert into public.meetups(id,host_id,title,description,category,starts_at,access_mode,location_visibility,general_area)
select pg_temp.event(n),pg_temp.member(1),'Sponsorship transaction fixture','Synthetic funding and publication','community',
  date_trunc('month',now())+interval '1 month 12 hours','open','protected','reykjavik' from generate_series(1,3)n;
insert into private.meetup_locations(meetup_id,exact_point,discovery_point)
select id,st_setsrid(st_makepoint(-21.9511,64.1482),4326)::geography,st_setsrid(st_makepoint(-21.9511,64.1482),4326)::geography from public.meetups where id::text like '94000000-%';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create function pg_temp.proposed(p_event uuid,p_request uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('environment','sandbox','members','{}'::jsonb,
    'journal',jsonb_build_array(jsonb_build_object('id','fixture-fund','kind','contribution','entries',jsonb_build_array(
      jsonb_build_object('account','external:fixture','amount',-500),jsonb_build_object('account','pool:'||p_event::text,'amount',500)))),
    'balances',jsonb_build_object('external:fixture',-500,'pool:'||p_event::text,500),
    'events',jsonb_build_object(p_event::text,public.finance_publish_context(pg_temp.member(1),p_event)||jsonb_build_object('hostBps',2500,'checkedIn','{}'::jsonb)),
    'contributions',jsonb_build_object('fixture-contribution',jsonb_build_object('id','fixture-contribution','eventId',p_event,'memberId',pg_temp.member(1),'amount',500,'reversed',false)),
    'requests',jsonb_build_object(pg_temp.member(1)::text||':'||p_request::text,jsonb_build_object('fingerprint','fixture','result',jsonb_build_object('id','fixture-contribution'))));
$$;
create temporary table funding_fixture as select pg_temp.event(1) event,gen_random_uuid() request,0::bigint revision,null::jsonb proposed;
update funding_fixture set proposed=pg_temp.proposed(event,request);
select throws_ok($$select public.finance_event_context(pg_temp.event(1))$$,'P0001','event_unavailable','quoted drafts are unavailable to background settlement context');
select ok(not public.finance_settlement_save(pg_temp.event(1),0,(select proposed from funding_fixture)),'draft ledger event cannot settle before publication');
select throws_ok($$select public.finance_publish_meetup(pg_temp.member(1),pg_temp.session(1),event,request,revision,proposed) from funding_fixture$$,
  '22023','prohibited_services_attestation_required','failed publication rejects funding in the same transaction');
select is((select revision from private.finance_state where id),0::bigint,'failed publication does not advance ledger revision');
select is((select count(*) from private.finance_journal),0::bigint,'failed publication does not leave journal history');
select is((select status from public.meetups where id=pg_temp.event(1)),'draft','failed funded publication leaves recoverable draft');
select ok(not exists(select 1 from private.meetup_pool_summaries where meetup_id=pg_temp.event(1)),'failed publication does not advertise uncommitted funds');
update public.meetups set prohibited_services_attested_at=now() where id=pg_temp.event(1);
select ok((select public.finance_publish_meetup(pg_temp.member(1),pg_temp.session(1),event,request,revision,proposed) from funding_fixture),'funding and publication commit together');
select is((select status from public.meetups where id=pg_temp.event(1)),'published','successful funding publishes event');
select is((select revision from private.finance_state where id),1::bigint,'successful funding advances revision once');
select is(private.meetup_pool_payload(pg_temp.event(1))->>'total','500','published pool advertises funded amount');
select ok((select public.finance_publish_meetup(pg_temp.member(1),pg_temp.session(1),event,request,revision,proposed) from funding_fixture),'uncertain publication retry returns original receipt');
select is((select revision from private.finance_state where id),1::bigint,'publication replay cannot duplicate funding');
select throws_ok($$select public.finance_event_save(pg_temp.member(2),pg_temp.session(2),pg_temp.event(1),'contribution_quote',1,(select state from private.finance_state where id))$$,
  '42501','paid_subscription_required','locked quote commit checks current paid membership');
select throws_ok($$select public.finance_event_save(pg_temp.member(2),pg_temp.session(2),pg_temp.event(1),'contribute',1,(select state from private.finance_state where id))$$,
  '42501','paid_subscription_required','locked contribution checks current paid membership');
select throws_ok($$select public.finance_event_save(pg_temp.member(1),gen_random_uuid(),pg_temp.event(1),'pool_info',1,(select state from private.finance_state where id))$$,
  '42501','active_session_required','revoked or invented session cannot commit financial state');
select ok(not public.finance_event_save(pg_temp.member(1),pg_temp.session(1),pg_temp.event(1),'contribute',0,(select state from private.finance_state where id)),'stale revision requests retry before committing');
update public.meetups set starts_at=starts_at+interval '1 day' where id=pg_temp.event(1);
select throws_ok($$select public.finance_event_save(pg_temp.member(1),pg_temp.session(1),pg_temp.event(1),'contribute',1,(select state from private.finance_state where id))$$,
  'P0001','event_context_changed','rescheduled event invalidates old contribution context atomically');
select ok(not has_function_privilege('authenticated','public.finance_settlement_save(uuid,bigint,jsonb)','execute'),'settlement commits are service only');
select ok(not public.finance_settlement_save(pg_temp.event(1),1,(select state from private.finance_state where id)),'reschedule invalidates a worker snapshot before any payout commit');
select is((select revision from private.finance_state where id),1::bigint,'stale worker cannot advance ledger revision');
-- Stored check-in evidence remains eligible after the attendee leaves.
update public.meetups set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' where id=pg_temp.event(1);
update private.meetup_pool_summaries set checked_in=jsonb_build_object(pg_temp.member(1)::text,now(),pg_temp.member(2)::text,now()) where meetup_id=pg_temp.event(1);
insert into public.meetup_participations(meetup_id,profile_id,status,joined_at,left_at)
values(pg_temp.event(1),pg_temp.member(2),'left',now()-interval '2 hours',now());
select is(private.meetup_pool_payload(pg_temp.event(1))->>'eligibleParticipantCount','1','post-start eligibility uses verified check-ins independent of later RSVP');
select is(private.meetup_pool_payload(pg_temp.event(1))->>'estimatedParticipantReward','375','estimate excludes creator and uses full attendee share');
select is(private.meetup_pool_payload(pg_temp.event(1))->>'status','locked','started pool is locked');
select throws_ok($$select public.finance_event_save(pg_temp.member(1),pg_temp.session(1),pg_temp.event(1),'reverse',1,(select state from private.finance_state where id))$$,
  'P0001','pool_closed','locked event prevents late reversal');
update public.meetups set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=pg_temp.event(1);
select is(private.meetup_pool_payload(pg_temp.event(1))->>'status','awaiting_settlement','ended pool awaits settlement');
update private.meetup_pool_summaries set total=0,paid_total=500,settlement_outcome='paid_out' where meetup_id=pg_temp.event(1);
select is(private.meetup_pool_payload(pg_temp.event(1))->>'paidTotal','500','paid historical amount remains visible');
select is(private.meetup_pool_payload(pg_temp.event(1))->>'status','paid_out','paid outcome remains visible');
update private.meetup_pool_summaries set paid_total=0,refunded_total=500,settlement_outcome='refunded' where meetup_id=pg_temp.event(1);
select is(private.meetup_pool_payload(pg_temp.event(1))->>'refundedTotal','500','refunded historical amount remains visible');
update public.meetups set status='cancelled',cancelled_at=now() where id=pg_temp.event(1);
select ok(not public.finance_settlement_save(pg_temp.event(1),1,(select state from private.finance_state where id)),'cancellation invalidates a worker payout snapshot');
select ok(public.finance_settlement_save(pg_temp.event(1),1,jsonb_set((select state from private.finance_state where id),array['events',pg_temp.event(1)::text],
  public.finance_event_context(pg_temp.event(1))||jsonb_build_object('hostBps',2500,'checkedIn','{}'::jsonb))),'worker may commit after reloading current cancelled context');
select is((select revision from private.finance_state where id),2::bigint,'current worker context commits exactly once');
-- A service-only projection is returned only after the usual event authorization.
update public.meetups set status='published',access_mode='private',prohibited_services_attested_at=now(),published_at=now() where id=pg_temp.event(2);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.member(3)::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.member(3),'session_id',pg_temp.session(3),'role','authenticated')::text,true);
insert into public.blocks(blocker_id,blocked_id) values(pg_temp.member(3),pg_temp.member(1));
select throws_ok($$select public.get_meetup(pg_temp.event(2))$$,'42501',null::text,'private event visibility also protects pool visibility');
reset role;
select * from finish();
rollback;

