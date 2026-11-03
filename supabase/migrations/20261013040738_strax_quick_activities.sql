-- Strax is an immediate, public, four-hour activity. It has no Hittingar
-- scheduling, recurring occurrences, hosting entitlements or payment state.
create table public.strax_activities (
 id uuid primary key default gen_random_uuid(),
 host_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid,
 request_input jsonb not null,
 title text not null check (char_length(btrim(title)) between 1 and 60),
 description text not null check (char_length(btrim(description)) between 1 and 600),
 location_text text check (char_length(location_text)<=200),
 address text check (char_length(address)<=300),
 requirements text check (char_length(requirements)<=600),
 spaces_needed integer check (spaces_needed between 1 and 50),
 join_mode text not null default 'application' check (join_mode in ('application','open')),
 venue_mode text not null default 'in_person' check (venue_mode in ('in_person','online')),
 status text not null default 'active' check (status in ('active','closed','expired','moderation_hidden')),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 closed_at timestamptz,
 moderation_reason text,
 moderation_previous_status text check(moderation_previous_status in ('active','closed','expired')),
 updated_at timestamptz not null default clock_timestamp(),
 unique(host_id,request_id),
 check (expires_at=created_at+interval '4 hours'),
 check (status<>'closed' or closed_at is not null),
 check (status not in ('active','expired') or closed_at is null),
 check (status<>'moderation_hidden' or moderation_reason is not null)
);
create index strax_activities_active on public.strax_activities(expires_at,id) where status='active';
create index strax_activities_host on public.strax_activities(host_id,created_at desc,id);
alter table public.strax_activities enable row level security;
revoke all on public.strax_activities from public,anon,authenticated,service_role;

create table private.strax_participations (
 activity_id uuid not null references public.strax_activities(id) on delete cascade,
 profile_id uuid not null references public.profiles(id) on delete cascade,
 status text not null check(status in ('pending','joined','declined','left','withdrawn','removed')),
 introduction text not null default '' check(char_length(introduction)<=1000),
 requirements_acknowledged_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(activity_id,profile_id)
);
create index strax_participations_profile on private.strax_participations(profile_id,activity_id);
create table private.strax_shares (
 activity_id uuid not null references public.strax_activities(id) on delete cascade,
 destination_type text not null check(destination_type in ('friend','group')),
 destination_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(activity_id,destination_type,destination_id)
);
create table private.strax_media (
 id uuid primary key references private.media_uploads(id) on delete cascade,
 activity_id uuid not null unique references public.strax_activities(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade,
 storage_path text not null unique,
 created_at timestamptz not null default clock_timestamp()
);
-- Expiration is authorization, not deletion. Unapproved retention durations stay
-- unset, matching existing retention policy configuration in this repository.
create table private.strax_retention_config (
 id boolean primary key default true check(id),
 purge_enabled boolean not null default false,
 policy_approved_at timestamptz,
 standard_retention interval,
 reported_retention interval,
 check(standard_retention is null or standard_retention>interval '0'),
 check(reported_retention is null or reported_retention>interval '0'),
 check(reported_retention is null or standard_retention is null or reported_retention>=standard_retention),
 check(policy_approved_at is not null or (not purge_enabled and standard_retention is null and reported_retention is null))
);
insert into private.strax_retention_config(id) values(true);
create table private.strax_retention (
 activity_id uuid primary key references public.strax_activities(id) on delete cascade,
 legal_hold_at timestamptz,
 legal_hold_reason text check(legal_hold_reason is null or char_length(btrim(legal_hold_reason)) between 8 and 1000),
 check((legal_hold_at is null)=(legal_hold_reason is null))
);
alter table private.strax_participations enable row level security;
alter table private.strax_shares enable row level security;
alter table private.strax_media enable row level security;
alter table private.strax_retention_config enable row level security;
alter table private.strax_retention enable row level security;
revoke all on private.strax_participations,private.strax_shares,private.strax_media,private.strax_retention_config,private.strax_retention from public,anon,authenticated,service_role;

create function private.strax_clock_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then new.created_at:=clock_timestamp(); new.expires_at:=new.created_at+interval '4 hours';
 elsif (new.created_at,new.expires_at,new.host_id,new.request_id,new.request_input) is distinct from
       (old.created_at,old.expires_at,old.host_id,old.request_id,old.request_input) then
  raise exception using errcode='23514',message='strax_lifetime_immutable';
 end if;
 new.updated_at:=clock_timestamp(); return new;
end $$;
create trigger strax_clock_guard before insert or update on public.strax_activities for each row execute function private.strax_clock_guard();

create function private.strax_actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); begin
 if not private.account_is_active() or not private.current_user_is_ready(false) or not private.memory_actor_active(caller) then
  raise exception using errcode='42501',message='active_account_required'; end if;
 return caller;
