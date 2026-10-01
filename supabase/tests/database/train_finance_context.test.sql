begin;
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users on conflict do nothing;
set local search_path=extensions,public,private;
select no_plan();
create function pg_temp.member(p_id uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub',p_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'session_id',md5('pgtap-session:'||p_id::text)::uuid,'role','authenticated')::text,true);
end $$;
update private.private_locations set verified_at=now();
update private.commerce_configuration set mode='sandbox';
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
-- A fresh database starts with {}. jsonb_set creates the final key only, so
-- initialize the ledger collections before inserting nested test fixtures.
update private.finance_state set state='{"balances":{},"contributions":{},"events":{},"members":{},"flags":[]}'::jsonb||state;
select ok(not has_function_privilege('authenticated','public.finance_train_context(uuid,uuid,uuid,text)','execute'),'members cannot impersonate another train depositor');
select ok(not has_function_privilege('authenticated','public.finance_train_save(uuid,uuid,uuid,text,bigint,jsonb)','execute'),'members cannot submit invented train ledger state');
select ok(not has_function_privilege('authenticated','public.finance_train_auto_save(uuid,bigint,jsonb,jsonb)','execute'),'members cannot run automatic sponsorship commits');
set local role authenticated;
select pg_temp.member('10000000-0000-0000-0000-000000000001');
select set_config('test.train',public.train_command('create',null,'{"name":"Finance context fixture"}')#>>'{}',true);
select throws_ok($$select public.train_command('pool_deposit',current_setting('test.train')::uuid,'{"amount":500}')$$,
  'P0001','train_pool_commerce_required','legacy test-unit deposits cannot mint wallet funds');
reset role;
insert into public.group_members(group_id,profile_id,role,status)
values(current_setting('test.train')::uuid,'10000000-0000-0000-0000-000000000002','member','active');
insert into public.meetups(id,host_id,title,description,category,starts_at,access_mode,location_visibility,general_area,prohibited_services_attested_at,status,published_at)
values('97000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','Train finance fixture','Synthetic sponsorship context','community',
  date_trunc('month',now())+interval '1 month 12 hours','open','protected','reykjavik',now(),'published',now());
insert into private.meetup_locations(meetup_id,exact_point,discovery_point)
values('97000000-0000-0000-0000-000000000001',st_setsrid(st_makepoint(-21.9511,64.1482),4326)::geography,st_setsrid(st_makepoint(-21.9511,64.1482),4326)::geography);
insert into private.train_plans(group_id,meetup_id,recommended_by)
values(current_setting('test.train')::uuid,'97000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
insert into private.train_going(group_id,meetup_id,profile_id)
values(current_setting('test.train')::uuid,'97000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
update private.finance_state set state=jsonb_set(state,'{trainPools}',jsonb_build_object(current_setting('test.train'),
  jsonb_build_object('enabled',true,'configuredBy','10000000-0000-0000-0000-000000000001','sponsored',true)));
select set_config('test.revision',(select revision::text from private.finance_state where id),true);
select set_config('test.state',(select state::text from private.finance_state where id),true);
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok($$select public.finance_train_context('10000000-0000-0000-0000-000000000001','ffffffff-ffff-ffff-ffff-ffffffffffff',current_setting('test.train')::uuid,'train_pool_settings')$$,
  '42501','active_session_required','train finance context rejects a missing member session');
select is(public.finance_train_context('10000000-0000-0000-0000-000000000001',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid,current_setting('test.train')::uuid,'train_pool_settings')->>'role',
  'owner','service resolves current owner authority from the database');
select is(current_setting('request.jwt.claims')::jsonb,'{"role":"service_role"}'::jsonb,
  'member authorization restores the original service claims');
select throws_ok($$select public.finance_train_context('10000000-0000-0000-0000-000000000002',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid,current_setting('test.train')::uuid,'train_pool_settings')$$,
  '42501','train_admin_required','ordinary member cannot configure pool spending');
select throws_ok($$select public.finance_train_context('10000000-0000-0000-0000-000000000003',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid,current_setting('test.train')::uuid,'train_pool_deposit')$$,
  '42501','train_forbidden','outsider cannot fund a private train');
select is(public.finance_train_auto_context(current_setting('test.train')::uuid),'[]'::jsonb,'going intention without actual RSVP cannot authorize sponsorship');
reset role;
insert into public.meetup_participations(meetup_id,profile_id,status,joined_at)
values('97000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','joined',now());
set local role service_role;
select set_config('test.context',public.finance_train_auto_context(current_setting('test.train')::uuid)::text,true);
select is(jsonb_array_length(current_setting('test.context')::jsonb),1,'confirmed RSVP supplies an eligible automatic sponsorship event');
select is(current_setting('test.context')::jsonb#>>'{0,eligibleAttendees,0}','10000000-0000-0000-0000-000000000002','worker context carries actual eligible attendee IDs');
reset role;
update public.meetup_participations set status='left',left_at=now()
where meetup_id='97000000-0000-0000-0000-000000000001' and profile_id='10000000-0000-0000-0000-000000000002';
set local role service_role;
select throws_ok($$select public.finance_train_auto_save(current_setting('test.train')::uuid,current_setting('test.revision')::bigint,current_setting('test.state')::jsonb,current_setting('test.context')::jsonb)$$,
  'P0001','train_context_changed','RSVP withdrawal between context and commit rejects stale spending');
reset role;
select is((select revision from private.finance_state where id),current_setting('test.revision')::bigint,'rejected sponsorship does not mutate the ledger revision');
update public.meetup_participations set status='joined',joined_at=now(),left_at=null
where meetup_id='97000000-0000-0000-0000-000000000001' and profile_id='10000000-0000-0000-0000-000000000002';
update public.group_members set role='member' where group_id=current_setting('test.train')::uuid and profile_id='10000000-0000-0000-0000-000000000001';
set local role service_role;
select is(public.finance_train_auto_context(current_setting('test.train')::uuid),'[]'::jsonb,'revoked administrator authority stops automatic spending');
reset role;
update public.group_members set role='owner' where group_id=current_setting('test.train')::uuid and profile_id='10000000-0000-0000-0000-000000000001';
update private.finance_state set state=jsonb_set(state,array['balances','train:'||current_setting('test.train')],'500'::jsonb);
set local role authenticated;
select pg_temp.member('10000000-0000-0000-0000-000000000001');
select throws_ok($$select public.group_action(current_setting('test.train')::uuid,'archive')$$,
  'P0001','train_pool_has_funds','owner cannot archive a train with unspent pooled funds');
reset role;
update private.finance_state set state=jsonb_set(jsonb_set(jsonb_set(state,
  array['balances','train:'||current_setting('test.train')],'0'::jsonb),
  '{contributions,train-archive-fixture}',jsonb_build_object('id','train-archive-fixture','trainId',current_setting('test.train'),
    'eventId','97000000-0000-0000-0000-000000000001','amount',500,'reversed',false)),
  '{events,97000000-0000-0000-0000-000000000001}','{"settled":false}'::jsonb);
set local role authenticated;
select throws_ok($$select public.group_action(current_setting('test.train')::uuid,'archive')$$,
  'P0001','train_pool_has_funds','zero balance still prevents archive while event funds may return to the train');
reset role;
update private.finance_state set state=jsonb_set(state,'{events,97000000-0000-0000-0000-000000000001,settled}','true'::jsonb);
set local role authenticated;
select lives_ok($$select public.group_action(current_setting('test.train')::uuid,'archive')$$,
  'zero balance and settled event liabilities allow archive');

-- A public donation can create a pool before its owner opens a finance wallet.
select set_config('test.donated_train',public.train_command('create',null,'{"name":"Public donated train","visibility":"public"}')#>>'{}',true);
reset role;
update private.finance_state set state=jsonb_set(jsonb_set(jsonb_set(state,
  '{members}',coalesce(state->'members','{}')-'10000000-0000-0000-0000-000000000001'),
  array['trainPools',current_setting('test.donated_train')],jsonb_build_object('enabled',true,'configuredBy','10000000-0000-0000-0000-000000000002')),
  array['balances','train:'||current_setting('test.donated_train')],'50'::jsonb);
select ok((select state->'members'->'10000000-0000-0000-0000-000000000001' is null from private.finance_state where id),
  'public train owner has no finance member record before account deletion');
update public.profiles set deletion_requested_at=now() where id='10000000-0000-0000-0000-000000000001';
select is((select state#>>array['trainPools',current_setting('test.donated_train'),'enabled'] from private.finance_state where id),'false',
  'deleting an owner without a wallet still disables the owned train spending mandate');
select ok((select exists(select 1 from jsonb_array_elements(state->'flags') flag
  where flag->>'accountId'='10000000-0000-0000-0000-000000000001'
    and flag->>'reason'='train_pool_admin_deleted:'||current_setting('test.donated_train')) from private.finance_state where id),
  'owner deletion flags the donated pool for financial review');
select is((select state#>>array['balances','train:'||current_setting('test.donated_train')] from private.finance_state where id),'50',
  'owner deletion preserves outstanding pooled liabilities');
select * from finish();
rollback;
