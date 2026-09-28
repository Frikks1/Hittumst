begin;
-- Real synthetic sessions for member JWT fixtures; rows roll back with this test.
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
set local search_path=extensions,public,private;
select no_plan();
update private.private_locations set verified_at=now();
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select throws_ok($$select public.reserve_media_upload('profile_photo','10000000-0000-0000-0000-000000000002','image')$$,'42501','media_target_unavailable','cannot reserve another account profile');
select throws_ok($$select public.reserve_media_upload('profile_photo','10000000-0000-0000-0000-000000000001','video')$$,'P0001','invalid_media_type','profile photo endpoint cannot bypass video constraints');
select throws_ok($$insert into storage.objects(bucket_id,name) values('profile-photos','10000000-0000-0000-0000-000000000001/raw.jpg')$$,'42501',null::text,'raw profile photo uploads are denied');
select throws_ok($$insert into storage.objects(bucket_id,name) values('profile-videos','10000000-0000-0000-0000-000000000001/raw.mp4')$$,'42501',null::text,'raw profile video uploads are denied');
select throws_ok($$insert into storage.objects(bucket_id,name) values('message-images','10000000-0000-0000-0000-000000000001/raw.jpg')$$,'42501',null::text,'raw message image uploads are denied');
select set_config('test.profile_job',public.reserve_media_upload('profile_photo','10000000-0000-0000-0000-000000000001','image')::text,true);
select lives_ok($$insert into storage.objects(bucket_id,name,metadata) values('media-quarantine',current_setting('test.profile_job')::jsonb->>'path','{"mimetype":"image/jpeg","size":100}')$$,'reservation accepts private original');
select is((select count(*) from storage.objects where bucket_id='media-quarantine'),0::bigint,'even the owner cannot read unreviewed quarantine');
select set_config('test.video_job',public.reserve_media_upload('profile_video','10000000-0000-0000-0000-000000000001','video','{"tags":["hello"]}')::text,true);
insert into storage.objects(bucket_id,name,metadata) values('media-quarantine',current_setting('test.video_job')::jsonb->>'path','{"mimetype":"video/mp4","size":100}');
select set_config('test.conversation',public.start_conversation('10000000-0000-0000-0000-000000000002')::text,true);
select set_config('test.message_job',public.reserve_media_upload('message',current_setting('test.conversation')::uuid,'image')::text,true);
select is((select media_status from public.messages where id=(current_setting('test.message_job')::jsonb->>'id')::uuid),'pending','message processing state is durable before upload');
insert into storage.objects(bucket_id,name,metadata) values('media-quarantine',current_setting('test.message_job')::jsonb->>'path','{"mimetype":"image/jpeg","size":100}');
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.pipeline_claim',gen_random_uuid()::text,true);
select public.claim_media_upload(current_setting('test.pipeline_claim')::uuid);
select public.claim_media_upload(current_setting('test.pipeline_claim')::uuid);
select public.claim_media_upload(current_setting('test.pipeline_claim')::uuid);
select ok(public.finish_media_upload((current_setting('test.profile_job')::jsonb->>'id')::uuid,current_setting('test.pipeline_claim')::uuid,100,null,
 '10000000-0000-0000-0000-000000000001/'||(current_setting('test.profile_job')::jsonb->>'id')||'.jpg',null,null),'reviewed profile photo is published');
select throws_ok($$select public.finish_media_upload((current_setting('test.video_job')::jsonb->>'id')::uuid,current_setting('test.pipeline_claim')::uuid,100,10001,
 '10000000-0000-0000-0000-000000000001/'||(current_setting('test.video_job')::jsonb->>'id')||'.mp4',null,null)$$,'P0001','invalid_verified_media','decoded profile video cannot exceed ten seconds');
select ok(public.finish_media_upload((current_setting('test.video_job')::jsonb->>'id')::uuid,current_setting('test.pipeline_claim')::uuid,100,10000,
 '10000000-0000-0000-0000-000000000001/'||(current_setting('test.video_job')::jsonb->>'id')||'.mp4',null,null),'reviewed profile video publishes at boundary');
reset role;
select is((select moderation_source from public.profile_photos where id=(current_setting('test.profile_job')::jsonb->>'id')::uuid),'pipeline','automated approval attribution is explicit');
select is((select reviewed_by from public.profile_photos where id=(current_setting('test.profile_job')::jsonb->>'id')::uuid),null::uuid,'pipeline does not fabricate a staff reviewer');
select is((select tags from public.profile_videos where id=(current_setting('test.video_job')::jsonb->>'id')::uuid),array['hello'],'profile video tags survive server processing');
-- Block while a worker has downloaded content, before publication.
insert into public.blocks(blocker_id,blocked_id) values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
set local role service_role;
select ok(not public.finish_media_upload((current_setting('test.message_job')::jsonb->>'id')::uuid,current_setting('test.pipeline_claim')::uuid,100,null,
 '10000000-0000-0000-0000-000000000001/'||(current_setting('test.message_job')::jsonb->>'id')||'.jpg',null,null),'blocking during processing prevents message publication');
reset role;
select is((select media_status from public.messages where id=(current_setting('test.message_job')::jsonb->>'id')::uuid),'rejected','failed publication updates the durable message state');
select is((select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname in('profile_photo_objects_update','message_image_objects_update','album_media_objects_update')),0::bigint,'no legacy overwrite policy can replace approved media');
select * from finish();
rollback;
