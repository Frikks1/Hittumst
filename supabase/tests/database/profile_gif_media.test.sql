begin;
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
set local search_path=extensions,public,private;
select no_plan();
select ok((select 'image/gif'=any(allowed_mime_types) and not public from storage.buckets where id='media-quarantine'),'GIF originals remain in private quarantine');
select ok((select 'image/gif'=any(allowed_mime_types) and file_size_limit=10485760 and not public from storage.buckets where id='profile-photos'),'approved GIF photos retain the private 10 MiB bucket');
select ok((select not ('image/gif'=any(allowed_mime_types)) from storage.buckets where id='message-images'),'message images do not permit GIFs');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select throws_ok($$insert into storage.objects(bucket_id,name) values('profile-photos','10000000-0000-0000-0000-000000000001/raw.gif')$$,'42501',null::text,'members cannot bypass moderation with a raw GIF');
select set_config('test.gif_job',public.reserve_media_upload('profile_photo','10000000-0000-0000-0000-000000000001','image')::text,true);
insert into storage.objects(bucket_id,name,metadata) values('media-quarantine',current_setting('test.gif_job')::jsonb->>'path','{"mimetype":"image/gif","size":100}');
select is((select count(*) from storage.objects where bucket_id='media-quarantine'),0::bigint,'the uploader cannot read an unapproved GIF');
select throws_ok($$select public.finish_media_upload((current_setting('test.gif_job')::jsonb->>'id')::uuid,gen_random_uuid(),100,null,'raw.gif',null,null)$$,'42501',null::text,'members cannot grant a GIF approval');
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.gif_claim',gen_random_uuid()::text,true);
select public.claim_media_upload(current_setting('test.gif_claim')::uuid);
insert into storage.objects(bucket_id,name,metadata) values
('profile-photos','10000000-0000-0000-0000-000000000001/'||(current_setting('test.gif_job')::jsonb->>'id')||'.gif','{"mimetype":"image/gif","size":100}'),
('profile-photos','10000000-0000-0000-0000-000000000001/'||(current_setting('test.gif_job')::jsonb->>'id')||'-thumb.jpg','{"mimetype":"image/jpeg","size":50}');
select throws_ok($$select public.finish_media_upload((current_setting('test.gif_job')::jsonb->>'id')::uuid,current_setting('test.gif_claim')::uuid,100,null,
 '10000000-0000-0000-0000-000000000001/'||(current_setting('test.gif_job')::jsonb->>'id')||'.gif',null,null)$$,'P0001','invalid_verified_media','approved animations require a static poster');
select throws_ok($$select public.finish_media_upload((current_setting('test.gif_job')::jsonb->>'id')::uuid,current_setting('test.gif_claim')::uuid,10485761,null,
 '10000000-0000-0000-0000-000000000001/'||(current_setting('test.gif_job')::jsonb->>'id')||'.gif',
 '10000000-0000-0000-0000-000000000001/'||(current_setting('test.gif_job')::jsonb->>'id')||'-thumb.jpg',null)$$,'P0001','invalid_verified_media','normalized GIFs cannot exceed the profile photo budget');
select ok(public.finish_media_upload((current_setting('test.gif_job')::jsonb->>'id')::uuid,current_setting('test.gif_claim')::uuid,100,null,
 '10000000-0000-0000-0000-000000000001/'||(current_setting('test.gif_job')::jsonb->>'id')||'.gif',
 '10000000-0000-0000-0000-000000000001/'||(current_setting('test.gif_job')::jsonb->>'id')||'-thumb.jpg',null),'reviewed GIF and poster publish through the existing photo budget');
select ok(public.recovery_media_is_current('profile-photos','10000000-0000-0000-0000-000000000001/'||(current_setting('test.gif_job')::jsonb->>'id')||'-thumb.jpg'),'approved first-frame posters join the recoverable media manifest');
reset role;
select is((select storage_path from public.profile_photos where id=(current_setting('test.gif_job')::jsonb->>'id')::uuid),
 '10000000-0000-0000-0000-000000000001/'||(current_setting('test.gif_job')::jsonb->>'id')||'.gif','profile photo metadata retains the animated output');
select ok(exists(select 1 from private.media_cleanup_jobs where bucket='media-quarantine' and name=current_setting('test.gif_job')::jsonb->>'path'),'GIF approval atomically schedules quarantine cleanup');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select ok(private.can_view_profile_gif_poster('10000000-0000-0000-0000-000000000001/'||(current_setting('test.gif_job')::jsonb->>'id')||'-thumb.jpg'),'the owner can read their approved accessibility poster');
select ok(not private.can_view_profile_gif_poster('10000000-0000-0000-0000-000000000001/unapproved-thumb.jpg'),'arbitrary poster paths cannot bypass approved profile visibility');
reset role;
delete from public.profile_photos where id=(current_setting('test.gif_job')::jsonb->>'id')::uuid;
select is((select count(*) from private.media_cleanup_jobs where bucket='profile-photos' and name in (
 '10000000-0000-0000-0000-000000000001/'||(current_setting('test.gif_job')::jsonb->>'id')||'.gif',
 '10000000-0000-0000-0000-000000000001/'||(current_setting('test.gif_job')::jsonb->>'id')||'-thumb.jpg')),2::bigint,'photo deletion schedules both the GIF and its poster for durable cleanup');
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.role','service_role',true);
select ok(not public.recovery_media_is_current('profile-photos','10000000-0000-0000-0000-000000000001/'||(current_setting('test.gif_job')::jsonb->>'id')||'-thumb.jpg'),'removed photos cannot restore orphaned posters');
reset role;
select * from finish();
rollback;
