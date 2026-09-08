-- RúmMál initial database schema.
-- PostgreSQL 17 / Supabase. All client-facing access is explicit and RLS protected.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create extension if not exists postgis with schema extensions;
create extension if not exists pgtap with schema extensions;

-- Keep functions from inheriting a permissive PUBLIC execute grant.
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema private revoke execute on functions from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  date_of_birth date,
  pronouns text,
  identity_tags text[] not null default '{}',
  looking_for text[] not null default '{}',
  bio text,
  region text,
  language text not null default 'is',
  is_profile_visible boolean not null default true,
  is_online_status_visible boolean not null default true,
  is_location_sharing_enabled boolean not null default true,
  last_active_at timestamptz,
  onboarding_completed_at timestamptz,
  terms_accepted_version text,
  terms_accepted_at timestamptz,
  privacy_accepted_version text,
  privacy_accepted_at timestamptz,
  guidelines_accepted_version text,
  guidelines_accepted_at timestamptz,
  special_category_consent_at timestamptz,
  moderation_status text not null default 'active',
  suspended_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (display_name is null or char_length(btrim(display_name)) between 1 and 50),
  constraint profiles_pronouns_length check (pronouns is null or char_length(pronouns) <= 50),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 500),
  constraint profiles_language_check check (language in ('is', 'en')),
  constraint profiles_region_check check (
    region is null or region in (
      'hofudborgarsvaedid', 'sudurnes', 'vesturland', 'vestfirdir',
      'nordurland_vestra', 'nordurland_eystra', 'austurland', 'sudurland'
    )
  ),
  constraint profiles_identity_count check (cardinality(identity_tags) <= 10),
  constraint profiles_looking_for_count check (cardinality(looking_for) <= 10),
  constraint profiles_moderation_status_check check (moderation_status in ('active', 'suspended', 'banned')),
  constraint profiles_suspension_shape check (
    (moderation_status = 'suspended' and suspended_until is not null)
    or (moderation_status <> 'suspended' and suspended_until is null)
  )
);

comment on column public.profiles.date_of_birth is
  'Private source of age. Discovery RPC returns only a calculated integer age.';
comment on column public.profiles.moderation_status is
  'Server-managed. Authorization never relies on user_metadata.';

create table public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  position smallint not null,
  approval_status text not null default 'pending',
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_photos_position_check check (position between 1 and 6),
  constraint profile_photos_owner_path_check check (storage_path like profile_id::text || '/%'),
  constraint profile_photos_status_check check (approval_status in ('pending', 'approved', 'rejected')),
  constraint profile_photos_review_shape check (
    (approval_status = 'pending' and reviewed_at is null and reviewed_by is null and rejection_reason is null)
    or (approval_status = 'approved' and reviewed_at is not null and reviewed_by is not null and rejection_reason is null)
    or (approval_status = 'rejected' and reviewed_at is not null and reviewed_by is not null and rejection_reason is not null)
  ),
  unique (profile_id, position)
);

create table private.iceland_boundaries (
  id smallint primary key default 1 check (id = 1),
  name text not null unique,
  boundary extensions.geometry(multipolygon, 4326) not null,
  source text not null,
  updated_at timestamptz not null default now()
);

comment on table private.iceland_boundaries is
  'Server-only geofence. Replace with a higher-resolution licensed national boundary before launch.';

insert into private.iceland_boundaries (id, name, boundary, source)
values (
  1,
  'Iceland',
  extensions.st_multi(
    extensions.st_geomfromgeojson(
      '{"type":"Polygon","coordinates":[[[-14.508695,66.455892],[-14.739637,65.808748],[-13.609732,65.126671],[-14.909834,64.364082],[-17.794438,63.678749],[-18.656246,63.496383],[-19.972755,63.643635],[-22.762972,63.960179],[-21.778484,64.402116],[-23.955044,64.89113],[-22.184403,65.084968],[-22.227423,65.378594],[-24.326184,65.611189],[-23.650515,66.262519],[-22.134922,66.410469],[-20.576284,65.732112],[-19.056842,66.276601],[-17.798624,65.993853],[-16.167819,66.526792],[-14.508695,66.455892]]]}'
    )
  ),
  'Natural Earth simplified admin-0 boundary via world.geo.json; 2.5 km coastal tolerance is applied'
);

create index iceland_boundaries_boundary_idx
  on private.iceland_boundaries using gist (boundary);

create table private.private_locations (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  cell_center extensions.geography(point, 4326) not null,
  verified_at timestamptz not null,
  last_submission_at timestamptz not null,
  rate_window_started_at timestamptz not null,
  rate_window_count smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_locations_rate_count_check check (rate_window_count between 1 and 12)
);

comment on table private.private_locations is
  'Never exposed through the Data API. Stores only a roughly 1 km snapped centroid, never submitted coordinates.';

create index private_locations_cell_center_idx
  on private.private_locations using gist (cell_center);
create index private_locations_verified_at_idx
  on private.private_locations (verified_at desc);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);
create index blocks_blocked_id_blocker_id_idx on public.blocks (blocked_id, blocker_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  participant_low uuid not null references public.profiles(id) on delete cascade,
  participant_high uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint conversations_distinct_participants check (participant_low < participant_high),
  unique (participant_low, participant_high)
);
create index conversations_high_low_idx on public.conversations (participant_high, participant_low);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_members_user_deleted_idx
  on public.conversation_members (user_id, deleted_at, conversation_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  body text,
  image_path text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint messages_body_length check (body is null or char_length(body) between 1 and 2000),
  constraint messages_single_payload_check check (
    deleted_at is not null
    or ((body is not null)::integer + (image_path is not null)::integer = 1)
  ),
  constraint messages_image_owner_path_check check (
    image_path is null or sender_id is null or image_path like sender_id::text || '/%'
  )
);
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc, id desc);
create index messages_sender_id_idx on public.messages (sender_id) where sender_id is not null;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  reported_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  category text not null,
  details text,
  status text not null default 'open',
  assigned_admin uuid references auth.users(id) on delete set null,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint reports_not_self check (reporter_id is null or reported_id is null or reporter_id <> reported_id),
  constraint reports_details_length check (details is null or char_length(details) <= 2000),
  constraint reports_resolution_length check (resolution_notes is null or char_length(resolution_notes) <= 4000),
  constraint reports_category_check check (
    category in ('harassment', 'hate', 'impersonation', 'spam', 'minor_suspected', 'ncii', 'threat', 'csam', 'other')
  ),
  constraint reports_status_check check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  constraint reports_resolution_shape check (
    (status in ('open', 'in_review') and resolved_at is null)
    or (status in ('resolved', 'dismissed') and resolved_at is not null)
  )
);
create index reports_status_created_idx on public.reports (status, created_at, id);
create index reports_reporter_id_idx on public.reports (reporter_id) where reporter_id is not null;
create index reports_reported_id_idx on public.reports (reported_id) where reported_id is not null;
create index reports_conversation_id_idx on public.reports (conversation_id) where conversation_id is not null;
create index reports_message_id_idx on public.reports (message_id) where message_id is not null;
create index reports_assigned_admin_idx on public.reports (assigned_admin) where assigned_admin is not null;

create table private.moderation_actions (
  id bigint generated always as identity primary key,
  profile_id uuid references public.profiles(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  action_type text not null,
  reason text not null,
  expires_at timestamptz,
  actor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint moderation_actions_type_check check (
    action_type in ('warning', 'suspend', 'ban', 'unban', 'appeal_note', 'photo_approve', 'photo_reject')
  ),
  constraint moderation_actions_reason_length check (char_length(reason) between 1 and 4000),
  constraint moderation_actions_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint moderation_actions_expiry_shape check (
    (action_type = 'suspend' and expires_at is not null)
    or (action_type <> 'suspend' and expires_at is null)
  )
);
create index moderation_actions_profile_created_idx
  on private.moderation_actions (profile_id, created_at desc) where profile_id is not null;
create index moderation_actions_report_id_idx
  on private.moderation_actions (report_id) where report_id is not null;
create index moderation_actions_actor_id_idx
  on private.moderation_actions (actor_id) where actor_id is not null;

create table private.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint admin_audit_action_length check (char_length(action) between 1 and 100),
  constraint admin_audit_target_type_length check (char_length(target_type) between 1 and 50),
  constraint admin_audit_details_object check (jsonb_typeof(details) = 'object')
);
create index admin_audit_log_created_idx on private.admin_audit_log (created_at desc, id desc);
create index admin_audit_log_actor_id_idx on private.admin_audit_log (actor_id) where actor_id is not null;

-- Defense in depth for every application-owned table, including unexposed schemas.
alter table public.profiles enable row level security;
alter table public.profile_photos enable row level security;
alter table public.blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table private.iceland_boundaries enable row level security;
alter table private.private_locations enable row level security;
alter table private.moderation_actions enable row level security;
alter table private.admin_audit_log enable row level security;

alter table private.iceland_boundaries force row level security;
alter table private.private_locations force row level security;
alter table private.moderation_actions force row level security;
alter table private.admin_audit_log force row level security;

