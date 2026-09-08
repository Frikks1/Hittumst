-- Hittumst social graph and expanded Hittingar occurrence lifecycle.
-- Additive only: compatibility identifiers and the original Hittingar migration remain unchanged.

alter table public.profiles
  add column adult_profile_tags_enabled boolean not null default false,
  add column starred_profile_audience text not null default 'no_one',
  add column meetup_rsvp_visibility_default text not null default 'private',
  add column comment_wall_enabled boolean not null default true,
  add column anonymous_ratings_enabled boolean not null default true,
  add constraint profiles_starred_audience_check
    check (starred_profile_audience in ('everyone', 'friends', 'no_one')),
  add constraint profiles_rsvp_visibility_default_check
    check (meetup_rsvp_visibility_default in ('visible', 'private'));

alter table private.meetup_feature_config
  add column expanded_launch_gates_passed boolean not null default false;

alter function private.set_meetup_feature_enabled_impl(boolean)
  rename to set_meetup_feature_enabled_before_hittumst_impl;
create function private.set_meetup_feature_enabled_impl(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_enabled and not coalesce((
    select expanded_launch_gates_passed from private.meetup_feature_config where id = 1
  ), false) then
    raise exception using errcode = '55000', message = 'expanded_hittingar_launch_gates_required';
  end if;
  perform private.set_meetup_feature_enabled_before_hittumst_impl(p_enabled);
end;
$$;
revoke execute on function private.set_meetup_feature_enabled_impl(boolean)
from public, anon, authenticated, service_role;
grant execute on function private.set_meetup_feature_enabled_impl(boolean) to authenticated;

alter table public.content_ratings
  add column is_anonymous boolean not null default true;

alter table public.content_comments
  add column is_anonymous boolean not null default false;

create table public.content_reactions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint content_reactions_target_type_check check (target_type in ('profile', 'photo', 'video')),
  constraint content_reactions_emoji_check check (emoji in ('❤️', '🔥', '😊', '👏', '🏳️‍🌈')),
  unique (target_type, target_id, user_id, emoji)
);
create index content_reactions_target_idx
  on public.content_reactions (target_type, target_id, emoji);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_not_self check (requester_id <> addressee_id),
  constraint friendships_status_check check (status in ('pending', 'accepted', 'declined')),
  constraint friendships_response_shape check (
    (status = 'pending' and responded_at is null)
    or (status in ('accepted', 'declined') and responded_at is not null)
  ),
  unique (requester_id, addressee_id)
);
create unique index friendships_pair_uidx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_requester_status_idx on public.friendships (requester_id, status, created_at desc);
create index friendships_addressee_status_idx on public.friendships (addressee_id, status, created_at desc);

create table public.starred_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  label text not null,
  profile_audience text not null default 'no_one',
  created_at timestamptz not null default now(),
  constraint starred_items_target_type_check check (target_type in ('chat', 'friend', 'group', 'event')),
  constraint starred_items_target_id_check check (char_length(target_id) between 1 and 160),
  constraint starred_items_label_check check (char_length(btrim(label)) between 1 and 120),
  constraint starred_items_audience_check check (profile_audience in ('everyone', 'friends', 'no_one')),
  unique (owner_id, target_type, target_id)
);
create index starred_items_owner_created_idx on public.starred_items (owner_id, created_at desc);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  bio text not null default '',
  avatar_path text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint groups_bio_check check (char_length(bio) <= 500),
  constraint groups_avatar_path_check check (avatar_path is null or avatar_path like owner_id::text || '/%'),
  constraint groups_status_check check (status in ('active', 'locked', 'removed'))
);
create index groups_owner_status_idx on public.groups (owner_id, status, updated_at desc);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, profile_id),
  constraint group_members_role_check check (role in ('owner', 'admin', 'moderator', 'member')),
  constraint group_members_status_check check (status in ('invited', 'active', 'removed'))
);
create index group_members_profile_status_idx on public.group_members (profile_id, status, group_id);

create table private.group_blocks (
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  blocked_by uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (group_id, profile_id),
  constraint group_blocks_reason_check check (reason is null or char_length(reason) <= 1000)
);

create table public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  constraint group_messages_body_check check (char_length(btrim(body)) between 1 and 2000)
);
create index group_messages_group_created_idx on public.group_messages (group_id, created_at desc, id desc);

create table public.group_voice_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  started_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint group_voice_sessions_order_check check (ended_at is null or ended_at >= started_at)
);
create unique index group_voice_sessions_one_active_idx
  on public.group_voice_sessions (group_id) where ended_at is null;

create table public.group_voice_participants (
  session_id uuid not null references public.group_voice_sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (session_id, profile_id),
  constraint group_voice_participants_order_check check (left_at is null or left_at >= joined_at)
);

create table public.meetup_series (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  frequency text not null,
  interval_value smallint not null,
  weekdays smallint[] not null default '{}',
  monthly_pattern jsonb,
  skipped_dates date[] not null default '{}',
  ends_on date,
  occurrence_count smallint,
  timezone text not null default 'Atlantic/Reykjavik',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetup_series_title_check check (char_length(btrim(title)) between 3 and 100),
  constraint meetup_series_frequency_check check (frequency in ('daily', 'weekly', 'monthly')),
  constraint meetup_series_interval_check check (interval_value between 1 and 30),
  constraint meetup_series_weekdays_check check (
    cardinality(weekdays) <= 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
  ),
  constraint meetup_series_end_check check (
    (ends_on is null) <> (occurrence_count is null)
    and (occurrence_count is null or occurrence_count between 1 and 100)
  ),
  constraint meetup_series_timezone_check check (timezone = 'Atlantic/Reykjavik'),
  constraint meetup_series_status_check check (status in ('draft', 'published', 'cancelled'))
);
create index meetup_series_host_status_idx on public.meetup_series (host_id, status, updated_at desc);

alter table public.meetups
  add column intention text not null default 'friends_social',
  add column venue_mode text not null default 'in_person',
  add column series_id uuid references public.meetup_series(id) on delete set null,
  add column occurrence_index smallint,
  add column recurrence_rule jsonb,
  add column rsvp_visibility text not null default 'inherit',
  add column admission_mode text not null default 'free',
  add column price_minor integer,
  add column currency text,
  add constraint meetups_intention_check check (
    intention in ('friends_social', 'dating', 'casual_adult', 'community', 'shared_activity')
  ),
  add constraint meetups_venue_mode_check check (venue_mode in ('in_person', 'online', 'hybrid')),
  add constraint meetups_series_occurrence_check check (
    (series_id is null and occurrence_index is null) or
    (series_id is not null and occurrence_index between 1 and 100)
  ),
  add constraint meetups_rsvp_visibility_check check (rsvp_visibility in ('inherit', 'visible', 'private')),
  add constraint meetups_admission_mode_check check (admission_mode in ('free', 'paid')),
  add constraint meetups_price_shape_check check (
    (admission_mode = 'free' and price_minor is null and currency is null)
    or (admission_mode = 'paid' and price_minor > 0 and currency ~ '^[A-Z]{3}$')
  ),
  add constraint meetups_casual_adult_check check (intention <> 'casual_adult' or is_explicit);

create unique index meetups_series_occurrence_uidx
  on public.meetups (series_id, occurrence_index) where series_id is not null;
create index meetups_discovery_window_idx
  on public.meetups (starts_at, intention, venue_mode, id) where status = 'published';

update public.meetups
set intention = case
  when category = 'dating' then 'dating'
  when category = 'community' then 'community'
  when category = 'private_adult' then 'casual_adult'
  when category = 'walk_outdoors' or tags && array['walk', 'outdoors']::text[] then 'shared_activity'
  else 'friends_social'
end;

create table private.meetup_online_access (
  meetup_id uuid primary key references public.meetups(id) on delete cascade,
  access_url text not null,
  access_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetup_online_access_url_check check (access_url ~* '^https?://'),
  constraint meetup_online_access_code_check check (
    access_code is null or char_length(btrim(access_code)) between 1 and 160
  )
);

alter table public.meetup_participations
  add column rsvp_visibility text not null default 'inherit',
  add column confirmation_state text not null default 'not_required',
  add column confirmation_requested_at timestamptz,
  add column confirmed_at timestamptz,
  add column expired_at timestamptz,
  add column attendance_outcome text,
  add column attendance_completed_at timestamptz,
  add column history_visibility text not null default 'private',
  add column completion_notice_dismissed_at timestamptz,
  add constraint meetup_participations_rsvp_visibility_check
    check (rsvp_visibility in ('inherit', 'visible', 'private')),
  add constraint meetup_participations_confirmation_state_check check (
    confirmation_state in (
      'not_required', 'confirmation_pending', 'confirmed', 'expired',
      'completion_pending', 'completed', 'dismissed'
    )
  ),
  add constraint meetup_participations_attendance_outcome_check
    check (attendance_outcome is null or attendance_outcome in ('attended', 'did_not_attend')),
  add constraint meetup_participations_history_visibility_check
    check (history_visibility in ('visible', 'private')),
  add constraint meetup_participations_attendance_shape_check check (
    (attendance_outcome is null and attendance_completed_at is null)
    or (attendance_outcome is not null and attendance_completed_at is not null)
  );

create index meetup_participations_confirmation_idx
  on public.meetup_participations (confirmation_state, meetup_id)
  where status in ('joined', 'approved');
create index meetup_participations_public_history_idx
  on public.meetup_participations (profile_id, attendance_completed_at desc, meetup_id)
  where attendance_outcome = 'attended' and history_visibility = 'visible';

create table public.meetup_rooms (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null unique references public.meetups(id) on delete cascade,
  status text not null default 'open',
  posting_closes_at timestamptz not null,
  reading_closes_at timestamptz not null,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint meetup_rooms_status_check check (status in ('open', 'locked', 'closed')),
  constraint meetup_rooms_time_order_check check (reading_closes_at > posting_closes_at)
);
create index meetup_rooms_lifecycle_idx on public.meetup_rooms (status, posting_closes_at, reading_closes_at);

create table public.meetup_room_memberships (
  room_id uuid not null references public.meetup_rooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'participant',
  status text not null default 'active',
  pause_reason text,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, profile_id),
  constraint meetup_room_memberships_role_check check (role in ('host', 'participant')),
  constraint meetup_room_memberships_status_check check (status in ('active', 'paused', 'removed')),
  constraint meetup_room_memberships_pause_shape_check check (
    (status = 'paused' and pause_reason is not null)
    or (status <> 'paused' and pause_reason is null)
  )
);
create index meetup_room_memberships_profile_status_idx
  on public.meetup_room_memberships (profile_id, status, room_id);

create table public.meetup_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.meetup_rooms(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'text',
  body text not null,
  link_hostnames text[] not null default '{}',
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_by uuid references auth.users(id) on delete set null,
  constraint meetup_room_messages_kind_check check (kind in ('text', 'system')),
  constraint meetup_room_messages_body_check check (char_length(btrim(body)) between 1 and 2000),
  constraint meetup_room_messages_links_check check (cardinality(link_hostnames) <= 10)
);
create index meetup_room_messages_room_created_idx
  on public.meetup_room_messages (room_id, created_at desc, id desc);

