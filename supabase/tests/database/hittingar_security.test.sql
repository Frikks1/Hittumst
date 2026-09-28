begin;
-- Real synthetic sessions for member JWT fixtures; rows roll back with this test.
insert into auth.sessions(id,user_id) select md5('pgtap-session:'||id::text)::uuid,id from auth.users;
insert into auth.sessions(id,user_id) values('99000000-0000-4000-8000-000000000001','90000000-0000-0000-0000-000000000001');
-- These privacy/participation fixtures need several albums or occurrences.
update private.commerce_configuration set mode='sandbox';
insert into private.member_subscriptions(account_id,tier,paid_until,source)
select id,'flottari_plebbi',now()+interval '1 month','sandbox' from public.profiles
on conflict(account_id) do update set tier=excluded.tier,paid_until=excluded.paid_until;
set local search_path = extensions, public, private;

select no_plan();

select has_table('public', 'meetup_general_areas', 'controlled general-area catalog exists');
select is((select count(*) from public.meetup_general_areas), 12::bigint, 'the reviewed general-area catalog is seeded');
select results_eq(
  $$select distinct region from public.meetup_general_areas order by region$$,
  $$values ('capital'::text), ('east'::text), ('north'::text), ('south'::text), ('west'::text), ('westfjords'::text)$$,
  'catalog regions match the shared mobile contract'
);
select has_table('private', 'meetup_locations', 'exact meetup locations are private');
select ok(not has_table_privilege('authenticated','private.meetup_locations','SELECT'),'authenticated clients cannot select exact locations');
select ok(not has_table_privilege('service_role','private.meetup_locations','SELECT'),'workers use narrow RPCs rather than browsing exact locations');
select ok(not has_table_privilege('authenticated','private.meetup_creation_attempts','SELECT'),'clients cannot inspect meetup creation quota events');
select ok(not has_table_privilege('authenticated','private.meetup_place_search_attempts','SELECT'),'clients cannot inspect place-search quota events');
select ok(not has_table_privilege('authenticated','private.meetup_participation_attempts','SELECT'),'clients cannot inspect participation quota events');
select ok(not has_table_privilege('authenticated','private.meetup_feature_config','SELECT'),'clients cannot browse the rollout control relation');
select ok((select relrowsecurity from pg_class where oid='public.meetup_general_areas'::regclass), 'general-area catalog uses RLS');
select ok((select relrowsecurity from pg_class where oid='public.meetups'::regclass), 'meetups use RLS');
select ok((select relrowsecurity from pg_class where oid='public.meetup_participations'::regclass), 'participations use RLS');
select ok((select relrowsecurity from pg_class where oid='public.notifications'::regclass), 'notifications use RLS');
select ok((select relrowsecurity from pg_class where oid='private.meetup_locations'::regclass), 'private meetup locations use RLS');
select has_function('public', 'can_create_meetup', array[]::text[], 'place-search can reuse the canonical host eligibility check');
select has_function('public', 'discover_meetups', array['jsonb'], 'sanitized discovery RPC exists');
select has_function('public', 'list_meetup_participants', array['uuid'], 'complete host participant roster RPC exists');
select has_function('public', 'consume_meetup_place_search_quota', array[]::text[], 'authenticated place-search quota RPC exists');
select has_function('public', 'admin_get_meetup_location_evidence', array['uuid','text'], 'case-scoped exact evidence RPC exists');
select ok(has_function_privilege('authenticated', 'public.can_create_meetup()', 'EXECUTE'), 'authenticated callers may check their own host eligibility');
select ok(not has_function_privilege('anon', 'public.can_create_meetup()', 'EXECUTE'), 'anonymous callers cannot check meetup eligibility');
select ok(not has_function_privilege('anon', 'public.discover_meetups(jsonb)', 'EXECUTE'), 'anonymous callers cannot invoke meetup discovery');
select ok(not has_function_privilege('anon', 'public.get_meetup(uuid)', 'EXECUTE'), 'anonymous callers cannot retrieve meetup detail');
select ok(has_function_privilege('authenticated', 'public.list_meetup_participants(uuid)', 'EXECUTE'), 'hosts can invoke the participant roster RPC');
select ok(has_function_privilege('authenticated', 'public.consume_meetup_place_search_quota()', 'EXECUTE'), 'authenticated place search can consume its quota');
select ok(not has_function_privilege('authenticated', 'public.set_meetup_feature_enabled(boolean)', 'EXECUTE'), 'clients cannot change the server rollout flag');
select ok(has_function_privilege('service_role', 'public.set_meetup_feature_enabled(boolean)', 'EXECUTE'), 'the service role can change the server rollout flag');
select ok(not has_function_privilege('authenticated', 'public.claim_notification_outbox(integer,uuid)', 'EXECUTE'), 'clients cannot claim push jobs');
select ok(has_function_privilege('service_role', 'public.claim_notification_outbox(integer,uuid)', 'EXECUTE'), 'service workers can claim push jobs');
select is((select purge_enabled from private.meetup_retention_config where id = 1), false, 'purge is disabled by default');
select is((select policy_approved_at from private.meetup_retention_config where id = 1), null::timestamptz, 'retention policy is explicitly unapproved');
select ok((select draft_retention is null and standard_retention is null and reported_retention is null from private.meetup_retention_config where id = 1), 'unapproved retention durations are not invented');
select is((select enabled from private.meetup_feature_config where id = 1), false, 'Hittingar is disabled at the server by default');

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok($$select public.discover_meetups('{}'::jsonb)$$, null::text, null::text, 'anonymous discovery invocation is denied by database privileges');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(not public.can_create_meetup(), 'the canonical host check stays false while rollout is disabled');
select throws_ok($$select public.create_meetup_draft('{}'::jsonb)$$,
  '55000', 'meetup_feature_disabled',
  'server rollout blocks direct create RPC bypasses'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.purge_expired_meetups(10)$$,
  '55000', 'meetup_purge_disabled',
  'even the service worker cannot purge before policy approval and enablement'
);
select throws_ok($$select public.set_meetup_feature_enabled(true)$$,
  '55000','expanded_hittingar_launch_gates_required','Hittingar cannot bypass its own launch evidence');
