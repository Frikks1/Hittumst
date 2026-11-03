begin;
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
set local search_path=extensions,public,private;
select no_plan();
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
select ok(not has_function_privilege('anon','public.list_meetup_chats()','EXECUTE'),'anonymous callers cannot list event chats');
select ok(not has_function_privilege('anon','public.mark_meetup_room_read(uuid)','EXECUTE'),'anonymous callers cannot mark event chats read');
select ok(not has_function_privilege('service_role','private.list_meetup_chats_impl()','EXECUTE'),'workers cannot browse member event chat previews');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);
select set_config('test.event',public.create_meetup_draft(jsonb_build_object(
  'title','Automatic event chat fixture','description','Synthetic adult event chat membership and unread tests.',
  'category','community','tags',jsonb_build_array('community'),'startsAt',now()+interval '48 hours',
  'accessMode','open','locationVisibility','protected','generalAreaId','reykjavik',
  'latitude',64.1482,'longitude',-21.9511,'prohibitedServicesAttested',true))::text,true);
select lives_ok($$select public.publish_meetup(current_setting('test.event')::uuid)$$,'publishing creates a canonical attendee group chat');
select set_config('test.room',public.get_meetup_room_summary(current_setting('test.event')::uuid)->>'id',true);
select is((select count(*) from jsonb_array_elements(public.list_meetup_chats())item where item->>'meetupId'=current_setting('test.event')),1::bigint,'host inbox contains exactly one room immediately after publication');
select is((select item->>'id' from jsonb_array_elements(public.list_meetup_chats())item where item->>'meetupId'=current_setting('test.event')),current_setting('test.room'),'inbox uses the same canonical room');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid)::text,true);
select is((select count(*) from jsonb_array_elements(public.list_meetup_chats())item where item->>'meetupId'=current_setting('test.event')),0::bigint,'unrelated members never receive the room preview');
select throws_ok($$select public.mark_meetup_room_read(current_setting('test.room')::uuid)$$,'42501','active_room_membership_required','unrelated members cannot change read markers');
select lives_ok($$select public.join_meetup(current_setting('test.event')::uuid)$$,'joining admits the attendee to the existing group chat');
select is(public.get_meetup(current_setting('test.event')::uuid)#>>'{location,state}','protected_locked','chat admission preserves protected location release rules');
reset role;
update public.meetup_room_memberships set joined_at=now()-interval '1 minute' where room_id=current_setting('test.room')::uuid and profile_id='10000000-0000-0000-0000-000000000002';
insert into public.meetup_room_messages(room_id,sender_id,body,created_at) values
 (current_setting('test.room')::uuid,'10000000-0000-0000-0000-000000000001','Authorized host preview',now()-interval '10 seconds'),
 (current_setting('test.room')::uuid,'10000000-0000-0000-0000-000000000002','Own message',now()-interval '5 seconds');
insert into public.meetup_room_messages(room_id,sender_id,body,created_at,hidden_at) values
 (current_setting('test.room')::uuid,'10000000-0000-0000-0000-000000000001','Hidden moderation content',now()-interval '1 second',now());
set local role authenticated;
select set_config('test.chat',(select item::text from jsonb_array_elements(public.list_meetup_chats())item where item->>'meetupId'=current_setting('test.event')),true);
select is(current_setting('test.chat')::jsonb->>'lastMessage','Own message','preview excludes hidden messages');
select is((current_setting('test.chat')::jsonb->>'unreadCount')::integer,1,'unread count excludes own and hidden messages');
select ok(not (current_setting('test.chat')::jsonb ?| array['location','latitude','longitude','address','roster']),'inbox contains no venue or roster data');
select lives_ok($$select public.mark_meetup_room_read(current_setting('test.room')::uuid)$$,'active attendee can mark its own room read');
select is((select (item->>'unreadCount')::integer from jsonb_array_elements(public.list_meetup_chats())item where item->>'meetupId'=current_setting('test.event')),0,'reading clears that attendee unread count');
reset role;
select is((select last_read_at from public.meetup_room_memberships where room_id=current_setting('test.room')::uuid and profile_id='10000000-0000-0000-0000-000000000001'),null::timestamptz,'marking read never changes the host read marker');
set local role authenticated;
select public.leave_meetup(current_setting('test.event')::uuid);
select is((select count(*) from jsonb_array_elements(public.list_meetup_chats())item where item->>'meetupId'=current_setting('test.event')),0::bigint,'leaving removes inbox access immediately');
select throws_ok($$select public.mark_meetup_room_read(current_setting('test.room')::uuid)$$,'42501','active_room_membership_required','cached room IDs cannot mark read after leaving');

reset role;
update public.meetups set access_mode='private' where id=current_setting('test.event')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid)::text,true);
select public.request_meetup_access(current_setting('test.event')::uuid);
select is((select count(*) from jsonb_array_elements(public.list_meetup_chats())item where item->>'meetupId'=current_setting('test.event')),0::bigint,'pending access requests do not join the group chat');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);
select public.respond_to_meetup_request(current_setting('test.event')::uuid,'10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid)::text,true);
select is((select item->>'id' from jsonb_array_elements(public.list_meetup_chats())item where item->>'meetupId'=current_setting('test.event')),current_setting('test.room'),'approval adds the attendee to the same room');
reset role;
update public.meetup_participations set status='joined' where meetup_id=current_setting('test.event')::uuid and profile_id='10000000-0000-0000-0000-000000000002';
set local role authenticated;
insert into public.blocks(blocker_id,blocked_id) values((select auth.uid()),'10000000-0000-0000-0000-000000000002');
select set_config('test.chat',(select item::text from jsonb_array_elements(public.list_meetup_chats())item where item->>'meetupId'=current_setting('test.event')),true);
select is((current_setting('test.chat')::jsonb->>'isPaused')::boolean,true,'peer conflicts retain a paused room row');
select is((current_setting('test.chat')::jsonb->>'canPost')::boolean,false,'paused members cannot post from the inbox');
select ok(not (current_setting('test.chat')::jsonb ? 'lastMessage'),'paused room rows never leak a message preview');
select is((current_setting('test.chat')::jsonb->>'unreadCount')::integer,0,'paused room rows expose no unread activity');
select throws_ok($$select public.mark_meetup_room_read(current_setting('test.room')::uuid)$$,'42501','active_room_membership_required','paused membership cannot mark hidden messages read');
delete from public.blocks where blocker_id=(select auth.uid());
select is((select (item->>'isPaused')::boolean from jsonb_array_elements(public.list_meetup_chats())item where item->>'meetupId'=current_setting('test.event')),true,'unblocking never silently restores paused chat access');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.list_meetup_chats()$$,'42501','active_member_required','missing session cannot browse event previews');
select throws_ok($$select public.mark_meetup_room_read(current_setting('test.room')::uuid)$$,'42501','active_room_membership_required','missing session cannot alter a read marker');
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid)::text,true);
insert into public.blocks(blocker_id,blocked_id) values((select auth.uid()),'10000000-0000-0000-0000-000000000001');
select is((select count(*) from jsonb_array_elements(public.list_meetup_chats())item where item->>'meetupId'=current_setting('test.event')),0::bigint,'blocking the host removes the inbox row and preview');
select throws_ok($$select public.mark_meetup_room_read(current_setting('test.room')::uuid)$$,'42501','active_room_membership_required','blocking the host revokes read marker access');
reset role;
delete from public.blocks where blocker_id='10000000-0000-0000-0000-000000000003';
update public.meetup_rooms set reading_closes_at=now() where id=current_setting('test.room')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);
select is((select count(*) from jsonb_array_elements(public.list_meetup_chats())item where item->>'meetupId'=current_setting('test.event')),0::bigint,'room reading deadline removes the host inbox row');
select throws_ok($$select public.mark_meetup_room_read(current_setting('test.room')::uuid)$$,'42501','active_room_membership_required','reading deadline also closes the read marker endpoint');
select * from finish();
rollback;
