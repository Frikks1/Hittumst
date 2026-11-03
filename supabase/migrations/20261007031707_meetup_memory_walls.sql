-- A wall belongs to one occurrence. Attendance and host cover media stay private
-- and independent; only explicit public sharing creates a memory post.
create table private.meetup_memory_walls (
 meetup_id uuid primary key references public.meetups(id) on delete cascade,
 enabled boolean not null default false,
 title text not null default 'Wall of memories' check(length(btrim(title)) between 1 and 100),
 description text not null default '' check(length(description)<=1000),
 layout text not null default 'grid' check(layout in ('grid','feed')),
 accent_color text not null default '#C65A3A' check(accent_color ~ '^#[0-9A-Fa-f]{6}$')
);
create table private.meetup_memories (
 id uuid primary key,
 meetup_id uuid not null references public.meetups(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('photo','video')),
 storage_path text not null unique,
 poster_path text,
 caption text not null default '' check(length(caption)<=2000),
 pinned boolean not null default false,
 created_at timestamptz not null default now()
);
create index meetup_memories_wall on private.meetup_memories(meetup_id,pinned desc,created_at desc,id desc);
create index meetup_memories_author on private.meetup_memories(author_id,meetup_id);
create table private.meetup_memory_likes (
 post_id uuid not null references private.meetup_memories(id) on delete cascade,
 profile_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post_id,profile_id)
);
create index meetup_memory_likes_profile on private.meetup_memory_likes(profile_id);
create table private.meetup_memory_comments (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references private.meetup_memories(id) on delete cascade,
 author_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index meetup_memory_comments_post on private.meetup_memory_comments(post_id,created_at,id);
create index meetup_memory_comments_author on private.meetup_memory_comments(author_id);
alter table private.meetup_memory_walls enable row level security;
alter table private.meetup_memories enable row level security;
alter table private.meetup_memory_likes enable row level security;
alter table private.meetup_memory_comments enable row level security;
revoke all on private.meetup_memory_walls,private.meetup_memories,private.meetup_memory_likes,private.meetup_memory_comments from public,anon,authenticated,service_role;
-- Invoker wrappers need namespace access, but no private table access.
grant usage on schema private to anon;
alter table private.media_cleanup_jobs drop constraint media_cleanup_jobs_bucket_check;
alter table private.media_cleanup_jobs add constraint media_cleanup_jobs_bucket_check check(bucket in ('media-quarantine','meetup-media'));

create function private.memory_actor_active(p_profile uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.meetup_actor_is_active(p_profile) and exists(select 1 from public.profiles p
 where p.id=p_profile and p.deletion_requested_at is null and not exists(
 select 1 from private.media_restore_quarantine q where q.account_id=p.id));
$$;
-- Protected addresses remain protected. The public payload never reads location,
-- venue access, participation, invitations, diagnoses or profile details.
create function private.memory_public_meetup(p_meetup uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.meetup_feature_is_enabled() and exists(select 1 from public.meetups m
 join public.profiles h on h.id=m.host_id where m.id=p_meetup and m.status='published'
 and m.access_mode='open' and not m.is_explicit and m.category<>'private_adult'
 and coalesce(m.event_profile->>'joinMode','public')='public'
 and not private.diagnosis_restricted(m.id) and h.meetup_hosting_restricted_at is null
 and private.memory_actor_active(h.id));
$$;
create function private.memory_can_manage(p_meetup uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.account_is_active() and private.meetup_current_user_can_host()
 and exists(select 1 from public.meetups where id=p_meetup and host_id=(select auth.uid()) and status in ('draft','published'));
$$;
create function private.memory_wall_visible(p_meetup uuid,p_viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.memory_public_meetup(p_meetup) and exists(select 1 from private.meetup_memory_walls w
 join public.meetups m on m.id=w.meetup_id where w.meetup_id=p_meetup and w.enabled
 and (p_viewer is null or (private.account_is_active() and private.memory_actor_active(p_viewer)
 and not private.meetup_block_exists(m.host_id,p_viewer))));
$$;
create function private.memory_can_post(p_meetup uuid,p_author uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.memory_actor_active(p_author) and private.memory_public_meetup(p_meetup)
 and exists(select 1 from private.meetup_memory_walls w join public.meetups m on m.id=w.meetup_id
 where m.id=p_meetup and w.enabled and m.starts_at<=now() and not private.meetup_block_exists(m.host_id,p_author)
 and (m.host_id=p_author or exists(select 1 from private.community_attendance a
 where a.meetup_id=m.id and a.profile_id=p_author))
 and not exists(select 1 from public.meetup_participations p where p.meetup_id=m.id and p.profile_id=p_author and p.status='removed'));
$$;
create function private.memory_post_visible(p_post uuid,p_viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.meetup_memories x join public.meetups m on m.id=x.meetup_id
 join private.media_uploads u on u.id=x.id and u.status='approved' and u.target_type='meetup_memory'
 where x.id=p_post and private.memory_wall_visible(x.meetup_id,p_viewer) and private.memory_actor_active(x.author_id)
 and not private.meetup_block_exists(m.host_id,x.author_id)
 and (p_viewer is null or not private.meetup_block_exists(x.author_id,p_viewer)));
$$;
create function private.memory_reply_visible(p_author uuid,p_post uuid,p_viewer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.memory_actor_active(p_author) and exists(select 1 from private.meetup_memories x
 join public.meetups m on m.id=x.meetup_id where x.id=p_post
 and not private.meetup_block_exists(p_author,m.host_id) and not private.meetup_block_exists(p_author,x.author_id)
 and (p_viewer is null or not private.meetup_block_exists(p_author,p_viewer)));
$$;
create function private.memory_author_name(p_meetup uuid,p_author uuid) returns text
language sql immutable security invoker set search_path='' as $$
 select 'Member '||upper(substr(md5(p_meetup::text||':'||p_author::text),1,6));
$$;
create function private.memory_settings(p_meetup uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',coalesce(w.enabled,false),'title',coalesce(w.title,'Wall of memories'),
 'description',coalesce(w.description,''),'layout',coalesce(w.layout,'grid'),'accentColor',coalesce(w.accent_color,'#C65A3A'))
 from (select p_meetup id) m left join private.meetup_memory_walls w on w.meetup_id=m.id;
$$;
create function private.memory_post_payload(p_post uuid,p_viewer uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',x.id,'meetupId',x.meetup_id,
 'authorId',case when p_viewer is not null then x.author_id else null end,
 'authorName',private.memory_author_name(x.meetup_id,x.author_id),'kind',x.kind,'storagePath',x.storage_path,
 'posterPath',x.poster_path,'caption',x.caption,'createdAt',x.created_at,'pinned',x.pinned,
 'likeCount',(select count(*) from private.meetup_memory_likes l where l.post_id=x.id and private.memory_reply_visible(l.profile_id,x.id,p_viewer)),
 'commentCount',(select count(*) from private.meetup_memory_comments c where c.post_id=x.id and private.memory_reply_visible(c.author_id,x.id,p_viewer)),
 'likedByViewer',exists(select 1 from private.meetup_memory_likes l where l.post_id=x.id and l.profile_id=p_viewer),
 'canDelete',coalesce(private.account_is_active() and (x.author_id=p_viewer or private.memory_can_manage(x.meetup_id)),false))
 from private.meetup_memories x where x.id=p_post;
$$;
create function private.get_meetup_memory_wall_impl(p_meetup_id uuid,p_limit integer,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=(select auth.uid()); manager boolean:=private.memory_can_manage(p_meetup_id); wall_visible boolean; result jsonb; title text;
begin
 if viewer is not null and (not private.account_is_active() or not private.memory_actor_active(viewer)) then raise exception using errcode='42501',message='active_account_required'; end if;
 if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 10000 then raise exception using errcode='22023',message='invalid_memory_page'; end if;
 wall_visible:=private.memory_wall_visible(p_meetup_id,viewer);
 if not wall_visible and not manager then raise exception using errcode='42501',message='memory_wall_unavailable'; end if;
 select m.title into title from public.meetups m where id=p_meetup_id;
 with candidates as (select x.id,x.pinned,x.created_at from private.meetup_memories x
 where x.meetup_id=p_meetup_id and wall_visible and private.memory_post_visible(x.id,viewer)
 order by x.pinned desc,x.created_at desc,x.id desc limit p_limit+1 offset p_offset),
 page as (select * from candidates order by pinned desc,created_at desc,id desc limit p_limit)
 select jsonb_build_object('meetupId',p_meetup_id,'meetupTitle',title,'settings',private.memory_settings(p_meetup_id),
 'canPost',coalesce(viewer is not null and private.memory_can_post(p_meetup_id,viewer),false),
 'canManage',manager,'canInteract',viewer is not null and wall_visible,
 'posts',coalesce((select jsonb_agg(private.memory_post_payload(id,viewer) order by pinned desc,created_at desc,id desc) from page),'[]'),
 'hasMore',(select count(*) from candidates)>p_limit) into result;
 return result;
end $$;
create function private.update_meetup_memory_wall_impl(p_meetup_id uuid,p_settings jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not private.memory_can_manage(p_meetup_id) then raise exception using errcode='42501',message='meetup_host_required'; end if;
 if p_settings is null or jsonb_typeof(p_settings)<>'object' or not p_settings ?& array['enabled','title','description','layout','accentColor']
 or (select count(*) from jsonb_object_keys(p_settings))<>5
 or jsonb_typeof(p_settings->'enabled')<>'boolean' or jsonb_typeof(p_settings->'title')<>'string'
 or jsonb_typeof(p_settings->'description')<>'string' or jsonb_typeof(p_settings->'layout')<>'string' or jsonb_typeof(p_settings->'accentColor')<>'string'
 or length(btrim(p_settings->>'title')) not between 1 and 100 or length(p_settings->>'description')>1000
 or p_settings->>'layout' not in ('grid','feed') or p_settings->>'accentColor' !~ '^#[0-9A-Fa-f]{6}$' then
 raise exception using errcode='22023',message='invalid_memory_wall_settings'; end if;
 -- The host may configure a draft; publication is still checked on every read.
 if (p_settings->>'enabled')::boolean and exists(select 1 from public.meetups m where m.id=p_meetup_id
 and (m.access_mode<>'open' or m.is_explicit or m.category='private_adult' or coalesce(m.event_profile->>'joinMode','public')<>'public' or private.diagnosis_restricted(m.id))) then
 raise exception using errcode='42501',message='memory_wall_public_meetup_required'; end if;
 perform 1 from public.meetups where id=p_meetup_id for update;
 insert into private.meetup_memory_walls(meetup_id,enabled,title,description,layout,accent_color)
 values(p_meetup_id,(p_settings->>'enabled')::boolean,btrim(p_settings->>'title'),btrim(p_settings->>'description'),p_settings->>'layout',p_settings->>'accentColor')
 on conflict(meetup_id) do update set enabled=excluded.enabled,title=excluded.title,description=excluded.description,layout=excluded.layout,accent_color=excluded.accent_color;
 return private.memory_settings(p_meetup_id);
end $$;

-- Extend target eligibility without loosening the host gallery authorization.
alter table private.media_uploads drop constraint media_uploads_target_type_check;
alter table private.media_uploads add constraint media_uploads_target_type_check check(target_type in ('album','profile_photo','profile_video','message','meetup','meetup_memory'));
alter function private.media_target_available(uuid,text,uuid,uuid) rename to media_target_available_before_memories;
create function private.media_target_available(p_owner uuid,p_type text,p_target uuid,p_album uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when p_type='meetup_memory' then private.memory_can_post(p_target,p_owner)
 else private.media_target_available_before_memories(p_owner,p_type,p_target,p_album) end;
$$;
create function private.reserve_meetup_memory_impl(p_meetup_id uuid,p_kind text,p_caption text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.community_require_actor(); upload_id uuid:=gen_random_uuid(); used integer;
begin
 if p_kind is null or p_kind not in ('photo','video') or p_caption is null or length(p_caption)>2000 then raise exception using errcode='22023',message='invalid_memory_media'; end if;
 if not private.memory_can_post(p_meetup_id,caller) then raise exception using errcode='42501',message='verified_attendee_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text||':media:meetup_memory:'||p_meetup_id::text,0));
 select count(*) into used from private.meetup_memories where meetup_id=p_meetup_id and author_id=caller;
 used:=used+(select count(*) from private.media_uploads where owner_id=caller and target_type='meetup_memory' and target_id=p_meetup_id
 and status in ('reserved','processing','appealed') and (expires_at>now() or status='appealed'));
 if used>=30 then raise exception using errcode='23514',message='memory_media_limit_reached'; end if;
 insert into private.media_uploads(id,owner_id,target_type,target_id,media_type,object_path,metadata)
 values(upload_id,caller,'meetup_memory',p_meetup_id,case when p_kind='photo' then 'image' else 'video' end,
 caller::text||'/'||upload_id::text,jsonb_build_object('caption',btrim(p_caption)));
 return jsonb_build_object('id',upload_id,'path',caller::text||'/'||upload_id::text,'bucket','media-quarantine','expiresAt',now()+interval '1 hour');
end $$;
alter function private.finish_media_impl(uuid,uuid,integer,integer,text,text,text) rename to finish_media_before_memories;
create function private.finish_media_impl(p_id uuid,p_claim uuid,p_bytes integer,p_duration integer,p_path text,p_thumbnail text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare job private.media_uploads; expected text;
begin
 perform private.require_service_role();
 select * into job from private.media_uploads where id=p_id for update;
 if not found or job.target_type<>'meetup_memory' then return private.finish_media_before_memories(p_id,p_claim,p_bytes,p_duration,p_path,p_thumbnail,p_reason); end if;
 if p_claim is null or job.claim_id is distinct from p_claim or job.status<>'processing' or job.expires_at<now() then return false; end if;
 if not private.media_target_available(job.owner_id,job.target_type,job.target_id,null) then
 update private.media_uploads set status='rejected',rejection_reason='media_target_unavailable',claim_id=null where id=p_id;
 return false; end if;
 if p_reason is not null then update private.media_uploads set status='rejected',rejection_reason=p_reason,claim_id=null where id=p_id; return true; end if;
 expected:=job.target_id::text||'/'||job.id::text||case when job.media_type='image' then '.jpg' else '.mp4' end;
 if p_path is distinct from expected or p_bytes is null or p_bytes not between 1 and 52428800
 or (job.media_type='video' and (p_duration is null or p_duration<1 or p_thumbnail is distinct from job.target_id::text||'/'||job.id::text||'-thumb.jpg'))
 or (job.media_type='image' and (p_thumbnail is not null or p_duration is not null)) then raise exception 'invalid_verified_media'; end if;
 perform pg_advisory_xact_lock(hashtextextended(job.owner_id::text||':media:meetup_memory:'||job.target_id::text,0));
 insert into private.meetup_memories(id,meetup_id,author_id,kind,storage_path,poster_path,caption)
 values(job.id,job.target_id,job.owner_id,case when job.media_type='image' then 'photo' else 'video' end,p_path,p_thumbnail,coalesce(job.metadata->>'caption',''));
 update private.media_uploads set status='approved',verified_bytes=p_bytes,verified_duration_ms=p_duration,normalized_path=p_path,thumbnail_path=p_thumbnail,claim_id=null where id=p_id;
 insert into private.media_cleanup_jobs(bucket,name) values('media-quarantine',job.object_path) on conflict do nothing;
 return true;
end $$;
-- Public read permission applies only to approved wall posts, never host gallery
-- or raw evidence. Buckets remain private; clients issue five-minute signed URLs.
create function private.can_read_meetup_memory(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.meetup_memories x where (x.storage_path=p_path or x.poster_path=p_path)
 and private.memory_post_visible(x.id,(select auth.uid())));
$$;
create policy meetup_memory_read on storage.objects for select to anon,authenticated
using(bucket_id='meetup-media' and private.can_read_meetup_memory(name));

create function private.memory_require_interaction(p_post uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=private.community_require_actor();
begin
 if not private.memory_post_visible(p_post,caller) then raise exception using errcode='42501',message='memory_unavailable'; end if;
 return caller;
end $$;
create function private.set_meetup_memory_like_impl(p_post_id uuid,p_liked boolean) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.memory_require_interaction(p_post_id);
begin
 if p_liked is null then raise exception using errcode='22023',message='invalid_memory_like'; end if;
 if p_liked then insert into private.meetup_memory_likes(post_id,profile_id) values(p_post_id,caller) on conflict do nothing;
 else delete from private.meetup_memory_likes where post_id=p_post_id and profile_id=caller; end if;
end $$;
create function private.memory_comment_payload(p_comment uuid,p_viewer uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'postId',c.post_id,'authorId',case when p_viewer is not null then c.author_id else null end,
 'authorName',private.memory_author_name(x.meetup_id,c.author_id),'body',c.body,'createdAt',c.created_at,
 'canDelete',coalesce(private.account_is_active() and (c.author_id=p_viewer or private.memory_can_manage(x.meetup_id)),false))
 from private.meetup_memory_comments c join private.meetup_memories x on x.id=c.post_id where c.id=p_comment;
$$;
create function private.list_meetup_memory_comments_impl(p_post_id uuid,p_limit integer,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=(select auth.uid());
begin
 if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 10000 then raise exception using errcode='22023',message='invalid_memory_page'; end if;
 if not private.memory_post_visible(p_post_id,viewer) then raise exception using errcode='42501',message='memory_unavailable'; end if;
 return coalesce((select jsonb_agg(private.memory_comment_payload(c.id,viewer) order by c.created_at,c.id)
 from (select c.id,c.created_at from private.meetup_memory_comments c where c.post_id=p_post_id
 and private.memory_reply_visible(c.author_id,p_post_id,viewer) order by c.created_at,c.id limit p_limit offset p_offset) c),'[]');
end $$;
create function private.add_meetup_memory_comment_impl(p_post_id uuid,p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.memory_require_interaction(p_post_id); comment_id uuid;
begin
 if p_body is null or length(btrim(p_body)) not between 1 and 2000 then raise exception using errcode='22023',message='invalid_memory_comment'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text||':memory-comments',0));
 if (select count(*) from private.meetup_memory_comments where author_id=caller and created_at>now()-interval '1 minute')>=10 then
 raise exception using errcode='23514',message='memory_comment_rate_limit'; end if;
 insert into private.meetup_memory_comments(post_id,author_id,body) values(p_post_id,caller,btrim(p_body)) returning id into comment_id;
 return private.memory_comment_payload(comment_id,caller);
end $$;
create function private.delete_meetup_memory_comment_impl(p_comment_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.community_require_actor(); item record;
begin
 select c.author_id,x.meetup_id into item from private.meetup_memory_comments c join private.meetup_memories x on x.id=c.post_id where c.id=p_comment_id;
 if not found or (item.author_id<>caller and not private.memory_can_manage(item.meetup_id)) then raise exception using errcode='42501',message='memory_comment_unavailable'; end if;
 delete from private.meetup_memory_comments where id=p_comment_id;
end $$;
create function private.delete_meetup_memory_impl(p_post_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=private.community_require_actor(); item private.meetup_memories;
begin
 select * into item from private.meetup_memories where id=p_post_id for update;
 if not found or (item.author_id<>caller and not private.memory_can_manage(item.meetup_id)) then raise exception using errcode='42501',message='memory_unavailable'; end if;
 delete from private.meetup_memories where id=p_post_id;
end $$;
create function private.pin_meetup_memory_impl(p_post_id uuid,p_pinned boolean) returns void
language plpgsql security definer set search_path='' as $$
declare item private.meetup_memories;
begin
 select * into item from private.meetup_memories where id=p_post_id;
 if not found or not private.memory_can_manage(item.meetup_id) then raise exception using errcode='42501',message='meetup_host_required'; end if;
 if p_pinned is null then raise exception using errcode='22023',message='invalid_memory_pin'; end if;
 update private.meetup_memories set pinned=p_pinned where id=p_post_id;
end $$;
-- Cascade deletion of an occurrence/account also queues normalized objects and
-- posters. Pending/processing uploads become ineligible, then the same cleanup
-- worker drains originals after any active processing lease.
create function private.memory_deleted_cleanup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.media_cleanup_jobs(bucket,name) values('meetup-media',old.storage_path) on conflict do nothing;
 if old.poster_path is not null then insert into private.media_cleanup_jobs(bucket,name) values('meetup-media',old.poster_path) on conflict do nothing; end if;
 update private.media_uploads set status='rejected',rejection_reason='memory_deleted',claim_id=null where id=old.id;
 return old;
end $$;
create trigger memory_deleted_cleanup after delete on private.meetup_memories for each row execute function private.memory_deleted_cleanup();
create function private.memory_upload_cleanup() returns trigger
language plpgsql security definer set search_path='' as $$
declare item private.media_uploads; available timestamptz;
begin
 item:=case when tg_op='DELETE' then old else new end;
 if item.target_type<>'meetup_memory' then return item; end if;
 if tg_op='DELETE' or item.status='rejected' then
 -- UPDATE sees the rejected NEW row, so retain the worker lease from OLD.
 -- Otherwise cleanup could race a processor that is still writing its output.
 available:=greatest(now(),case when old.status='processing' then old.expires_at else now() end);
 insert into private.media_cleanup_jobs(bucket,name,available_at)
 values('meetup-media',item.target_id::text||'/'||item.id::text||case when item.media_type='image' then '.jpg' else '.mp4' end,available) on conflict do nothing;
 if item.media_type='video' then insert into private.media_cleanup_jobs(bucket,name,available_at)
 values('meetup-media',item.target_id::text||'/'||item.id::text||'-thumb.jpg',available) on conflict do nothing; end if;
 if tg_op='DELETE' or item.rejection_reason in ('memory_deleted','upload_cancelled','media_target_unavailable') then
 insert into private.media_cleanup_jobs(bucket,name,available_at) values('media-quarantine',item.object_path,available) on conflict do nothing; end if;
 end if;
 return item;
end $$;
create trigger memory_upload_cleanup after update of status or delete on private.media_uploads for each row execute function private.memory_upload_cleanup();
create function private.memory_occurrence_deleted() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.media_uploads set status='rejected',rejection_reason='media_target_unavailable',claim_id=null
 where target_type='meetup_memory' and target_id=old.id and status in ('reserved','processing','appealed');
 return old;
end $$;
create trigger memory_occurrence_deleted before delete on public.meetups for each row execute function private.memory_occurrence_deleted();

-- Preserve account export/deletion and disaster recovery ownership for attendee
-- output paths, which are occurrence-prefixed rather than account-prefixed.
alter function private.account_owns_stored_object(uuid,text,text,text) rename to account_owns_stored_object_before_memories;
create function private.account_owns_stored_object(p_account uuid,p_bucket text,p_name text,p_owner text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.account_owns_stored_object_before_memories(p_account,p_bucket,p_name,p_owner)
 or (p_bucket='meetup-media' and exists(select 1 from private.media_uploads u where u.owner_id=p_account and u.target_type='meetup_memory'
 and p_name in (u.target_id::text||'/'||u.id::text||case when u.media_type='image' then '.jpg' else '.mp4' end,u.target_id::text||'/'||u.id::text||'-thumb.jpg')));
$$;
alter function private.owns_export_media(text,text,text) rename to owns_export_media_before_memories;
create function private.owns_export_media(p_bucket text,p_name text,p_owner text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.owns_export_media_before_memories(p_bucket,p_name,p_owner) or (p_bucket='meetup-media'
 and exists(select 1 from private.meetup_memories x where x.author_id=(select auth.uid()) and (x.storage_path=p_name or x.poster_path=p_name)));
$$;
alter function private.export_account_impl() rename to export_account_before_memories;
create function private.export_account_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 return private.export_account_before_memories()||jsonb_build_object(
 'meetupMemories',coalesce((select jsonb_agg(to_jsonb(x)) from private.meetup_memories x where x.author_id=(select auth.uid())),'[]'),
 'meetupMemoryComments',coalesce((select jsonb_agg(to_jsonb(c)) from private.meetup_memory_comments c where c.author_id=(select auth.uid())),'[]'),
 'meetupMemoryLikes',coalesce((select jsonb_agg(to_jsonb(l)) from private.meetup_memory_likes l where l.profile_id=(select auth.uid())),'[]'));
end $$;
create or replace view private.recoverable_media as
select 'profile-photos'::text bucket,x.storage_path name,p.id owner_id from public.profile_photos x join public.profiles p on p.id=x.profile_id
where x.approval_status='approved' and p.deletion_requested_at is null and p.moderation_status='active'
union select 'profile-videos',x.storage_path,p.id from public.profile_videos x join public.profiles p on p.id=x.profile_id
where x.approval_status='approved' and p.deletion_requested_at is null and p.moderation_status='active'
union select 'album-media',x.storage_path,p.id from public.album_items x join public.albums a on a.id=x.album_id join public.profiles p on p.id=x.owner_id
where x.deleted_at is null and a.deleted_at is null and p.deletion_requested_at is null and p.moderation_status='active'
union select 'album-media',u.thumbnail_path,p.id from private.media_uploads u join public.album_items x on x.storage_path=u.normalized_path
join public.albums a on a.id=x.album_id join public.profiles p on p.id=x.owner_id
where u.status='approved' and u.thumbnail_path is not null and x.deleted_at is null and a.deleted_at is null and p.deletion_requested_at is null and p.moderation_status='active'
union select 'message-images',x.image_path,p.id from public.messages x join public.profiles p on p.id=x.sender_id
where x.deleted_at is null and x.media_status='approved' and x.image_path is not null and p.deletion_requested_at is null and p.moderation_status='active'
union select 'meetup-media',x.storage_path,p.id from private.meetup_media x join public.meetups m on m.id=x.meetup_id join public.profiles p on p.id=m.host_id
where m.status in ('draft','published') and p.deletion_requested_at is null and p.moderation_status='active'
union select 'meetup-media',x.poster_path,p.id from private.meetup_media x join public.meetups m on m.id=x.meetup_id join public.profiles p on p.id=m.host_id
where x.poster_path is not null and m.status in ('draft','published') and p.deletion_requested_at is null and p.moderation_status='active'
union select 'meetup-media',x.storage_path,x.author_id from private.meetup_memories x join private.media_uploads u on u.id=x.id
where u.status='approved' and private.memory_actor_active(x.author_id) and private.memory_public_meetup(x.meetup_id)
union select 'meetup-media',x.poster_path,x.author_id from private.meetup_memories x join private.media_uploads u on u.id=x.id
where x.poster_path is not null and u.status='approved' and private.memory_actor_active(x.author_id) and private.memory_public_meetup(x.meetup_id);

create function public.get_meetup_memory_wall(p_meetup_id uuid,p_limit integer default 30,p_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$select private.get_meetup_memory_wall_impl(p_meetup_id,p_limit,p_offset);$$;
create function public.update_meetup_memory_wall(p_meetup_id uuid,p_settings jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.update_meetup_memory_wall_impl(p_meetup_id,p_settings);$$;
create function public.reserve_meetup_memory(p_meetup_id uuid,p_kind text,p_caption text default '') returns jsonb language sql security invoker set search_path='' as $$select private.reserve_meetup_memory_impl(p_meetup_id,p_kind,p_caption);$$;
create function public.set_meetup_memory_like(p_post_id uuid,p_liked boolean) returns void language sql security invoker set search_path='' as $$select private.set_meetup_memory_like_impl(p_post_id,p_liked);$$;
create function public.list_meetup_memory_comments(p_post_id uuid,p_limit integer default 50,p_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$select private.list_meetup_memory_comments_impl(p_post_id,p_limit,p_offset);$$;
create function public.add_meetup_memory_comment(p_post_id uuid,p_body text) returns jsonb language sql security invoker set search_path='' as $$select private.add_meetup_memory_comment_impl(p_post_id,p_body);$$;
create function public.delete_meetup_memory_comment(p_comment_id uuid) returns void language sql security invoker set search_path='' as $$select private.delete_meetup_memory_comment_impl(p_comment_id);$$;
create function public.delete_meetup_memory(p_post_id uuid) returns void language sql security invoker set search_path='' as $$select private.delete_meetup_memory_impl(p_post_id);$$;
create function public.pin_meetup_memory(p_post_id uuid,p_pinned boolean) returns void language sql security invoker set search_path='' as $$select private.pin_meetup_memory_impl(p_post_id,p_pinned);$$;

-- Explicitly expose only wrappers. No new security-definer function is public.
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and (p.proname like 'memory_%' or p.proname like '%meetup_memory%'
 or p.proname in ('reserve_meetup_memory_impl','reserve_meetup_memory','media_target_available','media_target_available_before_memories',
 'finish_media_impl','finish_media_before_memories','account_owns_stored_object','account_owns_stored_object_before_memories',
 'owns_export_media','owns_export_media_before_memories','export_account_impl','export_account_before_memories')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
 if fn.nspname='public' or fn.proname in ('get_meetup_memory_wall_impl','update_meetup_memory_wall_impl','reserve_meetup_memory_impl',
 'set_meetup_memory_like_impl','list_meetup_memory_comments_impl','add_meetup_memory_comment_impl','delete_meetup_memory_comment_impl',
 'delete_meetup_memory_impl','pin_meetup_memory_impl','can_read_meetup_memory','export_account_impl') then
 execute format('grant execute on function %s to authenticated',fn.signature); end if;
 if fn.proname in ('get_meetup_memory_wall','get_meetup_memory_wall_impl','list_meetup_memory_comments','list_meetup_memory_comments_impl','can_read_meetup_memory') then
 execute format('grant execute on function %s to anon',fn.signature); end if;
 if fn.proname='finish_media_impl' then execute format('grant execute on function %s to service_role',fn.signature); end if;
 end loop;
end $$;
notify pgrst,'reload schema';
