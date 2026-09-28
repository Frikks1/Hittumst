-- Renew authorization and short-lived URLs without consuming a view-once share again.
alter table public.album_view_sessions add column client_request_id uuid;
create unique index album_view_session_request on public.album_view_sessions(viewer_id,client_request_id) where client_request_id is not null;

create function private.refresh_album_share_impl(p_share_id uuid,p_session_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.album_shares; a public.albums; v public.album_view_sessions; items jsonb;
begin
  if not private.account_is_active() or not private.current_user_is_ready(false) then raise exception using errcode='42501',message='album_share_locked'; end if;
  select * into s from public.album_shares where id=p_share_id and recipient_id=(select auth.uid());
  if s.id is null or not private.album_share_is_open(s.id,(select auth.uid())) then raise exception using errcode='42501',message='album_share_locked'; end if;
  if s.access_mode='view_once' then
    select * into v from public.album_view_sessions where id=p_session_id and share_id=s.id and viewer_id=(select auth.uid()) and closed_at is null and expires_at>now();
    if v.id is null or s.status<>'consumed' then raise exception using errcode='42501',message='album_share_locked'; end if;
  elsif p_session_id is not null then raise exception using errcode='42501',message='album_share_locked'; end if;
  select * into a from public.albums where id=s.album_id and deleted_at is null;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'media_type',i.media_type,'storage_path',i.storage_path,'position',i.position,'duration_ms',i.duration_ms) order by i.position),'[]')
    into items from public.album_items i where i.album_id=a.id and i.deleted_at is null;
  return jsonb_build_object('share_id',s.id,'album_id',a.id,'name',a.name,'content_version',a.content_version,'session_id',v.id,'session_expires_at',v.expires_at,'access_expires_at',coalesce(v.expires_at,s.expires_at),'items',items);
