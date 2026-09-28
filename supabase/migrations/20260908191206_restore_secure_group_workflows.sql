-- Restore intended permanent groups through bounded, actor-bound RPCs only.
-- Existing data is preserved. Voice remains unavailable until media transport exists.
update private.launch_capabilities set permanent_groups=true where id;
create or replace function private.get_launch_capabilities_impl() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('hittingar',coalesce((select enabled and expanded_launch_gates_passed from private.meetup_feature_config where id=1),false),
    'explicitEvents',explicit_events,'permanentGroups',permanent_groups,'voice',voice,'personRatings',person_ratings)
  from private.launch_capabilities where id and (select auth.uid()) is not null;
$$;

create or replace function private.group_member_role(p_group_id uuid,p_profile_id uuid) returns text
language sql stable security definer set search_path='' as $$
  select gm.role from public.group_members gm join public.groups g on g.id=gm.group_id
  where gm.group_id=p_group_id and gm.profile_id=p_profile_id and gm.status='active'
    and g.status<>'removed' and private.meetup_actor_is_active(p_profile_id);
$$;

create or replace function private.create_group_impl(p_name text,p_bio text default '',p_avatar_path text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); result uuid;
begin
  if not private.current_user_is_ready(false) then raise exception using errcode='42501',message='active_account_required'; end if;
  perform private.consume_write_quota('create_group',3,interval '1 hour');
  insert into public.groups(owner_id,name,bio,avatar_path) values(caller,btrim(p_name),coalesce(p_bio,''),p_avatar_path) returning id into result;
  insert into public.group_members(group_id,profile_id,role,status) values(result,caller,'owner','active');
  return result;
end; $$;

create or replace function private.list_groups_impl() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'bio',g.bio,'role',member.role,
    'membershipStatus',member.status,'status',g.status,
    'memberCount',(select count(*)::integer from public.group_members m where m.group_id=g.id and m.status='active'),
    'isVoiceActive',false,'updatedAt',g.updated_at) order by g.updated_at desc,g.id),'[]'::jsonb)
  from public.group_members member join public.groups g on g.id=member.group_id
  where member.profile_id=(select auth.uid()) and member.status in ('active','invited') and g.status<>'removed'
    and private.current_user_is_ready(false);
$$;

create or replace function private.add_group_member_impl(p_group_id uuid,p_profile_id uuid,p_role text default 'member') returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); caller_role text;
begin
  perform 1 from public.groups where id=p_group_id and status='active' for update;
  if not found then raise exception using errcode='42501',message='group_not_active'; end if;
  caller_role:=private.group_member_role(p_group_id,caller);
  if not private.current_user_is_ready(false) or caller_role is null or caller_role not in ('owner','admin')
    or p_role is null or p_role not in ('admin','moderator','member')
    or (caller_role<>'owner' and p_role<>'member') then
    raise exception using errcode='42501',message='group_admin_required';
  end if;
  if p_profile_id=caller or not private.meetup_actor_is_active(p_profile_id)
    or not private.profiles_are_friends(caller,p_profile_id) then
    raise exception using errcode='42501',message='eligible_friend_required';
  end if;
  if exists(select 1 from private.group_blocks where group_id=p_group_id and profile_id=p_profile_id)
    or exists(select 1 from public.group_members m where m.group_id=p_group_id and m.status='active'
      and private.meetup_block_exists(m.profile_id,p_profile_id)) then
    raise exception using errcode='42501',message='group_member_blocked';
  end if;
  if (select count(*) from public.group_members where group_id=p_group_id and status in ('active','invited'))>=100 then
    raise exception using errcode='23514',message='group_capacity_reached';
  end if;
  perform private.consume_write_quota('group_invite',20,interval '1 hour');
  insert into public.group_members(group_id,profile_id,role,status) values(p_group_id,p_profile_id,p_role,'invited')
  on conflict(group_id,profile_id) do update set role=excluded.role,status='invited',updated_at=now()
  where group_members.status='removed';
end; $$;