end $$;
create function private.strax_host_available(p_host uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.memory_actor_active(p_host) and exists(select 1 from public.profiles p where p.id=p_host
 and p.is_profile_visible and p.meetup_hosting_restricted_at is null);
$$;
create function private.strax_visible(p_activity uuid,p_viewer uuid,p_active_only boolean default true) returns boolean
language sql stable security definer set search_path='' as $$
 select private.account_is_active() and p_viewer=(select auth.uid()) and private.current_user_is_ready(false)
 and private.memory_actor_active(p_viewer) and exists(select 1 from public.strax_activities a
 where a.id=p_activity and private.strax_host_available(a.host_id) and not private.meetup_block_exists(a.host_id,p_viewer)
 and (a.status='active' and a.expires_at>clock_timestamp() or not p_active_only and a.status<>'moderation_hidden'
 and (a.host_id=p_viewer or exists(select 1 from private.strax_participations p where p.activity_id=a.id and p.profile_id=p_viewer))));
$$;
create policy strax_activity_read on public.strax_activities for select to authenticated
using(private.strax_visible(id,(select auth.uid()),false));
grant select(id,host_id,title,description,location_text,address,requirements,spaces_needed,join_mode,venue_mode,status,created_at,expires_at,closed_at,updated_at)
 on public.strax_activities to authenticated;

create function private.strax_payload(p_id uuid,p_viewer uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.strax_activities; participation private.strax_participations; person public.profiles; used integer; available boolean; media_path text; media_state text; clock timestamptz:=clock_timestamp(); state text;
begin
 select * into a from public.strax_activities where id=p_id;
 select * into person from public.profiles where id=a.host_id;
 select * into participation from private.strax_participations where activity_id=a.id and profile_id=p_viewer;
 select count(*)::integer into used from private.strax_participations p where p.activity_id=a.id and p.status='joined';
 state:=case when a.host_id=p_viewer then 'host' when participation.status in ('pending','joined','declined') then participation.status when participation.status='removed' then 'declined' else 'none' end;
 available:=a.status='active' and a.expires_at>clock and private.strax_host_available(a.host_id) and (a.spaces_needed is null or used<a.spaces_needed);
 select storage_path into media_path from private.strax_media m join private.media_uploads u on u.id=m.id and u.status='approved' where m.activity_id=a.id;
 if a.status<>'active' or a.expires_at<=clock then media_path:=null; end if;
 select case when media_path is not null then 'approved' when u.status in ('reserved','processing','appealed') then 'pending' when u.status='rejected' then 'rejected' else 'none' end into media_state
 from private.media_uploads u where u.target_type='strax' and u.target_id=a.id order by u.created_at desc,u.id desc limit 1;
 return jsonb_build_object('id',a.id,'host',jsonb_build_object('id',person.id,'displayName',coalesce(person.display_name,'Hittumst member')),
 'title',a.title,'description',a.description,'locationText',a.location_text,'address',a.address,'requirements',a.requirements,
 'spacesNeeded',a.spaces_needed,'joinMode',a.join_mode,'venueMode',a.venue_mode,'participantCount',used,
 'createdAt',a.created_at,'expiresAt',a.expires_at,'serverNow',clock,'status',case when a.status='closed' or a.status='moderation_hidden' then 'closed' when a.expires_at<=clock or a.status='expired' then 'expired' else 'active' end,
 'viewerState',state,'viewerCapabilities',jsonb_build_object('canJoin',available and state='none' and a.join_mode='open',
 'canApply',available and state='none' and a.join_mode='application','canLeave',a.status='active' and a.expires_at>clock and state='joined',
 'canWithdraw',a.status='active' and a.expires_at>clock and state='pending','canManage',a.status='active' and a.expires_at>clock and state='host'),
 'photoPath',media_path,'photoStatus',coalesce(media_state,'none'));
end $$;
create function private.strax_get_impl(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.strax_actor(); begin
 if not private.strax_visible(p_id,caller,false) then raise exception using errcode='42501',message='strax_unavailable'; end if;
 return private.strax_payload(p_id,caller); end $$;
create function private.strax_discover_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.strax_actor(); begin
 return jsonb_build_object('items',coalesce((select jsonb_agg(private.strax_payload(a.id,caller) order by a.created_at desc,a.id) from public.strax_activities a
 where private.strax_visible(a.id,caller,true)),'[]'),'serverNow',clock_timestamp()); end $$;
create function private.strax_count_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.strax_actor(); result jsonb; begin
 select jsonb_build_object('count',count(*)::integer,'nextExpiryAt',min(a.expires_at),'serverNow',clock_timestamp()) into result
 from public.strax_activities a where private.strax_visible(a.id,caller,true); return result; end $$;
create function private.strax_mine_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.strax_actor(); begin return coalesce((select jsonb_agg(private.strax_payload(a.id,caller) order by a.created_at desc,a.id)
 from (select * from public.strax_activities where host_id=caller and status<>'moderation_hidden' order by created_at desc,id limit 50) a),'[]'); end $$;
create function private.strax_profile_badges_impl(p_profile_ids uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.strax_actor(); begin
 if p_profile_ids is null or cardinality(p_profile_ids)>100 then raise exception using errcode='22023',message='invalid_strax_profiles'; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('profileId',a.host_id,'activityId',a.id,'title',a.title,'expiresAt',a.expires_at) order by a.host_id)
 from public.strax_activities a where a.host_id=any(p_profile_ids) and private.strax_visible(a.id,caller,true)),'[]'),'serverNow',clock_timestamp()); end $$;

