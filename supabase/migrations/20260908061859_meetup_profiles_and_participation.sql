-- Event profiles are additive; existing access and launch gates remain authoritative.
create extension if not exists pg_jsonschema with schema extensions;
alter table public.meetups add column event_profile jsonb;
alter table public.meetups add constraint meetup_event_profile_shape check (event_profile is null or extensions.jsonb_matches_schema('{"type":"object","properties":{"customTags":{"type":"array","items":{"type":"string","maxLength":40,"minLength":1},"maxItems":20,"uniqueItems":true},"rules":{"type":"string","maxLength":4000},"prerequisites":{"type":"string","maxLength":4000},"sections":{"type":"array","items":{"type":"object","properties":{"title":{"type":"string","maxLength":80,"minLength":1},"body":{"type":"string","maxLength":4000,"minLength":1}},"required":["title","body"],"additionalProperties":false},"maxItems":6},"joinMode":{"enum":["public","request","invite"]},"minAge":{"type":"integer","minimum":18,"maximum":120},"maxAge":{"type":["integer","null"],"minimum":18,"maximum":120},"ageLimits":{"type":"array","items":{"type":"object","properties":{"minAge":{"type":"integer","minimum":18,"maximum":120},"maxAge":{"type":"integer","minimum":18,"maximum":120},"maxRsvp":{"type":"integer","minimum":0,"maximum":1000}},"required":["minAge","maxAge","maxRsvp"],"additionalProperties":false},"maxItems":12},"genderLimits":{"type":"array","items":{"type":"object","properties":{"gender":{"enum":["man","woman","nonbinary","trans_man","trans_woman","genderqueer","self_described"]},"maxRsvp":{"type":"integer","minimum":0,"maximum":1000}},"required":["gender","maxRsvp"],"additionalProperties":false},"maxItems":7}},"required":["customTags","rules","prerequisites","sections","joinMode","minAge","maxAge","ageLimits","genderLimits"],"additionalProperties":false}'::json,event_profile));
create table private.meetup_invitations (
  meetup_id uuid references public.meetups(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  primary key (meetup_id, profile_id)
);
create table private.meetup_gender_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  gender text not null check(gender in ('man','woman','nonbinary','trans_man','trans_woman','genderqueer','self_described'))
);
alter table private.meetup_gender_preferences enable row level security;
revoke all on private.meetup_gender_preferences from public,anon,authenticated,service_role;
create index meetup_invitations_profile on private.meetup_invitations(profile_id);
create table private.meetup_media (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('photo','video')),
  position integer not null check (position between 0 and 7),
  unique(meetup_id,position)
);
create table private.meetup_reviews (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text not null check (length(btrim(body)) between 3 and 2000),
  created_at timestamptz not null default now(),
  unique(meetup_id,author_id)
);
create index meetup_reviews_author on private.meetup_reviews(author_id);
alter table private.meetup_invitations enable row level security;
alter table private.meetup_media enable row level security;
alter table private.meetup_reviews enable row level security;
revoke all on private.meetup_invitations,private.meetup_media,private.meetup_reviews from public,anon,authenticated,service_role;

-- Called under a meetup row lock by participation writes. Pending requests do not reserve seats.
create function private.meetup_profile_eligible(p_meetup_id uuid,p_profile_id uuid,p_require_invite boolean default true)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare ep jsonb; person public.profiles%rowtype; person_age integer; person_gender text; rule jsonb; used integer;
begin
  select event_profile into ep from public.meetups where id=p_meetup_id;
  if ep is null then return true; end if;
  select * into person from public.profiles where id=p_profile_id;
  select gender into person_gender from private.meetup_gender_preferences where profile_id=p_profile_id;
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
revoke all on function private.meetup_profile_eligible(uuid,uuid,boolean) from public,anon,authenticated,service_role;

create function private.enforce_meetup_profile_participation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('pending','joined','approved') then return new; end if;
  if TG_OP='UPDATE' and old.status=new.status and old.profile_id is not distinct from new.profile_id then return new; end if;
  perform 1 from public.meetups where id=new.meetup_id for update;
  if not private.meetup_profile_eligible(new.meetup_id,new.profile_id) then
    raise exception using errcode='42501',message='meetup_participation_restricted';
  end if;
  return new;
end; $$;
create trigger meetup_profile_participation before insert or update on public.meetup_participations
for each row execute function private.enforce_meetup_profile_participation();