reset role;
-- This disposable test transaction models reviewed Hittingar evidence only.
update private.meetup_feature_config set expanded_launch_gates_passed=true where id=1;
set local role service_role;
select lives_ok($$select public.set_meetup_feature_enabled(true)$$, 'the service role can enable the reviewed rollout');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(public.can_create_meetup(), 'an active visible consenting adult can host');
select lives_ok(
  $$select public.consume_meetup_place_search_quota() from generate_series(1, 30)$$,
  'the first thirty place-search requests in ten minutes are accepted'
);
select throws_ok($$select public.consume_meetup_place_search_quota()$$,
  '54000', 'meetup_place_search_rate_limit_exceeded',
  'the thirty-first place-search request in ten minutes is denied'
);
select throws_ok(
  $$select public.create_meetup_draft(jsonb_build_object(
    'title','Invalid long tag','description','This meetup input contains one invalid oversized tag.',
    'category','coffee_food','tags',jsonb_build_array(repeat('x', 31)),
    'startsAt',now() + interval '2 days','accessMode','open','locationVisibility','protected',
    'generalAreaId','reykjavik','latitude',64.1468,'longitude',-21.9430
  ))$$, '23514', null::text, 'the database rejects tags longer than the shared thirty-character limit');
select throws_ok($$select public.create_meetup_draft(jsonb_build_object(
    'title','Invalid duplicate tags','description','This meetup input contains duplicate normalized tags.',
    'category','coffee_food','tags',jsonb_build_array('coffee','coffee'),
    'startsAt',now() + interval '2 days','accessMode','open','locationVisibility','protected',
    'generalAreaId','reykjavik','latitude',64.1468,'longitude',-21.9430
  ))$$, '23514', null::text, 'the database rejects duplicate canonical tags');
select throws_ok($$select public.create_meetup_draft(jsonb_build_object(
    'title','Unknown tag test','description','This meetup input contains a tag outside the reviewed catalog.',
    'category','coffee_food','tags',jsonb_build_array('not_in_catalog'),
    'startsAt',now() + interval '2 days','accessMode','open','locationVisibility','protected',
    'generalAreaId','reykjavik','latitude',64.1468,'longitude',-21.9430
  ))$$, '23514', null::text, 'the database rejects meetup tags outside the canonical catalog');
