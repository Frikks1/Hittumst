begin;
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
set local search_path=extensions,public,private;
select no_plan();
update private.private_locations set verified_at=now();
update public.profiles set profile_tags=array['gaming'] where id='10000000-0000-0000-0000-000000000002';
update public.profiles set profile_tags=array['hiking'] where id='10000000-0000-0000-0000-000000000003';
update public.profiles set is_profile_visible=false where id='90000000-0000-0000-0000-000000000001';
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true;
update private.commerce_configuration set mode='sandbox';
insert into private.member_subscriptions(account_id,tier,paid_until,source) select id,'flottari_plebbi',now()+interval '1 month','sandbox' from public.profiles on conflict(account_id) do update set tier=excluded.tier,paid_until=excluded.paid_until;
select ok(not has_table_privilege('authenticated','private.diagnosis_submissions','SELECT'),'members cannot read private records directly');
select ok(not has_function_privilege('anon','public.diagnosis_action(text,jsonb)','EXECUTE'),'anonymous submissions denied');
select ok(not has_function_privilege('authenticated','public.claim_diagnosis_cleanup(uuid)','EXECUTE'),'members cannot claim erasure work');
select ok(not (select public from storage.buckets where id='diagnosis-evidence'),'evidence bucket private');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','role','authenticated','aal','aal1','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);

select is(public.discovery_release_status(),false,'combined release defaults off');
select throws_ok($$select public.diagnosis_action('reserve','{"diagnosisId":"autism","legalName":"Synthetic Member","consent":true}')$$,'42501','discovery_release_disabled','uploads closed before launch checks');
reset role;
update private.discovery_release_config set enabled=true,privacy_approved=true,reviewers_ready=true,security_verified=true;
update public.profiles set gender='man',last_active_at=now()-interval '45 days' where id='10000000-0000-0000-0000-000000000002';
update public.profiles set gender='woman',is_online_status_visible=false,last_active_at=now() where id='10000000-0000-0000-0000-000000000003';
update private.private_locations set verified_at=now()-interval '1 day' where profile_id='10000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','role','authenticated','aal','aal1','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);

select is((select count(*) from public.discover_nearby('{}',null)),2::bigint,'inactive and hidden-presence profiles still discoverable');
select is((select distance_band from public.discover_nearby('{}',null) where profile_id='10000000-0000-0000-0000-000000000002'),null::text,'stale location never returns distance');
select is((select count(*) from public.discover_nearby('{"genders":["man"],"radiusKm":500}',null)),0::bigint,'radius excludes stale location even with matching gender');
select is((select count(*) from public.discover_nearby('{"activity":"month"}',null)),0::bigint,'explicit activity excludes old and hidden timestamps');
select is((select count(*) from public.discover_nearby('{"genders":["man","woman"]}',null)),2::bigint,'gender values match ANY');
select set_config('test.page',(select result_cursor::text from public.discover_nearby('{"limit":1}',null)),true);
select is((select count(*) from public.discover_nearby('{"limit":1}',current_setting('test.page')::jsonb)),1::bigint,'activity cursor reaches next page');
select lives_ok($$select public.get_public_profile('10000000-0000-0000-0000-000000000002')$$,'offline profile details available');
select ok(public.get_public_profile('10000000-0000-0000-0000-000000000002') is not null,'offline profile details contain profile');
select lives_ok($$select public.start_conversation('10000000-0000-0000-0000-000000000002')$$,'can start conversation with inactive member');

