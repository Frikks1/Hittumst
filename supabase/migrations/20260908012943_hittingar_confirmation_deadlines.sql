-- Late admissions receive a real confirmation window. Never release protected
-- information to an expired pending RSVP while waiting for the scheduler.
create function private.meetup_confirmation_deadline(m public.meetups, mp public.meetup_participations)
returns timestamptz language sql stable security definer set search_path='' as $$
  select least((m).effective_end, greatest((m).starts_at - interval '2 hours',
    coalesce((mp).confirmation_requested_at, (m).starts_at - interval '24 hours') + interval '15 minutes'));
$$;
revoke all on function private.meetup_confirmation_deadline(public.meetups,public.meetup_participations) from public,anon,authenticated;

create or replace function private.require_late_meetup_confirmation() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_row public.meetups%rowtype;
begin
  if new.status not in ('joined','approved') then return new; end if;
  if tg_op='UPDATE' then
    if old.status in ('joined','approved') then return new; end if;
  end if;
  -- Explicit rejoining starts a new RSVP; expired or completed state cannot leak
  -- into the new admission. Host removals still require explicit reinstatement.
  new.confirmation_state := 'not_required';
  new.confirmation_requested_at := null;
  new.confirmed_at := null;
  new.expired_at := null;
  new.attendance_outcome := null;
  new.attendance_completed_at := null;
  new.completion_notice_dismissed_at := null;
  new.history_visibility := 'private';
  new.starts_soon_notified_at := null;
  select * into event_row from public.meetups where id=new.meetup_id;
  if event_row.starts_at <= now()+interval '2 hours' and event_row.effective_end>now() then
    new.confirmation_state := 'confirmation_pending';
    new.confirmation_requested_at := now();
  end if;
  return new;
end; $$;

create or replace function private.confirm_meetup_attendance_impl(p_meetup_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); event_row public.meetups%rowtype; participation_row public.meetup_participations%rowtype;
begin
  perform private.assert_meetup_feature_enabled();
  if not private.meetup_actor_is_active(caller) then raise exception using errcode='42501',message='meetup_participant_not_eligible'; end if;
  select * into event_row from public.meetups where id=p_meetup_id for share;
  if event_row.status is distinct from 'published' or not private.meetup_actor_is_active(event_row.host_id)
    or private.meetup_block_exists(caller,event_row.host_id) then
    raise exception using errcode='42501',message='meetup_not_joinable';
  end if;
  select * into participation_row from public.meetup_participations where meetup_id=p_meetup_id and profile_id=caller for update;
  if participation_row.status in ('joined','approved') and participation_row.confirmation_state='confirmed' then return; end if;
  if participation_row.status not in ('joined','approved') or participation_row.id is null
    or participation_row.confirmation_state<>'confirmation_pending'
    or now()>=private.meetup_confirmation_deadline(event_row,participation_row) then
    raise exception using errcode='55000',message='confirmation_not_available';
  end if;
  update public.meetup_participations set confirmation_state='confirmed',confirmed_at=now(),updated_at=now()
    where id=participation_row.id;
end; $$;

create or replace function private.meetup_has_attendee_access(p_meetup_id uuid,p_viewer_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.meetup_has_attendee_access_before_hittumst(p_meetup_id,p_viewer_id)
    and exists(select 1 from public.meetups m where m.id=p_meetup_id and now()<m.effective_end+interval '2 hours')
    and not exists(select 1 from public.meetup_participations mp join public.meetups m on m.id=mp.meetup_id
      where mp.meetup_id=p_meetup_id and mp.profile_id=p_viewer_id and mp.status in ('joined','approved')
        and (mp.confirmation_state='expired' or (mp.confirmation_state='confirmation_pending'
          and (coalesce(mp.joined_at,mp.responded_at,mp.updated_at)>=m.starts_at-interval '2 hours'
            or now()>=private.meetup_confirmation_deadline(m,mp)))));
$$;

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
        where mp.meetup_id=m.id and mp.profile_id=p_profile_id and mp.status in ('joined','approved')
          and mp.confirmation_state<>'expired' and (mp.confirmation_state<>'confirmation_pending'
            or now()<private.meetup_confirmation_deadline(m,mp)))));
$$;

create or replace function private.get_meetup_room_summary_impl(p_meetup_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',r.id,'meetupId',r.meetup_id,'postingClosesAt',r.posting_closes_at,
    'readingClosesAt',r.reading_closes_at,'isPaused',rm.status='paused',
    'canPost',rm.status='active' and r.status='open' and r.locked_at is null and now()<r.posting_closes_at,'unreadCount',0)
  from public.meetup_rooms r join public.meetup_room_memberships rm on rm.room_id=r.id
    join public.meetups m on m.id=r.meetup_id
  where r.meetup_id=p_meetup_id and rm.profile_id=(select auth.uid()) and rm.status in ('active','paused')
    and r.status in ('open','locked') and now()<r.reading_closes_at and m.status='published'
    and (select enabled and expanded_launch_gates_passed from private.meetup_feature_config where id=1)
    and private.meetup_actor_is_active((select auth.uid())) and private.meetup_actor_is_active(m.host_id)
    and not private.meetup_block_exists((select auth.uid()),m.host_id)
    and (m.host_id=(select auth.uid()) or exists(select 1 from public.meetup_participations mp
      where mp.meetup_id=m.id and mp.profile_id=(select auth.uid()) and mp.status in ('joined','approved')
        and mp.confirmation_state<>'expired' and (mp.confirmation_state<>'confirmation_pending'
          or now()<private.meetup_confirmation_deadline(m,mp))));
