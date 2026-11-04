begin;
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users on conflict do nothing;
set local search_path=extensions,public,private;
select no_plan();
select is(private.tier_limits('plebbi'),private.tier_limits('plebba_kongur'),'old paid tiers no longer grant additional access');
select is(private.tier_limits('plebbi')->>'albums','6','every member has six albums');
select is(private.tier_limits('plebbi')->>'joins','15','every member has fifteen monthly joins');
select is(private.member_tier('10000000-0000-0000-0000-000000000001'),'plebbi','old billing cannot assign paid status');
select throws_ok($$update private.commerce_configuration set mode='sandbox'$$,'23514',null,'commerce cannot be reopened through configuration');
select throws_ok($$update private.billing_configuration set enabled=true$$,'23514',null,'store billing cannot be reopened');
select ok(not has_function_privilege('authenticated','public.set_sandbox_tier(text)','execute'),'members cannot activate paid tiers');
select ok(not has_function_privilege('service_role','public.finance_load()','execute'),'legacy service cannot open wallet');
select ok(not has_function_privilege('service_role','public.finance_save(bigint,jsonb)','execute'),'legacy service cannot commit transactions');
select ok(not has_function_privilege('authenticated','public.billing_sync_access(boolean)','execute'),'members cannot enqueue purchases');
select is(private.community_sponsor_rank(gen_random_uuid(),gen_random_uuid()),1,'no paid waitlist priority');
select is(private.list_meetup_sponsors_impl(gen_random_uuid()),'[]'::jsonb,'no sponsor identities or amounts are returned');
select is(private.get_premium_profile_impl(gen_random_uuid()),'{"effect":false,"badge":false,"months":0}'::jsonb,'no paid-tenure display');
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','role','authenticated','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select is(public.get_my_entitlement()->>'purchasesEnabled','false','purchases disabled for a real authenticated member');
select is(public.get_my_entitlement()->>'moneyEnabled','false','money disabled for a real authenticated member');
select is(public.get_my_entitlement()->>'joinsLimit','15','member sees the common free limit');
select set_config('test.free_meetup',public.create_meetup_draft(jsonb_build_object(
 'title','Free coffee','description','A friendly free coffee meetup for adults.',
 'category','coffee_food','tags','[]'::jsonb,'startsAt',now()+interval '2 days',
 'accessMode','open','locationVisibility','protected','generalAreaId','reykjavik',
 'latitude',64.1466,'longitude',-21.9426,'feeIsk',0))::text,true);
select is(public.get_meetup(current_setting('test.free_meetup')::uuid)->>'admissionMode','free','ordinary drafts remain free');
select ok(not(public.get_meetup(current_setting('test.free_meetup')::uuid)?'pool'),'no pool is included in event data');
select throws_ok($$select public.update_meetup(current_setting('test.free_meetup')::uuid,'{"feeIsk":1000}')$$,'22023','money_features_removed','old client cannot add a host fee');
select is(public.get_meetup(current_setting('test.free_meetup')::uuid)->>'feeIsk','0','rejected payment leaves the event free');
reset role;
select * from finish();
rollback;
