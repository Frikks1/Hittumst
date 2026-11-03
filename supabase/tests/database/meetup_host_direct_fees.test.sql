begin;
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
set local search_path=extensions,public,private;
select no_plan();
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
select ok(not has_function_privilege('authenticated','private.set_meetup_host_fee(uuid,jsonb)','EXECUTE'),'fee helper is internal only');
select ok(not has_function_privilege('authenticated','private.update_meetup_before_host_fee(uuid,jsonb)','EXECUTE'),'legacy updates cannot bypass fee checks');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','role','authenticated','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('test.fee_meetup',public.create_meetup_draft(jsonb_build_object(
  'title','Coffee together','description','A friendly afternoon meeting for coffee.',
  'category','coffee_food','tags','[]'::jsonb,'startsAt',now()+interval '3 days',
  'accessMode','open','locationVisibility','protected','releasePolicy','immediate',
  'generalAreaId','reykjavik','latitude',64.1466,'longitude',-21.9426,
  'prohibitedServicesAttested',true,'feeIsk',1200
))::text,true);
select is(public.get_meetup(current_setting('test.fee_meetup')::uuid)->>'feeIsk','1200','one stored unit is one ISK');
select is(public.get_meetup(current_setting('test.fee_meetup')::uuid)->>'admissionMode','paid','positive fee is paid');
select is(public.get_meetup(current_setting('test.fee_meetup')::uuid)->>'priceMinor','1200','fee preserves whole ISK units');
select is(public.get_meetup(current_setting('test.fee_meetup')::uuid)->>'currency','ISK','new paid fee uses ISK');
select lives_ok($$select public.update_meetup(current_setting('test.fee_meetup')::uuid,'{"capacity":2}')$$,'partial edit succeeds');
select is(public.get_meetup(current_setting('test.fee_meetup')::uuid)->>'feeIsk','1200','omitted fee remains unchanged');
select throws_ok($$select public.update_meetup(current_setting('test.fee_meetup')::uuid,'{"feeIsk":-1}')$$,'22023','invalid_meetup_fee_isk','negative fee rejected');
select throws_ok($$select public.update_meetup(current_setting('test.fee_meetup')::uuid,'{"feeIsk":1.5}')$$,'22023','invalid_meetup_fee_isk','fractional fee rejected');
select throws_ok($$select public.update_meetup(current_setting('test.fee_meetup')::uuid,'{"feeIsk":"1200"}')$$,'22023','invalid_meetup_fee_isk','string fee rejected');
select throws_ok($$select public.update_meetup(current_setting('test.fee_meetup')::uuid,'{"feeIsk":2147483648}')$$,'22023','invalid_meetup_fee_isk','oversized fee rejected');
select is(public.get_meetup(current_setting('test.fee_meetup')::uuid)->>'feeIsk','1200','failed updates preserve fee');
select lives_ok($$select public.publish_meetup(current_setting('test.fee_meetup')::uuid)$$,'paid meetup publishes through ordinary publish');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','role','authenticated','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid)::text,true);
select throws_ok($$select public.update_meetup(current_setting('test.fee_meetup')::uuid,'{"feeIsk":0}')$$,'42501','meetup_host_required','member cannot change host fee');
select lives_ok($$select public.join_meetup(current_setting('test.fee_meetup')::uuid)$$,'paid meetup joins without checkout or payment status');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','role','authenticated','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);
select lives_ok($$select public.update_meetup(current_setting('test.fee_meetup')::uuid,'{"feeIsk":0}')$$,'host may make meetup free');
select is(public.get_meetup(current_setting('test.fee_meetup')::uuid)->>'admissionMode','free','zero fee is free');
select is(public.get_meetup(current_setting('test.fee_meetup')::uuid)->'priceMinor','null'::jsonb,'free clears price');
select is(public.get_meetup(current_setting('test.fee_meetup')::uuid)->'currency','null'::jsonb,'free clears currency');
reset role;
update public.meetups set admission_mode='paid',price_minor=450,currency='EUR' where id=current_setting('test.fee_meetup')::uuid;
set local role authenticated;
select lives_ok($$select public.update_meetup(current_setting('test.fee_meetup')::uuid,'{"capacity":3}')$$,'legacy currency meetup remains editable');
select is(public.get_meetup(current_setting('test.fee_meetup')::uuid)->>'currency','EUR','omitted fee preserves legacy currency');
select is(public.get_meetup(current_setting('test.fee_meetup')::uuid)->>'priceMinor','450','omitted fee preserves legacy stored amount');
select ok(not (public.get_meetup(current_setting('test.fee_meetup')::uuid)?'feeIsk'),'legacy foreign-currency amount is not relabelled ISK');
reset role;
select * from finish();
rollback;
