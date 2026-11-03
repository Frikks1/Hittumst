-- Additive sharing scopes and existing-resource references. References never
-- grant album access or publish another group member's identity implicitly.
alter table private.profile_showcases drop constraint profile_showcases_audience_check;
alter table private.profile_showcases add constraint profile_showcases_audience_check check(audience in ('everyone','friends','no_one','group','people'));
alter table private.showcase_approvals drop constraint showcase_approvals_audience_check;
alter table private.showcase_approvals add constraint showcase_approvals_audience_check check(audience in ('everyone','friends','no_one','group','people'));
alter table private.profile_showcases add column audience_group_id uuid references public.groups(id) on delete set null,
 add column audience_person_ids uuid[] not null default '{}', add column member_rosters jsonb not null default '{}';
alter table private.showcase_approvals add column audience_group_id uuid references public.groups(id) on delete set null,
 add column audience_person_ids uuid[] not null default '{}';
create table private.showcase_group_member_preferences (
 group_id uuid not null references public.groups(id) on delete cascade,
 profile_id uuid not null references public.profiles(id) on delete cascade,
 visible boolean not null default true, updated_at timestamptz not null default now(), primary key(group_id,profile_id)
);
alter table private.showcase_group_member_preferences enable row level security;
revoke all on private.showcase_group_member_preferences from public,anon,authenticated,service_role;

-- Sponsorship requirements are removed, including from saved legacy documents.
-- Existing publication consent cannot authorize a silently changed disclosure.
update private.profile_showcases s set entries=(select jsonb_agg(case when e?'requirements' then
 jsonb_set(e,'{requirements}',(e->'requirements')-array['sponsorMeetupId','minSponsorIsk']) else e end order by ord)
 from jsonb_array_elements(s.entries) with ordinality x(e,ord)),status='draft',audience=null,
 revision=revision+1,updated_at=now() where exists(select 1 from jsonb_array_elements(s.entries) e where (e->'requirements')?|array['sponsorMeetupId','minSponsorIsk']);
update private.showcase_approvals a set status='revoked',responded_at=now() where status='pending'
 and exists(select 1 from private.profile_showcases s where s.id=a.showcase_id and s.revision<>a.revision);

