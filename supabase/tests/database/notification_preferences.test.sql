begin;
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
set local search_path=extensions,public,private;
select no_plan();
update private.private_locations set verified_at=now();
insert into public.conversations(id,participant_low,participant_high,created_by) values
 ('97000000-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
insert into public.conversation_members(conversation_id,user_id) values
 ('97000000-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('97000000-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000002');
insert into public.messages(id,conversation_id,sender_id,body) values
 ('97000000-0000-4000-8000-000000000002','97000000-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000001','Synthetic message');
select set_config('test.preference_dm',(select id::text from public.notifications where direct_message_id='97000000-0000-4000-8000-000000000002'),true);
select ok(not has_table_privilege('authenticated','private.notification_preferences','SELECT'),'members cannot enumerate preference records');
select ok(not has_table_privilege('authenticated','private.conversation_mutes','INSERT'),'members cannot forge another account mute');
select ok(not has_function_privilege('anon','public.get_notification_preferences()','EXECUTE'),'anonymous preferences denied');
select ok(not has_function_privilege('anon','public.update_notification_preferences(jsonb)','EXECUTE'),'anonymous updates denied');
select ok(not has_function_privilege('anon','public.set_conversation_muted(uuid,boolean)','EXECUTE'),'anonymous mute denied');
select ok(not has_function_privilege('authenticated','private.notification_push_allowed(uuid,timestamptz)','EXECUTE'),'push eligibility is worker-internal');
select ok(not has_function_privilege('authenticated','private.notification_preferences_payload(uuid)','EXECUTE'),'other account payload cannot be requested');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','role','authenticated','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid)::text,true);
select is(public.get_notification_preferences()->>'timeZone','Atlantic/Reykjavik','new account defaults to Iceland time');
select is(public.get_notification_preferences()->'mutedConversationIds','[]'::jsonb,'new account has no muted conversations');
select is(public.update_notification_preferences('{"messages":false}')->>'messages','false','owner can disable messages');
select is(public.get_notification_preferences()->>'events','true','partial update preserves event preference');
select throws_ok($$select public.update_notification_preferences('{"profileId":"other","messages":true}')$$,'22023','invalid_notification_preference','owner selector rejected');
select throws_ok($$select public.update_notification_preferences('{"messages":"false"}')$$,'22023','invalid_notification_preference','non-boolean rejected');
select throws_ok($$select public.update_notification_preferences('{"events":null}')$$,'22023','invalid_notification_preference','null rejected');
select throws_ok($$select public.update_notification_preferences('{"quietHoursStart":"24:00"}')$$,'22023','invalid_notification_preference','invalid clock rejected');
select throws_ok($$select public.update_notification_preferences('{"timeZone":"Unknown/Place"}')$$,'22023','invalid_notification_preference','unknown zone rejected');
select is(public.get_notification_preferences()->>'messages','false','failed updates preserve prior preferences');
select lives_ok($$select public.set_conversation_muted('97000000-0000-4000-8000-000000000001',true)$$,'member can mute own conversation');
select is(jsonb_array_length(public.get_notification_preferences()->'mutedConversationIds'),1,'mute included in owner payload');
select ok(public.export_account() ? 'notificationPreferences','account export includes notification choices');
select ok(public.export_my_account() ? 'notificationPreferences','mobile export includes notification choices');
select ok(public.export_account() ? 'profileActivity','export preserves existing activity records');
reset role;
select ok(not private.notification_push_allowed(current_setting('test.preference_dm')::uuid),'message category suppresses queued delivery');
update private.notification_preferences set messages=true where profile_id='10000000-0000-0000-0000-000000000002';
select ok(not private.notification_push_allowed(current_setting('test.preference_dm')::uuid),'conversation mute independently suppresses delivery');

