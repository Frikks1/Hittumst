-- Curated profile disclosures are independent of private participation history.
-- Every edit is a new revision. Consent is scoped to that revision and audience.
create table private.profile_showcases (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
 template text not null check(template in ('hittingar','people','groups','passions','creations','milestones','places','together')),
 title text not null check(length(btrim(title)) between 1 and 80), introduction text not null default '' check(length(introduction)<=500),
 layout text not null default 'list' check(layout in ('list','gallery')), audience text check(audience in ('everyone','friends','no_one')),
 status text not null default 'draft' check(status in ('draft','published')), revision integer not null default 1 check(revision>0),
 position integer not null default 0 check(position>=0), cover_media_id uuid,
 entries jsonb not null default '[]' check(jsonb_typeof(entries)='array' and jsonb_array_length(entries)<=50), count_values jsonb not null default '{}', count_contributors jsonb not null default '{}', group_self_authorizations jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index profile_showcases_owner on private.profile_showcases(owner_id,position,id);
create table private.showcase_approvals (
 id uuid primary key default gen_random_uuid(), showcase_id uuid not null references private.profile_showcases(id) on delete cascade,
 entry_id uuid not null, revision integer not null, audience text not null check(audience in ('everyone','friends','no_one')),
 role text not null check(role in ('person','group','host','media')), scope text not null, count_only boolean not null default false,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','approved','declined','revoked')),
 snapshot jsonb not null, created_at timestamptz not null default now(), responded_at timestamptz, responded_by uuid references public.profiles(id) on delete set null,
 unique(showcase_id,entry_id,revision,audience,role,scope,recipient_id)
);
create index showcase_approvals_recipient on private.showcase_approvals(recipient_id,status,created_at);
create table private.showcase_media (
 id uuid primary key, showcase_id uuid not null references private.profile_showcases(id) on delete cascade,
 entry_id uuid not null, owner_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('photo','video')), storage_path text not null unique, poster_path text,
 caption text not null default '' check(length(caption)<=2000), created_at timestamptz not null default now()
);
alter table private.profile_showcases enable row level security;
alter table private.showcase_approvals enable row level security;
alter table private.showcase_media enable row level security;
revoke all on private.profile_showcases,private.showcase_approvals,private.showcase_media from public,anon,authenticated,service_role;

create function private.showcase_actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); begin
 if caller is null or not private.account_is_active() or not private.current_user_is_ready(false) or not private.memory_actor_active(caller) then
 raise exception using errcode='42501',message='active_account_required'; end if; return caller; end $$;
