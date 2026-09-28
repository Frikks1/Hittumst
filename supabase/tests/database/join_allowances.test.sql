begin;
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users on conflict do nothing;
set local search_path=extensions,public,private;
select no_plan();
create function pg_temp.member(p_id uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub',p_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'session_id',md5('pgtap-session:'||p_id::text)::uuid,'role','authenticated')::text,true);
end $$;
create function pg_temp.event(p_n integer) returns uuid language sql immutable as $$ select ('93000000-0000-0000-0000-'||lpad(p_n::text,12,'0'))::uuid $$;
update private.commerce_configuration set mode='sandbox';
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
update private.private_locations set verified_at=now();
insert into public.meetups(id,host_id,title,description,category,starts_at,access_mode,location_visibility,general_area,prohibited_services_attested_at,status,published_at)
select pg_temp.event(n),'10000000-0000-0000-0000-000000000001','Join allowance fixture','Synthetic allowance test','community',
  date_trunc('month',now())+interval '1 month 12 hours','open','protected','reykjavik',now(),'published',now() from generate_series(1,18)n;
insert into private.meetup_locations(meetup_id,exact_point,discovery_point)
select id,st_setsrid(st_makepoint(-21.9511,64.1482),4326)::geography,st_setsrid(st_makepoint(-21.9511,64.1482),4326)::geography from public.meetups where id::text like '93000000-%';
update public.meetups set access_mode='private' where id=pg_temp.event(2);
select is(private.tier_limits('plebbi')->>'hostBps','2500','Free creators receive 25 percent');
select is(private.tier_limits('flottari_plebbi')->>'hostBps','2500','Plus creators receive 25 percent');
select ok(not has_table_privilege('authenticated','private.meetup_join_reservations','select'),'join accounting is private');
select ok(not has_table_privilege('authenticated','private.meetup_pool_summaries','select'),'pool projection is private');
select ok(not has_function_privilege('authenticated','public.finance_publish_meetup(uuid,uuid,uuid,uuid,bigint,jsonb,jsonb,jsonb)','execute'),'clients cannot publish an invented ledger');
select ok(not has_function_privilege('authenticated','public.finance_event_save(uuid,uuid,uuid,text,bigint,jsonb)','execute'),'clients cannot save invented financial state');
set local role authenticated;
select pg_temp.member('10000000-0000-0000-0000-000000000002');
select is(public.get_my_entitlement()->>'joinsLimit','1','Free joining limit is one');
select is(public.get_my_entitlement()->>'joinsRemaining','1','remaining slots are separate from hosting');
select lives_ok($$select public.join_meetup(pg_temp.event(1))$$,'first Free join succeeds');
select throws_ok($$select public.join_meetup(pg_temp.event(3))$$,'23514','meetup_monthly_join_limit_reached','second Free join is refused');
select lives_ok($$select public.request_meetup_access(pg_temp.event(2))$$,'pending request does not consume a slot');
select pg_temp.member('10000000-0000-0000-0000-000000000001');
select throws_ok($$select public.respond_to_meetup_request(pg_temp.event(2),'10000000-0000-0000-0000-000000000002',true)$$,'23514','meetup_monthly_join_limit_reached','request approval enforces the same cap');
select pg_temp.member('10000000-0000-0000-0000-000000000002');
select lives_ok($$select public.leave_meetup(pg_temp.event(1))$$,'pre-start departure succeeds');
select lives_ok($$select public.join_meetup(pg_temp.event(3))$$,'pre-start departure releases slot');
select is(public.get_my_entitlement()->>'joinsUsed','0','future event uses scheduled month, not join month');
select is(public.get_meetup(pg_temp.event(3))#>>'{pool,total}','0','unfunded event displays zero');
select is(public.get_meetup(pg_temp.event(3))#>>'{pool,hostBps}','2500','unfunded event uses new creator split');
select pg_temp.member('10000000-0000-0000-0000-000000000001');
select lives_ok($$select public.cancel_meetup(pg_temp.event(3))$$,'event cancellation succeeds');
select lives_ok($$select public.respond_to_meetup_request(pg_temp.event(2),'10000000-0000-0000-0000-000000000002',true)$$,'cancellation releases slot for approval');
select pg_temp.member('10000000-0000-0000-0000-000000000002');
select public.set_sandbox_tier('flottari_plebbi');
select lives_ok($$select public.join_meetup(pg_temp.event(n)) from generate_series(4,7)n$$,'Plus can use five total slots after upgrading');
select throws_ok($$select public.join_meetup(pg_temp.event(8))$$,'23514','meetup_monthly_join_limit_reached','Plus sixth join refused');
select public.set_sandbox_tier('plebba_kongur');
select lives_ok($$select public.join_meetup(pg_temp.event(n)) from generate_series(8,17)n$$,'Premium can use fifteen total slots after upgrading');
select throws_ok($$select public.join_meetup(pg_temp.event(18))$$,'23514','meetup_monthly_join_limit_reached','Premium sixteenth join refused');
select public.set_sandbox_tier('plebbi');
select is((select count(*) from public.meetup_participations where profile_id=auth.uid() and status in ('joined','approved') and meetup_id<>pg_temp.event(3)),15::bigint,'downgrade preserves confirmed reservations');
select throws_ok($$select public.join_meetup(pg_temp.event(18))$$,'23514','meetup_monthly_join_limit_reached','downgrade does not reset usage');
reset role;
-- A different Free member has one reservation in each of two months.
select pg_temp.member('10000000-0000-0000-0000-000000000003');
insert into public.meetup_participations(meetup_id,profile_id,status,joined_at) values(pg_temp.event(1),auth.uid(),'joined',now());
update public.meetups set starts_at=date_trunc('month',now())+interval '2 months 12 hours' where id=pg_temp.event(18);
insert into public.meetup_participations(meetup_id,profile_id,status,joined_at) values(pg_temp.event(18),auth.uid(),'joined',now());
select throws_ok($$update public.meetups set starts_at=date_trunc('month',now())+interval '2 months 1 day 12 hours' where id=pg_temp.event(1)$$,
  '23514','meetup_attendee_monthly_join_limit_reached','reschedule checks every participant destination allowance');
select is((select month_start from private.meetup_join_reservations where meetup_id=pg_temp.event(1) and profile_id=auth.uid()),
  (date_trunc('month',now())+interval '1 month')::date,'failed reschedule leaves original reservation intact');
-- Make an event start within the same month without touching the durable slot.
update public.meetups set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' where id=pg_temp.event(18);
select lives_ok($$select public.leave_meetup(pg_temp.event(18))$$,'leaving after start succeeds');
select ok((select released_at is null from private.meetup_join_reservations where meetup_id=pg_temp.event(18) and profile_id=auth.uid()),'leaving after start retains consumed slot');
select throws_ok($$update public.meetups set starts_at=date_trunc('month',now())+interval '3 months' where id=pg_temp.event(18)$$,
  '23514','started_meetup_month_immutable','started occurrence cannot move its consumed allowance');
select is(private.meetup_joins_used(auth.uid(),date_trunc('month',now())::date),1,'consumed no-show remains in scheduled month');
select * from finish();
rollback;
