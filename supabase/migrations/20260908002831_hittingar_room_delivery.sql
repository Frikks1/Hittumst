-- Occurrence rooms remain readable for 24 hours, including after posting locks.
create or replace function private.start_group_voice_impl(p_group_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin raise exception using errcode='55000',message='voice_unavailable'; end; $$;

create or replace function private.list_public_meetup_roster_impl(p_meetup_id uuid,p_cursor uuid default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); meetup_row public.meetups%rowtype; result jsonb; n integer:=least(greatest(coalesce(p_limit,50),1),50);
begin
  if not private.meetup_actor_is_active(caller) or not private.meetup_is_discoverable(p_meetup_id,caller) then
    raise exception using errcode='42501',message='meetup_not_visible';
  end if;
  select * into meetup_row from public.meetups where id=p_meetup_id;
  with candidates as (
    select mp.id,jsonb_build_object('meetupId',mp.meetup_id,
      'profile',jsonb_build_object('id',p.id,'displayName',p.display_name),'status',mp.status,
      'requestedAt',mp.requested_at,'respondedAt',mp.responded_at,'rsvpVisibility',mp.rsvp_visibility,'attendanceState',mp.confirmation_state) as payload
    from public.meetup_participations mp join public.profiles p on p.id=mp.profile_id
    where mp.meetup_id=p_meetup_id and mp.status in ('joined','approved') and (p_cursor is null or mp.id>p_cursor)
      and not private.meetup_block_exists(caller,p.id) and private.effective_rsvp_visibility(meetup_row,mp)='visible'
      and (meetup_row.access_mode<>'private' or mp.rsvp_visibility='visible')
    order by mp.id limit n+1
  ), page as (select * from candidates order by id limit n)
  select jsonb_build_object('items',coalesce((select jsonb_agg(payload order by id) from page),'[]'::jsonb),
    'nextCursor',case when (select count(*) from candidates)>n then (select id::text from page order by id desc limit 1) else null end) into result;
  return result;
end; $$;

create or replace function private.revoke_meetup_access_on_block() returns trigger
language plpgsql security definer set search_path='' as $$
declare affected record;
begin
  -- A host block revokes participation permanently until explicit reinstatement.
  update public.meetup_participations mp set status='removed',removed_at=now()
    from public.meetups m where m.id=mp.meetup_id and mp.status in ('joined','approved','pending')
      and ((m.host_id=new.blocker_id and mp.profile_id=new.blocked_id)
        or (m.host_id=new.blocked_id and mp.profile_id=new.blocker_id));
  -- Peer conflicts preserve RSVP and require host resolution before chat resumes.
  for affected in
    select r.id from public.meetup_rooms r
      join public.meetup_participations a on a.meetup_id=r.meetup_id and a.profile_id=new.blocker_id and a.status in ('joined','approved')
      join public.meetup_participations b on b.meetup_id=r.meetup_id and b.profile_id=new.blocked_id and b.status in ('joined','approved')
    where r.reading_closes_at>now()
  loop
    update public.meetup_room_memberships set status='paused',pause_reason='peer_block',updated_at=now()
      where room_id=affected.id and profile_id in (new.blocker_id,new.blocked_id) and status='active';
    insert into private.meetup_room_conflicts(room_id,blocker_id,blocked_id)
      values(affected.id,new.blocker_id,new.blocked_id) on conflict(room_id,blocker_id,blocked_id) do nothing;
  end loop;
  return new;
end; $$;

create or replace function private.sync_meetup_room_membership() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_room_id uuid; v_host_id uuid; v_status text;
begin
  select r.id,m.host_id,m.status into v_room_id,v_host_id,v_status
    from public.meetup_rooms r join public.meetups m on m.id=r.meetup_id where r.meetup_id=new.meetup_id;
  if v_room_id is null or new.profile_id is null then return new; end if;
  if new.status in ('joined','approved') and new.confirmation_state<>'expired' and v_status='published'
    and private.meetup_actor_is_active(new.profile_id) and not private.meetup_block_exists(new.profile_id,v_host_id) then
    insert into public.meetup_room_memberships(room_id,profile_id,role,status)
    values(v_room_id,new.profile_id,'participant','active')
    on conflict(room_id,profile_id) do update set
      status=case when public.meetup_room_memberships.pause_reason='peer_block' then 'paused' else 'active' end,
      pause_reason=public.meetup_room_memberships.pause_reason,updated_at=now();
  else
    update public.meetup_room_memberships set status='removed',pause_reason=null,updated_at=now()
      where room_id=v_room_id and profile_id=new.profile_id;
  end if;
  return new;
end; $$;

create or replace function private.ensure_meetup_room() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_room_id uuid;
begin
  if new.status='published' then
    insert into public.meetup_rooms(meetup_id,posting_closes_at,reading_closes_at)
    values(new.id,new.effective_end+interval '2 hours',new.effective_end+interval '24 hours')
    on conflict(meetup_id) do update set posting_closes_at=excluded.posting_closes_at,reading_closes_at=excluded.reading_closes_at
    returning id into v_room_id;
    if new.host_id is not null then
      insert into public.meetup_room_memberships(room_id,profile_id,role,status)
      values(v_room_id,new.host_id,'host','active')
      on conflict(room_id,profile_id) do update set role='host',status='active',pause_reason=null,updated_at=now();
    end if;
  end if;
  return new;
end; $$;

-- Qualify the outer album ID: an unqualified id matched the inner share ID.
alter policy albums_shared_metadata_select on public.albums using (
  exists(select 1 from public.album_shares s where s.album_id=albums.id
    and s.recipient_id=(select auth.uid()) and private.album_share_is_open(s.id,(select auth.uid())))
);

create or replace function private.room_is_active_member(p_room_id uuid,p_profile_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.meetup_room_memberships rm
    join public.meetup_rooms r on r.id=rm.room_id join public.meetups m on m.id=r.meetup_id
    where rm.room_id=p_room_id and rm.profile_id=p_profile_id and rm.status='active'
      and r.status in ('open','locked') and r.reading_closes_at>now() and m.status='published'
      and (select enabled and expanded_launch_gates_passed from private.meetup_feature_config where id=1)
      and private.meetup_actor_is_active(p_profile_id) and private.meetup_actor_is_active(m.host_id)
      and not private.meetup_block_exists(p_profile_id,m.host_id)
      and (m.host_id=p_profile_id or exists(select 1 from public.meetup_participations mp
        where mp.meetup_id=m.id and mp.profile_id=p_profile_id and mp.status in ('joined','approved'))));
$$;

create function private.room_message_payload(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',msg.id,'roomId',msg.room_id,
    'sender',case when msg.sender_id is null then null else jsonb_build_object('id',msg.sender_id,'displayName',coalesce(p.display_name,'Hittumst member')) end,
    'kind',msg.kind,'body',msg.body,'linkHostnames',msg.link_hostnames,'createdAt',msg.created_at)
  from public.meetup_room_messages msg left join public.profiles p on p.id=msg.sender_id where msg.id=p_id;
$$;
revoke all on function private.room_message_payload(uuid) from public,anon,authenticated;

create function private.list_room_message_page_impl(p_room uuid,p_cursor jsonb,p_size integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; n integer:=least(greatest(coalesce(p_size,50),1),50);
begin
  if not private.room_is_active_member(p_room,(select auth.uid())) then
    raise exception using errcode='42501',message='active_room_membership_required';
  end if;
  with candidates as (
    select msg.id,msg.created_at from public.meetup_room_messages msg
    where msg.room_id=p_room and msg.hidden_at is null
      and (msg.sender_id is null or not private.meetup_block_exists((select auth.uid()),msg.sender_id))
      and (p_cursor is null or (msg.created_at,msg.id)<((p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid))
    order by msg.created_at desc,msg.id desc limit n+1
  ), page as (select * from candidates order by created_at desc,id desc limit n)
  select jsonb_build_object('items',coalesce((select jsonb_agg(private.room_message_payload(id) order by created_at,id) from page),'[]'::jsonb),
    'nextCursor',case when (select count(*) from candidates)>n then
      (select jsonb_build_object('at',created_at,'id',id)::text from page order by created_at,id limit 1) else null end) into result;
  return result;
end; $$;
create function public.list_meetup_room_message_page(room_id uuid,cursor jsonb default null,page_size integer default 50) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.list_room_message_page_impl(room_id,cursor,page_size); $$;

create function private.send_room_message_once_impl(p_room uuid,p_id uuid,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); existing public.meetup_room_messages%rowtype; hosts text[];
begin
  if p_id is null then raise exception using errcode='22023',message='message_id_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  perform 1 from public.meetup_rooms where id=p_room for share;
  perform 1 from public.meetup_room_memberships where room_id=p_room and profile_id=caller for share;
  if not private.room_is_active_member(p_room,caller) then
    raise exception using errcode='42501',message='active_room_membership_required';
  end if;
  select * into existing from public.meetup_room_messages where id=p_id;
  if existing.id is not null then
    if existing.room_id<>p_room or existing.sender_id is distinct from caller or existing.body<>btrim(p_body) or existing.hidden_at is not null then
      raise exception using errcode='23505',message='message_id_conflict';
    end if;
    return private.room_message_payload(p_id);
  end if;
  if exists(select 1 from public.meetup_rooms where id=p_room and (status<>'open' or locked_at is not null or now()>=posting_closes_at)) then
    raise exception using errcode='55000',message='room_posting_closed';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
    raise exception using errcode='22023',message='invalid_message_body';
  end if;
  if p_body ~* '(^|[[:space:]])(ftp|file|data|javascript):' then
    raise exception using errcode='22023',message='unsupported_link_scheme';
  end if;
  select coalesce(array_agg(distinct lower(substring(match[1] from '^https?://([^/:?#]+)'))),'{}') into hosts
    from regexp_matches(p_body,'(https?://[^[:space:]<>]+)','gi') as match;
  perform private.consume_write_quota('message',60,interval '1 minute');
  insert into public.meetup_room_messages(id,room_id,sender_id,body,link_hostnames)
    values(p_id,p_room,caller,btrim(p_body),hosts);
  return private.room_message_payload(p_id);
end; $$;
create function public.send_meetup_room_message_once(room_id uuid,message_id uuid,body text) returns jsonb
language sql security invoker set search_path='' as $$ select private.send_room_message_once_impl(room_id,message_id,body); $$;

-- Legacy callers use the same authorization, validation and abuse limits.
create or replace function private.send_meetup_room_message_impl(p_room_id uuid,p_body text) returns uuid
language sql security definer set search_path='' as $$
  select (private.send_room_message_once_impl(p_room_id,gen_random_uuid(),p_body)->>'id')::uuid;
$$;
revoke all on function private.list_room_message_page_impl(uuid,jsonb,integer),public.list_meetup_room_message_page(uuid,jsonb,integer),
  private.send_room_message_once_impl(uuid,uuid,text),public.send_meetup_room_message_once(uuid,uuid,text) from public,anon;
grant execute on function private.list_room_message_page_impl(uuid,jsonb,integer),public.list_meetup_room_message_page(uuid,jsonb,integer),
  private.send_room_message_once_impl(uuid,uuid,text),public.send_meetup_room_message_once(uuid,uuid,text) to authenticated;

-- The rollout operator must be able to call the replacement helper.
revoke execute on function private.set_meetup_feature_enabled_impl(boolean) from authenticated;
grant execute on function private.set_meetup_feature_enabled_impl(boolean) to service_role;