create function private.showcase_album_open(p_album uuid,p_viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.account_is_active() and private.memory_actor_active(p_viewer) and exists(select 1 from public.albums a
 where a.id=p_album and a.deleted_at is null and private.memory_actor_active(a.owner_id)
 and not private.meetup_block_exists(a.owner_id,p_viewer)
 and (a.owner_id=p_viewer or exists(select 1 from public.album_shares s where s.album_id=a.id and s.recipient_id=p_viewer
 and private.album_share_is_open(s.id,p_viewer)))); $$;
create function private.showcase_member_opted_in(p_group uuid,p_person uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.showcase_group_member_preferences p where p.group_id=p_group and p.profile_id=p_person and not p.visible); $$;
create function private.showcase_member_current(p_group uuid,p_person uuid,p_owner uuid,p_viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.group_member_role(p_group,p_person) is not null and private.showcase_member_opted_in(p_group,p_person)
 and private.memory_actor_active(p_person) and not private.meetup_block_exists(p_person,p_owner)
 and not private.meetup_block_exists(p_person,p_viewer) and exists(select 1 from public.profiles p where p.id=p_person and p.is_profile_visible)
 and exists(select 1 from public.groups g where g.id=p_group and g.status='active'); $$;
create function private.showcase_group_roster(p_group uuid,p_owner uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(m.profile_id order by m.profile_id),'[]') from public.group_members m
 where m.group_id=p_group and m.status='active' and private.showcase_member_current(p_group,m.profile_id,p_owner,p_owner); $$;
create function private.showcase_set_group_member_visibility_impl(p_group_id uuid,p_visible boolean) returns void
language plpgsql security definer set search_path='' as $$declare caller uuid:=private.showcase_actor(); begin
 if p_visible is null or private.group_member_role(p_group_id,caller) is null then raise exception using errcode='42501',message='active_group_membership_required'; end if;
 insert into private.showcase_group_member_preferences(group_id,profile_id,visible) values(p_group_id,caller,p_visible)
 on conflict(group_id,profile_id) do update set visible=excluded.visible,updated_at=now();
 if not p_visible then update private.showcase_approvals a set status='revoked',responded_at=now(),responded_by=caller
 where a.role='person' and a.scope='member:'||caller::text and a.recipient_id=caller and a.status in ('pending','approved')
 and exists(select 1 from private.profile_showcases s,jsonb_array_elements(s.entries) e where s.id=a.showcase_id
 and e->>'id'=a.entry_id::text and e->>'groupId'=p_group_id::text); end if; end $$;

-- Preserve the original validator, with the explicit selected occurrence list
-- no longer truncated at fifty. New fields are validated before delegating.
alter function private.showcase_entry_valid(jsonb,uuid) rename to showcase_entry_valid_before_scopes;
do $$declare source text; begin
 source:=pg_get_functiondef('private.showcase_entry_valid_before_scopes(jsonb,uuid)'::regprocedure);
 if position('"meetupIds":{"type":"array","maxItems":50,' in source)=0 then raise exception 'missing_showcase_meetup_array_validator'; end if;
 execute replace(source,'"meetupIds":{"type":"array","maxItems":50,','"meetupIds":{"type":"array",'); end $$;
create function private.showcase_entry_valid(p_entry jsonb,p_owner uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$declare album uuid; begin
 if (p_entry->'requirements')?|array['sponsorMeetupId','minSponsorIsk'] then return false; end if;
 if p_entry?'albumIds' then
 if not extensions.jsonb_matches_schema('{"type":"array","maxItems":12,"uniqueItems":true,"items":{"type":"string","format":"uuid"}}'::json,p_entry->'albumIds') then return false; end if;
 for album in select value::uuid from jsonb_array_elements_text(p_entry->'albumIds') loop
 if not exists(select 1 from public.albums a where a.id=album and a.owner_id=p_owner) then return false; end if; end loop; end if;
 if p_entry?'showMembers' and (jsonb_typeof(p_entry->'showMembers')<>'boolean' or ((p_entry->>'showMembers')::boolean and p_entry->>'kind'<>'group')) then return false; end if;
 return private.showcase_entry_valid_before_scopes(p_entry-array['albumIds','showMembers'],p_owner);
 exception when invalid_text_representation then return false; end $$;

create function private.showcase_audience_contact_eligible(p_owner uuid,p_person uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_owner<>p_person and private.memory_actor_active(p_owner) and private.memory_actor_active(p_person)
 and not private.meetup_block_exists(p_owner,p_person) and exists(select 1 from public.profiles p where p.id=p_person and p.is_profile_visible)
 and (private.profiles_are_friends(p_owner,p_person) or exists(select 1 from public.group_members a
 join public.group_members b on b.group_id=a.group_id join public.groups g on g.id=a.group_id
 where a.profile_id=p_owner and b.profile_id=p_person and a.status='active' and b.status='active' and g.status='active')); $$;
create or replace function private.showcase_visible(p_showcase private.profile_showcases,p_viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_showcase.status='published' and private.showcase_profile_visible(p_showcase.owner_id,p_viewer) and case p_showcase.audience
 when 'everyone' then true when 'friends' then private.profiles_are_friends(p_showcase.owner_id,p_viewer)
 when 'people' then p_viewer=any(p_showcase.audience_person_ids) and private.showcase_audience_contact_eligible(p_showcase.owner_id,p_viewer)
 when 'group' then private.group_member_role(p_showcase.audience_group_id,p_showcase.owner_id) is not null
 and private.group_member_role(p_showcase.audience_group_id,p_viewer) is not null
 and exists(select 1 from public.groups g where g.id=p_showcase.audience_group_id and g.status='active') else false end; $$;
create or replace function private.showcase_has_consent(p_showcase private.profile_showcases,p_entry uuid,p_count boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.showcase_approvals a where a.showcase_id=p_showcase.id and a.entry_id=p_entry
 and a.revision=p_showcase.revision and a.audience=p_showcase.audience and a.count_only=p_count and a.scope not like 'member:%'
 and (a.audience_group_id is distinct from p_showcase.audience_group_id or a.audience_person_ids<>p_showcase.audience_person_ids
 or a.status<>'approved' or not private.memory_actor_active(a.recipient_id) or private.meetup_block_exists(a.recipient_id,p_showcase.owner_id)
 or (a.role='group' and (a.responded_by is null or not private.memory_actor_active(a.responded_by)
 or private.meetup_block_exists(a.responded_by,p_showcase.owner_id) or coalesce(private.group_member_role(a.scope::uuid,a.responded_by) not in ('owner','admin'),true)))
 or (a.role='host' and not exists(select 1 from public.meetups m where m.id=replace(a.scope,'count:','')::uuid and m.host_id=a.recipient_id and m.status='published'))
 or (a.role='media' and not exists(select 1 from private.media_uploads u where u.id=a.scope::uuid and u.owner_id=a.recipient_id and u.status='approved')))); $$;
create or replace function private.showcase_consent_given(p_showcase private.profile_showcases,p_entry uuid,p_role text,p_scope text,p_recipient uuid,p_count boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.showcase_approvals a where a.showcase_id=p_showcase.id and a.entry_id=p_entry
 and a.revision=p_showcase.revision and a.audience=p_showcase.audience and a.role=p_role and a.scope=p_scope and a.recipient_id=p_recipient
 and a.count_only=p_count and a.status='approved' and a.audience_group_id is not distinct from p_showcase.audience_group_id
 and a.audience_person_ids=p_showcase.audience_person_ids); $$;
create or replace function private.showcase_request(p_showcase private.profile_showcases,p_entry jsonb,p_role text,p_scope text,p_recipient uuid,p_count boolean default false) returns void
language plpgsql security definer set search_path='' as $$begin
 if p_recipient is null or p_recipient=p_showcase.owner_id then return; end if;
 insert into private.showcase_approvals(showcase_id,entry_id,revision,audience,role,scope,recipient_id,count_only,snapshot,audience_group_id,audience_person_ids)
 values(p_showcase.id,(p_entry->>'id')::uuid,p_showcase.revision,p_showcase.audience,p_role,p_scope,p_recipient,p_count,
 p_entry||case when p_count then jsonb_build_object('verifiedCount',(p_showcase.count_values->>(p_entry->>'id'))::integer) else '{}' end,
 p_showcase.audience_group_id,p_showcase.audience_person_ids) on conflict do nothing; end $$;

alter function private.showcase_entry_payload(private.profile_showcases,jsonb,boolean) rename to showcase_entry_payload_before_scopes;
create function private.showcase_entry_payload(p_showcase private.profile_showcases,p_entry jsonb,p_owner boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=(select auth.uid()); entry jsonb:=p_entry; result jsonb; albums jsonb; members jsonb; roster jsonb; group_id uuid:=(p_entry->>'groupId')::uuid; begin
 if entry?'requirements' then entry:=jsonb_set(entry,'{requirements}',(entry->'requirements')-array['sponsorMeetupId','minSponsorIsk']); end if;
 result:=private.showcase_entry_payload_before_scopes(p_showcase,entry,p_owner);
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.name)||case when a.owner_id=viewer then '{}'::jsonb else
 jsonb_build_object('shareId',(select s.id from public.album_shares s where s.album_id=a.id and s.recipient_id=viewer and private.album_share_is_open(s.id,viewer) order by s.id limit 1)) end order by x.ord),'[]') into albums
 from jsonb_array_elements_text(coalesce(p_entry->'albumIds','[]')) with ordinality x(id,ord) join public.albums a on a.id=x.id::uuid
 where a.owner_id=p_showcase.owner_id and private.showcase_album_open(a.id,viewer);
 members:='[]';
 if coalesce((entry->>'showMembers')::boolean,false) and group_id is not null then
 roster:=case when p_showcase.status='published' then coalesce(p_showcase.member_rosters->(entry->>'id'),'[]')
 when p_owner and private.group_member_role(group_id,viewer) is not null then private.showcase_group_roster(group_id,p_showcase.owner_id) else '[]' end;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name) order by x.ord),'[]') into members
 from jsonb_array_elements_text(roster) with ordinality x(id,ord) join public.profiles p on p.id=x.id::uuid
 where private.showcase_member_current(group_id,p.id,p_showcase.owner_id,viewer)
 and (private.group_member_role(group_id,viewer) is not null or p.id=p_showcase.owner_id
 or private.showcase_consent_given(p_showcase,(entry->>'id')::uuid,'person','member:'||p.id::text,p.id))
 and (private.group_member_role(group_id,viewer) is not null or private.showcase_profile_visible(p.id,viewer)); end if;
 return result||jsonb_build_object('albumIds',case when p_owner and viewer=p_showcase.owner_id then coalesce(p_entry->'albumIds','[]')
 else coalesce((select jsonb_agg(x->>'id') from jsonb_array_elements(albums) x),'[]') end,
 'albums',albums,'showMembers',coalesce((entry->>'showMembers')::boolean,false),'groupMembers',members); end $$;

