-- Release-scoped permissions, bounded chat queries and write admission controls.
create table private.launch_capabilities (
  id boolean primary key default true check (id),
  explicit_events boolean not null default false,
  permanent_groups boolean not null default false,
  voice boolean not null default false,
  person_ratings boolean not null default false
);
insert into private.launch_capabilities default values;
alter table private.launch_capabilities enable row level security;
revoke all on private.launch_capabilities from public, anon, authenticated;

create function private.get_launch_capabilities_impl() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('hittingar', coalesce((select enabled and expanded_launch_gates_passed from private.meetup_feature_config where id=1), false),
    'explicitEvents', false, 'permanentGroups', false, 'voice', false, 'personRatings', false) where (select auth.uid()) is not null;
$$;
create function public.get_launch_capabilities() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.get_launch_capabilities_impl(); $$;
revoke all on function public.get_launch_capabilities(), private.get_launch_capabilities_impl() from public, anon;
grant execute on function public.get_launch_capabilities(), private.get_launch_capabilities_impl() to authenticated;

create function private.enforce_launch_event_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and new.status in ('cancelled','moderation_hidden') then return new; end if;
  if not (select explicit_events from private.launch_capabilities) and
    (new.is_explicit or new.category = 'private_adult' or new.intention = 'casual_adult') then
    raise exception using errcode='23514', message='explicit_events_unavailable';
  end if;
  return new;
end; $$;
create trigger launch_event_scope before insert or update on public.meetups
for each row execute function private.enforce_launch_event_scope();

create function private.enforce_launch_profile_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not (select explicit_events from private.launch_capabilities) then new.adult_content_opted_in_at := null; end if;
  if not (select person_ratings from private.launch_capabilities) then new.anonymous_ratings_enabled := false; end if;
  return new;
end; $$;
create trigger launch_profile_scope before insert or update on public.profiles
for each row execute function private.enforce_launch_profile_scope();
update public.profiles set adult_content_opted_in_at = null, anonymous_ratings_enabled = false;
alter table public.profiles alter column anonymous_ratings_enabled set default false;

-- No client may invoke the deferred social surface, including its private wrappers.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and
      (p.proname ~ '^(create_group|list_groups|add_group_member|send_group_message|list_group_messages|start_group_voice)(_|$)'
       or p.proname ~ '^(rate_content|list_content_rating_counts)(_|$)')
  loop execute format('revoke execute on function %s from public, anon, authenticated', f.signature); end loop;
end; $$;
revoke all on public.groups, public.group_members, public.group_messages, public.group_voice_sessions,
  public.group_voice_participants, public.content_ratings from anon, authenticated;

create table private.write_quota_events (
  id bigint generated always as identity primary key,
  actor uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  occurred_at timestamptz not null default clock_timestamp()
);
create index write_quota_actor_time on private.write_quota_events(actor, operation, occurred_at);
alter table private.write_quota_events enable row level security;
revoke all on private.write_quota_events from public, anon, authenticated;
create function private.consume_write_quota(p_operation text, p_max integer, p_window interval) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); retry_seconds integer;
begin
  if v_actor is null then return; end if; -- Only trusted service operations omit a subject.
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':' || p_operation, 0));
  delete from private.write_quota_events q where q.actor=v_actor and q.occurred_at < now()-interval '1 day';
  if (select count(*) from private.write_quota_events q where q.actor=v_actor and q.operation=p_operation and q.occurred_at>clock_timestamp()-p_window) >= p_max then
    select greatest(1,ceil(extract(epoch from min(q.occurred_at)+p_window-clock_timestamp()))::integer) into retry_seconds
      from private.write_quota_events q where q.actor=v_actor and q.operation=p_operation and q.occurred_at>clock_timestamp()-p_window;
    raise exception using errcode='P0001', message='rate_limit_exceeded',
      detail=jsonb_build_object('operation',p_operation,'retryAfterSeconds',retry_seconds)::text,
      hint='Retry after the indicated number of seconds.';
  end if;
  insert into private.write_quota_events(actor,operation) values(v_actor,p_operation);
end; $$;
revoke all on function private.consume_write_quota(text,integer,interval) from public, anon, authenticated;

create function private.enforce_core_write_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='messages' then
    if exists(select 1 from public.messages where id=new.id) then return new; end if;
    perform private.consume_write_quota('message',60,interval '1 minute');
    new.created_at := now();
  elsif tg_table_name='conversations' then
    if not exists(select 1 from public.conversations c where c.participant_low=new.participant_low and c.participant_high=new.participant_high) then
      perform private.consume_write_quota('conversation',10,interval '1 hour');
    end if;
  elsif tg_table_schema='storage' and new.bucket_id in ('profile-photos','profile-videos','album-media','message-images','media-quarantine') then
    perform private.consume_write_quota('upload',10,interval '1 hour');
  end if;
  return new;
end; $$;
create trigger messages_write_quota before insert on public.messages for each row execute function private.enforce_core_write_quota();
create trigger conversations_write_quota before insert on public.conversations for each row execute function private.enforce_core_write_quota();
create trigger uploads_write_quota before insert on storage.objects for each row execute function private.enforce_core_write_quota();

create function private.clamp_conversation_read() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.last_read_at is distinct from old.last_read_at then
    select greatest(old.last_read_at, coalesce(max(m.created_at),old.last_read_at)) into new.last_read_at
      from public.messages m where m.conversation_id=new.conversation_id
      and m.created_at <= least(new.last_read_at,now());
  end if;
  return new;
end; $$;
create trigger conversation_read_clamp before update of last_read_at on public.conversation_members
for each row execute function private.clamp_conversation_read();