create function private.showcase_profile_visible(p_profile uuid,p_viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.account_is_active() and private.current_user_is_ready(true) and private.memory_actor_active(p_profile)
 and exists(select 1 from public.profiles p where p.id=p_profile and p.is_profile_visible and p.moderation_status='active'
 and private.discovery_target_allowed(p.id)) and not private.meetup_block_exists(p_profile,p_viewer);
$$;
create function private.showcase_event_eligible(p_event uuid,p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.meetups m where m.id=p_event and m.status='published' and m.effective_end<=now()
 and not m.is_explicit and m.category<>'private_adult' and not private.diagnosis_restricted(m.id)
 and private.memory_actor_active(m.host_id) and not private.meetup_block_exists(m.host_id,p_owner)
 and exists(select 1 from public.profiles h where h.id=m.host_id and h.meetup_hosting_restricted_at is null)
 and exists(select 1 from private.community_attendance a where a.meetup_id=m.id and a.profile_id=p_owner));
$$;
create function private.showcase_requirement_eligible(p_event uuid,p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.community_event_visible(p_event,p_owner) and exists(select 1 from public.meetups m where m.id=p_event and m.status='published'
 and not m.is_explicit and m.category<>'private_adult' and not private.diagnosis_restricted(m.id)); $$;
create function private.showcase_count_events(p_owner uuid,p_person uuid,p_events jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(m.id order by m.id),'[]') from public.meetups m
 join private.community_attendance a on a.meetup_id=m.id and a.profile_id=p_owner
 where m.effective_end<=now() and private.showcase_event_eligible(m.id,p_owner)
 and (p_person is null or exists(select 1 from private.community_attendance b where b.meetup_id=m.id and b.profile_id=p_person))
 and (m.id in (select value::uuid from jsonb_array_elements_text(p_events)) or m.series_id in
 (select s.series_id from public.meetups s where s.id in(select value::uuid from jsonb_array_elements_text(p_events)) and s.series_id is not null));
$$;
create function private.showcase_shared_count(p_owner uuid,p_person uuid,p_events jsonb) returns integer
language sql stable security definer set search_path='' as $$select jsonb_array_length(private.showcase_count_events(p_owner,p_person,p_events));$$;
create function private.showcase_source(p_upload uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('id',u.id,'sourceUploadId',u.id,'kind',case when u.media_type='image' then 'photo' else 'video' end,
 'uploaderId',u.owner_id,'caption',coalesce(u.metadata->>'caption',''),'bucket',case u.target_type when 'album' then 'album-media'
 when 'profile_photo' then 'profile-photos' when 'profile_video' then 'profile-videos' else 'meetup-media' end,
 'storagePath',u.normalized_path)||case when u.thumbnail_path is not null then jsonb_build_object('posterPath',u.thumbnail_path) else '{}' end
 ||case when u.target_type in ('meetup','meetup_memory') then jsonb_build_object('meetupId',u.target_id) else '{}' end)
 from private.media_uploads u where u.id=p_upload and u.status='approved' and u.normalized_path is not null
 and private.memory_actor_active(u.owner_id) and (
 (u.target_type='meetup_memory' and exists(select 1 from private.meetup_memories x where x.id=u.id and x.storage_path=u.normalized_path))
 or (u.target_type='meetup' and exists(select 1 from private.meetup_media x join public.meetups m on m.id=x.meetup_id
 where x.storage_path=u.normalized_path and m.status='published'))
 or (u.target_type='profile_photo' and exists(select 1 from public.profile_photos x where x.storage_path=u.normalized_path and x.approval_status='approved'))
 or (u.target_type='profile_video' and exists(select 1 from public.profile_videos x where x.storage_path=u.normalized_path and x.approval_status='approved'))
 or (u.target_type='album' and exists(select 1 from public.album_items x join public.albums a on a.id=x.album_id
 where x.storage_path=u.normalized_path and x.deleted_at is null and a.deleted_at is null)));
$$;
create function private.showcase_source_allowed(p_upload uuid,p_owner uuid,p_events jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select private.showcase_source(p_upload) is not null and exists(select 1 from private.media_uploads u where u.id=p_upload and
 ((u.owner_id=p_owner and u.target_type in ('album','profile_photo','profile_video'))
 or (u.target_type='meetup_memory' and u.target_id in(select value::uuid from jsonb_array_elements_text(p_events))
 and private.memory_post_visible(u.id,p_owner))
 or (u.target_type='meetup' and u.target_id in(select value::uuid from jsonb_array_elements_text(p_events))
 and private.showcase_event_eligible(u.target_id,p_owner))));
$$;
create function private.showcase_entry_valid(p_entry jsonb,p_owner uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare event_id uuid; medium jsonb; req jsonb; person uuid; grp uuid; begin
 if jsonb_typeof(p_entry)<>'object' or p_entry-array['id','kind','title','body','personId','groupId','groupName','meetupIds','review','reviewIdentified','rating','showCount','media','requirements']<>'{}' then return false; end if;
 if not extensions.jsonb_matches_schema('{"type":"object","required":["id","kind","title","body","meetupIds","review","reviewIdentified","rating","showCount","media"],"properties":{"id":{"type":"string","format":"uuid"},"kind":{"enum":["story","event","person","group"]},"title":{"type":"string","maxLength":80},"body":{"type":"string","maxLength":2000},"personId":{"type":"string","format":"uuid"},"groupId":{"type":"string","format":"uuid"},"groupName":{"type":"string","maxLength":80},"meetupIds":{"type":"array","maxItems":50,"uniqueItems":true,"items":{"type":"string","format":"uuid"}},"review":{"type":"string","maxLength":2000},"reviewIdentified":{"type":"boolean"},"rating":{"type":["integer","null"],"minimum":1,"maximum":5},"showCount":{"type":"boolean"},"media":{"type":"array","maxItems":12,"items":{"type":"object","required":["id","kind","caption"],"properties":{"id":{"type":"string","format":"uuid"},"kind":{"enum":["photo","video"]},"sourceUploadId":{"type":"string","format":"uuid"},"caption":{"type":"string","maxLength":2000}},"additionalProperties":false}},"requirements":{"type":"object","properties":{"minAge":{"type":"integer","minimum":18,"maximum":120},"maxAge":{"type":"integer","minimum":18,"maximum":120},"memberType":{"type":"string","maxLength":120},"meetupId":{"type":"string","format":"uuid"},"sponsorMeetupId":{"type":"string","format":"uuid"},"minSponsorIsk":{"type":"integer","minimum":0,"maximum":100000000},"text":{"type":"string","maxLength":2000}},"additionalProperties":false}},"additionalProperties":false}'::json,p_entry) then return false; end if;
 person:=(p_entry->>'personId')::uuid; grp:=(p_entry->>'groupId')::uuid; req:=p_entry->'requirements';
 if p_entry->>'kind'='person' then
 if person is null or person=p_owner or not private.profiles_are_friends(p_owner,person) or not private.memory_actor_active(person) or private.meetup_block_exists(p_owner,person) then return false; end if;
 elsif person is not null then return false; end if;
 if p_entry->>'kind'='group' then
 if grp is null or private.group_member_role(grp,p_owner) is null or not exists(select 1 from public.groups where id=grp and status='active') then return false; end if;
 elsif grp is not null or req is not null or p_entry?'groupName' then return false; end if;
 if req is not null then
 if req?'minAge' and req?'maxAge' and (req->>'minAge')::int>(req->>'maxAge')::int then return false; end if;
 if req?'minSponsorIsk' and not req?'sponsorMeetupId' then return false; end if;
 if exists(select 1 from jsonb_each_text(req) k where k.key in ('meetupId','sponsorMeetupId') and not private.showcase_requirement_eligible(k.value::uuid,p_owner)) then return false; end if;
 end if;
 if p_entry->>'kind'='event' and jsonb_array_length(p_entry->'meetupIds')=0 then return false; end if;
 if (select count(distinct m->>'id') from jsonb_array_elements(p_entry->'media') m)<>jsonb_array_length(p_entry->'media') then return false; end if;
 if ((p_entry->>'rating') is not null or p_entry->>'review'<>'') and p_entry->>'kind'<>'event' then return false; end if;
 if p_entry->>'review'<>'' and not (p_entry->>'reviewIdentified')::boolean then return false; end if;
 for event_id in select value::uuid from jsonb_array_elements_text(p_entry->'meetupIds') loop
 if not private.showcase_event_eligible(event_id,p_owner) then return false; end if;
 if person is not null and not exists(select 1 from private.community_attendance where meetup_id=event_id and profile_id=person) then return false; end if;
 end loop;
 for medium in select value from jsonb_array_elements(p_entry->'media') loop
 if medium?'sourceUploadId' then
 if not private.showcase_source_allowed((medium->>'sourceUploadId')::uuid,p_owner,p_entry->'meetupIds')
 or private.showcase_source((medium->>'sourceUploadId')::uuid)->>'kind'<>medium->>'kind' then return false; end if;
 end if;
 end loop; return true;
exception when invalid_text_representation then return false; end $$;

create function private.showcase_has_consent(p_showcase private.profile_showcases,p_entry uuid,p_count boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.showcase_approvals a where a.showcase_id=p_showcase.id and a.entry_id=p_entry
 and a.revision=p_showcase.revision and a.audience=p_showcase.audience and a.count_only=p_count
 and (a.status<>'approved' or not private.memory_actor_active(a.recipient_id) or private.meetup_block_exists(a.recipient_id,p_showcase.owner_id)
 or (a.role='group' and (a.responded_by is null or not private.memory_actor_active(a.responded_by)
 or private.meetup_block_exists(a.responded_by,p_showcase.owner_id)
 or coalesce(private.group_member_role(a.scope::uuid,a.responded_by) not in ('owner','admin'),true)))
 or (a.role='host' and not exists(select 1 from public.meetups m where m.id=replace(a.scope,'count:','')::uuid and m.host_id=a.recipient_id and m.status='published'))
 or (a.role='media' and not exists(select 1 from private.media_uploads u where u.id=a.scope::uuid and u.owner_id=a.recipient_id and u.status='approved'))));
$$;
create function private.showcase_consent_given(p_showcase private.profile_showcases,p_entry uuid,p_role text,p_scope text,p_recipient uuid,p_count boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.showcase_approvals a where a.showcase_id=p_showcase.id and a.entry_id=p_entry
 and a.revision=p_showcase.revision and a.audience=p_showcase.audience and a.role=p_role and a.scope=p_scope
 and a.recipient_id=p_recipient and a.count_only=p_count and a.status='approved'); $$;
create function private.showcase_entry_live(p_showcase private.profile_showcases,p_entry jsonb,p_viewer uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare event_id uuid; event_host uuid; uploader uuid; medium jsonb; person uuid:=(p_entry->>'personId')::uuid; begin
 if not private.showcase_entry_valid(p_entry,p_showcase.owner_id) or not private.showcase_has_consent(p_showcase,(p_entry->>'id')::uuid,false) then return false; end if;
 if person is not null and not private.showcase_profile_visible(person,p_viewer) then return false; end if;
 if person is not null and not private.showcase_consent_given(p_showcase,(p_entry->>'id')::uuid,'person','identity',person) then return false; end if;
 if p_entry?'groupId' and coalesce((p_showcase.group_self_authorizations->>(p_entry->>'id'))::boolean,false)
 and coalesce(private.group_member_role((p_entry->>'groupId')::uuid,p_showcase.owner_id),'') not in ('owner','admin') then return false; end if;
 if p_entry?'groupId' and not coalesce((p_showcase.group_self_authorizations->>(p_entry->>'id'))::boolean,false)
 and not exists(select 1 from private.showcase_approvals a where a.showcase_id=p_showcase.id and a.entry_id=(p_entry->>'id')::uuid
 and a.revision=p_showcase.revision and a.audience=p_showcase.audience and a.role='group' and a.scope=p_entry->>'groupId' and a.status='approved') then return false; end if;
 for event_id in select value::uuid from jsonb_array_elements_text(p_entry->'meetupIds') union
 select value::uuid from jsonb_each_text(coalesce(p_entry->'requirements','{}')) where key in ('meetupId','sponsorMeetupId') loop
 if not private.community_event_visible(event_id,p_viewer) then return false; end if;
 select host_id into event_host from public.meetups where id=event_id;
 if not private.memory_public_meetup(event_id) and event_host<>p_showcase.owner_id
 and not private.showcase_consent_given(p_showcase,(p_entry->>'id')::uuid,'host',event_id::text,event_host) then return false; end if;
 end loop;
 for medium in select value from jsonb_array_elements(p_entry->'media') loop
 if medium?'sourceUploadId' then
 if private.showcase_source((medium->>'sourceUploadId')::uuid) is null then return false; end if;
 select owner_id into uploader from private.media_uploads where id=(medium->>'sourceUploadId')::uuid;
 if uploader<>p_showcase.owner_id and not private.showcase_consent_given(p_showcase,(p_entry->>'id')::uuid,'media',medium->>'sourceUploadId',uploader) then return false; end if;
 if exists(select 1 from private.media_uploads u where u.id=(medium->>'sourceUploadId')::uuid and private.meetup_block_exists(u.owner_id,p_viewer)) then return false; end if;
 elsif not exists(select 1 from private.showcase_media x join private.media_uploads u on u.id=x.id
 where x.id=(medium->>'id')::uuid and x.showcase_id=p_showcase.id and x.entry_id=(p_entry->>'id')::uuid and x.kind=medium->>'kind' and u.status='approved') then return false;
 end if;
 end loop; return true; end $$;
create function private.showcase_entry_payload(p_showcase private.profile_showcases,p_entry jsonb,p_owner boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare media jsonb; count_value integer; approval text; result jsonb; begin
 select coalesce(jsonb_agg(m.value||case when m.value?'sourceUploadId' then
 coalesce(private.showcase_source((m.value->>'sourceUploadId')::uuid)-'uploaderId','{}')||jsonb_build_object('id',m.value->>'id','caption',m.value->>'caption')
 else coalesce((select jsonb_build_object('bucket','showcase-media','storagePath',x.storage_path,'status','approved')||case when x.poster_path is not null then jsonb_build_object('posterPath',x.poster_path) else '{}' end
 from private.showcase_media x join private.media_uploads u on u.id=x.id and u.status='approved'
 where x.id=(m.value->>'id')::uuid and x.showcase_id=p_showcase.id and x.entry_id=(p_entry->>'id')::uuid),
 case when p_owner then jsonb_build_object('status',coalesce((select case when u.status='rejected' then 'rejected' else 'pending' end
 from private.media_uploads u where u.id=(m.value->>'id')::uuid and u.owner_id=p_showcase.owner_id and u.target_type='showcase' and u.target_id=p_showcase.id),'rejected')) else '{}' end) end order by m.ordinality),'[]')
 into media from jsonb_array_elements(p_entry->'media') with ordinality m(value,ordinality);
 count_value:=case when (p_entry->>'showCount')::boolean then case when p_showcase.status='published' then (p_showcase.count_values->>(p_entry->>'id'))::integer
 else private.showcase_shared_count(p_showcase.owner_id,(p_entry->>'personId')::uuid,p_entry->'meetupIds') end else null end;
 if not p_owner and (not private.showcase_has_consent(p_showcase,(p_entry->>'id')::uuid,true) or exists(select 1 from private.showcase_approvals a
 where a.showcase_id=p_showcase.id and a.entry_id=(p_entry->>'id')::uuid and a.revision=p_showcase.revision and a.audience=p_showcase.audience
 and a.count_only and (a.snapshot->>'verifiedCount')::integer is distinct from count_value)
 or (p_entry?'personId' and not private.showcase_consent_given(p_showcase,(p_entry->>'id')::uuid,'person','count',(p_entry->>'personId')::uuid,true))
 or exists(select 1 from jsonb_array_elements_text(coalesce(p_showcase.count_contributors->(p_entry->>'id'),'[]')) stored(id)
 where not private.showcase_event_eligible(stored.id::uuid,p_showcase.owner_id)
 or ((p_entry->>'personId') is not null and not exists(select 1 from private.community_attendance b where b.meetup_id=stored.id::uuid and b.profile_id=(p_entry->>'personId')::uuid))
 or not private.community_event_visible(stored.id::uuid,(select auth.uid()))
 or (not private.memory_public_meetup(stored.id::uuid) and exists(select 1 from public.meetups m where m.id=stored.id::uuid and m.host_id<>p_showcase.owner_id
 and not private.showcase_consent_given(p_showcase,(p_entry->>'id')::uuid,'host','count:'||stored.id,m.host_id,true))))) then count_value:=null; end if;
 approval:=case when p_showcase.status='draft' then 'draft' when private.showcase_has_consent(p_showcase,(p_entry->>'id')::uuid,false) then 'approved' else 'pending' end;
 result:=p_entry||jsonb_build_object('media',media,'verifiedCount',count_value,'approvalStatus',approval,'meetups',
 coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',m.title)) from public.meetups m where m.id in(select value::uuid from jsonb_array_elements_text(p_entry->'meetupIds'))),'[]'));
 if result?'requirements' then result:=result||jsonb_build_object('requirementsInformational',true,'requirementMeetups',
 coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',m.title)) from public.meetups m where m.id in
 (select value::uuid from jsonb_each_text(result->'requirements') where key in ('meetupId','sponsorMeetupId'))),'[]')); end if;
 return result; end $$;
create function private.showcase_visible(p_showcase private.profile_showcases,p_viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_showcase.status='published' and p_showcase.audience<>'no_one' and private.showcase_profile_visible(p_showcase.owner_id,p_viewer)
 and (p_showcase.audience='everyone' or private.profiles_are_friends(p_showcase.owner_id,p_viewer));
$$;
create function private.showcase_payload(p_showcase private.profile_showcases,p_owner boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb; begin
 select coalesce(jsonb_agg(private.showcase_entry_payload(p_showcase,x.value,p_owner) order by x.ordinality),'[]') into items
 from jsonb_array_elements(p_showcase.entries) with ordinality x(value,ordinality)
 where p_owner or private.showcase_entry_live(p_showcase,x.value,(select auth.uid()));
 return jsonb_build_object('id',p_showcase.id,'ownerId',p_showcase.owner_id,'template',p_showcase.template,'title',p_showcase.title,
 'introduction',p_showcase.introduction,'layout',p_showcase.layout,'audience',p_showcase.audience,'status',p_showcase.status,
 'revision',p_showcase.revision,'order',p_showcase.position,'coverMediaId',case when exists(select 1 from jsonb_array_elements(items) e,
 jsonb_array_elements(e->'media') m where m->>'id'=p_showcase.cover_media_id::text) then p_showcase.cover_media_id else null end,'entries',items); end $$;

create function private.showcase_list_own_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); begin return coalesce((select jsonb_agg(private.showcase_payload(s,true) order by position,id)
 from private.profile_showcases s where owner_id=caller),'[]'); end $$;
create function private.showcase_list_profile_impl(p_owner_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); begin
 if caller=p_owner_id then return private.showcase_list_own_impl(); end if;
 return coalesce((select jsonb_agg(private.showcase_payload(s,false) order by position,id) from private.profile_showcases s
 where owner_id=p_owner_id and private.showcase_visible(s,caller) and exists(select 1 from jsonb_array_elements(s.entries) e where private.showcase_entry_live(s,e,caller))),'[]'); end $$;
create function private.showcase_get_impl(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); item private.profile_showcases; begin
 select * into item from private.profile_showcases where id=p_id;
 if item.id is null or (item.owner_id<>caller and (not private.showcase_visible(item,caller) or not exists(select 1 from jsonb_array_elements(item.entries) e where private.showcase_entry_live(item,e,caller)))) then raise exception using errcode='42501',message='showcase_unavailable'; end if;
 return private.showcase_payload(item,item.owner_id=caller); end $$;
create function private.showcase_save_impl(p_id uuid,p_expected_revision integer,p_template text,p_title text,p_introduction text,p_layout text,p_cover_media_id uuid,p_entries jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); item private.profile_showcases; entry jsonb; medium jsonb; begin
 perform pg_advisory_xact_lock(hashtextextended(caller::text||':showcases',0));
 if p_expected_revision is null or jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)>50
 or p_title is null or length(btrim(p_title)) not between 1 and 80 or p_introduction is null or length(p_introduction)>500
 or p_template is null or p_template not in ('hittingar','people','groups','passions','creations','milestones','places','together') or p_layout is null or p_layout not in ('list','gallery') then
 raise exception using errcode='22023',message='invalid_showcase'; end if;
 if p_id is null then
 if p_expected_revision<>0 then raise exception using errcode='40001',message='showcase_revision_conflict'; end if;
 if (select count(*) from private.profile_showcases where owner_id=caller)>=20 then raise exception using errcode='23514',message='showcase_limit'; end if;
 else
 select * into item from private.profile_showcases where id=p_id and owner_id=caller for update;
 if item.id is null then raise exception using errcode='42501',message='showcase_unavailable'; end if;
 if item.revision<>p_expected_revision then raise exception using errcode='40001',message='showcase_revision_conflict'; end if; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_entries))<>jsonb_array_length(p_entries) then raise exception using errcode='22023',message='invalid_showcase_entries'; end if;
 for entry in select value from jsonb_array_elements(p_entries) loop
 if not private.showcase_entry_valid(entry,caller) then raise exception using errcode='22023',message='invalid_showcase_entry'; end if;
 for medium in select value from jsonb_array_elements(entry->'media') loop
 if not medium?'sourceUploadId' and not exists(select 1 from private.media_uploads x where x.id=(medium->>'id')::uuid and x.target_type='showcase' and x.target_id=item.id
 and x.metadata->>'entryId'=entry->>'id' and x.owner_id=caller and x.media_type=case when medium->>'kind'='photo' then 'image' else 'video' end) then raise exception using errcode='42501',message='showcase_media_unavailable'; end if; end loop;
 end loop;
 if p_cover_media_id is not null and not exists(select 1 from jsonb_array_elements(p_entries) e,jsonb_array_elements(e->'media') m where m->>'id'=p_cover_media_id::text) then raise exception using errcode='22023',message='invalid_showcase_cover'; end if;
 if item.id is null then insert into private.profile_showcases(owner_id,template,title,introduction,layout,cover_media_id,entries,position)
 values(caller,p_template,btrim(p_title),p_introduction,p_layout,p_cover_media_id,p_entries,(select count(*) from private.profile_showcases where owner_id=caller)) returning * into item;
 else update private.profile_showcases set template=p_template,title=btrim(p_title),introduction=p_introduction,layout=p_layout,cover_media_id=p_cover_media_id,
 entries=p_entries,status='draft',audience=null,count_values='{}',revision=revision+1,updated_at=now() where id=item.id returning * into item;
 update private.showcase_approvals set status='revoked',responded_at=now() where showcase_id=item.id and status='pending'; end if;
 delete from private.showcase_media x where x.showcase_id=item.id and not exists(select 1 from jsonb_array_elements(p_entries) e,jsonb_array_elements(e->'media') m
 where e->>'id'=x.entry_id::text and m->>'id'=x.id::text and not m?'sourceUploadId');
 update private.media_uploads u set status='rejected',rejection_reason='showcase_deleted',claim_id=null where u.target_type='showcase' and u.target_id=item.id
 and u.status in ('reserved','processing','appealed') and not exists(select 1 from jsonb_array_elements(p_entries) e,jsonb_array_elements(e->'media') m
 where e->>'id'=u.metadata->>'entryId' and m->>'id'=u.id::text and not m?'sourceUploadId');
 return private.showcase_payload(item,true); end $$;

create function private.showcase_request(p_showcase private.profile_showcases,p_entry jsonb,p_role text,p_scope text,p_recipient uuid,p_count boolean default false) returns void
language plpgsql security definer set search_path='' as $$ begin
 if p_recipient is null or p_recipient=p_showcase.owner_id then return; end if;
 insert into private.showcase_approvals(showcase_id,entry_id,revision,audience,role,scope,recipient_id,count_only,snapshot)
 values(p_showcase.id,(p_entry->>'id')::uuid,p_showcase.revision,p_showcase.audience,p_role,p_scope,p_recipient,p_count,
 p_entry||case when p_count then jsonb_build_object('verifiedCount',(p_showcase.count_values->>(p_entry->>'id'))::integer) else '{}' end)
 on conflict do nothing; end $$;
create function private.showcase_publish_impl(p_id uuid,p_audience text,p_expected_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); item private.profile_showcases; entry jsonb; event_id uuid; medium jsonb; recipient uuid; selected public.meetups; begin
 if p_audience is null or p_audience not in ('everyone','friends','no_one') then raise exception using errcode='22023',message='invalid_showcase_audience'; end if;
 select * into item from private.profile_showcases where id=p_id and owner_id=caller for update;
 if item.id is null then raise exception using errcode='42501',message='showcase_unavailable'; end if;
 if p_expected_revision is null or item.revision<>p_expected_revision then raise exception using errcode='40001',message='showcase_revision_conflict'; end if;
 for entry in select value from jsonb_array_elements(item.entries) loop
 if not private.showcase_entry_valid(entry,caller) then raise exception using errcode='42501',message='showcase_entry_unavailable'; end if;
 for medium in select value from jsonb_array_elements(entry->'media') loop
 if not medium?'sourceUploadId' and not exists(select 1 from private.showcase_media x join private.media_uploads u on u.id=x.id and u.status='approved'
 where x.id=(medium->>'id')::uuid and x.showcase_id=item.id and x.entry_id=(entry->>'id')::uuid) then raise exception using errcode='42501',message='showcase_media_pending'; end if; end loop;
 end loop;
 update private.profile_showcases set status='published',audience=p_audience,revision=revision+1,updated_at=now(),count_values=coalesce((select jsonb_object_agg(e->>'id',
 private.showcase_shared_count(caller,(e->>'personId')::uuid,e->'meetupIds')) from jsonb_array_elements(entries) e where (e->>'showCount')::boolean),'{}'),
 count_contributors=coalesce((select jsonb_object_agg(e->>'id',private.showcase_count_events(caller,(e->>'personId')::uuid,e->'meetupIds'))
 from jsonb_array_elements(entries) e where (e->>'showCount')::boolean),'{}'),group_self_authorizations=coalesce((select jsonb_object_agg(e->>'id',true)
 from jsonb_array_elements(entries) e where e?'groupId' and private.group_member_role((e->>'groupId')::uuid,caller) in ('owner','admin')),'{}')
 where id=p_id returning * into item;
 for entry in select value from jsonb_array_elements(item.entries) loop
 if entry?'personId' then
 perform private.showcase_request(item,entry,'person','identity',(entry->>'personId')::uuid);
 if (entry->>'showCount')::boolean then perform private.showcase_request(item,entry,'person','count',(entry->>'personId')::uuid,true); end if; end if;
 if entry?'groupId' and coalesce(private.group_member_role((entry->>'groupId')::uuid,caller),'') not in ('owner','admin') then select g.owner_id into recipient from public.groups g where g.id=(entry->>'groupId')::uuid;
 perform private.showcase_request(item,entry,'group',entry->>'groupId',recipient); end if;
 for event_id in select value::uuid from jsonb_array_elements_text(entry->'meetupIds') union
 select value::uuid from jsonb_each_text(coalesce(entry->'requirements','{}')) where key in ('meetupId','sponsorMeetupId') loop
 select * into selected from public.meetups where id=event_id;
 if not private.memory_public_meetup(event_id) then perform private.showcase_request(item,entry,'host',event_id::text,selected.host_id); end if; end loop;
 if (entry->>'showCount')::boolean then
 for selected in select m.* from public.meetups m join private.community_attendance a on a.meetup_id=m.id and a.profile_id=caller
 where private.showcase_event_eligible(m.id,caller) and (not entry?'personId' or exists(select 1 from private.community_attendance b where b.meetup_id=m.id and b.profile_id=(entry->>'personId')::uuid))
 and (m.id in(select value::uuid from jsonb_array_elements_text(entry->'meetupIds')) or m.series_id in(select s.series_id from public.meetups s
 where s.id in(select value::uuid from jsonb_array_elements_text(entry->'meetupIds')) and s.series_id is not null)) loop
 if not private.memory_public_meetup(selected.id) then perform private.showcase_request(item,entry,'host','count:'||selected.id::text,selected.host_id,true); end if; end loop; end if;
 for medium in select value from jsonb_array_elements(entry->'media') loop
 if medium?'sourceUploadId' then select owner_id into recipient from private.media_uploads where id=(medium->>'sourceUploadId')::uuid;
 perform private.showcase_request(item,entry,'media',medium->>'sourceUploadId',recipient); end if; end loop;
 end loop; return private.showcase_payload(item,true); end $$;
create function private.showcase_unpublish_impl(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); item private.profile_showcases; begin
 update private.profile_showcases set status='draft',audience=null,revision=revision+1,count_values='{}',updated_at=now() where id=p_id and owner_id=caller returning * into item;
 if item.id is null then raise exception using errcode='42501',message='showcase_unavailable'; end if; return private.showcase_payload(item,true); end $$;
create function private.showcase_delete_impl(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); begin delete from private.profile_showcases where id=p_id and owner_id=caller;
 if not found then raise exception using errcode='42501',message='showcase_unavailable'; end if; end $$;
create function private.showcase_reorder_impl(p_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); begin
 perform pg_advisory_xact_lock(hashtextextended(caller::text||':showcases',0));
 if p_ids is null or cardinality(p_ids)<> (select count(*) from private.profile_showcases where owner_id=caller)
 or (select count(distinct x) from unnest(p_ids) x)<>cardinality(p_ids)
 or exists(select 1 from unnest(p_ids) x where x is null or not exists(select 1 from private.profile_showcases s where s.id=x and s.owner_id=caller)) then
 raise exception using errcode='22023',message='invalid_showcase_order'; end if;
 update private.profile_showcases s set position=x.ordinality-1 from unnest(p_ids) with ordinality x(id,ordinality) where s.id=x.id and s.owner_id=caller; end $$;

create function private.showcase_list_approvals_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'showcaseId',a.showcase_id,'entryId',a.entry_id,'revision',a.revision,'role',a.role,
 'recipientId',case when a.role='group' then coalesce(a.responded_by,a.recipient_id) else a.recipient_id end,'status',a.status,'audience',a.audience,'showcaseTitle',s.title,'entryTitle',a.snapshot->>'title','entryBody',a.snapshot->>'body',
 'snapshot',private.showcase_entry_payload(s,a.snapshot-'verifiedCount',true)||case when a.count_only then jsonb_build_object('verifiedCount',a.snapshot->'verifiedCount') else '{}' end,'countOnly',a.count_only) order by a.created_at desc) from private.showcase_approvals a join private.profile_showcases s on s.id=a.showcase_id
 where (a.recipient_id=caller or (a.role='group' and private.group_member_role(a.scope::uuid,caller) in ('owner','admin')))
 and a.revision=s.revision and a.audience=s.audience and not private.meetup_block_exists(s.owner_id,caller)
 and private.memory_actor_active(s.owner_id) and private.showcase_entry_valid(a.snapshot-'verifiedCount',s.owner_id)
 and not ((a.snapshot?'personId') and private.meetup_block_exists((a.snapshot->>'personId')::uuid,caller))
 and not exists(select 1 from jsonb_array_elements(a.snapshot->'media') m join private.media_uploads u on u.id=(m->>'sourceUploadId')::uuid
 where private.meetup_block_exists(u.owner_id,caller))),'[]'); end $$;