select is((select count(*) from public.discover_nearby('{"tags":["gaming","hiking"]}',null)),2::bigint,'released multiselect categories match any selected value');
reset role;
insert into public.friendships(requester_id,addressee_id) values('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
set local role authenticated;
select is((select count(*) from public.discover_nearby('{"social":"friends"}',null)),0::bigint,'pending friendship does not qualify');
reset role;
update public.friendships set status='accepted',responded_at=now() where requester_id='10000000-0000-0000-0000-000000000001';
insert into public.friendships(requester_id,addressee_id,status,responded_at) values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','accepted',now());
set local role authenticated;
select is((select count(*) from public.discover_nearby('{"social":"friends"}',null)),1::bigint,'accepted friend qualifies');
select is((select count(*) from public.discover_nearby('{"social":"friends_of_friends"}',null)),0::bigint,'friends-of-friends requires opt-in');
reset role;
update public.profiles set friends_of_friends_discovery=true where id in ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003');
set local role authenticated;
select is((select count(*) from public.discover_nearby('{"social":"friends_of_friends"}',null)),1::bigint,'opted-in mutual path qualifies');
insert into public.blocks(blocker_id,blocked_id) values('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
select is((select count(*) from public.discover_nearby('{"social":"friends_of_friends"}',null)),0::bigint,'blocked intermediary cannot create a discovery path');
delete from public.blocks where blocker_id='10000000-0000-0000-0000-000000000001' and blocked_id='10000000-0000-0000-0000-000000000002';
select set_config('test.case',public.diagnosis_action('reserve','{"diagnosisId":"autism","legalName":"Synthetic Member","consent":true}')::text,true);
insert into storage.objects(bucket_id,name,metadata) values('diagnosis-evidence',current_setting('test.case')::jsonb->>'path','{"mimetype":"image/png","size":24}');
select lives_ok($$select public.diagnosis_action('submit',jsonb_build_object('id',current_setting('test.case')::jsonb->>'id'))$$,'reserved synthetic evidence submits');
select is((select count(*) from storage.objects where bucket_id='diagnosis-evidence'),0::bigint,'members cannot read even their evidence via Storage');
select is(public.diagnosis_action('list')->0->>'status','pending','owner sees pending state');
select ok(public.export_account() ? 'diagnosisVerification','export includes own verification records');
select is(public.export_account()#>>'{mediaManifest,0,bucket}','diagnosis-evidence','export manifest includes own evidence');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','role','authenticated','aal','aal1','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid)::text,true);

select is(public.diagnosis_action('list'),'[]'::jsonb,'other member cannot enumerate submissions');
select throws_ok($$select public.diagnosis_action('withdraw',jsonb_build_object('id',current_setting('test.case')::jsonb->>'id'))$$,'P0001','submission_unavailable','another member cannot withdraw');
select throws_ok($$select public.review_diagnosis('list')$$,'42501','reviewer_required','ordinary member cannot review');
reset role;
update auth.users set raw_app_meta_data=raw_app_meta_data||'{"diagnosis_reviewer":true}' where id='90000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','90000000-0000-0000-0000-000000000001','role','authenticated','aal','aal1','session_id',md5('pgtap-session:90000000-0000-0000-0000-000000000001')::uuid)::text,true);

select throws_ok($$select public.review_diagnosis('list')$$,'42501','reviewer_required','designated reviewer still needs MFA');
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','90000000-0000-0000-0000-000000000001','role','authenticated','aal','aal2','session_id',md5('pgtap-session:90000000-0000-0000-0000-000000000001')::uuid)::text,true);

select lives_ok($$select public.review_diagnosis('claim',jsonb_build_object('id',current_setting('test.case')::jsonb->>'id'))$$,'MFA reviewer claims case');
select is(public.review_diagnosis('evidence',jsonb_build_object('id',current_setting('test.case')::jsonb->>'id'))->>'name','Synthetic Member','assigned reviewer sees comparison details');
select throws_ok($$select public.review_diagnosis('decide',jsonb_build_object('id',current_setting('test.case')::jsonb->>'id','decision','approved'))$$,'P0001','review_checks_required','approval requires explicit completed checks');
select lives_ok($$select public.review_diagnosis('decide',jsonb_build_object('id',current_setting('test.case')::jsonb->>'id','decision','approved','checked',true))$$,'checked evidence approved');
reset role;
select ok((select purge_at<=now()+interval '24 hours' from private.diagnosis_submissions where id=(current_setting('test.case')::jsonb->>'id')::uuid),'approved proof deletion deadline <=24 hours');
select is((select legal_name from private.diagnosis_submissions where id=(current_setting('test.case')::jsonb->>'id')::uuid),'','private comparison name removed after decision');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','role','authenticated','aal','aal1','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);