create table private.meetup_room_conflicts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.meetup_rooms(id) on delete cascade,
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'unresolved',
  resolved_action text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint meetup_room_conflicts_not_self check (blocker_id <> blocked_id),
  constraint meetup_room_conflicts_status_check check (status in ('unresolved', 'resolved')),
  constraint meetup_room_conflicts_action_check check (
    resolved_action is null or resolved_action in (
      'reinstate_both', 'remove_blocker', 'remove_blocked', 'remove_both'
    )
  ),
  constraint meetup_room_conflicts_resolution_shape check (
    (status = 'unresolved' and resolved_action is null and resolved_by is null and resolved_at is null)
    or (status = 'resolved' and resolved_action is not null and resolved_by is not null and resolved_at is not null)
  ),
  unique (room_id, blocker_id, blocked_id)
);
create index meetup_room_conflicts_room_status_idx
  on private.meetup_room_conflicts (room_id, status, created_at);

create table private.meetup_room_message_evidence (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports(id) on delete cascade,
  message_id uuid references public.meetup_room_messages(id) on delete set null,
  room_id uuid references public.meetup_rooms(id) on delete set null,
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null,
  link_hostnames text[] not null default '{}',
  captured_at timestamptz not null default now(),
  unique (report_id)
);

alter table public.reports
  add column room_message_id uuid references public.meetup_room_messages(id) on delete set null;

-- Extend the existing authorization helpers without changing compatibility
-- identifiers or exposing protected location/online values to discovery.
alter function private.meetup_has_attendee_access(uuid,uuid)
  rename to meetup_has_attendee_access_before_hittumst;
create function private.meetup_has_attendee_access(p_meetup_id uuid, p_viewer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.meetup_has_attendee_access_before_hittumst(p_meetup_id, p_viewer_id)
    and exists (
      select 1 from public.meetups active_meetup
      where active_meetup.id = p_meetup_id
        and now() <= active_meetup.effective_end + interval '2 hours'
    )
    and not exists (
      select 1
      from public.meetup_participations mp
      join public.meetups m on m.id = mp.meetup_id
      where mp.meetup_id = p_meetup_id and mp.profile_id = p_viewer_id
        and mp.status in ('joined', 'approved')
        and mp.confirmation_state = 'confirmation_pending'
        and coalesce(mp.joined_at, mp.responded_at, mp.updated_at) >= m.starts_at - interval '2 hours'
    );
$$;

alter function private.meetup_payload(uuid,uuid,boolean)
  rename to meetup_payload_before_hittumst;
create function private.meetup_payload(
  p_meetup_id uuid, p_viewer_id uuid, p_include_description boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base jsonb;
  meetup_row public.meetups%rowtype;
  participation_row public.meetup_participations%rowtype;
  room_row public.meetup_rooms%rowtype;
  membership_row public.meetup_room_memberships%rowtype;
  online_row private.meetup_online_access%rowtype;
  online_payload jsonb := jsonb_build_object('state', 'none');
  active_viewer boolean;
begin
  base := private.meetup_payload_before_hittumst(p_meetup_id, p_viewer_id, p_include_description);
  select * into meetup_row from public.meetups where id = p_meetup_id;
  select * into participation_row from public.meetup_participations
    where meetup_id = p_meetup_id and profile_id = p_viewer_id;
  select * into room_row from public.meetup_rooms where meetup_id = p_meetup_id;
  if room_row.id is not null then
    select * into membership_row from public.meetup_room_memberships
      where room_id = room_row.id and profile_id = p_viewer_id;
  end if;
  active_viewer := p_viewer_id is not null and private.meetup_actor_is_active(p_viewer_id);

  if meetup_row.venue_mode in ('online', 'hybrid') then
    online_payload := jsonb_build_object('state', 'locked');
    if p_include_description and private.meetup_has_attendee_access(p_meetup_id, p_viewer_id) then
      select * into online_row from private.meetup_online_access where meetup_id = p_meetup_id;
      if online_row.meetup_id is not null then
        online_payload := jsonb_strip_nulls(jsonb_build_object(
          'state', 'revealed', 'url', online_row.access_url,
          'accessCode', online_row.access_code,
          'accessExpiresAt', meetup_row.effective_end + interval '2 hours'
        ));
      end if;
    end if;
  end if;

  base := base || jsonb_build_object(
    'intention', meetup_row.intention,
    'venueMode', meetup_row.venue_mode,
    'seriesId', meetup_row.series_id,
    'occurrenceIndex', meetup_row.occurrence_index,
    'rsvpVisibility', meetup_row.rsvp_visibility,
    'onlineAccess', online_payload
  );
  if p_include_description then
    base := base || jsonb_build_object('recurrence', meetup_row.recurrence_rule);
  end if;
  base := jsonb_set(base, '{viewerState}', coalesce(base -> 'viewerState', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'rsvpVisibility', coalesce(participation_row.rsvp_visibility, 'inherit'),
    'attendanceState', coalesce(participation_row.confirmation_state, 'not_required'),
    'attendanceOutcome', participation_row.attendance_outcome,
    'historyVisibility', coalesce(participation_row.history_visibility, 'private')
  )));
  base := jsonb_set(base, '{capabilities}', coalesce(base -> 'capabilities', '{}'::jsonb) || jsonb_build_object(
    'canViewRoster', active_viewer and meetup_row.status = 'published',
    'canViewRoom', coalesce(room_row.id is not null and membership_row.status in ('active', 'paused')
      and now() < room_row.reading_closes_at, false),
    'canSendRoomMessage', coalesce(room_row.id is not null and membership_row.status = 'active'
      and room_row.status = 'open' and room_row.locked_at is null and now() < room_row.posting_closes_at, false),
    'canConfirmAttendance', coalesce(participation_row.status in ('joined', 'approved')
      and participation_row.confirmation_state = 'confirmation_pending', false),
    'canCompleteAttendance', coalesce(participation_row.status in ('joined', 'approved')
      and participation_row.confirmation_state = 'completion_pending', false)
  ));
  return base;
end;
$$;

revoke execute on function private.meetup_has_attendee_access(uuid,uuid),
  private.meetup_payload(uuid,uuid,boolean)
from public, anon, authenticated, service_role;

alter table public.content_reactions enable row level security;
alter table public.friendships enable row level security;
alter table public.starred_items enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_voice_sessions enable row level security;
alter table public.group_voice_participants enable row level security;
alter table public.meetup_series enable row level security;
alter table public.meetup_rooms enable row level security;
alter table public.meetup_room_memberships enable row level security;
alter table public.meetup_room_messages enable row level security;
alter table private.group_blocks enable row level security;
alter table private.meetup_online_access enable row level security;
alter table private.meetup_room_conflicts enable row level security;
alter table private.meetup_room_message_evidence enable row level security;

alter table private.group_blocks force row level security;
alter table private.meetup_online_access force row level security;
alter table private.meetup_room_conflicts force row level security;
alter table private.meetup_room_message_evidence force row level security;

create trigger friendships_set_updated_at before update on public.friendships
for each row execute function private.set_updated_at();
create trigger groups_set_updated_at before update on public.groups
for each row execute function private.set_updated_at();
create trigger group_members_set_updated_at before update on public.group_members
for each row execute function private.set_updated_at();
create trigger meetup_series_set_updated_at before update on public.meetup_series
for each row execute function private.set_updated_at();
create trigger meetup_online_access_set_updated_at before update on private.meetup_online_access
for each row execute function private.set_updated_at();
create trigger meetup_room_memberships_set_updated_at before update on public.meetup_room_memberships
for each row execute function private.set_updated_at();

-- Helpers remain private. Public RPCs are the only supported write surface.
create function private.profiles_are_friends(p_first uuid, p_second uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = p_first and f.addressee_id = p_second)
        or (f.requester_id = p_second and f.addressee_id = p_first))
  ), false);
$$;

