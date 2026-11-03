-- Member controls affect push delivery; authorized inbox history remains available.
create table private.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  messages boolean not null default true,
  taps boolean not null default true,
  groups boolean not null default true,
  events boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '08:00',
  time_zone text not null default 'Atlantic/Reykjavik',
  updated_at timestamptz not null default now()
);
create table private.conversation_mutes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  primary key(profile_id,conversation_id)
);
create index conversation_mutes_conversation on private.conversation_mutes(conversation_id);
alter table private.notification_preferences enable row level security;
alter table private.conversation_mutes enable row level security;
revoke all on private.notification_preferences,private.conversation_mutes from public,anon,authenticated,service_role;

create function private.notification_preferences_payload(p_profile_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'messages',coalesce(p.messages,true),'taps',coalesce(p.taps,true),
    'groups',coalesce(p.groups,true),'events',coalesce(p.events,true),
    'quietHoursEnabled',coalesce(p.quiet_hours_enabled,false),
    'quietHoursStart',to_char(coalesce(p.quiet_hours_start,'22:00'::time),'HH24:MI'),
    'quietHoursEnd',to_char(coalesce(p.quiet_hours_end,'08:00'::time),'HH24:MI'),
    'timeZone',coalesce(p.time_zone,'Atlantic/Reykjavik'),
    'mutedConversationIds',coalesce((select jsonb_agg(m.conversation_id order by m.conversation_id)
      from private.conversation_mutes m join public.conversation_members c on c.conversation_id=m.conversation_id
      and c.user_id=m.profile_id and c.deleted_at is null where m.profile_id=p_profile_id),'[]'::jsonb))
  from (select p_profile_id as id) owner left join private.notification_preferences p on p.profile_id=owner.id;
$$;
create function private.get_notification_preferences_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.account_is_active() or not private.current_user_is_ready(false) then
    raise exception using errcode='42501',message='active_session_required'; end if;
  return private.notification_preferences_payload((select auth.uid()));
end; $$;
create function private.update_notification_preferences_impl(p_preferences jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); key text;
begin
  if not private.account_is_active() or not private.current_user_is_ready(false) then
    raise exception using errcode='42501',message='active_session_required'; end if;
  if p_preferences is null or jsonb_typeof(p_preferences)<>'object' then
    raise exception using errcode='22023',message='invalid_notification_preference'; end if;
  for key in select jsonb_object_keys(p_preferences) loop
    if key in ('messages','taps','groups','events','quietHoursEnabled') then
      if jsonb_typeof(p_preferences->key)<>'boolean' then raise exception using errcode='22023',message='invalid_notification_preference'; end if;
    elsif key in ('quietHoursStart','quietHoursEnd') then
      if jsonb_typeof(p_preferences->key)<>'string' or p_preferences->>key !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception using errcode='22023',message='invalid_notification_preference'; end if;
    elsif key='timeZone' then
      if jsonb_typeof(p_preferences->key)<>'string' or char_length(p_preferences->>key)>100
        or not exists(select 1 from pg_timezone_names where name=p_preferences->>key) then
        raise exception using errcode='22023',message='invalid_notification_preference'; end if;
    else raise exception using errcode='22023',message='invalid_notification_preference'; end if;
  end loop;
  insert into private.notification_preferences(profile_id) values(caller) on conflict do nothing;
  update private.notification_preferences set
    messages=coalesce((p_preferences->>'messages')::boolean,messages),
    taps=coalesce((p_preferences->>'taps')::boolean,taps),
    groups=coalesce((p_preferences->>'groups')::boolean,groups),
    events=coalesce((p_preferences->>'events')::boolean,events),
    quiet_hours_enabled=coalesce((p_preferences->>'quietHoursEnabled')::boolean,quiet_hours_enabled),
    quiet_hours_start=coalesce((p_preferences->>'quietHoursStart')::time,quiet_hours_start),
    quiet_hours_end=coalesce((p_preferences->>'quietHoursEnd')::time,quiet_hours_end),
    time_zone=coalesce(p_preferences->>'timeZone',time_zone),updated_at=now()
  where profile_id=caller;
  return private.notification_preferences_payload(caller);
end; $$;
create function private.set_conversation_muted_impl(p_conversation_id uuid,p_muted boolean) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid());
begin
  if not private.account_is_active() or not private.current_user_is_ready(false) then
    raise exception using errcode='42501',message='active_session_required'; end if;
  if p_muted is null or not exists(select 1 from public.conversation_members c
    where c.conversation_id=p_conversation_id and c.user_id=caller and c.deleted_at is null) then
    raise exception using errcode='42501',message='conversation_unavailable'; end if;
  if p_muted then insert into private.conversation_mutes values(caller,p_conversation_id) on conflict do nothing;
  else delete from private.conversation_mutes where profile_id=caller and conversation_id=p_conversation_id; end if;