set local role authenticated;
select lives_ok($$select public.set_conversation_muted('97000000-0000-4000-8000-000000000001',false)$$,'owner can unmute');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','role','authenticated','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid)::text,true);
select throws_ok($$select public.set_conversation_muted('97000000-0000-4000-8000-000000000001',true)$$,'42501','conversation_unavailable','outsider cannot mute another conversation');
select is(public.get_notification_preferences()->>'messages','true','other account remains at defaults');
reset role;
select ok(private.notification_push_allowed(current_setting('test.preference_dm')::uuid),'unmuted authorized message can be delivered');
update private.notification_preferences set quiet_hours_enabled=true,quiet_hours_start='22:00',quiet_hours_end='08:00' where profile_id='10000000-0000-0000-0000-000000000002';
select ok(not private.notification_push_allowed(current_setting('test.preference_dm')::uuid,'2026-10-11 22:00+00'),'overnight start is quiet');
select ok(not private.notification_push_allowed(current_setting('test.preference_dm')::uuid,'2026-10-12 07:59+00'),'overnight early morning is quiet');
select ok(private.notification_push_allowed(current_setting('test.preference_dm')::uuid,'2026-10-12 08:00+00'),'quiet end allows delivery');
update private.notification_preferences set time_zone='Europe/London',quiet_hours_start='01:00',quiet_hours_end='02:00' where profile_id='10000000-0000-0000-0000-000000000002';
select ok(not private.notification_push_allowed(current_setting('test.preference_dm')::uuid,'2026-10-25 00:30+00'),'first repeated DST hour is quiet');
select ok(not private.notification_push_allowed(current_setting('test.preference_dm')::uuid,'2026-10-25 01:30+00'),'second repeated DST hour is quiet');
update private.notification_preferences set quiet_hours_start='08:00',quiet_hours_end='08:00' where profile_id='10000000-0000-0000-0000-000000000002';
select ok(not private.notification_push_allowed(current_setting('test.preference_dm')::uuid,'2026-10-11 12:00+00'),'equal quiet clocks mean all day');
update private.notification_preferences set quiet_hours_enabled=false where profile_id='10000000-0000-0000-0000-000000000002';

insert into public.notifications(id,recipient_id,kind) values('97000000-0000-4000-8000-000000000003','10000000-0000-0000-0000-000000000002','meetup_starts_soon');
update private.notification_preferences set events=false where profile_id='10000000-0000-0000-0000-000000000002';
select ok(not private.notification_push_allowed('97000000-0000-4000-8000-000000000003'),'event category disabled');
select ok(private.notification_push_allowed(current_setting('test.preference_dm')::uuid),'event category leaves messages enabled');

insert into public.groups(id,owner_id,name) values('97000000-0000-4000-8000-000000000004','10000000-0000-0000-0000-000000000001','Synthetic notification group');
insert into public.group_members(group_id,profile_id,role,status) values
 ('97000000-0000-4000-8000-000000000004','10000000-0000-0000-0000-000000000001','owner','active'),
 ('97000000-0000-4000-8000-000000000004','10000000-0000-0000-0000-000000000002','member','active');
insert into public.group_messages(id,group_id,sender_id,body) values
 ('97000000-0000-4000-8000-000000000005','97000000-0000-4000-8000-000000000004','10000000-0000-0000-0000-000000000001','Synthetic group message');
