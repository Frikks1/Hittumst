-- One combined release. Enable only after the documented privacy, staffing and security gates.
create table private.discovery_release_config (
 id integer primary key check(id=1), enabled boolean not null default false,
 privacy_approved boolean not null default false, reviewers_ready boolean not null default false,
 security_verified boolean not null default false,
 check(not enabled or (privacy_approved and reviewers_ready and security_verified))
);
insert into private.discovery_release_config(id) values(1);
alter table private.discovery_release_config enable row level security;
revoke all on private.discovery_release_config from public,anon,authenticated,service_role;
create function private.discovery_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select enabled and privacy_approved and reviewers_ready and security_verified from private.discovery_release_config where id=1),false);
$$;
create function public.discovery_release_status() returns boolean language sql stable security invoker set search_path='' as $$ select private.discovery_enabled(); $$;

alter table public.profiles add column gender text check(gender in ('man','woman','nonbinary','genderqueer','self_described')),
 add column friends_of_friends_discovery boolean not null default false;
grant update(gender,friends_of_friends_discovery) on public.profiles to authenticated;
create index profiles_discovery_activity on public.profiles(last_active_at desc,id) where is_profile_visible;

create table private.diagnosis_catalog(id text primary key, active boolean not null default true);
insert into private.diagnosis_catalog(id) values('autism'),('adhd'),('schizophrenia');
create table private.diagnosis_submissions (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
 diagnosis_id text not null references private.diagnosis_catalog(id), legal_name text not null check(length(legal_name) between 2 and 160),
 status text not null default 'pending' check(status in ('pending','more_information','approved','rejected','withdrawn','revoked','expired')),
 consent_at timestamptz, discoverable boolean not null default false, object_path text not null unique,
 evidence_ready boolean not null default false, reviewer_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), decided_at timestamptz, purge_at timestamptz not null default now()+interval '30 days',
 reason text check(reason in ('more_info','not_sufficient','policy')), check(not discoverable or (status='approved' and consent_at is not null))
);
create unique index diagnosis_one_open on private.diagnosis_submissions(profile_id,diagnosis_id) where status in ('pending','more_information','approved');
create index diagnosis_owner on private.diagnosis_submissions(profile_id,status);
create index diagnosis_purge on private.diagnosis_submissions(purge_at);
-- Tombstones deliberately outlive deleted accounts so orphaned storage and restored backups are cleaned.
create table private.diagnosis_cleanup (
 object_path text primary key, created_at timestamptz not null default now(),
 claim_id uuid, leased_until timestamptz, attempts integer not null default 0, completed_at timestamptz
);
alter table private.diagnosis_catalog enable row level security;
alter table private.diagnosis_submissions enable row level security;
alter table private.diagnosis_cleanup enable row level security;
revoke all on private.diagnosis_catalog,private.diagnosis_submissions,private.diagnosis_cleanup from public,anon,authenticated,service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('diagnosis-evidence','diagnosis-evidence',false,10485760,array['image/jpeg','image/png']);

create function private.diagnosis_reviewer() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() and coalesce((select raw_app_meta_data @> '{"diagnosis_reviewer":true}'::jsonb from auth.users where id=(select auth.uid())),false);
$$;
create function private.diagnosis_approved(p_profile uuid,p_ids jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select private.discovery_enabled() and exists(
 select 1 from private.diagnosis_submissions s join private.diagnosis_catalog c on c.id=s.diagnosis_id and c.active
 where s.profile_id=p_profile and s.status='approved' and s.consent_at is not null and p_ids ? s.diagnosis_id);
$$;
create function private.diagnosis_restricted(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_array_length(event_profile->'requiredDiagnosisIds')>0,false) from public.meetups where id=p_id;
$$;
create function private.meetup_diagnosis_eligible(p_meetup uuid,p_profile uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(not private.diagnosis_restricted(p_meetup) or
  private.diagnosis_approved(p_profile,(select event_profile->'requiredDiagnosisIds' from public.meetups where id=p_meetup)),false);
$$;
create function private.diagnosis_roster_allowed(p_meetup uuid,p_profile uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not private.diagnosis_restricted(p_meetup) or (
 private.meetup_actor_is_active(p_profile) and private.meetup_diagnosis_eligible(p_meetup,p_profile)
 and exists(select 1 from public.meetups m where m.id=p_meetup
 and (m.host_id=p_profile or exists(select 1 from public.meetup_participations p where p.meetup_id=m.id and p.profile_id=p_profile and p.status in ('joined','approved')))));
$$;
create function private.revoke_diagnosis_participation(p_profile uuid) returns void language plpgsql security definer set search_path='' as $$
declare m record;
begin
 for m in select id,host_id from public.meetups where private.diagnosis_restricted(id) and not private.meetup_diagnosis_eligible(id,p_profile) order by id for update loop
  if m.host_id=p_profile then
   update public.meetups set status='cancelled',cancelled_at=now(),updated_at=now() where id=m.id and status in ('draft','published');
   update public.meetup_participations set status='left',left_at=now(),removed_at=null,updated_at=now() where meetup_id=m.id and status in ('joined','approved');
   update public.meetup_participations set status='withdrawn',left_at=now(),removed_at=null,updated_at=now() where meetup_id=m.id and status='pending';
   delete from public.meetup_room_memberships rm using public.meetup_rooms r where rm.room_id=r.id and r.meetup_id=m.id;
  end if;
  update public.meetup_participations set status=case when status='pending' then 'withdrawn' else 'left' end,left_at=now(),removed_at=null,updated_at=now()
   where meetup_id=m.id and profile_id=p_profile and status in ('pending','joined','approved');
  delete from public.meetup_room_memberships rm using public.meetup_rooms r where rm.room_id=r.id and r.meetup_id=m.id and rm.profile_id=p_profile;
 end loop;
end; $$;

create function private.diagnosis_action_impl(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); s private.diagnosis_submissions; result jsonb; selected_id uuid;
begin
 if not private.current_user_is_ready(false) then raise exception using errcode='42501',message='active_account_required'; end if;
 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'diagnosisId',diagnosis_id,'status',status,'discoverable',discoverable,'createdAt',created_at,'reason',reason) order by created_at desc),'[]') into result from private.diagnosis_submissions where profile_id=caller;
  return result;
 end if;
 if p_action='withdraw' then
  select * into s from private.diagnosis_submissions where id=(p_input->>'id')::uuid and profile_id=caller for update;
  if not found then raise exception 'submission_unavailable'; end if;
  update private.diagnosis_submissions set status='withdrawn',consent_at=null,discoverable=false,legal_name='',purge_at=now() where id=s.id;
  perform private.revoke_diagnosis_participation(caller);
  return '{}'::jsonb;
 end if;
 if not private.discovery_enabled() then raise exception using errcode='42501',message='discovery_release_disabled'; end if;
 if p_action='reserve' then
  if p_input->>'consent' is distinct from 'true' or length(btrim(p_input->>'legalName')) not between 2 and 160
    or not exists(select 1 from private.diagnosis_catalog where id=p_input->>'diagnosisId' and active) then raise exception 'invalid_submission'; end if;
  perform 1 from public.profiles where id=caller for update;
  if (select count(*) from private.diagnosis_submissions where profile_id=caller and created_at>now()-interval '1 day')>=5 then raise exception 'submission_rate_limit'; end if;
  if exists(select 1 from private.diagnosis_submissions where profile_id=caller and diagnosis_id=p_input->>'diagnosisId' and status in ('pending','approved')) then raise exception 'submission_exists'; end if;
  update private.diagnosis_submissions set status='withdrawn',consent_at=null,discoverable=false,legal_name='',purge_at=now() where profile_id=caller and diagnosis_id=p_input->>'diagnosisId' and status='more_information';
  selected_id:=gen_random_uuid();
  insert into private.diagnosis_submissions(id,profile_id,diagnosis_id,legal_name,consent_at,object_path)
   values(selected_id,caller,p_input->>'diagnosisId',btrim(p_input->>'legalName'),now(),caller::text||'/'||selected_id::text);
  return jsonb_build_object('id',selected_id,'path',caller::text||'/'||selected_id::text);
 end if;
 select * into s from private.diagnosis_submissions where id=(p_input->>'id')::uuid and profile_id=caller for update;
 if not found then raise exception 'submission_unavailable'; end if;
 if p_action='submit' then
  if s.status<>'pending' or s.consent_at is null or s.evidence_ready or now()>s.created_at+interval '15 minutes'
   or not exists(select 1 from storage.objects where bucket_id='diagnosis-evidence' and name=s.object_path and (metadata->>'size')::bigint between 1 and 10485760) then raise exception 'evidence_unavailable'; end if;
  update private.diagnosis_submissions set evidence_ready=true where id=s.id;
 elsif p_action='disclosure' then
  if s.status<>'approved' or s.consent_at is null then raise exception 'approval_required'; end if;
  update private.diagnosis_submissions set discoverable=coalesce((p_input->>'enabled')::boolean,false) where id=s.id;
 else raise exception 'invalid_action'; end if;
 return '{}'::jsonb;
