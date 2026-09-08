-- Public profile media, creator tags, and community feedback.
-- User-supplied tags are intentionally separate from the curated My Tags catalog.

alter table public.profiles
  add column if not exists videos text[] not null default '{}',
  add column if not exists socials jsonb not null default '[]'::jsonb,
  add column if not exists interests text[] not null default '{}',
  add column if not exists custom_tags text[] not null default '{}';

alter table public.profile_photos
  add column if not exists tags text[] not null default '{}';

alter table public.profiles
  add constraint profiles_videos_count check (cardinality(videos) <= 3),
  add constraint profiles_custom_tags_count check (cardinality(custom_tags) <= 20);

alter table public.profile_photos
  add constraint profile_photos_tags_count check (cardinality(tags) <= 10);

create table public.profile_videos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  position smallint not null,
  tags text[] not null default '{}',
  byte_size integer not null,
  duration_ms integer not null,
  approval_status text not null default 'pending',
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_videos_position_check check (position between 1 and 3),
  constraint profile_videos_tags_count check (cardinality(tags) <= 10),
  constraint profile_videos_size_check check (byte_size between 1 and 52428800),
  constraint profile_videos_duration_check check (duration_ms between 1 and 10000),
  constraint profile_videos_owner_path_check check (storage_path like profile_id::text || '/%'),
  constraint profile_videos_status_check check (approval_status in ('pending', 'approved', 'rejected')),
  constraint profile_videos_review_shape check (
    (approval_status = 'pending' and reviewed_at is null and reviewed_by is null and rejection_reason is null)
    or (approval_status = 'approved' and reviewed_at is not null and reviewed_by is not null and rejection_reason is null)
    or (approval_status = 'rejected' and reviewed_at is not null and reviewed_by is not null and rejection_reason is not null)
  ),
  unique (profile_id, position)
);

create index profile_videos_public_idx on public.profile_videos (profile_id, position)
  where approval_status = 'approved';

create or replace function private.validate_profile_custom_tags()
returns trigger language plpgsql set search_path = '' as $$
declare value text;
begin
  foreach value in array coalesce(new.custom_tags, '{}') loop
    if char_length(btrim(value)) not between 1 and 30 or value <> btrim(value) then
      raise exception using errcode = '22023', message = 'invalid_custom_tag';
    end if;
  end loop;
  if cardinality(coalesce(new.custom_tags, '{}')) <> (
    select count(distinct lower(item)) from unnest(coalesce(new.custom_tags, '{}')) item
  ) then
    raise exception using errcode = '22023', message = 'duplicate_custom_tag';
  end if;
  return new;
end;
$$;

create trigger profiles_validate_custom_tags before insert or update of custom_tags on public.profiles
for each row execute function private.validate_profile_custom_tags();

create or replace function private.validate_media_custom_tags()
returns trigger language plpgsql set search_path = '' as $$
declare value text;
begin
  foreach value in array coalesce(new.tags, '{}') loop
    if char_length(btrim(value)) not between 1 and 30 or value <> btrim(value) then
      raise exception using errcode = '22023', message = 'invalid_custom_tag';
    end if;
  end loop;
  if cardinality(coalesce(new.tags, '{}')) <> (
    select count(distinct lower(item)) from unnest(coalesce(new.tags, '{}')) item
  ) then raise exception using errcode = '22023', message = 'duplicate_custom_tag'; end if;
  return new;
end;
$$;

create trigger photos_validate_custom_tags before insert or update of tags on public.profile_photos
for each row execute function private.validate_media_custom_tags();
create trigger videos_validate_custom_tags before insert or update of tags on public.profile_videos
for each row execute function private.validate_media_custom_tags();
create trigger profile_videos_set_updated_at before update on public.profile_videos
for each row execute function private.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-videos', 'profile-videos', false, 52428800, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_view_profile_video_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.profile_videos v join public.profiles p on p.id = v.profile_id
    where v.storage_path = p_name and v.approval_status = 'approved' and p.is_profile_visible
      and p.moderation_status = 'active'
  ), false);
$$;