create function private.showcase_audience_payload(p_showcase private.profile_showcases,p_exact boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare viewer uuid:=(select auth.uid()); people jsonb:='[]'; group_name text; begin
 if not p_exact or p_showcase.status<>'published' then return jsonb_build_object('audienceGroupId',null,'audiencePersonIds','[]'::jsonb,'audienceGroupName',null,'audiencePeople','[]'::jsonb); end if;
 if p_showcase.audience_group_id is not null and private.group_member_role(p_showcase.audience_group_id,viewer) is not null then
 select name into group_name from public.groups where id=p_showcase.audience_group_id and status='active'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name) order by p.id),'[]') into people from public.profiles p
 where p.id=any(p_showcase.audience_person_ids) and (p.id=viewer or private.showcase_profile_visible(p.id,viewer));
 return jsonb_build_object('audienceGroupId',p_showcase.audience_group_id,'audiencePersonIds',to_jsonb(p_showcase.audience_person_ids),'audienceGroupName',group_name,'audiencePeople',people); end $$;
alter function private.showcase_payload(private.profile_showcases,boolean) rename to showcase_payload_before_scopes;
create function private.showcase_payload(p_showcase private.profile_showcases,p_owner boolean) returns jsonb
language sql stable security definer set search_path='' as $$select private.showcase_payload_before_scopes(p_showcase,p_owner)
 ||private.showcase_audience_payload(p_showcase,p_owner and p_showcase.owner_id=(select auth.uid())); $$;