select is(public.diagnosis_action('list')->0->>'discoverable','false','approval never opts into disclosure');
select lives_ok($$select public.diagnosis_action('disclosure',jsonb_build_object('id',current_setting('test.case')::jsonb->>'id','enabled',true))$$,'separate disclosure supported');
select set_config('test.event',public.create_meetup_draft(jsonb_build_object(
'title','Synthetic restricted meeting','description','Synthetic admission checks only.',
'category','community','tags','[]'::jsonb,'startsAt',now()+interval '3 days','accessMode','open','locationVisibility','protected','releasePolicy','immediate','generalAreaId','reykjavik','latitude',64.1466,'longitude',-21.9426,'prohibitedServicesAttested',true,
'eventProfile',jsonb_build_object('customTags','[]'::jsonb,'rules','','prerequisites','','sections','[]'::jsonb,'joinMode','public','minAge',18,'maxAge',null,'ageLimits','[]'::jsonb,'genderLimits','[]'::jsonb,'audienceGenders','[]'::jsonb,'requiredDiagnosisIds','["autism","adhd"]'::jsonb)))::text,true);
select lives_ok($$select public.publish_meetup(current_setting('test.event')::uuid)$$,'qualifying host publishes restricted event');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','role','authenticated','aal','aal1','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid)::text,true);

select is(public.get_meetup(current_setting('test.event')::uuid)->>'diagnosisRestricted','true','restricted event remains browsable');
select is(public.get_meetup(current_setting('test.event')::uuid)->>'requiresDiagnosisVerification','true','unapproved viewer sees requirement');
select throws_ok($$select public.join_meetup(current_setting('test.event')::uuid)$$,'42501','meetup_participation_restricted','direct join cannot bypass evidence requirement');

select is(public.meetup_profile_action(current_setting('test.event')::uuid,'reviews'),'[]'::jsonb,'nonparticipant cannot read restricted named reviews');
reset role;
select ok(not private.diagnosis_roster_allowed(current_setting('test.event')::uuid,'10000000-0000-0000-0000-000000000003'),'nonparticipants cannot view restricted roster');

insert into private.meetup_invitations(meetup_id,profile_id) values(current_setting('test.event')::uuid,'10000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_ok($$select public.join_meetup(current_setting('test.event')::uuid)$$,'42501','meetup_participation_restricted','invitation never bypasses reviewed evidence');
reset role;
insert into private.diagnosis_submissions(id,profile_id,diagnosis_id,legal_name,status,consent_at,object_path,evidence_ready)
values('dd000000-0000-4000-8000-000000000002','10000000-0000-0000-0000-000000000002','adhd','','approved',now(),'10000000-0000-0000-0000-000000000002/synthetic',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','role','authenticated','aal','aal1','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid)::text,true);

select lives_ok($$select public.join_meetup(current_setting('test.event')::uuid)$$,'ANY selected diagnosis grants participation');

set local role authenticated;
select lives_ok($$select public.diagnosis_action('withdraw','{"id":"dd000000-0000-4000-8000-000000000002"}')$$,'withdrawal succeeds');
reset role;
select is((select status from public.meetup_participations where meetup_id=current_setting('test.event')::uuid and profile_id='10000000-0000-0000-0000-000000000002'),'left','withdrawal removes live participation');
select ok(not private.meetup_has_attendee_access(current_setting('test.event')::uuid,'10000000-0000-0000-0000-000000000002'),'withdrawn member loses protected detail access');
select ok(not private.diagnosis_roster_allowed(current_setting('test.event')::uuid,'10000000-0000-0000-0000-000000000002'),'withdrawn member loses attendee identity access');