-- Generic validation and timestamp triggers.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.validate_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  value text;
begin
  if new.display_name is not null then
    new.display_name := btrim(new.display_name);
  end if;
  if new.pronouns is not null then
    new.pronouns := nullif(btrim(new.pronouns), '');
  end if;
  if new.bio is not null then
    new.bio := nullif(btrim(new.bio), '');
  end if;

  if new.date_of_birth is not null and (
    new.date_of_birth > current_date - interval '18 years'
    or new.date_of_birth < current_date - interval '120 years'
  ) then
    raise exception using errcode = '22023', message = 'date_of_birth_must_be_18_to_120';
  end if;

  foreach value in array coalesce(new.identity_tags, '{}') loop
    if char_length(btrim(value)) not between 1 and 40 then
      raise exception using errcode = '22023', message = 'invalid_identity_tag';
    end if;
  end loop;
  foreach value in array coalesce(new.looking_for, '{}') loop
    if char_length(btrim(value)) not between 1 and 40 then
      raise exception using errcode = '22023', message = 'invalid_looking_for_tag';
    end if;
  end loop;
  return new;
end;
$$;

create trigger profiles_validate_before_write
before insert or update on public.profiles
for each row execute function private.validate_profile();
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();
create trigger profile_photos_set_updated_at
before update on public.profile_photos
for each row execute function private.set_updated_at();
create trigger reports_set_updated_at
before update on public.reports
for each row execute function private.set_updated_at();

-- Auth user -> profile hook. User metadata is used only for a sanitized language preference,
-- never for authorization. Admin role remains protected in raw_app_meta_data/app_metadata.
create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, language)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'language' = 'en' then 'en' else 'is' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function private.handle_new_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

-- Central authorization helpers. They always resolve the caller from auth.uid().
create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from auth.users u
      where u.id = (select auth.uid())
        and (
          u.raw_app_meta_data ->> 'role' in ('moderator', 'admin', 'super_admin')
          or u.raw_app_meta_data -> 'roles' ?| array['moderator', 'admin', 'super_admin']
        )
    ),
    false
  );
$$;

create function private.current_user_is_ready(require_fresh_location boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.onboarding_completed_at is not null
        and p.special_category_consent_at is not null
        and p.moderation_status <> 'banned'
        and (p.moderation_status <> 'suspended' or p.suspended_until <= now())
        and (
          not require_fresh_location
          or (
            p.is_location_sharing_enabled
            and exists (
              select 1
              from private.private_locations l
              where l.profile_id = p.id
                and l.verified_at >= now() - interval '15 minutes'
            )
          )
        )
    ),
    false
  );
$$;

create function private.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.conversation_members cm
      join public.conversations c on c.id = cm.conversation_id
      where cm.conversation_id = p_conversation_id
        and cm.user_id = (select auth.uid())
        and cm.deleted_at is null
        and not exists (
          select 1
          from public.blocks b
          where (b.blocker_id = c.participant_low and b.blocked_id = c.participant_high)
             or (b.blocker_id = c.participant_high and b.blocked_id = c.participant_low)
        )
    ),
    false
  );
$$;

create function private.can_message(p_conversation_id uuid)
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
      join private.private_locations other_location on other_location.profile_id = other_profile.id
      where c.id = p_conversation_id
        and other_profile.moderation_status <> 'banned'
        and (other_profile.moderation_status <> 'suspended' or other_profile.suspended_until <= now())
        and other_location.verified_at >= now() - interval '15 minutes'
        and other_profile.is_location_sharing_enabled
    );
$$;

create function private.report_context_is_valid(
  p_conversation_id uuid,
  p_message_id uuid,
  p_reported_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (select 1 from public.profiles where id = p_reported_id)
    and (
      (p_conversation_id is null and p_message_id is null)
      or exists (
        select 1
        from public.conversations c
        where c.id = p_conversation_id
          and (select auth.uid()) in (c.participant_low, c.participant_high)
          and p_reported_id in (c.participant_low, c.participant_high)
          and (
            p_message_id is null
            or exists (
              select 1 from public.messages m
              where m.id = p_message_id and m.conversation_id = c.id
            )
          )
      )
    ),
    false
  );
$$;

create function private.can_view_profile_photo_object(p_name text)
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
            and exists (
              select 1 from private.private_locations pl
              where pl.profile_id = p.id
                and pl.verified_at >= now() - interval '15 minutes'
            )
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

create function private.can_view_message_image_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.messages m
      where m.image_path = p_name
        and (
          m.sender_id = (select auth.uid())
          or private.is_conversation_member(m.conversation_id)
          or private.is_admin()
        )
    ),
    false
  );
$$;

revoke execute on function private.is_admin() from public, anon;
revoke execute on function private.current_user_is_ready(boolean) from public, anon;
revoke execute on function private.is_conversation_member(uuid) from public, anon;
revoke execute on function private.can_message(uuid) from public, anon;
revoke execute on function private.report_context_is_valid(uuid,uuid,uuid) from public, anon;
revoke execute on function private.can_view_profile_photo_object(text) from public, anon;
revoke execute on function private.can_view_message_image_object(text) from public, anon;

grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_user_is_ready(boolean) to authenticated;
grant execute on function private.is_conversation_member(uuid) to authenticated;
grant execute on function private.can_message(uuid) to authenticated;
grant execute on function private.report_context_is_valid(uuid,uuid,uuid) to authenticated;
grant execute on function private.can_view_profile_photo_object(text) to authenticated;
grant execute on function private.can_view_message_image_object(text) to authenticated;

-- RLS policies. Admin console access uses tightly-scoped RPCs, not broad table policies.
create policy profiles_select_own
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy profile_photos_select_own
on public.profile_photos for select to authenticated
using ((select auth.uid()) = profile_id);
create policy profile_photos_insert_own
on public.profile_photos for insert to authenticated
with check ((select auth.uid()) = profile_id and approval_status = 'pending');
create policy profile_photos_update_own
on public.profile_photos for update to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);
create policy profile_photos_delete_own
on public.profile_photos for delete to authenticated
using ((select auth.uid()) = profile_id);

create policy blocks_select_own
on public.blocks for select to authenticated
using ((select auth.uid()) = blocker_id);
create policy blocks_insert_own
on public.blocks for insert to authenticated
with check ((select auth.uid()) = blocker_id);
create policy blocks_delete_own
on public.blocks for delete to authenticated
using ((select auth.uid()) = blocker_id);

create policy conversations_select_member
on public.conversations for select to authenticated
using ((select private.is_conversation_member(id)));

create policy conversation_members_select_member
on public.conversation_members for select to authenticated
using ((select private.is_conversation_member(conversation_id)));
create policy conversation_members_update_self
on public.conversation_members for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy messages_select_member
on public.messages for select to authenticated
using ((select private.is_conversation_member(conversation_id)));
create policy messages_insert_sender
on public.messages for insert to authenticated
with check (
  (select auth.uid()) = sender_id
  and (select private.can_message(conversation_id))
);

create policy reports_insert_own
on public.reports for insert to authenticated
with check (
  (select auth.uid()) = reporter_id
  and reported_id is not null
  and reported_id <> (select auth.uid())
  and status = 'open'
  and assigned_admin is null
  and resolution_notes is null
  and resolved_at is null
  and (select private.report_context_is_valid(conversation_id, message_id, reported_id))
);

-- Explicit Data API privileges (required by the 2026 opt-in exposure default).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on all sequences in schema private from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (
  display_name, pronouns, identity_tags, looking_for, bio, region, language,
  is_profile_visible, is_online_status_visible, is_location_sharing_enabled
) on public.profiles to authenticated;

grant select, delete on public.profile_photos to authenticated;
grant insert (profile_id, storage_path, position) on public.profile_photos to authenticated;
grant update (position) on public.profile_photos to authenticated;
grant select, delete on public.blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.blocks to authenticated;
grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant update (last_read_at, deleted_at) on public.conversation_members to authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, body, image_path) on public.messages to authenticated;
grant insert (
  reporter_id, reported_id, conversation_id, message_id, category, details
) on public.reports to authenticated;

-- Private Storage buckets. Signed URLs still require the matching SELECT policy.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-photos', 'profile-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('message-images', 'message-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy profile_photo_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-photos'
  and private.can_view_profile_photo_object(name)
);
create policy profile_photo_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);
create policy profile_photo_objects_update
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-photos'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-photos'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);
create policy profile_photo_objects_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and owner_id = (select auth.uid())::text
);

create policy message_image_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'message-images'
  and private.can_view_message_image_object(name)
);
create policy message_image_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'message-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);
create policy message_image_objects_update
on storage.objects for update to authenticated
using (
  bucket_id = 'message-images'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'message-images'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
);
create policy message_image_objects_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'message-images'
  and owner_id = (select auth.uid())::text
);