create function private.list_messages_page_impl(p_conversation_id uuid,p_cursor jsonb,p_size integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; n integer := least(greatest(coalesce(p_size,50),1),50);
begin
  if not private.current_user_is_ready(true) or not private.is_conversation_member(p_conversation_id) then
    raise exception using errcode='42501',message='conversation_access_denied';
  end if;
  with candidates as (
    select m.* from public.messages m where m.conversation_id=p_conversation_id
      and (p_cursor is null or (m.created_at,m.id)<((p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid))
      order by m.created_at desc,m.id desc limit n+1
  ), page as (select * from candidates order by created_at desc,id desc limit n)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by created_at,id) from page p),'[]'::jsonb),
    'nextCursor',case when (select count(*) from candidates)>n then
      (select jsonb_build_object('at',created_at,'id',id) from page order by created_at,id limit 1) else null end) into result;
  return result;
end; $$;
create function public.list_messages_page(conversation_id uuid,cursor jsonb default null,page_size integer default 50) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.list_messages_page_impl(conversation_id,cursor,page_size); $$;

create function private.list_conversations_page_impl(p_cursor jsonb,p_search text,p_size integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := (select auth.uid()); result jsonb; n integer := least(greatest(coalesce(p_size,30),1),30);
begin
  if not private.current_user_is_ready(true) then raise exception using errcode='42501',message='conversation_access_denied'; end if;
  with candidates as (
    select c.id,cm.last_read_at,coalesce(last_message.created_at,c.created_at) as sort_at,
      case when last_message.deleted_at is not null then '' else coalesce(last_message.body,case when last_message.image_path is not null then '📷' else '' end) end as preview,
      p.id as other_id,p.display_name,
      (select ph.storage_path from public.profile_photos ph where ph.profile_id=p.id and ph.approval_status='approved' order by ph.position limit 1) as photo_path
    from public.conversation_members cm join public.conversations c on c.id=cm.conversation_id
    join public.profiles p on p.id=case when c.participant_low=caller then c.participant_high else c.participant_low end
    left join lateral (select m.* from public.messages m where m.conversation_id=c.id order by m.created_at desc,m.id desc limit 1) last_message on true
    where cm.user_id=caller and cm.deleted_at is null and private.is_conversation_member(c.id)
      and p.moderation_status <> 'banned'
  ), filtered as (
    select * from candidates where (p_cursor is null or (sort_at,id)<((p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid))
      and (coalesce(p_search,'')='' or position(lower(left(p_search,100)) in lower(coalesce(display_name,'')||' '||preview))>0)
    order by sort_at desc,id desc limit n+1
  ), page as (select * from filtered order by sort_at desc,id desc limit n)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'lastMessage',p.preview,'lastMessageAt',p.sort_at,'photoPath',p.photo_path,
    'unreadCount',(select count(*) from public.messages m where m.conversation_id=p.id and m.sender_id<>caller and m.deleted_at is null and m.created_at>coalesce(p.last_read_at,'-infinity'::timestamptz)),
    'member',jsonb_build_object('id',p.other_id,'displayName',p.display_name,'photos','[]'::jsonb)
  ) order by p.sort_at desc,p.id desc) from page p),'[]'::jsonb),
  'nextCursor',case when (select count(*) from filtered)>n then (select jsonb_build_object('at',sort_at,'id',id) from page order by sort_at,id limit 1) else null end) into result;
  return result;
end; $$;
create function public.list_conversations_page(cursor jsonb default null,search_query text default '',page_size integer default 30) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.list_conversations_page_impl(cursor,search_query,page_size); $$;

revoke all on function private.list_messages_page_impl(uuid,jsonb,integer),public.list_messages_page(uuid,jsonb,integer),
  private.list_conversations_page_impl(jsonb,text,integer),public.list_conversations_page(jsonb,text,integer) from public,anon;
grant execute on function private.list_messages_page_impl(uuid,jsonb,integer),public.list_messages_page(uuid,jsonb,integer),
  private.list_conversations_page_impl(jsonb,text,integer),public.list_conversations_page(jsonb,text,integer) to authenticated;
revoke all on function private.enforce_launch_event_scope(),private.enforce_launch_profile_scope(),private.enforce_core_write_quota(),private.clamp_conversation_read() from public,anon,authenticated;

-- Avoid a column/variable collision in the historical conversation creator.
create or replace function private.start_conversation_impl(p_other_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  low_id uuid;
  high_id uuid;
  v_conversation_id uuid;
begin
  if caller is null or p_other_profile_id is null or caller = p_other_profile_id then
    raise exception using errcode = '22023', message = 'invalid_participant';
  end if;
  if not private.current_user_is_ready(true)
     or not exists (
       select 1 from public.profiles p
       join private.private_locations l on l.profile_id = p.id
       where p.id = p_other_profile_id
         and p.is_profile_visible and p.moderation_status = 'active'
         and l.verified_at >= now() - interval '15 minutes'
     )
     or exists (
       select 1 from public.blocks b
       where (b.blocker_id = caller and b.blocked_id = p_other_profile_id)
          or (b.blocker_id = p_other_profile_id and b.blocked_id = caller)
     ) then
    raise exception using errcode = '42501', message = 'conversation_not_allowed';
  end if;

  low_id := least(caller, p_other_profile_id);
  high_id := greatest(caller, p_other_profile_id);
  insert into public.conversations (participant_low, participant_high, created_by)
  values (low_id, high_id, caller)
  on conflict (participant_low, participant_high) do update set participant_low = excluded.participant_low
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conversation_id, caller), (v_conversation_id, p_other_profile_id)
  on conflict (conversation_id, user_id) do update set deleted_at = null;
  return v_conversation_id;
end;
$$;