create function private.showcase_respond_approval_impl(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); item private.showcase_approvals; showcase private.profile_showcases; entry jsonb; begin
 if p_action is null or p_action not in ('approve','decline','revoke') then raise exception using errcode='22023',message='invalid_showcase_approval'; end if;
 select * into item from private.showcase_approvals where id=p_id and (recipient_id=caller or (role='group' and private.group_member_role(scope::uuid,caller) in ('owner','admin'))) for update;
 select * into showcase from private.profile_showcases where id=item.showcase_id for update;
 select value into entry from jsonb_array_elements(showcase.entries) where value->>'id'=item.entry_id::text;
 if item.id is null or item.revision<>showcase.revision or item.audience<>showcase.audience or entry is null
 or private.meetup_block_exists(caller,showcase.owner_id) or not private.memory_actor_active(showcase.owner_id)
 or (item.snapshot-'verifiedCount')<>entry or (item.role='group' and coalesce(private.group_member_role(item.scope::uuid,caller) not in ('owner','admin'),true)) then
 raise exception using errcode='42501',message='showcase_approval_unavailable'; end if;
 if p_action='approve' and not private.showcase_entry_valid(entry,showcase.owner_id) then raise exception using errcode='42501',message='showcase_entry_unavailable'; end if;
 update private.showcase_approvals set status=case p_action when 'approve' then 'approved' when 'decline' then 'declined' else 'revoked' end,responded_at=now(),responded_by=caller where id=p_id; end $$;

