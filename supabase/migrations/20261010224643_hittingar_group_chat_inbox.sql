-- One occurrence room is the event group chat. Existing publish/participation
-- triggers create it and keep admitted members in sync; inbox access is checked
-- against the same current membership, blocks, confirmation and diagnosis rules.
alter table public.meetup_room_memberships add column last_read_at timestamptz;

-- Repair published occurrences created before automatic rooms were introduced.
insert into public.meetup_rooms(meetup_id,posting_closes_at,reading_closes_at)
select id,effective_end+interval '2 hours',effective_end+interval '24 hours'
from public.meetups where status='published' and effective_end+interval '24 hours'>now()
on conflict(meetup_id) do nothing;
insert into public.meetup_room_memberships(room_id,profile_id,role,status)
select r.id,m.host_id,'host','active' from public.meetup_rooms r
join public.meetups m on m.id=r.meetup_id where m.status='published' and m.host_id is not null
on conflict(room_id,profile_id) do nothing;
insert into public.meetup_room_memberships(room_id,profile_id,role,status,pause_reason)
select r.id,mp.profile_id,'participant',
  case when exists(select 1 from private.meetup_room_conflicts c where c.room_id=r.id
    and c.status='unresolved' and mp.profile_id in(c.blocker_id,c.blocked_id)) then 'paused' else 'active' end,
  case when exists(select 1 from private.meetup_room_conflicts c where c.room_id=r.id
    and c.status='unresolved' and mp.profile_id in(c.blocker_id,c.blocked_id)) then 'peer_block' else null end
from public.meetup_rooms r join public.meetups m on m.id=r.meetup_id
join public.meetup_participations mp on mp.meetup_id=m.id
where m.status='published' and mp.status in('joined','approved') and mp.confirmation_state<>'expired'
  and private.meetup_actor_is_active(mp.profile_id) and not private.meetup_block_exists(mp.profile_id,m.host_id)
on conflict(room_id,profile_id) do nothing;

create function private.list_meetup_chats_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); result jsonb;
begin
  if caller is null or not private.account_is_active() or not private.meetup_actor_is_active(caller) then
    raise exception using errcode='42501',message='active_member_required';
  end if;
  select coalesce(jsonb_agg(chat.payload order by chat.sort_at desc,chat.room_id),'[]'::jsonb) into result
  from (
    select r.id room_id,coalesce(msg.created_at,m.updated_at) sort_at,
      jsonb_strip_nulls(jsonb_build_object('id',r.id,'meetupId',m.id,'title',m.title,'startsAt',m.starts_at,
        'canPost',(summary->>'canPost')::boolean,'isPaused',(summary->>'isPaused')::boolean,
        'lastMessage',msg.body,'lastMessageAt',msg.created_at,
        'unreadCount',case when (summary->>'isPaused')::boolean then 0 else (
          select count(*) from public.meetup_room_messages unread where unread.room_id=r.id and unread.hidden_at is null
            and unread.sender_id is distinct from caller and unread.created_at>coalesce(rm.last_read_at,rm.joined_at)
            and (unread.sender_id is null or not private.meetup_block_exists(caller,unread.sender_id))) end)) payload
    from public.meetup_room_memberships rm join public.meetup_rooms r on r.id=rm.room_id
      join public.meetups m on m.id=r.meetup_id
      cross join lateral private.get_meetup_room_summary_impl(m.id) as room_summary(summary)
      left join lateral (
        select message.body,message.created_at from public.meetup_room_messages message
        where message.room_id=r.id and message.hidden_at is null and not (summary->>'isPaused')::boolean
          and (message.sender_id is null or not private.meetup_block_exists(caller,message.sender_id))
        order by message.created_at desc,message.id desc limit 1
      ) msg on true
    where rm.profile_id=caller and summary is not null
  ) chat;
  return result;
end; $$;
create function public.list_meetup_chats() returns jsonb language sql stable security invoker set search_path=''
as $$ select private.list_meetup_chats_impl(); $$;

create function private.mark_meetup_room_read_impl(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.account_is_active() or not private.room_is_active_member(p_room,(select auth.uid())) then
    raise exception using errcode='42501',message='active_room_membership_required';
  end if;
  update public.meetup_room_memberships set last_read_at=now()
    where room_id=p_room and profile_id=(select auth.uid());
end; $$;
create function public.mark_meetup_room_read(room_id uuid) returns void
language sql security invoker set search_path='' as $$ select private.mark_meetup_room_read_impl(room_id); $$;
revoke all on function private.list_meetup_chats_impl(),public.list_meetup_chats(),
  private.mark_meetup_room_read_impl(uuid),public.mark_meetup_room_read(uuid) from public,anon,service_role;
grant execute on function private.list_meetup_chats_impl(),public.list_meetup_chats(),
  private.mark_meetup_room_read_impl(uuid),public.mark_meetup_room_read(uuid) to authenticated;