-- Client RPC implementations live outside the exposed schema. Public wrappers below are
-- SECURITY INVOKER and are the only remotely callable entrypoints.
create function private.complete_onboarding_impl(
  p_date_of_birth date,
  p_display_name text,
  p_pronouns text,
  p_identity_tags text[],
  p_looking_for text[],
  p_bio text,
  p_region text,
  p_terms_version text,
  p_privacy_version text,
  p_guidelines_version text,
  p_sensitive_data_consent boolean,
  p_locale text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if not p_sensitive_data_consent then
    raise exception using errcode = '22023', message = 'explicit_consent_required';
  end if;
  if coalesce(char_length(btrim(p_terms_version)), 0) = 0
     or coalesce(char_length(btrim(p_privacy_version)), 0) = 0
     or coalesce(char_length(btrim(p_guidelines_version)), 0) = 0 then
    raise exception using errcode = '22023', message = 'policy_versions_required';
  end if;

  update public.profiles
  set display_name = p_display_name,
      date_of_birth = p_date_of_birth,
      pronouns = p_pronouns,
      identity_tags = coalesce(p_identity_tags, '{}'),
      looking_for = coalesce(p_looking_for, '{}'),
      bio = p_bio,
      region = p_region,
      language = case when p_locale = 'en' then 'en' else 'is' end,
      terms_accepted_version = p_terms_version,
      terms_accepted_at = now(),
      privacy_accepted_version = p_privacy_version,
      privacy_accepted_at = now(),
      guidelines_accepted_version = p_guidelines_version,
      guidelines_accepted_at = now(),
      special_category_consent_at = now(),
      onboarding_completed_at = now()
  where id = caller;

  if not found then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;
end;
$$;

create function public.complete_onboarding(
  date_of_birth date,
  display_name text,
  pronouns text default null,
  identity_tags text[] default '{}',
  looking_for text[] default '{}',
  bio text default null,
  region text default null,
  terms_version text default '2026-08-31',
  privacy_version text default '2026-08-31',
  guidelines_version text default '2026-08-31',
  sensitive_data_consent boolean default false,
  locale text default 'is'
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.complete_onboarding_impl(
    date_of_birth, display_name, pronouns, identity_tags, looking_for, bio, region,
    terms_version, privacy_version, guidelines_version, sensitive_data_consent, locale
  );
$$;

create function private.update_location_impl(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision,
  p_captured_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  submitted extensions.geometry(point, 4326);
  snapped extensions.geography(point, 4326);
  current_row private.private_locations%rowtype;
  inside_iceland boolean;
begin
  if caller is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'invalid_coordinates';
  end if;
  if p_accuracy is null or p_accuracy <= 0 or p_accuracy > 500 then
    delete from private.private_locations where profile_id = caller;
    return jsonb_build_object('verified', false, 'reason', 'poor_accuracy');
  end if;
  if p_captured_at is null
     or p_captured_at < now() - interval '5 minutes'
     or p_captured_at > now() + interval '1 minute' then
    delete from private.private_locations where profile_id = caller;
    return jsonb_build_object('verified', false, 'reason', 'stale');
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = caller
      and p.onboarding_completed_at is not null
      and p.special_category_consent_at is not null
      and p.moderation_status = 'active'
      and p.is_location_sharing_enabled
  ) then
    raise exception using errcode = '42501', message = 'profile_not_eligible';
  end if;

  select * into current_row
  from private.private_locations
  where profile_id = caller
  for update;

  if found and current_row.rate_window_started_at >= now() - interval '15 minutes'
     and current_row.rate_window_count >= 12 then
    return jsonb_build_object(
      'verified', false,
      'reason', 'rate_limited',
      'verified_at', current_row.verified_at
    );
  end if;

  submitted := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326);
  select exists (
    select 1
    from private.iceland_boundaries b
    where extensions.st_dwithin(
      submitted::extensions.geography,
      b.boundary::extensions.geography,
      2500
    )
  ) into inside_iceland;

  if not inside_iceland then
    delete from private.private_locations where profile_id = caller;
    return jsonb_build_object('verified', false, 'reason', 'outside_iceland');
  end if;

  -- Snap to roughly 1 km before casting to geography. The raw submitted point is never persisted.
  snapped := extensions.st_snaptogrid(submitted, 0.01)::extensions.geography;
  insert into private.private_locations (
    profile_id, cell_center, verified_at, last_submission_at,
    rate_window_started_at, rate_window_count
  ) values (
    caller, snapped, now(), now(), now(), 1
  )
  on conflict (profile_id) do update
  set cell_center = excluded.cell_center,
      verified_at = excluded.verified_at,
      last_submission_at = excluded.last_submission_at,
      rate_window_started_at = case
        when private.private_locations.rate_window_started_at < now() - interval '15 minutes'
          then now()
        else private.private_locations.rate_window_started_at
      end,
      rate_window_count = case
        when private.private_locations.rate_window_started_at < now() - interval '15 minutes'
          then 1
        else private.private_locations.rate_window_count + 1
      end,
      updated_at = now();

  return jsonb_build_object(
    'verified', true,
    'reason', 'verified',
    'verified_at', now(),
    'expires_at', now() + interval '15 minutes'
  );
end;
$$;

create function public.update_location(
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  captured_at timestamptz
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.update_location_impl(latitude, longitude, accuracy, captured_at);
$$;

create function private.discover_nearby_impl(p_filters jsonb, p_cursor jsonb)
returns table (
  profile_id uuid,
  display_name text,
  age integer,
  pronouns text,
  identity_tags text[],
  looking_for text[],
  bio text,
  region text,
  photo_paths text[],
  distance_band text,
  is_online boolean,
  result_cursor jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  requested_limit integer := least(greatest(coalesce((p_filters ->> 'limit')::integer, 40), 1), 60);
  minimum_age integer := least(greatest(coalesce((p_filters ->> 'min_age')::integer, 18), 18), 99);
  maximum_age integer := least(greatest(coalesce((p_filters ->> 'max_age')::integer, 99), 18), 99);
  identity_filter text[] := coalesce(array(select jsonb_array_elements_text(p_filters -> 'identities')), '{}');
  intent_filter text[] := coalesce(array(select jsonb_array_elements_text(p_filters -> 'intents')), '{}');
  online_only boolean := coalesce((p_filters ->> 'online_only')::boolean, false);
  cursor_distance double precision := coalesce((p_cursor ->> 'distance_m')::double precision, -1);
  cursor_id uuid := coalesce((p_cursor ->> 'profile_id')::uuid, '00000000-0000-0000-0000-000000000000'::uuid);
begin
  if caller is null or not private.current_user_is_ready(true) then
    raise exception using errcode = '42501', message = 'fresh_iceland_location_required';
  end if;
  if minimum_age > maximum_age then
    raise exception using errcode = '22023', message = 'invalid_age_range';
  end if;

  return query
  with origin as (
    select l.cell_center
    from private.private_locations l
    where l.profile_id = caller
  ), candidates as (
    select
      p.*,
      extensions.st_distance(l.cell_center, o.cell_center) as distance_m
    from public.profiles p
    join private.private_locations l on l.profile_id = p.id
    cross join origin o
    where p.id <> caller
      and p.is_profile_visible
      and p.is_location_sharing_enabled
      and p.onboarding_completed_at is not null
      and p.special_category_consent_at is not null
      and p.moderation_status = 'active'
      and l.verified_at >= now() - interval '15 minutes'
      and extract(year from age(current_date, p.date_of_birth))::integer between minimum_age and maximum_age
      and (cardinality(identity_filter) = 0 or p.identity_tags && identity_filter)
      and (cardinality(intent_filter) = 0 or p.looking_for && intent_filter)
      and (not online_only or (p.is_online_status_visible and p.last_active_at >= now() - interval '5 minutes'))
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = caller and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = caller)
      )
  ), paged as (
    select c.*
    from candidates c
    where c.distance_m > cursor_distance
       or (c.distance_m = cursor_distance and c.id > cursor_id)
    order by c.distance_m, c.id
    limit requested_limit
  )
  select
    p.id,
    p.display_name,
    extract(year from age(current_date, p.date_of_birth))::integer,
    p.pronouns,
    p.identity_tags,
    p.looking_for,
    p.bio,
    p.region,
    coalesce((
      select array_agg(photo.storage_path order by photo.position)
      from public.profile_photos photo
      where photo.profile_id = p.id and photo.approval_status = 'approved'
    ), '{}'),
    case
      when p.distance_m < 1000 then 'under1'
      when p.distance_m < 3000 then '1to3'
      when p.distance_m < 10000 then '3to10'
      when p.distance_m < 25000 then '10to25'
      else '25plus'
    end,
    p.is_online_status_visible and p.last_active_at >= now() - interval '5 minutes',
    jsonb_build_object('distance_m', p.distance_m, 'profile_id', p.id)
  from paged p
  order by p.distance_m, p.id;
end;
$$;

create function public.discover_nearby(filters jsonb default '{}'::jsonb, cursor jsonb default null)
returns table (
  profile_id uuid, display_name text, age integer, pronouns text, identity_tags text[],
  looking_for text[], bio text, region text, photo_paths text[], distance_band text,
  is_online boolean, result_cursor jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.discover_nearby_impl(filters, cursor);
$$;

create function private.get_public_profile_impl(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.current_user_is_ready(true) then (
    select jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'age', extract(year from age(current_date, p.date_of_birth))::integer,
      'pronouns', p.pronouns,
      'identity_tags', p.identity_tags,
      'looking_for', p.looking_for,
      'bio', p.bio,
      'region', p.region,
      'is_online', p.is_online_status_visible and p.last_active_at >= now() - interval '5 minutes',
      'photo_paths', coalesce((
        select jsonb_agg(photo.storage_path order by photo.position)
        from public.profile_photos photo
        where photo.profile_id = p.id and photo.approval_status = 'approved'
      ), '[]'::jsonb)
    )
    from public.profiles p
    join private.private_locations l on l.profile_id = p.id
    where p.id = p_profile_id
      and p.id <> (select auth.uid())
      and p.is_profile_visible
      and p.moderation_status = 'active'
      and l.verified_at >= now() - interval '15 minutes'
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = (select auth.uid()))
      )
  ) else null end;