create function private.set_event_profile(p_id uuid,p_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare ep jsonb:=p_input->'eventProfile'; participant record;
begin
  if not (p_input ? 'eventProfile') then return; end if;
  if not exists(select 1 from public.meetups where id=p_id and host_id=(select auth.uid()) and status in ('draft','published')) then
    raise exception using errcode='42501',message='owned_meetup_required'; end if;
  if ep is null or ep='null'::jsonb or (ep->>'maxAge')::integer < (ep->>'minAge')::integer
    or exists(select 1 from jsonb_array_elements(ep->'ageLimits') r where (r->>'minAge')::integer>(r->>'maxAge')::integer)
    or (select count(*)<>count(distinct lower(btrim(value))) from jsonb_array_elements_text(ep->'customTags'))
    or exists(select 1 from jsonb_array_elements_text(ep->'customTags') where length(btrim(value))=0)
    or (select count(*)<>count(distinct value->>'gender') from jsonb_array_elements(ep->'genderLimits')) then
    raise exception using errcode='22023',message='invalid_event_profile'; end if;
  update public.meetups set event_profile=ep,
    access_mode=case when ep->>'joinMode'='request' then 'private' else 'open' end where id=p_id;
  for participant in select profile_id from public.meetup_participations where meetup_id=p_id and status in ('joined','approved') loop
    if not private.meetup_profile_eligible(p_id,participant.profile_id,false) then
      raise exception using errcode='23514',message='limits_conflict_with_current_attendees'; end if;
  end loop;
end; $$;
revoke all on function private.set_event_profile(uuid,jsonb) from public,anon,authenticated,service_role;

-- Preserve omitted fields on edits, and allow editing published event details.
create or replace function private.set_meetup_expansion_impl(p_meetup_id uuid,p_input jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare m public.meetups%rowtype; mode_value text; online_url text; online_code text;
begin
  perform private.assert_meetup_feature_enabled();
  select * into m from public.meetups where id=p_meetup_id and host_id=(select auth.uid()) and status in ('draft','published') for update;
  if m.id is null then raise exception using errcode='42501',message='owned_meetup_required'; end if;
  mode_value:=coalesce(p_input->>'venueMode',m.venue_mode);
  select access_url,access_code into online_url,online_code from private.meetup_online_access where meetup_id=m.id;
  if p_input ? 'onlineUrl' then online_url:=nullif(btrim(p_input->>'onlineUrl'),''); end if;
  if p_input ? 'onlineAccessCode' then online_code:=nullif(btrim(p_input->>'onlineAccessCode'),''); end if;
  if mode_value in ('online','hybrid') and (online_url is null or online_url!~* '^https?://') then
    raise exception using errcode='22023',message='protected_online_access_required'; end if;
  if m.status='published' and p_input ? 'recurrence' and (p_input->'recurrence') is distinct from coalesce(m.recurrence_rule,'null'::jsonb) then
    raise exception using errcode='22023',message='published_recurrence_change_unavailable'; end if;
  update public.meetups set intention=coalesce(p_input->>'intention',m.intention),venue_mode=mode_value,
    rsvp_visibility=coalesce(p_input->>'rsvpVisibility',m.rsvp_visibility),
    recurrence_rule=case when p_input ? 'recurrence' then nullif(p_input->'recurrence','null'::jsonb) else m.recurrence_rule end where id=m.id;
  if mode_value='in_person' then delete from private.meetup_online_access where meetup_id=m.id;
  else
    insert into private.meetup_online_access(meetup_id,access_url,access_code) values(m.id,online_url,online_code)
    on conflict(meetup_id) do update set access_url=excluded.access_url,access_code=excluded.access_code,updated_at=now();
  end if;
end; $$;

alter function private.create_meetup_draft_impl(jsonb) rename to create_meetup_draft_before_profile;
create function private.create_meetup_draft_impl(p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare id uuid;
begin
  id:=private.create_meetup_draft_before_profile(p_input);
  perform private.set_event_profile(id,p_input);
  perform private.set_meetup_expansion_impl(id,p_input);
  return id;
end; $$;
alter function private.update_meetup_impl(uuid,jsonb) rename to update_meetup_before_profile;
create function private.update_meetup_impl(p_meetup_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.update_meetup_before_profile(p_meetup_id,p_input);
  perform private.set_event_profile(p_meetup_id,p_input);
  perform private.set_meetup_expansion_impl(p_meetup_id,p_input);
  return private.meetup_payload(p_meetup_id,(select auth.uid()),true);
end; $$;
revoke all on function private.create_meetup_draft_impl(jsonb),private.update_meetup_impl(uuid,jsonb) from public,anon,service_role;
grant execute on function private.create_meetup_draft_impl(jsonb),private.update_meetup_impl(uuid,jsonb) to authenticated;
-- Old implementations are internal only; clients cannot bypass the profile validation.
revoke all on function private.create_meetup_draft_before_profile(jsonb),private.update_meetup_before_profile(uuid,jsonb) from public,anon,authenticated,service_role;

alter function private.meetup_payload(uuid,uuid,boolean) rename to meetup_payload_before_profile;
create function private.meetup_payload(p_meetup_id uuid,p_viewer_id uuid,p_include_description boolean default true)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; ep jsonb;
begin
  result:=private.meetup_payload_before_profile(p_meetup_id,p_viewer_id,p_include_description);
  select event_profile into ep from public.meetups where id=p_meetup_id;
  if ep is not null then result:=result||jsonb_build_object('eventProfile',ep); end if;
  if not private.meetup_profile_eligible(p_meetup_id,p_viewer_id) then
    result:=jsonb_set(jsonb_set(result,'{capabilities,canJoin}','false'),'{capabilities,canRequestAccess}','false');
  end if;
  return result;
end; $$;
revoke all on function private.meetup_payload(uuid,uuid,boolean) from public,anon,authenticated,service_role;

create function private.inherit_meetup_event_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.series_id is not null and new.occurrence_index>1 then
    select event_profile into new.event_profile from public.meetups where series_id=new.series_id and occurrence_index=1;
  end if;
  return new;
end; $$;
create trigger inherit_event_profile before insert on public.meetups for each row execute function private.inherit_meetup_event_profile();

create function private.inherit_meetup_media()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.series_id is not null and new.occurrence_index>1 then
    insert into private.meetup_media(meetup_id,storage_path,kind,position)
    select new.id,mm.storage_path,mm.kind,mm.position from private.meetup_media mm
    join public.meetups m on m.id=mm.meetup_id where m.series_id=new.series_id and m.occurrence_index=1;
  end if;
  return new;
end; $$;
create trigger inherit_event_media after insert on public.meetups for each row execute function private.inherit_meetup_media();
revoke all on function private.inherit_meetup_media() from public,anon,authenticated,service_role;

create function private.can_read_meetup_media(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
select (select auth.uid()) is not null and private.meetup_feature_is_enabled() and private.meetup_actor_is_active((select auth.uid()))
 and exists(select 1 from private.meetup_media mm join public.meetups m on m.id=mm.meetup_id where mm.storage_path=p_path
 and not private.meetup_block_exists(m.host_id,(select auth.uid()))
 and (m.host_id=(select auth.uid()) or private.meetup_is_discoverable(m.id,(select auth.uid()))));
$$;
create function private.can_write_meetup_media(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
select (select auth.uid()) is not null and private.meetup_feature_is_enabled() and private.meetup_current_user_can_host()
 and exists(select 1 from public.meetups where id::text=split_part(p_path,'/',1) and host_id=(select auth.uid()) and status in ('draft','published'));
$$;
revoke all on function private.can_read_meetup_media(text),private.can_write_meetup_media(text) from public,anon,service_role;
grant execute on function private.can_read_meetup_media(text),private.can_write_meetup_media(text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('meetup-media','meetup-media',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']);
create policy meetup_media_upload on storage.objects for insert to authenticated
with check(bucket_id='meetup-media' and private.can_write_meetup_media(name));
create policy meetup_media_read on storage.objects for select to authenticated
using(bucket_id='meetup-media' and (private.can_read_meetup_media(name) or private.can_write_meetup_media(name)));
create policy meetup_media_delete on storage.objects for delete to authenticated
using(bucket_id='meetup-media' and private.can_write_meetup_media(name));

create function private.meetup_profile_action_impl(p_meetup_id uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); m public.meetups%rowtype; result jsonb; next_position integer; path text; media_type text; related record;
begin
  perform private.assert_meetup_feature_enabled();
  if caller is null or not private.meetup_actor_is_active(caller) then raise exception using errcode='42501',message='active_account_required'; end if;
  if p_action='gender' then
    return coalesce((select to_jsonb(gender) from private.meetup_gender_preferences where profile_id=caller),'null'::jsonb);
  elsif p_action='set_gender' then
    -- Serialize demographic changes against admission on every affected event.
    perform 1 from public.meetups where id in(select meetup_id from public.meetup_participations where profile_id=caller and status in ('joined','approved')) order by id for update;
    if p_input->>'gender' is null then delete from private.meetup_gender_preferences where profile_id=caller;
    else insert into private.meetup_gender_preferences values(caller,p_input->>'gender') on conflict(profile_id) do update set gender=excluded.gender; end if;
    for related in select meetup_id from public.meetup_participations where profile_id=caller and status in ('joined','approved') loop
      if not private.meetup_profile_eligible(related.meetup_id,caller,false) then raise exception using errcode='23514',message='limits_conflict_with_current_attendees'; end if;
    end loop;
    return 'null'::jsonb;
  end if;
  perform private.get_meetup_impl(p_meetup_id);
  select * into m from public.meetups where id=p_meetup_id for update;
  if p_action in ('add_media','remove_media','invite','uninvite','invitations') and (m.host_id<>caller or m.status not in ('draft','published')) then
    raise exception using errcode='42501',message='owned_meetup_required'; end if;
  if p_action='media' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'path',storage_path,'kind',kind,'position',position) order by position),'[]') into result from private.meetup_media where meetup_id=m.id;
  elsif p_action='add_media' then
    path:=p_input->>'path'; media_type:=p_input->>'kind';
    if split_part(path,'/',1)<>m.id::text or not exists(select 1 from storage.objects where bucket_id='meetup-media' and name=path
      and case when media_type='photo' then metadata->>'mimetype' in ('image/jpeg','image/png','image/webp') else metadata->>'mimetype' in ('video/mp4','video/quicktime','video/webm') end) then
      raise exception using errcode='22023',message='invalid_event_media'; end if;
    select n into next_position from generate_series(0,7) n where not exists(select 1 from private.meetup_media where meetup_id=m.id and position=n) order by n limit 1;
    if next_position is null then raise exception using errcode='23514',message='event_media_limit'; end if;
    insert into private.meetup_media(meetup_id,storage_path,kind,position) values(m.id,path,media_type,next_position);
  elsif p_action='remove_media' then
    delete from private.meetup_media where meetup_id=m.id and id=(p_input->>'id')::uuid returning storage_path into path;
    if path is not null and not exists(select 1 from private.meetup_media where storage_path=path) then result:=to_jsonb(path); end if;
  elsif p_action='invite' then
    if not private.meetup_actor_is_active((p_input->>'profileId')::uuid) or private.meetup_block_exists(caller,(p_input->>'profileId')::uuid) then
      raise exception using errcode='42501',message='invitee_unavailable'; end if;
    insert into private.meetup_invitations values(m.id,(p_input->>'profileId')::uuid) on conflict do nothing;
  elsif p_action='uninvite' then
    delete from private.meetup_invitations where meetup_id=m.id and profile_id=(p_input->>'profileId')::uuid;
  elsif p_action='invitations' then
    select coalesce(jsonb_agg(profile_id),'[]') into result from private.meetup_invitations where meetup_id=m.id;
  elsif p_action='reviews' then
    select coalesce(jsonb_agg(row_data order by created_at desc),'[]') into result from (
      select r.created_at,jsonb_build_object('id',r.id,'authorId',r.author_id,'authorName',p.display_name,'rating',r.rating,'body',r.body,'createdAt',r.created_at) row_data
      from private.meetup_reviews r join public.profiles p on p.id=r.author_id where r.meetup_id=m.id and not private.meetup_block_exists(caller,r.author_id)
      order by r.created_at desc limit 100
    ) reviews;
  elsif p_action='review' then
    if m.host_id=caller or m.status<>'published' or m.effective_end>now() or not exists(select 1 from public.meetup_participations
      where meetup_id=m.id and profile_id=caller and status in ('joined','approved') and attendance_outcome='attended') then
      raise exception using errcode='42501',message='completed_attendance_required'; end if;
    insert into private.meetup_reviews(meetup_id,author_id,rating,body) values(m.id,caller,(p_input->>'rating')::integer,btrim(p_input->>'body'))
    on conflict(meetup_id,author_id) do update set rating=excluded.rating,body=excluded.body;
  elsif p_action='delete_review' then
    delete from private.meetup_reviews where meetup_id=m.id and author_id=caller;
  else raise exception using errcode='22023',message='invalid_event_action'; end if;
  return coalesce(result,'null'::jsonb);
end; $$;
create function public.meetup_profile_action(meetup_id uuid,action text,input jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select private.meetup_profile_action_impl(meetup_id,action,input);$$;
revoke all on function public.meetup_profile_action(uuid,text,jsonb),private.meetup_profile_action_impl(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.meetup_profile_action(uuid,text,jsonb),private.meetup_profile_action_impl(uuid,text,jsonb) to authenticated;
revoke all on function private.enforce_meetup_profile_participation(),private.inherit_meetup_event_profile() from public,anon,authenticated,service_role;