select lives_ok($$select set_config('test.unattested_meetup', public.create_meetup_draft(jsonb_build_object(
    'title','Attestation test meetup','description','Synthetic public meetup for server attestation checks.',
    'category','coffee_food','tags',jsonb_build_array('coffee'),
    'startsAt',now() + interval '2 days','accessMode','open','locationVisibility','public',
    'releasePolicy','immediate','generalAreaId','reykjavik','latitude',64.1468,'longitude',-21.9430
  ))::text, true)$$, 'drafts persist explicit attestation state without trusting the client at publish time');
select throws_ok($$select public.publish_meetup(current_setting('test.unattested_meetup')::uuid)$$,
  '22023', 'prohibited_services_attestation_required',
  'publishing requires a persisted prohibited-services attestation'
);
select lives_ok($$select public.update_meetup(
    current_setting('test.unattested_meetup')::uuid,
    '{"prohibitedServicesAttested":true}'::jsonb
  )$$, 'the attestation can be persisted through the caller-bound update RPC');
select throws_ok($$select public.publish_meetup(current_setting('test.unattested_meetup')::uuid)$$,
  '22023', 'public_location_confirmation_required',
  'public publishing also requires a persisted location confirmation'
);
select lives_ok($$select public.update_meetup(
    current_setting('test.unattested_meetup')::uuid,
    '{"publicLocationConfirmed":true}'::jsonb
  )$$, 'the public-location confirmation is persisted separately');
select lives_ok(
  $$select public.delete_meetup_draft(current_setting('test.unattested_meetup')::uuid)$$,
  'the attestation fixture draft can be cleaned up'
);
select throws_ok($$select public.create_meetup_draft(jsonb_build_object(
    'title','Public without policy','description','Explicit public release policy is required.',
    'category','coffee_food','tags',jsonb_build_array('coffee'),
    'startsAt',now() + interval '2 days','accessMode','open','locationVisibility','public',
    'generalAreaId','reykjavik','latitude',64.1468,'longitude',-21.9430
  ))$$, '23502', null::text, 'public locations cannot inherit the protected release default');
select lives_ok($$select set_config('test.protected_meetup', public.create_meetup_draft(jsonb_build_object(
    'title','Protected test meetup','description','Synthetic protected meetup for authorization tests.',
    'category','community','tags',jsonb_build_array('community'),
    'startsAt',now() + interval '48 hours','accessMode','private','locationVisibility','protected',
    'generalAreaId','reykjavik','capacity',1,'latitude',64.1482,'longitude',-21.9511,
    'venueName','Synthetic venue','address','Synthetic address','arrivalInstructions','SECRET DOOR CODE',
    'prohibitedServicesAttested',true
  ))::text, true)$$, 'a valid protected draft is created through the RPC');