end; $$;
-- Empty private name is permitted only after evidence review/erasure.
alter table private.diagnosis_submissions drop constraint diagnosis_submissions_legal_name_check;
alter table private.diagnosis_submissions add check(length(legal_name) between 2 and 160 or (legal_name='' and status in ('approved','withdrawn','revoked','expired','rejected')));

create function private.diagnosis_upload_allowed(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select private.discovery_enabled() and private.current_user_is_ready(false) and exists(
 select 1 from private.diagnosis_submissions s where s.object_path=p_name and s.profile_id=(select auth.uid())
 and s.status='pending' and not s.evidence_ready and s.consent_at is not null and now()<s.created_at+interval '15 minutes');
$$;
create policy diagnosis_evidence_insert on storage.objects for insert to authenticated
 with check(bucket_id='diagnosis-evidence' and private.diagnosis_upload_allowed(name));
-- No member SELECT, UPDATE or DELETE policy: no overwrite or signed/download URL.
create function public.diagnosis_action(action text,input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$
 select private.diagnosis_action_impl(action,input);
$$;

create function private.review_diagnosis_impl(p_action text,p_input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); s private.diagnosis_submissions; result jsonb; decision text:=p_input->>'decision';
begin
 if not private.diagnosis_reviewer() then raise exception using errcode='42501',message='reviewer_required'; end if;
 if p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'diagnosisId',diagnosis_id,'status',status,'createdAt',created_at,'assigned',reviewer_id=caller) order by created_at),'[]') into result
  from private.diagnosis_submissions where profile_id<>caller and evidence_ready and status in ('pending','more_information','approved') and (status='approved' or reviewer_id is null or reviewer_id=caller);
  return result;
 end if;
 select * into s from private.diagnosis_submissions where id=(p_input->>'id')::uuid for update;
 if not found or s.profile_id=caller or s.consent_at is null or not s.evidence_ready then raise exception 'case_unavailable'; end if;
 if p_action='claim' and (s.reviewer_id is null or s.status='approved') then update private.diagnosis_submissions set reviewer_id=caller where id=s.id; s.reviewer_id:=caller; end if;
 if s.reviewer_id is distinct from caller then raise exception using errcode='42501',message='assigned_reviewer_required'; end if;
 if p_action='evidence' then
  if now()>=s.purge_at or exists(select 1 from private.diagnosis_cleanup where object_path=s.object_path) then raise exception 'evidence_expired'; end if;
  result:=jsonb_build_object('path',s.object_path,'name',s.legal_name,'birthDate',(select date_of_birth from public.profiles where id=s.profile_id),'diagnosisId',s.diagnosis_id);
 elsif p_action='decide' then
  if decision not in ('approved','rejected','more_information','revoked') or (s.status='approved' and decision<>'revoked') or s.status not in ('pending','more_information','approved') then raise exception 'invalid_decision'; end if;
  if decision='approved' and (not private.discovery_enabled() or now()>=s.purge_at or p_input->>'checked' is distinct from 'true') then raise exception 'review_checks_required'; end if;
  update private.diagnosis_submissions set status=decision,decided_at=now(),discoverable=false,
   legal_name=case when decision in ('approved','rejected','revoked') then '' else legal_name end,
   purge_at=case when decision='approved' then least(purge_at,now()+interval '24 hours') when decision='revoked' then now() else purge_at end,
   reason=case decision when 'rejected' then 'not_sufficient' when 'more_information' then 'more_info' when 'revoked' then 'policy' else null end
   where id=s.id;
  if decision='revoked' then perform private.revoke_diagnosis_participation(s.profile_id); end if;
  result:='{}';
 elsif p_action='claim' then result:=jsonb_build_object('id',s.id);
 else raise exception 'invalid_action'; end if;
 insert into private.admin_audit_log(actor_id,action,target_type,target_id,details)
 values(caller,'diagnosis_'||p_action,'diagnosis_submission',s.id,jsonb_build_object('decision',case when p_action='decide' then decision else null end));
 return result;