create function private.showcase_pickers_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); events jsonb; requirement_events jsonb; friends jsonb; groups jsonb; media jsonb; begin
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'seriesId',m.series_id,'private',not private.memory_public_meetup(m.id),
 'ownReview',coalesce((select body from private.community_recommendations r where r.meetup_id=m.id and r.author_id=caller),'')) order by m.effective_end desc),'[]') into events
 from public.meetups m where private.showcase_event_eligible(m.id,caller);
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name) order by p.display_name),'[]') into friends
 from public.profiles p where p.id<>caller and private.profiles_are_friends(caller,p.id) and private.memory_actor_active(p.id) and not private.meetup_block_exists(caller,p.id);
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name) order by g.name),'[]') into groups from public.groups g
 where g.status='active' and private.group_member_role(g.id,caller) is not null;
 select coalesce(jsonb_agg(private.showcase_source(u.id) order by u.created_at desc),'[]') into media from private.media_uploads u
 where u.status='approved' and (u.owner_id=caller or u.target_id in(select (value->>'id')::uuid from jsonb_array_elements(events)))
 and private.showcase_source_allowed(u.id,caller,coalesce((select jsonb_agg(value->>'id') from jsonb_array_elements(events)),'[]'));
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'private',not private.memory_public_meetup(m.id)) order by m.starts_at desc),'[]')
 into requirement_events from public.meetups m where private.showcase_requirement_eligible(m.id,caller);
 return jsonb_build_object('events',events,'requirementEvents',requirement_events,'friends',friends,'groups',groups,'media',media); end $$;