select is(
  (select location_release_policy from public.meetups where id = current_setting('test.protected_meetup')::uuid),
  '24_hours_before',
  'protected meetups default to the safer 24-hour release policy'
);
select is(
  (select effective_end - starts_at from public.meetups where id = current_setting('test.protected_meetup')::uuid),
  interval '12 hours',
  'effective_end uses the reviewed 12-hour fallback'
);
select lives_ok(
  $$select public.publish_meetup(current_setting('test.protected_meetup')::uuid)$$,
  'the host can publish a complete draft'
);
select is(
  (public.get_meetup(current_setting('test.protected_meetup')::uuid) #>> '{location,state}'),
  'protected_revealed',
  'the host always sees their own protected location'
);

reset role;
select ok((
  select l.discovery_point = a.safe_marker
  from private.meetup_locations l
  join public.meetups m on m.id = l.meetup_id
  join public.meetup_general_areas a on a.code = m.general_area
  where l.meetup_id = current_setting('test.protected_meetup')::uuid
), 'protected discovery uses the catalog centroid, not a derived exact point');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(jsonb_array_length(public.discover_meetups('{}'::jsonb)), 1, 'eligible members discover the meetup');
select is(public.get_meetup(current_setting('test.protected_meetup')::uuid) #>> '{location,state}', 'protected_locked', 'unauthorized detail contains only the locked location');
select ok(not (public.get_meetup(current_setting('test.protected_meetup')::uuid) #> '{location}') ? 'exactLocation', 'locked payload omits exactLocation entirely');
select is(jsonb_array_length(public.discover_meetups('{"region":"south"}'::jsonb)), 0, 'region filters use the catalog region rather than area IDs');
select is(
  public.request_meetup_access(current_setting('test.protected_meetup')::uuid) ->> 'status',
  'pending',
  'private meetup access starts pending'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.respond_to_meetup_request(
    current_setting('test.protected_meetup')::uuid,
    '10000000-0000-0000-0000-000000000002', true
  ) ->> 'status',
  'approved',
  'the host can approve a pending request atomically'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.get_meetup(current_setting('test.protected_meetup')::uuid) #>> '{location,state}', 'protected_locked', 'approval before release time does not reveal the location');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.update_meetup(current_setting('test.protected_meetup')::uuid, jsonb_build_object('startsAt', now() + interval '12 hours'))$$,
  'the host may move an unreleased window earlier'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.get_meetup(current_setting('test.protected_meetup')::uuid) #>> '{location,state}', 'protected_revealed', 'approved access reveals only after release time');
select is(
  (public.get_meetup(current_setting('test.protected_meetup')::uuid) #>> '{location,accessExpiresAt}')::timestamptz,
  (public.get_meetup(current_setting('test.protected_meetup')::uuid)->>'effectiveEnd')::timestamptz + interval '2 hours',
  'protected access expiry is effective_end plus two hours'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select public.update_meetup(current_setting('test.protected_meetup')::uuid, jsonb_build_object('startsAt', now() + interval '72 hours'))$$,
  '55000', 'released_location_window_cannot_move_later',
  'a location window cannot move later after an attendee became eligible'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.request_meetup_access(current_setting('test.protected_meetup')::uuid) ->> 'status', 'pending', 'a second member may request access');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*) from public.meetup_participations where meetup_id = current_setting('test.protected_meetup')::uuid), 1::bigint, 'a participant can select only their own participation row');
select is((select count(*) from public.meetup_participations where meetup_id = current_setting('test.protected_meetup')::uuid and profile_id = '10000000-0000-0000-0000-000000000003'), 0::bigint, 'another attendee identity is isolated by RLS');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  jsonb_array_length(public.list_meetup_participants(current_setting('test.protected_meetup')::uuid)),
  2,
  'the host participant roster includes both approved and pending rows'
);
select ok(
  jsonb_path_exists(
    public.list_meetup_participants(current_setting('test.protected_meetup')::uuid),
    '$[*] ? (@.status == "approved")'
  ),
  'the participant roster includes approved attendees, not only access requests'
);
select throws_ok(
  $$select public.respond_to_meetup_request(current_setting('test.protected_meetup')::uuid, '10000000-0000-0000-0000-000000000003', true)$$,
  '23514', 'meetup_full',
  'capacity is checked while the meetup row is locked'
);
select lives_ok($$select public.update_meetup(current_setting('test.protected_meetup')::uuid, '{"accessMode":"open"}'::jsonb)$$, 'access mode can change without rewriting participation state');
select is((select status from public.meetup_participations where meetup_id = current_setting('test.protected_meetup')::uuid and profile_id = '10000000-0000-0000-0000-000000000002'), 'approved', 'approved access survives a mode change');
select is((select status from public.meetup_participations where meetup_id = current_setting('test.protected_meetup')::uuid and profile_id = '10000000-0000-0000-0000-000000000003'), 'pending', 'pending access is not auto-approved by a mode change');
select is(
  public.respond_to_meetup_request(current_setting('test.protected_meetup')::uuid, '10000000-0000-0000-0000-000000000003', false) ->> 'status',
  'declined',
  'the host can explicitly decline a request'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select public.join_meetup(current_setting('test.protected_meetup')::uuid)$$,
  '55000', 'meetup_participation_already_exists',
  'declined state is terminal for self-service retries'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  public.reinstate_meetup_participant(current_setting('test.protected_meetup')::uuid, '10000000-0000-0000-0000-000000000003', 'pending') ->> 'status',
  'pending',
  'only an explicit host action reverses a terminal decline'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$insert into public.reports (reporter_id, reported_id, meetup_id, category, details)
    values (auth.uid(), '10000000-0000-0000-0000-000000000003', current_setting('test.protected_meetup')::uuid, 'harassment', 'Forged host context')$$,
  '42501', 'invalid_meetup_report_context',
  'a reporter cannot forge meetup_id with an unrelated reported profile'
);
select lives_ok($$select set_config('test.meetup_report', public.report_meetup(
    current_setting('test.protected_meetup')::uuid, 'harassment', 'Synthetic meetup safety report'
  )::text, true)$$, 'a related member can report the host and meetup');
reset role;
select is((select priority from public.reports where id = current_setting('test.meetup_report')::uuid), 'urgent', 'report priority follows the canonical runbook');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select public.admin_get_meetup_location_evidence(current_setting('test.meetup_report')::uuid, 'Unauthorized evidence attempt')$$,
  '42501', 'staff_access_required',
  'ordinary members cannot open exact moderation evidence'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','90000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:90000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claims','{"session_id":"99000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(
  public.admin_get_report(current_setting('test.meetup_report')::uuid)::text not like '%SECRET DOOR CODE%',
  'ordinary report detail contains only the safe meetup snapshot'
);
select is(
  public.admin_get_report(current_setting('test.meetup_report')::uuid)
    #>> '{meetup_evidence,snapshot,generalArea,labelEn}',
  'Reykjavík',
  'moderation snapshots include the controlled general-area labels'
);
select is(
  (public.admin_get_report(current_setting('test.meetup_report')::uuid)
    #>> '{meetup_evidence,snapshot,participantCount}')::integer,
  1,
  'moderation snapshots include the active participant count at capture time'
);
select lives_ok($$select set_config(
    'test.meetup_location_evidence',
    public.admin_get_meetup_location_evidence(
      current_setting('test.meetup_report')::uuid,
      'Investigating reported location'
    )::text,
    true
  )$$, 'case-scoped staff evidence can be opened with an audited reason');
select is(
  current_setting('test.meetup_location_evidence')::jsonb ->> 'arrivalInstructions',
  'SECRET DOOR CODE',
  'case-scoped staff evidence can include the captured protected details'
);
select ok(
  (current_setting('test.meetup_location_evidence')::jsonb ->> 'accessedAt')::timestamptz is not null,
  'case-scoped evidence includes the access timestamp returned to staff'
);
reset role;
select is((select count(*) from private.admin_audit_log where action = 'meetup_location_evidence_access' and target_id = current_setting('test.protected_meetup')), 1::bigint, 'exact evidence access is audited');
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','90000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:90000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claims','{"session_id":"99000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.admin_set_report_priority(current_setting('test.meetup_report')::uuid, 'critical', 'Manual safety escalation')$$,
  'staff can manually escalate a report priority'
);
reset role;
select is((select priority from public.reports where id = current_setting('test.meetup_report')::uuid), 'critical', 'manual escalation overrides the default priority');
select is((select count(*) from private.admin_audit_log where action = 'report.priority_changed' and target_id = current_setting('test.meetup_report')), 1::bigint, 'manual priority changes are audited');
set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','90000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:90000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claims','{"session_id":"99000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.admin_set_meetup_legal_hold(current_setting('test.protected_meetup')::uuid, true, 'Open safety investigation')$$,
  'staff can place an audited legal hold'
);
reset role;
select ok((select legal_hold_at is not null and legal_hold_released_at is null from private.meetup_retention where meetup_id = current_setting('test.protected_meetup')::uuid), 'active legal holds prevent purge eligibility');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), '10000000-0000-0000-0000-000000000001')$$,
  'a participant can block the host'
);