alter function private.showcase_save_impl(uuid,integer,text,text,text,text,uuid,jsonb) rename to showcase_save_before_scopes;
create function private.showcase_save_impl(p_id uuid,p_expected_revision integer,p_template text,p_title text,p_introduction text,p_layout text,p_cover_media_id uuid,p_entries jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$declare normalized jsonb; caller uuid:=private.showcase_actor(); begin
 if jsonb_typeof(p_entries) is distinct from 'array' then raise exception using errcode='22023',message='invalid_showcase'; end if;
 if exists(select 1 from jsonb_array_elements(p_entries) e where not private.showcase_entry_valid(e,caller)) then raise exception using errcode='22023',message='invalid_showcase_entry'; end if;
 if exists(select 1 from jsonb_array_elements(p_entries) e,jsonb_array_elements_text(coalesce(e->'albumIds','[]')) a(id)
 where not exists(select 1 from public.albums x where x.id=a.id::uuid and x.owner_id=caller and x.deleted_at is null)) then raise exception using errcode='22023',message='invalid_showcase_album'; end if;
 select coalesce(jsonb_agg(e||jsonb_build_object('albumIds',coalesce(e->'albumIds','[]'),'showMembers',coalesce(e->'showMembers','false'::jsonb)) order by ord),'[]') into normalized
 from jsonb_array_elements(p_entries) with ordinality x(e,ord);
 return private.showcase_save_before_scopes(p_id,p_expected_revision,p_template,p_title,p_introduction,p_layout,p_cover_media_id,normalized); end $$;

-- The legacy internal publisher remains the implementation for event/media
-- consent. Only the new wrapper accepts and validates audience targets.
do $$declare source text; begin source:=pg_get_functiondef('private.showcase_publish_impl(uuid,text,integer)'::regprocedure);
 if position('p_audience not in (''everyone'',''friends'',''no_one'')' in source)=0 then raise exception 'missing_showcase_audience_validator'; end if;
 execute replace(source,'p_audience not in (''everyone'',''friends'',''no_one'')','p_audience not in (''everyone'',''friends'',''no_one'',''group'',''people'')'); end $$;
create function private.showcase_publish_scoped_impl(p_id uuid,p_audience text,p_expected_revision integer,p_group_id uuid,p_person_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); item private.profile_showcases; entry jsonb; person uuid; ids uuid[]:=coalesce(p_person_ids,'{}'); begin
 select * into item from private.profile_showcases where id=p_id and owner_id=caller for update;
 if item.id is null then raise exception using errcode='42501',message='showcase_unavailable'; end if;
 if p_expected_revision is null or item.revision<>p_expected_revision then raise exception using errcode='40001',message='showcase_revision_conflict'; end if;
 if p_audience='group' then
 if p_group_id is null or private.group_member_role(p_group_id,caller) is null or not exists(select 1 from public.groups where id=p_group_id and status='active')
 or cardinality(ids)<>0 then raise exception using errcode='22023',message='invalid_showcase_audience_scope'; end if;
 elsif p_audience='people' then
 if p_group_id is not null or cardinality(ids)=0 or exists(select 1 from unnest(ids) id where id is null or not private.showcase_audience_contact_eligible(caller,id)) or (select count(distinct id) from unnest(ids) id)<>cardinality(ids) then
 raise exception using errcode='22023',message='invalid_showcase_audience_scope'; end if;
 elsif p_group_id is not null or cardinality(ids)<>0 then raise exception using errcode='22023',message='invalid_showcase_audience_scope'; end if;
 select coalesce(array_agg(id order by id),'{}') into ids from unnest(ids) id;
 update private.profile_showcases set audience_group_id=p_group_id,audience_person_ids=ids where id=p_id;
 perform private.showcase_publish_impl(p_id,p_audience,p_expected_revision);
 update private.profile_showcases s set member_rosters=coalesce((select jsonb_object_agg(e->>'id',private.showcase_group_roster((e->>'groupId')::uuid,caller))
 from jsonb_array_elements(s.entries) e where e->>'kind'='group' and coalesce((e->>'showMembers')::boolean,false)),'{}') where id=p_id returning * into item;
 if p_audience='no_one' then
 delete from private.showcase_approvals where showcase_id=item.id and revision=item.revision;
 return private.showcase_payload(item,true); end if;
 for entry in select value from jsonb_array_elements(item.entries) where value->>'kind'='group' and coalesce((value->>'showMembers')::boolean,false) loop
 for person in select value::uuid from jsonb_array_elements_text(item.member_rosters->(entry->>'id')) loop
 perform private.showcase_request(item,entry,'person','member:'||person::text,person); end loop; end loop;
 return private.showcase_payload(item,true); end $$;
drop function public.showcase_publish(uuid,text,integer);
create function public.showcase_publish(p_id uuid,p_audience text,p_expected_revision integer,p_group_id uuid default null,p_person_ids uuid[] default '{}') returns jsonb
language sql security invoker set search_path='' as $$select private.showcase_publish_scoped_impl(p_id,p_audience,p_expected_revision,p_group_id,p_person_ids);$$;

alter function private.showcase_pickers_impl() rename to showcase_pickers_before_scopes;
create function private.showcase_pickers_impl(p_person_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare caller uuid:=private.showcase_actor(); result jsonb; events jsonb; groups jsonb; albums jsonb; begin
 if p_person_id is not null and (not private.profiles_are_friends(caller,p_person_id) or not private.memory_actor_active(p_person_id)
 or private.meetup_block_exists(caller,p_person_id)) then raise exception using errcode='42501',message='showcase_friend_unavailable'; end if;
 result:=private.showcase_pickers_before_scopes();
 select coalesce(jsonb_agg(e),'[]') into events from jsonb_array_elements(result->'events') e where p_person_id is null
 or exists(select 1 from private.community_attendance a where a.meetup_id=(e->>'id')::uuid and a.profile_id=p_person_id);
 select coalesce(jsonb_agg(g||jsonb_build_object('memberVisible',private.showcase_member_opted_in((g->>'id')::uuid,caller),'members',
 coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name) order by p.display_name,p.id) from public.group_members m
 join public.profiles p on p.id=m.profile_id where m.group_id=(g->>'id')::uuid and private.showcase_member_current(m.group_id,p.id,caller,caller)),'[]'))),'[]')
 into groups from jsonb_array_elements(result->'groups') g;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.name) order by a.name,a.id),'[]') into albums from public.albums a where a.owner_id=caller and a.deleted_at is null;
 return result||jsonb_build_object('events',events,'groups',groups,'albums',albums); end $$;