create function private.group_action_impl(p_group_id uuid,p_action text,p_input jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); caller_role text; target uuid; target_role text; group_status text;
begin
  if not private.current_user_is_ready(false) then raise exception using errcode='42501',message='active_account_required'; end if;
  select status into group_status from public.groups where id=p_group_id and status<>'removed' for update;
  if group_status is null then raise exception using errcode='42501',message='group_not_available'; end if;
  caller_role:=private.group_member_role(p_group_id,caller);
  if p_action in ('accept','decline') then
    if not exists(select 1 from public.group_members where group_id=p_group_id and profile_id=caller and status='invited') then
      raise exception using errcode='42501',message='group_invitation_required'; end if;
    if p_action='accept' and (group_status<>'active' or exists(select 1 from public.group_members m where m.group_id=p_group_id and m.status='active' and private.meetup_block_exists(m.profile_id,caller))
      or exists(select 1 from private.group_blocks where group_id=p_group_id and profile_id=caller)) then
      raise exception using errcode='42501',message='group_member_blocked'; end if;
    update public.group_members set status=case when p_action='accept' then 'active' else 'removed' end,updated_at=now() where group_id=p_group_id and profile_id=caller;
    return;
  end if;
  if caller_role is null then raise exception using errcode='42501',message='active_group_membership_required'; end if;
  if p_action='leave' then
    if caller_role='owner' then raise exception using errcode='23514',message='owner_must_archive_group'; end if;
    update public.group_members set status='removed',updated_at=now() where group_id=p_group_id and profile_id=caller;
  elsif p_action in ('lock','unlock','archive') then
    if caller_role not in ('owner','admin') or (p_action='archive' and caller_role<>'owner') then raise exception using errcode='42501',message='group_admin_required'; end if;
    update public.groups set status=case p_action when 'lock' then 'locked' when 'unlock' then 'active' else 'removed' end,updated_at=now() where id=p_group_id;
  elsif p_action in ('remove_member','set_role') then
    target:=(p_input->>'profileId')::uuid;
    target_role:=private.group_member_role(p_group_id,target);
    if target is null or target=caller or target_role='owner' or caller_role not in ('owner','admin')
      or (caller_role<>'owner' and (p_action='set_role' or target_role in ('admin','moderator'))) then
      raise exception using errcode='42501',message='group_admin_required'; end if;
    if p_action='remove_member' then
      update public.group_members set status='removed',updated_at=now() where group_id=p_group_id and profile_id=target;
    else
      if (p_input->>'role') is null or (p_input->>'role') not in ('admin','moderator','member') then raise exception using errcode='23514',message='invalid_group_role'; end if;
      update public.group_members set role=p_input->>'role',updated_at=now() where group_id=p_group_id and profile_id=target and status='active';
    end if;
  elsif p_action='hide_message' then
    if caller_role not in ('owner','admin','moderator') then raise exception using errcode='42501',message='group_moderator_required'; end if;
    update public.group_messages set hidden_at=now() where group_id=p_group_id and id=(p_input->>'messageId')::uuid;
  else raise exception using errcode='22023',message='unknown_group_action';
  end if;
end; $$;
create function public.group_action(group_id uuid,action text,input jsonb default '{}') returns void
language sql security invoker set search_path='' as $$ select private.group_action_impl(group_id,action,input); $$;

create function private.list_group_members_impl(p_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.current_user_is_ready(false) or private.group_member_role(p_group_id,(select auth.uid())) is null then
    raise exception using errcode='42501',message='active_group_membership_required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('profileId',m.profile_id,'displayName',coalesce(p.display_name,'Hittumst member'),'role',m.role,'status',m.status) order by m.joined_at,m.profile_id),'[]') into result
  from public.group_members m join public.profiles p on p.id=m.profile_id
  where m.group_id=p_group_id and m.status in ('active','invited') and not private.meetup_block_exists((select auth.uid()),m.profile_id);
  return result;
end; $$;
create function public.list_group_members(group_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.list_group_members_impl(group_id); $$;

create function private.send_group_message_once_impl(p_group_id uuid,p_body text,p_message_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); existing public.group_messages;
begin
  perform 1 from public.groups where id=p_group_id and status='active' for update;
  if not found or not private.current_user_is_ready(false) or private.group_member_role(p_group_id,caller) is null then
    raise exception using errcode='42501',message='active_group_membership_required'; end if;
  if p_message_id is null or p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then raise exception using errcode='23514',message='invalid_group_message'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_message_id::text,0));
  select * into existing from public.group_messages where id=p_message_id;
  if found then
    if existing.group_id=p_group_id and existing.sender_id=caller and existing.body=btrim(p_body) then return existing.id; end if;
    raise exception using errcode='23505',message='group_message_id_conflict';
  end if;
  perform private.consume_write_quota('group_message',60,interval '1 minute');
  insert into public.group_messages(id,group_id,sender_id,body) values(p_message_id,p_group_id,caller,btrim(p_body));
  update public.groups set updated_at=now() where id=p_group_id;
  return p_message_id;
end; $$;
create function public.send_group_message_once(group_id uuid,body text,client_message_id uuid) returns uuid
language sql security invoker set search_path='' as $$ select private.send_group_message_once_impl(group_id,body,client_message_id); $$;
create or replace function private.send_group_message_impl(p_group_id uuid,p_body text) returns uuid
language sql security definer set search_path='' as $$ select private.send_group_message_once_impl(p_group_id,p_body,gen_random_uuid()); $$;

