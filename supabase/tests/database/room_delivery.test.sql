begin;
-- Real synthetic sessions for member JWT fixtures; rows roll back with this test.
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
set local search_path=extensions,public,private;
select no_plan();
update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('test.event',public.create_meetup_draft(jsonb_build_object(
  'title','Room delivery fixture','description','Synthetic adults test occurrence chat authorization.',
  'category','community','tags',jsonb_build_array('community'),'startsAt',now()+interval '48 hours',
  'accessMode','open','locationVisibility','protected','generalAreaId','reykjavik',
  'latitude',64.1482,'longitude',-21.9511,'prohibitedServicesAttested',true))::text,true);
select lives_ok($$select public.publish_meetup(current_setting('test.event')::uuid)$$,'publication creates the occurrence room');
select set_config('test.room',public.get_meetup_room_summary(current_setting('test.event')::uuid)->>'id',true);
reset role;
insert into public.meetup_room_messages(id,room_id,sender_id,body,created_at)
select ('72000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,current_setting('test.room')::uuid,
  '10000000-0000-0000-0000-000000000001','Synthetic history '||n,now() from generate_series(1,125)n;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select throws_ok($$select public.list_meetup_room_message_page(current_setting('test.room')::uuid)$$,'42501','active_room_membership_required','unrelated users cannot read room history');
select lives_ok($$select public.join_meetup(current_setting('test.event')::uuid)$$,'open joining authorizes the occurrence room');
select is(public.get_meetup(current_setting('test.event')::uuid)#>>'{location,state}','protected_locked','chat admission does not release the protected location early');
select set_config('test.first',public.list_meetup_room_message_page(current_setting('test.room')::uuid)::text,true);
select is(jsonb_array_length(current_setting('test.first')::jsonb->'items'),50,'room history returns exactly 50 recent messages');
select set_config('test.second',public.list_meetup_room_message_page(current_setting('test.room')::uuid,(current_setting('test.first')::jsonb->>'nextCursor')::jsonb)::text,true);
select is(jsonb_array_length(current_setting('test.second')::jsonb->'items'),50,'second room page is bounded');
select is((select count(*) from jsonb_array_elements(current_setting('test.first')::jsonb->'items')a
  join jsonb_array_elements(current_setting('test.second')::jsonb->'items')b on a->>'id'=b->>'id'),0::bigint,'tied timestamps do not duplicate room messages');
select is(jsonb_array_length(public.list_meetup_room_message_page(current_setting('test.room')::uuid,(current_setting('test.second')::jsonb->>'nextCursor')::jsonb)->'items'),25,'cursor retains every remaining tied message');
select lives_ok($$select public.send_meetup_room_message_once(current_setting('test.room')::uuid,'73000000-0000-0000-0000-000000000001','Hello https://example.com/meet')$$,'an active participant can send');
select lives_ok($$select public.send_meetup_room_message_once(current_setting('test.room')::uuid,'73000000-0000-0000-0000-000000000001','Hello https://example.com/meet')$$,'uncertain sends can retry their ID');
select throws_ok($$select public.send_meetup_room_message_once(current_setting('test.room')::uuid,'73000000-0000-0000-0000-000000000001','Changed body')$$,'23505','message_id_conflict','retry IDs cannot silently change content');
reset role;
select is((select count(*) from public.meetup_room_messages where id='73000000-0000-0000-0000-000000000001'),1::bigint,'retry creates one durable message');
select is((select link_hostnames from public.meetup_room_messages where id='73000000-0000-0000-0000-000000000001'),array['example.com'],'external link labels contain the real hostname');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select public.join_meetup(current_setting('test.event')::uuid);
insert into public.blocks(blocker_id,blocked_id) values((select auth.uid()),'10000000-0000-0000-0000-000000000002');
select throws_ok($$select public.list_meetup_room_message_page(current_setting('test.room')::uuid)$$,'42501','active_room_membership_required','peer conflicts pause chat access');
delete from public.blocks where blocker_id=(select auth.uid());
select throws_ok($$select public.list_meetup_room_message_page(current_setting('test.room')::uuid)$$,'42501','active_room_membership_required','unblocking never silently restores paused chat access');
reset role;
select is((select count(*) from public.meetup_participations where meetup_id=current_setting('test.event')::uuid and status='joined'),2::bigint,'peer blocking preserves both RSVPs');
update public.meetup_rooms set status='locked',posting_closes_at=now()-interval '1 second',locked_at=now() where id=current_setting('test.room')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select lives_ok($$select public.list_meetup_room_message_page(current_setting('test.room')::uuid)$$,'locking posts retains authorized reading');
select throws_ok($$select public.send_meetup_room_message_once(current_setting('test.room')::uuid,gen_random_uuid(),'Too late')$$,'55000','room_posting_closed','posting deadline is enforced server-side');
reset role;
update public.meetup_rooms set reading_closes_at=now() where id=current_setting('test.room')::uuid;
set local role authenticated;
select throws_ok($$select public.list_meetup_room_message_page(current_setting('test.room')::uuid)$$,'42501','active_room_membership_required','reading deadline closes history even for the host');
select * from finish();
rollback;