create policy profile_video_objects_select on storage.objects for select to authenticated
using (bucket_id = 'profile-videos' and (
  private.can_view_profile_video_object(name)
  or (storage.foldername(name))[1] = (select auth.uid())::text
));
create policy profile_video_objects_insert on storage.objects for insert to authenticated
with check (bucket_id = 'profile-videos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) in ('mp4', 'mov', 'webm'));
create policy profile_video_objects_delete on storage.objects for delete to authenticated
using (bucket_id = 'profile-videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table public.content_ratings (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  value smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_ratings_target_type check (target_type in ('profile', 'photo', 'video')),
  constraint content_ratings_value check (value in (-1, 1)),
  unique (target_type, target_id, user_id)
);

create table public.content_comments (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  status text not null default 'visible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_comments_target_type check (target_type in ('profile', 'photo', 'video')),
  constraint content_comments_body check (char_length(btrim(body)) between 1 and 500),
  constraint content_comments_status check (status in ('visible', 'hidden'))
);

create index content_ratings_target_idx on public.content_ratings (target_type, target_id);
create index content_comments_target_idx on public.content_comments (target_type, target_id, created_at desc);

create or replace function private.content_target_is_visible(p_type text, p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'profile' then exists (select 1 from public.profiles p where p.id = p_id and p.is_profile_visible and p.moderation_status = 'active')
    when 'photo' then exists (select 1 from public.profile_photos x join public.profiles p on p.id = x.profile_id where x.id = p_id and x.approval_status = 'approved' and p.is_profile_visible and p.moderation_status = 'active')
    when 'video' then exists (select 1 from public.profile_videos x join public.profiles p on p.id = x.profile_id where x.id = p_id and x.approval_status = 'approved' and p.is_profile_visible and p.moderation_status = 'active')
    else false end;
$$;

alter table public.profile_videos enable row level security;
alter table public.content_ratings enable row level security;
alter table public.content_comments enable row level security;

create policy profile_videos_select_public on public.profile_videos for select to authenticated
using (approval_status = 'approved' and private.content_target_is_visible('profile', profile_id)
  or profile_id = (select auth.uid()));
create policy profile_videos_insert_own on public.profile_videos for insert to authenticated
with check (profile_id = (select auth.uid()));
create policy profile_videos_update_own on public.profile_videos for update to authenticated
using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy profile_videos_delete_own on public.profile_videos for delete to authenticated
using (profile_id = (select auth.uid()));

create policy content_ratings_select_visible on public.content_ratings for select to authenticated
using (private.content_target_is_visible(target_type, target_id));
create policy content_ratings_insert_own on public.content_ratings for insert to authenticated
with check (user_id = (select auth.uid()) and private.content_target_is_visible(target_type, target_id));
create policy content_ratings_update_own on public.content_ratings for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.content_target_is_visible(target_type, target_id));
create policy content_ratings_delete_own on public.content_ratings for delete to authenticated
using (user_id = (select auth.uid()));

create policy content_comments_select_visible on public.content_comments for select to authenticated
using (status = 'visible' and private.content_target_is_visible(target_type, target_id));
create policy content_comments_insert_own on public.content_comments for insert to authenticated
with check (author_id = (select auth.uid()) and status = 'visible' and private.content_target_is_visible(target_type, target_id));
create policy content_comments_update_own on public.content_comments for update to authenticated
using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()) and status = 'visible');
create policy content_comments_delete_own on public.content_comments for delete to authenticated
using (author_id = (select auth.uid()));

grant update (videos, socials, interests, custom_tags) on public.profiles to authenticated;
grant update (tags) on public.profile_photos to authenticated;
grant select on public.profile_videos, public.content_ratings, public.content_comments to authenticated;
grant insert (profile_id, storage_path, position, tags, byte_size, duration_ms) on public.profile_videos to authenticated;
grant update (position, tags) on public.profile_videos to authenticated;
grant delete on public.profile_videos to authenticated;
grant insert (target_type, target_id, user_id, value) on public.content_ratings to authenticated;
grant update (value) on public.content_ratings to authenticated;
grant delete on public.content_ratings to authenticated;
grant insert (target_type, target_id, author_id, body) on public.content_comments to authenticated;
grant update (body) on public.content_comments to authenticated;
grant delete on public.content_comments to authenticated;
grant execute on function private.content_target_is_visible(text, uuid) to authenticated;
grant execute on function private.can_view_profile_video_object(text) to authenticated;

-- Include profile-owned public media in the existing public profile payload.
create or replace function private.get_public_profile_impl(p_profile_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when private.current_user_is_ready(true) then (
    select jsonb_build_object(
      'id', p.id, 'display_name', p.display_name,
      'age', extract(year from age(current_date, p.date_of_birth))::integer,
      'pronouns', p.pronouns, 'identity_tags', p.identity_tags, 'looking_for', p.looking_for,
      'profile_tags', p.profile_tags, 'custom_tags', p.custom_tags, 'bio', p.bio, 'region', p.region,
      'videos', p.videos, 'socials', p.socials, 'interests', p.interests,
      'is_online', p.is_online_status_visible and p.last_active_at >= now() - interval '5 minutes',
      'photo_paths', coalesce((select jsonb_agg(jsonb_build_object('path', photo.storage_path, 'id', photo.id, 'tags', photo.tags) order by photo.position)
        from public.profile_photos photo where photo.profile_id = p.id and photo.approval_status = 'approved'), '[]'::jsonb),
      'profile_videos', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'path', v.storage_path, 'tags', v.tags, 'duration_ms', v.duration_ms) order by v.position)
        from public.profile_videos v where v.profile_id = p.id and v.approval_status = 'approved'), '[]'::jsonb)
    ) from public.profiles p join private.private_locations l on l.profile_id = p.id
    where p.id = p_profile_id and p.id <> (select auth.uid()) and p.is_profile_visible and p.moderation_status = 'active'
      and l.verified_at >= now() - interval '15 minutes'
      and not exists (select 1 from public.blocks b where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = (select auth.uid())))
  ) else null end;
$$;

grant execute on function private.get_public_profile_impl(uuid) to authenticated;
