-- Foreground group voice. Opaque tombstones survive deletion until provider revocation.
create table private.voice_rooms (
 id uuid primary key default gen_random_uuid(), group_id uuid not null,
 created_at timestamptz not null default now(), ended_at timestamptz, provider_deleted_at timestamptz
);
create unique index voice_one_active_room on private.voice_rooms(group_id) where ended_at is null;
create table private.voice_admissions (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references private.voice_rooms(id) on delete cascade,
 profile_id uuid not null, auth_session_id uuid not null, created_at timestamptz not null default now(),
 valid_until timestamptz not null default now()+interval '45 seconds', revoked_at timestamptz, provider_revoked_at timestamptz
);
create index voice_active_admissions on private.voice_admissions(room_id,profile_id) where revoked_at is null;
create index voice_pending_revocations on private.voice_admissions(revoked_at) where revoked_at is not null and provider_revoked_at is null;
create table private.voice_exclusions (
 room_id uuid not null references private.voice_rooms(id) on delete cascade, profile_id uuid not null, primary key(room_id,profile_id)
);
create table private.voice_webhook_receipts (id text primary key, received_at timestamptz not null default now());
create table private.voice_worker_health (id boolean primary key default true check(id), succeeded_at timestamptz);
insert into private.voice_worker_health default values;
alter table private.voice_rooms enable row level security;
alter table private.voice_admissions enable row level security;
alter table private.voice_exclusions enable row level security;
alter table private.voice_webhook_receipts enable row level security;
alter table private.voice_worker_health enable row level security;
revoke all on private.voice_rooms,private.voice_admissions,private.voice_exclusions,private.voice_webhook_receipts,private.voice_worker_health from public,anon,authenticated,service_role;

create function private.voice_member_eligible(p_group uuid,p_profile uuid,p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select voice from private.launch_capabilities where id),false)
 and private.meetup_actor_is_active(p_profile)
 and exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=p_profile and p.deletion_requested_at is null)
 and exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=p_profile and (s.not_after is null or s.not_after>now()))
 and exists(select 1 from public.groups g join public.group_members m on m.group_id=g.id
   where g.id=p_group and g.status='active' and m.profile_id=p_profile and m.status='active')
 and not exists(select 1 from private.group_blocks b where b.group_id=p_group and b.profile_id=p_profile)
 -- Never share a voice room with any active group member who has a block in either direction.
 and not exists(select 1 from public.group_members m where m.group_id=p_group and m.status='active'
   and private.meetup_block_exists(p_profile,m.profile_id));