$$;

create function public.get_public_profile(profile_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.get_public_profile_impl(profile_id); $$;

create function private.start_conversation_impl(p_other_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  low_id uuid;
  high_id uuid;
  conversation_id uuid;
begin
  if caller is null or p_other_profile_id is null or caller = p_other_profile_id then
    raise exception using errcode = '22023', message = 'invalid_participant';
  end if;
  if not private.current_user_is_ready(true)
     or not exists (
       select 1 from public.profiles p
       join private.private_locations l on l.profile_id = p.id
       where p.id = p_other_profile_id
         and p.is_profile_visible and p.moderation_status = 'active'
         and l.verified_at >= now() - interval '15 minutes'
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
  returning id into conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (conversation_id, caller), (conversation_id, p_other_profile_id)
  on conflict (conversation_id, user_id) do update set deleted_at = null;
  return conversation_id;
end;
$$;

create function public.start_conversation(other_profile_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.start_conversation_impl(other_profile_id); $$;

create function private.touch_presence_impl()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_active_at = now() where id = (select auth.uid());
$$;

create function public.touch_presence()
returns void
language sql
security invoker
set search_path = ''
as $$ select private.touch_presence_impl(); $$;

create function private.withdraw_sensitive_consent_impl()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set special_category_consent_at = null,
      is_profile_visible = false,
      is_location_sharing_enabled = false
  where id = (select auth.uid());
  delete from private.private_locations where profile_id = (select auth.uid());
end;
$$;

create function public.withdraw_sensitive_consent()
returns void language sql security invoker set search_path = ''
as $$ select private.withdraw_sensitive_consent_impl(); $$;

create function private.delete_my_account_impl()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  delete from auth.sessions where user_id = caller;
  delete from auth.users where id = caller;
end;
$$;

create function public.delete_my_account()
returns void language sql security invoker set search_path = ''
as $$ select private.delete_my_account_impl(); $$;

create function private.list_blocked_profiles_impl()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'age', extract(year from age(current_date, p.date_of_birth))::integer
  ) order by b.created_at desc), '[]'::jsonb)
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid());
$$;

create function public.list_blocked_profiles()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_blocked_profiles_impl(); $$;

create function private.export_my_account_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); result jsonb;
begin
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  select jsonb_build_object(
    'generated_at', now(),
    'profile', to_jsonb(p),
    'photos', coalesce((select jsonb_agg(to_jsonb(photo) - 'reviewed_by') from public.profile_photos photo where photo.profile_id = caller), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(to_jsonb(b)) from public.blocks b where b.blocker_id = caller), '[]'::jsonb),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'conversation_id', cm.conversation_id,
        'joined_at', cm.joined_at,
        'messages', coalesce((
          select jsonb_agg(to_jsonb(m) order by m.created_at)
          from public.messages m where m.conversation_id = cm.conversation_id
        ), '[]'::jsonb)
      )) from public.conversation_members cm where cm.user_id = caller
    ), '[]'::jsonb),
    'reports_submitted', coalesce((select jsonb_agg(to_jsonb(r)) from public.reports r where r.reporter_id = caller), '[]'::jsonb)
  ) into result
  from public.profiles p where p.id = caller;
  return result;
end;
$$;

create function public.export_my_account()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.export_my_account_impl(); $$;

-- Moderation RPC implementations. Every call resolves role from protected app_metadata and records
-- an immutable audit event. They never trust a role supplied by the caller.
create function private.require_staff()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'staff_access_required';
  end if;
end;
$$;

create function private.admin_list_reports_impl(p_status text, p_limit integer, p_cursor timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.require_staff();
  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at desc), '[]'::jsonb)
  into result
  from (
    select r.*,
      jsonb_build_object('id', reporter.id, 'display_name', reporter.display_name) as reporter_profile,
      jsonb_build_object(
        'id', reported.id, 'display_name', reported.display_name, 'date_of_birth', reported.date_of_birth,
        'identity_tags', reported.identity_tags, 'region', reported.region,
        'moderation_status', reported.moderation_status
      ) as reported_profile,
      case when r.message_id is null then 0 else 1 end as evidence_count
    from public.reports r
    left join public.profiles reporter on reporter.id = r.reporter_id
    left join public.profiles reported on reported.id = r.reported_id
    where (p_status is null or r.status = p_status)
      and (p_cursor is null or r.created_at < p_cursor)
    order by r.created_at desc, r.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) rows;
  return result;
end;
$$;

create function public.admin_list_reports(p_status text default null, p_limit integer default 50, p_cursor timestamptz default null)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.admin_list_reports_impl(p_status, p_limit, p_cursor); $$;

create function private.admin_get_report_impl(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.require_staff();
  select to_jsonb(r) || jsonb_build_object(
    'reporter_profile', jsonb_build_object('id', reporter.id, 'display_name', reporter.display_name),
    'reported_profile', jsonb_build_object(
      'id', reported.id, 'display_name', reported.display_name, 'date_of_birth', reported.date_of_birth,
      'identity_tags', reported.identity_tags, 'region', reported.region,
      'moderation_status', reported.moderation_status
    ),
    'evidence', case when m.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
      'id', m.id, 'type', case when m.image_path is null then 'message' else 'image' end,
      'label', 'Reported message', 'body', m.body, 'created_at', m.created_at
    )) end
  ) into result
  from public.reports r
  left join public.profiles reporter on reporter.id = r.reporter_id
  left join public.profiles reported on reported.id = r.reported_id
  left join public.messages m on m.id = r.message_id
  where r.id = p_report_id;
  return result;
end;
$$;

create function public.admin_get_report(p_report_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.admin_get_report_impl(p_report_id); $$;

create function private.admin_list_pending_photos_impl(p_limit integer, p_cursor timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.require_staff();
  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at), '[]'::jsonb) into result
  from (
    select photo.id, photo.storage_path, photo.position, photo.created_at,
      jsonb_build_object(
        'id', p.id, 'display_name', p.display_name, 'date_of_birth', p.date_of_birth,
        'identity_tags', p.identity_tags, 'region', p.region
      ) as profile,
      '[]'::jsonb as safety_signals
    from public.profile_photos photo
    join public.profiles p on p.id = photo.profile_id
    where photo.approval_status = 'pending'
      and (p_cursor is null or photo.created_at > p_cursor)
    order by photo.created_at, photo.id
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) rows;
  return result;
end;
$$;

create function public.admin_list_pending_photos(p_limit integer default 50, p_cursor timestamptz default null)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.admin_list_pending_photos_impl(p_limit, p_cursor); $$;

create function private.admin_list_audit_log_impl(p_limit integer, p_cursor timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.require_staff();
  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at desc), '[]'::jsonb) into result
  from (
    select a.*, coalesce(u.raw_app_meta_data ->> 'display_name', u.email, 'Former staff') as actor_name
    from private.admin_audit_log a
    left join auth.users u on u.id = a.actor_id
    where p_cursor is null or a.created_at < p_cursor
    order by a.created_at desc, a.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) rows;
  return result;
end;
$$;

create function public.admin_list_audit_log(p_limit integer default 50, p_cursor timestamptz default null)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.admin_list_audit_log_impl(p_limit, p_cursor); $$;

create function private.admin_moderate_photo_impl(p_photo_id uuid, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); target_profile uuid;
begin
  perform private.require_staff();
  if p_decision not in ('approved', 'rejected')
     or (p_decision = 'rejected' and coalesce(char_length(btrim(p_reason)), 0) < 8) then
    raise exception using errcode = '22023', message = 'invalid_photo_decision';
  end if;
  update public.profile_photos
  set approval_status = p_decision,
      rejection_reason = case when p_decision = 'rejected' then btrim(p_reason) else null end,
      reviewed_at = now(), reviewed_by = caller
  where id = p_photo_id and approval_status = 'pending'
  returning profile_id into target_profile;
  if target_profile is null then raise exception using errcode = 'P0002', message = 'pending_photo_not_found'; end if;
  insert into private.moderation_actions(profile_id, action_type, reason, actor_id)
  values (target_profile, 'photo_' || case when p_decision = 'approved' then 'approve' else 'reject' end,
          coalesce(nullif(btrim(p_reason), ''), 'Photo approved'), caller);
  insert into private.admin_audit_log(actor_id, action, target_type, target_id, details)
  values (caller, 'photo.' || p_decision, 'profile_photo', p_photo_id::text,
          jsonb_build_object('reason', p_reason, 'profile_id', target_profile));
end;
$$;

create function public.admin_moderate_photo(p_photo_id uuid, p_decision text, p_reason text default null)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_moderate_photo_impl(p_photo_id, p_decision, p_reason); $$;

create function private.admin_take_action_impl(
  p_profile_id uuid, p_action text, p_reason text, p_expires_at timestamptz, p_report_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); caller_role text;