create or replace function private.get_public_profile_impl(p_profile_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when private.current_user_is_ready(true) then (
    select jsonb_build_object(
      'id', p.id, 'display_name', p.display_name,
      'age', extract(year from age(current_date, p.date_of_birth))::integer,
      'pronouns', p.pronouns, 'identity_tags', p.identity_tags, 'looking_for', p.looking_for,
      'profile_tags', case when p.adult_profile_tags_enabled then p.profile_tags else
        coalesce((select array_agg(selected.tag_id order by selected.tag_id) from unnest(p.profile_tags) as selected(tag_id)
                  where not exists (select 1 from public.profile_tag_catalog catalog
                                    where catalog.tag_id = selected.tag_id and catalog.category = 'kinks')), '{}') end,
      'custom_tags', p.custom_tags, 'bio', p.bio, 'region', p.region,
      'videos', p.videos, 'socials', p.socials, 'interests', p.interests,
      'comment_wall_enabled', p.comment_wall_enabled,
      'anonymous_ratings_enabled', p.anonymous_ratings_enabled,
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

create function private.content_target_owner(p_target_type text, p_target_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_target_type
    when 'profile' then (select p.id from public.profiles p where p.id = p_target_id)
    when 'photo' then (select photo.profile_id from public.profile_photos photo where photo.id = p_target_id)
    when 'video' then (select video.profile_id from public.profile_videos video where video.id = p_target_id)
  end;
$$;

create function private.rate_content_impl(p_target_type text, p_target_id uuid, p_value smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); owner uuid := private.content_target_owner(p_target_type, p_target_id);
begin
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  if owner is null or p_value not in (-1, 1) or not private.content_target_is_visible(p_target_type, p_target_id) then
    raise exception using errcode = '22023', message = 'invalid_rating_target';
  end if;
  insert into public.content_ratings(target_type, target_id, user_id, value, is_anonymous)
  values (p_target_type, p_target_id, caller, p_value,
    coalesce((select anonymous_ratings_enabled from public.profiles where id = owner), true))
  on conflict (target_type, target_id, user_id) do update
    set value = excluded.value, is_anonymous = excluded.is_anonymous, updated_at = now();
end;
$$;

create function public.rate_content(target_type text, target_id uuid, value smallint)
returns void language sql security invoker set search_path = ''
as $$ select private.rate_content_impl(target_type, target_id, value); $$;

create function private.list_content_rating_counts_impl(p_target_type text, p_target_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'likes', count(*) filter (where r.value = 1),
    'dislikes', count(*) filter (where r.value = -1),
    'viewerValue', max(r.value) filter (where r.user_id = (select auth.uid()))
  )
  from public.content_ratings r
  where r.target_type = p_target_type and r.target_id = p_target_id
    and private.content_target_is_visible(p_target_type, p_target_id);
$$;

create function public.list_content_rating_counts(target_type text, target_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_content_rating_counts_impl(target_type, target_id); $$;

create function private.enforce_comment_wall()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare owner uuid := private.content_target_owner(new.target_type, new.target_id);
begin
  if owner is null or not coalesce((select p.comment_wall_enabled from public.profiles p where p.id = owner), false) then
    raise exception using errcode = '42501', message = 'profile_wall_disabled';
  end if;
  return new;
end;
$$;

create trigger content_comments_enforce_wall
before insert on public.content_comments
for each row execute function private.enforce_comment_wall();

create function private.group_member_role(p_group_id uuid, p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select gm.role from public.group_members gm
  where gm.group_id = p_group_id and gm.profile_id = p_profile_id and gm.status = 'active';
$$;

create function private.room_is_active_member(p_room_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.meetup_room_memberships rm
    join public.meetup_rooms r on r.id = rm.room_id
    where rm.room_id = p_room_id and rm.profile_id = p_profile_id
      and rm.status = 'active' and r.status = 'open'
      and r.reading_closes_at > now()
  ), false);
$$;

create function private.effective_rsvp_visibility(
  p_meetup public.meetups,
  p_participation public.meetup_participations
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Explicit occurrences always start private and require a distinct
    -- participant-level opt-in; global or host defaults cannot expose them.
    when p_meetup.is_explicit then
      case when p_participation.rsvp_visibility = 'visible' then 'visible' else 'private' end
    when p_participation.rsvp_visibility <> 'inherit' then p_participation.rsvp_visibility
    when p_meetup.rsvp_visibility <> 'inherit' then p_meetup.rsvp_visibility
    else coalesce((select p.meetup_rsvp_visibility_default from public.profiles p
                   where p.id = p_participation.profile_id), 'private')
  end;
$$;

-- Defense in depth. Direct table access is still revoked below.
create policy content_reactions_select_related on public.content_reactions
for select to authenticated using (
  user_id = (select auth.uid()) or target_type = 'profile'
);
create policy friendships_select_own on public.friendships
for select to authenticated using (
  requester_id = (select auth.uid()) or addressee_id = (select auth.uid())
);
create policy starred_items_select_own on public.starred_items
for select to authenticated using (owner_id = (select auth.uid()));
create policy groups_select_member on public.groups
for select to authenticated using (
  exists (select 1 from public.group_members gm where gm.group_id = id
          and gm.profile_id = (select auth.uid()) and gm.status = 'active')
);
create policy group_members_select_member on public.group_members
for select to authenticated using (
  exists (select 1 from public.group_members viewer where viewer.group_id = group_id
          and viewer.profile_id = (select auth.uid()) and viewer.status = 'active')
);
create policy group_messages_select_member on public.group_messages
for select to authenticated using (
  private.group_member_role(group_id, (select auth.uid())) is not null
);
create policy group_voice_sessions_select_member on public.group_voice_sessions
for select to authenticated using (
  private.group_member_role(group_id, (select auth.uid())) is not null
);
create policy group_voice_participants_select_member on public.group_voice_participants
for select to authenticated using (
  exists (select 1 from public.group_voice_sessions s
          where s.id = session_id and private.group_member_role(s.group_id, (select auth.uid())) is not null)
);
create policy meetup_series_select_host on public.meetup_series
for select to authenticated using (host_id = (select auth.uid()));
create policy meetup_rooms_select_member on public.meetup_rooms
for select to authenticated using (
  exists (select 1 from public.meetup_room_memberships rm where rm.room_id = id
          and rm.profile_id = (select auth.uid()) and rm.status <> 'removed')
);
create policy meetup_room_memberships_select_related on public.meetup_room_memberships
for select to authenticated using (
  profile_id = (select auth.uid()) or private.room_is_active_member(room_id, (select auth.uid()))
);
create policy meetup_room_messages_select_active on public.meetup_room_messages
for select to authenticated using (private.room_is_active_member(room_id, (select auth.uid())));

create function private.set_friendship_impl(p_profile_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  row_value public.friendships%rowtype;
begin
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  if p_profile_id = caller or p_action not in ('request', 'accept', 'decline', 'remove') then
    raise exception using errcode = '22023', message = 'invalid_friendship_action';
  end if;
  if private.meetup_block_exists(caller, p_profile_id) then
    raise exception using errcode = '42501', message = 'profile_blocked';
  end if;

  if p_action = 'request' then
    insert into public.friendships (requester_id, addressee_id)
    values (caller, p_profile_id)
    on conflict (requester_id, addressee_id) do update
      set status = 'pending', responded_at = null, updated_at = now()
    returning * into row_value;
  elsif p_action in ('accept', 'decline') then
    update public.friendships set status = case when p_action = 'accept' then 'accepted' else 'declined' end,
      responded_at = now(), updated_at = now()
    where addressee_id = caller and requester_id = p_profile_id and status = 'pending'
    returning * into row_value;
    if row_value.id is null then raise exception using errcode = 'P0002', message = 'friend_request_not_found'; end if;
  else
    delete from public.friendships
    where (requester_id = caller and addressee_id = p_profile_id)
       or (requester_id = p_profile_id and addressee_id = caller)
    returning * into row_value;
  end if;
  return to_jsonb(row_value) - 'requester_id' - 'addressee_id'
    || jsonb_build_object('profileId', p_profile_id);
end;
$$;

create function public.set_friendship(profile_id uuid, action text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.set_friendship_impl(profile_id, action); $$;

create function private.list_friends_impl()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'friendshipId', f.id, 'profileId', p.id, 'displayName', p.display_name,
    'status', f.status,
    'direction', case when f.requester_id = (select auth.uid()) then 'outgoing' else 'incoming' end,
    'createdAt', f.created_at
  ) order by f.updated_at desc), '[]'::jsonb)
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end
  where (f.requester_id = (select auth.uid()) or f.addressee_id = (select auth.uid()))
    and not private.meetup_block_exists((select auth.uid()), p.id);
$$;

create function public.list_friends()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_friends_impl(); $$;

create function private.toggle_starred_item_impl(
  p_target_type text, p_target_id text, p_label text, p_profile_audience text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); removed uuid;
begin
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  if p_target_type not in ('chat', 'friend', 'group', 'event')
     or p_profile_audience is not null and p_profile_audience not in ('everyone', 'friends', 'no_one') then
    raise exception using errcode = '22023', message = 'invalid_starred_item';
  end if;
  delete from public.starred_items where owner_id = caller and target_type = p_target_type and target_id = p_target_id
  returning id into removed;
  if removed is not null then return false; end if;
  insert into public.starred_items(owner_id, target_type, target_id, label, profile_audience)
  values (caller, p_target_type, p_target_id, btrim(p_label), coalesce(p_profile_audience,
    (select starred_profile_audience from public.profiles where id = caller)));
  return true;
end;
$$;

create function public.toggle_starred_item(target_type text, target_id text, label text, profile_audience text default null)
returns boolean language sql security invoker set search_path = ''
as $$ select private.toggle_starred_item_impl(target_type, target_id, label, profile_audience); $$;

create function private.list_starred_items_impl(p_owner_id uuid default null)
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
  where s.owner_id = owner and (
    owner = caller or s.profile_audience = 'everyone'
    or (s.profile_audience = 'friends' and private.profiles_are_friends(owner, caller))
  );
  return result;
end;
$$;

create function public.list_starred_items(owner_id uuid default null)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_starred_items_impl(owner_id); $$;

create function private.toggle_content_reaction_impl(p_target_type text, p_target_id uuid, p_emoji text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); removed uuid;
  owner uuid := private.content_target_owner(p_target_type, p_target_id);
begin
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  if p_target_type not in ('profile', 'photo', 'video') or p_emoji not in ('❤️', '🔥', '😊', '👏', '🏳️‍🌈') then
    raise exception using errcode = '22023', message = 'invalid_reaction';
  end if;
  if owner is null or not coalesce((select comment_wall_enabled from public.profiles where id = owner), false) then
    raise exception using errcode = '42501', message = 'profile_wall_disabled';
  end if;
  delete from public.content_reactions where target_type = p_target_type and target_id = p_target_id
    and user_id = caller and emoji = p_emoji returning id into removed;
  if removed is not null then return false; end if;
  insert into public.content_reactions(target_type, target_id, user_id, emoji)
  values (p_target_type, p_target_id, caller, p_emoji);
  return true;
end;
$$;

create function public.toggle_content_reaction(target_type text, target_id uuid, emoji text)
returns boolean language sql security invoker set search_path = ''
as $$ select private.toggle_content_reaction_impl(target_type, target_id, emoji); $$;

create function private.list_content_reactions_impl(p_target_type text, p_target_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'emoji', grouped.emoji, 'count', grouped.reaction_count,
    'reacted', grouped.reacted
  ) order by grouped.emoji), '[]'::jsonb)
  from (
    select r.emoji, count(*)::integer reaction_count,
      bool_or(r.user_id = (select auth.uid())) reacted
    from public.content_reactions r
    where r.target_type = p_target_type and r.target_id = p_target_id
    group by r.emoji
  ) grouped;
$$;

create function public.list_content_reactions(target_type text, target_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_content_reactions_impl(target_type, target_id); $$;

create function private.create_group_impl(p_name text, p_bio text default '', p_avatar_path text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); group_id uuid;
begin
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  insert into public.groups(owner_id, name, bio, avatar_path)
  values (caller, btrim(p_name), coalesce(p_bio, ''), p_avatar_path) returning id into group_id;
  insert into public.group_members(group_id, profile_id, role, status)
  values (group_id, caller, 'owner', 'active');
  return group_id;
end;
$$;

create function public.create_group(name text, bio text default '', avatar_path text default null)
returns uuid language sql security invoker set search_path = ''
as $$ select private.create_group_impl(name, bio, avatar_path); $$;

create function private.list_groups_impl()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id, 'name', g.name, 'bio', g.bio, 'role', member.role,
    'memberCount', (select count(*)::integer from public.group_members all_members
                    where all_members.group_id = g.id and all_members.status = 'active'),
    'isVoiceActive', exists (select 1 from public.group_voice_sessions voice
                             where voice.group_id = g.id and voice.ended_at is null),
    'updatedAt', g.updated_at
  ) order by g.updated_at desc), '[]'::jsonb)
  from public.group_members member
  join public.groups g on g.id = member.group_id
  where member.profile_id = (select auth.uid()) and member.status = 'active' and g.status <> 'removed';
$$;

create function public.list_groups()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_groups_impl(); $$;

create function private.add_group_member_impl(p_group_id uuid, p_profile_id uuid, p_role text default 'member')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller_role text := private.group_member_role(p_group_id, (select auth.uid()));
begin
  if caller_role not in ('owner', 'admin') or p_role not in ('admin', 'moderator', 'member') then
    raise exception using errcode = '42501', message = 'group_admin_required';
  end if;
  if exists (select 1 from private.group_blocks b where b.group_id = p_group_id and b.profile_id = p_profile_id)
     or private.meetup_block_exists((select auth.uid()), p_profile_id) then
    raise exception using errcode = '42501', message = 'group_member_blocked';
  end if;
  insert into public.group_members(group_id, profile_id, role, status)
  values (p_group_id, p_profile_id, p_role, 'active')
  on conflict (group_id, profile_id) do update set role = excluded.role, status = 'active', updated_at = now();
end;
$$;

create function public.add_group_member(group_id uuid, profile_id uuid, role text default 'member')
returns void language sql security invoker set search_path = ''
as $$ select private.add_group_member_impl(group_id, profile_id, role); $$;

create function private.send_group_message_impl(p_group_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); message_id uuid;
begin
  if private.group_member_role(p_group_id, caller) is null then
    raise exception using errcode = '42501', message = 'active_group_membership_required';
  end if;
  insert into public.group_messages(group_id, sender_id, body)
  values (p_group_id, caller, btrim(p_body)) returning id into message_id;
  return message_id;
end;
$$;

create function public.send_group_message(group_id uuid, body text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.send_group_message_impl(group_id, body); $$;

create function private.list_group_messages_impl(p_group_id uuid, p_page_size integer default 50, p_before timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if private.group_member_role(p_group_id, (select auth.uid())) is null then
    raise exception using errcode = '42501', message = 'active_group_membership_required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', page.id, 'groupId', page.group_id, 'senderId', page.sender_id,
    'senderName', page.sender_name, 'body', page.body, 'createdAt', page.created_at
  ) order by page.created_at asc), '[]'::jsonb) into result
  from (
    select message.id, message.group_id, message.sender_id,
      coalesce(profile.display_name, 'Hittumst member') sender_name,
      message.body, message.created_at
    from public.group_messages message
    left join public.profiles profile on profile.id = message.sender_id
    where message.group_id = p_group_id and message.hidden_at is null
      and (p_before is null or message.created_at < p_before)
    order by message.created_at desc
    limit least(greatest(coalesce(p_page_size, 50), 1), 50)
  ) page;
  return result;