reset role;
select is((select status from public.meetup_participations where meetup_id = current_setting('test.protected_meetup')::uuid and profile_id = '10000000-0000-0000-0000-000000000002'), 'removed', 'blocking immediately revokes participation and frees capacity');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select public.get_meetup(current_setting('test.protected_meetup')::uuid)$$,
  '42501', 'meetup_not_visible',
  'blocking removes mutual event visibility'
);
delete from public.blocks where blocker_id = auth.uid() and blocked_id = '10000000-0000-0000-0000-000000000001';

reset role;
select is((select status from public.meetup_participations where meetup_id = current_setting('test.protected_meetup')::uuid and profile_id = '10000000-0000-0000-0000-000000000002'), 'removed', 'unblocking never silently restores access');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(
  jsonb_path_exists(
    public.list_meetup_participants(current_setting('test.protected_meetup')::uuid),
    '$[*] ? (@.profile.id == "10000000-0000-0000-0000-000000000002" && @.status == "removed")'
  ),
  'the host participant roster retains removed terminal rows for explicit reversal'
);
select is(
  public.reinstate_meetup_participant(current_setting('test.protected_meetup')::uuid, '10000000-0000-0000-0000-000000000002', 'approved') ->> 'status',
  'approved',
  'the host must explicitly reinstate removed access'
);
select lives_ok($$select public.update_meetup(current_setting('test.protected_meetup')::uuid, jsonb_build_object(
    'startsAt', now() - interval '20 hours', 'endsAt', now() - interval '3 hours'
  ))$$, 'the expiry fixture moves effective_end into the past');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.get_meetup(current_setting('test.protected_meetup')::uuid) #>> '{location,state}', 'protected_locked', 'exact protected access is denied after effective_end plus two hours');