$$;

alter function private.meetup_payload(uuid,uuid,boolean) rename to meetup_payload_before_confirmation_deadlines;
create function private.meetup_payload(p_meetup_id uuid,p_viewer_id uuid,p_include_description boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; event_row public.meetups%rowtype; participation_row public.meetup_participations%rowtype; deadline timestamptz; room jsonb;
begin
  result:=private.meetup_payload_before_confirmation_deadlines(p_meetup_id,p_viewer_id,p_include_description);
  if result is null then return null; end if;
  select * into event_row from public.meetups where id=p_meetup_id;
  select * into participation_row from public.meetup_participations where meetup_id=p_meetup_id and profile_id=p_viewer_id;
  if participation_row.confirmation_state='confirmation_pending' then deadline:=private.meetup_confirmation_deadline(event_row,participation_row); end if;
  result:=jsonb_set(result,'{viewerState}',(result->'viewerState')||jsonb_strip_nulls(jsonb_build_object('confirmationDeadlineAt',deadline)));
  -- The summary is bound to the authenticated caller, as are all public detail RPCs.
  if p_viewer_id=(select auth.uid()) then room:=private.get_meetup_room_summary_impl(p_meetup_id); end if;
  result:=jsonb_set(result,'{capabilities}',(result->'capabilities')||jsonb_build_object(
    'canConfirmAttendance',coalesce(deadline>now() and event_row.status='published' and participation_row.status in ('joined','approved')
      and private.meetup_actor_is_active(p_viewer_id) and not private.meetup_block_exists(p_viewer_id,event_row.host_id),false),
    'canViewRoom',room is not null,'canSendRoomMessage',coalesce((room->>'canPost')::boolean,false)));
  return result;
end; $$;
revoke all on function private.meetup_payload(uuid,uuid,boolean) from public,anon,authenticated;

create or replace function private.process_hittumst_lifecycle_impl() returns jsonb
language plpgsql security definer set search_path='' as $$
declare pending_count integer:=0; expired_count integer:=0; soon_count integer:=0; finish_count integer:=0; closed_count integer:=0; changed record;
begin
  perform private.require_service_role();
  if not pg_try_advisory_xact_lock(hashtextextended('hittumst-lifecycle',0)) then return jsonb_build_object('alreadyRunning',true); end if;
  for changed in
    update public.meetup_participations mp set confirmation_state='confirmation_pending',confirmation_requested_at=now(),updated_at=now()
    from public.meetups m where m.id=mp.meetup_id and m.status='published' and mp.status in ('joined','approved') and mp.confirmation_state='not_required'
      and m.starts_at<=now()+interval '24 hours' and m.starts_at>now()+interval '2 hours'
    returning mp.profile_id,mp.meetup_id
  loop
    pending_count:=pending_count+1;
    perform private.enqueue_meetup_notification(changed.profile_id,'meetup_confirmation_required',changed.meetup_id,'{}'::jsonb);
  end loop;
  for changed in
    update public.meetup_participations mp set status='left',left_at=now(),confirmation_state='expired',expired_at=now(),updated_at=now()
    from public.meetups m where m.id=mp.meetup_id and m.status='published' and mp.status in ('joined','approved')
      and mp.confirmation_state='confirmation_pending' and now()>=private.meetup_confirmation_deadline(m,mp)
    returning mp.profile_id,mp.meetup_id
  loop expired_count:=expired_count+1; end loop;
  for changed in
    update public.meetup_participations mp set starts_soon_notified_at=now(),updated_at=now()
    from public.meetups m where m.id=mp.meetup_id and m.status='published' and mp.status in ('joined','approved')
      and mp.confirmation_state in ('confirmed','not_required') and mp.starts_soon_notified_at is null
      and m.starts_at<=now()+interval '2 hours' and m.starts_at>now()
    returning mp.profile_id,mp.meetup_id
  loop
    soon_count:=soon_count+1;
    perform private.enqueue_meetup_notification(changed.profile_id,'meetup_starts_soon',changed.meetup_id,'{}'::jsonb);
  end loop;
  for changed in
    update public.meetup_participations mp set confirmation_state='completion_pending',updated_at=now()
    from public.meetups m where m.id=mp.meetup_id and m.status='published' and mp.status in ('joined','approved')
      and mp.confirmation_state not in ('completed','dismissed','completion_pending') and now()>=m.effective_end+interval '2 hours'
    returning mp.profile_id,mp.meetup_id
  loop
    finish_count:=finish_count+1;
    perform private.enqueue_meetup_notification(changed.profile_id,'meetup_finish',changed.meetup_id,'{}'::jsonb);
  end loop;
  update public.meetup_rooms set status='locked',locked_at=coalesce(locked_at,now())
    where status='open' and posting_closes_at<=now() and reading_closes_at>now();
  update public.meetup_rooms set status='closed' where status<>'closed' and reading_closes_at<=now();
  get diagnostics closed_count=row_count;
  return jsonb_build_object('confirmationPending',pending_count,'expired',expired_count,'startsSoon',soon_count,'finishNotices',finish_count,'roomsClosed',closed_count);
end; $$;