end;
$$;

create function public.list_group_messages(group_id uuid, page_size integer default 50, before timestamptz default null)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_group_messages_impl(group_id, page_size, before); $$;

create function private.start_group_voice_impl(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); session_id uuid;
begin
  if private.group_member_role(p_group_id, caller) is null then
    raise exception using errcode = '42501', message = 'active_group_membership_required';
  end if;
  insert into public.group_voice_sessions(group_id, started_by)
  values (p_group_id, caller)
  on conflict (group_id) where ended_at is null do update set group_id = excluded.group_id
  returning id into session_id;
  insert into public.group_voice_participants(session_id, profile_id)
  values (session_id, caller) on conflict (session_id, profile_id) do update set left_at = null;
  return session_id;
end;
$$;

create function public.start_group_voice(group_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.start_group_voice_impl(group_id); $$;

create function private.set_meetup_expansion_impl(p_meetup_id uuid, p_input jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  mode_value text := coalesce(p_input ->> 'venueMode', 'in_person');
  intention_value text := coalesce(p_input ->> 'intention', 'friends_social');
  visibility_value text := coalesce(p_input ->> 'rsvpVisibility', 'inherit');
  online_url text := nullif(btrim(p_input ->> 'onlineUrl'), '');
  online_code text := nullif(btrim(p_input ->> 'onlineAccessCode'), '');
begin
  if intention_value not in ('friends_social', 'dating', 'casual_adult', 'community', 'shared_activity')
     or mode_value not in ('in_person', 'online', 'hybrid')
     or visibility_value not in ('inherit', 'visible', 'private') then
    raise exception using errcode = '22023', message = 'invalid_meetup_expansion';
  end if;
  if mode_value in ('online', 'hybrid') and (online_url is null or online_url !~* '^https?://') then
    raise exception using errcode = '22023', message = 'protected_online_access_required';
  end if;
  update public.meetups set
    intention = intention_value, venue_mode = mode_value, rsvp_visibility = visibility_value,
    recurrence_rule = p_input -> 'recurrence'
  where id = p_meetup_id and host_id = caller and status = 'draft';
  if not found then raise exception using errcode = '42501', message = 'owned_draft_required'; end if;
  if mode_value = 'in_person' then
    delete from private.meetup_online_access where meetup_id = p_meetup_id;
  else
    insert into private.meetup_online_access(meetup_id, access_url, access_code)
    values (p_meetup_id, online_url, online_code)
    on conflict (meetup_id) do update set access_url = excluded.access_url,
      access_code = excluded.access_code, updated_at = now();
  end if;
end;
$$;

create function public.set_meetup_expansion(meetup_id uuid, input jsonb)
returns void language sql security invoker set search_path = ''
as $$ select private.set_meetup_expansion_impl(meetup_id, input); $$;

create function private.get_meetup_draft_recurrence_impl(p_meetup_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select m.recurrence_rule from public.meetups m
  where m.id = p_meetup_id and m.host_id = (select auth.uid()) and m.status = 'draft';
$$;

create function public.get_meetup_draft_recurrence(meetup_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_meetup_draft_recurrence_impl(meetup_id); $$;

-- The client/shared package generates the bounded schedule; this RPC validates
-- it again and publishes every concrete occurrence in one transaction.
create function private.publish_meetup_series_impl(
  p_source_meetup_id uuid, p_recurrence jsonb, p_occurrence_starts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  source_row public.meetups%rowtype;
  new_series_id uuid;
  occurrence_id uuid;
  starts_value timestamptz;
  occurrence_number integer := 0;
  duration_value interval;
  ids jsonb := '[]'::jsonb;
  frequency_value text;
  interval_value integer;
  end_kind text;
  end_count integer;
  end_date date;
  source_date date;
  source_time time;
  hard_end_date date;
  weekdays_value smallint[];
  skipped_dates_value date[];
  monthly_pattern_value jsonb;
  expected_starts timestamptz[];
  submitted_starts timestamptz[];
begin
  perform private.assert_meetup_feature_enabled();
  if jsonb_typeof(p_recurrence) <> 'object' or jsonb_typeof(p_occurrence_starts) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_recurrence';
  end if;
  if jsonb_array_length(p_occurrence_starts) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'recurrence_occurrence_limit';
  end if;
  select * into source_row from public.meetups
  where id = p_source_meetup_id and host_id = caller and status = 'draft' for update;
  if source_row.id is null then raise exception using errcode = '42501', message = 'owned_draft_required'; end if;

  frequency_value := p_recurrence ->> 'frequency';
  if coalesce(p_recurrence ->> 'interval', '') !~ '^[0-9]+$' then
    raise exception using errcode = '22023', message = 'invalid_recurrence_shape';
  end if;
  interval_value := (p_recurrence ->> 'interval')::integer;
  end_kind := p_recurrence #>> '{end,kind}';
  if frequency_value not in ('daily', 'weekly', 'monthly')
     or interval_value not between 1 and 30
     or coalesce(p_recurrence ->> 'timezone', 'Atlantic/Reykjavik') <> 'Atlantic/Reykjavik'
     or jsonb_typeof(p_recurrence -> 'end') <> 'object'
     or end_kind not in ('count', 'date')
     or coalesce(jsonb_typeof(p_recurrence -> 'weekdays'), 'array') <> 'array'
     or coalesce(jsonb_typeof(p_recurrence -> 'skippedDates'), 'array') <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_recurrence_shape';
  end if;

  if exists (
    select 1 from jsonb_array_elements_text(coalesce(p_recurrence -> 'weekdays', '[]'::jsonb)) value
    where value !~ '^[0-6]$'
  ) or exists (
    select 1 from jsonb_array_elements_text(coalesce(p_recurrence -> 'skippedDates', '[]'::jsonb)) value
    where value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  ) then
    raise exception using errcode = '22023', message = 'invalid_recurrence_shape';
  end if;

  select coalesce(array_agg(value::smallint order by value::smallint), '{}')
    into weekdays_value
  from jsonb_array_elements_text(coalesce(p_recurrence -> 'weekdays', '[]'::jsonb)) value;
  select coalesce(array_agg(value::date order by value::date), '{}')
    into skipped_dates_value
  from jsonb_array_elements_text(coalesce(p_recurrence -> 'skippedDates', '[]'::jsonb)) value;
  monthly_pattern_value := p_recurrence -> 'monthlyPattern';

  if cardinality(weekdays_value) > 7
     or cardinality(weekdays_value) <> (select count(distinct value) from unnest(weekdays_value) value)
     or cardinality(skipped_dates_value) > 100
     or cardinality(skipped_dates_value) <> (select count(distinct value) from unnest(skipped_dates_value) value)
     or (frequency_value = 'weekly' and cardinality(weekdays_value) = 0) then
    raise exception using errcode = '22023', message = 'invalid_recurrence_shape';
  end if;

  if frequency_value = 'monthly' and (
    jsonb_typeof(monthly_pattern_value) <> 'object'
    or coalesce(monthly_pattern_value ->> 'kind', '') not in ('day_of_month', 'nth_weekday')
    or (monthly_pattern_value ->> 'kind' = 'day_of_month' and (
      coalesce(monthly_pattern_value ->> 'day', '') !~ '^[0-9]+$'
      or (monthly_pattern_value ->> 'day')::integer not between 1 and 31
    ))
    or (monthly_pattern_value ->> 'kind' = 'nth_weekday' and (
      coalesce(monthly_pattern_value ->> 'weekday', '') !~ '^[0-6]$'
      or coalesce(monthly_pattern_value ->> 'ordinal', '') !~ '^-?[0-9]+$'
      or (monthly_pattern_value ->> 'ordinal')::integer not in (-1, 1, 2, 3, 4)
    ))
  ) then
    raise exception using errcode = '22023', message = 'invalid_recurrence_shape';
  end if;

  source_date := (source_row.starts_at at time zone 'Atlantic/Reykjavik')::date;
  source_time := (source_row.starts_at at time zone 'Atlantic/Reykjavik')::time;
  hard_end_date := ((source_row.starts_at + interval '12 months') at time zone 'Atlantic/Reykjavik')::date;
  if source_date = any(skipped_dates_value) then
    raise exception using errcode = '22023', message = 'first_occurrence_cannot_be_skipped';
  end if;

  if end_kind = 'count' then
    if coalesce(p_recurrence #>> '{end,count}', '') !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'invalid_recurrence_shape';
    end if;
    end_count := (p_recurrence #>> '{end,count}')::integer;
    if end_count not between 1 and 100
       or end_count <> jsonb_array_length(p_occurrence_starts) then
      raise exception using errcode = '22023', message = 'recurrence_occurrence_limit';
    end if;
    end_date := hard_end_date;
  else
    if coalesce(p_recurrence #>> '{end,date}', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception using errcode = '22023', message = 'invalid_recurrence_shape';
    end if;
    end_date := (p_recurrence #>> '{end,date}')::date;
    if end_date < source_date or end_date > hard_end_date then
      raise exception using errcode = '22023', message = 'recurrence_end_date_limit';
    end if;
    end_count := 101;
  end if;

  select coalesce(array_agg(candidate_start order by candidate_start), '{}')
    into expected_starts
  from (
    select ((candidate_day::timestamp + source_time) at time zone 'Atlantic/Reykjavik') as candidate_start
    from generate_series(source_date::timestamp, end_date::timestamp, interval '1 day') generated(day_value)
    cross join lateral (select generated.day_value::date as candidate_day) normalized
    where candidate_day <> all(skipped_dates_value)
      and case frequency_value
        when 'daily' then ((candidate_day - source_date) % interval_value) = 0
        when 'weekly' then
          (((candidate_day - source_date) / 7) % interval_value) = 0
          and extract(dow from candidate_day)::smallint = any(weekdays_value)
        when 'monthly' then
          (((extract(year from candidate_day)::integer - extract(year from source_date)::integer) * 12
            + extract(month from candidate_day)::integer - extract(month from source_date)::integer) % interval_value) = 0
          and case monthly_pattern_value ->> 'kind'
            when 'day_of_month' then extract(day from candidate_day)::integer = least(
              (monthly_pattern_value ->> 'day')::integer,
              extract(day from (date_trunc('month', candidate_day::timestamp) + interval '1 month - 1 day'))::integer
            )
            when 'nth_weekday' then
              extract(dow from candidate_day)::integer = (monthly_pattern_value ->> 'weekday')::integer
              and case (monthly_pattern_value ->> 'ordinal')::integer
                when -1 then extract(month from candidate_day + 7) <> extract(month from candidate_day)
                else ((extract(day from candidate_day)::integer - 1) / 7) + 1 =
                  (monthly_pattern_value ->> 'ordinal')::integer
              end
            else false
          end
        else false
      end
    order by candidate_day
    limit end_count
  ) expected;

  if cardinality(expected_starts) = 0
     or cardinality(expected_starts) > 100
     or (end_kind = 'count' and cardinality(expected_starts) <> end_count) then
    raise exception using errcode = '22023', message = 'recurrence_occurrence_limit';
  end if;

  select coalesce(array_agg(value::timestamptz order by value::timestamptz), '{}')
    into submitted_starts
  from jsonb_array_elements_text(p_occurrence_starts) value;
  if cardinality(submitted_starts) <> jsonb_array_length(p_occurrence_starts) then
    raise exception using errcode = '22023', message = 'invalid_recurrence_occurrence';
  end if;
  if cardinality(submitted_starts) <> (select count(distinct value) from unnest(submitted_starts) value) then
    raise exception using errcode = '23505', message = 'duplicate_recurrence_occurrence';
  end if;
  if submitted_starts <> expected_starts then
    raise exception using errcode = '22023', message = 'occurrence_does_not_match_recurrence';
  end if;

  insert into public.meetup_series(
    host_id, title, frequency, interval_value, weekdays, monthly_pattern,
    skipped_dates, ends_on, occurrence_count, timezone, status
  ) values (
    caller, source_row.title, frequency_value, interval_value::smallint,
    weekdays_value, monthly_pattern_value, skipped_dates_value,
    case when end_kind = 'date' then end_date else null end,
    case when end_kind = 'count' then end_count::smallint else null end,
    'Atlantic/Reykjavik', 'published'
  ) returning id into new_series_id;

  duration_value := source_row.effective_end - source_row.starts_at;
  for starts_value in
    select value::timestamptz from jsonb_array_elements_text(p_occurrence_starts)
    order by value::timestamptz
  loop
    occurrence_number := occurrence_number + 1;
    if occurrence_number = 1 then
      if starts_value <> source_row.starts_at then
        raise exception using errcode = '22023', message = 'first_occurrence_must_match_source';
      end if;
      update public.meetups set series_id = new_series_id, occurrence_index = 1
      where id = source_row.id;
      perform private.publish_meetup_impl(source_row.id);
      occurrence_id := source_row.id;
    else
      insert into public.meetups(
        host_id, title, description, category, tags, starts_at, ends_at,
        access_mode, location_visibility, general_area, location_release_policy,
        capacity, is_explicit, prohibited_services_attested_at,
        public_location_confirmed_at, status, published_at,
        intention, venue_mode, series_id, occurrence_index, rsvp_visibility,
        admission_mode, price_minor, currency
      ) values (
        source_row.host_id, source_row.title, source_row.description, source_row.category,
        source_row.tags, starts_value,
        case when source_row.ends_at is null then null else starts_value + duration_value end,
        source_row.access_mode, source_row.location_visibility, source_row.general_area,
        source_row.location_release_policy, source_row.capacity, source_row.is_explicit,
        source_row.prohibited_services_attested_at, source_row.public_location_confirmed_at,
        'published', now(), source_row.intention, source_row.venue_mode,
        new_series_id, occurrence_number, source_row.rsvp_visibility,
        source_row.admission_mode, source_row.price_minor, source_row.currency
      ) returning id into occurrence_id;
      insert into private.meetup_locations(
        meetup_id, exact_point, discovery_point, venue_name, address, arrival_instructions
      )
      select occurrence_id, exact_point, discovery_point, venue_name, address, arrival_instructions
      from private.meetup_locations where meetup_id = source_row.id;
      insert into private.meetup_online_access(meetup_id, access_url, access_code)
      select occurrence_id, access_url, access_code from private.meetup_online_access
      where meetup_id = source_row.id;
    end if;
    ids := ids || jsonb_build_array(occurrence_id);
  end loop;
  return jsonb_build_object('seriesId', new_series_id, 'occurrenceIds', ids);
end;
$$;

create function public.publish_meetup_series(
  source_meetup_id uuid, recurrence jsonb, occurrence_starts jsonb
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.publish_meetup_series_impl(source_meetup_id, recurrence, occurrence_starts); $$;

create function private.cancel_meetup_series_occurrences_impl(
  p_meetup_id uuid, p_scope text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); source_row public.meetups%rowtype; changed integer;
begin
  if p_scope not in ('this_occurrence', 'this_and_future') then
    raise exception using errcode = '22023', message = 'invalid_series_edit_scope';
  end if;
  select * into source_row from public.meetups where id = p_meetup_id and host_id = caller for update;
  if source_row.id is null or source_row.series_id is null or source_row.starts_at <= now() then
    raise exception using errcode = '42501', message = 'future_owned_series_occurrence_required';
  end if;
  update public.meetups set status = 'cancelled', cancelled_at = now()
  where host_id = caller and series_id = source_row.series_id and status = 'published'
    and starts_at > now()
    and (id = source_row.id or (p_scope = 'this_and_future' and occurrence_index >= source_row.occurrence_index));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create function public.cancel_meetup_series_occurrences(meetup_id uuid, scope text)
returns integer language sql security invoker set search_path = ''
as $$ select private.cancel_meetup_series_occurrences_impl(meetup_id, scope); $$;

-- Every occurrence owns a separate room. Admission mirrors active participation.
create function private.ensure_meetup_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare room_id uuid;
begin
  if new.status = 'published' then
    insert into public.meetup_rooms(meetup_id, posting_closes_at, reading_closes_at)
    values (new.id, new.effective_end + interval '2 hours', new.effective_end + interval '24 hours')
    on conflict (meetup_id) do update set
      posting_closes_at = excluded.posting_closes_at,
      reading_closes_at = excluded.reading_closes_at
    returning id into room_id;
    if new.host_id is not null then
      insert into public.meetup_room_memberships(room_id, profile_id, role, status)
      values (room_id, new.host_id, 'host', 'active')
      on conflict (room_id, profile_id) do update
        set role = 'host', status = 'active', pause_reason = null, updated_at = now();
    end if;
  end if;
  return new;
end;
$$;

create trigger meetups_ensure_occurrence_room
after insert or update of status, starts_at, ends_at on public.meetups
for each row execute function private.ensure_meetup_room();

insert into public.meetup_rooms(meetup_id, posting_closes_at, reading_closes_at)
select m.id, m.effective_end + interval '2 hours', m.effective_end + interval '24 hours'
from public.meetups m where m.status = 'published'
on conflict (meetup_id) do nothing;

insert into public.meetup_room_memberships(room_id, profile_id, role, status)
select r.id, m.host_id, 'host', 'active'
from public.meetup_rooms r join public.meetups m on m.id = r.meetup_id
where m.host_id is not null
on conflict (room_id, profile_id) do nothing;

create function private.require_late_meetup_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare meetup_row public.meetups%rowtype;
begin
  if new.status not in ('joined', 'approved') or new.confirmation_state <> 'not_required' then
    return new;
  end if;
  select * into meetup_row from public.meetups where id = new.meetup_id;
  if meetup_row.starts_at <= now() + interval '2 hours' and meetup_row.effective_end > now() then
    new.confirmation_state := 'confirmation_pending';
    new.confirmation_requested_at := now();
  end if;
  return new;
end;
$$;

create trigger meetup_participations_require_late_confirmation
before insert or update of status on public.meetup_participations
for each row execute function private.require_late_meetup_confirmation();

insert into public.meetup_room_memberships(room_id, profile_id, role, status)
select r.id, mp.profile_id, 'participant', 'active'
from public.meetup_rooms r join public.meetup_participations mp on mp.meetup_id = r.meetup_id
where mp.profile_id is not null and mp.status in ('joined', 'approved')
on conflict (room_id, profile_id) do nothing;

create function private.sync_meetup_room_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare room_id uuid;
begin
  select r.id into room_id from public.meetup_rooms r where r.meetup_id = new.meetup_id;
  if room_id is null or new.profile_id is null then return new; end if;
  if new.status in ('joined', 'approved') and new.confirmation_state <> 'expired'
     and private.meetup_has_attendee_access(new.meetup_id, new.profile_id) then
    insert into public.meetup_room_memberships(room_id, profile_id, role, status)
    values (room_id, new.profile_id, 'participant', 'active')
    on conflict (room_id, profile_id) do update set
      status = case when public.meetup_room_memberships.pause_reason = 'peer_block' then 'paused' else 'active' end,
      pause_reason = public.meetup_room_memberships.pause_reason,
      updated_at = now();
  else
    update public.meetup_room_memberships
    set status = 'removed', pause_reason = null, updated_at = now()
    where public.meetup_room_memberships.room_id = room_id and profile_id = new.profile_id;
  end if;
  return new;
end;
$$;

create trigger meetup_participations_sync_room
after insert or update of status, confirmation_state on public.meetup_participations
for each row execute function private.sync_meetup_room_membership();

-- A peer block does not alter RSVP or protected meetup access. It pauses only
-- the two room memberships and creates private, reason-free host evidence.
create or replace function private.revoke_meetup_access_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare affected record;
begin
  for affected in
    select r.id as room_id
    from public.meetup_rooms r
    join public.meetup_participations first_mp on first_mp.meetup_id = r.meetup_id
      and first_mp.profile_id = new.blocker_id and first_mp.status in ('joined', 'approved')
    join public.meetup_participations second_mp on second_mp.meetup_id = r.meetup_id
      and second_mp.profile_id = new.blocked_id and second_mp.status in ('joined', 'approved')
    where r.reading_closes_at > now()
  loop
    update public.meetup_room_memberships
    set status = 'paused', pause_reason = 'peer_block', updated_at = now()
    where room_id = affected.room_id and profile_id in (new.blocker_id, new.blocked_id)
      and status = 'active';
    insert into private.meetup_room_conflicts(room_id, blocker_id, blocked_id)
    values (affected.room_id, new.blocker_id, new.blocked_id)
    on conflict (room_id, blocker_id, blocked_id) do nothing;
  end loop;
  return new;
end;
$$;

create function private.set_meetup_rsvp_visibility_impl(p_meetup_id uuid, p_visibility text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); meetup_row public.meetups%rowtype;
begin
  if p_visibility not in ('inherit', 'visible', 'private') then
    raise exception using errcode = '22023', message = 'invalid_rsvp_visibility';
  end if;
  select * into meetup_row from public.meetups where id = p_meetup_id;
  if meetup_row.is_explicit and p_visibility = 'visible' then
    if not exists (
      select 1 from public.profiles p where p.id = caller and p.adult_content_opted_in_at is not null
    ) then raise exception using errcode = '42501', message = 'adult_content_preference_required'; end if;
  end if;
  update public.meetup_participations set rsvp_visibility = p_visibility, updated_at = now()
  where meetup_id = p_meetup_id and profile_id = caller and status in ('joined', 'approved');
  if not found then raise exception using errcode = 'P0002', message = 'active_meetup_participation_not_found'; end if;
end;
$$;

create function public.set_meetup_rsvp_visibility(meetup_id uuid, visibility text)
returns void language sql security invoker set search_path = ''
as $$ select private.set_meetup_rsvp_visibility_impl(meetup_id, visibility); $$;

create function private.confirm_meetup_attendance_impl(p_meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meetup_participations mp
  set confirmation_state = 'confirmed', confirmed_at = now(), updated_at = now()
  from public.meetups m
  where m.id = mp.meetup_id and mp.meetup_id = p_meetup_id
    and mp.profile_id = (select auth.uid()) and mp.status in ('joined', 'approved')
    and mp.confirmation_state = 'confirmation_pending'
    and now() < m.starts_at - interval '2 hours';
  if not found then raise exception using errcode = '55000', message = 'confirmation_not_available'; end if;
end;
$$;

create function public.confirm_meetup_attendance(meetup_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.confirm_meetup_attendance_impl(meetup_id); $$;

create function private.complete_meetup_attendance_impl(
  p_meetup_id uuid, p_outcome text, p_history_visibility text default 'private'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome not in ('attended', 'did_not_attend', 'dismiss') or p_history_visibility not in ('visible', 'private') then
    raise exception using errcode = '22023', message = 'invalid_attendance_outcome';
  end if;
  if p_outcome = 'dismiss' then
    update public.meetup_participations mp set confirmation_state = 'dismissed',
      completion_notice_dismissed_at = now(), attendance_outcome = null,
      attendance_completed_at = null, history_visibility = 'private', updated_at = now()
    from public.meetups m where m.id = mp.meetup_id and mp.meetup_id = p_meetup_id
      and mp.profile_id = (select auth.uid()) and now() >= m.effective_end + interval '2 hours';
  else
    update public.meetup_participations mp set confirmation_state = 'completed',
      attendance_outcome = p_outcome, attendance_completed_at = now(),
      history_visibility = case when p_outcome = 'attended' then p_history_visibility else 'private' end,
      updated_at = now()
    from public.meetups m where m.id = mp.meetup_id and mp.meetup_id = p_meetup_id
      and mp.profile_id = (select auth.uid()) and mp.status in ('joined', 'approved')
      and now() >= m.effective_end + interval '2 hours';
  end if;
  if not found then raise exception using errcode = '55000', message = 'completion_not_available'; end if;
end;
$$;

create function public.complete_meetup_attendance(
  meetup_id uuid, outcome text, history_visibility text default 'private'
)
returns void language sql security invoker set search_path = ''
as $$ select private.complete_meetup_attendance_impl(meetup_id, outcome, history_visibility); $$;

create function private.set_meetup_history_visibility_impl(p_meetup_id uuid, p_visibility text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_visibility not in ('visible', 'private') then
    raise exception using errcode = '22023', message = 'invalid_history_visibility';
  end if;
  update public.meetup_participations set history_visibility = p_visibility, updated_at = now()
  where meetup_id = p_meetup_id and profile_id = (select auth.uid())
    and attendance_outcome = 'attended' and confirmation_state = 'completed';
  if not found then raise exception using errcode = 'P0002', message = 'attended_history_not_found'; end if;
end;
$$;

create function public.set_meetup_history_visibility(meetup_id uuid, visibility text)
returns void language sql security invoker set search_path = ''
as $$ select private.set_meetup_history_visibility_impl(meetup_id, visibility); $$;

create function private.list_public_meetup_roster_impl(p_meetup_id uuid, p_cursor uuid default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); meetup_row public.meetups%rowtype; result jsonb;
begin
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  select * into meetup_row from public.meetups where id = p_meetup_id;
  if meetup_row.id is null then raise exception using errcode = 'P0002', message = 'meetup_not_found'; end if;
  if meetup_row.is_explicit and not exists (
    select 1 from public.profiles p where p.id = caller and p.adult_content_opted_in_at is not null
  ) then return jsonb_build_object('items', '[]'::jsonb, 'nextCursor', null); end if;
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(item.payload order by item.id), '[]'::jsonb),
    'nextCursor', case when count(*) > least(greatest(p_limit, 1), 50)
      then max(item.id)::text else null end
  ) into result
  from (
    select mp.id, jsonb_build_object(
      'meetupId', mp.meetup_id,
      'profile', jsonb_build_object('id', p.id, 'displayName', p.display_name),
      'status', mp.status, 'requestedAt', mp.requested_at, 'respondedAt', mp.responded_at,
      'rsvpVisibility', mp.rsvp_visibility, 'attendanceState', mp.confirmation_state
    ) payload
    from public.meetup_participations mp
    join public.profiles p on p.id = mp.profile_id
    where mp.meetup_id = p_meetup_id and mp.status in ('joined', 'approved')
      and (p_cursor is null or mp.id > p_cursor)
      and not private.meetup_block_exists(caller, p.id)
      and private.effective_rsvp_visibility(meetup_row, mp) = 'visible'
      and (meetup_row.access_mode <> 'private' or mp.rsvp_visibility = 'visible')
    order by mp.id limit least(greatest(p_limit, 1), 50) + 1
  ) item;
  return result;
end;
$$;

create function public.list_public_meetup_roster(meetup_id uuid, cursor uuid default null, page_size integer default 50)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_public_meetup_roster_impl(meetup_id, cursor, page_size); $$;

create function private.list_profile_meetup_history_impl(p_profile_id uuid, p_cursor timestamptz default null, p_limit integer default 50)
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
    where mp.profile_id = p_profile_id and mp.attendance_outcome = 'attended'
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

create function public.list_profile_meetup_history(profile_id uuid, cursor timestamptz default null, page_size integer default 50)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_profile_meetup_history_impl(profile_id, cursor, page_size); $$;

create function private.list_profile_upcoming_meetups_impl(p_profile_id uuid, p_cursor timestamptz default null, p_limit integer default 50)
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
    where mp.profile_id = p_profile_id and mp.status in ('joined', 'approved')
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

create function public.list_profile_upcoming_meetups(profile_id uuid, cursor timestamptz default null, page_size integer default 50)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_profile_upcoming_meetups_impl(profile_id, cursor, page_size); $$;

create function private.get_meetup_online_access_impl(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare access_row private.meetup_online_access%rowtype;
begin
  if not private.meetup_has_attendee_access(p_meetup_id, (select auth.uid())) then
    raise exception using errcode = '42501', message = 'meetup_access_required';
  end if;
  select * into access_row from private.meetup_online_access where meetup_id = p_meetup_id;
  if access_row.meetup_id is null then return jsonb_build_object('state', 'none'); end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'state', 'revealed', 'url', access_row.access_url,
    'accessCode', access_row.access_code,
    'accessExpiresAt', (select m.effective_end + interval '2 hours' from public.meetups m where m.id = p_meetup_id)
  ));
end;
$$;

create function public.get_meetup_online_access(meetup_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_meetup_online_access_impl(meetup_id); $$;

create function private.get_meetup_room_summary_impl(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'id', room.id, 'meetupId', room.meetup_id,
    'postingClosesAt', room.posting_closes_at, 'readingClosesAt', room.reading_closes_at,
    'isPaused', membership.status = 'paused',
    'canPost', membership.status = 'active' and room.status = 'open'
      and room.locked_at is null and now() < room.posting_closes_at,
    'unreadCount', 0
  ) into result
  from public.meetup_rooms room
  join public.meetup_room_memberships membership on membership.room_id = room.id
  where room.meetup_id = p_meetup_id and membership.profile_id = (select auth.uid())
    and membership.status <> 'removed' and now() < room.reading_closes_at;
  return result;
end;
$$;

create function public.get_meetup_room_summary(meetup_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_meetup_room_summary_impl(meetup_id); $$;

create function private.list_meetup_room_messages_impl(p_room_id uuid, p_before timestamptz default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); result jsonb;
begin
  if not private.room_is_active_member(p_room_id, caller) then
    raise exception using errcode = '42501', message = 'active_room_membership_required';
  end if;
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(rows.payload order by rows.created_at), '[]'::jsonb),
    'nextCursor', case when count(*) > least(greatest(p_limit, 1), 50)
      then min(rows.created_at)::text else null end
  ) into result
  from (
    select msg.created_at, jsonb_build_object(
      'id', msg.id, 'roomId', msg.room_id,
      'sender', case when msg.sender_id is null then null else jsonb_build_object(
        'id', msg.sender_id, 'displayName', coalesce(sender.display_name, 'Hittumst member')) end,
      'kind', msg.kind, 'body', msg.body, 'linkHostnames', msg.link_hostnames,
      'createdAt', msg.created_at
    ) payload
    from public.meetup_room_messages msg
    left join public.profiles sender on sender.id = msg.sender_id
    where msg.room_id = p_room_id and msg.hidden_at is null
      and (p_before is null or msg.created_at < p_before)
      and (msg.sender_id is null or not private.meetup_block_exists(caller, msg.sender_id))
    order by msg.created_at desc limit least(greatest(p_limit, 1), 50) + 1
  ) rows;
  return result;
end;
$$;

create function public.list_meetup_room_messages(room_id uuid, before_at timestamptz default null, page_size integer default 50)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_meetup_room_messages_impl(room_id, before_at, page_size); $$;

create function private.send_meetup_room_message_impl(p_room_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); message_id uuid; hosts text[];
begin
  if not private.room_is_active_member(p_room_id, caller) then
    raise exception using errcode = '42501', message = 'active_room_membership_required';
  end if;
  if exists (select 1 from public.meetup_rooms r where r.id = p_room_id
    and (r.locked_at is not null or now() >= r.posting_closes_at)) then
    raise exception using errcode = '55000', message = 'room_posting_closed';
  end if;
  if p_body ~* '(^|[[:space:]])(ftp|file|data|javascript):' then
    raise exception using errcode = '22023', message = 'unsupported_link_scheme';
  end if;
  select coalesce(array_agg(distinct lower(regexp_replace(match[1], '^https?://([^/:?#]+).*$','\\1','i'))), '{}')
  into hosts
  from regexp_matches(p_body, '(https?://[^[:space:]<>]+)', 'gi') as match;
  insert into public.meetup_room_messages(room_id, sender_id, body, link_hostnames)
  values (p_room_id, caller, btrim(p_body), hosts) returning id into message_id;
  return message_id;
end;
$$;

create function public.send_meetup_room_message(room_id uuid, body text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.send_meetup_room_message_impl(room_id, body); $$;

create function private.report_meetup_room_message_impl(p_message_id uuid, p_category text, p_details text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); message_row public.meetup_room_messages%rowtype; report_id uuid;
begin
  select * into message_row from public.meetup_room_messages where id = p_message_id;
  if message_row.id is null or message_row.sender_id is null or message_row.sender_id = caller
     or not private.room_is_active_member(message_row.room_id, caller) then
    raise exception using errcode = '42501', message = 'invalid_room_message_report_context';
  end if;
  insert into public.reports(reporter_id, reported_id, room_message_id, category, details)
  values (caller, message_row.sender_id, message_row.id, p_category, nullif(btrim(p_details), ''))
  returning id into report_id;
  insert into private.meetup_room_message_evidence(report_id, message_id, room_id, sender_id, body, link_hostnames)
  values (report_id, message_row.id, message_row.room_id, message_row.sender_id, message_row.body, message_row.link_hostnames);
  return report_id;
end;
$$;

create function public.report_meetup_room_message(message_id uuid, category text, details text default null)
returns uuid language sql security invoker set search_path = ''
as $$ select private.report_meetup_room_message_impl(message_id, category, details); $$;

create function private.resolve_meetup_room_conflict_impl(p_conflict_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); conflict_row private.meetup_room_conflicts%rowtype;
begin
  if p_action not in ('reinstate_both', 'remove_blocker', 'remove_blocked', 'remove_both') then
    raise exception using errcode = '22023', message = 'invalid_conflict_action';
  end if;
  select c.* into conflict_row from private.meetup_room_conflicts c
  join public.meetup_rooms r on r.id = c.room_id
  join public.meetups m on m.id = r.meetup_id
  where c.id = p_conflict_id and c.status = 'unresolved' and m.host_id = caller for update of c;
  if conflict_row.id is null then raise exception using errcode = '42501', message = 'room_host_required'; end if;
  update public.meetup_room_memberships set
    status = case
      when p_action = 'reinstate_both' then 'active'
      when p_action = 'remove_both' then 'removed'
      when p_action = 'remove_blocker' and profile_id = conflict_row.blocker_id then 'removed'
      when p_action = 'remove_blocked' and profile_id = conflict_row.blocked_id then 'removed'
      else 'active' end,
    pause_reason = null, updated_at = now()
  where room_id = conflict_row.room_id and profile_id in (conflict_row.blocker_id, conflict_row.blocked_id);
  update private.meetup_room_conflicts set status = 'resolved', resolved_action = p_action,
    resolved_by = caller, resolved_at = now() where id = conflict_row.id;
end;
$$;

create function public.resolve_meetup_room_conflict(conflict_id uuid, action text)
returns void language sql security invoker set search_path = ''
as $$ select private.resolve_meetup_room_conflict_impl(conflict_id, action); $$;

-- Discovery is 30 days by default. Series pages can opt in to bounded future data.
create function public.discover_hittingar(filters jsonb default '{}')
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(item), '[]'::jsonb)
  from jsonb_array_elements(private.discover_meetups_impl(filters)) item
  where coalesce((filters ->> 'includeBeyond30Days')::boolean, false)
     or (item ->> 'startsAt')::timestamptz < now() + interval '30 days';
$$;

alter table public.meetup_participations
  add column starts_soon_notified_at timestamptz;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in (
    'meetup_joined', 'meetup_access_requested', 'meetup_request_approved',
    'meetup_request_declined', 'meetup_materially_changed', 'meetup_cancelled',
    'meetup_participant_removed', 'meetup_participant_reinstated', 'meetup_moderated',
    'meetup_confirmation_required', 'meetup_starts_soon', 'meetup_finish'
  )
);

create function private.process_hittumst_lifecycle_impl()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare pending_count integer := 0; expired_count integer := 0;
  soon_count integer := 0; finish_count integer := 0; closed_count integer := 0;
  changed record;
begin
  perform private.require_service_role();

  for changed in
    update public.meetup_participations mp set
      confirmation_state = 'confirmation_pending', confirmation_requested_at = now(), updated_at = now()
    from public.meetups m
    where m.id = mp.meetup_id and m.status = 'published'
      and mp.status in ('joined', 'approved') and mp.confirmation_state = 'not_required'
      and m.starts_at <= now() + interval '24 hours' and m.starts_at > now() + interval '2 hours'
    returning mp.profile_id, mp.meetup_id
  loop
    pending_count := pending_count + 1;
    perform private.enqueue_meetup_notification(
      changed.profile_id, 'meetup_confirmation_required', changed.meetup_id, '{}'::jsonb
    );
  end loop;

  for changed in
    update public.meetup_participations mp set
      status = 'left', left_at = now(), confirmation_state = 'expired',
      expired_at = now(), updated_at = now()
    from public.meetups m
    where m.id = mp.meetup_id and m.status = 'published'
      and mp.status in ('joined', 'approved') and mp.confirmation_state = 'confirmation_pending'
      and m.starts_at <= now() + interval '2 hours'
    returning mp.profile_id, mp.meetup_id
  loop
    expired_count := expired_count + 1;
  end loop;

  for changed in
    update public.meetup_participations mp set starts_soon_notified_at = now(), updated_at = now()
    from public.meetups m
    where m.id = mp.meetup_id and m.status = 'published'
      and mp.status in ('joined', 'approved') and mp.confirmation_state in ('confirmed', 'not_required')
      and mp.starts_soon_notified_at is null
      and m.starts_at <= now() + interval '2 hours' and m.starts_at > now()
    returning mp.profile_id, mp.meetup_id
  loop
    soon_count := soon_count + 1;
    perform private.enqueue_meetup_notification(
      changed.profile_id, 'meetup_starts_soon', changed.meetup_id, '{}'::jsonb
    );
  end loop;

  for changed in
    update public.meetup_participations mp set confirmation_state = 'completion_pending', updated_at = now()
    from public.meetups m
    where m.id = mp.meetup_id and mp.status in ('joined', 'approved')
      and mp.confirmation_state not in ('completed', 'dismissed', 'completion_pending')
      and now() >= m.effective_end + interval '2 hours'
    returning mp.profile_id, mp.meetup_id
  loop
    finish_count := finish_count + 1;
    perform private.enqueue_meetup_notification(
      changed.profile_id, 'meetup_finish', changed.meetup_id, '{}'::jsonb
    );
  end loop;

  update public.meetup_rooms set status = 'locked', locked_at = coalesce(locked_at, now())
  where status = 'open' and posting_closes_at <= now() and reading_closes_at > now();
  update public.meetup_rooms set status = 'closed'
  where status <> 'closed' and reading_closes_at <= now();
  get diagnostics closed_count = row_count;

  return jsonb_build_object(
    'confirmationPending', pending_count, 'expired', expired_count,
    'startsSoon', soon_count, 'finishNotices', finish_count, 'roomsClosed', closed_count
  );
end;
$$;

create function public.process_hittumst_lifecycle()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.process_hittumst_lifecycle_impl(); $$;

-- Realtime carries identifiers only; clients always re-fetch authorized rows.
create function private.broadcast_meetup_room_message_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('roomId', new.room_id, 'messageId', new.id),
    'message_changed', 'hittingur:' || new.room_id::text, true
  );
  return new;
end;
$$;

create trigger meetup_room_messages_broadcast_id
after insert or update of hidden_at on public.meetup_room_messages
for each row execute function private.broadcast_meetup_room_message_id();

create policy hittumst_room_broadcast_read on realtime.messages
for select to authenticated
using (
  split_part((select realtime.topic()), ':', 1) = 'hittingur'
  and private.room_is_active_member(
    split_part((select realtime.topic()), ':', 2)::uuid,
    (select auth.uid())
  )
);

alter function private.admin_get_report_impl(uuid) rename to admin_get_report_before_hittumst_impl;
create function private.admin_get_report_impl(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  base jsonb;
  room_evidence jsonb;
  series_evidence jsonb;
begin
  base := private.admin_get_report_before_hittumst_impl(p_report_id);
  select to_jsonb(evidence) into room_evidence
  from private.meetup_room_message_evidence evidence where evidence.report_id = p_report_id;
  select to_jsonb(series_row) into series_evidence
  from private.meetup_room_message_evidence evidence
  join public.meetup_rooms room on room.id = evidence.room_id
  join public.meetups meetup on meetup.id = room.meetup_id
  join public.meetup_series series_row on series_row.id = meetup.series_id
  where evidence.report_id = p_report_id;
  if room_evidence is not null then
    insert into private.admin_audit_log(actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'meetup.room_evidence_accessed', 'report', p_report_id::text,
      jsonb_build_object('message_id', room_evidence ->> 'message_id'));
  end if;
  return base || jsonb_build_object('room_message_evidence', room_evidence, 'series_evidence', series_evidence);
end;
$$;

create function private.admin_moderate_meetup_room_impl(
  p_report_id uuid, p_action text, p_reason text, p_profile_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  evidence private.meetup_room_message_evidence%rowtype;
  meetup_row public.meetups%rowtype;
begin
  perform private.require_staff();
  if p_action not in ('hide_message', 'lock_room', 'remove_participant', 'remove_occurrence', 'remove_series')
     or char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception using errcode = '22023', message = 'invalid_room_moderation_action';
  end if;
  select * into evidence from private.meetup_room_message_evidence where report_id = p_report_id;
  if evidence.report_id is null then raise exception using errcode = 'P0002', message = 'room_report_evidence_not_found'; end if;
  select meetup.* into meetup_row from public.meetups meetup
  join public.meetup_rooms room on room.meetup_id = meetup.id where room.id = evidence.room_id;

  if p_action = 'hide_message' then
    update public.meetup_room_messages set hidden_at = now(), hidden_by = caller where id = evidence.message_id;
  elsif p_action = 'lock_room' then
    update public.meetup_rooms set status = 'locked', locked_at = now() where id = evidence.room_id;
  elsif p_action = 'remove_participant' then
    if p_profile_id is null then raise exception using errcode = '22023', message = 'profile_required'; end if;
    update public.meetup_room_memberships set status = 'removed', pause_reason = null, updated_at = now()
      where room_id = evidence.room_id and profile_id = p_profile_id and role <> 'host';
    update public.meetup_participations set status = 'removed', removed_at = now(), updated_at = now()
      where meetup_id = meetup_row.id and profile_id = p_profile_id;
  elsif p_action = 'remove_occurrence' then
    update public.meetups set status = 'moderation_hidden' where id = meetup_row.id;
    update public.meetup_rooms set status = 'locked', locked_at = now() where id = evidence.room_id;
  else
    if meetup_row.series_id is null then raise exception using errcode = '22023', message = 'series_required'; end if;
    update public.meetups set status = 'moderation_hidden'
      where series_id = meetup_row.series_id and starts_at > now();
    update public.meetup_series set status = 'cancelled' where id = meetup_row.series_id;
    update public.meetup_rooms room set status = 'locked', locked_at = now()
      from public.meetups meetup where meetup.id = room.meetup_id
        and meetup.series_id = meetup_row.series_id and meetup.starts_at > now();
  end if;
  insert into private.admin_audit_log(actor_id, action, target_type, target_id, details)
  values (caller, 'meetup.' || p_action, 'meetup_room', evidence.room_id::text,
    jsonb_build_object('report_id', p_report_id, 'reason', btrim(p_reason), 'profile_id', p_profile_id,
      'meetup_id', meetup_row.id, 'series_id', meetup_row.series_id));
end;
$$;

create function public.admin_moderate_meetup_room(
  p_report_id uuid, p_action text, p_reason text, p_profile_id uuid default null
)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_moderate_meetup_room_impl(p_report_id, p_action, p_reason, p_profile_id); $$;

-- Preserve the existing export and deletion behavior, then add the new records.
alter function private.export_account_impl() rename to export_account_before_hittumst_impl;
create function private.export_account_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); base jsonb;
begin
  base := private.export_account_before_hittumst_impl();
  return base || jsonb_build_object(
    'friendships', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at)
      from public.friendships f where caller in (f.requester_id, f.addressee_id)), '[]'::jsonb),
    'starredItems', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at)
      from public.starred_items s where s.owner_id = caller), '[]'::jsonb),
    'ownedGroups', coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at)
      from public.groups g where g.owner_id = caller), '[]'::jsonb),
    'groupMemberships', coalesce((select jsonb_agg(to_jsonb(gm) order by gm.joined_at)
      from public.group_members gm where gm.profile_id = caller), '[]'::jsonb),
    'authoredGroupMessages', coalesce((select jsonb_agg(to_jsonb(msg) order by msg.created_at)
      from public.group_messages msg where msg.sender_id = caller), '[]'::jsonb),
    'meetupSeries', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at)
      from public.meetup_series s where s.host_id = caller), '[]'::jsonb),
    'meetupRoomMemberships', coalesce((select jsonb_agg(to_jsonb(rm) order by rm.joined_at)
      from public.meetup_room_memberships rm where rm.profile_id = caller), '[]'::jsonb),
    'authoredMeetupRoomMessages', coalesce((select jsonb_agg(to_jsonb(msg) order by msg.created_at)
      from public.meetup_room_messages msg where msg.sender_id = caller), '[]'::jsonb),
    'meetupOnlineAccess', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at)
      from private.meetup_online_access a join public.meetups m on m.id = a.meetup_id
      where m.host_id = caller), '[]'::jsonb),
    'contentReactions', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.content_reactions r where r.user_id = caller), '[]'::jsonb)
  );
