begin;
insert into auth.sessions(id, user_id)
select md5('pgtap-session:' || id::text)::uuid, id from auth.users;
set local search_path = extensions, public, private;
select no_plan();
update private.private_locations set verified_at = now() where profile_id::text like '10000000-%';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', '10000000-0000-0000-0000-000000000002', 'session_id', md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid)::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$update public.profiles set display_name='Alex', pronouns='they/them', gender='nonbinary',
  identity_tags=array['queer','bi'], bio='Music and coffee', interests=array['Music','Coffee','Games'],
  looking_for=array['chat','friends'], socials='[{"platform":"instagram","handle":"alex_synth"},{"platform":"spotify","handle":"https://open.spotify.com/user/alex"},{"platform":"soundcloud","handle":"alex-synth"}]'::jsonb
  where id=auth.uid()$$, 'owner saves editor fields and all requested social platforms in one update');
select is((select display_name from public.profiles where id=auth.uid()), 'Alex', 'display name persists');
select is((select pronouns from public.profiles where id=auth.uid()), 'they/them', 'pronouns persist');
select is((select gender from public.profiles where id=auth.uid()), 'nonbinary', 'gender persists independently of orientation');
select is((select identity_tags from public.profiles where id=auth.uid()), array['queer','bi'], 'orientation choices persist');
select is((select bio from public.profiles where id=auth.uid()), 'Music and coffee', 'biography persists');
select is((select interests from public.profiles where id=auth.uid()), array['Music','Coffee','Games'], 'interest chips retain their order');
select is((select looking_for from public.profiles where id=auth.uid()), array['chat','friends'], 'intention switches persist');
select is((select jsonb_array_length(socials) from public.profiles where id=auth.uid()), 3, 'Instagram, Spotify and SoundCloud are retained');
select throws_ok($$update public.profiles set date_of_birth='2007-01-01' where id=auth.uid()$$, '42501', null::text, 'profile editing cannot rewrite the private source of age');
select throws_ok($$update public.profiles set display_name=' ' where id=auth.uid()$$, '23514', null::text, 'empty display names are rejected by the database');
select throws_ok($$update public.profiles set pronouns=repeat('x',51) where id=auth.uid()$$, '23514', null::text, 'oversized pronouns are rejected by the database');
select throws_ok($$update public.profiles set bio=repeat('x',501) where id=auth.uid()$$, '23514', null::text, 'oversized biographies are rejected by the database');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', '10000000-0000-0000-0000-000000000001', 'session_id', md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid)::text, true);
select is(public.get_public_profile('10000000-0000-0000-0000-000000000002')->>'display_name', 'Alex', 'a permitted public profile read reflects the saved name');
select is(public.get_public_profile('10000000-0000-0000-0000-000000000002')->'socials',
  '[{"platform":"instagram","handle":"alex_synth"},{"platform":"spotify","handle":"https://open.spotify.com/user/alex"},{"platform":"soundcloud","handle":"alex-synth"}]'::jsonb,
  'the protected public RPC returns music accounts without dropping them');
reset role;
select is((public.get_public_profile('10000000-0000-0000-0000-000000000002')->>'age')::integer,
  (select extract(year from age(current_date,date_of_birth))::integer from public.profiles where id='10000000-0000-0000-0000-000000000002'),
  'public age remains calculated from the registered birthday');
select * from finish();
rollback;
