-- Keep current voice presence actor-bound and remove acknowledged admission metadata
-- after 24h even when other members keep the room open.
create index voice_active_profile on private.voice_admissions(profile_id) where revoked_at is null;
create or replace function private.list_groups_impl() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'bio',g.bio,'role',member.role,
   'membershipStatus',member.status,'status',g.status,
   'memberCount',(select count(*)::integer from public.group_members m where m.group_id=g.id and m.status='active'),
   'isVoiceActive',member.status='active' and private.voice_member_eligible(g.id,(select auth.uid()),(select auth.jwt()->>'session_id')::uuid)
     and exists(select 1 from private.voice_rooms r join private.voice_admissions a on a.room_id=r.id
       where r.group_id=g.id and r.ended_at is null and private.voice_admission_valid(a.id)),
   'updatedAt',g.updated_at) order by g.updated_at desc,g.id),'[]'::jsonb)
 from public.group_members member join public.groups g on g.id=member.group_id
 where member.profile_id=(select auth.uid()) and member.status in ('active','invited') and g.status<>'removed'
   and private.current_user_is_ready(false);
$$;
create or replace function private.voice_service_impl(p_action text,p_id uuid default null,p_event jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare affected integer; event_id text; v_room_id uuid; v_admission_id uuid;
begin
 if p_action='validate' then return to_jsonb(private.voice_admission_valid(p_id) and
     (not (p_event ? 'roomName') or exists(select 1 from private.voice_admissions a where a.id=p_id and 'group-'||a.room_id::text=p_event->>'roomName')));
 elsif p_action='reconcile' then
   update private.voice_admissions a set revoked_at=now() where a.revoked_at is null and not private.voice_admission_valid(a.id);
   update private.voice_rooms r set ended_at=now() where r.ended_at is null
     and not exists(select 1 from private.voice_admissions a where a.room_id=r.id and a.revoked_at is null);
   delete from private.voice_admissions where provider_revoked_at<now()-interval '1 day';
   delete from private.voice_exclusions x where not exists(select 1 from public.profiles p where p.id=x.profile_id and p.deletion_requested_at is null);
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
