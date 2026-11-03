begin;
set local search_path=extensions,public,private;
select no_plan();
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users on conflict do nothing;
update private.private_locations set verified_at=now();
create function pg_temp.mp_member(p_n integer) returns void language plpgsql as $$
declare person uuid:=('10000000-0000-0000-0000-'||lpad(p_n::text,12,'0'))::uuid; begin
 perform set_config('request.jwt.claim.sub',person::text,true); perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',person,'role','authenticated','session_id',md5('pgtap-session:'||person::text)::uuid)::text,true);
end $$;
create function pg_temp.mp_service() returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claim.role','service_role',true);
 perform set_config('request.jwt.claims','{}',true);
end $$;

select ok(not has_column_privilege('authenticated','public.profile_photos','archived_at','update'),'members cannot unarchive legacy pictures');
select ok(not has_column_privilege('authenticated','public.profiles','main_photo_generation','update'),'members cannot forge replacement generations');
select ok(not has_function_privilege('authenticated','private.finish_media_before_main_photo(uuid,uuid,integer,integer,text,text,text)','execute'),'old finalizer cannot bypass replacement enforcement');
select ok(not has_function_privilege('service_role','private.finish_media_before_main_photo(uuid,uuid,integer,integer,text,text,text)','execute'),'workers cannot bypass via a renamed finalizer');
select ok(not has_function_privilege('anon','public.get_main_profile_photo_upload()','execute'),'staged replacement status requires a member');

