-- A recipient sees one row per person and kind. The last visit moves the row,
-- while the count preserves repeat visits without exposing raw browsing history.
create table private.profile_activity (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('views','taps')),
  occurred_at timestamptz not null default now(),
  count integer not null default 1 check(count > 0),
  unique(actor_id,recipient_id,kind),
  check(actor_id <> recipient_id)
);
create index profile_activity_inbox on private.profile_activity(recipient_id,kind,occurred_at desc,id desc);
create index profile_activity_sender on private.profile_activity(actor_id,kind,occurred_at desc);
alter table private.profile_activity enable row level security;
revoke all on private.profile_activity from public,anon,authenticated,service_role;

-- Rate accounting keeps no recipient identifiers and survives blocking. This
-- prevents senders from resetting their quota by blocking after every tap.
create table private.profile_tap_sends (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index profile_tap_sends_window on private.profile_tap_sends(actor_id,sent_at desc);
alter table private.profile_tap_sends enable row level security;
revoke all on private.profile_tap_sends from public,anon,authenticated,service_role;

create function private.record_profile_activity_impl(p_profile_id uuid,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
declare
  caller uuid := (select auth.uid());
  previous private.profile_activity;
begin
  if not private.current_user_is_ready(true) then
    raise exception using errcode='42501',message='profile_access_required';
  end if;
  if p_kind not in ('views','taps') or p_kind is null then raise exception 'invalid_activity_kind'; end if;
  perform pg_advisory_xact_lock(hashtextextended('profile_activity:'||caller::text,0));
  perform pg_advisory_xact_lock(hashtextextended('profile_activity_pair:'||least(caller,p_profile_id)::text||':'||greatest(caller,p_profile_id)::text,0));
  -- Reuse the public-profile guard: current session, fresh caller location,
  -- onboarding, moderation, target eligibility and blocks in either direction.
  if p_profile_id is null or p_profile_id=caller or private.get_public_profile_impl(p_profile_id) is null then
    raise exception using errcode='42501',message='profile_unavailable';
  end if;
  -- Hidden members can browse without revealing their visits. A tap is explicit
  -- contact, so it requires a currently visible sender.
  if not exists(select 1 from public.profiles p where p.id=caller and p.is_profile_visible and p.moderation_status='active'
    and private.discovery_target_allowed(p.id)) then
    if p_kind='views' then return; end if;
    raise exception using errcode='42501',message='profile_unavailable';
  end if;
  -- Serialize every send by this actor so parallel calls cannot bypass cooldowns
  -- or the per-hour/per-day limits.
  select * into previous from private.profile_activity a where a.actor_id=caller and a.recipient_id=p_profile_id and a.kind=p_kind;
  if previous.id is not null and previous.occurred_at>now()-(case p_kind when 'views' then interval '30 minutes' else interval '24 hours' end) then
    if p_kind='views' then return; end if;
    raise exception using errcode='P0001',message='tap_cooldown';
  end if;
  if p_kind='taps' and (
    (select count(*) from private.profile_tap_sends a where a.actor_id=caller and a.sent_at>now()-interval '1 hour')>=30
    or (select count(*) from private.profile_tap_sends a where a.actor_id=caller and a.sent_at>now()-interval '24 hours')>=100
  ) then raise exception using errcode='P0001',message='tap_rate_limited'; end if;
  insert into private.profile_activity(actor_id,recipient_id,kind) values(caller,p_profile_id,p_kind)
  on conflict(actor_id,recipient_id,kind) do update set occurred_at=now(),count=private.profile_activity.count+1;
  if p_kind='taps' then
    delete from private.profile_tap_sends where actor_id=caller and sent_at<=now()-interval '24 hours';
    insert into private.profile_tap_sends(actor_id) values(caller);
  end if;
end;
$$;

create function public.record_profile_view(profile_id uuid) returns void language sql security invoker set search_path='' as $$
  select private.record_profile_activity_impl(profile_id,'views');
$$;
create function public.send_profile_tap(profile_id uuid) returns void language sql security invoker set search_path='' as $$
  select private.record_profile_activity_impl(profile_id,'taps');
$$;

create function private.list_profile_activity_impl(p_kind text,p_cursor jsonb default null,p_page_size integer default 40) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  cursor_at timestamptz;
  cursor_id uuid;
  page_size integer := greatest(1,least(coalesce(p_page_size,40),100));
  result_items jsonb := '[]'::jsonb;
  next_cursor jsonb := null;
  has_more boolean := false;
  entry private.profile_activity;
  entry_profile jsonb;
begin
  if not private.current_user_is_ready(true) then raise exception using errcode='42501',message='profile_access_required'; end if;
  if p_kind not in ('views','taps') or p_kind is null then raise exception 'invalid_activity_kind'; end if;
  if p_cursor is not null then
    begin
      if jsonb_typeof(p_cursor)<>'object' or p_cursor->>'at' is null or p_cursor->>'id' is null then raise exception 'invalid'; end if;
      cursor_at:=(p_cursor->>'at')::timestamptz;
      cursor_id:=(p_cursor->>'id')::uuid;
      if not isfinite(cursor_at) then raise exception 'invalid'; end if;
    exception when others then raise exception using errcode='22023',message='invalid_cursor'; end;
  end if;
  -- The inbox index supplies this cursor in newest-first order. Evaluate only
  -- candidates needed to fill the page and find one visible continuation.
  for entry in select a.* from private.profile_activity a
    where a.recipient_id=(select auth.uid()) and a.kind=p_kind
      and (p_cursor is null or (a.occurred_at,a.id)<(cursor_at,cursor_id))
    order by a.occurred_at desc,a.id desc
  loop
    entry_profile:=private.get_public_profile_impl(entry.actor_id);
    if entry_profile is null then continue; end if;
    if jsonb_array_length(result_items)>=page_size then has_more:=true; exit; end if;
    result_items:=result_items||jsonb_build_array(jsonb_build_object('id',entry.id,'profile',entry_profile,'occurredAt',entry.occurred_at,'count',entry.count));
    next_cursor:=jsonb_build_object('at',entry.occurred_at,'id',entry.id);
  end loop;
  return jsonb_build_object('items',result_items,'nextCursor',case when has_more then next_cursor else null end);
end;
$$;
create function public.list_profile_activity(kind text,cursor jsonb default null,page_size integer default 40) returns jsonb
language sql stable security invoker set search_path='' as $$select private.list_profile_activity_impl(kind,cursor,page_size);$$;

-- Forget the interaction on a block so unblocking cannot restore prior interest.
create function private.remove_profile_activity_on_block() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('profile_activity_pair:'||least(new.blocker_id,new.blocked_id)::text||':'||greatest(new.blocker_id,new.blocked_id)::text,0));
  delete from private.profile_activity a where
    (a.actor_id=new.blocker_id and a.recipient_id=new.blocked_id) or (a.actor_id=new.blocked_id and a.recipient_id=new.blocker_id);
  return new;
end;
$$;
create trigger remove_profile_activity_on_block after insert on public.blocks for each row execute function private.remove_profile_activity_on_block();

-- FKs erase both directions on profile deletion. Export only the caller's own
-- sent history and the same currently visible incoming entries as the inbox.
alter function private.export_account_impl() rename to export_account_before_profile_activity;
create function private.export_account_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.account_is_active() or not private.has_current_session() then raise exception using errcode='42501',message='account_unavailable'; end if;
  return private.export_account_before_profile_activity()||jsonb_build_object('profileActivity',coalesce((
    select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'actorId',a.actor_id,'recipientId',a.recipient_id,'occurredAt',a.occurred_at,'count',a.count) order by a.occurred_at desc,a.id desc)
    from private.profile_activity a where a.actor_id=(select auth.uid())
      or (a.recipient_id=(select auth.uid()) and private.get_public_profile_impl(a.actor_id) is not null)
  ),'[]'::jsonb),'profileTapSends',coalesce((select jsonb_agg(sent_at order by sent_at desc) from private.profile_tap_sends where actor_id=(select auth.uid())),'[]'::jsonb));
end;
$$;
create or replace function public.export_account() returns jsonb language sql stable security invoker set search_path='' as $$select private.export_account_impl();$$;
create or replace function public.export_my_account() returns jsonb language sql stable security invoker set search_path='' as $$select private.export_account_impl();$$;

revoke all on function private.record_profile_activity_impl(uuid,text),private.list_profile_activity_impl(text,jsonb,integer),private.remove_profile_activity_on_block(),private.export_account_before_profile_activity(),private.export_account_impl() from public,anon,authenticated,service_role;
revoke all on function public.record_profile_view(uuid),public.send_profile_tap(uuid),public.list_profile_activity(text,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function private.record_profile_activity_impl(uuid,text),private.list_profile_activity_impl(text,jsonb,integer),private.export_account_impl() to authenticated;
grant execute on function public.record_profile_view(uuid),public.send_profile_tap(uuid),public.list_profile_activity(text,jsonb,integer) to authenticated;