begin
  perform private.require_staff();
  select coalesce(u.raw_app_meta_data ->> 'role', 'moderator') into caller_role
  from auth.users u where u.id = caller;
  if p_action not in ('warn', 'suspend', 'ban') or coalesce(char_length(btrim(p_reason)), 0) < 8 then
    raise exception using errcode = '22023', message = 'invalid_moderation_action';
  end if;
  if p_action in ('suspend', 'ban') and caller_role not in ('admin', 'super_admin') then
    raise exception using errcode = '42501', message = 'elevated_role_required';
  end if;
  if p_action = 'suspend' and (p_expires_at is null or p_expires_at <= now()) then
    raise exception using errcode = '22023', message = 'future_expiry_required';
  end if;

  update public.profiles set
    moderation_status = case when p_action = 'ban' then 'banned' when p_action = 'suspend' then 'suspended' else moderation_status end,
    suspended_until = case when p_action = 'suspend' then p_expires_at else null end,
    is_profile_visible = case when p_action in ('ban', 'suspend') then false else is_profile_visible end
  where id = p_profile_id;
  if not found then raise exception using errcode = 'P0002', message = 'profile_not_found'; end if;
  if p_action in ('ban', 'suspend') then delete from private.private_locations where profile_id = p_profile_id; end if;

  insert into private.moderation_actions(profile_id, report_id, action_type, reason, expires_at, actor_id)
  values (p_profile_id, p_report_id,
          case when p_action = 'warn' then 'warning' else p_action end,
          btrim(p_reason), case when p_action = 'suspend' then p_expires_at else null end, caller);
  insert into private.admin_audit_log(actor_id, action, target_type, target_id, details)
  values (caller, 'profile.' || case when p_action = 'warn' then 'warned' when p_action = 'ban' then 'banned' else 'suspended' end,
          'profile', p_profile_id::text,
          jsonb_build_object('reason', p_reason, 'report_id', p_report_id, 'expires_at', p_expires_at));
end;
$$;

create function public.admin_take_action(
  p_profile_id uuid, p_action text, p_reason text, p_expires_at timestamptz default null, p_report_id uuid default null
)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_take_action_impl(p_profile_id, p_action, p_reason, p_expires_at, p_report_id); $$;