end;
$$;

create or replace function private.export_my_account_impl()
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.export_account_impl(); $$;
create or replace function public.export_account()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.export_account_impl(); $$;
create or replace function public.export_my_account()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.export_account_impl(); $$;

-- The original prepare helper existed only in a commented historical appendix.
-- Define the complete operation here so a clean installation has the same behavior.
create function private.prepare_account_deletion_impl()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null or not exists (select 1 from auth.users where id=caller) then
    raise exception using errcode='42501', message='authentication_required';
  end if;
  update public.messages set body=null, image_path=null, deleted_at=now() where sender_id=caller;
  update public.reports set details=null where reporter_id=caller;
  update public.group_messages set body = '[deleted]', sender_id = null where sender_id = caller;
  update public.meetup_room_messages set body = '[deleted]', link_hostnames = '{}', sender_id = null
    where sender_id = caller;
  update public.group_voice_sessions set started_by = null where started_by = caller;
  return true;
end;
$$;
create or replace function public.prepare_account_deletion()
returns boolean language sql security invoker set search_path = ''
as $$ select private.prepare_account_deletion_impl(); $$;

-- Data API privileges and function execution are opt-in.
revoke all on table public.content_reactions, public.friendships, public.starred_items,
  public.groups, public.group_members, public.group_messages, public.group_voice_sessions,
  public.group_voice_participants, public.meetup_series, public.meetup_rooms,
  public.meetup_room_memberships, public.meetup_room_messages
