-- Permanent Ferðalest groups. Private by default; publishing metadata never
-- publishes messages, membership, precise locations or group media.
create table private.trains (
 group_id uuid primary key references public.groups(id) on delete cascade,
 symbol text not null default '🚂' check(char_length(symbol) between 1 and 16),
 visibility text not null default 'private' check(visibility in ('private','public')),
 pool_enabled boolean not null default false,
 amount_per_event integer not null default 0 check(amount_per_event between 0 and 100000),
 monthly_cap integer not null default 0 check(monthly_cap between 0 and 1000000),
 sandbox_balance integer not null default 0 check(sandbox_balance between 0 and 10000000)
);
create table private.train_plans (
 group_id uuid references private.trains(group_id) on delete cascade,
 meetup_id uuid references public.meetups(id) on delete cascade,
 recommended_by uuid references public.profiles(id) on delete set null,
 note text not null default '' check(char_length(note)<=1000),
 created_at timestamptz not null default now(), primary key(group_id,meetup_id)
);
create table private.train_going (
 group_id uuid, meetup_id uuid, profile_id uuid references public.profiles(id) on delete cascade,
 primary key(group_id,meetup_id,profile_id),
 foreign key(group_id,meetup_id) references private.train_plans(group_id,meetup_id) on delete cascade
);
create table private.train_locations (
 group_id uuid references private.trains(group_id) on delete cascade,
 profile_id uuid references public.profiles(id) on delete cascade,
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 recipients uuid[] not null,
 expires_at timestamptz not null, updated_at timestamptz not null default now(),
 primary key(group_id,profile_id)
);
create table private.train_pool_allocations (
 group_id uuid references private.trains(group_id) on delete cascade,
 meetup_id uuid references public.meetups(id) on delete cascade,
 amount integer not null check(amount>0), created_at timestamptz not null default now(),
 primary key(group_id,meetup_id)
);
create table private.train_pool_deposits (
 request_id uuid primary key, group_id uuid references private.trains(group_id) on delete cascade,
 profile_id uuid references public.profiles(id) on delete cascade,
 amount integer not null check(amount between 1 and 100000), created_at timestamptz not null default now()
);
alter table private.trains enable row level security;
alter table private.train_plans enable row level security;
alter table private.train_going enable row level security;
alter table private.train_locations enable row level security;
alter table private.train_pool_allocations enable row level security;
alter table private.train_pool_deposits enable row level security;
revoke all on private.trains,private.train_plans,private.train_going,private.train_locations,private.train_pool_allocations,private.train_pool_deposits from public,anon,authenticated;
create index train_going_profile on private.train_going(profile_id);
create index train_locations_expiry on private.train_locations(expires_at);
create index train_public on private.trains(group_id) where visibility='public';

create function private.train_summary(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',g.id,'name',g.name,'bio',g.bio,'symbol',t.symbol,'visibility',t.visibility,
 'role',m.role,'membershipStatus',m.status,'status',g.status,
 'memberCount',(select count(*) from public.group_members where group_id=g.id and status='active'))
 from private.trains t join public.groups g on g.id=t.group_id
 left join public.group_members m on m.group_id=g.id and m.profile_id=(select auth.uid()) and m.status in ('active','invited')
 where g.id=p_id and g.status<>'removed' and (m.profile_id is not null or t.visibility='public')
 and not private.meetup_block_exists((select auth.uid()),g.owner_id);
$$;

create function private.train_command_impl(p_action text,p_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); member_role text; v_id uuid; v_event uuid; v_recipients uuid[];
 settings private.trains; v_amount integer; v_spent integer; result jsonb; v_request uuid;