drop function public.showcase_pickers();
create function public.showcase_pickers(p_person_id uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$select private.showcase_pickers_impl(p_person_id);$$;
create function public.showcase_set_group_member_visibility(p_group_id uuid,p_visible boolean) returns void language sql security invoker set search_path='' as $$select private.showcase_set_group_member_visibility_impl(p_group_id,p_visible);$$;

create function private.showcase_member_preview_sources(p_showcase private.profile_showcases,p_entry jsonb,p_viewer uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare event_id uuid; host uuid; begin
 for event_id in select value::uuid from jsonb_array_elements_text(p_entry->'meetupIds') union
 select value::uuid from jsonb_each_text(coalesce(p_entry->'requirements','{}')) where key='meetupId' loop
 if not private.community_event_visible(event_id,p_viewer) then return false; end if;
 if not private.memory_public_meetup(event_id) then
 select m.host_id into host from public.meetups m where m.id=event_id;
 if p_viewer<>p_showcase.owner_id and p_viewer<>host and not exists(select 1 from private.community_attendance a where a.meetup_id=event_id and a.profile_id=p_viewer)
 and not private.showcase_consent_given(p_showcase,(p_entry->>'id')::uuid,'host',event_id::text,host) then return false; end if; end if;
 end loop; return true; end $$;

alter function private.showcase_list_approvals_impl() rename to showcase_list_approvals_before_scopes;
create function private.showcase_list_approvals_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 select coalesce(jsonb_agg(a||private.showcase_audience_payload(s,true)||case when coalesce((a->>'countOnly')::boolean,false) then
 jsonb_build_object('entryTitle','Verified attendance','entryBody','','snapshot',jsonb_build_object(
 'id',a->'entryId','kind','story','title','Verified attendance','body','','meetupIds','[]'::jsonb,'meetups','[]'::jsonb,
 'albumIds','[]'::jsonb,'albums','[]'::jsonb,'showMembers',false,'groupMembers','[]'::jsonb,'media','[]'::jsonb,
 'review','','reviewIdentified',false,'rating',null,'showCount',true,'verifiedCount',a#>'{snapshot,verifiedCount}',
 'approvalStatus',a#>'{snapshot,approvalStatus}')) else '{}'::jsonb end),'[]') into result
 from jsonb_array_elements(private.showcase_list_approvals_before_scopes()) a join private.profile_showcases s on s.id=(a->>'showcaseId')::uuid
 join private.showcase_approvals raw on raw.id=(a->>'id')::uuid
 where raw.scope not like 'member:%' or (raw.scope='member:'||raw.recipient_id::text
 and private.showcase_member_current((raw.snapshot->>'groupId')::uuid,raw.recipient_id,s.owner_id,(select auth.uid()))
 and private.showcase_member_preview_sources(s,raw.snapshot-'verifiedCount',(select auth.uid())));
 return result; end $$;
-- Count-only consent never authorizes a media preview or extra entry metadata.
do $$declare source text; begin source:=pg_get_functiondef('private.showcase_can_read_media(text,text)'::regprocedure);
 if position('and a.status in (''pending'',''approved'')' in source)=0 then raise exception 'missing_showcase_preview_guard'; end if;
 execute replace(source,'and a.status in (''pending'',''approved'')','and not a.count_only and a.status in (''pending'',''approved'')'); end $$;
-- Pending roster reviewers retain no source-media access after membership or
-- visibility withdrawal. Reused third-party media requires uploader permission
-- before it can be signed through an approval preview.
create function private.showcase_approval_preview_current(p_approval private.showcase_approvals,p_showcase private.profile_showcases,p_entry jsonb,p_viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not p_approval.count_only and p_approval.revision=p_showcase.revision and p_approval.audience=p_showcase.audience
 and p_approval.audience_group_id is not distinct from p_showcase.audience_group_id
 and p_approval.audience_person_ids=p_showcase.audience_person_ids and p_approval.status in ('pending','approved')
 and (p_approval.snapshot-'verifiedCount')=p_entry and private.memory_actor_active(p_showcase.owner_id)
 and not private.meetup_block_exists(p_showcase.owner_id,p_viewer) and private.showcase_entry_valid(p_entry,p_showcase.owner_id)
 and (p_approval.recipient_id=p_viewer or (p_approval.role='group' and private.group_member_role(p_approval.scope::uuid,p_viewer) in ('owner','admin')))
 and (p_approval.scope not like 'member:%' or (p_approval.role='person' and p_approval.scope='member:'||p_approval.recipient_id::text
 and private.showcase_member_current((p_entry->>'groupId')::uuid,p_approval.recipient_id,p_showcase.owner_id,p_viewer)
 and private.showcase_member_preview_sources(p_showcase,p_entry,p_viewer))); $$;
create or replace function private.showcase_can_read_media(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.account_is_active() and private.current_user_is_ready(false) and exists(select 1 from private.profile_showcases s,
 jsonb_array_elements(s.entries) e,jsonb_array_elements(e->'media') m where
 ((s.owner_id=(select auth.uid()) and (not m?'sourceUploadId' or exists(select 1 from private.media_uploads u where u.id=(m->>'sourceUploadId')::uuid
 and (u.owner_id=(select auth.uid()) or (u.target_type='meetup_memory' and private.memory_post_visible(u.id,(select auth.uid())))))))
 or (private.showcase_visible(s,(select auth.uid())) and private.showcase_entry_live(s,e,(select auth.uid())))
 or exists(select 1 from private.showcase_approvals a where a.showcase_id=s.id and a.entry_id=(e->>'id')::uuid
 and private.showcase_approval_preview_current(a,s,e,(select auth.uid()))))
 and ((p_bucket='showcase-media' and exists(select 1 from private.showcase_media x join private.media_uploads u on u.id=x.id and u.status='approved'
 where x.id=(m->>'id')::uuid and x.showcase_id=s.id and x.entry_id=(e->>'id')::uuid and p_path in(x.storage_path,x.poster_path)))
 or (m?'sourceUploadId' and not exists(select 1 from private.media_uploads u where u.id=(m->>'sourceUploadId')::uuid and private.meetup_block_exists(u.owner_id,(select auth.uid())))
 and private.showcase_source((m->>'sourceUploadId')::uuid)->>'bucket'=p_bucket
 and p_path in(private.showcase_source((m->>'sourceUploadId')::uuid)->>'storagePath',private.showcase_source((m->>'sourceUploadId')::uuid)->>'posterPath')
 and private.showcase_source_allowed((m->>'sourceUploadId')::uuid,s.owner_id,e->'meetupIds')
 and exists(select 1 from private.media_uploads uploader where uploader.id=(m->>'sourceUploadId')::uuid
 and (uploader.owner_id=(select auth.uid()) or uploader.owner_id=s.owner_id
 or private.showcase_consent_given(s,(e->>'id')::uuid,'media',m->>'sourceUploadId',uploader.owner_id)))))); $$;
alter function private.showcase_respond_approval_impl(uuid,text) rename to showcase_respond_before_member_guards;
create function private.showcase_respond_approval_impl(p_id uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); item private.showcase_approvals; showcase private.profile_showcases; begin
 select * into item from private.showcase_approvals where id=p_id and recipient_id=caller;
 if item.scope like 'member:%' then
 select * into showcase from private.profile_showcases where id=item.showcase_id;
 if item.scope<>'member:'||caller::text or not private.showcase_member_current((item.snapshot->>'groupId')::uuid,caller,showcase.owner_id,caller)
 or not private.showcase_member_preview_sources(showcase,item.snapshot-'verifiedCount',caller) then
 raise exception using errcode='42501',message='showcase_approval_unavailable'; end if; end if;
 perform private.showcase_respond_before_member_guards(p_id,p_action); end $$;

alter function private.export_account_impl() rename to export_account_before_showcase_member_preferences;
create function private.export_account_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 return private.export_account_before_showcase_member_preferences()||jsonb_build_object('showcaseGroupMemberPreferences',coalesce((select jsonb_agg(to_jsonb(p))
 from private.showcase_group_member_preferences p where p.profile_id=(select auth.uid())),'[]')); end $$;
do $$declare fn record; begin
 for fn in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and (p.proname like 'showcase_%' or p.proname in ('export_account_impl','export_account_before_showcase_member_preferences')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
 if fn.nspname='public' or (fn.proname like 'showcase_%_impl' and fn.proname<>'showcase_publish_impl')
 or fn.proname in ('showcase_can_read_media','export_account_impl') then execute format('grant execute on function %s to authenticated',fn.signature); end if;
 end loop; end $$;
notify pgrst,'reload schema';
