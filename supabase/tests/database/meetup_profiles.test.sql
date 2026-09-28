begin;
-- Real synthetic sessions for member JWT fixtures; rows roll back with this test.
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
-- These privacy/participation fixtures need several albums or occurrences.
update private.commerce_configuration set mode='sandbox';
insert into private.member_subscriptions(account_id,tier,paid_until,source)
select id,'flottari_plebbi',now()+interval '1 month','sandbox' from public.profiles
on conflict(account_id) do update set tier=excluded.tier,paid_until=excluded.paid_until;
set local search_path=extensions,public,private;
select no_plan();
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
select ok(not has_table_privilege('authenticated','private.meetup_gender_preferences','SELECT'),'gender preferences are private');
select ok(not has_table_privilege('authenticated','private.meetup_reviews','INSERT'),'reviews cannot bypass attendance checks');
select ok(not has_function_privilege('authenticated','private.create_meetup_draft_before_profile(jsonb)','EXECUTE'),'legacy creation cannot bypass profile rules');
select ok(not (select public from storage.buckets where id='meetup-media'),'event media bucket is private');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('test.event_id',public.create_meetup_draft(jsonb_build_object(
  'title','Gaming night','description','A friendly evening playing tabletop games.',
  'category','community','tags','[]'::jsonb,'startsAt',now()+interval '3 days',
  'accessMode','open','locationVisibility','protected','releasePolicy','immediate',
  'generalAreaId','reykjavik','latitude',64.1466,'longitude',-21.9426,
  'prohibitedServicesAttested',true,'eventProfile',jsonb_build_object(
    'customTags',jsonb_build_array('Gaming','Dungeons and Dragons'),'rules','Be kind.',
    'prerequisites','Bring dice.','sections',jsonb_build_array(jsonb_build_object('title','Equipment','body','Dice and paper')),
    'joinMode','invite','minAge',18,'maxAge',null,'ageLimits','[]'::jsonb,
    'genderLimits',jsonb_build_array(jsonb_build_object('gender','man','maxRsvp',1))
  )
))::text,true);
select is(public.get_meetup(current_setting('test.event_id')::uuid)#>>'{eventProfile,customTags,1}','Dungeons and Dragons','custom tag round-trips through the public API');
select lives_ok($$select public.publish_meetup(current_setting('test.event_id')::uuid)$$,'event with profile publishes');
select lives_ok($$select public.update_meetup(current_setting('test.event_id')::uuid,'{"capacity":2}'::jsonb)$$,'published capacity-only edit preserves expansion');
select is(public.get_meetup(current_setting('test.event_id')::uuid)#>>'{eventProfile,joinMode}','invite','partial edit preserves invitations');
select lives_ok($$select public.meetup_profile_action(current_setting('test.event_id')::uuid,'invite','{"profileId":"10000000-0000-0000-0000-000000000002"}')$$,'host can invite');
select lives_ok($$select public.meetup_profile_action(current_setting('test.event_id')::uuid,'invite','{"profileId":"10000000-0000-0000-0000-000000000003"}')$$,'host can invite second person');
select throws_ok($$select public.meetup_profile_action(current_setting('test.event_id')::uuid,'add_media','{"path":"someone-else/test.jpg","kind":"photo"}')$$,'42501','media_inspection_required','raw event metadata cannot bypass inspection');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values('meetup-media',current_setting('test.event_id')||'/raw.jpg','{"mimetype":"image/jpeg","size":24}')$$,'42501',null::text,'even the host cannot publish raw event bytes');
select set_config('test.photo_upload',public.reserve_media_upload('meetup',current_setting('test.event_id')::uuid,'image')::text,true);
insert into storage.objects(bucket_id,name,metadata) values('media-quarantine',current_setting('test.photo_upload')::jsonb->>'path','{"mimetype":"image/jpeg","size":24}');
select set_config('test.video_upload',public.reserve_media_upload('meetup',current_setting('test.event_id')::uuid,'video')::text,true);
insert into storage.objects(bucket_id,name,metadata) values('media-quarantine',current_setting('test.video_upload')::jsonb->>'path','{"mimetype":"video/mp4","size":24}');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.worker_claim',gen_random_uuid()::text,true);
select public.claim_media_upload(current_setting('test.worker_claim')::uuid);
select public.claim_media_upload(current_setting('test.worker_claim')::uuid);
select ok(public.finish_media_upload((current_setting('test.photo_upload')::jsonb->>'id')::uuid,current_setting('test.worker_claim')::uuid,24,null,
 current_setting('test.event_id')||'/'||(current_setting('test.photo_upload')::jsonb->>'id')||'.jpg',null,null),'worker publishes reviewed event photo');
select ok(public.finish_media_upload((current_setting('test.video_upload')::jsonb->>'id')::uuid,current_setting('test.worker_claim')::uuid,24,60000,
 current_setting('test.event_id')||'/'||(current_setting('test.video_upload')::jsonb->>'id')||'.mp4',null,null),'event video retains its existing length contract');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select is(jsonb_array_length(public.meetup_profile_action(current_setting('test.event_id')::uuid,'media')),2,'gallery returns reviewed photos and videos');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select throws_ok($$select public.join_meetup(current_setting('test.event_id')::uuid)$$,'42501','meetup_participation_restricted','unknown gender fails closed for restricted event');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values('meetup-media',current_setting('test.event_id')||'/intruder.jpg','{"mimetype":"image/jpeg"}')$$,'42501',null::text,'non-host cannot upload into an event folder');
