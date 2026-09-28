begin;
set local search_path=extensions,public,private;
select no_plan();
insert into auth.sessions(id,user_id) select md5('pgtap-community:'||id::text)::uuid,id from auth.users on conflict do nothing;
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
update private.commerce_configuration set mode='sandbox';
insert into private.member_subscriptions(account_id,tier,paid_until,source)
select id,'flottari_plebbi',now()+interval '1 month','sandbox' from public.profiles
on conflict(account_id) do update set tier=excluded.tier,paid_until=excluded.paid_until;
create function pg_temp.community_as(p_id uuid,p_aal text default 'aal1') returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',p_id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'role','authenticated','session_id',md5('pgtap-community:'||p_id::text)::uuid,'aal',p_aal)::text,true);
end $$;
select ok(not has_table_privilege('authenticated','private.community_attendance','SELECT'),'attendance receipts are private');
select ok(not has_table_privilege('authenticated','private.community_recommendations','SELECT'),'individual recommendations cannot be enumerated');
select ok(not has_function_privilege('anon','public.get_meetup_community_feedback(uuid)','EXECUTE'),'anonymous role cannot enumerate event feedback');
select ok(not has_function_privilege('authenticated','public.community_checkin_receipts(uuid)','EXECUTE'),'members and hosts cannot enumerate check-in identities');
select ok(not has_function_privilege('authenticated','private.meetup_profile_action_before_community_feedback(uuid,text,jsonb)','EXECUTE'),'legacy author-bearing response is inaccessible');
set local role authenticated;
select pg_temp.community_as('10000000-0000-0000-0000-000000000001');
select set_config('test.community.event',public.create_meetup_draft(jsonb_build_object(
 'title','Community feedback gathering','description','A synthetic gathering to verify anonymous community reputation.',
 'category','community','tags','[]'::jsonb,'startsAt',now()+interval '3 days',
 'accessMode','open','locationVisibility','protected','releasePolicy','immediate','generalAreaId','reykjavik',
 'latitude',64.1466,'longitude',-21.9426,'capacity',5,'prohibitedServicesAttested',true))::text,true);