select set_config('test.preference_group',(select id::text from public.notifications where group_message_id='97000000-0000-4000-8000-000000000005'),true);
select ok(private.notification_push_allowed(current_setting('test.preference_group')::uuid),'group category independent of disabled events');
update private.notification_preferences set groups=false where profile_id='10000000-0000-0000-0000-000000000002';
select ok(not private.notification_push_allowed(current_setting('test.preference_group')::uuid),'group category suppresses group push');
select ok(private.notification_push_allowed(current_setting('test.preference_dm')::uuid),'group category leaves messages enabled');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','role','authenticated','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);
select lives_ok($$select public.record_profile_view('10000000-0000-0000-0000-000000000002')$$,'view recorded without notification');
reset role;
select is((select count(*) from public.notifications where kind='profile_tap'),0::bigint,'view never produces tap push');
set local role authenticated;
select lives_ok($$select public.send_profile_tap('10000000-0000-0000-0000-000000000002')$$,'explicit tap enqueues notification');
reset role;
select set_config('test.preference_tap',(select id::text from public.notifications where kind='profile_tap' and recipient_id='10000000-0000-0000-0000-000000000002'),true);
select is((select payload from public.notifications where id=current_setting('test.preference_tap')::uuid),'{}'::jsonb,'tap push contains no profile content');
select is((select count(*) from private.notification_outbox where notification_id=current_setting('test.preference_tap')::uuid),1::bigint,'tap enqueues one durable push job');
select ok(private.notification_push_allowed(current_setting('test.preference_tap')::uuid),'tap remains enabled when events disabled');
update private.notification_preferences set taps=false where profile_id='10000000-0000-0000-0000-000000000002';
select ok(not private.notification_push_allowed(current_setting('test.preference_tap')::uuid),'tap preference suppresses delivery');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','role','authenticated','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid)::text,true);
select is(public.resolve_notification(current_setting('test.preference_tap')::uuid)->>'type','profile','recipient resolves a visible tap actor');
select ok(not exists(select 1 from jsonb_array_elements(public.list_notifications(200))item where item->>'kind'='profile_tap'),'tap notifications preserve the meetup-only inbox contract');
select lives_ok($$select public.register_push_token('ExponentPushToken[preferences-fixture]','ios','en')$$,'recipient registers a session-bound synthetic device');
reset role;
insert into private.notification_outbox(notification_id) values('97000000-0000-4000-8000-000000000003');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.preference_claim',public.claim_notification_outbox(100,'97000000-0000-4000-8000-000000000006')::text,true);
reset role;
select is((select jsonb_array_length(item->'tokens') from jsonb_array_elements(current_setting('test.preference_claim')::jsonb)item where item->'notification'->>'id'='97000000-0000-4000-8000-000000000003'),0,'queued event claim observes disabled event preference');
select is((select jsonb_array_length(item->'tokens') from jsonb_array_elements(current_setting('test.preference_claim')::jsonb)item where item->'notification'->>'id'=current_setting('test.preference_tap')),0,'queued tap claim observes disabled tap preference');
select is((select jsonb_array_length(item->'tokens') from jsonb_array_elements(current_setting('test.preference_claim')::jsonb)item where item->'notification'->>'id'=current_setting('test.preference_group')),0,'queued group claim observes disabled group preference');
select ok((select jsonb_array_length(item->'tokens')>0 from jsonb_array_elements(current_setting('test.preference_claim')::jsonb)item where item->'notification'->>'id'=current_setting('test.preference_dm')),'enabled direct-message claim retains the authorized token');
insert into public.blocks(blocker_id,blocked_id) values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
select ok(not private.message_notification_access(current_setting('test.preference_tap')::uuid,'10000000-0000-0000-0000-000000000002'),'block prevents queued tap delivery');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select throws_ok($$select public.resolve_notification(current_setting('test.preference_tap')::uuid)$$,'42501','notification_unavailable','old tap cannot open blocked profile');
reset role;
delete from auth.sessions where user_id='10000000-0000-0000-0000-000000000002';
set local role authenticated;
select throws_ok($$select public.get_notification_preferences()$$,'42501','active_session_required','revoked session cannot read preferences');
select is(public.list_notifications(200),'[]'::jsonb,'revoked session cannot enumerate meetup notifications');
select throws_ok($$select public.update_notification_preferences('{"messages":false}')$$,'42501','active_session_required','revoked session cannot update preferences');
select throws_ok($$select public.set_conversation_muted('97000000-0000-4000-8000-000000000001',true)$$,'42501','active_session_required','revoked session cannot mute');
reset role;
select is((select count(*) from pg_constraint where conrelid='private.notification_preferences'::regclass and contype='f' and confdeltype='c'),1::bigint,'preferences erase with account');
select is((select count(*) from pg_constraint where conrelid='private.conversation_mutes'::regclass and contype='f' and confdeltype='c'),2::bigint,'mutes erase with account or conversation');
select * from finish();
rollback;
