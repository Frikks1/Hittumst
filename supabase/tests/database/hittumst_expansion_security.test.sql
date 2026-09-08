begin;
set local search_path = extensions, public, private;
select no_plan();

select has_table('public', 'meetup_series', 'recurring meetup series exist separately from occurrences');
select has_table('private', 'meetup_online_access', 'online links and codes use private storage');
select has_table('public', 'meetup_rooms', 'each occurrence can own a room');
select has_table('public', 'meetup_room_messages', 'occurrence room messages are persisted');
select has_table('private', 'meetup_room_conflicts', 'peer-block conflicts remain private');
select has_table('private', 'meetup_room_message_evidence', 'report evidence remains private');
select has_table('public', 'friendships', 'friend relationships are persisted');
select has_table('public', 'starred_items', 'starred profile items are persisted');
select has_table('public', 'groups', 'permanent groups are persisted');
select has_table('private', 'group_blocks', 'group block details remain private');

select ok((select relrowsecurity from pg_class where oid='public.meetup_series'::regclass), 'series use RLS');
select ok((select relrowsecurity from pg_class where oid='public.meetup_rooms'::regclass), 'rooms use RLS');
select ok((select relrowsecurity from pg_class where oid='public.meetup_room_messages'::regclass), 'room messages use RLS');
select ok((select relrowsecurity from pg_class where oid='public.friendships'::regclass), 'friendships use RLS');
select ok((select relrowsecurity from pg_class where oid='public.starred_items'::regclass), 'starred items use RLS');
select ok((select relrowsecurity from pg_class where oid='public.groups'::regclass), 'groups use RLS');
select ok((select relrowsecurity from pg_class where oid='private.meetup_online_access'::regclass), 'online secrets use RLS');
select ok((select relrowsecurity from pg_class where oid='private.meetup_room_conflicts'::regclass), 'conflicts use RLS');

select ok(not has_table_privilege('authenticated','private.meetup_online_access','SELECT'),'members cannot browse online credentials');
select ok(not has_table_privilege('authenticated','private.meetup_room_conflicts','SELECT'),'members cannot browse conflict details');
select ok(not has_table_privilege('authenticated','private.meetup_room_message_evidence','SELECT'),'members cannot browse evidence');
select ok(not has_table_privilege('authenticated','private.group_blocks','SELECT'),'members cannot browse group block reasons');
select ok(not has_table_privilege('authenticated','public.meetup_room_messages','INSERT'),'room messages must use the sender-bound RPC');
select ok(not has_table_privilege('authenticated','public.content_ratings','SELECT'),'anonymous rating author IDs are not directly readable');
select ok(not has_table_privilege('authenticated','public.content_ratings','INSERT'),'ratings use the sender-bound RPC');

select has_function('public', 'publish_meetup_series', array['uuid','jsonb','jsonb'], 'atomic series publication RPC exists');
select has_function('public', 'list_content_rating_counts', array['text','uuid'], 'ratings expose aggregate counts rather than author IDs');
select has_function('public', 'set_meetup_expansion', array['uuid','jsonb'], 'draft expansion RPC exists');
select has_function('public', 'confirm_meetup_attendance', array['uuid'], 'pre-event confirmation RPC exists');
select has_function('public', 'complete_meetup_attendance', array['uuid','text','text'], 'post-event completion RPC exists');

select has_function('public', 'set_meetup_history_visibility', array['uuid','text'], 'attendees can hide individual history items');
select has_function('public', 'list_public_meetup_roster', array['uuid','uuid','integer'], 'public roster pagination RPC exists');
select has_function('public', 'list_profile_meetup_history', array['uuid','timestamp with time zone','integer'], 'history pagination RPC exists');
select has_function('public', 'list_profile_upcoming_meetups', array['uuid','timestamp with time zone','integer'], 'upcoming profile RSVP pagination RPC exists');
select has_function('public', 'get_meetup_room_summary', array['uuid'], 'authorized room summary RPC exists');
select has_function('public', 'list_meetup_room_messages', array['uuid','timestamp with time zone','integer'], 'authorized room reads exist');
select has_function('public', 'send_meetup_room_message', array['uuid','text'], 'sender-bound room writes exist');
select has_function('public', 'report_meetup_room_message', array['uuid','text','text'], 'case-scoped room reporting exists');
select has_function('public', 'resolve_meetup_room_conflict', array['uuid','text'], 'host conflict resolution exists');
select has_function('public', 'admin_moderate_meetup_room', array['uuid','text','text','uuid'], 'case-scoped audited room moderation exists');

select ok(has_function_privilege('authenticated', 'public.send_meetup_room_message(uuid,text)', 'EXECUTE'), 'members can call the authorized room-send RPC');
select ok(not has_function_privilege('anon', 'public.send_meetup_room_message(uuid,text)', 'EXECUTE'), 'anonymous users cannot send room messages');
select ok(not has_function_privilege('authenticated', 'public.process_hittumst_lifecycle()', 'EXECUTE'), 'clients cannot execute lifecycle scheduling');
select ok(has_function_privilege('service_role', 'public.process_hittumst_lifecycle()', 'EXECUTE'), 'scheduler can execute lifecycle jobs');
select ok(not has_function_privilege('anon', 'public.list_profile_upcoming_meetups(uuid,timestamp with time zone,integer)', 'EXECUTE'), 'anonymous viewers cannot browse upcoming RSVPs');

select is((select enabled from private.meetup_feature_config where id = 1), false, 'server Hittingar remains disabled by default');
select is((select expanded_launch_gates_passed from private.meetup_feature_config where id = 1), false, 'expanded production launch gate remains closed by default');
select is((select count(*) from public.meetups where series_id is not null and occurrence_index is null), 0::bigint, 'series occurrences always have a concrete index');

select * from finish();
rollback;
