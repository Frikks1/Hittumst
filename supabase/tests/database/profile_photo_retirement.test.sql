begin;
insert into auth.sessions(id, user_id)
select md5('pgtap-session:' || id::text)::uuid, id from auth.users;
set local search_path = extensions, public, private;
select no_plan();

insert into public.profile_photos(id, profile_id, storage_path, position, approval_status, reviewed_at, moderation_source)
values
  ('21000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002/retired.png', 2, 'approved', now(), 'pipeline'),
  ('21000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002/photo.webp', 3, 'approved', now(), 'pipeline'),
  ('21000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002/21000000-0000-0000-0000-000000000003.gif', 4, 'approved', now(), 'pipeline');

select ok(not has_function_privilege('authenticated', 'private.cleanup_retired_profile_gif()', 'execute'), 'members cannot call the private cleanup trigger directly');
select ok(not has_table_privilege('authenticated', 'private.media_cleanup_jobs', 'insert'), 'members cannot enqueue arbitrary object deletion');
update public.profile_photos set tags = array['Music'] where id = '21000000-0000-0000-0000-000000000001';
select is((select count(*) from private.media_cleanup_jobs where bucket = 'profile-photos' and name = '10000000-0000-0000-0000-000000000002/retired.png'), 0::bigint, 'editing tags keeps the current photo stored');
update public.profile_photos set storage_path = '10000000-0000-0000-0000-000000000002/replacement.png'
where id = '21000000-0000-0000-0000-000000000001';
select is((select count(*) from private.media_cleanup_jobs where bucket = 'profile-photos' and name = '10000000-0000-0000-0000-000000000002/retired.png'), 1::bigint, 'retired normal images enter the durable cleanup queue');
select is((select count(*) from private.media_cleanup_jobs where bucket = 'profile-photos' and name = '10000000-0000-0000-0000-000000000002/replacement.png'), 0::bigint, 'a replacement image is retained until it is removed');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', '10000000-0000-0000-0000-000000000002', 'session_id', md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid)::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);
update public.profiles set cover_photo_id = '20000000-0000-0000-0000-000000000001' where id = auth.uid();
select lives_ok($$delete from public.profile_photos where id = '20000000-0000-0000-0000-000000000002'$$, 'RLS filters removal of another member photo');
select lives_ok($$delete from public.profile_photos where id = '20000000-0000-0000-0000-000000000001' and profile_id = auth.uid()$$, 'the owner can remove their approved JPEG');
select ok(not private.can_view_profile_photo_object('10000000-0000-0000-0000-000000000002/profile.jpg'), 'removal immediately revokes photo access');
delete from public.profile_photos where id in (
  '21000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000003');
reset role;

select ok(exists(select 1 from public.profile_photos where id = '20000000-0000-0000-0000-000000000002'), 'another member photo remains stored');
select is((select count(*) from private.media_cleanup_jobs where bucket = 'profile-photos' and name = '10000000-0000-0000-0000-000000000003/pending.jpg'), 0::bigint, 'denied removal does not enqueue another member file');
select is((select cover_photo_id from public.profiles where id = '10000000-0000-0000-0000-000000000002'), null::uuid, 'removing a cover clears the stale selection');
select is((select count(*) from private.media_cleanup_jobs where bucket = 'profile-photos' and name in (
  '10000000-0000-0000-0000-000000000002/profile.jpg',
  '10000000-0000-0000-0000-000000000002/replacement.png',
  '10000000-0000-0000-0000-000000000002/photo.webp',
  '10000000-0000-0000-0000-000000000002/21000000-0000-0000-0000-000000000003.gif',
  '10000000-0000-0000-0000-000000000002/21000000-0000-0000-0000-000000000003-thumb.jpg'
)), 5::bigint, 'JPEG, PNG, WebP and animated originals plus posters are queued exactly once');

select * from finish();
rollback;