end; $$;
create function public.review_diagnosis(action text,input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.review_diagnosis_impl(action,input);$$;

create function private.queue_diagnosis_erasure() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.diagnosis_cleanup(object_path) values(old.object_path) on conflict(object_path) do update set completed_at=null;
 return old;
end; $$;
create trigger diagnosis_erasure before delete on private.diagnosis_submissions for each row execute function private.queue_diagnosis_erasure();
create function public.claim_diagnosis_cleanup(claim uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; person record;
begin
 if (select auth.role())<>'service_role' then raise exception using errcode='42501',message='worker_required'; end if;
 for person in select distinct profile_id from private.diagnosis_submissions where status in ('pending','more_information') and purge_at<=now() loop
  update private.diagnosis_submissions set status='expired',consent_at=null,discoverable=false,legal_name='' where profile_id=person.profile_id and status in ('pending','more_information') and purge_at<=now();
 end loop;
 insert into private.diagnosis_cleanup(object_path) select object_path from private.diagnosis_submissions where purge_at<=now() on conflict do nothing;
 -- Restore reconciliation: re-delete tombstoned objects if backups reintroduce them.
 update private.diagnosis_cleanup q set completed_at=null where completed_at is not null and exists(select 1 from storage.objects o where o.bucket_id='diagnosis-evidence' and o.name=q.object_path);
 with jobs as (select object_path from private.diagnosis_cleanup where completed_at is null and (leased_until is null or leased_until<now()) order by created_at limit 25 for update skip locked),
 leased as (update private.diagnosis_cleanup q set claim_id=claim,leased_until=now()+interval '5 minutes',attempts=attempts+1 from jobs j where q.object_path=j.object_path returning q.object_path)
 select coalesce(jsonb_agg(object_path),'[]') into result from leased;
 return result;
end; $$;
create function public.finish_diagnosis_cleanup(path text,claim uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if (select auth.role())<>'service_role' then raise exception using errcode='42501',message='worker_required'; end if;
 if exists(select 1 from storage.objects where bucket_id='diagnosis-evidence' and name=path) then return false; end if;
 if not exists(select 1 from private.diagnosis_cleanup where object_path=path and claim_id=claim) then return false; end if;
 delete from private.diagnosis_submissions where object_path=path and status<>'approved' and purge_at<=now();
 update private.diagnosis_cleanup set completed_at=now(),leased_until=null where object_path=path and claim_id=claim;
 return found;
end; $$;

create function private.discovery_target_allowed(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p left join private.private_locations l on l.profile_id=p.id
 where p.id=p_id and p.is_profile_visible and p.is_location_sharing_enabled and p.onboarding_completed_at is not null
 and p.special_category_consent_at is not null and p.date_of_birth<=current_date-interval '18 years'
 and private.meetup_actor_is_active(p.id)
 and (private.discovery_enabled() or l.verified_at>=now()-interval '15 minutes')
 and not exists(select 1 from public.blocks b where (b.blocker_id=(select auth.uid()) and b.blocked_id=p.id) or (b.blocked_id=(select auth.uid()) and b.blocker_id=p.id)));
$$;
create function private.discovery_social_matches(p_target uuid,p_social text,p_event uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select case coalesce(p_social,'all')
 when 'all' then true
 when 'favorites' then exists(select 1 from public.starred_items s where s.owner_id=(select auth.uid()) and s.target_type=case when p_event is null then 'friend' else 'event' end and s.target_id=coalesce(p_event,p_target)::text)
 when 'friends' then private.profiles_are_friends((select auth.uid()),p_target)
 when 'friends_of_friends' then p_target<>(select auth.uid()) and not private.profiles_are_friends((select auth.uid()),p_target) and exists(
 select 1 from public.profiles target,public.profiles mutual where target.id=p_target and target.friends_of_friends_discovery and mutual.friends_of_friends_discovery
 and mutual.id not in (p_target,(select auth.uid())) and private.meetup_actor_is_active(mutual.id)
 and private.profiles_are_friends((select auth.uid()),mutual.id) and private.profiles_are_friends(mutual.id,p_target)
 and not private.meetup_block_exists((select auth.uid()),mutual.id) and not private.meetup_block_exists(p_target,mutual.id))
 else false end;
$$;
create function private.validate_discovery_extensions(f jsonb) returns void language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(f)<>'object' or (f->>'radiusKm' is not null and (f->>'radiusKm')::numeric not between 1 and 500)
 or (f->>'radiusKm' is not null and (f->>'radiusKm')::numeric<>trunc((f->>'radiusKm')::numeric))
 or coalesce(f->>'social','all') not in ('all','favorites','friends','friends_of_friends')
 or coalesce(f->>'activity','all') not in ('all','now','recent','month') then raise exception 'invalid_discovery_filters'; end if;
 if f ? 'genders' then
  if jsonb_typeof(f->'genders')<>'array' or jsonb_array_length(f->'genders')>5 then raise exception 'invalid_gender_filter'; end if;
  if exists(select 1 from jsonb_array_elements_text(f->'genders') v where v not in ('man','woman','nonbinary','genderqueer','self_described')) then raise exception 'invalid_gender_filter'; end if;
 end if;
 if f ? 'diagnosisIds' then
  if jsonb_typeof(f->'diagnosisIds')<>'array' or jsonb_array_length(f->'diagnosisIds')>3 then raise exception 'invalid_community_filter'; end if;
  if exists(select 1 from jsonb_array_elements_text(f->'diagnosisIds') v where v not in ('autism','adhd','schizophrenia')) then raise exception 'invalid_community_filter'; end if;
 end if;
end; $$;

-- Extend existing authorization funnels without changing their public signatures.
create or replace function private.discover_nearby_impl(filters jsonb, cursor jsonb)
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
    page_size := least(greatest(coalesce((safe_filters ->> 'limit')::integer, 30), 1), 60);
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
    where p.id <> caller and p.display_name is not null and p.date_of_birth <= current_date - interval '18 years'
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
create or replace function private.get_public_profile_impl(p_profile_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when private.current_user_is_ready(true) then (
    select jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'gender',p.gender,
      'diagnosis_ids',coalesce((select jsonb_agg(s.diagnosis_id) from private.diagnosis_submissions s where s.profile_id=p.id and s.status='approved' and s.consent_at is not null and s.discoverable and private.discovery_enabled()),'[]'),
      'age', extract(year from age(current_date, p.date_of_birth))::integer,
      'pronouns', p.pronouns, 'identity_tags', p.identity_tags, 'looking_for', p.looking_for,
      'profile_tags', case when p.adult_profile_tags_enabled then p.profile_tags else
        coalesce((select array_agg(selected.tag_id order by selected.tag_id) from unnest(p.profile_tags) as selected(tag_id)
                  where not exists (select 1 from public.profile_tag_catalog catalog
                                    where catalog.tag_id = selected.tag_id and catalog.category = 'kinks')), '{}') end,
      'custom_tags', p.custom_tags, 'bio', p.bio, 'region', p.region,
      'distance_band',case when l.verified_at>=now()-interval '15 minutes' then
       (select case when extensions.st_distance(l.cell_center,viewer.cell_center)<1000 then '<1 km' when extensions.st_distance(l.cell_center,viewer.cell_center)<3000 then '1-3 km' when extensions.st_distance(l.cell_center,viewer.cell_center)<10000 then '3-10 km' when extensions.st_distance(l.cell_center,viewer.cell_center)<30000 then '10-30 km' else '30+ km' end from private.private_locations viewer where viewer.profile_id=(select auth.uid()) and viewer.verified_at>=now()-interval '15 minutes') else null end,
      'videos', p.videos, 'socials', p.socials, 'interests', p.interests,
      'conversation_prompt', p.conversation_prompt,
      'cover_photo_id', (select photo.id from public.profile_photos photo
        where photo.id = p.cover_photo_id and photo.profile_id = p.id and photo.approval_status = 'approved'),
      'comment_wall_enabled', p.comment_wall_enabled,
      'anonymous_ratings_enabled', p.anonymous_ratings_enabled,
      'is_online', p.is_online_status_visible and p.last_active_at >= now() - interval '5 minutes',
      'photo_paths', coalesce((select jsonb_agg(jsonb_build_object('path', photo.storage_path, 'id', photo.id, 'tags', photo.tags) order by photo.position)
        from public.profile_photos photo where photo.profile_id = p.id and photo.approval_status = 'approved'), '[]'::jsonb),
      'profile_videos', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'path', v.storage_path, 'tags', v.tags, 'duration_ms', v.duration_ms) order by v.position)
        from public.profile_videos v where v.profile_id = p.id and v.approval_status = 'approved'), '[]'::jsonb)
    ) from public.profiles p left join private.private_locations l on l.profile_id = p.id
    where p.id = p_profile_id and p.id <> (select auth.uid()) and p.is_profile_visible and p.moderation_status = 'active'
      and private.discovery_target_allowed(p.id)
      and not exists (select 1 from public.blocks b where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = (select auth.uid())))
  ) else null end;