$$;
revoke all on function private.voice_member_eligible(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function private.voice_admission_valid(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.voice_admissions a join private.voice_rooms r on r.id=a.room_id
 where a.id=p_id and a.revoked_at is null and a.valid_until>now() and r.ended_at is null
 and private.voice_member_eligible(r.group_id,a.profile_id,a.auth_session_id)
 and not exists(select 1 from private.voice_exclusions x where x.room_id=a.room_id and x.profile_id=a.profile_id));
$$;
revoke all on function private.voice_admission_valid(uuid) from public,anon,authenticated,service_role;

create function private.group_voice_access_impl(p_group_id uuid,p_action text,p_admission_id uuid default null,p_target_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid := (select auth.uid()); caller_session uuid; room_row private.voice_rooms;
 admission private.voice_admissions; caller_role text; target_role text;
begin
 if caller is null or not private.has_current_session() then raise exception using errcode='42501',message='voice_session_required'; end if;
 caller_session := (select auth.jwt()->>'session_id')::uuid;
 if p_action='leave' then
   update private.voice_admissions set revoked_at=coalesce(revoked_at,now())
    where id=p_admission_id and profile_id=caller and auth_session_id=caller_session;
   return jsonb_build_object('left',true);
 end if;
 perform 1 from public.groups where id=p_group_id for update;
 if not private.voice_member_eligible(p_group_id,caller,caller_session) then
   raise exception using errcode='42501',message='voice_access_denied';
 end if;
 caller_role := private.group_member_role(p_group_id,caller);
 select * into room_row from private.voice_rooms where group_id=p_group_id and ended_at is null;
 if p_action='join' then
   if not exists(select 1 from private.voice_worker_health where id and succeeded_at>now()-interval '30 seconds') then
     raise exception using errcode='55000',message='voice_worker_unavailable';
   end if;
   perform private.consume_write_quota('voice_join',30,interval '1 hour');
   if room_row.id is null then insert into private.voice_rooms(group_id) values(p_group_id) returning * into room_row; end if;
   if exists(select 1 from private.voice_exclusions where room_id=room_row.id and profile_id=caller) then
     raise exception using errcode='42501',message='voice_removed_for_call';
   end if;
   -- Every join gets a fresh identity; old tokens cannot impersonate a later join.
   perform pg_advisory_xact_lock(hashtextextended(caller::text||':voice',0));
   update private.voice_admissions set revoked_at=now() where profile_id=caller and revoked_at is null;
   insert into private.voice_admissions(room_id,profile_id,auth_session_id)
     values(room_row.id,caller,caller_session) returning * into admission;
 elsif p_action='heartbeat' then
   if not exists(select 1 from private.voice_worker_health where id and succeeded_at>now()-interval '30 seconds') then
     raise exception using errcode='55000',message='voice_worker_unavailable';
   end if;
   select * into admission from private.voice_admissions where id=p_admission_id and room_id=room_row.id
     and profile_id=caller and auth_session_id=caller_session for update;
   if admission.id is null or not private.voice_admission_valid(admission.id) then
     raise exception using errcode='42501',message='voice_access_denied';
   end if;
   update private.voice_admissions set valid_until=now()+interval '45 seconds' where id=admission.id returning * into admission;
 elsif p_action='remove' then
   target_role := private.group_member_role(p_group_id,p_target_id);
   if room_row.id is null or p_target_id=caller or target_role is null or target_role='owner'
     or caller_role not in ('owner','admin','moderator') or (caller_role<>'owner' and target_role<>'member') then
     raise exception using errcode='42501',message='voice_moderator_required';
   end if;
   perform private.consume_write_quota('voice_moderation',60,interval '1 hour');
   insert into private.voice_exclusions(room_id,profile_id) values(room_row.id,p_target_id) on conflict do nothing;
   update private.voice_admissions set revoked_at=coalesce(revoked_at,now()) where room_id=room_row.id and profile_id=p_target_id;
   return jsonb_build_object('removed',true);
 elsif p_action='end' then
   if caller_role not in ('owner','admin') then raise exception using errcode='42501',message='voice_moderator_required'; end if;
   update private.voice_rooms set ended_at=coalesce(ended_at,now()) where id=room_row.id;
   update private.voice_admissions set revoked_at=coalesce(revoked_at,now()) where room_id=room_row.id;
   return jsonb_build_object('ended',true);
 else raise exception using errcode='22023',message='voice_action_invalid'; end if;
 return jsonb_build_object('admissionId',admission.id,'roomName','group-'||room_row.id::text,
   'expiresAt',admission.valid_until,'role',caller_role,'name',(select display_name from public.profiles where id=caller),
   'members',coalesce((select jsonb_agg(jsonb_build_object('identity',a.id,'profileId',a.profile_id,'name',p.display_name,'role',m.role))
     from private.voice_admissions a join public.profiles p on p.id=a.profile_id
     join public.group_members m on m.group_id=p_group_id and m.profile_id=a.profile_id
     where a.room_id=room_row.id and private.voice_admission_valid(a.id)),'[]'::jsonb));
end; $$;
create function public.group_voice_access(p_group_id uuid,p_action text,p_admission_id uuid default null,p_target_id uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select private.group_voice_access_impl(p_group_id,p_action,p_admission_id,p_target_id);$$;
revoke all on function private.group_voice_access_impl(uuid,text,uuid,uuid),public.group_voice_access(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.group_voice_access_impl(uuid,text,uuid,uuid),public.group_voice_access(uuid,text,uuid,uuid) to authenticated;

-- Service-only reconciliation; never depend on a cooperative client to revoke access.
create function private.voice_service_impl(p_action text,p_id uuid default null,p_event jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare affected integer; event_id text; v_room_id uuid; v_admission_id uuid;
begin
 if p_action='validate' then return to_jsonb(private.voice_admission_valid(p_id));
 elsif p_action='reconcile' then
   update private.voice_admissions a set revoked_at=now() where a.revoked_at is null and not private.voice_admission_valid(a.id);
   update private.voice_rooms r set ended_at=now() where r.ended_at is null
     and not exists(select 1 from private.voice_admissions a where a.room_id=r.id and a.revoked_at is null);
   delete from private.voice_rooms r where r.provider_deleted_at<now()-interval '1 day'
     and not exists(select 1 from private.voice_admissions a where a.room_id=r.id and a.provider_revoked_at is null);
   delete from private.voice_webhook_receipts where received_at<now()-interval '7 days';
   return jsonb_build_object('revocations',coalesce((select jsonb_agg(q) from (
     select a.id,'group-'||a.room_id::text as "roomName" from private.voice_admissions a
      where a.revoked_at is not null and a.provider_revoked_at is null order by a.revoked_at limit 200)q),'[]'::jsonb),
     'rooms',coalesce((select jsonb_agg(q) from(select r.id,'group-'||r.id::text as "roomName" from private.voice_rooms r
      where r.ended_at is not null and r.provider_deleted_at is null order by r.ended_at limit 100)q),'[]'::jsonb));
 elsif p_action='revoked' then
   update private.voice_admissions set provider_revoked_at=coalesce(provider_revoked_at,now()) where id=p_id and revoked_at is not null;
   return 'true'::jsonb;
 elsif p_action='deleted' then
   update private.voice_rooms set provider_deleted_at=coalesce(provider_deleted_at,now()) where id=p_id and ended_at is not null;
   return 'true'::jsonb;
 elsif p_action='healthy' then
   if exists(select 1 from private.voice_admissions where revoked_at is not null and provider_revoked_at is null)
     or exists(select 1 from private.voice_rooms where ended_at is not null and provider_deleted_at is null) then return 'false'::jsonb; end if;
   update private.voice_worker_health set succeeded_at=now() where id;
   return 'true'::jsonb;
 elsif p_action='disable' then
   update private.voice_worker_health set succeeded_at=null where id;
   update private.voice_admissions set revoked_at=coalesce(revoked_at,now());
   update private.voice_rooms set ended_at=coalesce(ended_at,now());
   return 'true'::jsonb;
 elsif p_action='webhook' then
   event_id:=p_event->>'id';
   if event_id is null or length(event_id)>200 then raise exception using errcode='22023',message='voice_event_invalid'; end if;
   insert into private.voice_webhook_receipts(id) values(event_id) on conflict do nothing;
   get diagnostics affected = row_count;
   if affected=0 then return jsonb_build_object('duplicate',true); end if;
   select id into v_room_id from private.voice_rooms where 'group-'||id::text=p_event->>'roomName';
   select id into v_admission_id from private.voice_admissions where id::text=p_event->>'identity' and room_id=v_room_id;
   if p_event->>'event'='room_finished' then
     update private.voice_rooms set ended_at=coalesce(ended_at,now()) where id=v_room_id;
     update private.voice_admissions set revoked_at=coalesce(revoked_at,now()) where room_id=v_room_id;
   elsif p_event->>'event'='participant_left' then
     update private.voice_admissions set revoked_at=coalesce(revoked_at,now()) where id=v_admission_id;
   elsif p_event->>'event'='participant_joined' and not private.voice_admission_valid(v_admission_id) then
     update private.voice_admissions set revoked_at=coalesce(revoked_at,now()) where id=v_admission_id;
     return jsonb_build_object('remove',true);
   end if;
   return jsonb_build_object('duplicate',false);
 end if;
 raise exception using errcode='22023',message='voice_action_invalid';
end; $$;
create function public.voice_service(p_action text,p_id uuid default null,p_event jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.voice_service_impl(p_action,p_id,p_event);$$;
revoke all on function private.voice_service_impl(text,uuid,jsonb),public.voice_service(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.voice_service_impl(text,uuid,jsonb),public.voice_service(text,uuid,jsonb) to service_role;
comment on table private.voice_admissions is 'Ephemeral LiveKit admission and revocation metadata. No audio or transcripts. Tombstones retained until provider acknowledgement.';
-- Capability voice stays false until provider, worker, native and safety acceptance pass.
