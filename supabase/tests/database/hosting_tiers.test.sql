begin;
-- Real synthetic sessions for member JWT fixtures; rows roll back with this test.
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
set local search_path=extensions,public,private;
select no_plan();
update private.commerce_configuration set mode='sandbox';
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
update private.private_locations set verified_at=now() where profile_id::text like '10000000-%';
insert into private.member_subscriptions(account_id,tier,paid_until,source) values
 ('10000000-0000-0000-0000-000000000001','plebbi',now()+interval '1 year','sandbox'),
 ('10000000-0000-0000-0000-000000000002','flottari_plebbi',now()+interval '1 year','sandbox'),
 ('10000000-0000-0000-0000-000000000003','plebba_kongur',now()+interval '1 year','sandbox');
insert into public.meetups(id,host_id,title,description,category,starts_at,access_mode,location_visibility,general_area,prohibited_services_attested_at)
select ('92000000-0000-0000-000'||owner||'-'||lpad(n::text,12,'0'))::uuid,('10000000-0000-0000-0000-'||lpad(owner::text,12,'0'))::uuid,
 'Quota fixture','Synthetic quota boundary test','community',date_trunc('month',now())+interval '1 month 12 hours','open','protected','reykjavik',now()
from generate_series(1,3) owner cross join generate_series(1,11) n;
insert into private.meetup_locations(meetup_id,exact_point,discovery_point)
select id,st_setsrid(st_makepoint(-21.9511,64.1482),4326)::geography,st_setsrid(st_makepoint(-21.9511,64.1482),4326)::geography from public.meetups where id::text like '92000000-%';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select lives_ok($$select public.publish_meetup('92000000-0000-0000-0001-000000000001')$$,'Free first occurrence publishes');
select throws_ok($$select public.publish_meetup('92000000-0000-0000-0001-000000000002')$$,'23514','meetup_monthly_limit_reached','Free second occurrence denied');
select lives_ok($$select public.cancel_meetup('92000000-0000-0000-0001-000000000001')$$,'cancellation before start succeeds');
select lives_ok($$select public.publish_meetup('92000000-0000-0000-0001-000000000002')$$,'cancellation releases monthly slot');
select public.cancel_meetup('92000000-0000-0000-0001-000000000002');
select throws_ok($$select public.publish_meetup_series('92000000-0000-0000-0001-000000000003',
 '{"frequency":"daily","interval":1,"weekdays":[],"skippedDates":[],"end":{"kind":"count","count":2},"timezone":"Atlantic/Reykjavik"}'::jsonb,
 jsonb_build_array(date_trunc('month',now())+interval '1 month 12 hours',date_trunc('month',now())+interval '1 month 1 day 12 hours'))$$,
 '23514','meetup_monthly_limit_reached','recurring series cannot overfill a month');
select is((select status from public.meetups where id='92000000-0000-0000-0001-000000000003'),'draft','rejected series leaves the original draft untouched');
reset role;
select is((select count(*) from public.meetup_series where host_id=auth.uid()),0::bigint,'rejected series leaves no partial series');
set local role authenticated;
select public.publish_meetup('92000000-0000-0000-0001-000000000003');
select public.update_meetup('92000000-0000-0000-0001-000000000004',jsonb_build_object('startsAt',date_trunc('month',now())+interval '2 months 12 hours'));
select public.publish_meetup('92000000-0000-0000-0001-000000000004');
select throws_ok($$select public.update_meetup('92000000-0000-0000-0001-000000000003',jsonb_build_object('startsAt',date_trunc('month',now())+interval '2 months 1 day 12 hours'))$$,'23514','meetup_monthly_limit_reached','rescheduling cannot overfill the destination month');
select is(date_trunc('month',(public.get_meetup('92000000-0000-0000-0001-000000000003')->>'startsAt')::timestamptz),date_trunc('month',now())+interval '1 month','failed rescheduling preserves the original time');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select lives_ok($$select public.publish_meetup(('92000000-0000-0000-0002-'||lpad(n::text,12,'0'))::uuid) from generate_series(1,5)n$$,'Plus first five occurrences publish');
select throws_ok($$select public.publish_meetup('92000000-0000-0000-0002-000000000006')$$,'23514','meetup_monthly_limit_reached','Plus sixth occurrence denied');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select lives_ok($$select public.publish_meetup(('92000000-0000-0000-0003-'||lpad(n::text,12,'0'))::uuid) from generate_series(1,10)n$$,'Premium first ten occurrences publish');
select throws_ok($$select public.publish_meetup('92000000-0000-0000-0003-000000000011')$$,'23514','meetup_monthly_limit_reached','Premium eleventh occurrence denied');
select public.set_sandbox_tier('plebbi');
select is((select count(*) from public.meetups where host_id=auth.uid() and status='published'),10::bigint,'downgrade preserves ten published occurrences');
select * from finish();
rollback;