create function private.strax_create_impl(p_input jsonb,p_request_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.strax_actor(); normalized jsonb; existing public.strax_activities; result uuid; spaces integer;
begin
 if p_input is null or jsonb_typeof(p_input)<>'object' or p_input-array['title','description','locationText','address','requirements','spacesNeeded','joinMode','venueMode']<>'{}'::jsonb
 or jsonb_typeof(p_input->'title') is distinct from 'string' or jsonb_typeof(p_input->'description') is distinct from 'string'
 or char_length(btrim(p_input->>'title')) not between 1 and 60 or char_length(btrim(p_input->>'description')) not between 1 and 600
 or exists(select 1 from jsonb_each(p_input) x where x.key in ('locationText','address','requirements') and jsonb_typeof(x.value) not in ('string','null'))
 or char_length(coalesce(p_input->>'locationText',''))>200 or char_length(coalesce(p_input->>'address',''))>300 or char_length(coalesce(p_input->>'requirements',''))>600
 or coalesce(p_input->>'joinMode','application') not in ('application','open') or coalesce(p_input->>'venueMode','in_person') not in ('in_person','online') then
 raise exception using errcode='22023',message='invalid_strax_input'; end if;
 if p_input->>'spacesNeeded' is not null then
  if jsonb_typeof(p_input->'spacesNeeded')<>'number' or p_input->>'spacesNeeded'!~'^[0-9]+$' then raise exception using errcode='22023',message='invalid_strax_input'; end if;
  begin spaces:=(p_input->>'spacesNeeded')::integer; exception when numeric_value_out_of_range then raise exception using errcode='22023',message='invalid_strax_input'; end;
  if spaces not between 1 and 50 then raise exception using errcode='22023',message='invalid_strax_input'; end if;
 end if;
 normalized:=jsonb_build_object('title',btrim(p_input->>'title'),'description',btrim(p_input->>'description'),
 'locationText',nullif(btrim(p_input->>'locationText'),''),'address',nullif(btrim(p_input->>'address'),''),'requirements',nullif(btrim(p_input->>'requirements'),''),
 'spacesNeeded',spaces,'joinMode',coalesce(p_input->>'joinMode','application'),'venueMode',coalesce(p_input->>'venueMode','in_person'));
 -- The profile row serializes publication and restoration for this host, even
 -- across different create request IDs and while expired rows await cleanup.
 perform 1 from public.profiles where id=caller for update;
 if p_request_id is not null then select * into existing from public.strax_activities where host_id=caller and request_id=p_request_id;
  if existing.id is not null then
   if existing.request_input<>normalized then raise exception using errcode='23505',message='strax_request_conflict'; end if;
   return private.strax_payload(existing.id,caller);
  end if;
 end if;
 if not private.strax_host_available(caller) then raise exception using errcode='42501',message='strax_host_unavailable'; end if;
 if exists(select 1 from public.strax_activities where host_id=caller and status='active' and expires_at>clock_timestamp()) then
  raise exception using errcode='23514',message='strax_already_active'; end if;
 perform private.consume_write_quota('strax_create',10,interval '1 hour');
 insert into public.strax_activities(host_id,request_id,request_input,title,description,location_text,address,requirements,spaces_needed,join_mode,venue_mode)
 values(caller,p_request_id,normalized,normalized->>'title',normalized->>'description',normalized->>'locationText',normalized->>'address',normalized->>'requirements',spaces,
 normalized->>'joinMode',normalized->>'venueMode') returning id into result;
 insert into private.strax_retention(activity_id) values(result);
 return private.strax_payload(result,caller);
end $$;

alter table public.notifications add column strax_id uuid references public.strax_activities(id) on delete cascade;
create index notifications_strax on public.notifications(strax_id) where strax_id is not null;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check(kind in (
 'meetup_joined','meetup_access_requested','meetup_request_approved','meetup_request_declined','meetup_materially_changed','meetup_cancelled',
 'meetup_participant_removed','meetup_participant_reinstated','meetup_moderated','meetup_confirmation_required','meetup_starts_soon','meetup_finish','direct_message','group_message',
 'community_published','community_announcement','community_waitlist_offer','community_reminder','profile_tap',
 'strax_invited','strax_application_received','strax_approved','strax_declined','strax_joined','strax_closed','strax_removed'));
alter table public.notifications add constraint notifications_strax_shape check(
 (kind like 'strax_%' and strax_id is not null and meetup_id is null and payload='{}'::jsonb)
 or (kind not like 'strax_%' and strax_id is null));
create function private.strax_notify(p_id uuid,p_recipient uuid,p_kind text) returns void language plpgsql security definer set search_path='' as $$
declare notification uuid; begin
 if not private.memory_actor_active(p_recipient) or exists(select 1 from public.strax_activities a where a.id=p_id and private.meetup_block_exists(a.host_id,p_recipient)) then return; end if;
 insert into public.notifications(recipient_id,kind,strax_id) values(p_recipient,'strax_'||p_kind,p_id) returning id into notification;
 insert into private.notification_outbox(notification_id) values(notification);
end $$;

create function private.strax_participate_impl(p_id uuid,p_action text,p_introduction text default '',p_acknowledged boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.strax_actor(); a public.strax_activities; existing private.strax_participations; used integer; next_status text;
begin
 select * into a from public.strax_activities where id=p_id for update;
 if a.id is null or not private.strax_visible(a.id,caller,true) or a.host_id=caller then raise exception using errcode='42501',message='strax_unavailable'; end if;
 if p_action is null or p_action not in ('join','apply','withdraw','leave') or p_introduction is null or char_length(p_introduction)>1000 then
 raise exception using errcode='22023',message='invalid_strax_action'; end if;
 select * into existing from private.strax_participations where activity_id=a.id and profile_id=caller;
 if p_action in ('withdraw','leave') then
  if p_action='withdraw' and existing.status='withdrawn' or p_action='leave' and existing.status='left' then return private.strax_payload(a.id,caller); end if;
  if p_action='withdraw' and existing.status is distinct from 'pending' or p_action='leave' and existing.status is distinct from 'joined' then
   raise exception using errcode='23514',message='strax_participation_unavailable'; end if;
  update private.strax_participations set status=case p_action when 'withdraw' then 'withdrawn' else 'left' end,updated_at=clock_timestamp() where activity_id=a.id and profile_id=caller;
  return private.strax_payload(a.id,caller);
 end if;
 if p_action='join' and a.join_mode<>'open' or p_action='apply' and a.join_mode<>'application' then raise exception using errcode='23514',message='strax_join_mode_mismatch'; end if;
 if existing.status in ('pending','joined') then return private.strax_payload(a.id,caller); end if;
 if existing.status in ('declined','removed') then raise exception using errcode='42501',message='strax_participation_unavailable'; end if;
 if nullif(btrim(a.requirements),'') is not null and coalesce(p_acknowledged,false)=false then raise exception using errcode='23514',message='strax_acknowledgement_required'; end if;
 select count(*)::integer into used from private.strax_participations p where p.activity_id=a.id and p.status='joined';
 if a.spaces_needed is not null and used>=a.spaces_needed then raise exception using errcode='23514',message='strax_full'; end if;
 -- Recheck after the row lock and quota acquisition; a transaction beginning
 -- before the deadline never grants permission after it.
 perform private.consume_write_quota('strax_participate',30,interval '1 hour');
 if a.expires_at<=clock_timestamp() then raise exception using errcode='42501',message='strax_unavailable'; end if;
 next_status:=case p_action when 'join' then 'joined' else 'pending' end;
 insert into private.strax_participations(activity_id,profile_id,status,introduction,requirements_acknowledged_at)
 values(a.id,caller,next_status,case p_action when 'apply' then btrim(p_introduction) else '' end,clock_timestamp())
 on conflict(activity_id,profile_id) do update set status=excluded.status,introduction=excluded.introduction,requirements_acknowledged_at=excluded.requirements_acknowledged_at,updated_at=clock_timestamp();
 perform private.strax_notify(a.id,a.host_id,case p_action when 'join' then 'joined' else 'application_received' end);
 return private.strax_payload(a.id,caller);
end $$;
create function private.strax_respond_impl(p_id uuid,p_profile_id uuid,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.strax_actor(); a public.strax_activities; person private.strax_participations; used integer; next_status text;
begin
 select * into a from public.strax_activities where id=p_id for update;
 if a.id is null or a.host_id<>caller or not private.strax_visible(a.id,caller,true) then raise exception using errcode='42501',message='strax_unavailable'; end if;
 if p_action is null or p_action not in ('approve','decline','remove') then raise exception using errcode='22023',message='invalid_strax_action'; end if;
 select * into person from private.strax_participations where activity_id=a.id and profile_id=p_profile_id;
 next_status:=case p_action when 'approve' then 'joined' when 'decline' then 'declined' else 'removed' end;
 if person.status=next_status then return private.strax_payload(a.id,caller); end if;
 if person.profile_id is null or p_profile_id=caller or p_action in ('approve','decline') and person.status<>'pending' or p_action='remove' and person.status<>'joined'
 or not private.memory_actor_active(p_profile_id) or private.meetup_block_exists(caller,p_profile_id) then
 raise exception using errcode='42501',message='strax_participation_unavailable'; end if;
 if p_action='approve' then
  select count(*)::integer into used from private.strax_participations p where p.activity_id=a.id and p.status='joined';
  if a.spaces_needed is not null and used>=a.spaces_needed then raise exception using errcode='23514',message='strax_full'; end if;
 end if;
 if a.expires_at<=clock_timestamp() then raise exception using errcode='42501',message='strax_unavailable'; end if;
 update private.strax_participations set status=next_status,updated_at=clock_timestamp() where activity_id=a.id and profile_id=p_profile_id;
 perform private.strax_notify(a.id,p_profile_id,case p_action when 'approve' then 'approved' when 'decline' then 'declined' else 'removed' end);
 return private.strax_payload(a.id,caller);
end $$;
create function private.strax_roster_impl(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.strax_actor(); begin
 if not exists(select 1 from public.strax_activities where id=p_id and host_id=caller) or not private.strax_visible(p_id,caller,false) then
 raise exception using errcode='42501',message='strax_unavailable'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('profileId',p.profile_id,'displayName',coalesce(person.display_name,'Hittumst member'),
 'status',p.status,'introduction',p.introduction,'createdAt',p.created_at,'updatedAt',p.updated_at) order by p.created_at,p.profile_id)
 from private.strax_participations p join public.profiles person on person.id=p.profile_id where p.activity_id=p_id
 and private.memory_actor_active(p.profile_id) and not private.meetup_block_exists(caller,p.profile_id)),'[]'); end $$;
create function private.strax_close_impl(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.strax_actor(); a public.strax_activities; recipient uuid; begin
 select * into a from public.strax_activities where id=p_id for update;
 if a.id is null or a.host_id<>caller or not private.strax_visible(p_id,caller,false) then raise exception using errcode='42501',message='strax_unavailable'; end if;
 if a.status='closed' then return private.strax_payload(a.id,caller); end if;
 if a.status<>'active' or a.expires_at<=clock_timestamp() then raise exception using errcode='42501',message='strax_unavailable'; end if;
 update public.strax_activities set status='closed',closed_at=clock_timestamp() where id=a.id;
 for recipient in select profile_id from private.strax_participations where activity_id=a.id and status in ('pending','joined') loop
  perform private.strax_notify(a.id,recipient,'closed'); end loop;
 return private.strax_payload(a.id,caller); end $$;

-- A block revokes participation permanently; undoing a block never silently
-- restores an accepted slot or the host's access to a private introduction.
create function private.strax_revoke_on_block() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.strax_activities where host_id in (new.blocker_id,new.blocked_id) order by id for update;
 update private.strax_participations p set status='removed',introduction='',updated_at=clock_timestamp()
 from public.strax_activities a where p.activity_id=a.id and p.status in ('joined','pending')
 and ((a.host_id=new.blocker_id and p.profile_id=new.blocked_id) or (a.host_id=new.blocked_id and p.profile_id=new.blocker_id));
 return new;
end $$;
create trigger strax_revoke_on_block after insert on public.blocks for each row execute function private.strax_revoke_on_block();
create function private.strax_revoke_on_profile_state() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.memory_actor_active(new.id) then
 perform 1 from public.strax_activities a where exists(select 1 from private.strax_participations p where p.activity_id=a.id and p.profile_id=new.id and p.status in ('joined','pending')) order by a.id for update;
 update private.strax_participations set status='removed',introduction='',updated_at=clock_timestamp()
 where profile_id=new.id and status in ('joined','pending'); end if;
 return new;
end $$;
create trigger strax_revoke_on_profile_state after update of moderation_status,suspended_until,deletion_requested_at,special_category_consent_at,onboarding_completed_at
 on public.profiles for each row execute function private.strax_revoke_on_profile_state();

-- A group share is an ordinary message carrying an immutable, tiny link card.
-- Existing group access, block filtering, paging and push triggers still apply.
alter table public.group_messages add column strax_id uuid references public.strax_activities(id) on delete set null deferrable initially deferred,
 add column strax_title text,add column strax_expires_at timestamptz;
alter table public.group_messages add constraint group_messages_strax_shape check(
 (strax_title is null and strax_expires_at is null and strax_id is null)
 or (char_length(strax_title) between 1 and 60 and strax_expires_at is not null));
create index group_messages_strax on public.group_messages(strax_id) where strax_id is not null;
create function private.strax_share_impl(p_id uuid,p_all_friends boolean default false,p_friend_ids uuid[] default '{}',p_group_ids uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.strax_actor(); a public.strax_activities; recipient uuid; destination uuid; sent jsonb:='[]'; failed jsonb:='[]'; inserted integer;
begin
 if p_friend_ids is null or p_group_ids is null or array_position(p_friend_ids,null) is not null or array_position(p_group_ids,null) is not null
 or cardinality(p_friend_ids)>500 or cardinality(p_group_ids)>50 then
 raise exception using errcode='22023',message='invalid_strax_shares'; end if;
 select * into a from public.strax_activities where id=p_id for update;
 if a.id is null or a.host_id<>caller or not private.strax_visible(p_id,caller,true) then raise exception using errcode='42501',message='strax_unavailable'; end if;
 for destination in select distinct id from (
  select unnest(p_friend_ids) id union select p.id from public.profiles p where coalesce(p_all_friends,false) and private.profiles_are_friends(caller,p.id)
 ) destinations order by id loop
  if destination is null or not private.profiles_are_friends(caller,destination) or not private.memory_actor_active(destination) or private.meetup_block_exists(caller,destination) then
   failed:=failed||jsonb_build_array(jsonb_build_object('type','friend','id',coalesce(destination::text,''),'reason','friend_unavailable')); continue; end if;
  if a.expires_at<=clock_timestamp() then failed:=failed||jsonb_build_array(jsonb_build_object('type','friend','id',destination,'reason','strax_unavailable')); continue; end if;
  insert into private.strax_shares(activity_id,destination_type,destination_id) values(a.id,'friend',destination) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted>0 then perform private.strax_notify(a.id,destination,'invited'); end if;
  sent:=sent||jsonb_build_array(jsonb_build_object('type','friend','id',destination));
 end loop;
 for destination in select distinct id from unnest(p_group_ids) id order by id loop
  -- Locking the group makes a concurrent leave/archive resolve before sharing.
  perform 1 from public.groups where id=destination and status='active' for update;
  if not found or private.group_member_role(destination,caller) is null then
   failed:=failed||jsonb_build_array(jsonb_build_object('type','group','id',coalesce(destination::text,''),'reason','group_unavailable')); continue; end if;
  if a.expires_at<=clock_timestamp() then failed:=failed||jsonb_build_array(jsonb_build_object('type','group','id',destination,'reason','strax_unavailable')); continue; end if;
  insert into private.strax_shares(activity_id,destination_type,destination_id) values(a.id,'group',destination) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted>0 then
   insert into public.group_messages(group_id,sender_id,body,strax_id,strax_title,strax_expires_at)
   values(destination,caller,a.title,a.id,a.title,a.expires_at);
   update public.groups set updated_at=clock_timestamp() where id=destination;
  end if;
  sent:=sent||jsonb_build_array(jsonb_build_object('type','group','id',destination));
 end loop;
 return jsonb_build_object('sent',sent,'failed',failed);
end $$;
alter function private.list_group_messages_page_impl(uuid,jsonb,integer) rename to list_group_messages_page_before_strax;
create function private.list_group_messages_page_impl(p_group_id uuid,p_cursor jsonb default null,p_page_size integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 result:=private.list_group_messages_page_before_strax(p_group_id,p_cursor,p_page_size);
 return jsonb_set(result,'{items}',coalesce((select jsonb_agg(item||case when m.strax_title is not null then jsonb_build_object('strax',jsonb_build_object(
 'id',coalesce(m.strax_id::text,'deleted'),'title',m.strax_title,'expiresAt',m.strax_expires_at)) else '{}'::jsonb end order by ord)
 from jsonb_array_elements(result->'items') with ordinality x(item,ord) join public.group_messages m on m.id=(item->>'id')::uuid),'[]'));
end $$;
-- Replace SQL wrappers after renaming; previously parsed SQL function bodies may
-- retain their original dependency rather than resolving the replacement name.
create or replace function public.list_group_messages_page(group_id uuid,cursor jsonb default null,page_size integer default 50) returns jsonb
language sql stable security invoker set search_path='' as $$select private.list_group_messages_page_impl(group_id,cursor,page_size);$$;
create or replace function private.list_group_messages_impl(p_group_id uuid,p_page_size integer default 50,p_before timestamptz default null) returns jsonb
language sql stable security definer set search_path='' as $$select private.list_group_messages_page_impl(p_group_id,case when p_before is null then null else
 jsonb_build_object('createdAt',p_before,'id','00000000-0000-0000-0000-000000000000') end,p_page_size)->'items';$$;

alter function private.message_notification_access(uuid,uuid) rename to message_notification_access_before_strax;
create function private.message_notification_access(p_notification_id uuid,p_recipient uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.message_notification_access_before_strax(p_notification_id,p_recipient) and exists(select 1 from public.notifications n
 where n.id=p_notification_id and case when n.strax_id is not null then exists(select 1 from public.strax_activities a
 where a.id=n.strax_id and a.expires_at>clock_timestamp() and a.status in ('active','closed') and private.strax_host_available(a.host_id)
 and not private.meetup_block_exists(a.host_id,p_recipient))
 when n.kind='group_message' then not exists(select 1 from public.group_messages m where m.id=n.group_message_id and m.strax_title is not null
 and (m.strax_id is null or not exists(select 1 from public.strax_activities a where a.id=m.strax_id and a.status='active'
 and a.expires_at>clock_timestamp() and private.strax_host_available(a.host_id) and not private.meetup_block_exists(a.host_id,p_recipient)))) else true end);
$$;
alter function private.resolve_notification_impl(uuid) rename to resolve_notification_before_strax;
create function private.resolve_notification_impl(p_notification_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); n public.notifications; begin
 select * into n from public.notifications where id=p_notification_id and recipient_id=caller;
 if n.strax_id is null then return private.resolve_notification_before_strax(p_notification_id); end if;
 perform private.strax_actor();
 if not private.message_notification_access(n.id,caller) or not private.strax_visible(n.strax_id,caller,false) then raise exception using errcode='42501',message='notification_unavailable'; end if;
 update public.notifications set read_at=coalesce(read_at,clock_timestamp()) where id=n.id;
 return jsonb_build_object('type','strax','id',n.strax_id);
end $$;
create or replace function public.resolve_notification(notification_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.resolve_notification_impl(notification_id);$$;
create function private.strax_notifications_impl(p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.strax_actor(); begin
 return coalesce((select jsonb_agg(item order by created_at desc,id) from (
 select n.id,n.created_at,jsonb_build_object('id',n.id,'activityId',a.id,'title',a.title,'kind',substring(n.kind from 7),
 'createdAt',n.created_at,'readAt',n.read_at) item from public.notifications n join public.strax_activities a on a.id=n.strax_id
 where n.recipient_id=caller and private.message_notification_access(n.id,caller) and private.strax_visible(a.id,caller,false)
 order by n.created_at desc,n.id limit least(greatest(coalesce(p_limit,50),1),200)) rows),'[]'); end $$;
-- Preserve the established Hittingar-only inbox paging contract. Strax has its
-- own notification reader, so its entries never consume that reader's limit.
create or replace function private.list_notifications_impl(p_limit_count integer) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',n.id,'kind',n.kind,'meetupId',n.meetup_id,'payload',n.payload,'createdAt',n.created_at,'readAt',n.read_at)) order by n.created_at desc,n.id desc),'[]')
 from (select * from public.notifications where private.account_is_active() and recipient_id=(select auth.uid())
 and kind not in ('direct_message','group_message','profile_tap') and strax_id is null
 order by created_at desc,id desc limit least(greatest(coalesce(p_limit_count,50),1),200)) n;
$$;

-- One image uses the established quarantine/claim/finish pipeline. Client bytes
-- cannot be uploaded directly to the private published-media bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('strax-media','strax-media',false,10485760,array['image/jpeg']) on conflict(id) do nothing;
alter table private.media_uploads drop constraint media_uploads_target_type_check;
alter table private.media_uploads add constraint media_uploads_target_type_check check(target_type in ('album','profile_photo','profile_video','message','meetup','meetup_memory','showcase','strax'));
alter table private.media_cleanup_jobs drop constraint media_cleanup_jobs_bucket_check;
alter table private.media_cleanup_jobs add constraint media_cleanup_jobs_bucket_check check(bucket in ('media-quarantine','meetup-media','showcase-media','profile-photos','strax-media'));
alter function private.media_target_available(uuid,text,uuid,uuid) rename to media_target_available_before_strax;
create function private.media_target_available(p_owner uuid,p_type text,p_target uuid,p_album uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when p_type='strax' then private.strax_host_available(p_owner) and exists(select 1 from public.strax_activities a
 where a.id=p_target and a.host_id=p_owner and a.status='active' and a.expires_at>clock_timestamp())
 else private.media_target_available_before_strax(p_owner,p_type,p_target,p_album) end;
$$;
create function private.strax_reserve_media_impl(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.strax_actor(); a public.strax_activities; upload_id uuid:=gen_random_uuid(); existing private.media_uploads; begin
 select * into a from public.strax_activities where id=p_id for update;
 if a.id is null or a.host_id<>caller or not private.strax_visible(a.id,caller,true) then raise exception using errcode='42501',message='strax_unavailable'; end if;
 if exists(select 1 from private.strax_media where activity_id=a.id) then raise exception using errcode='23514',message='strax_photo_limit'; end if;
 select * into existing from private.media_uploads where target_type='strax' and target_id=a.id and owner_id=caller and status in ('reserved','processing','appealed') and expires_at>clock_timestamp() order by created_at desc limit 1;
 if existing.id is not null then return jsonb_build_object('id',existing.id,'bucket','media-quarantine','path',existing.object_path,'expiresAt',existing.expires_at); end if;
 insert into private.media_uploads(id,owner_id,target_type,target_id,media_type,object_path,expires_at,metadata)
 values(upload_id,caller,'strax',a.id,'image',caller::text||'/'||upload_id::text,least(a.expires_at,clock_timestamp()+interval '1 hour'),'{}');
 return jsonb_build_object('id',upload_id,'bucket','media-quarantine','path',caller::text||'/'||upload_id::text,'expiresAt',least(a.expires_at,clock_timestamp()+interval '1 hour'));
end $$;
alter function private.reserve_media_upload_impl(text,uuid,text,jsonb) rename to reserve_media_upload_before_strax;
create function private.reserve_media_upload_impl(p_type text,p_target uuid,p_kind text,p_metadata jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_type<>'strax' then return private.reserve_media_upload_before_strax(p_type,p_target,p_kind,p_metadata); end if;
 if p_kind is distinct from 'image' or p_metadata is null or jsonb_typeof(p_metadata)<>'object' or p_metadata-array['tags']<>'{}'::jsonb
 or p_metadata ? 'tags' and p_metadata->'tags'<>'[]'::jsonb then raise exception using errcode='22023',message='invalid_media_metadata'; end if;
 return private.strax_reserve_media_impl(p_target); end $$;
create or replace function public.reserve_media_upload(target_type text,target_id uuid,media_type text,metadata jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select private.reserve_media_upload_impl(target_type,target_id,media_type,metadata);$$;
alter function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) rename to finish_media_before_strax;
create function private.finish_media_impl(p_id uuid,p_claim uuid,p_bytes integer,p_duration integer,p_path text,p_thumbnail text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare job private.media_uploads; begin
 perform private.require_service_role();
 select * into job from private.media_uploads where id=p_id;
 if job.id is null or job.target_type<>'strax' then return private.finish_media_before_strax(p_id,p_claim,p_bytes,p_duration,p_path,p_thumbnail,p_reason); end if;
 -- Lock activity before upload consistently with reservation/deletion.
 perform 1 from public.strax_activities where id=job.target_id for update;
 select * into job from private.media_uploads where id=p_id for update;
 if p_claim is null or job.claim_id is distinct from p_claim or job.status<>'processing' or job.expires_at<=clock_timestamp() then return false; end if;
 if not private.media_target_available(job.owner_id,'strax',job.target_id,null) then
  update private.media_uploads set status='rejected',rejection_reason='media_target_unavailable',claim_id=null where id=job.id; return false; end if;
 if p_reason is not null then update private.media_uploads set status='rejected',rejection_reason=p_reason,claim_id=null where id=job.id; return true; end if;
 if job.media_type<>'image' or p_path is distinct from job.target_id::text||'/'||job.id::text||'.jpg' or p_thumbnail is not null or p_duration is not null
 or p_bytes is null or p_bytes not between 1 and 10485760 then raise exception using errcode='22023',message='invalid_verified_media'; end if;
 insert into private.strax_media(id,activity_id,owner_id,storage_path) values(job.id,job.target_id,job.owner_id,p_path);
 update private.media_uploads set status='approved',verified_bytes=p_bytes,normalized_path=p_path,claim_id=null where id=job.id;
 insert into private.media_cleanup_jobs(bucket,name) values('media-quarantine',job.object_path) on conflict do nothing;
 return true;
end $$;
create or replace function public.finish_media_upload(job_id uuid,claim_id uuid,byte_size integer,duration_ms integer,object_path text,thumbnail_path text,rejection_reason text) returns boolean
language sql security invoker set search_path='' as $$select private.finish_media_impl(job_id,claim_id,byte_size,duration_ms,object_path,thumbnail_path,rejection_reason);$$;
create function private.strax_can_read_media(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select p_bucket='strax-media' and exists(select 1 from private.strax_media m join private.media_uploads u on u.id=m.id and u.status='approved'
 where m.storage_path=p_path and private.strax_visible(m.activity_id,(select auth.uid()),true));
$$;
-- Authenticated clients cannot mint their own arbitrary-lifetime signed URLs.
-- The Strax media Edge endpoint authorizes with the viewer RPC, then signs with
-- the service role and rejects any URL whose JWT expiry exceeds this deadline.
create policy strax_media_server_only on storage.objects as restrictive for select to authenticated
using(bucket_id<>'strax-media');
create function private.strax_media_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into private.media_cleanup_jobs(bucket,name) values('strax-media',old.storage_path) on conflict do nothing; return old; end $$;
create trigger strax_media_cleanup after delete on private.strax_media for each row execute function private.strax_media_cleanup();
create function private.strax_upload_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
declare item private.media_uploads; available timestamptz; begin
 item:=case when tg_op='DELETE' then old else new end;
 if item.target_type<>'strax' then return item; end if;
 if tg_op='DELETE' or item.status='rejected' then
  available:=greatest(clock_timestamp(),case when old.status='processing' then old.expires_at else clock_timestamp() end);
  insert into private.media_cleanup_jobs(bucket,name,available_at) values('strax-media',item.target_id::text||'/'||item.id::text||'.jpg',available) on conflict do nothing;
  if tg_op='DELETE' or item.rejection_reason in ('strax_deleted','upload_cancelled','media_target_unavailable') then
   insert into private.media_cleanup_jobs(bucket,name,available_at) values('media-quarantine',item.object_path,available) on conflict do nothing;
  end if;
 end if; return item;
end $$;
create trigger strax_upload_cleanup after update of status or delete on private.media_uploads for each row execute function private.strax_upload_cleanup();
create function private.strax_delete_uploads() returns trigger language plpgsql security definer set search_path='' as $$
begin update private.media_uploads set status='rejected',rejection_reason='strax_deleted',claim_id=null
 where target_type='strax' and target_id=old.id and status in ('reserved','processing','appealed'); return old; end $$;
create trigger strax_delete_uploads before delete on public.strax_activities for each row execute function private.strax_delete_uploads();

-- Preserve moderation evidence when the host deletes their account or the
-- configured retention worker eventually removes an expired activity.
alter table public.reports add column strax_id uuid references public.strax_activities(id) on delete set null deferrable initially deferred,
 add column strax_snapshot jsonb;
create index reports_strax on public.reports(strax_id) where strax_id is not null;
alter table public.reports add constraint reports_strax_snapshot check(strax_id is null or strax_snapshot is not null and jsonb_typeof(strax_snapshot)='object');
create function private.strax_report_impl(p_id uuid,p_category text,p_details text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.strax_actor(); a public.strax_activities; result uuid; begin
 select * into a from public.strax_activities where id=p_id;
 if a.id is null or a.host_id=caller or not private.strax_visible(a.id,caller,false) then raise exception using errcode='42501',message='strax_unavailable'; end if;
 if p_category is null or p_category not in ('minor_suspected','csam','threat','ncii','harassment','coercion_non_consent','dangerous_location','misrepresentation','hate_discrimination','spam_advertising','trafficking_exploitation','illegal_activity','compensated_sexual_services','other')
 or p_details is null or char_length(p_details)>2000 then raise exception using errcode='22023',message='invalid_strax_report'; end if;
 perform private.consume_write_quota('strax_report',10,interval '1 hour');
 insert into public.reports(reporter_id,reported_id,category,details,strax_id,strax_snapshot)
 values(caller,a.host_id,p_category,btrim(p_details),a.id,jsonb_build_object('id',a.id,'hostId',a.host_id,'title',a.title,'description',a.description,
 'locationText',a.location_text,'address',a.address,'requirements',a.requirements,'joinMode',a.join_mode,'spacesNeeded',a.spaces_needed,
 'createdAt',a.created_at,'expiresAt',a.expires_at,'capturedAt',clock_timestamp(),'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'storagePath',m.storage_path)) from private.strax_media m where activity_id=a.id),'[]'))) returning id into result;
 return result;
end $$;
create function private.admin_moderate_strax_impl(p_id uuid,p_action text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare a public.strax_activities; begin
 perform private.require_staff();
 if p_reason is null or char_length(btrim(p_reason)) not between 8 and 1000 or p_action is null or p_action not in ('hide','restore') then raise exception using errcode='22023',message='invalid_strax_moderation'; end if;
 select * into a from public.strax_activities where id=p_id;
 perform 1 from public.profiles where id=a.host_id for update;
 select * into a from public.strax_activities where id=p_id for update;
 if a.id is null then raise exception using errcode='P0002',message='strax_not_found'; end if;
 if p_action='restore' then
  if a.status<>'moderation_hidden' or a.expires_at<=clock_timestamp() or not private.strax_host_available(a.host_id) then raise exception using errcode='23514',message='strax_restore_unavailable'; end if;
  if coalesce(a.moderation_previous_status,'active')='active' and exists(select 1 from public.strax_activities where host_id=a.host_id and id<>a.id and status='active' and expires_at>clock_timestamp()) then raise exception using errcode='23514',message='strax_already_active'; end if;
 end if;
 update public.strax_activities set status=case p_action when 'hide' then 'moderation_hidden' else coalesce(a.moderation_previous_status,'active') end,
 moderation_previous_status=case when p_action='hide' and a.status<>'moderation_hidden' then a.status else a.moderation_previous_status end,
 moderation_reason=btrim(p_reason) where id=p_id;
 insert into private.admin_audit_log(actor_id,action,target_type,target_id,details) values((select auth.uid()),'strax_'||p_action,'strax',p_id::text,jsonb_build_object('reason',btrim(p_reason)));
end $$;
alter function private.account_owns_stored_object(uuid,text,text,text) rename to account_owns_stored_object_before_strax;
create function private.account_owns_stored_object(p_account uuid,p_bucket text,p_name text,p_owner text) returns boolean language sql stable security definer set search_path='' as $$
 select private.account_owns_stored_object_before_strax(p_account,p_bucket,p_name,p_owner) or p_bucket='strax-media' and exists(select 1 from private.media_uploads u
 where u.owner_id=p_account and u.target_type='strax' and p_name=u.target_id::text||'/'||u.id::text||'.jpg');
$$;
alter function private.owns_export_media(text,text,text) rename to owns_export_media_before_strax;
create function private.owns_export_media(p_bucket text,p_name text,p_owner text) returns boolean language sql stable security definer set search_path='' as $$
 select private.owns_export_media_before_strax(p_bucket,p_name,p_owner) or p_bucket='strax-media' and exists(select 1 from private.strax_media m where m.owner_id=(select auth.uid()) and p_name=m.storage_path);
$$;
alter function private.export_account_impl() rename to export_account_before_strax;
create function private.export_account_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 return private.export_account_before_strax()||jsonb_build_object(
 'straxActivities',coalesce((select jsonb_agg(to_jsonb(a)-'request_input') from public.strax_activities a where a.host_id=caller),'[]'),
 'straxParticipations',coalesce((select jsonb_agg(to_jsonb(p)) from private.strax_participations p where p.profile_id=caller),'[]'),
 'straxShares',coalesce((select jsonb_agg(to_jsonb(s)) from private.strax_shares s join public.strax_activities a on a.id=s.activity_id where a.host_id=caller),'[]'),
 'straxMedia',coalesce((select jsonb_agg(to_jsonb(m)) from private.strax_media m where m.owner_id=caller),'[]')); end $$;
alter view private.recoverable_media rename to recoverable_media_before_strax;
create view private.recoverable_media as select * from private.recoverable_media_before_strax
 union select 'strax-media'::text,m.storage_path,m.owner_id from private.strax_media m join private.media_uploads u on u.id=m.id
 where u.status='approved' and private.memory_actor_active(m.owner_id);
revoke all on private.recoverable_media,private.recoverable_media_before_strax from public,anon,authenticated,service_role;

create function private.strax_lifecycle() returns jsonb language plpgsql security definer set search_path='' as $$
declare expired_count integer; purged_count integer:=0; config private.strax_retention_config; begin
 perform private.require_service_role();
 update public.strax_activities set status='expired' where status='active' and expires_at<=clock_timestamp(); get diagnostics expired_count=row_count;
 select * into config from private.strax_retention_config where id;
 if config.purge_enabled and config.policy_approved_at is not null and config.standard_retention is not null then
  delete from public.strax_activities a where a.expires_at<clock_timestamp()-config.standard_retention
  and not exists(select 1 from private.strax_retention r where r.activity_id=a.id and r.legal_hold_at is not null)
  and not exists(select 1 from public.reports r where r.strax_id=a.id and (r.status in ('open','in_review') or config.reported_retention is null or r.created_at>=clock_timestamp()-config.reported_retention));
  get diagnostics purged_count=row_count;
 end if;
 return jsonb_build_object('straxExpired',expired_count,'straxPurged',purged_count); end $$;
alter function private.process_hittumst_lifecycle_impl() rename to process_hittumst_lifecycle_before_strax;
create function private.process_hittumst_lifecycle_impl() returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.require_service_role(); return private.process_hittumst_lifecycle_before_strax()||private.strax_lifecycle(); end $$;
create or replace function public.process_hittumst_lifecycle() returns jsonb language sql security invoker set search_path='' as $$select private.process_hittumst_lifecycle_impl();$$;

create function public.strax_create(input jsonb,p_request_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.strax_create_impl(input,p_request_id);$$;
create function public.strax_get(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.strax_get_impl(p_id);$$;
create function public.strax_discover() returns jsonb language sql stable security invoker set search_path='' as $$select private.strax_discover_impl();$$;
create function public.strax_count() returns jsonb language sql stable security invoker set search_path='' as $$select private.strax_count_impl();$$;
create function public.strax_mine() returns jsonb language sql stable security invoker set search_path='' as $$select private.strax_mine_impl();$$;
create function public.strax_profile_badges(p_profile_ids uuid[]) returns jsonb language sql stable security invoker set search_path='' as $$select private.strax_profile_badges_impl(p_profile_ids);$$;
create function public.strax_participate(p_id uuid,p_action text,p_introduction text default '',p_acknowledged boolean default false) returns jsonb language sql security invoker set search_path='' as $$select private.strax_participate_impl(p_id,p_action,p_introduction,p_acknowledged);$$;
create function public.strax_respond(p_id uuid,p_profile_id uuid,p_action text) returns jsonb language sql security invoker set search_path='' as $$select private.strax_respond_impl(p_id,p_profile_id,p_action);$$;
create function public.strax_roster(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.strax_roster_impl(p_id);$$;
create function public.strax_close(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.strax_close_impl(p_id);$$;
create function public.strax_share(p_id uuid,p_all_friends boolean default false,p_friend_ids uuid[] default '{}',p_group_ids uuid[] default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.strax_share_impl(p_id,p_all_friends,p_friend_ids,p_group_ids);$$;
create function public.strax_reserve_media(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.strax_reserve_media_impl(p_id);$$;
create function public.strax_report(p_id uuid,p_category text,p_details text default '') returns uuid language sql security invoker set search_path='' as $$select private.strax_report_impl(p_id,p_category,p_details);$$;
create function public.strax_notifications(p_limit integer default 50) returns jsonb language sql stable security invoker set search_path='' as $$select private.strax_notifications_impl(p_limit);$$;
create function public.admin_moderate_strax(p_id uuid,p_action text,p_reason text) returns void language sql security invoker set search_path='' as $$select private.admin_moderate_strax_impl(p_id,p_action,p_reason);$$;

-- Public wrappers are invokers; only actor-checking implementations and the two
-- RLS predicates are directly executable. Renamed bypass paths remain internal.
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and (p.proname like 'strax_%' or p.proname='admin_moderate_strax' or p.proname='admin_moderate_strax_impl'
 or p.proname in ('list_group_messages_page_impl','list_group_messages_page_before_strax','message_notification_access','message_notification_access_before_strax',
 'resolve_notification_impl','resolve_notification_before_strax','media_target_available','media_target_available_before_strax','reserve_media_upload_impl','reserve_media_upload_before_strax',
 'finish_media_impl','finish_media_before_strax','account_owns_stored_object','account_owns_stored_object_before_strax','owns_export_media','owns_export_media_before_strax',
 'export_account_impl','export_account_before_strax','process_hittumst_lifecycle_impl','process_hittumst_lifecycle_before_strax')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
  if fn.nspname='public' or fn.proname like 'strax_%_impl' or fn.proname in ('strax_visible','admin_moderate_strax_impl',
   'list_group_messages_page_impl','resolve_notification_impl','reserve_media_upload_impl','export_account_impl') then
   execute format('grant execute on function %s to authenticated',fn.signature); end if;
  if fn.proname in ('finish_media_impl','process_hittumst_lifecycle_impl') then execute format('grant execute on function %s to service_role',fn.signature); end if;
 end loop;
end $$;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.strax_activities;
 end if;
end $$;
notify pgrst,'reload schema';