from public, anon, authenticated, service_role;
revoke select, insert, update, delete on public.content_ratings from authenticated;
revoke all on table private.group_blocks, private.meetup_online_access,
  private.meetup_room_conflicts, private.meetup_room_message_evidence
from public, anon, authenticated, service_role;

grant update (
  adult_profile_tags_enabled, starred_profile_audience, meetup_rsvp_visibility_default,
  comment_wall_enabled, anonymous_ratings_enabled
) on public.profiles to authenticated;

grant select, insert, update, delete on public.content_reactions, public.friendships,
  public.starred_items, public.groups, public.group_members, public.group_messages,
  public.group_voice_sessions, public.group_voice_participants, public.meetup_series,
  public.meetup_rooms, public.meetup_room_memberships, public.meetup_room_messages
to service_role;
grant select, insert, update, delete on private.group_blocks, private.meetup_online_access,
  private.meetup_room_conflicts, private.meetup_room_message_evidence
to service_role;
grant usage, select on all sequences in schema private to service_role;

revoke execute on function public.set_friendship(uuid,text) from public, anon, authenticated, service_role;
revoke execute on function public.rate_content(text,uuid,smallint) from public, anon, authenticated, service_role;
revoke execute on function public.list_content_rating_counts(text,uuid) from public, anon, authenticated, service_role;
revoke execute on function public.list_friends() from public, anon, authenticated, service_role;
revoke execute on function public.toggle_starred_item(text,text,text,text) from public, anon, authenticated, service_role;
revoke execute on function public.list_starred_items(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.toggle_content_reaction(text,uuid,text) from public, anon, authenticated, service_role;
revoke execute on function public.list_content_reactions(text,uuid) from public, anon, authenticated, service_role;
revoke execute on function public.create_group(text,text,text) from public, anon, authenticated, service_role;
revoke execute on function public.list_groups() from public, anon, authenticated, service_role;
revoke execute on function public.add_group_member(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke execute on function public.send_group_message(uuid,text) from public, anon, authenticated, service_role;
revoke execute on function public.list_group_messages(uuid,integer,timestamptz) from public, anon, authenticated, service_role;
revoke execute on function public.start_group_voice(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.set_meetup_expansion(uuid,jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.get_meetup_draft_recurrence(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.set_meetup_rsvp_visibility(uuid,text) from public, anon, authenticated, service_role;
revoke execute on function public.confirm_meetup_attendance(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.complete_meetup_attendance(uuid,text,text) from public, anon, authenticated, service_role;
revoke execute on function public.set_meetup_history_visibility(uuid,text) from public, anon, authenticated, service_role;
revoke execute on function public.list_public_meetup_roster(uuid,uuid,integer) from public, anon, authenticated, service_role;
revoke execute on function public.list_profile_meetup_history(uuid,timestamptz,integer) from public, anon, authenticated, service_role;
revoke execute on function public.list_profile_upcoming_meetups(uuid,timestamptz,integer) from public, anon, authenticated, service_role;
revoke execute on function public.get_meetup_online_access(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.get_meetup_room_summary(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.list_meetup_room_messages(uuid,timestamptz,integer) from public, anon, authenticated, service_role;
revoke execute on function public.send_meetup_room_message(uuid,text) from public, anon, authenticated, service_role;
revoke execute on function public.report_meetup_room_message(uuid,text,text) from public, anon, authenticated, service_role;
revoke execute on function public.resolve_meetup_room_conflict(uuid,text) from public, anon, authenticated, service_role;
revoke execute on function public.discover_hittingar(jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.process_hittumst_lifecycle() from public, anon, authenticated, service_role;
revoke execute on function public.publish_meetup_series(uuid,jsonb,jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.cancel_meetup_series_occurrences(uuid,text) from public, anon, authenticated, service_role;
revoke execute on function public.admin_moderate_meetup_room(uuid,text,text,uuid) from public, anon, authenticated, service_role;

grant execute on function public.rate_content(text,uuid,smallint), public.list_content_rating_counts(text,uuid),
  public.set_friendship(uuid,text), public.list_friends(),
  public.toggle_starred_item(text,text,text,text), public.list_starred_items(uuid),
  public.toggle_content_reaction(text,uuid,text), public.list_content_reactions(text,uuid),
  public.create_group(text,text,text), public.add_group_member(uuid,uuid,text),
  public.list_groups(), public.send_group_message(uuid,text),
  public.list_group_messages(uuid,integer,timestamptz), public.start_group_voice(uuid),
  public.set_meetup_expansion(uuid,jsonb), public.get_meetup_draft_recurrence(uuid),
  public.set_meetup_rsvp_visibility(uuid,text), public.confirm_meetup_attendance(uuid),
  public.complete_meetup_attendance(uuid,text,text),
  public.set_meetup_history_visibility(uuid,text),
  public.list_public_meetup_roster(uuid,uuid,integer),
  public.list_profile_meetup_history(uuid,timestamptz,integer),
  public.list_profile_upcoming_meetups(uuid,timestamptz,integer),
  public.get_meetup_online_access(uuid), public.get_meetup_room_summary(uuid),
  public.list_meetup_room_messages(uuid,timestamptz,integer),
  public.send_meetup_room_message(uuid,text),
  public.report_meetup_room_message(uuid,text,text),
  public.resolve_meetup_room_conflict(uuid,text),
  public.discover_hittingar(jsonb),
  public.publish_meetup_series(uuid,jsonb,jsonb),
  public.cancel_meetup_series_occurrences(uuid,text)
to authenticated;
grant execute on function public.process_hittumst_lifecycle() to service_role;
grant execute on function private.process_hittumst_lifecycle_impl() to service_role;
grant execute on function public.admin_moderate_meetup_room(uuid,text,text,uuid) to authenticated;

create extension if not exists pg_cron with schema pg_catalog;
do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'hittumst-meetup-lifecycle-15m';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'hittumst-meetup-lifecycle-15m',
    '*/15 * * * *',
    'select public.process_hittumst_lifecycle()'
  );
end;
$$;
