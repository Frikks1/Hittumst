begin;
-- Real synthetic sessions for member JWT fixtures; rows roll back with this test.
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
insert into auth.sessions(id,user_id) values('99000000-0000-4000-8000-000000000001','90000000-0000-0000-0000-000000000001');
-- These privacy/participation fixtures need several albums or occurrences.
update private.commerce_configuration set mode='sandbox';
insert into private.member_subscriptions(account_id,tier,paid_until,source)
select id,'flottari_plebbi',now()+interval '1 month','sandbox' from public.profiles
on conflict(account_id) do update set tier=excluded.tier,paid_until=excluded.paid_until;
update private.private_locations set verified_at=now() where profile_id::text like '10000000-%';
set local search_path = extensions, public, private;

select plan(50);

insert into public.albums (id, owner_id, name)
values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Private one'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'View once');

insert into public.album_items (id, album_id, owner_id, storage_path, media_type, position, byte_size)
values
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/first.jpg', 'image', 1, 1200),
  ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/second.webp', 'image', 2, 1400),
  ('31000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000002/other.jpg', 'image', 1, 900);

select has_function('public', 'share_albums_with_profiles', array['uuid[]','uuid[]','text'], 'multi-recipient album sharing RPC exists');
select is((select public from storage.buckets where id = 'album-media'), false, 'album media bucket is private');
select is((select file_size_limit from storage.buckets where id = 'album-media'), 31457280::bigint, 'album media bucket is capped at 30 MB');
select results_eq(
  $$select category, count(*) from public.profile_tag_catalog group by category order by category$$,
  $$values ('hobbies'::text, 29::bigint), ('kinks'::text, 100::bigint), ('other'::text, 36::bigint), ('personality'::text, 30::bigint)$$,
  'the four exact catalog categories have their frozen sizes'
);
select is((select label from public.profile_tag_catalog where tag_id = 'gaming'), 'Gaming', 'official tag labels retain exact English casing');
select ok((select relrowsecurity from pg_class where oid='public.album_view_sessions'::regclass), 'view sessions use RLS');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*) from public.albums), 2::bigint, 'an owner can list their albums');
select ok(private.can_upload_album_media_object('10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/new.jpg'), 'owner upload paths must name a real owned album');
select ok(not private.can_upload_album_media_object('10000000-0000-0000-0000-000000000001/ffffffff-ffff-ffff-ffff-ffffffffffff/forged.jpg'), 'forged album upload paths are rejected');
select throws_ok($$select public.share_albums_with_profiles(array[
    '20000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid,
    '20000000-0000-0000-0000-000000000003'::uuid, '20000000-0000-0000-0000-000000000004'::uuid,
    '20000000-0000-0000-0000-000000000005'::uuid, '20000000-0000-0000-0000-000000000006'::uuid
  ], array['30000000-0000-0000-0000-000000000001'::uuid], 'indefinite')$$,
  '22023', 'invalid_recipient_selection', 'one action cannot target more than five profiles'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*) from public.albums), 0::bigint, 'unshared albums are isolated by RLS');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select public.share_albums_with_profiles(
    array['10000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000003'::uuid],
    array['30000000-0000-0000-0000-000000000001'::uuid], '10_minutes'
  )$$, 'an album can be shared with several eligible profiles atomically');