reset role;
update private.diagnosis_submissions set status='approved',consent_at=now(),purge_at=now()+interval '24 hours' where id='dd000000-0000-4000-8000-000000000002';
select ok(not private.meetup_has_attendee_access(current_setting('test.event')::uuid,'10000000-0000-0000-0000-000000000002'),'later approval does not restore participation');
set local role authenticated;
select lives_ok($$select public.join_meetup(current_setting('test.event')::uuid)$$,'later approval requires and permits an explicit new join');
reset role;
select throws_ok($$update public.meetups set event_profile=jsonb_set(event_profile,'{requiredDiagnosisIds}','["autism"]') where id=current_setting('test.event')::uuid$$,'P0001','diagnosis_requirements_locked','requirements lock once requests exist');
set local role authenticated;
select public.diagnosis_action('withdraw','{"id":"dd000000-0000-4000-8000-000000000002"}');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','role','authenticated','aal','aal1','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);

select lives_ok($$select public.diagnosis_action('withdraw',jsonb_build_object('id',current_setting('test.case')::jsonb->>'id'))$$,'host withdrawal is supported');
reset role;
select is((select status from public.meetups where id=current_setting('test.event')::uuid),'cancelled','host withdrawal cancels restricted event');
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','90000000-0000-0000-0000-000000000001','role','authenticated','aal','aal2','session_id',md5('pgtap-session:90000000-0000-0000-0000-000000000001')::uuid)::text,true);

select throws_ok($$select public.review_diagnosis('evidence',jsonb_build_object('id',current_setting('test.case')::jsonb->>'id'))$$,'P0001','case_unavailable','withdrawal closes evidence review immediately');
reset role;
select ok(not exists(select 1 from private.media_uploads where object_path=current_setting('test.case')::jsonb->>'path'),'medical evidence never enters automated image moderation');
set local role service_role;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','90000000-0000-0000-0000-000000000001','role','service_role','aal','aal2','session_id',md5('pgtap-session:90000000-0000-0000-0000-000000000001')::uuid)::text,true);

select set_config('test.cleanup',gen_random_uuid()::text,true);
select ok(jsonb_array_length(public.claim_diagnosis_cleanup(current_setting('test.cleanup')::uuid))>=2,'withdrawal queues evidence deletion');
select is(public.finish_diagnosis_cleanup(current_setting('test.case')::jsonb->>'path',current_setting('test.cleanup')::uuid),false,'cleanup cannot complete while stored object remains');

reset role;
set local storage.allow_delete_query='true';
delete from storage.objects where bucket_id='diagnosis-evidence';
set local role service_role;
select is(public.finish_diagnosis_cleanup(current_setting('test.case')::jsonb->>'path',current_setting('test.cleanup')::uuid),true,'absent evidence completes cleanup');
reset role;
select is((select count(*) from private.diagnosis_submissions where id=(current_setting('test.case')::jsonb->>'id')::uuid),0::bigint,'withdrawn private record erased after proof');
insert into storage.objects(bucket_id,name,metadata) values('diagnosis-evidence',current_setting('test.case')::jsonb->>'path','{"mimetype":"image/png","size":24}');
set local role service_role;
select ok(public.claim_diagnosis_cleanup(gen_random_uuid()) ? (current_setting('test.case')::jsonb->>'path'),'restored erased bytes are queued again');
reset role;
insert into private.diagnosis_submissions(profile_id,diagnosis_id,legal_name,status,consent_at,object_path,created_at,purge_at) values('10000000-0000-0000-0000-000000000003','schizophrenia','Synthetic Expired','rejected',now()-interval '31 days','synthetic-expired',now()-interval '31 days',now()-interval '1 day');
set local role service_role;
select ok(public.claim_diagnosis_cleanup(gen_random_uuid()) ? 'synthetic-expired','rejected submissions expire after retention deadline');
reset role;