select lives_ok($$select public.meetup_profile_action(current_setting('test.event_id')::uuid,'set_gender','{"gender":"man"}')$$,'participant explicitly selects gender');
select lives_ok($$select public.join_meetup(current_setting('test.event_id')::uuid)$$,'invited eligible participant can join');
select throws_ok($$select public.meetup_profile_action(current_setting('test.event_id')::uuid,'invitations')$$,'42501','owned_meetup_required','attendee cannot browse invitation list');
select throws_ok($$select public.save_meetup_recommendation(current_setting('test.event_id')::uuid,true,'Great event')$$,'42501','recorded_attendance_required','review before event is rejected');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select lives_ok($$select public.meetup_profile_action(current_setting('test.event_id')::uuid,'set_gender','{"gender":"man"}')$$,'second participant sets gender');
select throws_ok($$select public.join_meetup(current_setting('test.event_id')::uuid)$$,'42501','meetup_participation_restricted','gender quota prevents oversubscription');
select is(public.get_meetup(current_setting('test.event_id')::uuid)#>>'{capabilities,canJoin}','false','payload disables join at the gender limit');
select lives_ok($$select public.meetup_profile_action(current_setting('test.event_id')::uuid,'set_gender','{"gender":"woman"}')$$,'unrestricted gender remains selectable');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select lives_ok($$select public.meetup_profile_action(current_setting('test.event_id')::uuid,'uninvite','{"profileId":"10000000-0000-0000-0000-000000000003"}')$$,'host revokes invitation');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select throws_ok($$select public.join_meetup(current_setting('test.event_id')::uuid)$$,'42501','meetup_participation_restricted','revoked invite cannot join even when demographic rules pass');
select throws_ok($$select public.meetup_profile_action(current_setting('test.event_id')::uuid,'invite','{"profileId":"10000000-0000-0000-0000-000000000003"}')$$,'42501','owned_meetup_required','non-host cannot self-invite');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select throws_ok($$select public.update_meetup(current_setting('test.event_id')::uuid,jsonb_build_object('eventProfile',jsonb_set(public.get_meetup(current_setting('test.event_id')::uuid)->'eventProfile','{genderLimits,0,maxRsvp}','0')))$$,'23514','limits_conflict_with_current_attendees','new exclusions cannot silently remove existing attendees');
select is(public.get_meetup(current_setting('test.event_id')::uuid)#>>'{eventProfile,genderLimits,0,maxRsvp}','1','failed update rolls back profile changes');

reset role;
update public.meetups set starts_at=now()-interval '3 days',ends_at=now()-interval '2 days' where id=current_setting('test.event_id')::uuid;
update public.meetup_participations set confirmation_state='completed',attendance_outcome='attended',attendance_completed_at=now() where meetup_id=current_setting('test.event_id')::uuid and profile_id='10000000-0000-0000-0000-000000000002';
insert into private.community_attendance(meetup_id,profile_id,source) values(current_setting('test.event_id')::uuid,'10000000-0000-0000-0000-000000000002','checkin');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select lives_ok($$select public.save_meetup_recommendation(current_setting('test.event_id')::uuid,true,'Great evening with friendly people')$$,'completed attendee can review');
select lives_ok($$select public.save_meetup_recommendation(current_setting('test.event_id')::uuid,false,'Edited review')$$,'attendee can edit their review');
select is(jsonb_array_length(public.meetup_profile_action(current_setting('test.event_id')::uuid,'reviews')),1,'one review per attendee');
select lives_ok($$select public.delete_meetup_recommendation(current_setting('test.event_id')::uuid)$$,'attendee can delete their review');
select is(jsonb_array_length(public.meetup_profile_action(current_setting('test.event_id')::uuid,'reviews')),0,'deleted review disappears');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('test.request_id',public.create_meetup_draft(jsonb_build_object(
  'title','Request-only walk','description','A group walk with an age-band capacity.',
  'category','walk_outdoors','tags','[]'::jsonb,'startsAt',now()+interval '3 days',
  'accessMode','private','locationVisibility','protected','releasePolicy','immediate',
  'generalAreaId','reykjavik','latitude',64.1466,'longitude',-21.9426,'prohibitedServicesAttested',true,
  'eventProfile',jsonb_build_object('customTags','[]'::jsonb,'rules','','prerequisites','','sections','[]'::jsonb,
    'joinMode','request','minAge',18,'maxAge',120,'genderLimits','[]'::jsonb,
    'ageLimits',jsonb_build_array(jsonb_build_object('minAge',18,'maxAge',120,'maxRsvp',1)))
))::text,true);
select lives_ok($$select public.publish_meetup(current_setting('test.request_id')::uuid)$$,'request event publishes');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select lives_ok($$select public.community_apply(current_setting('test.request_id')::uuid,'I would like to join the group walk.','{}'::text[],true)$$,'first person may request');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select lives_ok($$select public.community_apply(current_setting('test.request_id')::uuid,'I would like to join the group walk.','{}'::text[],true)$$,'pending requests do not consume the age quota');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select lives_ok($$select public.respond_to_meetup_request(current_setting('test.request_id')::uuid,'10000000-0000-0000-0000-000000000002',true)$$,'host may approve the first seat');
select throws_ok($$select public.respond_to_meetup_request(current_setting('test.request_id')::uuid,'10000000-0000-0000-0000-000000000003',true)$$,'42501','meetup_participation_restricted','approval cannot bypass an age-band quota');
select lives_ok($$select public.respond_to_meetup_request(current_setting('test.request_id')::uuid,'10000000-0000-0000-0000-000000000003',false)$$,'a full quota still permits declining requests');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select lives_ok($$select public.leave_meetup(current_setting('test.request_id')::uuid)$$,'leaving releases the age-band seat');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select lives_ok($$select public.reinstate_meetup_participant(current_setting('test.request_id')::uuid,'10000000-0000-0000-0000-000000000003','approved')$$,'reinstatement can use the released seat');
reset role;
select * from finish();
rollback;