select ok(not (public.get_meetup(current_setting('test.protected_meetup')::uuid) #> '{location}') ? 'exactLocation', 'expired protected detail omits exact coordinates');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select public.cancel_meetup(current_setting('test.protected_meetup')::uuid)$$, 'the host can cancel the meetup');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(jsonb_array_length(public.discover_meetups('{}'::jsonb)), 0, 'cancelled meetups leave discovery immediately');
select is(public.get_meetup(current_setting('test.protected_meetup')::uuid) #>> '{location,state}', 'protected_locked', 'cancellation revokes protected location access');
select ok(jsonb_array_length(public.list_notifications(100)) > 0, 'material changes, decisions, and cancellation create user notifications');
select ok(public.export_account()::text not like '%SECRET DOOR CODE%', 'a participant export never leaks a host protected location');
select ok(public.export_my_account() ? 'meetupParticipationHistory', 'legacy export alias uses the canonical meetup-aware export');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select set_config('test.public_meetup', public.create_meetup_draft(jsonb_build_object(
    'title','Public visibility test','description','Synthetic public meetup.',
    'category','coffee_food','startsAt',now() + interval '1 day','accessMode','open',
    'locationVisibility','public','releasePolicy','immediate','generalAreaId','reykjavik',
    'latitude',64.1469,'longitude',-21.9421,
    'prohibitedServicesAttested',true,'publicLocationConfirmed',true
  ))::text, true)$$,
  'public meetups require and accept an explicit immediate policy'
);
select lives_ok($$select public.publish_meetup(current_setting('test.public_meetup')::uuid)$$, 'the public visibility fixture publishes');
select throws_ok($$select public.create_meetup_draft(jsonb_build_object(
    'title','Adult preference test','description','Synthetic explicit meetup.',
    'category','private_adult','isExplicit',true,'startsAt',now() + interval '1 day',
    'accessMode','open','locationVisibility','public','releasePolicy','immediate',
    'generalAreaId','akureyri','latitude',65.6837,'longitude',-18.0870,
    'prohibitedServicesAttested',true,'publicLocationConfirmed',true
  ))$$,
  '23514', 'explicit_events_unavailable',
  'launch rejects explicit categories through the direct API'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(jsonb_array_length(public.discover_meetups('{"category":"private_adult"}'::jsonb)), 0, 'explicit meetups are hidden without adult-content opt-in');
select lives_ok($$select public.set_adult_content_preference(true)$$, 'an eligible adult can opt in explicitly');
select is(jsonb_array_length(public.discover_meetups('{"category":"private_adult"}'::jsonb)), 0, 'explicit meetups remain excluded unless the request filter opts in');
select is(jsonb_array_length(public.discover_meetups('{"category":"private_adult","includeExplicit":true}'::jsonb)), 0, 'legacy opt-ins cannot expose explicit events at launch');

reset role;
insert into private.meetup_participation_attempts (meetup_id, profile_id, created_at)
select current_setting('test.public_meetup')::uuid, '10000000-0000-0000-0000-000000000003', now()
from generate_series(1, 5);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select public.join_meetup(current_setting('test.public_meetup')::uuid)$$,
  '54000', 'meetup_participation_rate_limit_exceeded',
  'the sixth join/request entry in a rolling hour is denied before notification'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.join_meetup(current_setting('test.public_meetup')::uuid) ->> 'status', 'joined', 'open meetup joining is atomic');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(
  jsonb_path_exists(
    public.list_meetup_participants(current_setting('test.public_meetup')::uuid),
    '$[*] ? (@.profile.id == "10000000-0000-0000-0000-000000000002" && @.status == "joined")'
  ),
  'the complete host roster includes joined Open-mode attendees'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
update public.profiles set is_profile_visible = false where id = auth.uid();

reset role;
select is(
  (select count(*) from private.meetup_participation_attempts
   where meetup_id = current_setting('test.public_meetup')::uuid
     and profile_id = '10000000-0000-0000-0000-000000000002'),
  1::bigint,
  'a successful join records one transactional participation quota event'
);
select is((select status from public.meetup_participations where meetup_id = current_setting('test.public_meetup')::uuid and profile_id = '10000000-0000-0000-0000-000000000002'), 'joined', 'hiding a member profile does not stop participation');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
update public.profiles set is_profile_visible = false where id = auth.uid();
select ok(public.can_create_meetup(), 'a hidden personal profile retains hosting capability');

reset role;
select is((select status from public.meetups where id = current_setting('test.public_meetup')::uuid), 'published', 'hiding the personal profile preserves published meetups');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000001','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000001')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(
  (public.get_meetup(current_setting('test.public_meetup')::uuid) #> '{location}') ? 'exactLocation',
  'a hidden host retains the location of their own published meetup'
);
select is(
  public.get_meetup(current_setting('test.public_meetup')::uuid) ->> 'locationVisibility',
  'public',
  'published event retains its configured public location visibility'
);
select is(
  public.get_meetup(current_setting('test.public_meetup')::uuid) #>> '{location,state}',
  'public',
  'published public location keeps its public location union state'
);
select is(
  (public.get_meetup(current_setting('test.public_meetup')::uuid) #>> '{location,marker,isApproximate}')::boolean,
  false,
  'host continues to receive the published exact location marker'
);
select is(
  (public.get_meetup(current_setting('test.public_meetup')::uuid) #>> '{capabilities,canEdit}')::boolean,
  true,
  'host can continue editing when the personal profile is hidden'
);
select is(
  (select count(*) from public.meetup_participations where meetup_id = current_setting('test.public_meetup')::uuid),
  1::bigint,
  'hidden personal profile does not revoke the host attendee roster'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000002','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000002')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select public.withdraw_sensitive_consent()$$, 'a participant can withdraw sensitive-data consent');

reset role;
select is((select status from public.meetup_participations where meetup_id = current_setting('test.public_meetup')::uuid and profile_id = '10000000-0000-0000-0000-000000000002'), 'removed', 'consent withdrawal revokes participation and frees capacity');
select is(private.meetup_report_priority('minor_suspected'), 'critical', 'minor reports are critical');
select is(private.meetup_report_priority('harassment'), 'urgent', 'harassment reports are urgent');
select is(private.meetup_report_priority('illegal_activity'), 'standard', 'illegal-activity reports retain the runbook standard default');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
reset role;
insert into auth.sessions(id,user_id) values('99000000-0000-4000-8000-000000000003','10000000-0000-0000-0000-000000000003');
set local role authenticated;
select set_config('request.jwt.claims','{"session_id":"99000000-0000-4000-8000-000000000003"}',true);
select lives_ok(
  $$select set_config('test.push_token', public.register_push_token('ExponentPushToken[synthetic-device-token]', 'ios', 'en')::text, true)$$,
  'a caller can register a private Expo push token'
);

reset role;
select is((select profile_id from private.push_tokens where id = current_setting('test.push_token')::uuid), '10000000-0000-0000-0000-000000000003'::uuid, 'push registration is bound to auth.uid');
select set_config(
  'test.push_notification',
  private.enqueue_meetup_notification(
    '10000000-0000-0000-0000-000000000003',
    'meetup_materially_changed',
    current_setting('test.public_meetup')::uuid,
    '{"title":"Push invalid-token fixture"}'::jsonb
  )::text,
  true
);
select set_config(
  'test.push_outbox',
  (select id::text from private.notification_outbox where notification_id = current_setting('test.push_notification')::uuid),
  true
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.claim_notification_outbox(500, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  'the service worker claims pending notification jobs'
);
select lives_ok(
  $$select public.record_push_tickets(
    current_setting('test.push_outbox')::bigint,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    jsonb_build_array(jsonb_build_object(
      'tokenId', current_setting('test.push_token'),
      'status', 'error',
      'details', jsonb_build_object('error', 'DeviceNotRegistered')
    ))
  )$$,
  'an Expo ticket-time invalid-token response is recorded'
);

reset role;
select is(
  (select enabled from private.push_tokens where id = current_setting('test.push_token')::uuid),
  false,
  'DeviceNotRegistered disables the matched push token immediately at ticket time'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.create_meetup_draft(jsonb_build_object(
    'title','Rate limit draft ' || g,
    'description','Synthetic complete draft used to prove the rolling creation limit.',
    'category','community','tags',jsonb_build_array('community'),
    'startsAt',now() + interval '3 days','accessMode','open','locationVisibility','protected',
    'generalAreaId','selfoss','latitude',63.9332,'longitude',-20.9968,
    'prohibitedServicesAttested',true
  )) from generate_series(1, 5) g$$,
  'the first five new drafts in a rolling hour are accepted'
);
select throws_ok($$select public.create_meetup_draft(jsonb_build_object(
    'title','Rate limit draft six',
    'description','Synthetic complete draft used to prove the rolling creation limit.',
    'category','community','tags',jsonb_build_array('community'),
    'startsAt',now() + interval '3 days','accessMode','open','locationVisibility','protected',
    'generalAreaId','selfoss','latitude',63.9332,'longitude',-20.9968,
    'prohibitedServicesAttested',true
  ))$$,
  '54000', 'meetup_creation_rate_limit_exceeded',
  'the sixth new draft in a rolling hour is denied'
);
reset role;

select throws_ok(
  $$update public.profiles
    set date_of_birth = current_date - interval '17 years'
    where id = '10000000-0000-0000-0000-000000000003'$$,
  '22023', 'date_of_birth_must_be_18_to_120',
  'profile writes reject an under-18 date of birth'
);
update public.profiles
set date_of_birth = null
where id = '10000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims',(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb||jsonb_build_object('sub','10000000-0000-0000-0000-000000000003','session_id',md5('pgtap-session:10000000-0000-0000-0000-000000000003')::uuid))::text,true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(not public.can_create_meetup(), 'the canonical host gate requires a verified adult date of birth');
select throws_ok(
  $$select public.discover_meetups('{}'::jsonb)$$, null::text, null::text, 'under-18 profiles cannot invoke meetup discovery');
reset role;

delete from public.profiles where id = '10000000-0000-0000-0000-000000000001';
select is(
  private.meetup_payload(
    current_setting('test.public_meetup')::uuid,
    '10000000-0000-0000-0000-000000000003',
    true
  ) #>> '{host,displayName}',
  'Deleted member',
  'retained meetup history has a shared-contract-safe deleted-host placeholder'
);
select ok(
  private.meetup_payload(
    current_setting('test.public_meetup')::uuid,
    '10000000-0000-0000-0000-000000000003',
    true
  ) #>> '{host,id}' like 'deleted:%',
  'the deleted-host placeholder has a stable non-empty report-safe identifier'
);

select * from finish();
rollback;