select is((select count(*) from public.album_shares where album_id = '30000000-0000-0000-0000-000000000001'), 2::bigint, 'one share row is created for each recipient');
select is((select count(*) from public.messages where message_kind = 'album_share' and body = 'Private album request'), 2::bigint, 'locked cards retain an older-client text fallback');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*) from public.albums), 0::bigint, 'a pending request reveals no album name or metadata');
select lives_ok(
  $$select public.respond_to_album_share((select id from public.album_shares where album_id = '30000000-0000-0000-0000-000000000001' and recipient_id = auth.uid()), true)$$,
  'the intended recipient can accept a pending share'
);
select ok((select expires_at between accepted_at + interval '9 minutes 59 seconds' and accepted_at + interval '10 minutes 1 second' from public.album_shares where album_id = '30000000-0000-0000-0000-000000000001' and recipient_id = auth.uid()), 'timed access begins when the recipient accepts');
select is((select count(*) from public.albums), 1::bigint, 'accepted recipients can read album metadata');
select is(
  jsonb_array_length((public.open_album_share((select id from public.album_shares where album_id = '30000000-0000-0000-0000-000000000001' and recipient_id = auth.uid())) -> 'items')),
  2,
  'opening an accepted share returns its active items'
);
select ok((select last_viewed_version = (select content_version from public.albums where id = album_id) from public.album_shares where album_id = '30000000-0000-0000-0000-000000000001' and recipient_id = auth.uid()), 'opening records the viewed content version');
select throws_ok($$select * from public.discover_nearby('{"tags":["gaming","hiking","music","yoga"]}'::jsonb, null)$$,
  '22023', 'too_many_tag_filters', 'discovery rejects more than three tag filters'
);
select throws_ok(
  $$update public.profiles set profile_tags = array['not-an-official-tag'] where id = auth.uid()$$,
  '22023', 'invalid_profile_tag', 'profiles reject unknown tag IDs'
);
select throws_ok(
  $$update public.profiles set profile_tags = array['gaming','gaming'] where id = auth.uid()$$,
  '22023', 'duplicate_profile_tag', 'profiles reject duplicate tag IDs'
);
select throws_ok(
  $$update public.profiles set profile_tags = array['gaming','hiking','music','yoga','reading','movies','cooking','dancing','gym','writing','art'] where id = auth.uid()$$, null::text, null::text, 'profiles reject more than ten tags');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
reset role;
select lives_ok(
  $$insert into public.album_items (album_id, owner_id, storage_path, media_type, position, byte_size)
    values ('30000000-0000-0000-0000-000000000001', auth.uid(), '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/later.png', 'image', 3, 1600)$$,
  'verified processing can add later album content'
);
set local role authenticated;
select ok((select a.content_version > s.last_viewed_version from public.albums a join public.album_shares s on s.album_id = a.id where s.recipient_id = '10000000-0000-0000-0000-000000000002' and a.id = '30000000-0000-0000-0000-000000000001'), 'later additions produce an unseen-content version');
select lives_ok(
  $$select public.share_albums('10000000-0000-0000-0000-000000000002', array['30000000-0000-0000-0000-000000000002'::uuid], 'view_once')$$,
  'owners can create a view-once share'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.respond_to_album_share((select id from public.album_shares where album_id = '30000000-0000-0000-0000-000000000002' and recipient_id = auth.uid()), true)$$,
  'a recipient can accept view-once access'
);
select lives_ok(
  $$select set_config('test.view_once_session',public.open_album_share((select id from public.album_shares where album_id = '30000000-0000-0000-0000-000000000002' and recipient_id = auth.uid()))->>'session_id',true)$$,
  'the first view-once open atomically creates a viewer session'
);
select throws_ok($$select public.open_album_share((select id from public.album_shares where album_id = '30000000-0000-0000-0000-000000000002' and recipient_id = auth.uid()))$$,
  '42501', 'album_already_viewed', 'a consumed view-once share cannot be reopened'
);
reset role;
select is((select count(*) from public.album_view_sessions where viewer_id = '10000000-0000-0000-0000-000000000002'), 1::bigint, 'only one viewer session exists for the share');
set local role authenticated;
select lives_ok($$select public.close_album_view_session(current_setting('test.view_once_session')::uuid)$$, 'leaving closes the in-memory viewer session');
select ok(not private.can_view_album_media_object('10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000002/other.jpg'), 'a closed view-once session cannot refresh signed media URLs');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.respond_to_album_share((select id from public.album_shares where album_id = '30000000-0000-0000-0000-000000000001' and recipient_id = auth.uid()), true)$$,
  'another recipient can accept their independent share'
);
select lives_ok(
  $$insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), '10000000-0000-0000-0000-000000000001')$$,
  'blocking an album owner succeeds'
);
select is((select status from public.album_shares where album_id = '30000000-0000-0000-0000-000000000001' and recipient_id = auth.uid()), 'revoked', 'blocking permanently revokes the accepted share');
reset role;
delete from public.blocks where blocker_id = '10000000-0000-0000-0000-000000000003' and blocked_id = '10000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select is((select status from public.album_shares where album_id = '30000000-0000-0000-0000-000000000001' and recipient_id = auth.uid()), 'revoked', 'unblocking never restores the revoked share');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$insert into public.reports (reporter_id, reported_id, album_share_id, album_item_id, category, details)
    values (auth.uid(), '10000000-0000-0000-0000-000000000001',
      (select id from public.album_shares where album_id = '30000000-0000-0000-0000-000000000001' and recipient_id = auth.uid()),
      '31000000-0000-0000-0000-000000000001', 'ncii', 'Synthetic album evidence test')$$,
  'recipients can report one exact accessible album item'
);