create function private.send_group_message_receipt_impl(p_group_id uuid,p_body text,p_message_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare message_id uuid; result jsonb;
begin
  message_id:=private.send_group_message_once_impl(p_group_id,p_body,p_message_id);
  select jsonb_build_object('id',m.id,'groupId',m.group_id,'senderId',m.sender_id,'senderName',coalesce(p.display_name,'Hittumst member'),'body',m.body,'createdAt',m.created_at) into result
    from public.group_messages m left join public.profiles p on p.id=m.sender_id where m.id=message_id;
  return result;
end; $$;
create function public.send_group_message_receipt(group_id uuid,body text,client_message_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.send_group_message_receipt_impl(group_id,body,client_message_id); $$;
revoke all on function private.send_group_message_receipt_impl(uuid,text,uuid),public.send_group_message_receipt(uuid,text,uuid) from public,anon;
grant execute on function private.send_group_message_receipt_impl(uuid,text,uuid),public.send_group_message_receipt(uuid,text,uuid) to authenticated;

create function private.list_group_messages_page_impl(p_group_id uuid,p_cursor jsonb default null,p_page_size integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.current_user_is_ready(false) or private.group_member_role(p_group_id,(select auth.uid())) is null then
    raise exception using errcode='42501',message='active_group_membership_required'; end if;
  if p_cursor is not null and (jsonb_typeof(p_cursor)<>'object' or p_cursor->>'createdAt' is null or p_cursor->>'id' is null) then
    raise exception using errcode='22023',message='invalid_group_cursor'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'groupId',m.group_id,'senderId',coalesce(m.sender_id::text,'deleted'),
    'senderName',coalesce(p.display_name,'Deleted member'),'body',m.body,'createdAt',m.created_at) order by m.created_at,m.id),'[]') into result
  from (select * from public.group_messages message where message.group_id=p_group_id and message.hidden_at is null
    and (message.sender_id is null or not private.meetup_block_exists((select auth.uid()),message.sender_id))
    and (p_cursor is null or (message.created_at,message.id)<((p_cursor->>'createdAt')::timestamptz,(p_cursor->>'id')::uuid))
    order by message.created_at desc,message.id desc limit least(greatest(coalesce(p_page_size,50),1),50)) m
  left join public.profiles p on p.id=m.sender_id;
  return jsonb_build_object('items',result,'nextCursor',case when jsonb_array_length(result)=least(greatest(coalesce(p_page_size,50),1),50)
    then jsonb_build_object('createdAt',result->0->>'createdAt','id',result->0->>'id') else null end);
end; $$;
create function public.list_group_messages_page(group_id uuid,cursor jsonb default null,page_size integer default 50) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.list_group_messages_page_impl(group_id,cursor,page_size); $$;
-- The legacy route keeps block filtering and active-account checks too.
create or replace function private.list_group_messages_impl(p_group_id uuid,p_page_size integer default 50,p_before timestamptz default null) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.list_group_messages_page_impl(p_group_id,case when p_before is null then null else jsonb_build_object('createdAt',p_before,'id','00000000-0000-0000-0000-000000000000') end,p_page_size)->'items';
$$;

revoke all on function private.group_action_impl(uuid,text,jsonb),public.group_action(uuid,text,jsonb),
 private.list_group_members_impl(uuid),public.list_group_members(uuid),
 private.send_group_message_once_impl(uuid,text,uuid),public.send_group_message_once(uuid,text,uuid),
 private.list_group_messages_page_impl(uuid,jsonb,integer),public.list_group_messages_page(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function private.group_action_impl(uuid,text,jsonb),public.group_action(uuid,text,jsonb),
 private.list_group_members_impl(uuid),public.list_group_members(uuid),
 private.send_group_message_once_impl(uuid,text,uuid),public.send_group_message_once(uuid,text,uuid),
 private.list_group_messages_page_impl(uuid,jsonb,integer),public.list_group_messages_page(uuid,jsonb,integer),
 public.create_group(text,text,text),private.create_group_impl(text,text,text),
 public.list_groups(),private.list_groups_impl(),
 public.add_group_member(uuid,uuid,text),private.add_group_member_impl(uuid,uuid,text),
 public.send_group_message(uuid,text),private.send_group_message_impl(uuid,text),
 public.list_group_messages(uuid,integer,timestamptz),private.list_group_messages_impl(uuid,integer,timestamptz) to authenticated;
-- Group tables and all voice RPCs keep their restrictive grants.
notify pgrst,'reload schema';