end; $$;
create function public.get_notification_preferences() returns jsonb language sql security invoker set search_path='' as $$ select private.get_notification_preferences_impl(); $$;
create function public.update_notification_preferences(preferences jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.update_notification_preferences_impl(preferences); $$;
create function public.set_conversation_muted(conversation_id uuid,muted boolean) returns void language sql security invoker set search_path='' as $$ select private.set_conversation_muted_impl(conversation_id,muted); $$;
revoke all on function private.notification_preferences_payload(uuid) from public,anon,authenticated,service_role;
revoke all on function private.get_notification_preferences_impl(),private.update_notification_preferences_impl(jsonb),private.set_conversation_muted_impl(uuid,boolean),
  public.get_notification_preferences(),public.update_notification_preferences(jsonb),public.set_conversation_muted(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function private.get_notification_preferences_impl(),private.update_notification_preferences_impl(jsonb),private.set_conversation_muted_impl(uuid,boolean),
  public.get_notification_preferences(),public.update_notification_preferences(jsonb),public.set_conversation_muted(uuid,boolean) to authenticated;

create function private.notification_push_allowed(p_notification_id uuid,p_at timestamptz default now()) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare n public.notifications; p private.notification_preferences; local_clock time;
begin
  select * into n from public.notifications where id=p_notification_id;
  if n.id is null then return false; end if;
  select * into p from private.notification_preferences where profile_id=n.recipient_id;
  if n.kind='direct_message' then
    if not coalesce(p.messages,true) or exists(select 1 from private.conversation_mutes m where m.profile_id=n.recipient_id and m.conversation_id=n.conversation_id) then return false; end if;
  elsif n.kind='group_message' then if not coalesce(p.groups,true) then return false; end if;
  elsif n.kind='profile_tap' then if not coalesce(p.taps,true) then return false; end if;
  else if not coalesce(p.events,true) then return false; end if;
  end if;
  if coalesce(p.quiet_hours_enabled,false) then
    local_clock:=(p_at at time zone p.time_zone)::time;
    if p.quiet_hours_start=p.quiet_hours_end or
      (p.quiet_hours_start<p.quiet_hours_end and local_clock>=p.quiet_hours_start and local_clock<p.quiet_hours_end) or
      (p.quiet_hours_start>p.quiet_hours_end and (local_clock>=p.quiet_hours_start or local_clock<p.quiet_hours_end)) then return false; end if;
  end if;
  return true;
end; $$;
revoke all on function private.notification_push_allowed(uuid,timestamptz) from public,anon,authenticated,service_role;

-- Apply preferences at claim time, including jobs queued before a preference changed.
alter function private.claim_notification_outbox_impl(integer,uuid) rename to claim_notification_outbox_before_preferences;
revoke all on function private.claim_notification_outbox_before_preferences(integer,uuid) from public,anon,authenticated,service_role;
create function private.claim_notification_outbox_impl(p_batch_size integer,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare claimed jsonb;
begin
  perform private.require_service_role();
  claimed:=private.claim_notification_outbox_before_preferences(p_batch_size,p_claim_token);
  return (select coalesce(jsonb_agg(jsonb_set(c,'{tokens}',case when private.notification_push_allowed((c->'notification'->>'id')::uuid)
    then c->'tokens' else '[]'::jsonb end)),'[]'::jsonb) from jsonb_array_elements(claimed) c);
end; $$;
revoke all on function private.claim_notification_outbox_impl(integer,uuid) from public,anon,authenticated;
grant execute on function private.claim_notification_outbox_impl(integer,uuid) to service_role;
create or replace function public.claim_notification_outbox(batch_size integer default 100,claim_token uuid default gen_random_uuid()) returns jsonb
language sql security invoker set search_path='' as $$ select private.claim_notification_outbox_impl(batch_size,claim_token); $$;

-- Explicit taps get opaque push IDs. Profile visits never create notifications.
alter table public.notifications add column profile_tap_actor_id uuid references public.profiles(id) on delete cascade;
create index notification_tap_actor on public.notifications(profile_tap_actor_id) where profile_tap_actor_id is not null;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check(kind in (
  'meetup_joined','meetup_access_requested','meetup_request_approved','meetup_request_declined','meetup_materially_changed','meetup_cancelled',
  'meetup_participant_removed','meetup_participant_reinstated','meetup_moderated','meetup_confirmation_required','meetup_starts_soon','meetup_finish','direct_message','group_message',
  'community_published','community_announcement','community_waitlist_offer','community_reminder','profile_tap'));
alter table public.notifications add constraint notification_tap_shape check(
  (kind='profile_tap' and profile_tap_actor_id is not null and meetup_id is null and payload='{}'::jsonb)
  or (kind<>'profile_tap' and profile_tap_actor_id is null));
create function private.notify_profile_tap() returns trigger language plpgsql security definer set search_path='' as $$
declare notification uuid;
begin
  if new.kind<>'taps' then return new; end if;
  insert into public.notifications(recipient_id,kind,profile_tap_actor_id) values(new.recipient_id,'profile_tap',new.actor_id) returning id into notification;
  insert into private.notification_outbox(notification_id) values(notification);
  return new;
end; $$;
revoke all on function private.notify_profile_tap() from public,anon,authenticated,service_role;
create trigger notify_profile_tap after insert or update of occurred_at on private.profile_activity for each row execute function private.notify_profile_tap();

alter function private.message_notification_access(uuid,uuid) rename to message_notification_access_before_taps;
revoke all on function private.message_notification_access_before_taps(uuid,uuid) from public,anon,authenticated,service_role;
create function private.message_notification_access(p_notification_id uuid,p_recipient uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.message_notification_access_before_taps(p_notification_id,p_recipient) and
    not exists(select 1 from public.notifications n where n.id=p_notification_id and n.kind='profile_tap' and
      (not exists(select 1 from public.profiles p where p.id=n.profile_tap_actor_id and p.is_profile_visible and p.deletion_requested_at is null
        and private.meetup_actor_is_active(p.id) and private.discovery_target_allowed(p.id))
      or private.meetup_block_exists(p_recipient,n.profile_tap_actor_id)));
$$;
revoke all on function private.message_notification_access(uuid,uuid) from public,anon,authenticated,service_role;
alter function private.resolve_notification_impl(uuid) rename to resolve_notification_before_taps;
revoke all on function private.resolve_notification_before_taps(uuid) from public,anon,authenticated,service_role;
create function private.resolve_notification_impl(p_notification_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n public.notifications;
begin
  select * into n from public.notifications where id=p_notification_id and recipient_id=(select auth.uid());
  if n.kind='profile_tap' then
    if not private.account_is_active() or not private.current_user_is_ready(true)
      or not private.message_notification_access(n.id,(select auth.uid())) or private.get_public_profile_impl(n.profile_tap_actor_id) is null then
      raise exception using errcode='42501',message='notification_unavailable'; end if;
    update public.notifications set read_at=coalesce(read_at,now()) where id=n.id;
    return jsonb_build_object('type','profile','id',n.profile_tap_actor_id);
  end if;
  return private.resolve_notification_before_taps(p_notification_id);
end; $$;
revoke all on function private.resolve_notification_impl(uuid) from public,anon,service_role;
grant execute on function private.resolve_notification_impl(uuid) to authenticated;
create or replace function public.resolve_notification(notification_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.resolve_notification_impl(notification_id); $$;
create or replace function private.list_notifications_impl(p_limit_count integer) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',n.id,'kind',n.kind,'meetupId',n.meetup_id,'payload',n.payload,'createdAt',n.created_at,'readAt',n.read_at)) order by n.created_at desc,n.id desc),'[]')
  from (select * from public.notifications where private.account_is_active() and recipient_id=(select auth.uid()) and kind not in('direct_message','group_message','profile_tap')
    order by created_at desc,id desc limit least(greatest(coalesce(p_limit_count,50),1),200)) n;
$$;

alter function private.export_account_impl() rename to export_account_before_notification_preferences;
revoke all on function private.export_account_before_notification_preferences() from public,anon,authenticated,service_role;
create function private.export_account_impl() returns jsonb language plpgsql security definer set search_path='' as $$
begin
  return private.export_account_before_notification_preferences()||jsonb_build_object('notificationPreferences',private.notification_preferences_payload((select auth.uid())));
end; $$;
revoke all on function private.export_account_impl() from public,anon,service_role;
grant execute on function private.export_account_impl() to authenticated;
create or replace function public.export_account() returns jsonb language sql security invoker set search_path='' as $$ select private.export_account_impl(); $$;
create or replace function public.export_my_account() returns jsonb language sql security invoker set search_path='' as $$ select private.export_account_impl(); $$;