begin
 if not private.current_user_is_ready(false) then raise exception using errcode='42501',message='active_account_required'; end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or pg_column_size(p_input)>16384 then raise exception 'invalid_train_input'; end if;
 if p_action='list' then
   select coalesce(jsonb_agg(item),'[]') into result from (
    select private.train_summary(t.group_id) item from private.trains t join public.groups g on g.id=t.group_id
    where g.status<>'removed' and (t.visibility='public' or exists(select 1 from public.group_members m where m.group_id=t.group_id and m.profile_id=caller and m.status in ('active','invited')))
    order by exists(select 1 from public.group_members m where m.group_id=t.group_id and m.profile_id=caller and m.status in ('active','invited')) desc,g.updated_at desc limit 100
   ) q where item is not null;
   return result;
 elsif p_action='create' then
   v_id:=private.create_group_impl(p_input->>'name',coalesce(p_input->>'bio',''),null);
   insert into private.trains(group_id,symbol,visibility) values(v_id,coalesce(p_input->>'symbol','🚂'),coalesce(p_input->>'visibility','private'));
   return to_jsonb(v_id);
 end if;
 select * into settings from private.trains where group_id=p_id for update;
 if not found then raise exception using errcode='42501',message='train_unavailable'; end if;
 member_role:=private.group_member_role(p_id,caller);
 if p_action='join' and member_role is null then
   perform 1 from public.groups where id=p_id and status='active' for update;
   if not found or settings.visibility<>'public' then raise exception 'public_train_required'; end if;
   if exists(select 1 from private.group_blocks where group_id=p_id and profile_id=caller)
    or exists(select 1 from public.group_members where group_id=p_id and status='active' and private.meetup_block_exists(caller,profile_id)) then raise exception using errcode='42501',message='group_member_blocked'; end if;
   if (select count(*) from public.group_members where group_id=p_id and status in ('active','invited'))>=100 then raise exception 'group_capacity_reached'; end if;
   perform private.consume_write_quota('train_join',20,interval '1 hour');
   insert into public.group_members(group_id,profile_id,role,status) values(p_id,caller,'member','active')
    on conflict(group_id,profile_id) do update set role='member',status='active',updated_at=now();
   return '{}'::jsonb;
 elsif p_action='join' and member_role is not null then return '{}'::jsonb;
 end if;
 if member_role is null then raise exception using errcode='42501',message='active_group_membership_required'; end if;
 if p_action='get' then
  delete from private.train_locations where group_id=p_id and expires_at<=now();
  return jsonb_build_object('train',private.train_summary(p_id),
   'plans',coalesce((select jsonb_agg(jsonb_build_object('meetupId',r.meetup_id,'title',m.title,'note',r.note,'recommendedBy',coalesce(r.recommended_by::text,'deleted'),'createdAt',r.created_at,
    'going',coalesce((select jsonb_agg(a.profile_id) from private.train_going a where a.group_id=p_id and a.meetup_id=r.meetup_id and private.group_member_role(p_id,a.profile_id) is not null and not private.meetup_block_exists(caller,a.profile_id)),'[]')) order by r.created_at desc)
    from private.train_plans r join public.meetups m on m.id=r.meetup_id where r.group_id=p_id
    and (r.recommended_by is null or not private.meetup_block_exists(caller,r.recommended_by))
    and m.status='published' and private.community_event_visible(m.id,caller)),'[]'),
   'locations',coalesce((select jsonb_agg(jsonb_build_object('profileId',l.profile_id,'displayName',p.display_name,'latitude',l.latitude,'longitude',l.longitude,'expiresAt',l.expires_at,'updatedAt',l.updated_at))
    from private.train_locations l join public.profiles p on p.id=l.profile_id where l.group_id=p_id and l.expires_at>now() and (l.profile_id=caller or caller=any(l.recipients))
    and private.group_member_role(p_id,l.profile_id) is not null and not private.meetup_block_exists(caller,l.profile_id)),'[]'),
   'pool',jsonb_build_object('enabled',settings.pool_enabled,'amountPerEvent',settings.amount_per_event,'monthlyCap',settings.monthly_cap,'balance',settings.sandbox_balance,'sandbox',true,
    'allocations',coalesce((select jsonb_agg(jsonb_build_object('meetupId',meetup_id,'amount',amount)) from private.train_pool_allocations where group_id=p_id),'[]')));
 end if;
 if p_action='stop_location' then delete from private.train_locations where group_id=p_id and profile_id=caller; return '{}'::jsonb; end if;
 if not exists(select 1 from public.groups where id=p_id and status='active') then raise exception 'group_not_active'; end if;
 perform private.consume_write_quota('train_command',60,interval '1 minute');
 if p_action='update' then
   if member_role not in ('owner','admin') then raise exception using errcode='42501',message='group_admin_required'; end if;
   update public.groups set name=p_input->>'name',bio=coalesce(p_input->>'bio',''),updated_at=now() where id=p_id;
   update private.trains set symbol=p_input->>'symbol',visibility=p_input->>'visibility' where group_id=p_id;
 elsif p_action='recommend' then
   v_event:=(p_input->>'meetupId')::uuid;
   perform private.get_meetup_impl(v_event);
   if not exists(select 1 from public.meetups where id=v_event and status='published' and private.community_event_visible(id,caller)) then raise exception 'public_meetup_required'; end if;
   if (select count(*) from private.train_plans where group_id=p_id)>=100 then raise exception 'train_plan_limit'; end if;
   insert into private.train_plans(group_id,meetup_id,recommended_by,note) values(p_id,v_event,caller,coalesce(p_input->>'note','')) on conflict do nothing;
 elsif p_action='going' then
   v_event:=(p_input->>'meetupId')::uuid;
   if coalesce((p_input->>'going')::boolean,false) then
     perform private.get_meetup_impl(v_event);
     insert into private.train_going(group_id,meetup_id,profile_id) values(p_id,v_event,caller) on conflict do nothing;
   else delete from private.train_going where group_id=p_id and meetup_id=v_event and profile_id=caller; end if;
 elsif p_action='location' then
   if coalesce((p_input->>'minutes')::integer,0) not in (15,60) then raise exception 'invalid_location_duration'; end if;
   if p_input->'recipients'='null'::jsonb then
     select coalesce(array_agg(profile_id),'{}') into v_recipients from public.group_members where group_id=p_id and status='active' and profile_id<>caller and not private.meetup_block_exists(caller,profile_id);
   else
     select array_agg(value::uuid) into v_recipients from jsonb_array_elements_text(p_input->'recipients');
     if cardinality(v_recipients) is null or cardinality(v_recipients) not between 1 and 100 or exists(select 1 from unnest(v_recipients) r where private.group_member_role(p_id,r) is null or private.meetup_block_exists(caller,r)) then raise exception 'invalid_location_recipients'; end if;
   end if;
   insert into private.train_locations(group_id,profile_id,latitude,longitude,recipients,expires_at) values(p_id,caller,(p_input->>'latitude')::double precision,(p_input->>'longitude')::double precision,v_recipients,now()+make_interval(mins=>(p_input->>'minutes')::integer))
   on conflict(group_id,profile_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,recipients=excluded.recipients,expires_at=excluded.expires_at,updated_at=now();
 elsif p_action in ('pool_settings','pool_deposit') then
   -- Existing commerce has no production custody provider. This ledger is
   -- explicitly sandbox-only, separate from wallets and never cash-equivalent.
   if not exists(select 1 from private.commerce_configuration where mode='sandbox') then raise exception 'train_pool_provider_unavailable'; end if;
   if p_action='pool_settings' then
     if member_role<>'owner' then raise exception using errcode='42501',message='group_owner_required'; end if;
     update private.trains set pool_enabled=coalesce((p_input->>'enabled')::boolean,false),amount_per_event=(p_input->>'amountPerEvent')::integer,monthly_cap=(p_input->>'monthlyCap')::integer where group_id=p_id;
   else
     v_amount:=(p_input->>'amount')::integer; v_request:=(p_input->>'requestId')::uuid;
     if exists(select 1 from private.train_pool_deposits where request_id=v_request) then
       if not exists(select 1 from private.train_pool_deposits where request_id=v_request and group_id=p_id and profile_id=caller and amount=v_amount) then raise exception 'deposit_id_conflict'; end if;
       return '{}'::jsonb;
     end if;
     insert into private.train_pool_deposits(request_id,group_id,profile_id,amount) values(v_request,p_id,caller,v_amount);
     update private.trains set sandbox_balance=sandbox_balance+v_amount where group_id=p_id;
   end if;
 else raise exception 'unknown_train_action'; end if;
 -- Sandbox simulation: a planned public gathering receives at most one
 -- allocation. No per-member duplicate spending; lock serializes requests.
 if p_action in ('going','pool_settings','pool_deposit') and exists(select 1 from private.commerce_configuration where mode='sandbox') then
   select * into settings from private.trains where group_id=p_id;
   select coalesce(sum(amount),0) into v_spent from private.train_pool_allocations where group_id=p_id and created_at>=date_trunc('month',now() at time zone 'Atlantic/Reykjavik') at time zone 'Atlantic/Reykjavik';
   for v_event in select distinct a.meetup_id from private.train_going a join public.meetups m on m.id=a.meetup_id
     where a.group_id=p_id and private.group_member_role(p_id,a.profile_id) is not null and m.status='published' and m.starts_at>now() and private.community_event_visible(m.id,caller)
     and not exists(select 1 from private.train_pool_allocations x where x.group_id=p_id and x.meetup_id=a.meetup_id) order by a.meetup_id
   loop
     if settings.pool_enabled and settings.amount_per_event>0 and settings.sandbox_balance>=settings.amount_per_event and v_spent+settings.amount_per_event<=settings.monthly_cap then
       insert into private.train_pool_allocations(group_id,meetup_id,amount) values(p_id,v_event,settings.amount_per_event);
       settings.sandbox_balance:=settings.sandbox_balance-settings.amount_per_event; v_spent:=v_spent+settings.amount_per_event;
       update private.trains set sandbox_balance=settings.sandbox_balance where group_id=p_id;
     end if;
   end loop;
 end if;
 return '{}'::jsonb;
end; $$;
create function public.train_command(action text,group_id uuid default null,input jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select private.train_command_impl(action,group_id,input); $$;
revoke all on function private.train_summary(uuid),private.train_command_impl(text,uuid,jsonb),public.train_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.train_command_impl(text,uuid,jsonb),public.train_command(text,uuid,jsonb) to authenticated;

create function private.revoke_train_shares() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'active' then
   delete from private.train_locations where group_id=new.group_id and profile_id=new.profile_id;
   update private.train_locations set recipients=array_remove(recipients,new.profile_id) where group_id=new.group_id and new.profile_id=any(recipients);
   delete from private.train_going where group_id=new.group_id and profile_id=new.profile_id;
 end if;
 return new;
end; $$;
create trigger revoke_train_shares after update of status on public.group_members for each row execute function private.revoke_train_shares();
revoke all on function private.revoke_train_shares() from public,anon,authenticated;

-- Internal candidate query is never directly callable by clients.
create or replace function private.discover_candidates_impl(filters jsonb, cursor jsonb)
returns table (
  profile_id uuid, display_name text, age smallint, pronouns text, identity_tags text[], looking_for text[],
  profile_tags text[], bio text, region text, photo_paths text[], distance_band text, is_online boolean,
  result_cursor jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  caller uuid := (select auth.uid()); requester_location extensions.geography(point, 4326);
  safe_filters jsonb := coalesce(filters, '{}'); page_size integer := 30; min_age integer := 18; max_age integer := 99;
  cursor_band integer := -1; cursor_profile uuid := '00000000-0000-0000-0000-000000000000';
  identity_filter text[]; intent_filter text[]; tag_filter text[]; online_only boolean := false; activity_filter text; radius_km numeric; rank_cursor integer := -1;
begin
  perform private.validate_discovery_extensions(safe_filters);
  activity_filter:=coalesce(safe_filters->>'activity',case when safe_filters->>'online_only'='true' then 'now' else 'all' end);
  radius_km:=(safe_filters->>'radiusKm')::numeric;
  if not private.discovery_enabled() and (radius_km is not null or activity_filter not in ('all','now') or coalesce(safe_filters->>'social','all')<>'all' or coalesce(jsonb_array_length(safe_filters->'genders'),0)>0 or coalesce(jsonb_array_length(safe_filters->'diagnosisIds'),0)>0) then raise exception 'discovery_release_disabled'; end if;
  if jsonb_typeof(safe_filters) <> 'object' then raise exception using errcode = '22023', message = 'filters_must_be_an_object'; end if;
  if not private.current_user_is_ready(true) then raise exception using errcode = '42501', message = 'fresh_iceland_location_required'; end if;
  select l.cell_center into requester_location from private.private_locations l
  where l.profile_id = caller and l.verified_at >= now() - interval '15 minutes';
  begin
    page_size := least(greatest(coalesce((safe_filters ->> 'limit')::integer, 30), 1), 120);
    min_age := least(greatest(coalesce((safe_filters ->> 'min_age')::integer, 18), 18), 99);
    max_age := least(greatest(coalesce((safe_filters ->> 'max_age')::integer, 99), 18), 99);
    online_only := coalesce((safe_filters ->> 'online_only')::boolean, false);
  exception when invalid_text_representation then raise exception using errcode = '22023', message = 'invalid_filter_value'; end;
  if min_age > max_age then raise exception using errcode = '22023', message = 'invalid_age_range'; end if;
  if safe_filters ? 'identities' then select coalesce(array_agg(value), '{}') into identity_filter from jsonb_array_elements_text(safe_filters -> 'identities') value; end if;
  if safe_filters ? 'intents' then select coalesce(array_agg(value), '{}') into intent_filter from jsonb_array_elements_text(safe_filters -> 'intents') value; end if;
  if safe_filters ? 'tags' then
    if jsonb_typeof(safe_filters -> 'tags') <> 'array' then raise exception using errcode = '22023', message = 'tags_must_be_an_array'; end if;
    select coalesce(array_agg(value), '{}') into tag_filter from jsonb_array_elements_text(safe_filters -> 'tags') value;
    if cardinality(tag_filter) > 3 then raise exception using errcode = '22023', message = 'too_many_tag_filters'; end if;
  end if;
  if cursor is not null then
    begin rank_cursor:=coalesce((cursor->>'activity_rank')::integer,-1); cursor_band := coalesce((cursor ->> 'band_rank')::integer, -1); cursor_profile := coalesce((cursor ->> 'profile_id')::uuid, cursor_profile);
    exception when invalid_text_representation then raise exception using errcode = '22023', message = 'invalid_cursor'; end;
  end if;
  return query
  with candidates as (
    select p.id, p.display_name, extract(year from age(current_date, p.date_of_birth))::smallint calculated_age,
      p.pronouns, p.identity_tags, p.looking_for, p.profile_tags, p.bio, p.region, coalesce(photos.paths, '{}') paths,
      case when l.verified_at is null or l.verified_at < now()-interval '15 minutes' then 5 when extensions.st_distance(l.cell_center, requester_location) < 1000 then 0
        when extensions.st_distance(l.cell_center, requester_location) < 3000 then 1
        when extensions.st_distance(l.cell_center, requester_location) < 10000 then 2
        when extensions.st_distance(l.cell_center, requester_location) < 30000 then 3 else 4 end band_rank,
      p.is_online_status_visible and p.last_active_at > now() - interval '5 minutes' calculated_online,
      case when not private.discovery_enabled() then 0 when not p.is_online_status_visible or p.last_active_at is null then 2 when p.last_active_at>now()-interval '5 minutes' then 0 when p.last_active_at>now()-interval '7 days' then 1 when p.last_active_at>now()-interval '30 days' then 2 else 3 end activity_rank
    from public.profiles p left join private.private_locations l on l.profile_id = p.id
    left join lateral (
      select array_agg(photo.storage_path order by photo.position) paths from public.profile_photos photo
      where photo.profile_id = p.id and photo.approval_status = 'approved'
    ) photos on true
    where (not (safe_filters ? '_allowed_ids') or (safe_filters->'_allowed_ids') ? p.id::text)
      and not (coalesce(safe_filters->'_excluded_ids','[]'::jsonb) ? p.id::text)
      and p.id <> caller and p.display_name is not null and p.date_of_birth <= current_date - interval '18 years'
      and p.onboarding_completed_at is not null and p.special_category_consent_at is not null
      and private.discovery_target_allowed(p.id)
      and (radius_km is null or (l.verified_at>=now()-interval '15 minutes' and extensions.st_dwithin(l.cell_center,requester_location,radius_km*1000)))
      and (coalesce(jsonb_array_length(safe_filters->'genders'),0)=0 or (safe_filters->'genders') ? p.gender)
      and (activity_filter='all' or (p.is_online_status_visible and p.last_active_at>now()-case activity_filter when 'now' then interval '5 minutes' when 'recent' then interval '7 days' else interval '30 days' end))
      and private.discovery_social_matches(p.id,safe_filters->>'social')
      and (coalesce(jsonb_array_length(safe_filters->'diagnosisIds'),0)=0 or exists(select 1 from private.diagnosis_submissions s where s.profile_id=p.id and s.status='approved' and s.consent_at is not null and s.discoverable and (safe_filters->'diagnosisIds') ? s.diagnosis_id))
      and p.moderation_status <> 'banned' and (p.moderation_status <> 'suspended' or p.suspended_until <= now())
      and not exists (select 1 from public.blocks b where
        (b.blocker_id = caller and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = caller))
  ), filtered as (
    select * from candidates c where c.calculated_age between min_age and max_age
      and private.matches_discovery_identity_groups(c.identity_tags, identity_filter)
      and (intent_filter is null or cardinality(intent_filter) = 0 or c.looking_for && intent_filter)
      and (tag_filter is null or cardinality(tag_filter) = 0 or case when private.discovery_enabled() then c.profile_tags && tag_filter else c.profile_tags @> tag_filter end)
      and (not online_only or c.calculated_online)
      and ((c.activity_rank,c.band_rank,c.id) > (rank_cursor,cursor_band,cursor_profile))
  )
  select f.id, f.display_name, f.calculated_age, f.pronouns, f.identity_tags, f.looking_for, f.profile_tags,
    f.bio, f.region, f.paths,
    case f.band_rank when 0 then '<1 km' when 1 then '1-3 km' when 2 then '3-10 km' when 3 then '10-30 km' when 4 then '30+ km' else null end,
    f.calculated_online, jsonb_build_object('activity_rank',f.activity_rank,'band_rank', f.band_rank, 'profile_id', f.id)
  from filtered f order by f.activity_rank, f.band_rank, f.id limit page_size;
end;
$$;

revoke all on function private.discover_candidates_impl(jsonb,jsonb) from public,anon,authenticated;

create table private.discovery_batches (
 profile_id uuid primary key references public.profiles(id) on delete cascade,
 ids uuid[] not null default '{}', excluded_ids uuid[] not null default '{}',
 initialized boolean not null default false, capacity integer not null default 0, refreshed_on date
);
alter table private.discovery_batches enable row level security;
revoke all on private.discovery_batches from public,anon,authenticated;
create function private.discovery_allowance_impl(p_refresh boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); batch private.discovery_batches;
 today date:=(now() at time zone 'Atlantic/Reykjavik')::date; cap integer;
begin
 if not private.current_user_is_ready(true) then raise exception using errcode='42501',message='fresh_iceland_location_required'; end if;
 insert into private.discovery_batches(profile_id) values(caller) on conflict do nothing;
 select * into batch from private.discovery_batches where profile_id=caller for update;
 cap:=case private.member_tier(caller) when 'flottari_plebbi' then 60 when 'plebba_kongur' then 120 else 20 end;
 if p_refresh then
   if batch.refreshed_on=today or not batch.initialized then raise exception 'daily_discovery_refresh_unavailable'; end if;
   update private.discovery_batches set refreshed_on=today,excluded_ids=ids,ids='{}',initialized=false where profile_id=caller;
   batch.refreshed_on:=today;
 end if;
 return jsonb_build_object('limit',cap,'canRefresh',batch.initialized and batch.refreshed_on is distinct from today,
 'nextRefreshAt',((today+1)::timestamp at time zone 'Atlantic/Reykjavik'));
end; $$;
create or replace function private.discover_nearby_impl(filters jsonb,cursor jsonb)
returns table(profile_id uuid,display_name text,age smallint,pronouns text,identity_tags text[],looking_for text[],profile_tags text[],bio text,region text,photo_paths text[],distance_band text,is_online boolean,result_cursor jsonb)
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); batch private.discovery_batches; cap integer; selected_ids uuid[];
 safe_filters jsonb:=coalesce(filters,'{}')-'_allowed_ids'-'_excluded_ids';
begin
 cap:=(private.discovery_allowance_impl(false)->>'limit')::integer;
 select * into batch from private.discovery_batches where discovery_batches.profile_id=caller for update;
 if not batch.initialized or cap>batch.capacity then
   if not batch.initialized then batch.ids:='{}'; end if;
   select coalesce(array_agg(c.profile_id),'{}') into selected_ids from private.discover_candidates_impl(jsonb_build_object('limit',cap-cardinality(batch.ids),'_excluded_ids',to_jsonb(batch.excluded_ids||batch.ids)),null) c;
   update private.discovery_batches set ids=batch.ids||selected_ids,initialized=true,capacity=cap where discovery_batches.profile_id=caller;
   batch.ids:=batch.ids||selected_ids;
 end if;
 -- Filters narrow this saved selection; they never mint a new allowance.
 return query select c.profile_id,c.display_name,c.age,c.pronouns,c.identity_tags,c.looking_for,c.profile_tags,c.bio,c.region,c.photo_paths,c.distance_band,c.is_online,c.result_cursor
 from private.discover_candidates_impl(safe_filters||jsonb_build_object('limit',least(cap,greatest(coalesce((safe_filters->>'limit')::integer,cap),1)),'_allowed_ids',to_jsonb(batch.ids[1:cap])),cursor) c;
end; $$;
create or replace function public.discover_nearby(filters jsonb default '{}',cursor jsonb default null)
returns table(profile_id uuid,display_name text,age smallint,pronouns text,identity_tags text[],looking_for text[],profile_tags text[],bio text,region text,photo_paths text[],distance_band text,is_online boolean,result_cursor jsonb)
language sql security invoker set search_path='' as $$ select * from private.discover_nearby_impl(filters,cursor); $$;
create function public.discovery_allowance(refresh boolean default false) returns jsonb
language sql security invoker set search_path='' as $$ select private.discovery_allowance_impl(refresh); $$;
revoke all on function private.discovery_allowance_impl(boolean),public.discovery_allowance(boolean) from public,anon;
grant execute on function private.discovery_allowance_impl(boolean),public.discovery_allowance(boolean) to authenticated;
notify pgrst,'reload schema';