$$;
create or replace function private.start_conversation_impl(p_other_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  low_id uuid;
  high_id uuid;
  v_conversation_id uuid;
begin
  if caller is null or p_other_profile_id is null or caller = p_other_profile_id then
    raise exception using errcode = '22023', message = 'invalid_participant';
  end if;
  if not private.current_user_is_ready(true)
     or not exists (
       select 1 from public.profiles p
       left join private.private_locations l on l.profile_id = p.id
       where p.id = p_other_profile_id
         and p.is_profile_visible and p.moderation_status = 'active'
         and private.discovery_target_allowed(p.id)
     )
     or exists (
       select 1 from public.blocks b
       where (b.blocker_id = caller and b.blocked_id = p_other_profile_id)
          or (b.blocker_id = p_other_profile_id and b.blocked_id = caller)
     ) then
    raise exception using errcode = '42501', message = 'conversation_not_allowed';
  end if;

  low_id := least(caller, p_other_profile_id);
  high_id := greatest(caller, p_other_profile_id);
  insert into public.conversations (participant_low, participant_high, created_by)
  values (low_id, high_id, caller)
  on conflict (participant_low, participant_high) do update set participant_low = excluded.participant_low
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conversation_id, caller), (v_conversation_id, p_other_profile_id)
  on conflict (conversation_id, user_id) do update set deleted_at = null;
  return v_conversation_id;
end;
$$;
create or replace function private.can_message(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_user_is_ready(true)
    and private.is_conversation_member(p_conversation_id)
    and exists (
      select 1
      from public.conversations c
      join public.profiles other_profile
        on other_profile.id = case
          when c.participant_low = (select auth.uid()) then c.participant_high
          else c.participant_low
        end
      left join private.private_locations other_location on other_location.profile_id = other_profile.id
      where c.id = p_conversation_id
        and other_profile.moderation_status <> 'banned'
        and (other_profile.moderation_status <> 'suspended' or other_profile.suspended_until <= now())
        and private.discovery_target_allowed(other_profile.id)
        and other_profile.is_location_sharing_enabled
    );
$$;
create or replace function private.share_albums_impl(p_recipient_id uuid, p_album_ids uuid[], p_access_mode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  conversation uuid;
  selected_album_id uuid;
  album_row public.albums%rowtype;
  created_share_id uuid;
  result jsonb := '[]'::jsonb;
begin
  if caller is null or not private.current_user_is_ready(true) then
    raise exception using errcode = '42501', message = 'account_not_ready';
  end if;
  if p_recipient_id = caller or cardinality(p_album_ids) not between 1 and 5
    or cardinality(p_album_ids) <> cardinality(array(select distinct unnest(p_album_ids))) then
    raise exception using errcode = '22023', message = 'invalid_album_selection';
  end if;
  if p_access_mode not in ('indefinite', 'view_once', '10_minutes', '1_hour', '24_hours') then
    raise exception using errcode = '22023', message = 'invalid_access_mode';
  end if;
  if not exists (
    select 1 from public.profiles p
    left join private.private_locations l on l.profile_id = p.id
    where p.id = p_recipient_id and p.onboarding_completed_at is not null
      and p.special_category_consent_at is not null and p.date_of_birth <= current_date - interval '18 years'
      and p.is_profile_visible and p.is_location_sharing_enabled
      and p.moderation_status = 'active' and private.discovery_target_allowed(p.id)
  ) or exists (
    select 1 from public.blocks b
    where (b.blocker_id = caller and b.blocked_id = p_recipient_id)
       or (b.blocker_id = p_recipient_id and b.blocked_id = caller)
  ) then
    raise exception using errcode = '42501', message = 'recipient_not_eligible';
  end if;
  conversation := private.start_conversation_impl(p_recipient_id);
  foreach selected_album_id in array p_album_ids loop
    select * into album_row from public.albums
    where id = selected_album_id and owner_id = caller and deleted_at is null;
    if album_row.id is null then
      raise exception using errcode = '42501', message = 'album_not_found';
    end if;
    insert into public.album_shares (
      album_id, owner_id, recipient_id, conversation_id, access_mode, status, shared_version,
      accepted_at, expires_at, consumed_at, revoked_at
    ) values (
      album_row.id, caller, p_recipient_id, conversation, p_access_mode, 'pending', album_row.content_version,
      null, null, null, null
    )
    on conflict (album_id, recipient_id) do update set
      conversation_id = excluded.conversation_id,
      access_mode = excluded.access_mode,
      status = 'pending', shared_version = excluded.shared_version,
      accepted_at = null, expires_at = null, consumed_at = null, revoked_at = null,
      shared_at = now(), updated_at = now()
    returning id into created_share_id;
    delete from public.album_view_sessions where share_id = created_share_id;
    insert into public.messages (conversation_id, sender_id, body, message_kind, album_share_id)
    values (conversation, caller, 'Private album request', 'album_share', created_share_id);
    result := result || jsonb_build_array(created_share_id);
  end loop;
  return jsonb_build_object('conversation_id', conversation, 'share_ids', result);
end;
$$;
create or replace function private.can_view_profile_photo_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.profile_photos photo
      join public.profiles p on p.id = photo.profile_id
      where photo.storage_path = p_name
        and (
          photo.profile_id = (select auth.uid())
          or (
            photo.approval_status = 'approved'
            and p.is_profile_visible
            and p.is_location_sharing_enabled
            and p.onboarding_completed_at is not null
            and p.moderation_status <> 'banned'
            and (p.moderation_status <> 'suspended' or p.suspended_until <= now())
            and private.current_user_is_ready(true)
            and private.discovery_target_allowed(p.id)
            and not exists (
              select 1 from public.blocks b
              where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.id)
                 or (b.blocker_id = p.id and b.blocked_id = (select auth.uid()))
            )
          )
          or private.is_admin()
        )
    ),
    false
  );
