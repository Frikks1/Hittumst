begin;
-- Real synthetic sessions for member JWT fixtures; rows roll back with this test.
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
insert into auth.sessions(id,user_id) values('99000000-0000-4000-8000-000000000001','90000000-0000-0000-0000-000000000001');
update private.private_locations set verified_at=now() where profile_id::text like '10000000-%';
set local search_path = extensions, public, private;

select plan(34);

select has_table('public', 'profiles', 'profiles exists');
select has_table('private', 'private_locations', 'locations are in a private schema');
select hasnt_column('private', 'private_locations', 'latitude', 'raw latitude is not stored');
select hasnt_column('private', 'private_locations', 'longitude', 'raw longitude is not stored');
select ok((select relrowsecurity from pg_class where oid='public.profiles'::regclass), 'profiles RLS is active');
select ok((select relrowsecurity from pg_class where oid='public.messages'::regclass), 'messages RLS is active');
select ok((select relrowsecurity from pg_class where oid='private.private_locations'::regclass), 'private locations RLS is active');
select has_function('public', 'update_location', array['double precision','double precision','double precision','timestamp with time zone'], 'location RPC exists');
select has_function('public', 'discover_nearby', array['jsonb','jsonb'], 'discovery RPC exists');
select ok(not has_table_privilege('anon','public.profiles','SELECT'),'anonymous users cannot select profiles');
select ok(has_table_privilege('authenticated','public.profiles','SELECT'),'authenticated role has Data API table access');
select has_table('public', 'profile_tag_catalog', 'profile tag catalog exists');
select has_table('public', 'albums', 'albums exist');
select has_table('public', 'album_items', 'album items exist');
select has_table('public', 'album_shares', 'album shares exist');
select has_table('public', 'album_view_sessions', 'view-once sessions exist');
select has_table('public', 'album_reactions', 'album reactions exist');
select ok((select relrowsecurity from pg_class where oid='public.albums'::regclass), 'albums RLS is active');
select ok((select relrowsecurity from pg_class where oid='public.album_items'::regclass), 'album items RLS is active');
select ok((select relrowsecurity from pg_class where oid='public.album_shares'::regclass), 'album shares RLS is active');
select has_function('public', 'share_albums', array['uuid','uuid[]','text'], 'album sharing RPC exists');
select has_function('public', 'open_album_share', array['uuid'], 'protected album viewer RPC exists');
select is((select count(*) from public.profile_tag_catalog), 195::bigint, 'exact tag catalog snapshot is seeded');

update public.profiles set profile_tags = array['gaming', 'hiking'] where id = '10000000-0000-0000-0000-000000000002';
update public.profiles set profile_tags = array['gaming'] where id = '10000000-0000-0000-0000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*) from public.profiles), 1::bigint, 'RLS exposes only the caller profile');
select is(
  (public.update_location(64.1466, -21.9426, 25, now()) ->> 'verified')::boolean,
  true,
  'Reykjavik location is accepted'
);
reset role;
select is(
  (select extensions.st_x(cell_center::extensions.geometry) from private.private_locations where profile_id = '10000000-0000-0000-0000-000000000001'),
  (select round(extensions.st_x(cell_center::extensions.geometry)::numeric, 2)::double precision from private.private_locations where profile_id = '10000000-0000-0000-0000-000000000001'),
  'stored longitude is snapped'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*) from public.discover_nearby('{"min_age":18,"max_age":99,"limit":40}'::jsonb, null)),
  2::bigint,
  'discovery returns eligible nearby profiles but not self'
);
select is(
  (select count(*) from public.discover_nearby('{"tags":["hiking"]}'::jsonb, null)),
  1::bigint,
  'single profile tag filters discovery'
);
select is(
  (select count(*) from public.discover_nearby('{"tags":["gaming","hiking"]}'::jsonb, null)),
  1::bigint,
  'multiple profile tags use AND semantics before the combined release'
);
select is(
  (select count(*) from public.discover_nearby('{"tags":["gaming","music"]}'::jsonb, null)),
  0::bigint,
  'legacy tag matching remains unchanged before release'
);

insert into public.blocks(blocker_id, blocked_id)
values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
select is(
  (select count(*) from public.discover_nearby('{"min_age":18,"max_age":99}'::jsonb, null)),
  1::bigint,
  'blocked profiles disappear from discovery immediately'
);
select throws_ok(
  $$select public.start_conversation('10000000-0000-0000-0000-000000000002')$$,
  '42501', 'conversation_not_allowed',
  'blocked profiles cannot start conversations'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','90000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:90000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claims','{"session_id":"99000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(private.is_admin(), 'role comes from protected app_metadata');
select is(jsonb_array_length(public.admin_list_reports(null, 50, null)), 1, 'staff can read report queue through RPC');

select * from finish();
rollback;
