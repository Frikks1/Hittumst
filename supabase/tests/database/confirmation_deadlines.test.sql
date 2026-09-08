begin;
set local search_path=extensions,public,private;
select no_plan();
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('test.confirm_event',public.create_meetup_draft(jsonb_build_object(
  'title','Confirmation window test','description','Synthetic adults verifying late admission.',
  'category','community','tags',jsonb_build_array('community'),'startsAt',now()+interval '1 hour',
  'accessMode','open','capacity',3,'locationVisibility','protected','generalAreaId','reykjavik',
  'latitude',64.1482,'longitude',-21.9511,'prohibitedServicesAttested',true))::text,true);
select public.publish_meetup(current_setting('test.confirm_event')::uuid);
select set_config('test.confirm_room',public.get_meetup_room_summary(current_setting('test.confirm_event')::uuid)->>'id',true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.join_meetup(current_setting('test.confirm_event')::uuid)$$,'late joining remains available');
select is(public.get_meetup(current_setting('test.confirm_event')::uuid)#>>'{viewerState,attendanceState}','confirmation_pending','late joining requires an explicit attendance confirmation');
select is((public.get_meetup(current_setting('test.confirm_event')::uuid)#>>'{viewerState,confirmationDeadlineAt}')::timestamptz,now()+interval '15 minutes','late participant receives fifteen minutes to confirm');
select is(public.get_meetup(current_setting('test.confirm_event')::uuid)#>>'{location,state}','protected_locked','protected location stays hidden until confirmation');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select public.process_hittumst_lifecycle();
select is((select status from public.meetup_participations where meetup_id=current_setting('test.confirm_event')::uuid and profile_id='10000000-0000-0000-0000-000000000002'),'joined','scheduler does not immediately remove a late participant');
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select lives_ok($$select public.confirm_meetup_attendance(current_setting('test.confirm_event')::uuid)$$,'late confirmation succeeds during the real window');
select lives_ok($$select public.confirm_meetup_attendance(current_setting('test.confirm_event')::uuid)$$,'confirmation retries are idempotent');
select is(public.get_meetup(current_setting('test.confirm_event')::uuid)#>>'{location,state}','protected_revealed','confirmed participant can retrieve the protected location during its release window');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select public.join_meetup(current_setting('test.confirm_event')::uuid);
reset role;
update public.meetup_participations set confirmation_requested_at=now()-interval '16 minutes'
  where meetup_id=current_setting('test.confirm_event')::uuid and profile_id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
select is(public.get_meetup(current_setting('test.confirm_event')::uuid)#>>'{capabilities,canConfirmAttendance}','false','expired confirmation control closes before the scheduler runs');
select is(public.get_meetup(current_setting('test.confirm_event')::uuid)#>>'{location,state}','protected_locked','expired pending participant cannot retrieve an address');
select is(public.get_meetup_room_summary(current_setting('test.confirm_event')::uuid),null::jsonb,'expired pending participant loses room summary immediately');
select throws_ok($$select public.list_meetup_room_message_page(current_setting('test.confirm_room')::uuid)$$,'42501','active_room_membership_required','expired pending participant cannot bypass through room history');
select throws_ok($$select public.confirm_meetup_attendance(current_setting('test.confirm_event')::uuid)$$,'55000','confirmation_not_available','confirmation cannot revive an expired window');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select public.process_hittumst_lifecycle();
select is((select status from public.meetup_participations where meetup_id=current_setting('test.confirm_event')::uuid and profile_id='10000000-0000-0000-0000-000000000003'),'left','scheduler expires the pending RSVP once');
select is(public.process_hittumst_lifecycle()->>'expired','0','retry does not release capacity twice');
select is((select count(*) from public.notifications where meetup_id=current_setting('test.confirm_event')::uuid and kind='meetup_starts_soon'),1::bigint,'reminder retry does not duplicate the confirmed participant notice');
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select lives_ok($$select public.join_meetup(current_setting('test.confirm_event')::uuid)$$,'a participant can explicitly rejoin if capacity is available');
select is(public.get_meetup(current_setting('test.confirm_event')::uuid)#>>'{viewerState,attendanceState}','confirmation_pending','explicit rejoining resets expired state');
select lives_ok($$select public.confirm_meetup_attendance(current_setting('test.confirm_event')::uuid)$$,'the new RSVP can be confirmed');
reset role;
update private.meetup_feature_config set expanded_launch_gates_passed=false where id=1;
set local role authenticated;
select is(public.get_meetup_room_summary(current_setting('test.confirm_event')::uuid),null::jsonb,'disabled expanded gate also removes room summaries');
reset role;
update private.meetup_feature_config set expanded_launch_gates_passed=true where id=1;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('test.private_event',public.create_meetup_draft(jsonb_build_object(
  'title','Late private approval','description','Synthetic adults verifying approval timing.',
  'category','community','tags',jsonb_build_array('community'),'startsAt',now()+interval '30 minutes',
  'accessMode','private','capacity',1,'locationVisibility','protected','generalAreaId','reykjavik',
  'latitude',64.1482,'longitude',-21.9511,'prohibitedServicesAttested',true))::text,true);
select public.publish_meetup(current_setting('test.private_event')::uuid);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select public.request_meetup_access(current_setting('test.private_event')::uuid);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.respond_to_meetup_request(current_setting('test.private_event')::uuid,'10000000-0000-0000-0000-000000000002',true)$$,'a host can approve a late request');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select is(public.get_meetup(current_setting('test.private_event')::uuid)#>>'{viewerState,attendanceState}','confirmation_pending','host approval does not confirm attendance for the participant');
select lives_ok($$select public.confirm_meetup_attendance(current_setting('test.private_event')::uuid)$$,'late approval receives a usable confirmation window');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.cancel_meetup(current_setting('test.private_event')::uuid);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.confirm_meetup_attendance(current_setting('test.private_event')::uuid)$$,'42501','meetup_not_joinable','confirmation retry does not bypass a cancellation');
select is(public.get_meetup_room_summary(current_setting('test.private_event')::uuid),null::jsonb,'cancellation revokes room summaries');
reset role;
select * from finish();
rollback;
