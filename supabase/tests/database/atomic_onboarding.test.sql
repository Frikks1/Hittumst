begin;
-- Real synthetic sessions for member JWT fixtures; rows roll back with this test.
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
set local search_path=extensions,public,private;
select no_plan();
insert into auth.sessions(id,user_id) values('95000000-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000001');
update public.profiles set onboarding_completed_at=null,special_category_consent_at=null,terms_accepted_at=null,privacy_accepted_at=null,guidelines_accepted_at=null,
  display_name='Before onboarding',videos='{}',interests='{}',socials='[]' where id='10000000-0000-0000-0000-000000000001';
select ok(has_function_privilege('authenticated','public.complete_onboarding_profile(jsonb)','execute'),'members can call atomic onboarding');
select ok(not has_function_privilege('anon','public.complete_onboarding_profile(jsonb)','execute'),'anonymous cannot call onboarding');
select ok(has_function_privilege('authenticated','public.complete_onboarding(date,text,text,text[],text[],text,text,text,text,text,boolean,text)','execute'),'older client endpoint remains available');
-- Force a failure in the second write to prove the first registration write rolls back.
create function pg_temp.reject_test_customization() returns trigger language plpgsql as $$ begin
  if new.videos @> array['https://reject.example.test/video'] then raise exception using errcode='23514',message='synthetic_customization_failure'; end if;
  return new;
end; $$;
create trigger test_atomic_onboarding_failure before update of videos on public.profiles for each row execute function pg_temp.reject_test_customization();
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"95000000-0000-4000-8000-000000000001"}',true);
select set_config('test.onboarding','{"dateOfBirth":"1990-01-01","displayName":"Atomic member","identity":["queer"],"lookingFor":["friends"],"bio":"Hello","region":"hofudborgarsvaedid","locale":"en","sensitiveDataConsent":true,"privacyAccepted":true,"termsAccepted":true,"guidelinesAccepted":true,"videos":["https://example.test/video"],"socials":[{"platform":"instagram","handle":"member"}],"interests":["Hiking"]}',true);
select throws_ok($$select public.complete_onboarding_profile(jsonb_set(current_setting('test.onboarding')::jsonb,'{videos}','["https://reject.example.test/video"]'))$$,'23514','synthetic_customization_failure','customization failure rejects complete transaction');
select is((select onboarding_completed_at from public.profiles where id=auth.uid()),null::timestamptz,'failed customization does not mark onboarding complete');
select is((select special_category_consent_at from public.profiles where id=auth.uid()),null::timestamptz,'failed customization does not persist partial consent');
select is((select display_name from public.profiles where id=auth.uid()),'Before onboarding','failed customization restores original profile');
select throws_ok($$select public.complete_onboarding_profile(jsonb_set(current_setting('test.onboarding')::jsonb,'{privacyAccepted}','false'))$$,'22023','explicit_consent_required','declined privacy is rejected');
select throws_ok($$select public.complete_onboarding_profile(jsonb_set(current_setting('test.onboarding')::jsonb,'{sensitiveDataConsent}','null'))$$,'22023','explicit_consent_required','NULL sensitive consent rejected');
select throws_ok($$select public.complete_onboarding_profile(jsonb_set(current_setting('test.onboarding')::jsonb,'{dateOfBirth}',to_jsonb(current_date::text)))$$,'22023','date_of_birth_must_be_18_to_120','underage onboarding remains rejected');
select throws_ok($$select public.complete_onboarding_profile(jsonb_set(current_setting('test.onboarding')::jsonb,'{videos}','["javascript:alert(1)"]'))$$,'22023','invalid_profile_customization','unsafe video scheme rejected');
select lives_ok($$select public.complete_onboarding_profile(current_setting('test.onboarding')::jsonb||'{"profileId":"10000000-0000-0000-0000-000000000002"}'::jsonb)$$,'valid registration commits atomically and ignores supplied owner IDs');
select ok((select onboarding_completed_at is not null and privacy_accepted_at is not null and special_category_consent_at is not null from public.profiles where id=auth.uid()),'registration and consents committed');
select is((select videos[1] from public.profiles where id=auth.uid()),'https://example.test/video','video customization committed');
select is((select interests[1] from public.profiles where id=auth.uid()),'Hiking','interests committed');
select is((select socials->0->>'handle' from public.profiles where id=auth.uid()),'member','social customization committed');
select lives_ok($$select public.complete_onboarding_profile(current_setting('test.onboarding')::jsonb)$$,'lost acknowledgement retry remains safe');
select throws_ok($$select public.complete_onboarding(date_of_birth=>'1990-01-01',display_name=>'Legacy',sensitive_data_consent=>null)$$,'22023','explicit_consent_required','legacy RPC also rejects NULL consent');
reset role;
select isnt((select display_name from public.profiles where id='10000000-0000-0000-0000-000000000002'),'Atomic member','cannot overwrite another account');
delete from auth.sessions where id='95000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.complete_onboarding_profile(current_setting('test.onboarding')::jsonb)$$,'42501','active_session_required','revoked session cannot update registration');
select * from finish();
rollback;