-- Moderation uses the established quarantine/claim/finish pipeline.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('showcase-media','showcase-media',false,52428800,array['image/jpeg','video/mp4']) on conflict(id) do nothing;
alter table private.media_cleanup_jobs drop constraint media_cleanup_jobs_bucket_check;
alter table private.media_cleanup_jobs add constraint media_cleanup_jobs_bucket_check check(bucket in ('media-quarantine','meetup-media','showcase-media'));
alter table private.media_uploads drop constraint media_uploads_target_type_check;
alter table private.media_uploads add constraint media_uploads_target_type_check check(target_type in ('album','profile_photo','profile_video','message','meetup','meetup_memory','showcase'));
alter function private.media_target_available(uuid,text,uuid,uuid) rename to media_target_available_before_showcases;
create function private.media_target_available(p_owner uuid,p_type text,p_target uuid,p_album uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case when p_type='showcase' then private.memory_actor_active(p_owner) and exists(select 1 from private.profile_showcases where id=p_target and owner_id=p_owner)
 else private.media_target_available_before_showcases(p_owner,p_type,p_target,p_album) end; $$;
create function private.showcase_reserve_media_impl(p_showcase_id uuid,p_entry_id uuid,p_kind text,p_caption text) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); upload_id uuid:=gen_random_uuid(); item private.profile_showcases; begin
 select * into item from private.profile_showcases where id=p_showcase_id and owner_id=caller for update;
 if item.id is null or not exists(select 1 from jsonb_array_elements(item.entries) e where e->>'id'=p_entry_id::text) then raise exception using errcode='42501',message='showcase_unavailable'; end if;
 if p_kind is null or p_kind not in ('photo','video') or p_caption is null or length(p_caption)>2000 then raise exception using errcode='22023',message='invalid_showcase_media'; end if;
 if exists(select 1 from jsonb_array_elements(item.entries) e where e->>'id'=p_entry_id::text and jsonb_array_length(e->'media')>=12) then raise exception using errcode='23514',message='showcase_entry_media_limit'; end if;
 if (select count(*) from private.media_uploads where owner_id=caller and target_type='showcase' and target_id=p_showcase_id and
 (status='approved' or status='appealed' or (status in ('reserved','processing') and expires_at>now())))>=60 then raise exception using errcode='23514',message='showcase_media_limit'; end if;
 insert into private.media_uploads(id,owner_id,target_type,target_id,media_type,object_path,metadata) values(upload_id,caller,'showcase',p_showcase_id,
 case when p_kind='photo' then 'image' else 'video' end,caller::text||'/'||upload_id::text,jsonb_build_object('entryId',p_entry_id,'caption',p_caption));
 update private.profile_showcases set entries=(select jsonb_agg(case when e->>'id'=p_entry_id::text then
 jsonb_set(e,'{media}',(e->'media')||jsonb_build_array(jsonb_build_object('id',upload_id,'kind',p_kind,'caption',p_caption))) else e end order by ord)
 from jsonb_array_elements(entries) with ordinality x(e,ord)),status='draft',audience=null,revision=revision+1,count_values='{}',updated_at=now() where id=p_showcase_id;
 return jsonb_build_object('id',upload_id,'bucket','media-quarantine','path',caller::text||'/'||upload_id::text); end $$;