-- A six-photo account retains exactly the same old row IDs, paths and positions.
insert into public.profile_photos(id,profile_id,storage_path,position,approval_status,reviewed_at,moderation_source)
select ('99100000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000002',
 '10000000-0000-0000-0000-000000000002/legacy-'||n||'.jpg',n,'approved',now(),'pipeline'
from generate_series(2,6) n;
insert into storage.objects(bucket_id,name) select 'profile-photos',storage_path from public.profile_photos
where profile_id='10000000-0000-0000-0000-000000000002' on conflict do nothing;
select is((select count(*) from public.profile_photos where profile_id='10000000-0000-0000-0000-000000000002'),6::bigint,'all six original photos remain stored');
select is((select count(*) from public.profile_photos where profile_id='10000000-0000-0000-0000-000000000002' and archived_at is not null),5::bigint,'approved legacy extras are owner-only');
select is(private.main_profile_photo_id('10000000-0000-0000-0000-000000000002'),'20000000-0000-0000-0000-000000000001'::uuid,'existing main remains selected');

set local role authenticated;
select pg_temp.mp_member(2);
select is((select count(*) from storage.objects where bucket_id='profile-photos' and name like auth.uid()::text||'/%'),6::bigint,'owner can still read all their approved archived files');
select throws_ok($$update public.profiles set cover_photo_id='99100000-0000-0000-0000-000000000006' where id=auth.uid()$$,'23514','cover_requires_own_approved_photo','archived extra cannot become the cover through profile editing');
select set_config('test.mp.rejected',public.reserve_media_upload('profile_photo',auth.uid(),'image')::text,true);
select is(public.get_main_profile_photo_upload()->>'status','pending','owner sees separate pending replacement status');
select throws_ok($$select public.reserve_media_upload('profile_photo',auth.uid(),'image')$$,'23514','main_photo_replacement_pending','a second explicit replacement cannot enter the pipeline concurrently');
select is((select count(*) from public.profile_photos where profile_id=auth.uid()),6::bigint,'reservation uses no historical photo slot');
reset role;
select set_config('test.mp.claim',gen_random_uuid()::text,true);
update private.media_uploads set status='processing',claim_id=current_setting('test.mp.claim')::uuid,expires_at=now()+interval '15 minutes'
where id=(current_setting('test.mp.rejected')::jsonb->>'id')::uuid;
set local role service_role;
select pg_temp.mp_service();
select ok(public.finish_media_upload((current_setting('test.mp.rejected')::jsonb->>'id')::uuid,current_setting('test.mp.claim')::uuid,null,null,null,null,'moderation_rejected'),'rejection records the result without changing the current main');
reset role;
select is(private.main_profile_photo_id('10000000-0000-0000-0000-000000000002'),'20000000-0000-0000-0000-000000000001'::uuid,'rejected replacement keeps original main');
set local role authenticated;
select pg_temp.mp_member(2);
select is(public.get_main_profile_photo_upload()->>'status','rejected','owner sees failed review and can retry');
select set_config('test.mp.gif',public.reserve_media_upload('profile_photo',auth.uid(),'image')::text,true);
reset role;
update private.media_uploads set status='processing',claim_id=current_setting('test.mp.claim')::uuid,expires_at=now()+interval '15 minutes'
where id=(current_setting('test.mp.gif')::jsonb->>'id')::uuid;
insert into storage.objects(bucket_id,name) values
 ('profile-photos','10000000-0000-0000-0000-000000000002/'||(current_setting('test.mp.gif')::jsonb->>'id')||'.gif'),
 ('profile-photos','10000000-0000-0000-0000-000000000002/'||(current_setting('test.mp.gif')::jsonb->>'id')||'-thumb.jpg');
set local role service_role;
select pg_temp.mp_service();
select throws_ok($$select public.finish_media_upload((current_setting('test.mp.gif')::jsonb->>'id')::uuid,current_setting('test.mp.claim')::uuid,100,null,
 '10000000-0000-0000-0000-000000000002/'||(current_setting('test.mp.gif')::jsonb->>'id')||'.gif',null,null)$$,'P0001','invalid_verified_media','invalid GIF finalization cannot archive the original picture');
select ok(not public.finish_media_upload((current_setting('test.mp.gif')::jsonb->>'id')::uuid,gen_random_uuid(),100,null,
 '10000000-0000-0000-0000-000000000002/'||(current_setting('test.mp.gif')::jsonb->>'id')||'.gif',
 '10000000-0000-0000-0000-000000000002/'||(current_setting('test.mp.gif')::jsonb->>'id')||'-thumb.jpg',null),'stale claim cannot publish');
select ok(public.finish_media_upload((current_setting('test.mp.gif')::jsonb->>'id')::uuid,current_setting('test.mp.claim')::uuid,100,null,
 '10000000-0000-0000-0000-000000000002/'||(current_setting('test.mp.gif')::jsonb->>'id')||'.gif',
 '10000000-0000-0000-0000-000000000002/'||(current_setting('test.mp.gif')::jsonb->>'id')||'-thumb.jpg',null),'valid GIF approval atomically promotes the replacement');
select ok(public.finish_media_upload((current_setting('test.mp.gif')::jsonb->>'id')::uuid,current_setting('test.mp.claim')::uuid,100,null,
 '10000000-0000-0000-0000-000000000002/'||(current_setting('test.mp.gif')::jsonb->>'id')||'.gif',
 '10000000-0000-0000-0000-000000000002/'||(current_setting('test.mp.gif')::jsonb->>'id')||'-thumb.jpg',null),'lost finalization responses can retry safely');
select ok(public.recovery_media_is_current('profile-photos','10000000-0000-0000-0000-000000000002/profile.jpg'),'archived former main remains recoverable');
reset role;
select is((select count(*) from public.profile_photos where profile_id='10000000-0000-0000-0000-000000000002'),7::bigint,'replacement preserves all six previous photo records');
select is((select count(*) from public.profile_photos where profile_id='10000000-0000-0000-0000-000000000002' and archived_at is null and approval_status='approved'),1::bigint,'only one approved photo is current');
select is((select cover_photo_id from public.profiles where id='10000000-0000-0000-0000-000000000002'),(current_setting('test.mp.gif')::jsonb->>'id')::uuid,'cover follows the approved replacement');
select is((select position from public.profile_photos where id='20000000-0000-0000-0000-000000000001'),1::smallint,'retired main keeps its original position');
select is((select count(*) from private.media_cleanup_jobs where bucket='profile-photos' and name like '10000000-0000-0000-0000-000000000002/%'),0::bigint,'archiving schedules no original or poster deletion');

-- Old legacy and appealed generations may finish later but never become public.
insert into private.media_uploads(id,owner_id,target_type,target_id,media_type,object_path,metadata,status,claim_id,expires_at)
values('99200000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','profile_photo','10000000-0000-0000-0000-000000000002','image',
 '10000000-0000-0000-0000-000000000002/legacy-queued','{}','processing',current_setting('test.mp.claim')::uuid,now()+interval '1 hour');
update private.media_uploads set status='processing',claim_id=current_setting('test.mp.claim')::uuid,expires_at=now()+interval '1 hour'
where id=(current_setting('test.mp.rejected')::jsonb->>'id')::uuid;
set local role service_role;
select pg_temp.mp_service();
select ok(not public.finish_media_upload('99200000-0000-0000-0000-000000000001',current_setting('test.mp.claim')::uuid,100,null,
 '10000000-0000-0000-0000-000000000002/99200000-0000-0000-0000-000000000001.jpg',null,null),'legacy queued upload cannot replace the current picture');
select ok(not public.finish_media_upload((current_setting('test.mp.rejected')::jsonb->>'id')::uuid,current_setting('test.mp.claim')::uuid,100,null,
 '10000000-0000-0000-0000-000000000002/'||(current_setting('test.mp.rejected')::jsonb->>'id')||'.jpg',null,null),'an appealed older replacement cannot overwrite the new generation');
reset role;
set local role authenticated;
select pg_temp.mp_member(1);
select is(jsonb_array_length(public.get_public_profile('10000000-0000-0000-0000-000000000002')->'photo_paths'),1,'public profile returns exactly the main photo');
select is(public.get_public_profile('10000000-0000-0000-0000-000000000002')->'profile_videos','[]'::jsonb,'public profile video gallery is parked');
select is((select cardinality(photo_paths) from public.discover_nearby('{}') where profile_id='10000000-0000-0000-0000-000000000002'),1,'discovery uses the same main picture');
select is((select count(*) from storage.objects where bucket_id='profile-photos' and name='10000000-0000-0000-0000-000000000002/profile.jpg'),0::bigint,'ordinary viewer cannot newly sign the archived main');
select ok(not private.can_read_room_profile_photo('10000000-0000-0000-0000-000000000002/profile.jpg'),'room avatar alternate path cannot authorize an archived picture');
select ok(not private.showcase_can_read_media('profile-photos','10000000-0000-0000-0000-000000000002/profile.jpg'),'showcase alternate path cannot authorize an archived picture');
select ok(not private.profile_photo_is_current_or_owned('10000000-0000-0000-0000-000000000002/profile.jpg'),'global restrictive boundary prevents future permissive avatar policies from signing archives');
select ok(private.can_view_profile_gif_poster('10000000-0000-0000-0000-000000000002/'||(current_setting('test.mp.gif')::jsonb->>'id')||'-thumb.jpg'),'only the current GIF poster shares main-photo access');
select is(public.get_main_profile_photo_upload(),null::jsonb,'another member sees only their own replacement status');
reset role;
insert into public.blocks(blocker_id,blocked_id) values('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
set local role authenticated;
select pg_temp.mp_member(1);
select is((select count(*) from storage.objects where bucket_id='profile-photos' and name like '10000000-0000-0000-0000-000000000002/%'),0::bigint,'blocking revokes main and poster access');
select * from finish();
rollback;