end; $$;
create function public.refresh_album_share(share_id uuid,session_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.refresh_album_share_impl(share_id,session_id); $$;

create function private.open_album_share_once_impl(p_share_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing public.album_view_sessions; result jsonb; viewer_session uuid;
begin
  if p_request_id is null or not private.account_is_active() or not private.current_user_is_ready(false) then raise exception using errcode='42501',message='album_share_locked'; end if;
  perform 1 from public.album_shares where id=p_share_id and recipient_id=(select auth.uid()) for update;
  if not found then raise exception using errcode='42501',message='album_share_locked'; end if;
  select * into existing from public.album_view_sessions where viewer_id=(select auth.uid()) and client_request_id=p_request_id;
  if found then
    if existing.share_id<>p_share_id then raise exception using errcode='42501',message='album_share_locked'; end if;
    return private.refresh_album_share_impl(p_share_id,existing.id);
  end if;
  result:=private.open_album_share_impl(p_share_id);
  viewer_session:=(result->>'session_id')::uuid;
  if viewer_session is not null then update public.album_view_sessions set client_request_id=p_request_id where id=viewer_session; end if;
  return private.refresh_album_share_impl(p_share_id,viewer_session);
end; $$;
create function public.open_album_share_once(share_id uuid,request_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.open_album_share_once_impl(share_id,request_id); $$;
revoke all on function private.refresh_album_share_impl(uuid,uuid),public.refresh_album_share(uuid,uuid),private.open_album_share_once_impl(uuid,uuid),public.open_album_share_once(uuid,uuid) from public,anon,service_role;
grant execute on function private.refresh_album_share_impl(uuid,uuid),public.refresh_album_share(uuid,uuid),private.open_album_share_once_impl(uuid,uuid),public.open_album_share_once(uuid,uuid) to authenticated;

-- A push contains only an opaque notification id, never a sender, message, group name or location.
alter table public.notifications add column conversation_id uuid references public.conversations(id) on delete cascade;
alter table public.notifications add column group_id uuid references public.groups(id) on delete cascade;
alter table public.notifications add column direct_message_id uuid references public.messages(id) on delete cascade;
alter table public.notifications add column group_message_id uuid references public.group_messages(id) on delete cascade;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check(kind in (
  'meetup_joined','meetup_access_requested','meetup_request_approved','meetup_request_declined','meetup_materially_changed','meetup_cancelled',
  'meetup_participant_removed','meetup_participant_reinstated','meetup_moderated','meetup_confirmation_required','meetup_starts_soon','meetup_finish','direct_message','group_message'));
alter table public.notifications add constraint message_notification_shape check(
  kind='direct_message' and conversation_id is not null and direct_message_id is not null and group_id is null and group_message_id is null and meetup_id is null and payload='{}'::jsonb
  or kind='group_message' and group_id is not null and group_message_id is not null and conversation_id is null and direct_message_id is null and meetup_id is null and payload='{}'::jsonb
  or kind not in('direct_message','group_message') and conversation_id is null and direct_message_id is null and group_id is null and group_message_id is null);
create unique index notification_direct_message_once on public.notifications(recipient_id,direct_message_id) where direct_message_id is not null;
create unique index notification_group_message_once on public.notifications(recipient_id,group_message_id) where group_message_id is not null;
create index notification_conversation on public.notifications(conversation_id) where conversation_id is not null;
create index notification_group on public.notifications(group_id) where group_id is not null;
create index notification_direct_message on public.notifications(direct_message_id) where direct_message_id is not null;
create index notification_group_message on public.notifications(group_message_id) where group_message_id is not null;

create function private.message_notification_access(p_notification_id uuid,p_recipient uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.notifications n join public.profiles p on p.id=n.recipient_id
  where n.id=p_notification_id and n.recipient_id=p_recipient and p.deletion_requested_at is null and private.meetup_actor_is_active(p.id) and case n.kind
  when 'direct_message' then exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
    join public.conversation_members cm on cm.conversation_id=c.id and cm.user_id=p_recipient and cm.deleted_at is null
    join public.profiles sender on sender.id=m.sender_id and sender.deletion_requested_at is null
    where m.id=n.direct_message_id and c.id=n.conversation_id and m.deleted_at is null and coalesce(m.media_status,'approved')='approved'
    and private.meetup_actor_is_active(sender.id) and not private.meetup_block_exists(p_recipient,m.sender_id))
  when 'group_message' then exists(select 1 from public.group_messages m join public.groups g on g.id=m.group_id and g.status<>'removed'
    join public.group_members gm on gm.group_id=g.id and gm.profile_id=p_recipient and gm.status='active'
    join public.profiles sender on sender.id=m.sender_id and sender.deletion_requested_at is null
    where m.id=n.group_message_id and g.id=n.group_id and m.hidden_at is null and private.meetup_actor_is_active(sender.id)
    and not private.meetup_block_exists(p_recipient,m.sender_id))
  else true end);
$$;
revoke all on function private.message_notification_access(uuid,uuid) from public,anon,authenticated,service_role;

create function private.notify_direct_message() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid; notification uuid;
begin
  if new.deleted_at is not null or new.sender_id is null or coalesce(new.media_status,'approved')<>'approved' then return new; end if;
  for recipient in select cm.user_id from public.conversation_members cm join public.profiles p on p.id=cm.user_id
    where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id and cm.deleted_at is null
    and p.deletion_requested_at is null and private.meetup_actor_is_active(p.id) and not private.meetup_block_exists(cm.user_id,new.sender_id)
  loop
    insert into public.notifications(recipient_id,kind,conversation_id,direct_message_id) values(recipient,'direct_message',new.conversation_id,new.id)
      on conflict do nothing returning id into notification;
    if notification is not null then insert into private.notification_outbox(notification_id) values(notification); end if;
  end loop;
  return new;
end; $$;
create trigger notify_direct_message after insert or update of media_status on public.messages for each row execute function private.notify_direct_message();
create function private.notify_group_message() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid; notification uuid;
begin
  if new.hidden_at is not null or new.sender_id is null then return new; end if;
  for recipient in select gm.profile_id from public.group_members gm join public.profiles p on p.id=gm.profile_id
    where gm.group_id=new.group_id and gm.status='active' and gm.profile_id<>new.sender_id and p.deletion_requested_at is null
    and private.meetup_actor_is_active(p.id) and not private.meetup_block_exists(gm.profile_id,new.sender_id)
  loop
    insert into public.notifications(recipient_id,kind,group_id,group_message_id) values(recipient,'group_message',new.group_id,new.id)
      on conflict do nothing returning id into notification;
    if notification is not null then insert into private.notification_outbox(notification_id) values(notification); end if;
  end loop;
  return new;
end; $$;
create trigger notify_group_message after insert on public.group_messages for each row execute function private.notify_group_message();
revoke all on function private.notify_direct_message(),private.notify_group_message() from public,anon,authenticated,service_role;

create function private.resolve_notification_impl(p_notification_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n public.notifications; target_type text; target_id uuid; result jsonb;
begin
  if not private.account_is_active() or not private.current_user_is_ready(false) or not private.message_notification_access(p_notification_id,(select auth.uid())) then
    raise exception using errcode='42501',message='notification_unavailable'; end if;
  select * into n from public.notifications where id=p_notification_id and recipient_id=(select auth.uid());
  if n.kind='direct_message' then target_type:='conversation'; target_id:=n.conversation_id;
  elsif n.kind='group_message' then target_type:='group'; target_id:=n.group_id;
  else
    perform private.get_meetup_impl(n.meetup_id);
    target_type:='meetup'; target_id:=n.meetup_id;
  end if;
  if target_id is null then raise exception using errcode='42501',message='notification_unavailable'; end if;
  update public.notifications set read_at=coalesce(read_at,now()) where id=n.id;
  result:=jsonb_build_object('type',target_type,'id',target_id);
  if target_type='conversation' then
    select result||jsonb_build_object('profileId',p.id,'displayName',p.display_name) into result
      from public.conversations c join public.profiles p on p.id=case when c.participant_low=n.recipient_id then c.participant_high else c.participant_low end where c.id=target_id;
  end if;
  return result;
end; $$;
create function public.resolve_notification(notification_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.resolve_notification_impl(notification_id); $$;
revoke all on function private.resolve_notification_impl(uuid),public.resolve_notification(uuid) from public,anon,service_role;
grant execute on function private.resolve_notification_impl(uuid),public.resolve_notification(uuid) to authenticated;

-- Preserve the existing meetup-only inbox contract for old and current clients.
create or replace function private.list_notifications_impl(p_limit_count integer) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',n.id,'kind',n.kind,'meetupId',n.meetup_id,'payload',n.payload,'createdAt',n.created_at,'readAt',n.read_at)) order by n.created_at desc,n.id desc),'[]')
  from (select * from public.notifications where recipient_id=(select auth.uid()) and kind not in('direct_message','group_message')
    order by created_at desc,id desc limit least(greatest(coalesce(p_limit_count,50),1),200)) n;
$$;

-- Session deletion/sign-out invalidates device delivery even if the client could not unregister.
alter table private.push_tokens add column auth_session_id uuid references auth.sessions(id) on delete cascade;
create index push_tokens_auth_session on private.push_tokens(auth_session_id) where auth_session_id is not null;
update private.push_tokens set enabled=false,disabled_at=now(),disabled_reason='session_binding_required' where enabled;
create or replace function private.register_push_token_impl(p_expo_push_token text,p_platform text,p_locale text) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); token_id uuid; session_id uuid;
begin
  session_id:=nullif(auth.jwt()->>'session_id','')::uuid;
  if caller is null or not private.account_is_active() or not exists(select 1 from auth.sessions s where s.id=session_id and s.user_id=caller) then
    raise exception using errcode='42501',message='active_session_required'; end if;
  if p_platform is null or p_platform not in('ios','android','web') or p_locale is null or p_locale not in('is','en') or p_expo_push_token is null
    or btrim(p_expo_push_token)!~'^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' or char_length(p_expo_push_token)>512 then
    raise exception using errcode='22023',message='invalid_push_token'; end if;
  insert into private.push_tokens(profile_id,expo_push_token,platform,locale,enabled,last_seen_at,disabled_at,disabled_reason,auth_session_id)
    values(caller,btrim(p_expo_push_token),p_platform,p_locale,true,now(),null,null,session_id)
    on conflict(expo_push_token) do update set profile_id=caller,platform=excluded.platform,locale=excluded.locale,enabled=true,last_seen_at=now(),disabled_at=null,disabled_reason=null,auth_session_id=excluded.auth_session_id returning id into token_id;
  return token_id;
end; $$;

alter function private.claim_notification_outbox_impl(integer,uuid) rename to claim_notification_outbox_before_message_scope;
revoke all on function private.claim_notification_outbox_before_message_scope(integer,uuid) from public,anon,authenticated,service_role;
create function private.claim_notification_outbox_impl(p_batch_size integer,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare claimed jsonb;
begin
  perform private.require_service_role();
  claimed:=private.claim_notification_outbox_before_message_scope(p_batch_size,p_claim_token);
  return (select coalesce(jsonb_agg(jsonb_set(c,'{tokens}',case when private.message_notification_access((c->'notification'->>'id')::uuid,(c->'notification'->>'recipientId')::uuid)
    then coalesce((select jsonb_agg(t) from jsonb_array_elements(c->'tokens') t join private.push_tokens pt on pt.id=(t->>'tokenId')::uuid
      join auth.sessions s on s.id=pt.auth_session_id and s.user_id=pt.profile_id where pt.enabled),'[]') else '[]'::jsonb end)),'[]') from jsonb_array_elements(claimed) c);
end; $$;
revoke all on function private.claim_notification_outbox_impl(integer,uuid) from public,anon,authenticated;
grant execute on function private.claim_notification_outbox_impl(integer,uuid) to service_role;
create or replace function public.claim_notification_outbox(batch_size integer default 100,claim_token uuid default gen_random_uuid()) returns jsonb
language sql security invoker set search_path='' as $$ select private.claim_notification_outbox_impl(batch_size,claim_token); $$;
