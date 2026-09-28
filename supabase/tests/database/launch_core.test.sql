begin;
-- Real synthetic sessions for member JWT fixtures; rows roll back with this test.
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
update private.private_locations set verified_at=now() where profile_id::text like '10000000-%';
set local search_path = extensions, public, private;
select no_plan();

select ok(not has_function_privilege('anon','public.list_conversations_page(jsonb,text,integer)','execute'),'inbox requires authentication');
select ok(has_function_privilege('authenticated','public.create_group(text,text,text)','execute'),'permanent groups restored through authorized RPCs');
select ok(not has_function_privilege('authenticated','public.rate_content(text,uuid,smallint)','execute'),'person ratings stay disabled');
select ok(not has_table_privilege('authenticated','public.group_voice_sessions','select'),'voice stays disabled');
select ok(not has_table_privilege('authenticated','private.write_quota_events','select'),'quota records stay private');

-- Start with a previously opened, unread conversation. The public creator must
-- reuse it without advancing either member's read marker.
insert into public.conversations(id,participant_low,participant_high,created_by)
values('71000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
insert into public.conversation_members(conversation_id,user_id,last_read_at)
values('71000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',now()-interval '1 day'),
  ('71000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',now()-interval '1 day');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('test.conversation',public.start_conversation('10000000-0000-0000-0000-000000000002')::text,true);
select is(current_setting('test.conversation'),'71000000-0000-0000-0000-000000000001','opening a conversation reuses its stable ID');
select is((public.get_launch_capabilities()->>'permanentGroups')::boolean,true,'groups capability reflects restored workflows');
select is((public.get_launch_capabilities()->>'explicitEvents')::boolean,false,'explicit events remain disabled');

reset role;
-- Synthetic history is installed as an operator, without consuming member write quotas.
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
insert into public.messages(id,conversation_id,sender_id,body,created_at)
select ('70000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,current_setting('test.conversation')::uuid,
  '10000000-0000-0000-0000-000000000002','Synthetic pagination '||n,now()
from generate_series(1,125) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('test.page',public.list_messages_page(current_setting('test.conversation')::uuid)::text,true);
select is(jsonb_array_length(current_setting('test.page')::jsonb->'items'),50,'history starts with 50 recent messages');
select set_config('test.page2',public.list_messages_page(current_setting('test.conversation')::uuid,current_setting('test.page')::jsonb->'nextCursor')::text,true);
select is(jsonb_array_length(current_setting('test.page2')::jsonb->'items'),50,'history cursor loads the next 50');
select is((select count(*) from jsonb_array_elements(current_setting('test.page')::jsonb->'items') a
  join jsonb_array_elements(current_setting('test.page2')::jsonb->'items') b on a->>'id'=b->>'id'),0::bigint,'tied timestamps never duplicate rows across pages');
select is(jsonb_array_length(public.list_messages_page(current_setting('test.conversation')::uuid,current_setting('test.page2')::jsonb->'nextCursor')->'items'),25,'final history page is bounded');
select is(jsonb_array_length(public.list_conversations_page()->'items'),1,'one inbox operation returns the conversation');
select is((public.list_conversations_page()->'items'->0->>'unreadCount')::integer,125,'unread count includes unseen history');
update public.conversation_members set last_read_at=now()+interval '10 years' where conversation_id=current_setting('test.conversation')::uuid and user_id=(select auth.uid());
select ok((select last_read_at<=now() from public.conversation_members where conversation_id=current_setting('test.conversation')::uuid and user_id=(select auth.uid())),'future read markers are clamped to valid messages');

insert into public.messages(conversation_id,sender_id,body)
select current_setting('test.conversation')::uuid,(select auth.uid()),'Quota test' from generate_series(1,60);
select throws_ok($$insert into public.messages(conversation_id,sender_id,body) values(current_setting('test.conversation')::uuid,(select auth.uid()),'Too many')$$,'P0001','rate_limit_exceeded','61st message in a minute is rejected');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select throws_ok($$select public.list_messages_page(current_setting('test.conversation')::uuid)$$,'42501','conversation_access_denied','unrelated account cannot page private history');
select is(jsonb_array_length(public.list_conversations_page()->'items'),0,'unrelated inbox reveals no conversation');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
insert into public.blocks(blocker_id,blocked_id) values((select auth.uid()),'10000000-0000-0000-0000-000000000002');
select throws_ok($$select public.list_messages_page(current_setting('test.conversation')::uuid)$$,'42501','conversation_access_denied','blocking revokes history immediately');
select is(jsonb_array_length(public.list_conversations_page()->'items'),0,'blocked conversations leave the inbox');
select * from finish();
rollback;
