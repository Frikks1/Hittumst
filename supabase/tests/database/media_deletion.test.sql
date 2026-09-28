begin;
-- Real synthetic sessions for member JWT fixtures; rows roll back with this test.
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
set local search_path=extensions,public,private;
select no_plan();
insert into private.media_uploads(id,owner_id,target_type,target_id,media_type,object_path,status,expires_at) values
 ('96000000-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000003','meetup','96000000-0000-4000-8000-000000000002','image','10000000-0000-0000-0000-000000000003/raw','processing',now()+interval '15 minutes');
-- A service upload has no auth owner and its prefix is an occurrence ID.
insert into storage.objects(bucket_id,name) values('meetup-media','96000000-0000-4000-8000-000000000002/96000000-0000-4000-8000-000000000001.jpg');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select public.delete_my_account();
select ok(not private.account_is_active(),'deletion restricts access immediately while a processor is draining');
reset role;
select ok((select available_at>=now()+interval '14 minutes' from private.account_deletion_jobs where account_id='10000000-0000-0000-0000-000000000003'),'cleanup waits out preexisting media leases');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
select is(jsonb_array_length(public.claim_account_deletions(gen_random_uuid())),0,'worker cannot race an in-flight media upload');
reset role;
update private.account_deletion_jobs set available_at=now()-interval '1 second' where account_id='10000000-0000-0000-0000-000000000003';
update private.media_uploads set expires_at=now()-interval '1 second' where id='96000000-0000-4000-8000-000000000001';
set local role service_role;
select set_config('test.deletion_claim',gen_random_uuid()::text,true);
select set_config('test.media_delete_job',public.claim_account_deletions(current_setting('test.deletion_claim')::uuid)::text,true);
select ok(exists(select 1 from jsonb_array_elements(current_setting('test.media_delete_job')::jsonb->0->'objects') o where o->>'bucket'='meetup-media' and o->>'name'='96000000-0000-4000-8000-000000000002/96000000-0000-4000-8000-000000000001.jpg'),'deletion manifest captures even orphaned service-written event output');
reset role;
-- Demonstrate the durable manifest survives cascade deletion of its ownership metadata.
delete from auth.users where id='10000000-0000-0000-0000-000000000003';
set local role service_role;
select throws_ok($$select public.finish_account_deletion((current_setting('test.media_delete_job')::jsonb->0->>'id')::uuid,current_setting('test.deletion_claim')::uuid,true)$$,'P0001','deletion_cleanup_incomplete','completion cannot ignore manifest bytes after the profile and job disappear');
select * from finish();
rollback;