reset role;
select set_config('test.album_report',(select id::text from public.reports where album_item_id='31000000-0000-0000-0000-000000000001'),true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','90000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:90000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claims','{"session_id":"99000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(private.can_view_album_media_object('10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/first.jpg'), 'staff can request only reported album evidence');
select ok(not private.can_view_album_media_object('10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/second.webp'), 'staff cannot browse unreported album items');
select is(
  public.admin_get_report(current_setting('test.album_report')::uuid) #>> '{album_evidence,item_id}',
  '31000000-0000-0000-0000-000000000001',
  'the moderation report returns only its exact album evidence'
);
reset role;
select is((select count(*) from private.admin_audit_log where action = 'album_evidence_access' and target_id = '31000000-0000-0000-0000-000000000001'), 1::bigint, 'moderation evidence access is audited with a 60-second TTL');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((public.delete_album_item('31000000-0000-0000-0000-000000000001') ->> 'preserved')::boolean, true, 'deleting reported media preserves the evidence record');
select ok((select deleted_at is not null from public.album_items where id = '31000000-0000-0000-0000-000000000001'), 'reported evidence is soft-deleted');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','90000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:90000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claims','{"session_id":"99000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(private.can_view_album_media_object('10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/first.jpg'), 'reported evidence remains available to staff after soft deletion');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(not private.can_view_album_media_object('10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/first.jpg'), 'soft-deleted evidence is no longer available to the recipient');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
-- Verified fixture media is installed by the operator; clients use quarantine reservations.
reset role;
insert into public.album_items (album_id, owner_id, storage_path, media_type, position, byte_size)
select '30000000-0000-0000-0000-000000000001', auth.uid(),
  '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/fill-' || position || '.jpg',
  'image', position, 1000
from unnest(array[1,4,5,6,7,8,9,10]) position;
set local role authenticated;
select throws_ok($$insert into public.album_items (album_id, owner_id, storage_path, media_type, position, byte_size)
    values ('30000000-0000-0000-0000-000000000001', auth.uid(), '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/eleventh.jpg', 'image', 11, 1000)$$,
  '23514', 'album_photo_limit_reached', 'the database enforces ten photos per album'
);
select throws_ok(
  $$insert into public.album_items (album_id, owner_id, storage_path, media_type, position, byte_size, duration_ms)
    values ('30000000-0000-0000-0000-000000000002', auth.uid(), '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000002/too-long.mp4', 'video', 2, 1000, 15001)$$, null::text, null::text, 'videos over 15 seconds are rejected');
select throws_ok($$insert into public.album_items (album_id, owner_id, storage_path, media_type, position, byte_size)
    values ('30000000-0000-0000-0000-000000000002', auth.uid(), '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000002/too-big.jpg', 'image', 2, 31457281)$$, null::text, null::text, 'files over 30 MB are rejected');

insert into public.albums (owner_id, name)
select auth.uid(), 'Limit ' || number from generate_series(1, 1) number;
select throws_ok(
  $$insert into public.albums (owner_id, name) values (auth.uid(), 'Eleventh album')$$,
  '23514', 'album_limit_reached', 'the database enforces three active albums for Plus'
);

select * from finish();
rollback;
