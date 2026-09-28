begin;
set local search_path=extensions,public,private;
select no_plan();
select ok(not has_table_privilege('authenticated','private.apple_revocation_tokens','select'),'members cannot read encrypted provider tokens');
select ok(not has_function_privilege('authenticated','public.apple_token_get(uuid)','execute'),'member cannot invoke worker token reader');
select ok(not has_function_privilege('anon','public.apple_token_store_authorized(uuid,text,text,text,uuid)','execute'),'anonymous cannot write token vault');
select ok(has_function_privilege('service_role','public.apple_token_get(uuid)','execute'),'worker can read token envelope');
insert into auth.identities(id,user_id,provider,provider_id,identity_data)
values('ab000000-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000001','apple','synthetic-apple-sub','{"sub":"synthetic-apple-sub"}');
insert into auth.sessions(id,user_id) values('ab000000-0000-4000-8000-000000000002','10000000-0000-0000-0000-000000000001');
set local role service_role;
select throws_ok($$select public.apple_token_store_authorized('10000000-0000-0000-0000-000000000001','wrong-sub','is.rummal.app',repeat('x',40),'ab000000-0000-4000-8000-000000000002')$$,'42501','apple_identity_mismatch','worker cannot attach another Apple identity');
select lives_ok($$select public.apple_token_store_authorized('10000000-0000-0000-0000-000000000001','synthetic-apple-sub','is.rummal.app',repeat('x',40),'ab000000-0000-4000-8000-000000000002')$$,'verified subject can store ciphertext');
select is(public.apple_token_get('10000000-0000-0000-0000-000000000001')->>'requiresRevocation','true','Apple identity requires revocation');
select is(public.apple_token_get('10000000-0000-0000-0000-000000000002')->>'requiresRevocation','false','email account does not require Apple');
reset role;
select * from finish();
rollback;