create function private.admin_moderate_report_impl(p_report_id uuid, p_status text, p_resolution_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  perform private.require_staff();
  if p_status not in ('in_review', 'resolved', 'dismissed') or coalesce(char_length(btrim(p_resolution_notes)), 0) < 8 then
    raise exception using errcode = '22023', message = 'invalid_report_decision';
  end if;
  update public.reports
  set status = p_status, assigned_admin = caller, resolution_notes = btrim(p_resolution_notes),
      resolved_at = case when p_status in ('resolved', 'dismissed') then now() else null end
  where id = p_report_id;
  if not found then raise exception using errcode = 'P0002', message = 'report_not_found'; end if;
  insert into private.admin_audit_log(actor_id, action, target_type, target_id, details)
  values (caller, 'report.' || case when p_status = 'in_review' then 'note_added' else p_status end,
          'report', p_report_id::text, jsonb_build_object('summary', p_resolution_notes));
end;
$$;

create function public.admin_moderate_report(p_report_id uuid, p_status text, p_resolution_notes text)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_moderate_report_impl(p_report_id, p_status, p_resolution_notes); $$;

-- Revoke implicit function execution, then grant only the documented RPC surface.
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.complete_onboarding_impl(date,text,text,text[],text[],text,text,text,text,text,boolean,text) to authenticated;
grant execute on function private.update_location_impl(double precision,double precision,double precision,timestamptz) to authenticated;
grant execute on function private.discover_nearby_impl(jsonb,jsonb) to authenticated;
grant execute on function private.get_public_profile_impl(uuid) to authenticated;
grant execute on function private.start_conversation_impl(uuid) to authenticated;
grant execute on function private.touch_presence_impl() to authenticated;
grant execute on function private.withdraw_sensitive_consent_impl() to authenticated;
grant execute on function private.delete_my_account_impl() to authenticated;
grant execute on function private.list_blocked_profiles_impl() to authenticated;
grant execute on function private.export_my_account_impl() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_user_is_ready(boolean) to authenticated;
grant execute on function private.is_conversation_member(uuid) to authenticated;
grant execute on function private.can_message(uuid) to authenticated;
grant execute on function private.can_view_profile_photo_object(text) to authenticated;
grant execute on function private.can_view_message_image_object(text) to authenticated;
grant execute on function private.require_staff() to authenticated;
grant execute on function private.admin_list_reports_impl(text,integer,timestamptz) to authenticated;
grant execute on function private.admin_get_report_impl(uuid) to authenticated;
grant execute on function private.admin_list_pending_photos_impl(integer,timestamptz) to authenticated;
grant execute on function private.admin_list_audit_log_impl(integer,timestamptz) to authenticated;
grant execute on function private.admin_moderate_photo_impl(uuid,text,text) to authenticated;
grant execute on function private.admin_take_action_impl(uuid,text,text,timestamptz,uuid) to authenticated;
grant execute on function private.admin_moderate_report_impl(uuid,text,text) to authenticated;

grant execute on function public.complete_onboarding(date,text,text,text[],text[],text,text,text,text,text,boolean,text) to authenticated;
grant execute on function public.update_location(double precision,double precision,double precision,timestamptz) to authenticated;
grant execute on function public.discover_nearby(jsonb,jsonb) to authenticated;
grant execute on function public.get_public_profile(uuid) to authenticated;
grant execute on function public.start_conversation(uuid) to authenticated;
grant execute on function public.touch_presence() to authenticated;
grant execute on function public.withdraw_sensitive_consent() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.list_blocked_profiles() to authenticated;
grant execute on function public.export_my_account() to authenticated;
grant execute on function public.admin_list_reports(text,integer,timestamptz) to authenticated;
grant execute on function public.admin_get_report(uuid) to authenticated;
grant execute on function public.admin_list_pending_photos(integer,timestamptz) to authenticated;
grant execute on function public.admin_list_audit_log(integer,timestamptz) to authenticated;
grant execute on function public.admin_moderate_photo(uuid,text,text) to authenticated;
grant execute on function public.admin_take_action(uuid,text,text,timestamptz,uuid) to authenticated;
grant execute on function public.admin_moderate_report(uuid,text,text) to authenticated;

-- Deliver INSERT events only; RLS continues to decide which rows each subscriber can read.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messages'
     ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

/*
 * Archived duplicate implementation draft. The reviewed RPC surface above is authoritative.
 * Kept inside the historical migration for traceability but intentionally not executed.
 *
 * Onboarding is an atomic RPC so clients cannot mark incomplete or underage profiles complete.
 */
/*
create function private.complete_onboarding_impl(
  p_display_name text,
  p_date_of_birth date,
  p_pronouns text,
  p_identity_tags text[],
  p_looking_for text[],
  p_bio text,
  p_region text,
  p_language text,
  p_terms_version text,
  p_privacy_version text,
  p_guidelines_version text,
  p_special_category_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  completed_at timestamptz := now();
begin
  if caller is null or not exists (select 1 from auth.users where id = caller) then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_special_category_consent is distinct from true then
    raise exception using errcode = '22023', message = 'special_category_consent_required';
  end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 50 then
    raise exception using errcode = '22023', message = 'invalid_display_name';
  end if;
  if p_date_of_birth is null
     or p_date_of_birth > current_date - interval '18 years'
     or p_date_of_birth < current_date - interval '120 years' then
    raise exception using errcode = '22023', message = 'age_must_be_18_or_over';
  end if;
  if p_region is null or p_region not in (
    'hofudborgarsvaedid', 'sudurnes', 'vesturland', 'vestfirdir',
    'nordurland_vestra', 'nordurland_eystra', 'austurland', 'sudurland'
  ) then
    raise exception using errcode = '22023', message = 'invalid_region';
  end if;
  if p_language not in ('is', 'en') then
    raise exception using errcode = '22023', message = 'invalid_language';
  end if;
  if coalesce(cardinality(p_identity_tags), 0) > 10
     or coalesce(cardinality(p_looking_for), 0) > 10 then
    raise exception using errcode = '22023', message = 'too_many_profile_tags';
  end if;
  if nullif(btrim(p_terms_version), '') is null
     or nullif(btrim(p_privacy_version), '') is null
     or nullif(btrim(p_guidelines_version), '') is null then
    raise exception using errcode = '22023', message = 'policy_versions_required';
  end if;

  update public.profiles
  set display_name = btrim(p_display_name),
      date_of_birth = p_date_of_birth,
      pronouns = nullif(btrim(p_pronouns), ''),
      identity_tags = coalesce(p_identity_tags, '{}'),
      looking_for = coalesce(p_looking_for, '{}'),
      bio = nullif(btrim(p_bio), ''),
      region = p_region,
      language = p_language,
      onboarding_completed_at = completed_at,
      terms_accepted_version = btrim(p_terms_version),
      terms_accepted_at = completed_at,
      privacy_accepted_version = btrim(p_privacy_version),
      privacy_accepted_at = completed_at,
      guidelines_accepted_version = btrim(p_guidelines_version),
      guidelines_accepted_at = completed_at,
      special_category_consent_at = completed_at
  where id = caller;

  if not found then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;

  return jsonb_build_object('completed_at', completed_at, 'profile_id', caller);
end;
$$;

create function public.complete_onboarding(
  p_display_name text,
  p_date_of_birth date,
  p_pronouns text default null,
  p_identity_tags text[] default '{}',
  p_looking_for text[] default '{}',
  p_bio text default null,
  p_region text default 'hofudborgarsvaedid',
  p_language text default 'is',
  p_terms_version text default '2026-08-31',
  p_privacy_version text default '2026-08-31',
  p_guidelines_version text default '2026-08-31',
  p_special_category_consent boolean default false
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.complete_onboarding_impl(
    p_display_name, p_date_of_birth, p_pronouns, p_identity_tags,
    p_looking_for, p_bio, p_region, p_language, p_terms_version,
    p_privacy_version, p_guidelines_version, p_special_category_consent
  );
$$;

-- Validates an unsnapped fix, then persists only a snapped centroid.
create function private.update_location_impl(
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  captured_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  raw_point extensions.geometry(point, 4326);
  snapped_point extensions.geography(point, 4326);
  existing private.private_locations%rowtype;
  verified_time timestamptz := now();
  window_start timestamptz;
  window_count smallint;
begin
  if caller is null or not private.current_user_is_ready(false) then
    raise exception using errcode = '42501', message = 'onboarding_or_account_status_invalid';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = caller and p.is_location_sharing_enabled
  ) then
    raise exception using errcode = '42501', message = 'location_sharing_paused';
  end if;
  if latitude is null or longitude is null
     or latitude not between -90 and 90 or longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'invalid_coordinates';
  end if;
  if accuracy is null or accuracy <= 0 or accuracy > 150 then
    raise exception using errcode = '22023', message = 'location_accuracy_too_low';
  end if;
  if captured_at is null
     or captured_at < verified_time - interval '5 minutes'
     or captured_at > verified_time + interval '1 minute' then
    raise exception using errcode = '22023', message = 'location_fix_is_stale';
  end if;

  raw_point := extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326);
  if not exists (
    select 1
    from private.iceland_boundaries i
    where extensions.st_covers(i.boundary, raw_point)
       or extensions.st_dwithin(i.boundary::extensions.geography, raw_point::extensions.geography, 2500)
  ) then
    raise exception using errcode = '22023', message = 'location_outside_iceland';
  end if;

  -- 0.01 degree grid: approximately 0.47 km east/west and 1.11 km north/south in Iceland.
  snapped_point := extensions.st_setsrid(
    extensions.st_makepoint(round(longitude::numeric, 2)::double precision,
                            round(latitude::numeric, 2)::double precision),
    4326
  )::extensions.geography;

  select * into existing
  from private.private_locations
  where profile_id = caller
  for update;

  if found then
    if existing.rate_window_started_at >= verified_time - interval '1 minute' then
      if existing.rate_window_count >= 12 then
        raise exception using errcode = '54000', message = 'location_rate_limit_exceeded';
      end if;
      window_start := existing.rate_window_started_at;
      window_count := existing.rate_window_count + 1;
    else
      window_start := verified_time;
      window_count := 1;
    end if;

    update private.private_locations
    set cell_center = snapped_point,
        verified_at = verified_time,
        last_submission_at = verified_time,
        rate_window_started_at = window_start,
        rate_window_count = window_count,
        updated_at = verified_time
    where profile_id = caller;
  else
    insert into private.private_locations (
      profile_id, cell_center, verified_at, last_submission_at,
      rate_window_started_at, rate_window_count
    ) values (caller, snapped_point, verified_time, verified_time, verified_time, 1);
  end if;

  return jsonb_build_object(
    'verified_at', verified_time,
    'valid_until', verified_time + interval '15 minutes',
    'precision', 'snapped_cell'
  );
end;
$$;

create function public.update_location(
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  captured_at timestamptz
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.update_location_impl(latitude, longitude, accuracy, captured_at);
$$;

create function private.touch_presence_impl()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched_at timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  update public.profiles set last_active_at = touched_at where id = (select auth.uid());
  if not found then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;
  return touched_at;
end;
$$;

create function public.touch_presence()
returns timestamptz
language sql
security invoker
set search_path = ''
as $$ select private.touch_presence_impl(); $$;

-- Coarse keyset pagination never returns or encodes exact distance.
create function private.discover_nearby_impl(filters jsonb, cursor jsonb)
returns table (
  profile_id uuid,
  display_name text,
  age smallint,
  pronouns text,
  identity_tags text[],
  looking_for text[],
  bio text,
  region text,
  photo_paths text[],
  distance_band text,
  is_online boolean,
  result_cursor jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  requester_location extensions.geography(point, 4326);
  safe_filters jsonb := coalesce(filters, '{}');
  page_size integer := 30;
  min_age integer := 18;
  max_age integer := 99;
  cursor_band integer := -1;
  cursor_profile uuid := '00000000-0000-0000-0000-000000000000';
  identity_filter text[];
  intent_filter text[];
  online_only boolean := false;
begin
  if jsonb_typeof(safe_filters) <> 'object' then
    raise exception using errcode = '22023', message = 'filters_must_be_an_object';
  end if;
  if not private.current_user_is_ready(true) then
    raise exception using errcode = '42501', message = 'fresh_iceland_location_required';
  end if;

  select l.cell_center into requester_location
  from private.private_locations l
  where l.profile_id = caller and l.verified_at >= now() - interval '15 minutes';

  begin
    page_size := least(greatest(coalesce((safe_filters ->> 'limit')::integer, 30), 1), 60);
    min_age := least(greatest(coalesce((safe_filters ->> 'min_age')::integer, 18), 18), 99);
    max_age := least(greatest(coalesce((safe_filters ->> 'max_age')::integer, 99), 18), 99);
    online_only := coalesce((safe_filters ->> 'online_only')::boolean, false);
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'invalid_filter_value';
  end;
  if min_age > max_age then
    raise exception using errcode = '22023', message = 'invalid_age_range';
  end if;

  if safe_filters ? 'identities' then
    if jsonb_typeof(safe_filters -> 'identities') <> 'array' then
      raise exception using errcode = '22023', message = 'identities_must_be_an_array';
    end if;
    select coalesce(array_agg(value), '{}') into identity_filter
    from jsonb_array_elements_text(safe_filters -> 'identities') value;
  end if;
  if safe_filters ? 'intents' then
    if jsonb_typeof(safe_filters -> 'intents') <> 'array' then
      raise exception using errcode = '22023', message = 'intents_must_be_an_array';
    end if;
    select coalesce(array_agg(value), '{}') into intent_filter
    from jsonb_array_elements_text(safe_filters -> 'intents') value;
  end if;

  if cursor is not null then
    if jsonb_typeof(cursor) <> 'object' then
      raise exception using errcode = '22023', message = 'cursor_must_be_an_object';
    end if;
    begin
      cursor_band := coalesce((cursor ->> 'band_rank')::integer, -1);
      cursor_profile := coalesce((cursor ->> 'profile_id')::uuid, cursor_profile);
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid_cursor';
    end;
    if cursor_band not between 0 and 4 then
      raise exception using errcode = '22023', message = 'invalid_cursor';
    end if;
  end if;

  return query
  with candidates as (
    select
      p.id,
      p.display_name,
      extract(year from age(current_date, p.date_of_birth))::smallint as calculated_age,
      p.pronouns,
      p.identity_tags,
      p.looking_for,
      p.bio,
      p.region,
      coalesce(photos.paths, '{}') as paths,
      case
        when extensions.st_distance(l.cell_center, requester_location) < 1000 then 0
        when extensions.st_distance(l.cell_center, requester_location) < 3000 then 1
        when extensions.st_distance(l.cell_center, requester_location) < 10000 then 2
        when extensions.st_distance(l.cell_center, requester_location) < 30000 then 3
        else 4
      end as band_rank,
      p.is_online_status_visible and p.last_active_at >= now() - interval '5 minutes' as calculated_online
    from public.profiles p
    join private.private_locations l on l.profile_id = p.id
    left join lateral (
      select array_agg(photo.storage_path order by photo.position) as paths
      from public.profile_photos photo
      where photo.profile_id = p.id and photo.approval_status = 'approved'
    ) photos on true
    where p.id <> caller
      and p.display_name is not null
      and p.date_of_birth is not null
      and p.date_of_birth <= current_date - interval '18 years'
      and p.onboarding_completed_at is not null
      and p.special_category_consent_at is not null
      and p.is_profile_visible
      and p.is_location_sharing_enabled
      and l.verified_at >= now() - interval '15 minutes'
      and p.moderation_status <> 'banned'
      and (p.moderation_status <> 'suspended' or p.suspended_until <= now())
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = caller and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = caller)
      )
  ), filtered as (
    select * from candidates c
    where c.calculated_age between min_age and max_age
      and (identity_filter is null or cardinality(identity_filter) = 0 or c.identity_tags && identity_filter)
      and (intent_filter is null or cardinality(intent_filter) = 0 or c.looking_for && intent_filter)
      and (not online_only or c.calculated_online)
      and (c.band_rank > cursor_band or (c.band_rank = cursor_band and c.id > cursor_profile))
  )
  select
    f.id,
    f.display_name,
    f.calculated_age,
    f.pronouns,
    f.identity_tags,
    f.looking_for,
    f.bio,
    f.region,
    f.paths,
    case f.band_rank
      when 0 then '<1 km'
      when 1 then '1-3 km'
      when 2 then '3-10 km'
      when 3 then '10-30 km'
      else '30+ km'
    end,
    f.calculated_online,
    jsonb_build_object('band_rank', f.band_rank, 'profile_id', f.id)
  from filtered f
  order by f.band_rank, f.id
  limit page_size;
end;
$$;

create function public.discover_nearby(filters jsonb default '{}', cursor jsonb default null)
returns table (
  profile_id uuid,
  display_name text,
  age smallint,
  pronouns text,
  identity_tags text[],
  looking_for text[],
  bio text,
  region text,
  photo_paths text[],
  distance_band text,
  is_online boolean,
  result_cursor jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.discover_nearby_impl(filters, cursor);
$$;

create function private.start_conversation_impl(other_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  low_id uuid;
  high_id uuid;
  conversation_uuid uuid;
begin
  if caller is null or other_profile_id is null or caller = other_profile_id then
    raise exception using errcode = '22023', message = 'invalid_conversation_target';
  end if;
  if not private.current_user_is_ready(true) then
    raise exception using errcode = '42501', message = 'fresh_iceland_location_required';
  end if;
  if not exists (
    select 1
    from public.profiles p
    join private.private_locations l on l.profile_id = p.id
    where p.id = other_profile_id
      and p.onboarding_completed_at is not null
      and p.special_category_consent_at is not null
      and p.is_profile_visible
      and p.is_location_sharing_enabled
      and p.moderation_status <> 'banned'
      and (p.moderation_status <> 'suspended' or p.suspended_until <= now())
      and l.verified_at >= now() - interval '15 minutes'
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = caller and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = caller)
      )
  ) then
    raise exception using errcode = '42501', message = 'profile_not_available';
  end if;

  low_id := least(caller, other_profile_id);
  high_id := greatest(caller, other_profile_id);
  insert into public.conversations (participant_low, participant_high, created_by)
  values (low_id, high_id, caller)
  on conflict (participant_low, participant_high) do update
    set participant_low = excluded.participant_low
  returning id into conversation_uuid;

  insert into public.conversation_members (conversation_id, user_id)
  values (conversation_uuid, caller), (conversation_uuid, other_profile_id)
  on conflict (conversation_id, user_id) do nothing;

  update public.conversation_members
  set deleted_at = null
  where conversation_id = conversation_uuid and user_id = caller;

  return conversation_uuid;
end;
$$;

create function public.start_conversation(other_profile_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.start_conversation_impl(other_profile_id); $$;

-- A new message restores the thread for both members and marks it read for the sender.
create function private.after_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_members
  set deleted_at = null,
      last_read_at = case when user_id = new.sender_id then new.created_at else last_read_at end
  where conversation_id = new.conversation_id;
  return new;
end;
$$;
revoke execute on function private.after_message_insert() from public, anon, authenticated;
create trigger messages_restore_conversation
after insert on public.messages
for each row execute function private.after_message_insert();

-- Account export returns only the caller's personal data and own authored messages.
create function private.export_account_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null or not exists (select 1 from auth.users where id = caller) then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = caller),
    'profile_photos', coalesce((
      select jsonb_agg(to_jsonb(pp) order by pp.position)
      from public.profile_photos pp where pp.profile_id = caller
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.created_at)
      from public.blocks b where b.blocker_id = caller
    ), '[]'::jsonb),
    'conversation_memberships', coalesce((
      select jsonb_agg(to_jsonb(cm) order by cm.joined_at)
      from public.conversation_members cm where cm.user_id = caller
    ), '[]'::jsonb),
    'authored_messages', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at)
      from public.messages m where m.sender_id = caller
    ), '[]'::jsonb),
    'submitted_reports', coalesce((
      select jsonb_agg(
        to_jsonb(r) - 'assigned_admin' - 'resolution_notes'
        order by r.created_at
      )
      from public.reports r where r.reporter_id = caller
    ), '[]'::jsonb)
  );
end;
$$;

create function public.export_account()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.export_account_impl(); $$;

-- Called by the authenticated delete-account Edge Function before Auth/Storage deletion.
create function private.prepare_account_deletion_impl()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null or not exists (select 1 from auth.users where id = caller) then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  update public.messages
  set body = null, image_path = null, deleted_at = now()
  where sender_id = caller;
  update public.reports
  set details = case when reporter_id = caller then null else details end
  where reporter_id = caller;
  return true;
end;
$$;

create function public.prepare_account_deletion()
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.prepare_account_deletion_impl(); $$;

-- Admin report queue and moderation API. Admin checks read protected app_metadata live.
create function private.admin_list_reports_impl(
  p_status text,
  p_limit integer,
  p_cursor jsonb
)
returns table (
  id uuid,
  reporter_id uuid,
  reported_id uuid,
  reported_display_name text,
  category text,
  details text,
  status text,
  assigned_admin uuid,
  created_at timestamptz,
  result_cursor jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  cursor_created timestamptz := '-infinity';
  cursor_id uuid := '00000000-0000-0000-0000-000000000000';
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if p_status is not null and p_status not in ('open', 'in_review', 'resolved', 'dismissed') then
    raise exception using errcode = '22023', message = 'invalid_report_status';
  end if;
  if p_cursor is not null then
    begin
      cursor_created := (p_cursor ->> 'created_at')::timestamptz;
      cursor_id := (p_cursor ->> 'id')::uuid;
    exception when others then
      raise exception using errcode = '22023', message = 'invalid_cursor';
    end;
  end if;

  return query
  select
    r.id, r.reporter_id, r.reported_id, p.display_name, r.category, r.details,
    r.status, r.assigned_admin, r.created_at,
    jsonb_build_object('created_at', r.created_at, 'id', r.id)
  from public.reports r
  left join public.profiles p on p.id = r.reported_id
  where (p_status is null or r.status = p_status)
    and (r.created_at, r.id) > (cursor_created, cursor_id)
  order by r.created_at, r.id
  limit safe_limit;
end;
$$;

create function public.admin_list_reports(
  p_status text default null,
  p_limit integer default 50,
  p_cursor jsonb default null
)
returns table (
  id uuid,
  reporter_id uuid,
  reported_id uuid,
  reported_display_name text,
  category text,
  details text,
  status text,
  assigned_admin uuid,
  created_at timestamptz,
  result_cursor jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.admin_list_reports_impl(p_status, p_limit, p_cursor); $$;

create function private.admin_get_report_impl(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  select jsonb_build_object(
    'report', to_jsonb(r),
    'reporter_profile', case when reporter.id is null then null else jsonb_build_object(
      'id', reporter.id, 'display_name', reporter.display_name, 'moderation_status', reporter.moderation_status
    ) end,
    'reported_profile', case when reported.id is null then null else jsonb_build_object(
      'id', reported.id, 'display_name', reported.display_name, 'moderation_status', reported.moderation_status,
      'suspended_until', reported.suspended_until
    ) end,
    'message_evidence', case when m.id is null then null else to_jsonb(m) end
  ) into result
  from public.reports r
  left join public.profiles reporter on reporter.id = r.reporter_id
  left join public.profiles reported on reported.id = r.reported_id
  left join public.messages m on m.id = r.message_id
  where r.id = p_report_id;

  if result is null then
    raise exception using errcode = 'P0001', message = 'report_not_found';
  end if;
  return result;
end;
$$;

create function public.admin_get_report(p_report_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.admin_get_report_impl(p_report_id); $$;

create function private.admin_list_pending_photos_impl(p_limit integer, p_cursor jsonb)
returns table (
  id uuid,
  profile_id uuid,
  display_name text,
  storage_path text,
  position smallint,
  created_at timestamptz,
  result_cursor jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  cursor_created timestamptz := '-infinity';
  cursor_id uuid := '00000000-0000-0000-0000-000000000000';
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if p_cursor is not null then
    begin
      cursor_created := (p_cursor ->> 'created_at')::timestamptz;
      cursor_id := (p_cursor ->> 'id')::uuid;
    exception when others then
      raise exception using errcode = '22023', message = 'invalid_cursor';
    end;
  end if;
  return query
  select pp.id, pp.profile_id, p.display_name, pp.storage_path, pp.position, pp.created_at,
         jsonb_build_object('created_at', pp.created_at, 'id', pp.id)
  from public.profile_photos pp
  join public.profiles p on p.id = pp.profile_id
  where pp.approval_status = 'pending'
    and (pp.created_at, pp.id) > (cursor_created, cursor_id)
  order by pp.created_at, pp.id
  limit safe_limit;
end;
$$;

create function public.admin_list_pending_photos(
  p_limit integer default 50,
  p_cursor jsonb default null
)
returns table (
  id uuid,
  profile_id uuid,
  display_name text,
  storage_path text,
  position smallint,
  created_at timestamptz,
  result_cursor jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.admin_list_pending_photos_impl(p_limit, p_cursor); $$;

create function private.admin_moderate_photo_impl(
  p_photo_id uuid,
  p_decision text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  photo public.profile_photos%rowtype;
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid_photo_decision';
  end if;
  if p_decision = 'rejected' and nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'rejection_reason_required';
  end if;
  select * into photo from public.profile_photos where id = p_photo_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'photo_not_found';
  end if;

  update public.profile_photos
  set approval_status = p_decision,
      rejection_reason = case when p_decision = 'rejected' then btrim(p_reason) else null end,
      reviewed_at = now(),
      reviewed_by = actor
  where id = p_photo_id;

  insert into private.moderation_actions (
    profile_id, action_type, reason, actor_id, metadata
  ) values (
    photo.profile_id,
    case when p_decision = 'approved' then 'photo_approve' else 'photo_reject' end,
    coalesce(nullif(btrim(p_reason), ''), 'Approved'),
    actor,
    jsonb_build_object('photo_id', p_photo_id, 'storage_path', photo.storage_path)
  );
  insert into private.admin_audit_log (actor_id, action, target_type, target_id, details)
  values (actor, 'moderate_photo', 'profile_photo', p_photo_id::text,
          jsonb_build_object('decision', p_decision, 'reason', p_reason));
  return true;
end;
$$;

create function public.admin_moderate_photo(
  p_photo_id uuid,
  p_decision text,
  p_reason text default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.admin_moderate_photo_impl(p_photo_id, p_decision, p_reason); $$;

create function private.admin_moderate_report_impl(
  p_report_id uuid,
  p_status text,
  p_resolution_notes text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if p_status not in ('open', 'in_review', 'resolved', 'dismissed') then
    raise exception using errcode = '22023', message = 'invalid_report_status';
  end if;
  if p_status in ('resolved', 'dismissed') and nullif(btrim(p_resolution_notes), '') is null then
    raise exception using errcode = '22023', message = 'resolution_notes_required';
  end if;
  update public.reports
  set status = p_status,
      assigned_admin = actor,
      resolution_notes = case when p_status in ('resolved', 'dismissed') then btrim(p_resolution_notes) else null end,
      resolved_at = case when p_status in ('resolved', 'dismissed') then now() else null end
  where id = p_report_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'report_not_found';
  end if;
  insert into private.admin_audit_log (actor_id, action, target_type, target_id, details)
  values (actor, 'moderate_report', 'report', p_report_id::text,
          jsonb_build_object('status', p_status, 'resolution_notes', p_resolution_notes));
  return true;
end;
$$;

create function public.admin_moderate_report(
  p_report_id uuid,
  p_status text,
  p_resolution_notes text default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.admin_moderate_report_impl(p_report_id, p_status, p_resolution_notes); $$;

create function private.admin_take_action_impl(
  p_profile_id uuid,
  p_action text,
  p_reason text,
  p_expires_at timestamptz,
  p_report_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  action_id bigint;
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if p_action not in ('warning', 'suspend', 'ban', 'unban', 'appeal_note') then
    raise exception using errcode = '22023', message = 'invalid_moderation_action';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'moderation_reason_required';
  end if;
  if p_action = 'suspend' and (p_expires_at is null or p_expires_at <= now()) then
    raise exception using errcode = '22023', message = 'future_suspension_expiry_required';
  end if;
  if p_action <> 'suspend' and p_expires_at is not null then
    raise exception using errcode = '22023', message = 'expiry_only_allowed_for_suspension';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;

  if p_action = 'suspend' then
    update public.profiles set moderation_status = 'suspended', suspended_until = p_expires_at where id = p_profile_id;
  elsif p_action = 'ban' then
    update public.profiles set moderation_status = 'banned', suspended_until = null where id = p_profile_id;
  elsif p_action = 'unban' then
    update public.profiles set moderation_status = 'active', suspended_until = null where id = p_profile_id;
  end if;

  insert into private.moderation_actions (
    profile_id, report_id, action_type, reason, expires_at, actor_id
  ) values (
    p_profile_id, p_report_id, p_action, btrim(p_reason), p_expires_at, actor
  ) returning id into action_id;

  insert into private.admin_audit_log (actor_id, action, target_type, target_id, details)
  values (
    actor, 'take_moderation_action', 'profile', p_profile_id::text,
    jsonb_build_object('action_id', action_id, 'action', p_action, 'report_id', p_report_id,
                       'expires_at', p_expires_at, 'reason', p_reason)
  );
  return action_id;
end;
$$;

create function public.admin_take_action(
  p_profile_id uuid,
  p_action text,
  p_reason text,
  p_expires_at timestamptz default null,
  p_report_id uuid default null
)
returns bigint
language sql
security invoker
set search_path = ''
as $$ select private.admin_take_action_impl(p_profile_id, p_action, p_reason, p_expires_at, p_report_id); $$;

create function private.admin_list_audit_log_impl(p_limit integer, p_cursor jsonb)
returns table (
  id bigint,
  actor_id uuid,
  action text,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz,
  result_cursor jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  cursor_created timestamptz := 'infinity';
  cursor_id bigint := 9223372036854775807;
begin
  if not private.is_admin() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if p_cursor is not null then
    begin
      cursor_created := (p_cursor ->> 'created_at')::timestamptz;
      cursor_id := (p_cursor ->> 'id')::bigint;
    exception when others then
      raise exception using errcode = '22023', message = 'invalid_cursor';
    end;
  end if;
  return query
  select a.id, a.actor_id, a.action, a.target_type, a.target_id, a.details, a.created_at,
         jsonb_build_object('created_at', a.created_at, 'id', a.id)
  from private.admin_audit_log a
  where (a.created_at, a.id) < (cursor_created, cursor_id)
  order by a.created_at desc, a.id desc
  limit safe_limit;
end;
$$;

create function public.admin_list_audit_log(
  p_limit integer default 50,
  p_cursor jsonb default null
)
returns table (
  id bigint,
  actor_id uuid,
  action text,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz,
  result_cursor jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.admin_list_audit_log_impl(p_limit, p_cursor); $$;

-- Restrict privileged implementations and expose only reviewed wrappers.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function public.complete_onboarding(text,date,text,text[],text[],text,text,text,text,text,text,boolean) to authenticated;
grant execute on function public.update_location(double precision,double precision,double precision,timestamptz) to authenticated;
grant execute on function public.touch_presence() to authenticated;
grant execute on function public.discover_nearby(jsonb,jsonb) to authenticated;
grant execute on function public.start_conversation(uuid) to authenticated;
grant execute on function public.export_account() to authenticated;
grant execute on function public.prepare_account_deletion() to authenticated;
grant execute on function public.admin_list_reports(text,integer,jsonb) to authenticated;
grant execute on function public.admin_get_report(uuid) to authenticated;
grant execute on function public.admin_list_pending_photos(integer,jsonb) to authenticated;
grant execute on function public.admin_moderate_photo(uuid,text,text) to authenticated;
grant execute on function public.admin_moderate_report(uuid,text,text) to authenticated;
grant execute on function public.admin_take_action(uuid,text,text,timestamptz,uuid) to authenticated;
grant execute on function public.admin_list_audit_log(integer,jsonb) to authenticated;

grant execute on function private.complete_onboarding_impl(text,date,text,text[],text[],text,text,text,text,text,text,boolean) to authenticated;
grant execute on function private.update_location_impl(double precision,double precision,double precision,timestamptz) to authenticated;
grant execute on function private.touch_presence_impl() to authenticated;
grant execute on function private.discover_nearby_impl(jsonb,jsonb) to authenticated;
grant execute on function private.start_conversation_impl(uuid) to authenticated;
grant execute on function private.export_account_impl() to authenticated;
grant execute on function private.prepare_account_deletion_impl() to authenticated;
grant execute on function private.admin_list_reports_impl(text,integer,jsonb) to authenticated;
grant execute on function private.admin_get_report_impl(uuid) to authenticated;
grant execute on function private.admin_list_pending_photos_impl(integer,jsonb) to authenticated;
grant execute on function private.admin_moderate_photo_impl(uuid,text,text) to authenticated;
grant execute on function private.admin_moderate_report_impl(uuid,text,text) to authenticated;
grant execute on function private.admin_take_action_impl(uuid,text,text,timestamptz,uuid) to authenticated;
grant execute on function private.admin_list_audit_log_impl(integer,jsonb) to authenticated;

-- Re-grant helpers consumed by RLS/storage after the blanket function revoke.
grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_user_is_ready(boolean) to authenticated;
grant execute on function private.is_conversation_member(uuid) to authenticated;
grant execute on function private.can_message(uuid) to authenticated;
grant execute on function private.report_context_is_valid(uuid,uuid,uuid) to authenticated;
grant execute on function private.can_view_profile_photo_object(text) to authenticated;
grant execute on function private.can_view_message_image_object(text) to authenticated;

-- Postgres Changes Realtime observes RLS for authenticated subscribers.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
    ) then alter publication supabase_realtime add table public.conversations; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members'
    ) then alter publication supabase_realtime add table public.conversation_members; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then alter publication supabase_realtime add table public.messages; end if;
  end if;
end;
$$;

comment on function public.update_location(double precision,double precision,double precision,timestamptz) is
  'Validates a fresh foreground fix inside Iceland; persists only a snapped centroid for 15 minutes.';
comment on function public.discover_nearby(jsonb,jsonb) is
  'Returns safe profile fields ordered by coarse distance band with non-precise keyset cursors.';
*/