-- Review transitions and live reviewer permission checks, using synthetic records only.
reset role;
insert into private.diagnosis_submissions(id,profile_id,diagnosis_id,legal_name,status,consent_at,object_path,evidence_ready) values
('dd000000-0000-4000-8000-000000000010','90000000-0000-0000-0000-000000000001','autism','Synthetic Reviewer','pending',now(),'synthetic-self-review',true),
('dd000000-0000-4000-8000-000000000011','10000000-0000-0000-0000-000000000003','autism','Synthetic Appeal','pending',now(),'synthetic-appeal',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','90000000-0000-0000-0000-000000000001','role','authenticated','aal','aal2','session_id',md5('pgtap-session:90000000-0000-0000-0000-000000000001')::uuid)::text,true);
select throws_ok($$select public.review_diagnosis('claim','{"id":"dd000000-0000-4000-8000-000000000010"}')$$,'P0001','case_unavailable','reviewers cannot claim their own submission');
select throws_ok($$select public.review_diagnosis('evidence','{"id":"dd000000-0000-4000-8000-000000000011"}')$$,'42501','assigned_reviewer_required','unassigned evidence access denied');
select public.review_diagnosis('claim','{"id":"dd000000-0000-4000-8000-000000000011"}');
select lives_ok($$select public.review_diagnosis('decide','{"id":"dd000000-0000-4000-8000-000000000011","decision":"more_information"}')$$,'reviewer can request more information');
select lives_ok($$select public.review_diagnosis('decide','{"id":"dd000000-0000-4000-8000-000000000011","decision":"rejected"}')$$,'insufficient evidence can be rejected');
reset role;
select is((select legal_name from private.diagnosis_submissions where id='dd000000-0000-4000-8000-000000000011'),'','rejection clears comparison name');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','role','authenticated','aal','aal1','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid)::text,true);
select lives_ok($$select set_config('test.appeal',public.diagnosis_action('reserve','{"diagnosisId":"autism","legalName":"Synthetic Appeal","consent":true}')::text,true)$$,'rejected member can resubmit with fresh consent');
insert into storage.objects(bucket_id,name,metadata) values('diagnosis-evidence',current_setting('test.appeal')::jsonb->>'path','{"mimetype":"image/png","size":24}');
select lives_ok($$select public.diagnosis_action('submit',jsonb_build_object('id',current_setting('test.appeal')::jsonb->>'id'))$$,'resubmission accepts new synthetic evidence');
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','90000000-0000-0000-0000-000000000001','role','authenticated','aal','aal2','session_id',md5('pgtap-session:90000000-0000-0000-0000-000000000001')::uuid)::text,true);
select public.review_diagnosis('claim',jsonb_build_object('id',current_setting('test.appeal')::jsonb->>'id'));
select lives_ok($$select public.review_diagnosis('decide',jsonb_build_object('id',current_setting('test.appeal')::jsonb->>'id','decision','approved','checked',true))$$,'reviewed appeal may be approved');
select lives_ok($$select public.review_diagnosis('decide',jsonb_build_object('id',current_setting('test.appeal')::jsonb->>'id','decision','revoked'))$$,'staff can revoke an approved credential');
reset role;
select ok(not private.diagnosis_approved('10000000-0000-0000-0000-000000000003','["autism"]'),'staff revocation immediately disables eligibility');
select ok((select purge_at<=now() from private.diagnosis_submissions where id=(current_setting('test.appeal')::jsonb->>'id')::uuid),'staff revocation queues immediate proof erasure');
update auth.users set raw_app_meta_data=raw_app_meta_data-'diagnosis_reviewer' where id='90000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select public.review_diagnosis('list')$$,'42501','reviewer_required','revoked reviewer permission takes effect without a new JWT');
reset role;

insert into private.media_restore_quarantine(account_id,restore_id) values('10000000-0000-0000-0000-000000000002',gen_random_uuid());
select is(private.discovery_enabled(),false,'restore quarantine closes combined release');
select ok(not exists(select 1 from private.diagnosis_submissions where profile_id='10000000-0000-0000-0000-000000000002' and consent_at is not null),'restored credentials cannot resurrect consent');

select * from finish();
rollback;