alter function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) rename to finish_media_before_showcases;
create function private.finish_media_impl(p_id uuid,p_claim uuid,p_bytes integer,p_duration integer,p_path text,p_thumbnail text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare job private.media_uploads; expected text; begin
 perform private.require_service_role(); select * into job from private.media_uploads where id=p_id for update;
 if not found or job.target_type<>'showcase' then return private.finish_media_before_showcases(p_id,p_claim,p_bytes,p_duration,p_path,p_thumbnail,p_reason); end if;
 if p_claim is null or job.claim_id is distinct from p_claim or job.status<>'processing' or job.expires_at<now() then return false; end if;
 if not private.media_target_available(job.owner_id,job.target_type,job.target_id,null) or not exists(select 1 from private.profile_showcases s,jsonb_array_elements(s.entries) e
 where s.id=job.target_id and e->>'id'=job.metadata->>'entryId') then
 update private.media_uploads set status='rejected',rejection_reason='media_target_unavailable',claim_id=null where id=p_id; return false; end if;
 if p_reason is not null then update private.media_uploads set status='rejected',rejection_reason=p_reason,claim_id=null where id=p_id; return true; end if;
 expected:=job.target_id::text||'/'||job.id::text||case when job.media_type='image' then '.jpg' else '.mp4' end;
 if p_path is distinct from expected or p_bytes is null or p_bytes not between 1 and 52428800
 or (job.media_type='video' and (p_duration is null or p_duration<1 or p_thumbnail is distinct from job.target_id::text||'/'||job.id::text||'-thumb.jpg'))
 or (job.media_type='image' and (p_thumbnail is not null or p_duration is not null)) then raise exception 'invalid_verified_media'; end if;
 insert into private.showcase_media(id,showcase_id,entry_id,owner_id,kind,storage_path,poster_path,caption) values(job.id,job.target_id,(job.metadata->>'entryId')::uuid,
 job.owner_id,case when job.media_type='image' then 'photo' else 'video' end,p_path,p_thumbnail,coalesce(job.metadata->>'caption',''));
 update private.media_uploads set status='approved',verified_bytes=p_bytes,verified_duration_ms=p_duration,normalized_path=p_path,thumbnail_path=p_thumbnail,claim_id=null where id=p_id;
 insert into private.media_cleanup_jobs(bucket,name) values('media-quarantine',job.object_path) on conflict do nothing; return true; end $$;
create function private.showcase_can_read_media(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.account_is_active() and private.current_user_is_ready(false) and exists(select 1 from private.profile_showcases s,
 jsonb_array_elements(s.entries) e,jsonb_array_elements(e->'media') m where
 ((s.owner_id=(select auth.uid()) and (not m?'sourceUploadId' or exists(select 1 from private.media_uploads u where u.id=(m->>'sourceUploadId')::uuid
 and (u.owner_id=(select auth.uid()) or (u.target_type='meetup_memory' and private.memory_post_visible(u.id,(select auth.uid())))))))
 or (private.showcase_visible(s,(select auth.uid())) and private.showcase_entry_live(s,e,(select auth.uid())))
 or exists(select 1 from private.showcase_approvals a where a.showcase_id=s.id and a.entry_id=(e->>'id')::uuid and a.revision=s.revision
 and a.audience=s.audience and (a.recipient_id=(select auth.uid()) or (a.role='group' and private.group_member_role(a.scope::uuid,(select auth.uid())) in ('owner','admin')))
 and a.status in ('pending','approved')
 and (a.snapshot-'verifiedCount')=e and private.memory_actor_active(s.owner_id) and not private.meetup_block_exists(s.owner_id,(select auth.uid()))
 and private.showcase_entry_valid(e,s.owner_id)))
 and ((p_bucket='showcase-media' and exists(select 1 from private.showcase_media x join private.media_uploads u on u.id=x.id and u.status='approved'
 where x.id=(m->>'id')::uuid and x.showcase_id=s.id and x.entry_id=(e->>'id')::uuid and p_path in(x.storage_path,x.poster_path)))
 or (m?'sourceUploadId' and not exists(select 1 from private.media_uploads u where u.id=(m->>'sourceUploadId')::uuid and private.meetup_block_exists(u.owner_id,(select auth.uid())))
 and private.showcase_source((m->>'sourceUploadId')::uuid)->>'bucket'=p_bucket
 and p_path in(private.showcase_source((m->>'sourceUploadId')::uuid)->>'storagePath',private.showcase_source((m->>'sourceUploadId')::uuid)->>'posterPath')
 and private.showcase_source_allowed((m->>'sourceUploadId')::uuid,s.owner_id,e->'meetupIds')))); $$;
create policy showcase_media_read on storage.objects for select to authenticated using(private.showcase_can_read_media(bucket_id,name));
create function private.showcase_deleted_cleanup() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into private.media_cleanup_jobs(bucket,name) values('showcase-media',old.storage_path) on conflict do nothing;
 if old.poster_path is not null then insert into private.media_cleanup_jobs(bucket,name) values('showcase-media',old.poster_path) on conflict do nothing; end if;
 update private.media_uploads set status='rejected',rejection_reason='showcase_deleted',claim_id=null where id=old.id; return old; end $$;
create trigger showcase_deleted_cleanup after delete on private.showcase_media for each row execute function private.showcase_deleted_cleanup();
create function private.showcase_upload_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
declare item private.media_uploads; available timestamptz; begin item:=case when tg_op='DELETE' then old else new end;
 if item.target_type<>'showcase' then return item; end if;
 if tg_op='DELETE' or item.status='rejected' then available:=greatest(now(),case when old.status='processing' then old.expires_at else now() end);
 insert into private.media_cleanup_jobs(bucket,name,available_at) values('showcase-media',item.target_id::text||'/'||item.id::text||case when item.media_type='image' then '.jpg' else '.mp4' end,available) on conflict do nothing;
 if item.media_type='video' then insert into private.media_cleanup_jobs(bucket,name,available_at) values('showcase-media',item.target_id::text||'/'||item.id::text||'-thumb.jpg',available) on conflict do nothing; end if;
 if tg_op='DELETE' or item.rejection_reason in ('showcase_deleted','upload_cancelled','media_target_unavailable') then
 insert into private.media_cleanup_jobs(bucket,name,available_at) values('media-quarantine',item.object_path,available) on conflict do nothing; end if; end if; return item; end $$;
create trigger showcase_upload_cleanup after update of status or delete on private.media_uploads for each row execute function private.showcase_upload_cleanup();
create function private.showcase_delete_uploads() returns trigger language plpgsql security definer set search_path='' as $$ begin
 update private.media_uploads set status='rejected',rejection_reason='showcase_deleted',claim_id=null where target_type='showcase' and target_id=old.id and status in ('reserved','processing','appealed'); return old; end $$;
create trigger showcase_delete_uploads before delete on private.profile_showcases for each row execute function private.showcase_delete_uploads();

alter function private.account_owns_stored_object(uuid,text,text,text) rename to account_owns_stored_object_before_showcases;
create function private.account_owns_stored_object(p_account uuid,p_bucket text,p_name text,p_owner text) returns boolean language sql stable security definer set search_path='' as $$
 select private.account_owns_stored_object_before_showcases(p_account,p_bucket,p_name,p_owner) or (p_bucket='showcase-media' and exists(select 1 from private.media_uploads u
 where u.owner_id=p_account and u.target_type='showcase' and p_name in(u.target_id::text||'/'||u.id::text||case when u.media_type='image' then '.jpg' else '.mp4' end,u.target_id::text||'/'||u.id::text||'-thumb.jpg'))); $$;
alter function private.owns_export_media(text,text,text) rename to owns_export_media_before_showcases;
create function private.owns_export_media(p_bucket text,p_name text,p_owner text) returns boolean language sql stable security definer set search_path='' as $$
 select private.owns_export_media_before_showcases(p_bucket,p_name,p_owner) or (p_bucket='showcase-media' and exists(select 1 from private.showcase_media x
 where x.owner_id=(select auth.uid()) and p_name in(x.storage_path,x.poster_path))); $$;
alter function private.export_account_impl() rename to export_account_before_showcases;
create function private.export_account_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 return private.export_account_before_showcases()||jsonb_build_object(
 'showcases',coalesce((select jsonb_agg(to_jsonb(s)) from private.profile_showcases s where owner_id=caller),'[]'),
 'showcaseApprovals',coalesce((select jsonb_agg(to_jsonb(a)) from private.showcase_approvals a where recipient_id=caller or exists(select 1 from private.profile_showcases s where s.id=a.showcase_id and s.owner_id=caller)),'[]'),
 'showcaseMedia',coalesce((select jsonb_agg(to_jsonb(m)) from private.showcase_media m where owner_id=caller),'[]')); end $$;
-- Preserve all prior recovery sources while adding this private bucket.
alter view private.recoverable_media rename to recoverable_media_before_showcases;
create view private.recoverable_media as select * from private.recoverable_media_before_showcases
union select 'showcase-media'::text,x.storage_path,x.owner_id from private.showcase_media x join private.media_uploads u on u.id=x.id
where u.status='approved' and private.memory_actor_active(x.owner_id)
union select 'showcase-media'::text,x.poster_path,x.owner_id from private.showcase_media x join private.media_uploads u on u.id=x.id
where x.poster_path is not null and u.status='approved' and private.memory_actor_active(x.owner_id);
revoke all on private.recoverable_media,private.recoverable_media_before_showcases from public,anon,authenticated,service_role;

create function private.showcase_report_impl(p_showcase_id uuid,p_entry_id uuid,p_notes text) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.showcase_actor(); item private.profile_showcases; begin
 select * into item from private.profile_showcases where id=p_showcase_id;
 if item.id is null or not private.showcase_visible(item,caller) then raise exception using errcode='42501',message='showcase_unavailable'; end if;
 if p_notes is null or length(p_notes)>2000 or (p_entry_id is not null and not exists(select 1 from jsonb_array_elements(item.entries) e where e->>'id'=p_entry_id::text and private.showcase_entry_live(item,e,caller))) then raise exception using errcode='22023',message='invalid_showcase_report'; end if;
 perform private.consume_write_quota('showcase_report',10,interval '1 hour');
 insert into public.reports(reporter_id,reported_id,category,details) values(caller,item.owner_id,'other',
 'Showcase '||item.id::text||' revision '||item.revision::text||case when p_entry_id is not null then ' entry '||p_entry_id::text else '' end||': '||btrim(p_notes)); end $$;

create function public.showcase_list_own() returns jsonb language sql stable security invoker set search_path='' as $$select private.showcase_list_own_impl();$$;
create function public.showcase_list_profile(p_owner_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.showcase_list_profile_impl(p_owner_id);$$;
create function public.showcase_get(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.showcase_get_impl(p_id);$$;
create function public.showcase_save(p_id uuid,p_expected_revision integer,p_template text,p_title text,p_introduction text,p_layout text,p_cover_media_id uuid,p_entries jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.showcase_save_impl(p_id,p_expected_revision,p_template,p_title,p_introduction,p_layout,p_cover_media_id,p_entries);$$;
create function public.showcase_publish(p_id uuid,p_audience text,p_expected_revision integer) returns jsonb language sql security invoker set search_path='' as $$select private.showcase_publish_impl(p_id,p_audience,p_expected_revision);$$;
create function public.showcase_unpublish(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.showcase_unpublish_impl(p_id);$$;
create function public.showcase_delete(p_id uuid) returns void language sql security invoker set search_path='' as $$select private.showcase_delete_impl(p_id);$$;
create function public.showcase_reorder(p_ids uuid[]) returns void language sql security invoker set search_path='' as $$select private.showcase_reorder_impl(p_ids);$$;
create function public.showcase_pickers() returns jsonb language sql stable security invoker set search_path='' as $$select private.showcase_pickers_impl();$$;
create function public.showcase_list_approvals() returns jsonb language sql stable security invoker set search_path='' as $$select private.showcase_list_approvals_impl();$$;
create function public.showcase_respond_approval(p_id uuid,p_action text) returns void language sql security invoker set search_path='' as $$select private.showcase_respond_approval_impl(p_id,p_action);$$;
create function public.showcase_reserve_media(p_showcase_id uuid,p_entry_id uuid,p_kind text,p_caption text default '') returns jsonb language sql security invoker set search_path='' as $$select private.showcase_reserve_media_impl(p_showcase_id,p_entry_id,p_kind,p_caption);$$;
create function public.showcase_report(p_showcase_id uuid,p_entry_id uuid default null,p_notes text default '') returns void language sql security invoker set search_path='' as $$select private.showcase_report_impl(p_showcase_id,p_entry_id,p_notes);$$;
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and (p.proname like 'showcase_%' or p.proname in ('media_target_available','media_target_available_before_showcases',
 'finish_media_impl','finish_media_before_showcases','account_owns_stored_object','account_owns_stored_object_before_showcases',
 'owns_export_media','owns_export_media_before_showcases','export_account_impl','export_account_before_showcases')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
 if fn.nspname='public' or fn.proname like 'showcase_%_impl' or fn.proname in ('showcase_can_read_media','export_account_impl') then
 execute format('grant execute on function %s to authenticated',fn.signature); end if;
 if fn.proname='finish_media_impl' then execute format('grant execute on function %s to service_role',fn.signature); end if;
 end loop; end $$;
notify pgrst,'reload schema';