select public.publish_meetup(current_setting('test.community.event')::uuid);
select throws_ok($$select public.create_meetup_attendance_code(current_setting('test.community.event')::uuid)$$,'22023','attendance_checkin_closed','check-in cannot begin before the scheduled event');
select pg_temp.community_as('10000000-0000-0000-0000-000000000002');
select public.join_meetup(current_setting('test.community.event')::uuid);
select pg_temp.community_as('10000000-0000-0000-0000-000000000003');
select public.join_meetup(current_setting('test.community.event')::uuid);
select throws_ok($$select public.save_meetup_recommendation(current_setting('test.community.event')::uuid,true,'')$$,'42501','recorded_attendance_required','participation alone cannot grant a recommendation');
select throws_ok($$select public.create_meetup_attendance_code(current_setting('test.community.event')::uuid)$$,'42501','meetup_host_required','attendees cannot generate credentials');
select is(jsonb_array_length(public.list_public_meetup_roster(current_setting('test.community.event')::uuid)->'items'),0,'participants never receive fellow attendee lists');
select is(jsonb_array_length(public.list_profile_upcoming_meetups('10000000-0000-0000-0000-000000000002')->'items'),0,'public profiles never disclose upcoming attendance');
select is(jsonb_array_length(public.list_profile_meetup_history('10000000-0000-0000-0000-000000000002')->'items'),0,'public profiles never disclose attendance history');
select throws_ok($$select public.set_meetup_rsvp_visibility(current_setting('test.community.event')::uuid,'visible')$$,'22023','attendance_visibility_private','old clients cannot opt into public attendee lists');
reset role;
update public.meetups set starts_at=now()-interval '30 minutes',ends_at=now()+interval '1 hour' where id=current_setting('test.community.event')::uuid;
update public.profiles set is_profile_visible=false where id='10000000-0000-0000-0000-000000000001';
select is((select status from public.meetups where id=current_setting('test.community.event')::uuid),'published','hiding a personal profile preserves a published gathering');
set local role authenticated;
select pg_temp.community_as('10000000-0000-0000-0000-000000000003');
select is(public.get_meetup(current_setting('test.community.event')::uuid)#>>'{host,profileVisible}','false','published gathering marks its hidden personal profile');
select ok(not ((public.get_meetup(current_setting('test.community.event')::uuid)->'host')?'avatarPath'),'hidden host exposes only minimal identity');
select is(public.get_meetup(current_setting('test.community.event')::uuid)#>>'{capabilities,canViewRoster}','false','guest roster capability is disabled');
select pg_temp.community_as('10000000-0000-0000-0000-000000000001');
select is(jsonb_array_length(public.list_public_meetup_roster(current_setting('test.community.event')::uuid)->'items'),2,'hidden-profile host retains attendee management');
select set_config('test.community.code',public.create_meetup_attendance_code(current_setting('test.community.event')::uuid)->>'code',true);
select set_config('test.community.new_code',public.create_meetup_attendance_code(current_setting('test.community.event')::uuid)->>'code',true);
select pg_temp.community_as('10000000-0000-0000-0000-000000000002');
select throws_ok($$select public.record_meetup_attendance(current_setting('test.community.event')::uuid,'incorrect-code')$$,'22023','invalid_attendance_code','invalid credential cannot confirm attendance');
select lives_ok($$select public.record_meetup_attendance(current_setting('test.community.event')::uuid,lower(current_setting('test.community.code')))$$,'previous unexpired credential survives host refresh and accepts manual lower case');
select lives_ok($$select public.record_meetup_attendance(current_setting('test.community.event')::uuid,current_setting('test.community.new_code'))$$,'repeated check-in is idempotent');
select is(public.get_meetup_community_feedback(current_setting('test.community.event')::uuid)->>'canReview','false','checked-in attendee waits until the gathering ends');
reset role;
update private.community_attendance_codes set expires_at=now()-interval '1 second' where meetup_id=current_setting('test.community.event')::uuid;
set local role authenticated;
select pg_temp.community_as('10000000-0000-0000-0000-000000000003');
select throws_ok($$select public.record_meetup_attendance(current_setting('test.community.event')::uuid,current_setting('test.community.code'))$$,'22023','invalid_attendance_code','expired credentials never confirm attendance');
reset role;
select is((select count(*)::integer from private.community_attendance where meetup_id=current_setting('test.community.event')::uuid),1,'one durable receipt per occurrence and attendee');
select ok(not exists(select 1 from private.community_attendance_codes where code_hash=current_setting('test.community.code')),'stored check-in credentials are hashed');
update public.meetups set ends_at=now()-interval '1 minute' where id=current_setting('test.community.event')::uuid;
insert into private.meetup_reviews(meetup_id,author_id,rating,body) values(current_setting('test.community.event')::uuid,'10000000-0000-0000-0000-000000000003',4,'Preserved historical written feedback.');
update public.meetup_participations set attendance_outcome='attended',attendance_completed_at=now(),confirmation_state='completed' where meetup_id=current_setting('test.community.event')::uuid and profile_id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.community_as('10000000-0000-0000-0000-000000000003');
select throws_ok($$select public.save_meetup_recommendation(current_setting('test.community.event')::uuid,true,'')$$,'42501','recorded_attendance_required','self-reported legacy attendance is not verified attendance');
select throws_ok($$select public.meetup_profile_action(current_setting('test.community.event')::uuid,'review','{"rating":5,"body":"Unsafe new stars"}')$$,'22023','use_meetup_recommendation','new star reviews are disabled through old clients');
select lives_ok($$select public.request_meetup_attendance_review(current_setting('test.community.event')::uuid,'I attended the gathering but missed the shared check-in code.')$$,'missed check-in may be appealed without touching finance');
select is(public.get_meetup_community_feedback(current_setting('test.community.event')::uuid)->>'attendanceReviewStatus','pending','applicant sees their own support status');
select pg_temp.community_as('10000000-0000-0000-0000-000000000002');
select lives_ok($$select public.save_meetup_recommendation(current_setting('test.community.event')::uuid,false,'Useful gathering, but too noisy for me.')$$,'verified attendee can publish a negative recommendation');
select lives_ok($$select public.save_meetup_recommendation(current_setting('test.community.event')::uuid,true,'Updated feedback after reflection.')$$,'attendee can edit one verdict per occurrence');
select is(public.get_meetup_community_feedback(current_setting('test.community.event')::uuid)#>>'{summary,total}','1','editing does not duplicate verdicts');
select pg_temp.community_as('10000000-0000-0000-0000-000000000001');
select is(public.get_meetup_community_feedback(current_setting('test.community.event')::uuid)#>>'{summary,legacyCount}','1','historical stars have a separate count');
select is(public.get_meetup_community_feedback(current_setting('test.community.event')::uuid)#>>'{summary,legacyAverage}','4.00','historical average is not converted to a yes/no vote');
select ok(not exists(select 1 from jsonb_array_elements(public.get_meetup_community_feedback(current_setting('test.community.event')::uuid)->'reviews') r where r?'authorId' or r?'authorName' or r?'recommended'),'host feedback contains no author or individual vote identity');
select ok(not exists(select 1 from jsonb_array_elements(public.meetup_profile_action(current_setting('test.community.event')::uuid,'reviews')) r where r?'authorId' or r?'authorName'),'legacy read endpoint also anonymizes historical authors');
select is(public.get_host_community_summary('10000000-0000-0000-0000-000000000001')#>>'{reputation,positive}','1','host reputation includes every submitted verdict');
select is(jsonb_array_length(public.get_host_community_summary('10000000-0000-0000-0000-000000000001')->'pastGatherings'),1,'host archive exposes safe past gathering summaries');
select throws_ok($$select public.save_meetup_recommendation(current_setting('test.community.event')::uuid,true,'')$$,'42501','recorded_attendance_required','host cannot review own gathering');
select throws_ok($$select public.staff_list_meetup_attendance_reviews()$$,'42501','staff_mfa_required','event hosts cannot inspect the support queue');
reset role;
update public.meetup_participations set status='removed',removed_at=now() where meetup_id=current_setting('test.community.event')::uuid and profile_id='10000000-0000-0000-0000-000000000002';
insert into public.blocks(blocker_id,blocked_id) values('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
set local role authenticated;
select pg_temp.community_as('10000000-0000-0000-0000-000000000002');
select is(public.get_meetup_community_feedback(current_setting('test.community.event')::uuid)->>'canReview','true','host removal and blocking cannot revoke verified feedback eligibility');
select lives_ok($$select public.save_meetup_recommendation(current_setting('test.community.event')::uuid,false,'Edited after losing event access.')$$,'blocked former attendee can still edit their own feedback');
select is(public.list_my_community_attendance()->0->>'meetupId',current_setting('test.community.event'),'removed and blocked attendee can still find their gathering for feedback');
select is(public.list_my_community_attendance()->0->>'canReview','true','recorded gathering list preserves blocked attendee review action');
select ok(not ((public.list_my_community_attendance()->0)?'hostId') and not ((public.list_my_community_attendance()->0)?'location'),'own recorded gathering list exposes no blocked host or arrival content');
select is(jsonb_array_length(public.get_meetup_community_feedback(current_setting('test.community.event')::uuid)->'reviews'),0,'durable eligibility does not restore blocked event content');
select pg_temp.community_as('10000000-0000-0000-0000-000000000003');
select is(public.get_host_community_summary('10000000-0000-0000-0000-000000000001')#>>'{reputation,negative}','1','host cannot suppress criticism by blocking its author');
select pg_temp.community_as('90000000-0000-0000-0000-000000000001');
select throws_ok($$select public.staff_list_meetup_attendance_reviews()$$,'42501','staff_mfa_required','staff must complete MFA');
select pg_temp.community_as('90000000-0000-0000-0000-000000000001','aal2');
select set_config('test.community.appeal',public.staff_list_meetup_attendance_reviews()->0->>'id',true);
select lives_ok($$select public.staff_resolve_meetup_attendance_review(current_setting('test.community.appeal')::uuid,true,'Attendance evidence was reviewed independently.')$$,'independent staff can approve feedback eligibility');
select pg_temp.community_as('10000000-0000-0000-0000-000000000003');
select is(public.get_meetup_community_feedback(current_setting('test.community.event')::uuid)->>'canReview','true','approved support request grants review eligibility');
select is(public.get_meetup_community_feedback(current_setting('test.community.event')::uuid)->>'attendanceReviewStatus','approved','support decision is visible only to its owner');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select ok(public.community_checkin_receipts(current_setting('test.community.event')::uuid)?'10000000-0000-0000-0000-000000000002','service receives real check-in evidence');
select ok(not (public.community_checkin_receipts(current_setting('test.community.event')::uuid)?'10000000-0000-0000-0000-000000000003'),'support approval never becomes financial attendance');
reset role;
-- More than one displayed page: totals must not be derived from the first 100 bodies.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select md5('community-feedback-fixture:'||n::text)::uuid,'authenticated','authenticated',
 'community-feedback-'||n::text||'@example.test','{"provider":"email"}'::jsonb,'{}'::jsonb from generate_series(1,105) n;
insert into private.community_attendance(meetup_id,profile_id,source)
select current_setting('test.community.event')::uuid,md5('community-feedback-fixture:'||n::text)::uuid,'checkin' from generate_series(1,105) n;
insert into private.community_recommendations(meetup_id,author_id,recommended,body)
select current_setting('test.community.event')::uuid,md5('community-feedback-fixture:'||n::text)::uuid,true,'Synthetic useful feedback number '||n from generate_series(1,105) n;
set local role authenticated;
select pg_temp.community_as('10000000-0000-0000-0000-000000000003');
select is(jsonb_array_length(public.get_meetup_community_feedback(current_setting('test.community.event')::uuid)->'reviews'),100,'written feedback page is bounded');
select is(public.get_meetup_community_feedback(current_setting('test.community.event')::uuid)#>>'{summary,total}','106','event totals include votes beyond the displayed page');
select is(public.get_host_community_summary('10000000-0000-0000-0000-000000000001')#>>'{reputation,total}','106','host reputation aggregates all eligible feedback');
reset role;
insert into public.meetup_series(id,host_id,title,frequency,interval_value,occurrence_count,status)
values('60000000-0000-0000-0000-000000000091','10000000-0000-0000-0000-000000000001','Community recurring gathering','weekly',1,2,'published');
update public.meetups set series_id='60000000-0000-0000-0000-000000000091',occurrence_index=1 where id=current_setting('test.community.event')::uuid;
set local role authenticated;
select pg_temp.community_as('10000000-0000-0000-0000-000000000001');
select set_config('test.community.next',public.create_meetup_draft(jsonb_build_object(
 'title','Next community gathering','description','Upcoming occurrence with separate historical reputation.',
 'category','community','tags','[]'::jsonb,'startsAt',now()+interval '10 days',
 'accessMode','open','locationVisibility','protected','releasePolicy','immediate','generalAreaId','reykjavik',
 'latitude',64.1466,'longitude',-21.9426,'prohibitedServicesAttested',true))::text,true);
select public.publish_meetup(current_setting('test.community.next')::uuid);
reset role;
update public.meetups set series_id='60000000-0000-0000-0000-000000000091',occurrence_index=2 where id=current_setting('test.community.next')::uuid;
set local role authenticated;
select pg_temp.community_as('10000000-0000-0000-0000-000000000003');
select is(public.get_meetup_community_feedback(current_setting('test.community.next')::uuid)#>>'{summary,total}','0','upcoming date never inherits past-date verdicts');
select is(public.get_meetup_community_feedback(current_setting('test.community.next')::uuid)#>>'{seriesSummary,total}','106','series history is explicitly separate and complete');
reset role;
update public.profiles set meetup_hosting_restricted_at=now() where id='10000000-0000-0000-0000-000000000001';
select is((select status from public.meetups where id=current_setting('test.community.next')::uuid),'moderation_hidden','hosting restriction still removes published gatherings');
set local role authenticated;
select pg_temp.community_as('10000000-0000-0000-0000-000000000003');
select throws_ok($$select public.get_host_community_summary('10000000-0000-0000-0000-000000000001')$$,'42501','host_not_available','archive does not bypass host moderation');
reset role;
select * from finish();
rollback;


