begin;
-- Real synthetic sessions for member JWT fixtures; rows roll back with this test.
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
set local search_path=extensions,public,private;
select no_plan();
update private.private_locations set verified_at=now();
insert into public.conversations(id,participant_low,participant_high,created_by)
values('95000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
insert into public.conversation_members(conversation_id,user_id) values
('95000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
('95000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select lives_ok($$insert into public.messages(id,conversation_id,sender_id,body)
 values('95000000-0000-4000-8000-000000000002','95000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Client supplied UUID')$$,'mobile sender can insert its persistent client UUID');
select is((select count(*) from public.messages where id='95000000-0000-4000-8000-000000000002'),1::bigint,'persistent ID is visible for uncertain-response reconciliation');
select throws_like($$insert into public.messages(id,conversation_id,sender_id,body)
 values('95000000-0000-4000-8000-000000000003','95000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','Spoofed sender')$$,'%','granting client IDs still rejects forged senders');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select throws_like($$insert into public.messages(id,conversation_id,sender_id,body)
 values('95000000-0000-4000-8000-000000000004','95000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','Unrelated participant')$$,'%','granting client IDs still rejects unrelated conversations');
select * from finish();
rollback;
