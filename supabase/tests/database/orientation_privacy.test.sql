begin;
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
set local search_path=extensions,public,private;
select no_plan();
update private.private_locations set verified_at=now();

select ok(has_function_privilege('authenticated','public.complete_onboarding_profile(jsonb)','execute'),'members retain atomic registration access');
select ok(not has_function_privilege('anon','public.complete_onboarding_profile(jsonb)','execute'),'anonymous registration remains denied');
select ok(not has_function_privilege('anon','private.complete_onboarding_profile_impl(jsonb)','execute'),'private registration implementation remains denied to anonymous');
-- Existing legacy tags stay valid; saving an unrelated field cannot reject them.
update public.profiles set identity_tags=array['trans_man','self_described'] where id='10000000-0000-0000-0000-000000000001';
select lives_ok($$update public.profiles set bio='Legacy profile edit' where id='10000000-0000-0000-0000-000000000001'$$,'legacy explicit identity tags survive unrelated profile edits');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','role','authenticated','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);
select set_config('test.onboarding','{"dateOfBirth":"1990-01-01","displayName":"Private member","identity":["not_applicable"],"lookingFor":["friends"],"bio":"Hello","region":"hofudborgarsvaedid","locale":"en","sensitiveDataConsent":true,"privacyAccepted":true,"termsAccepted":true,"guidelinesAccepted":true}',true);
select lives_ok($$select public.complete_onboarding_profile(current_setting('test.onboarding')::jsonb)$$,'does-not-apply answer completes registration');
select is((select identity_tags from public.profiles where id=auth.uid()),array['not_applicable'],'does-not-apply answer stored exactly');
select lives_ok($$select public.complete_onboarding_profile(jsonb_set(current_setting('test.onboarding')::jsonb,'{identity}','["prefer_not_to_say"]'))$$,'rather-not-say answer completes registration');
select is((select identity_tags from public.profiles where id=auth.uid()),array['prefer_not_to_say'],'rather-not-say answer stored exactly');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','role','authenticated','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid)::text,true);
select is(public.get_public_profile('10000000-0000-0000-0000-000000000001')->'identity_tags','["prefer_not_to_say"]'::jsonb,'public profile mapping preserves the selected privacy answer for another visible member');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','role','authenticated','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);
select throws_ok($$select public.complete_onboarding_profile(jsonb_set(current_setting('test.onboarding')::jsonb,'{identity}','["gay","prefer_not_to_say"]'))$$,'22023','orientation_privacy_choice_exclusive','registration rejects privacy with explicit orientation');
select throws_ok($$select public.complete_onboarding_profile(jsonb_set(current_setting('test.onboarding')::jsonb,'{identity}','["not_applicable","prefer_not_to_say"]'))$$,'22023','orientation_privacy_choice_exclusive','registration rejects two privacy answers');
select throws_ok($$select public.complete_onboarding_profile(jsonb_set(current_setting('test.onboarding')::jsonb,'{identity}','["not_applicable","not_applicable"]'))$$,'22023','orientation_privacy_choice_exclusive','duplicate privacy answers rejected');
select throws_ok($$select public.complete_onboarding_profile(jsonb_set(current_setting('test.onboarding')::jsonb,'{identity}','["not_applicable",null]'))$$,'22023','invalid_profile_identity','NULL cannot bypass exclusive registration answers');
select is((select identity_tags from public.profiles where id=auth.uid()),array['prefer_not_to_say'],'rejected registration does not replace saved privacy answer');
select lives_ok($$update public.profiles set identity_tags=array['not_applicable'] where id=auth.uid()$$,'member can change to does-not-apply in direct profile editing');
select throws_ok($$update public.profiles set identity_tags=array['bi','not_applicable'] where id=auth.uid()$$,'23514',null,'direct member update cannot bypass privacy exclusivity');
select throws_ok($$select public.complete_onboarding(date_of_birth=>'1990-01-01',display_name=>'Legacy',identity_tags=>array['gay','prefer_not_to_say'],sensitive_data_consent=>true)$$,'23514',null,'legacy registration cannot bypass privacy exclusivity');
select is((select identity_tags from public.profiles where id=auth.uid()),array['not_applicable'],'rejected direct and legacy edits leave saved answer intact');
select lives_ok($$select public.complete_onboarding_profile(jsonb_set(current_setting('test.onboarding')::jsonb,'{identity}','["bi","queer"]'))$$,'existing explicit selections remain accepted');
select is((select identity_tags from public.profiles where id=auth.uid()),array['bi','queer'],'existing multi-selection behavior remains intact');
select throws_ok($$select public.complete_onboarding_profile(jsonb_set(current_setting('test.onboarding')::jsonb,'{identity}','["unknown"]'))$$,'22023','invalid_profile_identity','registration whitelist still rejects arbitrary tags');

reset role;
delete from auth.sessions where user_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select public.complete_onboarding_profile(current_setting('test.onboarding')::jsonb)$$,'42501','active_session_required','privacy registration cannot bypass revoked session');
select * from finish();
rollback;