$$;
create or replace function private.can_view_profile_video_object(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profile_videos v where v.storage_path=p_name and
 (v.profile_id=(select auth.uid()) or private.is_admin() or (v.approval_status='approved' and private.current_user_is_ready(true) and private.discovery_target_allowed(v.profile_id))));
$$;
create or replace function private.touch_presence_impl()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched_at timestamptz := now();
begin
  if not private.current_user_is_ready(false) then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  update public.profiles set last_active_at = touched_at where id = (select auth.uid()) and (last_active_at is null or last_active_at<=now()-interval '1 minute');
  return;
end;
$$;
create or replace function private.discover_meetups_impl(p_filters jsonb default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  filters jsonb := coalesce(p_filters, '{}'::jsonb);
  timing_filter text;
  category_filter text;
  access_filter text;
  region_filter text;
  result_limit integer;
  north_bound double precision;
  south_bound double precision;
  east_bound double precision;
  west_bound double precision;
  include_explicit boolean := false;
  result jsonb;
begin
  perform private.assert_meetup_feature_enabled();
  perform private.validate_discovery_extensions(filters);
  if not private.discovery_enabled() and ((filters->>'radiusKm') is not null or coalesce(filters->>'social','all')<>'all' or coalesce(jsonb_array_length(filters->'genders'),0)>0 or coalesce(jsonb_array_length(filters->'diagnosisIds'),0)>0) then raise exception 'discovery_release_disabled'; end if;
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  if not private.meetup_actor_is_active(caller) then
    raise exception using errcode = '42501', message = 'meetup_participant_not_eligible';
  end if;
  if jsonb_typeof(filters) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_meetup_filters';
  end if;
  if filters ? 'includeExplicit' and jsonb_typeof(filters -> 'includeExplicit') <> 'boolean' then
    raise exception using errcode = '22023', message = 'invalid_include_explicit_filter';
  end if;
  include_explicit := coalesce((filters ->> 'includeExplicit')::boolean, false);
  timing_filter := nullif(filters ->> 'timing', '');
  category_filter := nullif(filters ->> 'category', '');
  access_filter := nullif(filters ->> 'accessMode', '');
  region_filter := nullif(filters ->> 'region', '');
  result_limit := least(greatest(coalesce((filters ->> 'limit')::integer, 100), 1), 200);
  north_bound := (filters #>> '{bounds,north}')::double precision;
  south_bound := (filters #>> '{bounds,south}')::double precision;
  east_bound := (filters #>> '{bounds,east}')::double precision;
  west_bound := (filters #>> '{bounds,west}')::double precision;

  if timing_filter is not null and timing_filter not in ('today', 'weekend', 'future') then
    raise exception using errcode = '22023', message = 'invalid_meetup_timing_filter';
  end if;
  if access_filter is not null and access_filter not in ('open', 'private') then
    raise exception using errcode = '22023', message = 'invalid_meetup_access_filter';
  end if;
  if (north_bound is null)::integer + (south_bound is null)::integer
     + (east_bound is null)::integer + (west_bound is null)::integer not in (0, 4) then
    raise exception using errcode = '22023', message = 'complete_map_bounds_required';
  end if;
  if north_bound is not null and (
    north_bound not between -90 and 90 or south_bound not between -90 and 90
    or east_bound not between -180 and 180 or west_bound not between -180 and 180
    or north_bound <= south_bound or east_bound <= west_bound
  ) then
    raise exception using errcode = '22023', message = 'invalid_map_bounds';
  end if;

  select coalesce(jsonb_agg(rows.payload order by rows.starts_at, rows.id), '[]'::jsonb)
  into result
  from (
    select m.id, m.starts_at, private.meetup_payload(m.id, caller, false) as payload
    from public.meetups m
    join private.meetup_locations l on l.meetup_id = m.id
    join public.meetup_general_areas area on area.code = m.general_area and area.active
    where private.meetup_is_discoverable(m.id, caller)
      and (filters->>'intention' is null or m.intention=filters->>'intention')
      and (filters->>'venueMode' is null or m.venue_mode=filters->>'venueMode')
      and (coalesce(jsonb_array_length(filters->'genders'),0)=0 or coalesce(jsonb_array_length(m.event_profile->'audienceGenders'),0)=0 or exists(select 1 from jsonb_array_elements_text(filters->'genders') g where (m.event_profile->'audienceGenders') ? g))
      and (coalesce(jsonb_array_length(filters->'diagnosisIds'),0)=0 or exists(select 1 from jsonb_array_elements_text(filters->'diagnosisIds') d where (m.event_profile->'requiredDiagnosisIds') ? d))
      and private.discovery_social_matches(m.host_id,filters->>'social',m.id)
      and (filters->>'radiusKm' is null or (m.venue_mode<>'online' and exists(select 1 from private.private_locations origin where origin.profile_id=caller and origin.verified_at>=now()-interval '15 minutes' and extensions.st_dwithin(l.discovery_point,origin.cell_center,(filters->>'radiusKm')::numeric*1000))))
      and (not m.is_explicit or include_explicit)
      and (category_filter is null or m.category = category_filter)
      and (access_filter is null or m.access_mode = access_filter)
      and (region_filter is null or area.region = region_filter)
      and (
        timing_filter is null
        or (timing_filter = 'today' and
          (m.starts_at at time zone 'Atlantic/Reykjavik')::date =
          (now() at time zone 'Atlantic/Reykjavik')::date)
        or (timing_filter = 'future' and m.starts_at >= now())
        or (timing_filter = 'weekend' and
          m.starts_at at time zone 'Atlantic/Reykjavik' >=
            date_trunc('week', now() at time zone 'Atlantic/Reykjavik') + interval '5 days'
          and m.starts_at at time zone 'Atlantic/Reykjavik' <
            date_trunc('week', now() at time zone 'Atlantic/Reykjavik') + interval '7 days')
      )
      and (
        north_bound is null
        or (
          extensions.st_y(l.discovery_point::extensions.geometry) between south_bound and north_bound
          and extensions.st_x(l.discovery_point::extensions.geometry) between west_bound and east_bound
        )
      )
    order by m.starts_at, m.id
    limit result_limit
  ) rows;
  return result;
end;
$$;
alter table public.meetups drop constraint meetup_event_profile_shape;
alter table public.meetups add constraint meetup_event_profile_shape check(event_profile is null or extensions.jsonb_matches_schema('{"type":"object","properties":{"customTags":{"type":"array","items":{"type":"string","maxLength":40,"minLength":1},"maxItems":20,"uniqueItems":true},"rules":{"type":"string","maxLength":4000},"prerequisites":{"type":"string","maxLength":4000},"sections":{"type":"array","items":{"type":"object","properties":{"title":{"type":"string","maxLength":80,"minLength":1},"body":{"type":"string","maxLength":4000,"minLength":1}},"required":["title","body"],"additionalProperties":false},"maxItems":6},"joinMode":{"enum":["public","request","invite"]},"minAge":{"type":"integer","minimum":18,"maximum":120},"maxAge":{"type":["integer","null"],"minimum":18,"maximum":120},"ageLimits":{"type":"array","items":{"type":"object","properties":{"minAge":{"type":"integer","minimum":18,"maximum":120},"maxAge":{"type":"integer","minimum":18,"maximum":120},"maxRsvp":{"type":"integer","minimum":0,"maximum":1000}},"required":["minAge","maxAge","maxRsvp"],"additionalProperties":false},"maxItems":12},"genderLimits":{"type":"array","items":{"type":"object","properties":{"gender":{"enum":["man","woman","nonbinary","trans_man","trans_woman","genderqueer","self_described"]},"maxRsvp":{"type":"integer","minimum":0,"maximum":1000}},"required":["gender","maxRsvp"],"additionalProperties":false},"maxItems":7},"audienceGenders":{"type":"array","items":{"enum":["man","woman","nonbinary","genderqueer","self_described"]},"maxItems":5,"uniqueItems":true},"requiredDiagnosisIds":{"type":"array","items":{"enum":["autism","adhd","schizophrenia"]},"maxItems":3,"uniqueItems":true}},"required":["customTags","rules","prerequisites","sections","joinMode","minAge","maxAge","ageLimits","genderLimits"],"additionalProperties":false}'::json,event_profile));
create or replace function private.meetup_profile_eligible(p_meetup_id uuid,p_profile_id uuid,p_require_invite boolean default true)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare ep jsonb; person public.profiles%rowtype; person_age integer; person_gender text; rule jsonb; used integer;
begin
  select event_profile into ep from public.meetups where id=p_meetup_id;
  if not private.meetup_diagnosis_eligible(p_meetup_id,p_profile_id) then return false; end if;
  if ep is null then return true; end if;
  select * into person from public.profiles where id=p_profile_id;
  select gender into person_gender from private.meetup_gender_preferences where profile_id=p_profile_id;
  if coalesce(jsonb_array_length(ep->'audienceGenders'),0)>0 and not coalesce((ep->'audienceGenders') ? (case person_gender when 'trans_man' then 'man' when 'trans_woman' then 'woman' else person_gender end),false) then return false; end if;
  person_age := extract(year from age(current_date,person.date_of_birth))::integer;
  if person_age is null or person_age < (ep->>'minAge')::integer or person_age > (ep->>'maxAge')::integer then return false; end if;
  if p_require_invite and ep->>'joinMode'='invite' and not exists(select 1 from private.meetup_invitations where meetup_id=p_meetup_id and profile_id=p_profile_id) then return false; end if;
  if jsonb_array_length(ep->'genderLimits')>0 and person_gender is null then return false; end if;
  for rule in select value from jsonb_array_elements(ep->'genderLimits') loop
    if (rule->>'gender')=person_gender then
      select count(*) into used from public.meetup_participations mp join private.meetup_gender_preferences p on p.profile_id=mp.profile_id
      where mp.meetup_id=p_meetup_id and mp.profile_id<>p_profile_id and mp.status in ('joined','approved') and (rule->>'gender')=p.gender;
      if used >= (rule->>'maxRsvp')::integer then return false; end if;
    end if;
  end loop;
  for rule in select value from jsonb_array_elements(ep->'ageLimits') loop
    if person_age between (rule->>'minAge')::integer and (rule->>'maxAge')::integer then
      select count(*) into used from public.meetup_participations mp join public.profiles p on p.id=mp.profile_id
      where mp.meetup_id=p_meetup_id and mp.profile_id<>p_profile_id and mp.status in ('joined','approved')
      and extract(year from age(current_date,p.date_of_birth)) between (rule->>'minAge')::integer and (rule->>'maxAge')::integer;
      if used >= (rule->>'maxRsvp')::integer then return false; end if;
    end if;
  end loop;
  return true;
end; $$;
create function private.enforce_diagnosis_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and coalesce(old.event_profile->'requiredDiagnosisIds','[]')<>coalesce(new.event_profile->'requiredDiagnosisIds','[]')
 and exists(select 1 from public.meetup_participations where meetup_id=new.id) then raise exception 'diagnosis_requirements_locked'; end if;
 if new.status in ('draft','published') and coalesce(jsonb_array_length(new.event_profile->'requiredDiagnosisIds'),0)>0 then
  if not private.discovery_enabled() or not private.diagnosis_approved(new.host_id,new.event_profile->'requiredDiagnosisIds') then raise exception using errcode='42501',message='verified_host_required'; end if;
 end if;
 return new;
end; $$;
create trigger diagnosis_event_guard before insert or update of event_profile,host_id,status on public.meetups for each row execute function private.enforce_diagnosis_event();
create or replace function private.meetup_has_attendee_access(p_meetup_id uuid,p_viewer_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.meetup_has_attendee_access_before_hittumst(p_meetup_id,p_viewer_id)
    and private.meetup_diagnosis_eligible(p_meetup_id,p_viewer_id)
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
    where private.meetup_diagnosis_eligible(m.id,p_profile_id) and rm.room_id=p_room_id and rm.profile_id=p_profile_id and rm.status='active'
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
  where private.meetup_diagnosis_eligible(p_meetup_id,(select auth.uid())) and r.meetup_id=p_meetup_id and rm.profile_id=(select auth.uid()) and rm.status in ('active','paused')
    and r.status in ('open','locked') and now()<r.reading_closes_at and m.status='published'
    and (select enabled and expanded_launch_gates_passed from private.meetup_feature_config where id=1)
    and private.meetup_actor_is_active((select auth.uid())) and private.meetup_actor_is_active(m.host_id)
    and not private.meetup_block_exists((select auth.uid()),m.host_id)
    and (m.host_id=(select auth.uid()) or exists(select 1 from public.meetup_participations mp
      where mp.meetup_id=m.id and mp.profile_id=(select auth.uid()) and mp.status in ('joined','approved')
        and mp.confirmation_state<>'expired' and (mp.confirmation_state<>'confirmation_pending'
          or now()<private.meetup_confirmation_deadline(m,mp))));
$$;
create or replace function private.meetup_payload(p_meetup_id uuid,p_viewer_id uuid,p_include_description boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  result:=private.meetup_payload_before_pool(p_meetup_id,p_viewer_id,p_include_description);
  if private.diagnosis_restricted(p_meetup_id) then
    if not private.diagnosis_roster_allowed(p_meetup_id,p_viewer_id) then result:=jsonb_set(result,'{capabilities,canViewRoster}','false'); end if;
    result:=result||jsonb_build_object('diagnosisRestricted',true,'requiresDiagnosisVerification',not private.meetup_diagnosis_eligible(p_meetup_id,p_viewer_id));
    if not private.meetup_diagnosis_eligible(p_meetup_id,p_viewer_id) then
      result:=jsonb_set(result,'{capabilities}',(result->'capabilities')||'{"canJoin":false,"canRequestAccess":false,"canViewRoster":false}'::jsonb);
    end if;
  end if;
  return result||jsonb_build_object('pool',private.meetup_pool_payload(p_meetup_id));
end; $$;
create or replace function private.list_public_meetup_roster_impl(p_meetup_id uuid,p_cursor uuid default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); meetup_row public.meetups%rowtype; result jsonb; n integer:=least(greatest(coalesce(p_limit,50),1),50);
begin
  if not private.meetup_actor_is_active(caller) or not private.meetup_is_discoverable(p_meetup_id,caller) then
    raise exception using errcode='42501',message='meetup_not_visible';
  end if;
  if not private.diagnosis_roster_allowed(p_meetup_id,caller) then return jsonb_build_object('items','[]'::jsonb,'nextCursor',null); end if;
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
create or replace function private.list_profile_meetup_history_impl(p_profile_id uuid, p_cursor timestamptz default null, p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(rows.payload order by rows.sort_at desc), '[]'::jsonb),
    'nextCursor', case when count(*) > least(greatest(p_limit, 1), 50)
      then min(rows.sort_at)::text else null end
  )
  from (
    select mp.attendance_completed_at sort_at, jsonb_build_object(
      'meetupId', m.id, 'title', m.title, 'startsAt', m.starts_at,
      'intention', m.intention, 'venueMode', m.venue_mode,
      'attendanceOutcome', mp.attendance_outcome, 'visibility', mp.history_visibility
    ) payload
    from public.meetup_participations mp join public.meetups m on m.id = mp.meetup_id
    where not private.diagnosis_restricted(m.id) and mp.profile_id = p_profile_id and mp.attendance_outcome = 'attended'
      and mp.history_visibility = 'visible'
      and private.meetup_actor_is_active((select auth.uid()))
      and (p_cursor is null or mp.attendance_completed_at < p_cursor)
      and not private.meetup_block_exists((select auth.uid()), p_profile_id)
      and (not m.is_explicit or exists (
        select 1 from public.profiles viewer
        where viewer.id = (select auth.uid()) and viewer.adult_content_opted_in_at is not null
      ))
    order by mp.attendance_completed_at desc
    limit least(greatest(p_limit, 1), 50) + 1
  ) rows;
$$;
create or replace function private.list_profile_upcoming_meetups_impl(p_profile_id uuid, p_cursor timestamptz default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); result jsonb;
begin
  if caller is null or not private.meetup_actor_is_active(caller) then
    raise exception using errcode = '42501', message = 'active_member_required';
  end if;
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(rows.payload order by rows.starts_at), '[]'::jsonb),
    'nextCursor', case when count(*) > least(greatest(p_limit, 1), 50) then max(rows.starts_at)::text else null end
  ) into result
  from (
    select m.starts_at, jsonb_build_object(
      'meetupId', m.id, 'title', m.title, 'startsAt', m.starts_at,
      'intention', m.intention, 'venueMode', m.venue_mode,
      'visibility', private.effective_rsvp_visibility(m, mp)
    ) payload
    from public.meetup_participations mp join public.meetups m on m.id = mp.meetup_id
    where not private.diagnosis_restricted(m.id) and mp.profile_id = p_profile_id and mp.status in ('joined', 'approved')
      and m.status = 'published' and m.starts_at >= now()
      and (p_cursor is null or m.starts_at > p_cursor)
      and private.effective_rsvp_visibility(m, mp) = 'visible'
      and not private.meetup_block_exists(caller, p_profile_id)
      and (not m.is_explicit or exists (
        select 1 from public.profiles viewer
        where viewer.id = caller and viewer.adult_content_opted_in_at is not null
      ))
    order by m.starts_at limit least(greatest(p_limit, 1), 50) + 1
  ) rows;
  return result;
end;
$$;
create or replace function private.meetup_profile_action_impl(p_meetup_id uuid,p_action text,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_action in ('reviews','review') and not private.diagnosis_roster_allowed(p_meetup_id,(select auth.uid())) then
  if p_action='reviews' then return '[]'::jsonb; end if; raise exception 'review_not_available';
 end if;
 if p_action='add_media' then raise exception using errcode='42501',message='media_inspection_required'; end if;
 return private.meetup_profile_action_before_media_impl(p_meetup_id,p_action,p_input);
end $$;
create or replace function private.list_starred_items_impl(p_owner_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); owner uuid := coalesce(p_owner_id, caller); result jsonb;
begin
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  if owner <> caller and private.meetup_block_exists(caller, owner) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'targetType', s.target_type, 'targetId', s.target_id,
    'label', s.label, 'profileAudience', s.profile_audience, 'createdAt', s.created_at
  ) order by s.created_at desc), '[]'::jsonb) into result
  from public.starred_items s
  where s.owner_id = owner and (owner=caller or s.target_type<>'event' or not exists(select 1 from public.meetups m where m.id::text=s.target_id and private.diagnosis_restricted(m.id))) and (
    owner = caller or s.profile_audience = 'everyone'
    or (s.profile_audience = 'friends' and private.profiles_are_friends(owner, caller))
  );
  return result;
end;
$$;
create function private.diagnosis_favorite_privacy() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.target_type='event' and exists(select 1 from public.meetups where id::text=new.target_id and private.diagnosis_restricted(id)) then new.profile_audience:='no_one'; end if;
 return new;
end; $$;
create trigger diagnosis_favorite_privacy before insert or update on public.starred_items for each row execute function private.diagnosis_favorite_privacy();
create function private.withdraw_profile_diagnoses() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.special_category_consent_at is null and old.special_category_consent_at is not null then
  update private.diagnosis_submissions set status='withdrawn',consent_at=null,discoverable=false,legal_name='',purge_at=now() where profile_id=new.id;
  perform private.revoke_diagnosis_participation(new.id);
 end if;
 return new;
end; $$;
create trigger withdraw_profile_diagnoses after update of special_category_consent_at on public.profiles for each row execute function private.withdraw_profile_diagnoses();
revoke all on function private.discovery_enabled() from public,anon,authenticated,service_role;
grant execute on function private.discovery_enabled() to authenticated;
revoke all on function private.diagnosis_action_impl(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.diagnosis_action_impl(text,jsonb) to authenticated;
revoke all on function private.review_diagnosis_impl(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.review_diagnosis_impl(text,jsonb) to authenticated;
revoke all on function private.diagnosis_upload_allowed(text) from public,anon,authenticated,service_role;
grant execute on function private.diagnosis_upload_allowed(text) to authenticated;
revoke all on function public.discovery_release_status() from public,anon,authenticated,service_role;
grant execute on function public.discovery_release_status() to authenticated;
revoke all on function public.diagnosis_action(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.diagnosis_action(text,jsonb) to authenticated;
revoke all on function public.review_diagnosis(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.review_diagnosis(text,jsonb) to authenticated;
revoke all on function public.claim_diagnosis_cleanup(uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_diagnosis_cleanup(uuid) to service_role;
revoke all on function public.finish_diagnosis_cleanup(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.finish_diagnosis_cleanup(text,uuid) to service_role;
revoke all on function private.diagnosis_reviewer() from public,anon,authenticated,service_role;
revoke all on function private.diagnosis_approved(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.diagnosis_restricted(uuid) from public,anon,authenticated,service_role;
revoke all on function private.meetup_diagnosis_eligible(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.diagnosis_roster_allowed(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.revoke_diagnosis_participation(uuid) from public,anon,authenticated,service_role;
revoke all on function private.queue_diagnosis_erasure() from public,anon,authenticated,service_role;
revoke all on function private.discovery_target_allowed(uuid) from public,anon,authenticated,service_role;
revoke all on function private.discovery_social_matches(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.validate_discovery_extensions(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.enforce_diagnosis_event() from public,anon,authenticated,service_role;
revoke all on function private.diagnosis_favorite_privacy() from public,anon,authenticated,service_role;
revoke all on function private.withdraw_profile_diagnoses() from public,anon,authenticated,service_role;

-- Health evidence participates in the existing owner-only export and deletion manifest.
alter function private.export_account_impl() rename to export_account_before_diagnoses;
create function private.export_account_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.account_is_active() or not private.has_current_session() then raise exception using errcode='42501',message='account_unavailable'; end if;
 return private.export_account_before_diagnoses()||jsonb_build_object('diagnosisVerification',
 coalesce((select jsonb_agg(jsonb_build_object('id',id,'diagnosisId',diagnosis_id,'status',status,'submittedName',legal_name,'consentAt',consent_at,'discoverable',discoverable,'createdAt',created_at,'decidedAt',decided_at,'proofDeleteBy',purge_at,'reason',reason)) from private.diagnosis_submissions where profile_id=(select auth.uid())),'[]'));
end; $$;
revoke all on function private.export_account_before_diagnoses(),private.export_account_impl() from public,anon,authenticated,service_role;
grant execute on function private.export_account_impl() to authenticated;
create or replace function public.export_account() returns jsonb language sql stable security invoker set search_path='' as $$select private.export_account_impl();$$;
create or replace function public.export_my_account() returns jsonb language sql stable security invoker set search_path='' as $$select private.export_account_impl();$$;
-- Export downloads are authenticated proxies and never general media signed URLs.
alter function private.owns_export_media(text,text,text) rename to owns_export_media_before_diagnoses;
create function private.owns_export_media(p_bucket text,p_name text,p_owner text) returns boolean language sql stable security definer set search_path='' as $$
 select private.owns_export_media_before_diagnoses(p_bucket,p_name,p_owner) or
 (p_bucket='diagnosis-evidence' and exists(select 1 from private.diagnosis_submissions s where s.profile_id=(select auth.uid())
 and s.object_path=p_name and s.consent_at is not null and s.purge_at>now() and not exists(select 1 from private.diagnosis_cleanup q where q.object_path=p_name)));
$$;
revoke all on function private.owns_export_media_before_diagnoses(text,text,text),private.owns_export_media(text,text,text) from public,anon,authenticated,service_role;

-- Existing isolated restore quarantine also invalidates every restored health credential.
create function private.quarantine_restored_diagnoses() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.discovery_release_config set enabled=false;
 update private.diagnosis_submissions set status='withdrawn',consent_at=null,discoverable=false,legal_name='',purge_at=now() where profile_id=new.account_id;
 perform private.revoke_diagnosis_participation(new.account_id);
 return new;
end; $$;
revoke all on function private.quarantine_restored_diagnoses() from public,anon,authenticated,service_role;
create trigger quarantine_restored_diagnoses after insert on private.media_restore_quarantine for each row execute function private.quarantine_restored_diagnoses();
