-- Hittingar: privacy-preserving meetups for authenticated adults.
-- Exact meetup locations live only in the private schema and are returned by
-- server-side authorization functions. Public tables contain safe metadata only.

alter table public.profiles
  add column adult_content_opted_in_at timestamptz,
  add column meetup_hosting_restricted_at timestamptz;

comment on column public.profiles.adult_content_opted_in_at is
  'Explicit, revocable preference for sexually explicit meetup discovery. Separate from sensitive-data consent.';
comment on column public.profiles.meetup_hosting_restricted_at is
  'Server-managed moderation restriction. A restricted account cannot create, publish, or edit meetups.';

create table public.meetup_general_areas (
  code text primary key,
  label_is text not null,
  label_en text not null,
  region text not null,
  safe_marker extensions.geography(point, 4326) not null,
  active boolean not null default true,
  sort_order smallint not null,
  constraint meetup_general_areas_code_check check (code ~ '^[a-z0-9_]{2,50}$'),
  constraint meetup_general_areas_label_is_length check (char_length(label_is) between 2 and 100),
  constraint meetup_general_areas_label_en_length check (char_length(label_en) between 2 and 100),
  constraint meetup_general_areas_region_check check (
    region in ('capital', 'south', 'west', 'westfjords', 'north', 'east')
  )
);

insert into public.meetup_general_areas (code, label_is, label_en, region, safe_marker, sort_order)
values
  ('reykjavik', 'Reykjavík', 'Reykjavík', 'capital', extensions.st_setsrid(extensions.st_makepoint(-21.9426, 64.1466), 4326)::extensions.geography, 10),
  ('vesturbaer', 'Vesturbær', 'Vesturbær', 'capital', extensions.st_setsrid(extensions.st_makepoint(-21.9660, 64.1455), 4326)::extensions.geography, 20),
  ('kopavogur', 'Kópavogur', 'Kópavogur', 'capital', extensions.st_setsrid(extensions.st_makepoint(-21.9120, 64.1110), 4326)::extensions.geography, 30),
  ('hafnarfjordur', 'Hafnarfjörður', 'Hafnarfjörður', 'capital', extensions.st_setsrid(extensions.st_makepoint(-21.9550, 64.0670), 4326)::extensions.geography, 40),
  ('keflavik', 'Keflavík', 'Keflavík', 'west', extensions.st_setsrid(extensions.st_makepoint(-22.5620, 64.0000), 4326)::extensions.geography, 50),
  ('borgarnes', 'Borgarnes', 'Borgarnes', 'west', extensions.st_setsrid(extensions.st_makepoint(-21.9200, 64.5380), 4326)::extensions.geography, 60),
  ('isafjordur', 'Ísafjörður', 'Ísafjörður', 'westfjords', extensions.st_setsrid(extensions.st_makepoint(-23.1350, 66.0740), 4326)::extensions.geography, 70),
  ('saudarkrokur', 'Sauðárkrókur', 'Sauðárkrókur', 'north', extensions.st_setsrid(extensions.st_makepoint(-19.6390, 65.7460), 4326)::extensions.geography, 80),
  ('akureyri', 'Akureyri', 'Akureyri', 'north', extensions.st_setsrid(extensions.st_makepoint(-18.0878, 65.6835), 4326)::extensions.geography, 90),
  ('egilsstadir', 'Egilsstaðir', 'Egilsstaðir', 'east', extensions.st_setsrid(extensions.st_makepoint(-14.3940, 65.2670), 4326)::extensions.geography, 100),
  ('selfoss', 'Selfoss', 'Selfoss', 'south', extensions.st_setsrid(extensions.st_makepoint(-20.9970, 63.9330), 4326)::extensions.geography, 110),
  ('vestmannaeyjar', 'Vestmannaeyjar', 'Vestmannaeyjar', 'south', extensions.st_setsrid(extensions.st_makepoint(-20.2730, 63.4420), 4326)::extensions.geography, 120);

-- PostgreSQL classifies generic timestamptz + interval as STABLE because
-- calendar intervals can depend on TimeZone. This fixed, time-only interval is
-- an absolute 43,200-second fallback and is safe for a stored generated column.
create function private.meetup_effective_end(
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns timestamptz
language sql
immutable
security invoker
set search_path = ''
as $$ select coalesce(p_ends_at, p_starts_at + interval '12 hours'); $$;

create function private.meetup_tags_are_valid(p_tags text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    not exists (
      select 1 from unnest(p_tags) as meetup_tag(tag)
      where tag is null
         or char_length(btrim(tag)) not between 2 and 30
         or tag <> btrim(tag)
         or tag not in (
           'coffee', 'conversation', 'walk', 'outdoors', 'games', 'community',
           'quiet', 'accessible', 'sober', 'newcomer_friendly', 'dating',
           'dance', 'food', 'private', 'adult_only'
         )
    )
    and cardinality(p_tags) = (
      select count(distinct lower(tag))::integer
      from unnest(p_tags) as meetup_tag(tag)
    ),
    false
  );
$$;

create table public.meetups (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text not null default '',
  category text not null,
  tags text[] not null default '{}',
  starts_at timestamptz not null,
  ends_at timestamptz,
  effective_end timestamptz generated always as (private.meetup_effective_end(starts_at, ends_at)) stored,
  access_mode text not null,
  location_visibility text not null,
  general_area text not null references public.meetup_general_areas(code),
  location_release_policy text not null default '24_hours_before',
  capacity integer,
  is_explicit boolean not null default false,
  prohibited_services_attested_at timestamptz,
  public_location_confirmed_at timestamptz,
  status text not null default 'draft',
  published_at timestamptz,
  cancelled_at timestamptz,
  moderation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetups_title_length check (char_length(btrim(title)) between 3 and 100),
  constraint meetups_description_length check (char_length(btrim(description)) between 10 and 4000),
  constraint meetups_category_check check (
    category in ('coffee_food', 'walk_outdoors', 'party_social', 'dating', 'community', 'private_adult', 'other')
  ),
  constraint meetups_tags_count check (cardinality(tags) <= 12),
  constraint meetups_tags_valid check (private.meetup_tags_are_valid(tags)),
  constraint meetups_time_order check (ends_at is null or ends_at > starts_at),
  constraint meetups_access_mode_check check (access_mode in ('open', 'private')),
  constraint meetups_location_visibility_check check (location_visibility in ('public', 'protected')),
  constraint meetups_location_release_policy_check check (location_release_policy in ('immediate', '24_hours_before')),
  constraint meetups_public_release_policy_check check (location_visibility = 'protected' or location_release_policy = 'immediate'),
  constraint meetups_capacity_check check (capacity is null or capacity between 1 and 1000),
  constraint meetups_explicit_category_check check (category <> 'private_adult' or is_explicit),
  constraint meetups_status_check check (status in ('draft', 'published', 'cancelled', 'moderation_hidden')),
  constraint meetups_publish_shape check (
    (status = 'draft' and published_at is null and cancelled_at is null)
    or (status = 'published' and published_at is not null and cancelled_at is null)
    or (status = 'cancelled' and published_at is not null and cancelled_at is not null)
    or (status = 'moderation_hidden' and moderation_reason is not null)
  )
);

create index meetups_discovery_idx
  on public.meetups (starts_at, id)
  where status = 'published';
create index meetups_host_status_starts_idx
  on public.meetups (host_id, status, starts_at desc)
  where host_id is not null;
create index meetups_category_starts_idx
  on public.meetups (category, starts_at, id)
  where status = 'published';

create table private.meetup_locations (
  meetup_id uuid primary key references public.meetups(id) on delete cascade,
  exact_point extensions.geography(point, 4326) not null,
  discovery_point extensions.geography(point, 4326) not null,
  venue_name text,
  address text,
  arrival_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetup_locations_venue_length check (venue_name is null or char_length(btrim(venue_name)) between 1 and 200),
  constraint meetup_locations_address_length check (address is null or char_length(btrim(address)) between 1 and 300),
  constraint meetup_locations_arrival_length check (arrival_instructions is null or char_length(btrim(arrival_instructions)) between 1 and 1000)
);
create index meetup_locations_exact_idx on private.meetup_locations using gist (exact_point);
create index meetup_locations_discovery_idx on private.meetup_locations using gist (discovery_point);

create table private.meetup_creation_attempts (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index meetup_creation_attempts_profile_created_idx
  on private.meetup_creation_attempts (profile_id, created_at desc);

create table private.meetup_place_search_attempts (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index meetup_place_search_attempts_profile_created_idx
  on private.meetup_place_search_attempts (profile_id, created_at desc);

create table private.meetup_participation_attempts (
  id bigint generated always as identity primary key,
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index meetup_participation_attempts_actor_event_created_idx
  on private.meetup_participation_attempts (profile_id, meetup_id, created_at desc);

create table private.meetup_feature_config (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into private.meetup_feature_config (id, enabled) values (1, false);

create table public.meetup_participations (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  status text not null,
  requested_at timestamptz,
  responded_at timestamptz,
  responded_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz,
  left_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetup_participations_status_check check (
    status in ('joined', 'pending', 'approved', 'declined', 'withdrawn', 'removed', 'left')
  ),
  constraint meetup_participations_shape_check check (
    (status = 'joined' and joined_at is not null and responded_at is null and left_at is null and removed_at is null)
    or (status = 'pending' and requested_at is not null and responded_at is null and joined_at is null and left_at is null and removed_at is null)
    or (status in ('approved', 'declined') and requested_at is not null and responded_at is not null and responded_by is not null and left_at is null and removed_at is null)
    or (status = 'withdrawn' and requested_at is not null and left_at is not null and removed_at is null)
    or (status = 'left' and left_at is not null and removed_at is null)
    or (status = 'removed' and removed_at is not null)
  )
);
create unique index meetup_participations_meetup_profile_uidx
  on public.meetup_participations (meetup_id, profile_id)
  where profile_id is not null;
create index meetup_participations_profile_status_idx
  on public.meetup_participations (profile_id, status, meetup_id)
  where profile_id is not null;
create index meetup_participations_meetup_status_idx
  on public.meetup_participations (meetup_id, status, requested_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  meetup_id uuid references public.meetups(id) on delete set null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_kind_check check (
    kind in (
      'meetup_joined', 'meetup_access_requested', 'meetup_request_approved',
      'meetup_request_declined', 'meetup_materially_changed', 'meetup_cancelled',
      'meetup_participant_removed', 'meetup_participant_reinstated', 'meetup_moderated'
    )
  ),
  constraint notifications_payload_object_check check (jsonb_typeof(payload) = 'object')
);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc, id desc)
  where read_at is null;

create table private.notification_outbox (
  id bigint generated always as identity primary key,
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_outbox_status_check check (status in ('pending', 'processing', 'ticketed', 'delivered', 'failed')),
  constraint notification_outbox_attempts_check check (attempts between 0 and 20)
);
create index notification_outbox_pending_idx
  on private.notification_outbox (available_at, id)
  where status in ('pending', 'failed');

alter table private.notification_outbox
  add column claim_token uuid,
  add column claimed_at timestamptz;

create table private.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null,
  locale text not null default 'is',
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_token_length check (char_length(expo_push_token) between 8 and 512),
  constraint push_tokens_platform_check check (platform in ('ios', 'android', 'web')),
  constraint push_tokens_locale_check check (locale in ('is', 'en')),
  constraint push_tokens_disabled_shape check (
    (enabled and disabled_at is null and disabled_reason is null)
    or (not enabled and disabled_at is not null and disabled_reason is not null)
  )
);
create index push_tokens_profile_enabled_idx
  on private.push_tokens (profile_id, id)
  where enabled;

create table private.push_deliveries (
  id bigint generated always as identity primary key,
  outbox_id bigint not null references private.notification_outbox(id) on delete cascade,
  token_id uuid references private.push_tokens(id) on delete set null,
  provider_ticket_id text unique,
  status text not null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  receipt_checked_at timestamptz,
  constraint push_deliveries_status_check check (status in ('ticketed', 'delivered', 'failed')),
  constraint push_deliveries_ticket_shape check (
    (status = 'ticketed' and provider_ticket_id is not null and receipt_checked_at is null)
    or (status in ('delivered', 'failed') and receipt_checked_at is not null)
  ),
  unique (outbox_id, token_id)
);
create index push_deliveries_pending_receipt_idx
  on private.push_deliveries (created_at, id)
  where status = 'ticketed';

create table private.meetup_revisions (
  id bigint generated always as identity primary key,
  meetup_id uuid references public.meetups(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  change_type text not null,
  safe_snapshot jsonb not null,
  exact_point extensions.geography(point, 4326),
  venue_name text,
  address text,
  arrival_instructions text,
  created_at timestamptz not null default now(),
  constraint meetup_revisions_change_type_check check (
    change_type in ('published', 'material_update', 'cancelled', 'reported', 'moderation_removed', 'moderation_restored')
  )
);
create index meetup_revisions_meetup_created_idx
  on private.meetup_revisions (meetup_id, created_at desc, id desc)
  where meetup_id is not null;

create table private.meetup_retention_config (
  id smallint primary key default 1 check (id = 1),
  purge_enabled boolean not null default false,
  policy_approved_at timestamptz,
  draft_retention interval,
  standard_retention interval,
  reported_retention interval,
  updated_at timestamptz not null default now(),
  constraint meetup_retention_config_positive check (
    (draft_retention is null or draft_retention > interval '0')
    and (standard_retention is null or standard_retention > interval '0')
    and (reported_retention is null or reported_retention > interval '0')
    and (reported_retention is null or standard_retention is null or reported_retention >= standard_retention)
    and (policy_approved_at is not null or (
      not purge_enabled and draft_retention is null and standard_retention is null and reported_retention is null
    ))
  )
);
insert into private.meetup_retention_config (id) values (1);

create table private.meetup_retention (
  meetup_id uuid primary key references public.meetups(id) on delete cascade,
  retain_until timestamptz,
  legal_hold_at timestamptz,
  legal_hold_reason text,
  legal_hold_set_by uuid references auth.users(id) on delete set null,
  legal_hold_released_at timestamptz,
  legal_hold_release_reason text,
  updated_at timestamptz not null default now(),
  constraint meetup_retention_hold_reason_length check (
    legal_hold_reason is null or char_length(btrim(legal_hold_reason)) between 8 and 1000
  ),
  constraint meetup_retention_release_reason_length check (
    legal_hold_release_reason is null or char_length(btrim(legal_hold_release_reason)) between 8 and 1000
  ),
  constraint meetup_retention_hold_shape check (
    (legal_hold_at is null and legal_hold_reason is null and legal_hold_set_by is null)
    or (legal_hold_at is not null and legal_hold_reason is not null)
  )
);
create index meetup_retention_purge_idx
  on private.meetup_retention (retain_until, meetup_id)
  where legal_hold_at is null or legal_hold_released_at is not null;

alter table public.reports drop constraint reports_category_check;
alter table public.reports
  add column priority text not null default 'standard',
  add column meetup_id uuid references public.meetups(id) on delete set null,
  add column meetup_revision_id bigint references private.meetup_revisions(id) on delete set null,
  add constraint reports_category_check check (
    category in (
      'harassment', 'hate', 'impersonation', 'spam',
      'minor_suspected', 'csam', 'threat', 'ncii',
      'coercion_non_consent', 'dangerous_location', 'misrepresentation',
      'hate_discrimination', 'spam_advertising', 'trafficking_exploitation',
      'illegal_activity', 'compensated_sexual_services', 'other'
    )
  ),
  add constraint reports_priority_check check (priority in ('standard', 'urgent', 'critical')),
  add constraint reports_meetup_context_shape check (
    meetup_id is null or meetup_revision_id is not null
  );
create index reports_meetup_id_idx on public.reports (meetup_id) where meetup_id is not null;
create index reports_priority_status_created_idx on public.reports (priority, status, created_at, id);

alter table public.meetup_general_areas enable row level security;
alter table public.meetups enable row level security;
alter table public.meetup_participations enable row level security;
alter table public.notifications enable row level security;
alter table private.meetup_locations enable row level security;
alter table private.meetup_locations force row level security;
alter table private.meetup_creation_attempts enable row level security;
alter table private.meetup_creation_attempts force row level security;
alter table private.meetup_place_search_attempts enable row level security;
alter table private.meetup_place_search_attempts force row level security;
alter table private.meetup_participation_attempts enable row level security;
alter table private.meetup_participation_attempts force row level security;
alter table private.meetup_feature_config enable row level security;
alter table private.meetup_feature_config force row level security;
alter table private.notification_outbox enable row level security;
alter table private.notification_outbox force row level security;
alter table private.push_tokens enable row level security;
alter table private.push_tokens force row level security;
alter table private.push_deliveries enable row level security;
alter table private.push_deliveries force row level security;
alter table private.meetup_revisions enable row level security;
alter table private.meetup_revisions force row level security;
alter table private.meetup_retention_config enable row level security;
alter table private.meetup_retention_config force row level security;
alter table private.meetup_retention enable row level security;
alter table private.meetup_retention force row level security;

create trigger meetups_set_updated_at
before update on public.meetups
for each row execute function private.set_updated_at();
create trigger meetup_locations_set_updated_at
before update on private.meetup_locations
for each row execute function private.set_updated_at();
create trigger meetup_participations_set_updated_at
before update on public.meetup_participations
for each row execute function private.set_updated_at();
create trigger notification_outbox_set_updated_at
before update on private.notification_outbox
for each row execute function private.set_updated_at();
create trigger push_tokens_set_updated_at
before update on private.push_tokens
for each row execute function private.set_updated_at();
create trigger push_deliveries_set_updated_at
before update on private.push_deliveries
for each row execute function private.set_updated_at();
create trigger meetup_retention_config_set_updated_at
before update on private.meetup_retention_config
for each row execute function private.set_updated_at();
create trigger meetup_retention_set_updated_at
before update on private.meetup_retention
for each row execute function private.set_updated_at();
create trigger meetup_feature_config_set_updated_at
before update on private.meetup_feature_config
for each row execute function private.set_updated_at();

comment on table public.meetups is 'Safe meetup metadata only. Exact locations are isolated in private.meetup_locations.';
comment on table private.meetup_locations is 'Exact meetup locations. Never expose this table through the Data API.';
comment on table private.meetup_creation_attempts is
  'Successful meetup draft creations used for the initial safety limit of five per rolling 60 minutes. Change only through a reviewed migration.';
comment on table private.meetup_place_search_attempts is
  'Authenticated place-search quota events. The initial reviewed limit is 30 requests per rolling 10 minutes.';
comment on table private.meetup_participation_attempts is
  'Successful join/request entries used for the reviewed limit of five per profile and meetup per rolling 60 minutes.';
comment on table private.meetup_feature_config is
  'Server-side Hittingar rollout control. The singleton is disabled by default and may be changed only through its service-role RPC.';
comment on table public.meetup_participations is 'Participant lifecycle. Direct client writes are denied; atomic RPCs enforce mode and capacity.';
comment on table public.notifications is 'User-visible, location-free notification records. Push delivery is handled through the private outbox.';
comment on table private.meetup_revisions is 'Immutable moderation evidence snapshots, including protected fields. Access is case-scoped and audited.';
comment on table private.meetup_retention_config is 'Purge is disabled and durations remain NULL until counsel approves a retention policy.';

-- Central Hittingar authorization and evidence helpers.
create function private.meetup_feature_is_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.enabled from private.meetup_feature_config c where c.id = 1
  ), false);
$$;

create function private.assert_meetup_feature_enabled()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.meetup_feature_is_enabled() then
    raise exception using errcode = '55000', message = 'meetup_feature_disabled';
  end if;
end;
$$;

create function private.meetup_actor_is_active(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.profiles p
    where p.id = p_actor_id
      and p.onboarding_completed_at is not null
      and p.special_category_consent_at is not null
      and p.date_of_birth is not null
      and p.date_of_birth <= current_date - interval '18 years'
      and p.moderation_status <> 'banned'
      and (p.moderation_status <> 'suspended' or p.suspended_until <= now())
  ), false);
$$;

create function private.meetup_current_user_can_host()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.meetup_feature_is_enabled()
    and private.meetup_actor_is_active((select auth.uid()))
    and coalesce((
      select p.meetup_hosting_restricted_at is null and p.is_profile_visible
      from public.profiles p
      where p.id = (select auth.uid())
    ), false);
$$;

create function public.can_create_meetup()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.meetup_current_user_can_host(); $$;

create function private.consume_meetup_place_search_quota_impl()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  attempt_count integer;
begin
  perform private.assert_meetup_feature_enabled();
  if caller is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if not private.meetup_current_user_can_host() then
    raise exception using errcode = '42501', message = 'meetup_host_not_eligible';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('meetup-place-search:' || caller::text, 0)
  );
  delete from private.meetup_place_search_attempts a
  where a.profile_id = caller
    and a.created_at < pg_catalog.statement_timestamp() - interval '10 minutes';
  select count(*)::integer into attempt_count
  from private.meetup_place_search_attempts a
  where a.profile_id = caller
    and a.created_at >= pg_catalog.statement_timestamp() - interval '10 minutes';
  if attempt_count >= 30 then
    raise exception using errcode = '54000', message = 'meetup_place_search_rate_limit_exceeded';
  end if;
  insert into private.meetup_place_search_attempts (profile_id) values (caller);
  return true;
end;
$$;

create function public.consume_meetup_place_search_quota()
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.consume_meetup_place_search_quota_impl(); $$;

create function private.consume_meetup_participation_quota(
  p_meetup_id uuid,
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare attempt_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'meetup-participation:' || p_profile_id::text || ':' || p_meetup_id::text,
      0
    )
  );
  delete from private.meetup_participation_attempts a
  where a.profile_id = p_profile_id
    and a.meetup_id = p_meetup_id
    and a.created_at < pg_catalog.statement_timestamp() - interval '60 minutes';
  select count(*)::integer into attempt_count
  from private.meetup_participation_attempts a
  where a.profile_id = p_profile_id
    and a.meetup_id = p_meetup_id
    and a.created_at >= pg_catalog.statement_timestamp() - interval '60 minutes';
  if attempt_count >= 5 then
    raise exception using errcode = '54000', message = 'meetup_participation_rate_limit_exceeded';
  end if;
  insert into private.meetup_participation_attempts (meetup_id, profile_id)
  values (p_meetup_id, p_profile_id);
end;
$$;

create function private.meetup_block_exists(p_first uuid, p_second uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.blocks b
    where (b.blocker_id = p_first and b.blocked_id = p_second)
       or (b.blocker_id = p_second and b.blocked_id = p_first)
  ), false);
$$;

create function private.meetup_is_host(p_meetup_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.meetups m
    where m.id = p_meetup_id and m.host_id = p_profile_id
  ), false);
$$;

create function private.meetup_participation_status(p_meetup_id uuid, p_viewer_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when m.host_id = p_viewer_id then 'host'
    else coalesce((
      select mp.status
      from public.meetup_participations mp
      where mp.meetup_id = p_meetup_id and mp.profile_id = p_viewer_id
    ), 'none')
  end
  from public.meetups m
  where m.id = p_meetup_id;
$$;

create function private.meetup_has_attendee_access(p_meetup_id uuid, p_viewer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.meetups m
    where m.id = p_meetup_id
      and p_viewer_id is not null
      and not private.meetup_block_exists(m.host_id, p_viewer_id)
      and (
        m.host_id = p_viewer_id
        or exists (
          select 1
          from public.meetup_participations mp
          where mp.meetup_id = m.id
            and mp.profile_id = p_viewer_id
            and mp.status in ('joined', 'approved')
        )
      )
  ), false);
$$;

create function private.meetup_report_priority(p_category text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_category in (
      'minor_suspected', 'csam', 'threat', 'ncii',
      'coercion_non_consent', 'trafficking_exploitation'
    ) then 'critical'
    when p_category in (
      'harassment', 'hate', 'hate_discrimination', 'impersonation', 'dangerous_location'
    ) then 'urgent'
    else 'standard'
  end;
$$;

create function private.set_report_priority()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.priority := private.meetup_report_priority(new.category);
  return new;
end;
$$;

create trigger reports_set_priority
before insert or update of category on public.reports
for each row execute function private.set_report_priority();

update public.reports
set priority = private.meetup_report_priority(category);

create function private.meetup_safe_snapshot(p_meetup_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', m.id,
    'hostId', m.host_id,
    'title', m.title,
    'description', m.description,
    'category', m.category,
    'tags', m.tags,
    'startsAt', m.starts_at,
    'endsAt', m.ends_at,
    'effectiveEnd', m.effective_end,
    'accessMode', m.access_mode,
    'locationVisibility', m.location_visibility,
    'generalAreaId', m.general_area,
    'generalArea', jsonb_build_object(
      'id', a.code,
      'labelIs', a.label_is,
      'labelEn', a.label_en,
      'region', a.region
    ),
    'releasePolicy', m.location_release_policy,
    'participantCount', (
      select count(*)::integer
      from public.meetup_participations mp
      where mp.meetup_id = m.id and mp.status in ('joined', 'approved')
    ),
    'capacity', m.capacity,
    'isExplicit', m.is_explicit,
    'status', m.status,
    'publishedAt', m.published_at,
    'cancelledAt', m.cancelled_at,
    'moderationReason', m.moderation_reason,
    'updatedAt', m.updated_at
  ))
  from public.meetups m
  join public.meetup_general_areas a on a.code = m.general_area
  where m.id = p_meetup_id;
$$;

create function private.capture_meetup_revision(
  p_meetup_id uuid,
  p_change_type text,
  p_actor_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare revision_id bigint;
begin
  insert into private.meetup_revisions (
    meetup_id, actor_id, change_type, safe_snapshot,
    exact_point, venue_name, address, arrival_instructions
  )
  select m.id, coalesce(p_actor_id, (select auth.uid())), p_change_type,
         private.meetup_safe_snapshot(m.id),
         l.exact_point, l.venue_name, l.address, l.arrival_instructions
  from public.meetups m
  left join private.meetup_locations l on l.meetup_id = m.id
  where m.id = p_meetup_id
  returning id into revision_id;

  if revision_id is null then
    raise exception using errcode = 'P0002', message = 'meetup_not_found';
  end if;
  insert into private.meetup_retention (meetup_id, retain_until)
  select m.id, m.effective_end + c.standard_retention
  from public.meetups m
  cross join private.meetup_retention_config c
  where m.id = p_meetup_id and c.id = 1
  on conflict (meetup_id) do update
  set retain_until = greatest(private.meetup_retention.retain_until, excluded.retain_until);
  return revision_id;
end;
$$;

create function private.set_meetup_location(p_meetup_id uuid, p_input jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  latitude double precision;
  longitude double precision;
  raw_point extensions.geometry(point, 4326);
  exact_location extensions.geography(point, 4326);
  safe_location extensions.geography(point, 4326);
  visibility text;
  area_marker extensions.geography(point, 4326);
begin
  if (p_input ? 'latitude') <> (p_input ? 'longitude') then
    raise exception using errcode = '22023', message = 'both_coordinates_required';
  end if;

  select m.location_visibility, a.safe_marker into visibility, area_marker
  from public.meetups m
  join public.meetup_general_areas a on a.code = m.general_area and a.active
  where m.id = p_meetup_id;
  if visibility is null then
    raise exception using errcode = 'P0002', message = 'meetup_not_found';
  end if;

  if p_input ? 'latitude' then
    latitude := (p_input ->> 'latitude')::double precision;
    longitude := (p_input ->> 'longitude')::double precision;
    if latitude not between -90 and 90 or longitude not between -180 and 180 then
      raise exception using errcode = '22023', message = 'invalid_coordinates';
    end if;
    raw_point := extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326);
    if not exists (
      select 1 from private.iceland_boundaries b
      where extensions.st_dwithin(
        raw_point::extensions.geography,
        b.boundary::extensions.geography,
        2500
      )
    ) then
      raise exception using errcode = '22023', message = 'meetup_location_outside_iceland';
    end if;
    exact_location := raw_point::extensions.geography;
    safe_location := case when visibility = 'protected' then area_marker else exact_location end;

    insert into private.meetup_locations (
      meetup_id, exact_point, discovery_point, venue_name, address, arrival_instructions
    ) values (
      p_meetup_id, exact_location, safe_location,
      nullif(btrim(p_input ->> 'venueName'), ''),
      nullif(btrim(p_input ->> 'address'), ''),
      nullif(btrim(p_input ->> 'arrivalInstructions'), '')
    )
    on conflict (meetup_id) do update set
      exact_point = excluded.exact_point,
      discovery_point = excluded.discovery_point,
      venue_name = case when p_input ? 'venueName' then excluded.venue_name else private.meetup_locations.venue_name end,
      address = case when p_input ? 'address' then excluded.address else private.meetup_locations.address end,
      arrival_instructions = case when p_input ? 'arrivalInstructions' then excluded.arrival_instructions else private.meetup_locations.arrival_instructions end;
  else
    update private.meetup_locations l
    set discovery_point = case when visibility = 'protected' then area_marker else l.exact_point end,
        venue_name = case when p_input ? 'venueName' then nullif(btrim(p_input ->> 'venueName'), '') else l.venue_name end,
        address = case when p_input ? 'address' then nullif(btrim(p_input ->> 'address'), '') else l.address end,
        arrival_instructions = case when p_input ? 'arrivalInstructions' then nullif(btrim(p_input ->> 'arrivalInstructions'), '') else l.arrival_instructions end
    where l.meetup_id = p_meetup_id;
    if not found then
      raise exception using errcode = '22023', message = 'meetup_location_required';
    end if;
  end if;
end;
$$;

create function private.enqueue_meetup_notification(
  p_recipient_id uuid,
  p_kind text,
  p_meetup_id uuid,
  p_payload jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare notification_id uuid;
begin
  if p_payload ?| array['latitude', 'longitude', 'exactLocation', 'arrivalInstructions', 'address'] then
    raise exception using errcode = '22023', message = 'notification_payload_contains_private_location';
  end if;
  insert into public.notifications (recipient_id, kind, meetup_id, payload)
  values (p_recipient_id, p_kind, p_meetup_id, coalesce(p_payload, '{}'::jsonb))
  returning id into notification_id;
  insert into private.notification_outbox (notification_id) values (notification_id);
  return notification_id;
end;
$$;

create function private.notify_meetup_participants(
  p_meetup_id uuid,
  p_kind text,
  p_payload jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare participant record;
begin
  for participant in
    select mp.profile_id
    from public.meetup_participations mp
    where mp.meetup_id = p_meetup_id
      and mp.profile_id is not null
      and mp.status in ('joined', 'approved')
  loop
    perform private.enqueue_meetup_notification(participant.profile_id, p_kind, p_meetup_id, p_payload);
  end loop;
end;
$$;

create function private.meetup_is_discoverable(p_meetup_id uuid, p_viewer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.meetups m
    join public.profiles host on host.id = m.host_id
    join private.meetup_locations l on l.meetup_id = m.id
    join public.profiles viewer on viewer.id = p_viewer_id
    where m.id = p_meetup_id
      and private.meetup_actor_is_active(p_viewer_id)
      and private.meetup_actor_is_active(m.host_id)
      and host.meetup_hosting_restricted_at is null
      and host.is_profile_visible
      and m.status = 'published'
      and m.effective_end >= now()
      and not private.meetup_block_exists(m.host_id, p_viewer_id)
      and (not m.is_explicit or viewer.adult_content_opted_in_at is not null)
  ), false);
$$;

create function private.meetup_payload(
  p_meetup_id uuid,
  p_viewer_id uuid,
  p_include_description boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  meetup_row public.meetups%rowtype;
  location_row private.meetup_locations%rowtype;
  viewer_status text;
  attendee_access boolean;
  viewer_active boolean;
  blocked boolean;
  can_view_exact boolean;
  can_view_arrival boolean;
  attending_count integer;
  full_now boolean;
  can_mutate boolean;
  latitude double precision;
  longitude double precision;
  marker_approximate boolean;
  release_at timestamptz;
  access_expires_at timestamptz;
  response_visibility text;
  area_marker extensions.geography;
  general_area_payload jsonb;
  location_payload jsonb;
  host_payload jsonb;
begin
  select * into meetup_row from public.meetups where id = p_meetup_id;
  if meetup_row.id is null then
    raise exception using errcode = 'P0002', message = 'meetup_not_found';
  end if;
  select * into location_row from private.meetup_locations where meetup_id = p_meetup_id;

  viewer_status := private.meetup_participation_status(p_meetup_id, p_viewer_id);
  attendee_access := private.meetup_has_attendee_access(p_meetup_id, p_viewer_id);
  viewer_active := private.meetup_actor_is_active(p_viewer_id);
  blocked := meetup_row.host_id is null or p_viewer_id is null
    or private.meetup_block_exists(meetup_row.host_id, p_viewer_id);
  release_at := case
    when meetup_row.location_visibility = 'public' or meetup_row.location_release_policy = 'immediate'
      then meetup_row.published_at
    else meetup_row.starts_at - interval '24 hours'
  end;
  access_expires_at := meetup_row.effective_end + interval '2 hours';
  can_mutate := viewer_active and meetup_row.status = 'published'
    and private.meetup_is_discoverable(p_meetup_id, p_viewer_id);
  can_view_exact := location_row.meetup_id is not null and (
    (
      viewer_status = 'host'
      and viewer_active
      and exists (
        select 1 from public.profiles hp
        where hp.id = p_viewer_id
          and hp.is_profile_visible
          and hp.meetup_hosting_restricted_at is null
      )
    )
    or (
      viewer_active and meetup_row.status = 'published' and not blocked
      and now() <= access_expires_at
      and (
        meetup_row.location_visibility = 'public'
        or (attendee_access and release_at is not null and now() >= release_at)
      )
      and (
        not meetup_row.is_explicit
        or exists (
          select 1 from public.profiles vp
          where vp.id = p_viewer_id and vp.adult_content_opted_in_at is not null
        )
      )
    )
  );
  can_view_arrival := location_row.meetup_id is not null
    and (viewer_status = 'host' or (can_view_exact and attendee_access));
  response_visibility := case
    when meetup_row.location_visibility = 'public' and not can_view_exact then 'protected'
    else meetup_row.location_visibility
  end;

  select jsonb_build_object(
    'id', a.code,
    'labelIs', a.label_is,
    'labelEn', a.label_en,
    'region', a.region
  ), a.safe_marker into general_area_payload, area_marker
  from public.meetup_general_areas a
  where a.code = meetup_row.general_area;

  select count(*)::integer into attending_count
  from public.meetup_participations mp
  where mp.meetup_id = p_meetup_id and mp.status in ('joined', 'approved');
  full_now := meetup_row.capacity is not null and attending_count >= meetup_row.capacity;

  if can_view_exact then
    latitude := extensions.st_y(location_row.exact_point::extensions.geometry);
    longitude := extensions.st_x(location_row.exact_point::extensions.geometry);
    marker_approximate := false;
    location_payload := jsonb_strip_nulls(jsonb_build_object(
      'state', case when meetup_row.location_visibility = 'public' then 'public' else 'protected_revealed' end,
      'generalAreaId', meetup_row.general_area,
      'marker', jsonb_build_object(
        'latitude', latitude, 'longitude', longitude, 'isApproximate', false
      ),
      'exactLocation', jsonb_build_object(
        'latitude', latitude,
        'longitude', longitude,
        'venueName', location_row.venue_name,
        'address', location_row.address
      ),
      'arrivalInstructions', case when can_view_arrival then location_row.arrival_instructions else null end,
      'accessExpiresAt', case when meetup_row.location_visibility = 'protected' then access_expires_at else null end
    ));
  else
    latitude := extensions.st_y(area_marker::extensions.geometry);
    longitude := extensions.st_x(area_marker::extensions.geometry);
    marker_approximate := true;
    location_payload := jsonb_build_object(
      'state', 'protected_locked',
      'generalAreaId', meetup_row.general_area,
      'releaseAt', release_at,
      'marker', jsonb_build_object(
        'latitude', latitude,
        'longitude', longitude,
        'isApproximate', marker_approximate
      )
    );
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'id', p.id,
    'displayName', p.display_name,
    'avatarPath', photo.storage_path
  )) into host_payload
  from public.profiles p
  left join lateral (
    select pp.storage_path
    from public.profile_photos pp
    where pp.profile_id = p.id and pp.approval_status = 'approved'
    order by pp.position
    limit 1
  ) photo on true
  where p.id = meetup_row.host_id;

  if host_payload is null then
    host_payload := jsonb_build_object(
      'id', 'deleted:' || meetup_row.id::text,
      'displayName', 'Deleted member'
    );
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'id', meetup_row.id,
    'title', meetup_row.title,
    'description', case when p_include_description then meetup_row.description else null end,
    'category', meetup_row.category,
    'tags', meetup_row.tags,
    'startsAt', meetup_row.starts_at,
    'endsAt', meetup_row.ends_at,
    'effectiveEnd', meetup_row.effective_end,
    'generalAreaId', meetup_row.general_area,
    'generalArea', general_area_payload,
    'host', host_payload,
    'accessMode', meetup_row.access_mode,
    'locationVisibility', response_visibility,
    'releasePolicy', meetup_row.location_release_policy,
    'participantCount', attending_count,
    'capacity', meetup_row.capacity,
    'isFull', full_now,
    'isExplicit', meetup_row.is_explicit,
    'status', meetup_row.status,
    'location', location_payload,
    'viewerState', jsonb_build_object(
      'participationStatus', viewer_status,
      'hasProtectedLocationAccess', response_visibility = 'protected' and can_view_exact
    ),
    'capabilities', jsonb_build_object(
      'canViewExactLocation', can_view_exact,
      'canViewArrivalInstructions', can_view_arrival,
      'canJoin', can_mutate and meetup_row.access_mode = 'open' and not full_now
        and viewer_status in ('none', 'left', 'withdrawn'),
      'canRequestAccess', can_mutate and meetup_row.access_mode = 'private'
        and viewer_status in ('none', 'left', 'withdrawn'),
      'canCancelRequest', can_mutate and viewer_status = 'pending',
      'canLeave', can_mutate and viewer_status in ('joined', 'approved'),
      'canEdit', viewer_status = 'host' and private.meetup_current_user_can_host()
        and meetup_row.status in ('draft', 'published'),
      'canManageRequests', viewer_status = 'host' and private.meetup_current_user_can_host()
        and meetup_row.status = 'published',
      'canRemoveParticipants', viewer_status = 'host' and private.meetup_current_user_can_host()
        and meetup_row.status = 'published',
      'canCancel', viewer_status = 'host' and meetup_row.status = 'published',
      'canDeleteDraft', viewer_status = 'host' and meetup_row.status = 'draft',
      'canReport', viewer_active and meetup_row.host_id is not null and meetup_row.host_id <> p_viewer_id,
      'canBlockHost', viewer_active and meetup_row.host_id is not null and meetup_row.host_id <> p_viewer_id
        and not exists (
          select 1 from public.blocks b
          where b.blocker_id = p_viewer_id and b.blocked_id = meetup_row.host_id
        )
    )
  ));
end;
$$;

create function private.meetup_report_context_is_valid(p_meetup_id uuid, p_reported_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.meetups m
    where m.id = p_meetup_id
      and m.host_id = p_reported_id
      and m.host_id <> (select auth.uid())
      and (
        m.published_at is not null
        or exists (
          select 1 from public.meetup_participations mp
          where mp.meetup_id = m.id and mp.profile_id = (select auth.uid())
        )
      )
  ), false);
$$;

create function private.prepare_meetup_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare host_id uuid;
begin
  if new.meetup_id is null then
    return new;
  end if;
  if new.category not in (
    'minor_suspected', 'csam', 'threat', 'ncii', 'harassment',
    'coercion_non_consent', 'dangerous_location', 'misrepresentation',
    'hate_discrimination', 'spam_advertising', 'trafficking_exploitation',
    'illegal_activity', 'compensated_sexual_services', 'other'
  ) then
    raise exception using errcode = '22023', message = 'invalid_meetup_report_category';
  end if;
  select m.host_id into host_id from public.meetups m where m.id = new.meetup_id;
  if host_id is null then
    raise exception using errcode = 'P0002', message = 'meetup_not_found';
  end if;
  if new.reporter_id <> (select auth.uid()) or new.reported_id <> host_id
     or not private.meetup_report_context_is_valid(new.meetup_id, new.reported_id) then
    raise exception using errcode = '42501', message = 'invalid_meetup_report_context';
  end if;
  new.meetup_revision_id := private.capture_meetup_revision(new.meetup_id, 'reported', new.reporter_id);
  update private.meetup_retention r
  set retain_until = greatest(r.retain_until, now() + c.reported_retention)
  from private.meetup_retention_config c
  where r.meetup_id = new.meetup_id and c.id = 1;
  return new;
end;
$$;

create trigger reports_prepare_meetup_context
before insert on public.reports
for each row execute function private.prepare_meetup_report();

create policy meetup_general_areas_select_active
on public.meetup_general_areas for select to authenticated
using (active);

create policy meetups_select_related
on public.meetups for select to authenticated
using (
  host_id = (select auth.uid())
  or (
    (not is_explicit or exists (
      select 1 from public.profiles viewer
      where viewer.id = (select auth.uid()) and viewer.adult_content_opted_in_at is not null
    ))
    and
    not private.meetup_block_exists(host_id, (select auth.uid()))
    and exists (
      select 1 from public.meetup_participations mp
      where mp.meetup_id = id and mp.profile_id = (select auth.uid())
        and mp.status <> 'removed'
    )
  )
);

create policy meetup_participations_select_related
on public.meetup_participations for select to authenticated
using (
  profile_id = (select auth.uid())
  or (
    private.meetup_is_host(meetup_id, (select auth.uid()))
    and private.meetup_current_user_can_host()
  )
);

create policy notifications_select_own
on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()));
create policy notifications_update_read_own
on public.notifications for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

drop policy reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
for insert to authenticated
with check (
  (select auth.uid()) = reporter_id
  and reported_id is not null
  and reported_id <> (select auth.uid())
  and status = 'open'
  and assigned_admin is null
  and resolution_notes is null
  and resolved_at is null
  and (
    (
      meetup_id is null and meetup_revision_id is null
      and album_share_id is null and album_item_id is null
      and (select private.report_context_is_valid(conversation_id, message_id, reported_id))
    )
    or (
      meetup_id is null and meetup_revision_id is null
      and album_share_id is not null and album_item_id is not null
      and conversation_id is null and message_id is null
      and (select private.album_report_context_is_valid(album_share_id, album_item_id, reported_id))
    )
    or (
      meetup_id is not null and meetup_revision_id is not null
      and album_share_id is null and album_item_id is null
      and conversation_id is null and message_id is null
      and (select private.meetup_report_context_is_valid(meetup_id, reported_id))
    )
  )
);

-- Creator mutations. Every write locks the meetup row and resolves the actor from auth.uid().
create function private.create_meetup_draft_impl(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  meetup_id uuid;
  tags_value text[] := '{}';
  attempt_count integer;
begin
  perform private.assert_meetup_feature_enabled();
  if caller is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if not private.meetup_current_user_can_host() then
    raise exception using errcode = '42501', message = 'meetup_host_not_eligible';
  end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_meetup_input';
  end if;
  if coalesce(jsonb_typeof(p_input -> 'tags'), 'array') <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_meetup_tags';
  end if;
  if p_input ? 'tags' then
    select coalesce(array_agg(btrim(value)), '{}') into tags_value
    from jsonb_array_elements_text(p_input -> 'tags') value;
  end if;
  if p_input ? 'prohibitedServicesAttested'
     and jsonb_typeof(p_input -> 'prohibitedServicesAttested') <> 'boolean' then
    raise exception using errcode = '22023', message = 'invalid_prohibited_services_attestation';
  end if;
  if p_input ? 'publicLocationConfirmed'
     and jsonb_typeof(p_input -> 'publicLocationConfirmed') <> 'boolean' then
    raise exception using errcode = '22023', message = 'invalid_public_location_confirmation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('meetup-create:' || caller::text, 0)
  );
  delete from private.meetup_creation_attempts a
  where a.profile_id = caller
    and a.created_at < pg_catalog.statement_timestamp() - interval '60 minutes';
  select count(*)::integer into attempt_count
  from private.meetup_creation_attempts a
  where a.profile_id = caller
    and a.created_at >= pg_catalog.statement_timestamp() - interval '60 minutes';
  if attempt_count >= 5 then
    raise exception using errcode = '54000', message = 'meetup_creation_rate_limit_exceeded';
  end if;

  insert into public.meetups (
    host_id, title, description, category, tags, starts_at, ends_at,
    access_mode, location_visibility, general_area, location_release_policy, capacity, is_explicit,
    prohibited_services_attested_at, public_location_confirmed_at
  ) values (
    caller,
    btrim(p_input ->> 'title'),
    coalesce(btrim(p_input ->> 'description'), ''),
    p_input ->> 'category',
    tags_value,
    (p_input ->> 'startsAt')::timestamptz,
    case when nullif(p_input ->> 'endsAt', '') is null then null else (p_input ->> 'endsAt')::timestamptz end,
    p_input ->> 'accessMode',
    p_input ->> 'locationVisibility',
    p_input ->> 'generalAreaId',
    case
      when p_input ? 'releasePolicy' then p_input ->> 'releasePolicy'
      when p_input ->> 'locationVisibility' = 'protected' then '24_hours_before'
      else null
    end,
    case when nullif(p_input ->> 'capacity', '') is null then null else (p_input ->> 'capacity')::integer end,
    coalesce((p_input ->> 'isExplicit')::boolean, false),
    case when coalesce((p_input ->> 'prohibitedServicesAttested')::boolean, false) then now() end,
    case
      when p_input ->> 'locationVisibility' = 'public'
       and coalesce((p_input ->> 'publicLocationConfirmed')::boolean, false)
      then now()
    end
  ) returning id into meetup_id;

  perform private.set_meetup_location(meetup_id, p_input);
  insert into private.meetup_creation_attempts (profile_id) values (caller);
  insert into private.meetup_retention (meetup_id, retain_until)
  select meetup_id, now() + c.draft_retention
  from private.meetup_retention_config c where c.id = 1;
  return meetup_id;
end;
$$;

create function public.create_meetup_draft(input jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.create_meetup_draft_impl(input); $$;

create function private.update_meetup_impl(p_meetup_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  previous public.meetups%rowtype;
  updated public.meetups%rowtype;
  tags_value text[];
  attendee_count integer;
  changes text[] := '{}';
  previous_release_at timestamptz;
  updated_release_at timestamptz;
begin
  perform private.assert_meetup_feature_enabled();
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_meetup_input';
  end if;
  select * into previous from public.meetups where id = p_meetup_id for update;
  if previous.id is null then raise exception using errcode = 'P0002', message = 'meetup_not_found'; end if;
  if previous.host_id <> caller then raise exception using errcode = '42501', message = 'meetup_host_required'; end if;
  if previous.status not in ('draft', 'published') then
    raise exception using errcode = '55000', message = 'meetup_not_editable';
  end if;
  if not private.meetup_current_user_can_host() then
    raise exception using errcode = '42501', message = 'meetup_host_not_eligible';
  end if;
  if p_input ? 'tags' then
    if jsonb_typeof(p_input -> 'tags') <> 'array' then
      raise exception using errcode = '22023', message = 'invalid_meetup_tags';
    end if;
    select coalesce(array_agg(btrim(value)), '{}') into tags_value
    from jsonb_array_elements_text(p_input -> 'tags') value;
  else
    tags_value := previous.tags;
  end if;
  if p_input ? 'prohibitedServicesAttested'
     and jsonb_typeof(p_input -> 'prohibitedServicesAttested') <> 'boolean' then
    raise exception using errcode = '22023', message = 'invalid_prohibited_services_attestation';
  end if;
  if p_input ? 'publicLocationConfirmed'
     and jsonb_typeof(p_input -> 'publicLocationConfirmed') <> 'boolean' then
    raise exception using errcode = '22023', message = 'invalid_public_location_confirmation';
  end if;

  update public.meetups m set
    title = case when p_input ? 'title' then btrim(p_input ->> 'title') else m.title end,
    description = case when p_input ? 'description' then coalesce(btrim(p_input ->> 'description'), '') else m.description end,
    category = case when p_input ? 'category' then p_input ->> 'category' else m.category end,
    tags = tags_value,
    starts_at = case when p_input ? 'startsAt' then (p_input ->> 'startsAt')::timestamptz else m.starts_at end,
    ends_at = case when p_input ? 'endsAt' then
      case when nullif(p_input ->> 'endsAt', '') is null then null else (p_input ->> 'endsAt')::timestamptz end
      else m.ends_at end,
    access_mode = case when p_input ? 'accessMode' then p_input ->> 'accessMode' else m.access_mode end,
    location_visibility = case when p_input ? 'locationVisibility' then p_input ->> 'locationVisibility' else m.location_visibility end,
    general_area = case when p_input ? 'generalAreaId' then p_input ->> 'generalAreaId' else m.general_area end,
    location_release_policy = case
      when p_input ? 'releasePolicy' then p_input ->> 'releasePolicy'
      when p_input ->> 'locationVisibility' = 'protected' and m.location_visibility = 'public'
        then '24_hours_before'
      else m.location_release_policy
    end,
    capacity = case when p_input ? 'capacity' then
      case when nullif(p_input ->> 'capacity', '') is null then null else (p_input ->> 'capacity')::integer end
      else m.capacity end,
    is_explicit = case when p_input ? 'isExplicit' then (p_input ->> 'isExplicit')::boolean else m.is_explicit end,
    prohibited_services_attested_at = case
      when p_input ?| array['title', 'description', 'category', 'tags', 'isExplicit']
        then case when coalesce((p_input ->> 'prohibitedServicesAttested')::boolean, false) then now() end
      when p_input ? 'prohibitedServicesAttested'
        then case when (p_input ->> 'prohibitedServicesAttested')::boolean then now() end
      else m.prohibited_services_attested_at
    end,
    public_location_confirmed_at = case
      when p_input ?| array[
        'locationVisibility', 'generalAreaId', 'latitude', 'longitude',
        'venueName', 'address', 'arrivalInstructions'
      ] or p_input ? 'publicLocationConfirmed' then
        case
          when coalesce(p_input ->> 'locationVisibility', m.location_visibility) = 'public'
           and coalesce((p_input ->> 'publicLocationConfirmed')::boolean, false)
          then now()
        end
      else m.public_location_confirmed_at
    end
  where m.id = p_meetup_id
  returning m.* into updated;

  perform private.set_meetup_location(p_meetup_id, p_input);

  if updated.status = 'published' and updated.prohibited_services_attested_at is null then
    raise exception using errcode = '22023', message = 'prohibited_services_attestation_required';
  end if;
  if updated.status = 'published' and updated.location_visibility = 'public'
     and updated.public_location_confirmed_at is null then
    raise exception using errcode = '22023', message = 'public_location_confirmation_required';
  end if;

  select count(*)::integer into attendee_count
  from public.meetup_participations mp
  where mp.meetup_id = p_meetup_id and mp.status in ('joined', 'approved');
  if updated.capacity is not null and attendee_count > updated.capacity then
    raise exception using errcode = '23514', message = 'capacity_below_current_attendance';
  end if;
  previous_release_at := case
    when previous.location_visibility = 'public' or previous.location_release_policy = 'immediate'
      then previous.published_at
    else previous.starts_at - interval '24 hours'
  end;
  updated_release_at := case
    when updated.location_visibility = 'public' or updated.location_release_policy = 'immediate'
      then updated.published_at
    else updated.starts_at - interval '24 hours'
  end;
  if previous.status = 'published'
     and previous_release_at is not null
     and previous_release_at <= now()
     and exists (
       select 1 from public.meetup_participations mp
       where mp.meetup_id = p_meetup_id
         and (
           mp.status in ('joined', 'approved', 'left')
           or (mp.status = 'removed' and (mp.joined_at is not null or mp.responded_at is not null))
         )
     )
     and updated_release_at > previous_release_at then
    raise exception using errcode = '55000', message = 'released_location_window_cannot_move_later';
  end if;

  if previous.starts_at is distinct from updated.starts_at or previous.ends_at is distinct from updated.ends_at then
    changes := array_append(changes, 'time');
  end if;
  if previous.access_mode is distinct from updated.access_mode then
    changes := array_append(changes, 'accessMode');
  end if;
  if previous.location_visibility is distinct from updated.location_visibility
     or previous.general_area is distinct from updated.general_area
     or previous.location_release_policy is distinct from updated.location_release_policy
     or p_input ?| array['latitude', 'longitude', 'venueName', 'address', 'arrivalInstructions'] then
    changes := array_append(changes, 'location');
  end if;

  if updated.status = 'published' and cardinality(changes) > 0 then
    perform private.capture_meetup_revision(p_meetup_id, 'material_update', caller);
    perform private.notify_meetup_participants(
      p_meetup_id,
      'meetup_materially_changed',
      jsonb_build_object('title', updated.title, 'changes', to_jsonb(changes))
    );
  end if;
  return private.meetup_payload(p_meetup_id, caller, true);
end;
$$;

create function public.update_meetup(meetup_id uuid, input jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.update_meetup_impl(meetup_id, input); $$;

create function private.publish_meetup_impl(p_meetup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  meetup_row public.meetups%rowtype;
begin
  perform private.assert_meetup_feature_enabled();
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  select * into meetup_row from public.meetups where id = p_meetup_id for update;
  if meetup_row.id is null then raise exception using errcode = 'P0002', message = 'meetup_not_found'; end if;
  if meetup_row.host_id <> caller then raise exception using errcode = '42501', message = 'meetup_host_required'; end if;
  if meetup_row.status <> 'draft' then raise exception using errcode = '55000', message = 'meetup_not_draft'; end if;
  if not private.meetup_current_user_can_host() then
    raise exception using errcode = '42501', message = 'meetup_host_not_eligible';
  end if;
  if meetup_row.starts_at <= now() then
    raise exception using errcode = '22023', message = 'future_start_required';
  end if;
  if not exists (select 1 from private.meetup_locations l where l.meetup_id = p_meetup_id) then
    raise exception using errcode = '22023', message = 'meetup_location_required';
  end if;
  if meetup_row.prohibited_services_attested_at is null then
    raise exception using errcode = '22023', message = 'prohibited_services_attestation_required';
  end if;
  if meetup_row.location_visibility = 'public' and meetup_row.public_location_confirmed_at is null then
    raise exception using errcode = '22023', message = 'public_location_confirmation_required';
  end if;
  update public.meetups
  set status = 'published', published_at = now(), cancelled_at = null, moderation_reason = null
  where id = p_meetup_id;
  perform private.capture_meetup_revision(p_meetup_id, 'published', caller);
  return private.meetup_payload(p_meetup_id, caller, true);
end;
$$;

create function public.publish_meetup(meetup_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.publish_meetup_impl(meetup_id); $$;

create function private.participation_payload(p_meetup_id uuid, p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'meetupId', mp.meetup_id,
    'profileId', mp.profile_id,
    'status', mp.status,
    'requestedAt', mp.requested_at,
    'respondedAt', mp.responded_at
  ))
  from public.meetup_participations mp
  where mp.meetup_id = p_meetup_id and mp.profile_id = p_profile_id;
$$;

create function private.meetup_request_payload(p_meetup_id uuid, p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'meetupId', mp.meetup_id,
    'profile', jsonb_strip_nulls(jsonb_build_object(
      'id', p.id,
      'displayName', p.display_name,
      'avatarPath', photo.storage_path
    )),
    'status', mp.status,
    'requestedAt', mp.requested_at,
    'respondedAt', mp.responded_at
  ))
  from public.meetup_participations mp
  join public.profiles p on p.id = mp.profile_id
  left join lateral (
    select pp.storage_path
    from public.profile_photos pp
    where pp.profile_id = p.id and pp.approval_status = 'approved'
    order by pp.position limit 1
  ) photo on true
  where mp.meetup_id = p_meetup_id and mp.profile_id = p_profile_id;
$$;

create function private.join_meetup_impl(p_meetup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  meetup_row public.meetups%rowtype;
  existing public.meetup_participations%rowtype;
  attendee_count integer;
begin
  perform private.assert_meetup_feature_enabled();
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  if not private.meetup_actor_is_active(caller) then
    raise exception using errcode = '42501', message = 'meetup_participant_not_eligible';
  end if;
  select * into meetup_row from public.meetups where id = p_meetup_id for update;
  if meetup_row.id is null then raise exception using errcode = 'P0002', message = 'meetup_not_found'; end if;
  if meetup_row.host_id = caller then raise exception using errcode = '22023', message = 'host_is_already_participating'; end if;
  if meetup_row.access_mode <> 'open' then raise exception using errcode = '55000', message = 'meetup_requires_access_request'; end if;
  if not private.meetup_is_discoverable(p_meetup_id, caller) then
    raise exception using errcode = '42501', message = 'meetup_not_joinable';
  end if;
  select * into existing
  from public.meetup_participations
  where meetup_id = p_meetup_id and profile_id = caller
  for update;
  if existing.id is not null and existing.status not in ('left', 'withdrawn') then
    raise exception using errcode = '55000', message =
      case when existing.status = 'removed' then 'meetup_participant_removed'
           else 'meetup_participation_already_exists' end;
  end if;
  select count(*)::integer into attendee_count
  from public.meetup_participations mp
  where mp.meetup_id = p_meetup_id and mp.status in ('joined', 'approved');
  if meetup_row.capacity is not null and attendee_count >= meetup_row.capacity then
    raise exception using errcode = '23514', message = 'meetup_full';
  end if;

  perform private.consume_meetup_participation_quota(p_meetup_id, caller);
  insert into public.meetup_participations (
    meetup_id, profile_id, status, joined_at
  ) values (p_meetup_id, caller, 'joined', now())
  on conflict (meetup_id, profile_id) where profile_id is not null do update set
    status = 'joined', requested_at = null, responded_at = null, responded_by = null,
    joined_at = now(), left_at = null, removed_at = null;

  if meetup_row.host_id is not null then
    perform private.enqueue_meetup_notification(
      meetup_row.host_id, 'meetup_joined', p_meetup_id,
      jsonb_build_object('title', meetup_row.title, 'profileId', caller)
    );
  end if;
  return private.participation_payload(p_meetup_id, caller);
end;
$$;

create function public.join_meetup(meetup_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.join_meetup_impl(meetup_id); $$;

create function private.request_meetup_access_impl(p_meetup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  meetup_row public.meetups%rowtype;
  existing public.meetup_participations%rowtype;
begin
  perform private.assert_meetup_feature_enabled();
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  if not private.meetup_actor_is_active(caller) then
    raise exception using errcode = '42501', message = 'meetup_participant_not_eligible';
  end if;
  select * into meetup_row from public.meetups where id = p_meetup_id for update;
  if meetup_row.id is null then raise exception using errcode = 'P0002', message = 'meetup_not_found'; end if;
  if meetup_row.host_id = caller then raise exception using errcode = '22023', message = 'host_is_already_participating'; end if;
  if meetup_row.access_mode <> 'private' then raise exception using errcode = '55000', message = 'meetup_is_open'; end if;
  if not private.meetup_is_discoverable(p_meetup_id, caller) then
    raise exception using errcode = '42501', message = 'meetup_not_requestable';
  end if;
  select * into existing
  from public.meetup_participations
  where meetup_id = p_meetup_id and profile_id = caller
  for update;
  if existing.id is not null and existing.status not in ('left', 'withdrawn') then
    raise exception using errcode = '55000', message =
      case when existing.status = 'removed' then 'meetup_participant_removed'
           else 'meetup_participation_already_exists' end;
  end if;

  perform private.consume_meetup_participation_quota(p_meetup_id, caller);
  insert into public.meetup_participations (
    meetup_id, profile_id, status, requested_at
  ) values (p_meetup_id, caller, 'pending', now())
  on conflict (meetup_id, profile_id) where profile_id is not null do update set
    status = 'pending', requested_at = now(), responded_at = null, responded_by = null,
    joined_at = null, left_at = null, removed_at = null;

  if meetup_row.host_id is not null then
    perform private.enqueue_meetup_notification(
      meetup_row.host_id, 'meetup_access_requested', p_meetup_id,
      jsonb_build_object('title', meetup_row.title, 'profileId', caller)
    );
  end if;
  return private.participation_payload(p_meetup_id, caller);
end;
$$;

create function public.request_meetup_access(meetup_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.request_meetup_access_impl(meetup_id); $$;

create function private.respond_to_meetup_request_impl(
  p_meetup_id uuid,
  p_profile_id uuid,
  p_approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  meetup_row public.meetups%rowtype;
  request_row public.meetup_participations%rowtype;
  attendee_count integer;
begin
  perform private.assert_meetup_feature_enabled();
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  select * into meetup_row from public.meetups where id = p_meetup_id for update;
  if meetup_row.id is null then raise exception using errcode = 'P0002', message = 'meetup_not_found'; end if;
  if meetup_row.host_id <> caller then raise exception using errcode = '42501', message = 'meetup_host_required'; end if;
  if meetup_row.status <> 'published' then raise exception using errcode = '55000', message = 'meetup_not_active'; end if;
  if not private.meetup_current_user_can_host() then
    raise exception using errcode = '42501', message = 'meetup_host_not_eligible';
  end if;
  select * into request_row
  from public.meetup_participations
  where meetup_id = p_meetup_id and profile_id = p_profile_id
  for update;
  if request_row.id is null or request_row.status <> 'pending' then
    raise exception using errcode = 'P0002', message = 'pending_meetup_request_not_found';
  end if;
  if p_approve then
    if private.meetup_block_exists(meetup_row.host_id, p_profile_id) then
      raise exception using errcode = '42501', message = 'meetup_participant_blocked';
    end if;
    if not private.meetup_actor_is_active(p_profile_id) then
      raise exception using errcode = '42501', message = 'meetup_participant_not_eligible';
    end if;
    select count(*)::integer into attendee_count
    from public.meetup_participations mp
    where mp.meetup_id = p_meetup_id and mp.status in ('joined', 'approved');
    if meetup_row.capacity is not null and attendee_count >= meetup_row.capacity then
      raise exception using errcode = '23514', message = 'meetup_full';
    end if;
  end if;
  update public.meetup_participations
  set status = case when p_approve then 'approved' else 'declined' end,
      responded_at = now(), responded_by = caller
  where id = request_row.id;

  perform private.enqueue_meetup_notification(
    p_profile_id,
    case when p_approve then 'meetup_request_approved' else 'meetup_request_declined' end,
    p_meetup_id,
    jsonb_build_object('title', meetup_row.title)
  );
  return private.meetup_request_payload(p_meetup_id, p_profile_id);
end;
$$;

create function public.respond_to_meetup_request(meetup_id uuid, profile_id uuid, approve boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.respond_to_meetup_request_impl(meetup_id, profile_id, approve); $$;

create function private.reinstate_meetup_participant_impl(
  p_meetup_id uuid,
  p_profile_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  meetup_row public.meetups%rowtype;
  participation_row public.meetup_participations%rowtype;
  attendee_count integer;
begin
  perform private.assert_meetup_feature_enabled();
  if p_status not in ('pending', 'approved') then
    raise exception using errcode = '22023', message = 'invalid_reinstatement_status';
  end if;
  select * into meetup_row from public.meetups where id = p_meetup_id for update;
  if meetup_row.id is null or meetup_row.host_id <> caller then
    raise exception using errcode = '42501', message = 'meetup_host_required';
  end if;
  if meetup_row.status <> 'published' or not private.meetup_current_user_can_host() then
    raise exception using errcode = '55000', message = 'meetup_not_manageable';
  end if;
  if private.meetup_block_exists(meetup_row.host_id, p_profile_id) then
    raise exception using errcode = '42501', message = 'meetup_participant_blocked';
  end if;
  if not private.meetup_actor_is_active(p_profile_id) then
    raise exception using errcode = '42501', message = 'meetup_participant_not_eligible';
  end if;
  select * into participation_row
  from public.meetup_participations
  where meetup_id = p_meetup_id and profile_id = p_profile_id
  for update;
  if participation_row.id is null or participation_row.status not in ('declined', 'removed') then
    raise exception using errcode = 'P0002', message = 'terminal_participation_not_found';
  end if;
  if p_status = 'approved' then
    select count(*)::integer into attendee_count
    from public.meetup_participations mp
    where mp.meetup_id = p_meetup_id and mp.status in ('joined', 'approved');
    if meetup_row.capacity is not null and attendee_count >= meetup_row.capacity then
      raise exception using errcode = '23514', message = 'meetup_full';
    end if;
  end if;
  update public.meetup_participations
  set status = p_status,
      requested_at = coalesce(requested_at, now()),
      responded_at = case when p_status = 'approved' then now() else null end,
      responded_by = case when p_status = 'approved' then caller else null end,
      joined_at = null, left_at = null, removed_at = null
  where id = participation_row.id;
  perform private.enqueue_meetup_notification(
    p_profile_id, 'meetup_participant_reinstated', p_meetup_id,
    jsonb_build_object('title', meetup_row.title, 'status', p_status)
  );
  return private.meetup_request_payload(p_meetup_id, p_profile_id);
end;
$$;

create function public.reinstate_meetup_participant(meetup_id uuid, profile_id uuid, status text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.reinstate_meetup_participant_impl(meetup_id, profile_id, status); $$;

create function private.cancel_meetup_request_impl(p_meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meetup_participations
  set status = 'withdrawn', left_at = now()
  where meetup_id = p_meetup_id
    and profile_id = (select auth.uid())
    and status = 'pending';
  if not found then raise exception using errcode = 'P0002', message = 'pending_meetup_request_not_found'; end if;
end;
$$;

create function public.cancel_meetup_request(meetup_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.cancel_meetup_request_impl(meetup_id); $$;

create function private.leave_meetup_impl(p_meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meetup_participations
  set status = 'left', left_at = now()
  where meetup_id = p_meetup_id
    and profile_id = (select auth.uid())
    and status in ('joined', 'approved');
  if not found then raise exception using errcode = 'P0002', message = 'active_meetup_participation_not_found'; end if;
end;
$$;

create function public.leave_meetup(meetup_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.leave_meetup_impl(meetup_id); $$;

create function private.remove_meetup_participant_impl(p_meetup_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); meetup_title text;
begin
  perform private.assert_meetup_feature_enabled();
  select m.title into meetup_title
  from public.meetups m
  where m.id = p_meetup_id and m.host_id = caller and m.status = 'published'
  for update;
  if meetup_title is null then raise exception using errcode = '42501', message = 'meetup_host_required'; end if;
  if not private.meetup_current_user_can_host() then
    raise exception using errcode = '42501', message = 'meetup_host_not_eligible';
  end if;
  update public.meetup_participations
  set status = 'removed', removed_at = now()
  where meetup_id = p_meetup_id and profile_id = p_profile_id and status in ('joined', 'approved');
  if not found then raise exception using errcode = 'P0002', message = 'active_meetup_participation_not_found'; end if;
  perform private.enqueue_meetup_notification(
    p_profile_id, 'meetup_participant_removed', p_meetup_id,
    jsonb_build_object('title', meetup_title)
  );
end;
$$;

create function public.remove_meetup_participant(meetup_id uuid, profile_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.remove_meetup_participant_impl(meetup_id, profile_id); $$;

create function private.cancel_meetup_impl(p_meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); meetup_title text;
begin
  update public.meetups
  set status = 'cancelled', cancelled_at = now(), moderation_reason = null
  where id = p_meetup_id and host_id = caller and status = 'published'
  returning title into meetup_title;
  if meetup_title is null then
    raise exception using errcode = '42501', message = 'active_hosted_meetup_not_found';
  end if;
  perform private.capture_meetup_revision(p_meetup_id, 'cancelled', caller);
  perform private.notify_meetup_participants(
    p_meetup_id, 'meetup_cancelled', jsonb_build_object('title', meetup_title)
  );
end;
$$;

create function public.cancel_meetup(meetup_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.cancel_meetup_impl(meetup_id); $$;

create function private.delete_meetup_draft_impl(p_meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.meetups m
  where m.id = p_meetup_id
    and m.host_id = (select auth.uid())
    and m.status = 'draft'
    and not exists (select 1 from public.meetup_participations mp where mp.meetup_id = m.id)
    and not exists (select 1 from public.reports r where r.meetup_id = m.id);
  if not found then raise exception using errcode = '42501', message = 'deletable_meetup_draft_not_found'; end if;
end;
$$;

create function public.delete_meetup_draft(meetup_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.delete_meetup_draft_impl(meetup_id); $$;

create function private.report_meetup_impl(p_meetup_id uuid, p_category text, p_details text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); host_id uuid; report_id uuid;
begin
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  select m.host_id into host_id from public.meetups m where m.id = p_meetup_id;
  if host_id is null then raise exception using errcode = 'P0002', message = 'meetup_not_found'; end if;
  if not private.meetup_report_context_is_valid(p_meetup_id, host_id) then
    raise exception using errcode = '42501', message = 'invalid_meetup_report_context';
  end if;
  insert into public.reports (reporter_id, reported_id, meetup_id, category, details)
  values (caller, host_id, p_meetup_id, p_category, nullif(btrim(p_details), ''))
  returning id into report_id;
  return report_id;
end;
$$;

create function public.report_meetup(meetup_id uuid, category text, details text default null)
returns uuid language sql security invoker set search_path = ''
as $$ select private.report_meetup_impl(meetup_id, category, details); $$;

create function private.set_adult_content_preference_impl(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  if not private.meetup_actor_is_active((select auth.uid())) then
    raise exception using errcode = '42501', message = 'profile_not_eligible';
  end if;
  update public.profiles p
  set adult_content_opted_in_at = case when p_enabled then coalesce(p.adult_content_opted_in_at, now()) else null end
  where p.id = (select auth.uid())
    and p.onboarding_completed_at is not null
    and p.special_category_consent_at is not null;
  if not found then raise exception using errcode = '42501', message = 'profile_not_eligible'; end if;
end;
$$;

create function public.set_adult_content_preference(enabled boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.set_adult_content_preference_impl(enabled); $$;

-- Sanitized discovery and detail reads.
create function private.discover_meetups_impl(p_filters jsonb default '{}')
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

create function public.discover_meetups(filters jsonb default '{}')
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.discover_meetups_impl(filters); $$;

create function private.get_meetup_impl(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); meetup_row public.meetups%rowtype; related boolean;
begin
  perform private.assert_meetup_feature_enabled();
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  if not private.meetup_actor_is_active(caller) then
    raise exception using errcode = '42501', message = 'meetup_participant_not_eligible';
  end if;
  select * into meetup_row from public.meetups where id = p_meetup_id;
  if meetup_row.id is null then raise exception using errcode = 'P0002', message = 'meetup_not_found'; end if;
  if meetup_row.is_explicit and meetup_row.host_id <> caller and not exists (
    select 1 from public.profiles p where p.id = caller and p.adult_content_opted_in_at is not null
  ) then
    raise exception using errcode = '42501', message = 'adult_content_preference_required';
  end if;
  related := meetup_row.host_id = caller or exists (
    select 1 from public.meetup_participations mp
    where mp.meetup_id = p_meetup_id and mp.profile_id = caller
      and mp.status in ('joined', 'pending', 'approved', 'declined', 'withdrawn', 'left')
  );
  if not private.meetup_is_discoverable(p_meetup_id, caller)
     and not (related and not private.meetup_block_exists(meetup_row.host_id, caller)) then
    raise exception using errcode = '42501', message = 'meetup_not_visible';
  end if;
  return private.meetup_payload(p_meetup_id, caller, true);
end;
$$;

create function public.get_meetup(meetup_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_meetup_impl(meetup_id); $$;

create function private.list_my_meetups_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); result jsonb;
begin
  perform private.assert_meetup_feature_enabled();
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  select coalesce(jsonb_agg(rows.payload order by rows.starts_at desc, rows.id), '[]'::jsonb)
  into result
  from (
    select m.id, m.starts_at, private.meetup_payload(m.id, caller, true) payload
    from public.meetups m
    where m.host_id = caller
       or exists (
         select 1 from public.meetup_participations mp
         where mp.meetup_id = m.id and mp.profile_id = caller
           and mp.status <> 'removed'
           and not private.meetup_block_exists(m.host_id, caller)
           and (not m.is_explicit or exists (
             select 1 from public.profiles p
             where p.id = caller and p.adult_content_opted_in_at is not null
           ))
       )
    order by m.starts_at desc, m.id
    limit 500
  ) rows;
  return result;
end;
$$;

create function public.list_my_meetups()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_my_meetups_impl(); $$;

create function private.list_meetup_requests_impl(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); result jsonb;
begin
  perform private.assert_meetup_feature_enabled();
  if not exists (
    select 1 from public.meetups m
    where m.id = p_meetup_id and m.host_id = caller and m.status = 'published'
  ) then
    raise exception using errcode = '42501', message = 'meetup_host_required';
  end if;
  if not private.meetup_current_user_can_host() then
    raise exception using errcode = '42501', message = 'meetup_host_not_eligible';
  end if;
  select coalesce(jsonb_agg(
    private.meetup_request_payload(mp.meetup_id, mp.profile_id)
    order by case mp.status when 'pending' then 0 when 'approved' then 1 else 2 end,
             mp.requested_at, mp.id
  ), '[]'::jsonb) into result
  from public.meetup_participations mp
  where mp.meetup_id = p_meetup_id
    and mp.profile_id is not null
    and mp.status in ('pending', 'approved', 'declined');
  return result;
end;
$$;

create function public.list_meetup_requests(meetup_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_meetup_requests_impl(meetup_id); $$;

create function private.list_meetup_participants_impl(p_meetup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); result jsonb;
begin
  perform private.assert_meetup_feature_enabled();
  if not exists (
    select 1 from public.meetups m
    where m.id = p_meetup_id and m.host_id = caller and m.status = 'published'
  ) then
    raise exception using errcode = '42501', message = 'meetup_host_required';
  end if;
  if not private.meetup_current_user_can_host() then
    raise exception using errcode = '42501', message = 'meetup_host_not_eligible';
  end if;
  select coalesce(jsonb_agg(
    private.meetup_request_payload(mp.meetup_id, mp.profile_id)
    order by
      case mp.status
        when 'pending' then 0 when 'joined' then 1 when 'approved' then 2
        when 'removed' then 3 when 'declined' then 4 when 'withdrawn' then 5 else 6
      end,
      coalesce(mp.requested_at, mp.joined_at, mp.created_at), mp.id
  ), '[]'::jsonb) into result
  from public.meetup_participations mp
  where mp.meetup_id = p_meetup_id
    and mp.profile_id is not null
    and mp.status in ('joined', 'pending', 'approved', 'declined', 'withdrawn', 'removed', 'left');
  return result;
end;
$$;

create function public.list_meetup_participants(meetup_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_meetup_participants_impl(meetup_id); $$;

create function private.list_notifications_impl(p_limit_count integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', rows.id,
    'kind', rows.kind,
    'meetupId', rows.meetup_id,
    'payload', rows.payload,
    'createdAt', rows.created_at,
    'readAt', rows.read_at
  )) order by rows.created_at desc, rows.id desc), '[]'::jsonb)
  from (
    select n.*
    from public.notifications n
    where n.recipient_id = (select auth.uid())
    order by n.created_at desc, n.id desc
    limit least(greatest(coalesce(p_limit_count, 50), 1), 200)
  ) rows;
$$;

create function public.list_notifications(limit_count integer default 50)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.list_notifications_impl(limit_count); $$;

create function private.mark_notification_read_impl(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id and recipient_id = (select auth.uid());
  if not found then raise exception using errcode = 'P0002', message = 'notification_not_found'; end if;
end;
$$;

create function public.mark_notification_read(notification_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.mark_notification_read_impl(notification_id); $$;

-- Cross-feature propagation: blocks and account/consent state revoke access immediately.
create function private.normalize_profile_meetup_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.special_category_consent_at is null then
    new.adult_content_opted_in_at := null;
  end if;
  return new;
end;
$$;

create trigger profiles_normalize_meetup_preferences
before update of special_category_consent_at on public.profiles
for each row execute function private.normalize_profile_meetup_preferences();

create function private.revoke_meetup_access_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meetup_participations mp
  set status = 'removed', removed_at = now()
  from public.meetups m
  where m.id = mp.meetup_id
    and mp.profile_id is not null
    and mp.status in ('joined', 'approved', 'pending')
    and (
      (m.host_id = new.blocker_id and mp.profile_id = new.blocked_id)
      or (m.host_id = new.blocked_id and mp.profile_id = new.blocker_id)
    );
  return new;
end;
$$;

create trigger blocks_revoke_meetup_access
after insert on public.blocks
for each row execute function private.revoke_meetup_access_on_block();

create function private.propagate_profile_meetup_restriction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare meetup_row record; reason text;
begin
  if not private.meetup_actor_is_active(new.id) then
    update public.meetup_participations
    set status = 'removed', removed_at = now()
    where profile_id = new.id and status in ('joined', 'approved', 'pending');
  end if;
  if private.meetup_actor_is_active(new.id)
     and new.is_profile_visible
     and new.meetup_hosting_restricted_at is null then
    return new;
  end if;
  reason := case
    when new.special_category_consent_at is null then 'host_consent_withdrawn'
    when not new.is_profile_visible then 'host_profile_hidden'
    when new.meetup_hosting_restricted_at is not null then 'host_restricted'
    else 'host_account_ineligible'
  end;
  for meetup_row in
    update public.meetups m
    set status = 'moderation_hidden', moderation_reason = reason, cancelled_at = null
    where m.host_id = new.id and m.status = 'published'
    returning m.id, m.title
  loop
    perform private.capture_meetup_revision(meetup_row.id, 'moderation_removed', (select auth.uid()));
    perform private.notify_meetup_participants(
      meetup_row.id, 'meetup_moderated',
      jsonb_build_object('title', meetup_row.title, 'state', 'hidden')
    );
  end loop;
  return new;
end;
$$;

create trigger profiles_propagate_meetup_restriction
after update of is_profile_visible, special_category_consent_at, moderation_status,
  suspended_until, meetup_hosting_restricted_at, date_of_birth
on public.profiles
for each row execute function private.propagate_profile_meetup_restriction();

create function private.prepare_hosted_meetups_for_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare meetup_row record;
begin
  update public.meetup_participations
  set status = 'removed', removed_at = now()
  where profile_id = old.id and status in ('joined', 'approved', 'pending');
  for meetup_row in
    update public.meetups m
    set status = 'cancelled', cancelled_at = now(), moderation_reason = null
    where m.host_id = old.id
      and m.published_at is not null
      and m.status in ('published', 'moderation_hidden')
    returning m.id, m.title
  loop
    perform private.capture_meetup_revision(meetup_row.id, 'cancelled', old.id);
    perform private.notify_meetup_participants(
      meetup_row.id, 'meetup_cancelled', jsonb_build_object('title', meetup_row.title)
    );
  end loop;
  delete from public.meetups m
  where m.host_id = old.id and m.published_at is null
    and m.status in ('draft', 'moderation_hidden');
  return old;
end;
$$;

create trigger profiles_prepare_hosted_meetups_for_delete
before delete on public.profiles
for each row execute function private.prepare_hosted_meetups_for_profile_delete();

-- Staff moderation. Safe report detail is separate from case-scoped exact-location evidence.
create or replace function private.admin_get_report_impl(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.require_staff();
  select jsonb_build_object(
    'report', to_jsonb(r),
    'reporter_profile', case when reporter.id is null then null else jsonb_build_object(
      'id', reporter.id, 'display_name', reporter.display_name, 'moderation_status', reporter.moderation_status
    ) end,
    'reported_profile', case when reported.id is null then null else jsonb_build_object(
      'id', reported.id, 'display_name', reported.display_name,
      'moderation_status', reported.moderation_status, 'suspended_until', reported.suspended_until
    ) end,
    'message_evidence', case when msg.id is null then null else to_jsonb(msg) end,
    'album_evidence', case when item.id is null then null else jsonb_build_object(
      'share_id', album_share.id, 'album_id', item.album_id, 'item_id', item.id,
      'media_type', item.media_type, 'storage_path', item.storage_path,
      'duration_ms', item.duration_ms, 'deleted_at', item.deleted_at
    ) end,
    'meetup_evidence', case when revision.id is null then null else jsonb_build_object(
      'revisionId', revision.id,
      'capturedAt', revision.created_at,
      'changeType', revision.change_type,
      'snapshot', revision.safe_snapshot,
      'exactLocationRequiresAuditedAccess', true
    ) end
  ) into result
  from public.reports r
  left join public.profiles reporter on reporter.id = r.reporter_id
  left join public.profiles reported on reported.id = r.reported_id
  left join public.messages msg on msg.id = r.message_id
  left join public.album_items item on item.id = r.album_item_id
  left join public.album_shares album_share on album_share.id = r.album_share_id
  left join private.meetup_revisions revision on revision.id = r.meetup_revision_id
  where r.id = p_report_id;
  if result is null then raise exception using errcode = 'P0002', message = 'report_not_found'; end if;
  if result #>> '{album_evidence,item_id}' is not null then
    insert into private.admin_audit_log (actor_id, action, target_type, target_id, details)
    values (
      (select auth.uid()), 'album_evidence_access', 'album_item', result #>> '{album_evidence,item_id}',
      jsonb_build_object('report_id', p_report_id, 'ttl_seconds', 60)
    );
  end if;
  return result;
end;
$$;

create or replace function public.admin_get_report(p_report_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.admin_get_report_impl(p_report_id); $$;

create function private.admin_get_meetup_location_evidence_impl(p_report_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb; meetup_id uuid; revision_id bigint;
begin
  perform private.require_staff();
  if coalesce(char_length(btrim(p_reason)), 0) < 8 then
    raise exception using errcode = '22023', message = 'evidence_access_reason_required';
  end if;
  select coalesce(r.meetup_id, nullif(revision.safe_snapshot ->> 'id', '')::uuid), revision.id,
    jsonb_strip_nulls(jsonb_build_object(
      'reportId', r.id,
      'meetupId', coalesce(r.meetup_id, nullif(revision.safe_snapshot ->> 'id', '')::uuid),
      'revisionId', revision.id,
      'capturedAt', revision.created_at,
      'accessedAt', now(),
      'exactLocation', jsonb_build_object(
        'latitude', extensions.st_y(revision.exact_point::extensions.geometry),
        'longitude', extensions.st_x(revision.exact_point::extensions.geometry),
        'venueName', revision.venue_name,
        'address', revision.address
      ),
      'arrivalInstructions', revision.arrival_instructions
    ))
  into meetup_id, revision_id, result
  from public.reports r
  join private.meetup_revisions revision on revision.id = r.meetup_revision_id
  where r.id = p_report_id;
  if result is null or revision_id is null then
    raise exception using errcode = 'P0002', message = 'meetup_report_evidence_not_found';
  end if;
  insert into private.admin_audit_log (actor_id, action, target_type, target_id, details)
  values (
    (select auth.uid()), 'meetup_location_evidence_access', 'meetup', meetup_id::text,
    jsonb_build_object('report_id', p_report_id, 'revision_id', revision_id, 'reason', btrim(p_reason))
  );
  return result;
end;
$$;

create function public.admin_get_meetup_location_evidence(p_report_id uuid, p_reason text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.admin_get_meetup_location_evidence_impl(p_report_id, p_reason); $$;

create function private.admin_moderate_meetup_impl(
  p_meetup_id uuid,
  p_action text,
  p_reason text,
  p_report_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); meetup_row public.meetups%rowtype; restored_status text;
begin
  perform private.require_staff();
  if p_action not in ('remove', 'restore', 'restrict_host')
     or coalesce(char_length(btrim(p_reason)), 0) < 8 then
    raise exception using errcode = '22023', message = 'invalid_meetup_moderation_action';
  end if;
  select * into meetup_row from public.meetups where id = p_meetup_id for update;
  if meetup_row.id is null then raise exception using errcode = 'P0002', message = 'meetup_not_found'; end if;
  if p_report_id is not null and not exists (
    select 1 from public.reports r where r.id = p_report_id and r.meetup_id = p_meetup_id
  ) then
    raise exception using errcode = '22023', message = 'report_does_not_match_meetup';
  end if;

  if p_action = 'restrict_host' then
    if meetup_row.host_id is null then raise exception using errcode = '55000', message = 'meetup_host_deleted'; end if;
    update public.profiles set meetup_hosting_restricted_at = now() where id = meetup_row.host_id;
  elsif p_action = 'remove' then
    if meetup_row.status in ('cancelled', 'moderation_hidden') then
      raise exception using errcode = '55000', message = 'meetup_not_removable';
    end if;
    update public.meetups
    set status = 'moderation_hidden', moderation_reason = btrim(p_reason), cancelled_at = null
    where id = p_meetup_id;
    perform private.capture_meetup_revision(p_meetup_id, 'moderation_removed', caller);
    perform private.notify_meetup_participants(
      p_meetup_id, 'meetup_moderated', jsonb_build_object('title', meetup_row.title, 'state', 'removed')
    );
  else
    if meetup_row.status <> 'moderation_hidden' then
      raise exception using errcode = '55000', message = 'meetup_not_moderation_hidden';
    end if;
    if meetup_row.host_id is null then raise exception using errcode = '55000', message = 'meetup_host_deleted'; end if;
    if not private.meetup_actor_is_active(meetup_row.host_id) or not exists (
      select 1 from public.profiles p
      where p.id = meetup_row.host_id
        and p.is_profile_visible
        and p.meetup_hosting_restricted_at is null
    ) then
      raise exception using errcode = '42501', message = 'meetup_host_not_eligible_for_restore';
    end if;
    restored_status := case when meetup_row.published_at is null then 'draft' else 'published' end;
    update public.meetups
    set status = restored_status, moderation_reason = null, cancelled_at = null
    where id = p_meetup_id;
    perform private.capture_meetup_revision(p_meetup_id, 'moderation_restored', caller);
  end if;

  insert into private.admin_audit_log (actor_id, action, target_type, target_id, details)
  values (
    caller, 'meetup.' || p_action, 'meetup', p_meetup_id::text,
    jsonb_build_object('reason', btrim(p_reason), 'report_id', p_report_id, 'host_id', meetup_row.host_id)
  );
end;
$$;

create function public.admin_moderate_meetup(
  p_meetup_id uuid,
  p_action text,
  p_reason text,
  p_report_id uuid default null
)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_moderate_meetup_impl(p_meetup_id, p_action, p_reason, p_report_id); $$;

create function private.admin_set_meetup_legal_hold_impl(p_meetup_id uuid, p_enabled boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  perform private.require_staff();
  if coalesce(char_length(btrim(p_reason)), 0) < 8 then
    raise exception using errcode = '22023', message = 'legal_hold_reason_required';
  end if;
  if not exists (select 1 from public.meetups where id = p_meetup_id) then
    raise exception using errcode = 'P0002', message = 'meetup_not_found';
  end if;
  insert into private.meetup_retention (
    meetup_id, retain_until, legal_hold_at, legal_hold_reason, legal_hold_set_by,
    legal_hold_released_at, legal_hold_release_reason
  )
  select m.id, m.effective_end + c.standard_retention,
    case when p_enabled then now() else null end,
    case when p_enabled then btrim(p_reason) else null end,
    case when p_enabled then caller else null end,
    case when p_enabled then null else now() end,
    case when p_enabled then null else btrim(p_reason) end
  from public.meetups m cross join private.meetup_retention_config c
  where m.id = p_meetup_id and c.id = 1
  on conflict (meetup_id) do update set
    legal_hold_at = case when p_enabled then now() else private.meetup_retention.legal_hold_at end,
    legal_hold_reason = case when p_enabled then btrim(p_reason) else private.meetup_retention.legal_hold_reason end,
    legal_hold_set_by = case when p_enabled then caller else private.meetup_retention.legal_hold_set_by end,
    legal_hold_released_at = case when p_enabled then null else now() end,
    legal_hold_release_reason = case when p_enabled then null else btrim(p_reason) end;
  insert into private.admin_audit_log (actor_id, action, target_type, target_id, details)
  values (
    caller, case when p_enabled then 'meetup.legal_hold_set' else 'meetup.legal_hold_released' end,
    'meetup', p_meetup_id::text, jsonb_build_object('reason', btrim(p_reason))
  );
end;
$$;

create function public.admin_set_meetup_legal_hold(p_meetup_id uuid, p_enabled boolean, p_reason text)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_set_meetup_legal_hold_impl(p_meetup_id, p_enabled, p_reason); $$;

create function private.admin_set_report_priority_impl(p_report_id uuid, p_priority text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); previous_priority text;
begin
  perform private.require_staff();
  if p_priority not in ('standard', 'urgent', 'critical')
     or coalesce(char_length(btrim(p_reason)), 0) < 8 then
    raise exception using errcode = '22023', message = 'invalid_report_priority_change';
  end if;
  update public.reports
  set priority = p_priority
  where id = p_report_id
  returning priority into previous_priority;
  if previous_priority is null then raise exception using errcode = 'P0002', message = 'report_not_found'; end if;
  insert into private.admin_audit_log (actor_id, action, target_type, target_id, details)
  values (
    caller, 'report.priority_changed', 'report', p_report_id::text,
    jsonb_build_object('priority', p_priority, 'reason', btrim(p_reason))
  );
end;
$$;

create function public.admin_set_report_priority(p_report_id uuid, p_priority text, p_reason text)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_set_report_priority_impl(p_report_id, p_priority, p_reason); $$;

-- Push-token registration is caller-bound. Worker functions are service-role only.
create function private.register_push_token_impl(p_expo_push_token text, p_platform text, p_locale text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid()); token_id uuid;
begin
  if caller is null then raise exception using errcode = '28000', message = 'authentication_required'; end if;
  if p_platform not in ('ios', 'android', 'web') or p_locale not in ('is', 'en')
     or char_length(btrim(p_expo_push_token)) not between 8 and 512 then
    raise exception using errcode = '22023', message = 'invalid_push_token';
  end if;
  insert into private.push_tokens (
    profile_id, expo_push_token, platform, locale, enabled,
    last_seen_at, disabled_at, disabled_reason
  ) values (
    caller, btrim(p_expo_push_token), p_platform, p_locale, true,
    now(), null, null
  )
  on conflict (expo_push_token) do update set
    profile_id = caller,
    platform = excluded.platform,
    locale = excluded.locale,
    enabled = true,
    last_seen_at = now(),
    disabled_at = null,
    disabled_reason = null
  returning id into token_id;
  return token_id;
end;
$$;

create function public.register_push_token(
  expo_push_token text,
  platform text,
  locale text default 'is'
)
returns uuid language sql security invoker set search_path = ''
as $$ select private.register_push_token_impl(expo_push_token, platform, locale); $$;

create function private.unregister_push_token_impl(p_expo_push_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  update private.push_tokens
  set enabled = false, disabled_at = now(), disabled_reason = 'user_unregistered'
  where profile_id = (select auth.uid()) and expo_push_token = btrim(p_expo_push_token) and enabled;
end;
$$;

create function public.unregister_push_token(expo_push_token text)
returns void language sql security invoker set search_path = ''
as $$ select private.unregister_push_token_impl(expo_push_token); $$;

create function private.require_service_role()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
end;
$$;

create function private.set_meetup_feature_enabled_impl(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role();
  update private.meetup_feature_config
  set enabled = p_enabled, updated_by = (select auth.uid())
  where id = 1;
  if not found then
    raise exception using errcode = '55000', message = 'meetup_feature_config_missing';
  end if;
end;
$$;

create function public.set_meetup_feature_enabled(enabled boolean)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.set_meetup_feature_enabled_impl(enabled); $$;

create function private.claim_notification_outbox_impl(p_batch_size integer, p_claim_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.require_service_role();
  if p_claim_token is null then raise exception using errcode = '22023', message = 'claim_token_required'; end if;
  with candidates as (
    select o.id
    from private.notification_outbox o
    where (
        (o.status in ('pending', 'failed') and o.available_at <= now())
        or (o.status = 'processing' and o.claimed_at < now() - interval '10 minutes')
      )
      and o.attempts < 20
    order by o.available_at, o.id
    for update skip locked
    limit least(greatest(coalesce(p_batch_size, 100), 1), 500)
  )
  update private.notification_outbox o
  set status = 'processing', attempts = o.attempts + 1,
      claim_token = p_claim_token, claimed_at = now(), last_error = null
  from candidates c
  where o.id = c.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'outboxId', o.id,
    'claimToken', o.claim_token,
    'notification', jsonb_build_object(
      'id', n.id, 'recipientId', n.recipient_id, 'kind', n.kind,
      'meetupId', n.meetup_id, 'payload', n.payload, 'createdAt', n.created_at
    ),
    'tokens', coalesce(tokens.items, '[]'::jsonb)
  ) order by o.id), '[]'::jsonb) into result
  from private.notification_outbox o
  join public.notifications n on n.id = o.notification_id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'tokenId', pt.id,
      'expoPushToken', pt.expo_push_token,
      'platform', pt.platform,
      'locale', pt.locale
    ) order by pt.id) items
    from private.push_tokens pt
    where pt.profile_id = n.recipient_id and pt.enabled
  ) tokens on true
  where o.claim_token = p_claim_token and o.status = 'processing';
  return result;
end;
$$;

create function public.claim_notification_outbox(
  batch_size integer default 100,
  claim_token uuid default gen_random_uuid()
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.claim_notification_outbox_impl(batch_size, claim_token); $$;

create function private.record_push_tickets_impl(
  p_outbox_id bigint,
  p_claim_token uuid,
  p_tickets jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare ticket jsonb; ticket_status text; valid_count integer := 0; ticketed_count integer := 0;
begin
  perform private.require_service_role();
  if jsonb_typeof(p_tickets) <> 'array' then
    raise exception using errcode = '22023', message = 'push_tickets_array_required';
  end if;
  if not exists (
    select 1 from private.notification_outbox o
    where o.id = p_outbox_id and o.claim_token = p_claim_token and o.status = 'processing'
    for update
  ) then
    raise exception using errcode = '42501', message = 'outbox_claim_mismatch';
  end if;
  for ticket in select value from jsonb_array_elements(p_tickets)
  loop
    ticket_status := ticket ->> 'status';
    if ticket_status not in ('ok', 'error') then
      raise exception using errcode = '22023', message = 'invalid_push_ticket_status';
    end if;
    insert into private.push_deliveries (
      outbox_id, token_id, provider_ticket_id, status, error, receipt_checked_at
    )
    select p_outbox_id, pt.id, nullif(ticket ->> 'ticketId', ''),
      case when ticket_status = 'ok' then 'ticketed' else 'failed' end,
      case when ticket_status = 'error' then coalesce(ticket ->> 'error', ticket #>> '{details,error}', 'provider_ticket_error') else null end,
      case when ticket_status = 'error' then now() else null end
    from private.push_tokens pt
    join private.notification_outbox o on o.id = p_outbox_id
    join public.notifications n on n.id = o.notification_id and n.recipient_id = pt.profile_id
    where pt.id = (ticket ->> 'tokenId')::uuid and pt.enabled
    on conflict (outbox_id, token_id) do update set
      provider_ticket_id = excluded.provider_ticket_id,
      status = excluded.status,
      error = excluded.error,
      receipt_checked_at = excluded.receipt_checked_at;
    if found then
      valid_count := valid_count + 1;
      if ticket_status = 'ok' then ticketed_count := ticketed_count + 1; end if;
      if ticket_status = 'error'
         and coalesce(ticket ->> 'error', ticket #>> '{details,error}') = 'DeviceNotRegistered' then
        update private.push_tokens
        set enabled = false,
            disabled_at = now(),
            disabled_reason = 'DeviceNotRegistered'
        where id = (ticket ->> 'tokenId')::uuid and enabled;
      end if;
    end if;
  end loop;
  update private.notification_outbox
  set status = case when ticketed_count > 0 then 'ticketed' when valid_count = 0 then 'delivered' else 'failed' end,
      available_at = case when ticketed_count = 0 and valid_count > 0 then now() + interval '5 minutes' else available_at end,
      last_error = case when ticketed_count = 0 and valid_count > 0 then 'no_push_ticket_accepted' else null end,
      claim_token = null, claimed_at = null
  where id = p_outbox_id and claim_token = p_claim_token;
end;
$$;

create function public.record_push_tickets(
  outbox_id bigint,
  claim_token uuid,
  tickets jsonb
)
returns void language sql security invoker set search_path = ''
as $$ select private.record_push_tickets_impl(outbox_id, claim_token, tickets); $$;

create function private.list_pending_push_receipts_impl(p_limit_count integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  perform private.require_service_role();
  select coalesce(jsonb_agg(jsonb_build_object(
    'deliveryId', rows.id,
    'outboxId', rows.outbox_id,
    'tokenId', rows.token_id,
    'ticketId', rows.provider_ticket_id
  ) order by rows.created_at, rows.id), '[]'::jsonb) into result
  from (
    select d.* from private.push_deliveries d
    where d.status = 'ticketed'
    order by d.created_at, d.id
    limit least(greatest(coalesce(p_limit_count, 300), 1), 1000)
  ) rows;
  return result;
end;
$$;

create function public.list_pending_push_receipts(limit_count integer default 300)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.list_pending_push_receipts_impl(limit_count); $$;

create function private.disable_push_token_impl(p_token_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role();
  update private.push_tokens
  set enabled = false, disabled_at = now(), disabled_reason = left(coalesce(nullif(btrim(p_reason), ''), 'provider_invalid'), 1000)
  where id = p_token_id and enabled;
end;
$$;

create function public.disable_push_token(token_id uuid, reason text)
returns void language sql security invoker set search_path = ''
as $$ select private.disable_push_token_impl(token_id, reason); $$;

create function private.record_push_receipts_impl(p_receipts jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare receipt jsonb; delivery_row private.push_deliveries%rowtype; receipt_status text; receipt_error text;
begin
  perform private.require_service_role();
  if jsonb_typeof(p_receipts) <> 'array' then
    raise exception using errcode = '22023', message = 'push_receipts_array_required';
  end if;
  for receipt in select value from jsonb_array_elements(p_receipts)
  loop
    receipt_status := receipt ->> 'status';
    receipt_error := coalesce(receipt ->> 'error', receipt #>> '{details,error}');
    if receipt_status not in ('ok', 'error') then
      raise exception using errcode = '22023', message = 'invalid_push_receipt_status';
    end if;
    update private.push_deliveries d
    set status = case when receipt_status = 'ok' then 'delivered' else 'failed' end,
        error = case when receipt_status = 'error' then coalesce(receipt_error, 'provider_receipt_error') else null end,
        receipt_checked_at = now()
    where d.provider_ticket_id = receipt ->> 'ticketId' and d.status = 'ticketed'
    returning d.* into delivery_row;
    if delivery_row.id is not null then
      if receipt_error = 'DeviceNotRegistered' and delivery_row.token_id is not null then
        update private.push_tokens
        set enabled = false, disabled_at = now(), disabled_reason = 'DeviceNotRegistered'
        where id = delivery_row.token_id and enabled;
      end if;
      if not exists (
        select 1 from private.push_deliveries d
        where d.outbox_id = delivery_row.outbox_id and d.status = 'ticketed'
      ) then
        update private.notification_outbox set status = 'delivered', last_error = null
        where id = delivery_row.outbox_id;
      end if;
    end if;
    delivery_row := null;
  end loop;
end;
$$;

create function public.record_push_receipts(receipts jsonb)
returns void language sql security invoker set search_path = ''
as $$ select private.record_push_receipts_impl(receipts); $$;

create function private.purge_expired_meetups_impl(p_batch_size integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare purge_enabled boolean; policy_approved_at timestamptz; deleted_count integer;
begin
  perform private.require_service_role();
  select c.purge_enabled, c.policy_approved_at into purge_enabled, policy_approved_at
  from private.meetup_retention_config c where c.id = 1;
  if not coalesce(purge_enabled, false) or policy_approved_at is null then
    raise exception using errcode = '55000', message = 'meetup_purge_disabled';
  end if;
  with candidates as (
    select r.meetup_id
    from private.meetup_retention r
    join public.meetups m on m.id = r.meetup_id
    where r.retain_until <= now()
      and (r.legal_hold_at is null or r.legal_hold_released_at is not null)
      and (m.status = 'cancelled' or m.effective_end < now() or m.status = 'draft')
      and not exists (
        select 1 from public.reports report
        where report.meetup_id = m.id and report.status in ('open', 'in_review')
      )
    order by r.retain_until, r.meetup_id
    for update of r skip locked
    limit least(greatest(coalesce(p_batch_size, 100), 1), 500)
  )
  delete from public.meetups m using candidates c where m.id = c.meetup_id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create function public.purge_expired_meetups(batch_size integer default 100)
returns integer language sql security invoker set search_path = ''
as $$ select private.purge_expired_meetups_impl(batch_size); $$;

-- Canonical account export. Keep export_my_account as a compatibility alias used by current mobile builds.
create or replace function private.export_account_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null or not exists (select 1 from auth.users where id = caller) then
    raise exception using errcode = '28000', message = 'authentication_required';
  end if;
  return jsonb_build_object(
    'exportedAt', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = caller),
    'profilePhotos', coalesce((
      select jsonb_agg(to_jsonb(pp) - 'reviewed_by' order by pp.position)
      from public.profile_photos pp where pp.profile_id = caller
    ), '[]'::jsonb),
    'albums', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at)
      from public.albums a where a.owner_id = caller
    ), '[]'::jsonb),
    'albumItems', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.created_at)
      from public.album_items i where i.owner_id = caller
    ), '[]'::jsonb),
    'albumShares', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.shared_at)
      from public.album_shares s where caller in (s.owner_id, s.recipient_id)
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.created_at)
      from public.blocks b where b.blocker_id = caller
    ), '[]'::jsonb),
    'conversationMemberships', coalesce((
      select jsonb_agg(to_jsonb(cm) order by cm.joined_at)
      from public.conversation_members cm where cm.user_id = caller
    ), '[]'::jsonb),
    'authoredMessages', coalesce((
      select jsonb_agg(to_jsonb(msg) order by msg.created_at)
      from public.messages msg where msg.sender_id = caller
    ), '[]'::jsonb),
    'submittedReports', coalesce((
      select jsonb_agg(to_jsonb(r) - 'assigned_admin' - 'resolution_notes' order by r.created_at)
      from public.reports r where r.reporter_id = caller
    ), '[]'::jsonb),
    'hostedMeetups', coalesce((
      select jsonb_agg(private.meetup_payload(m.id, caller, true) order by m.created_at)
      from public.meetups m where m.host_id = caller
    ), '[]'::jsonb),
    'meetupParticipationHistory', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participation', to_jsonb(mp),
        'meetupSnapshot', private.meetup_safe_snapshot(mp.meetup_id)
      ) order by mp.created_at)
      from public.meetup_participations mp where mp.profile_id = caller
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at)
      from public.notifications n where n.recipient_id = caller
    ), '[]'::jsonb),
    'pushRegistrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', pt.platform, 'locale', pt.locale, 'enabled', pt.enabled,
        'lastSeenAt', pt.last_seen_at, 'createdAt', pt.created_at, 'disabledAt', pt.disabled_at
      ) order by pt.created_at)
      from private.push_tokens pt where pt.profile_id = caller
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function private.export_my_account_impl()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.export_account_impl(); $$;

create or replace function public.export_account()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.export_account_impl(); $$;

create or replace function public.export_my_account()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.export_account_impl(); $$;

-- Explicit Data API exposure. Private relations remain inaccessible even to authenticated clients.
revoke all on table public.meetup_general_areas, public.meetups,
  public.meetup_participations, public.notifications
from public, anon, authenticated, service_role;
revoke all on table private.meetup_locations, private.notification_outbox,
  private.push_tokens, private.push_deliveries, private.meetup_revisions,
  private.meetup_retention_config, private.meetup_retention,
  private.meetup_creation_attempts, private.meetup_place_search_attempts,
  private.meetup_participation_attempts, private.meetup_feature_config
from public, anon, authenticated, service_role;
revoke all on all sequences in schema private from public, anon, authenticated, service_role;

grant select on public.meetup_general_areas to authenticated;
grant select on public.meetups to authenticated;
grant select on public.meetup_participations to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert (
  reporter_id, reported_id, conversation_id, message_id,
  album_share_id, album_item_id, meetup_id, category, details
) on public.reports to authenticated;

revoke execute on function public.can_create_meetup() from public, anon, authenticated, service_role;
revoke execute on function public.consume_meetup_place_search_quota() from public, anon, authenticated, service_role;
revoke execute on function public.create_meetup_draft(jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.update_meetup(uuid,jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.publish_meetup(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.join_meetup(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.request_meetup_access(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.respond_to_meetup_request(uuid,uuid,boolean) from public, anon, authenticated, service_role;
revoke execute on function public.reinstate_meetup_participant(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke execute on function public.cancel_meetup_request(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.leave_meetup(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.remove_meetup_participant(uuid,uuid) from public, anon, authenticated, service_role;
revoke execute on function public.cancel_meetup(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.delete_meetup_draft(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.report_meetup(uuid,text,text) from public, anon, authenticated, service_role;
revoke execute on function public.set_adult_content_preference(boolean) from public, anon, authenticated, service_role;
revoke execute on function public.discover_meetups(jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.get_meetup(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.list_my_meetups() from public, anon, authenticated, service_role;
revoke execute on function public.list_meetup_requests(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.list_meetup_participants(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.list_notifications(integer) from public, anon, authenticated, service_role;
revoke execute on function public.mark_notification_read(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.register_push_token(text,text,text) from public, anon, authenticated, service_role;
revoke execute on function public.unregister_push_token(text) from public, anon, authenticated, service_role;
revoke execute on function public.set_meetup_feature_enabled(boolean) from public, anon, authenticated, service_role;
revoke execute on function public.admin_get_report(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.admin_get_meetup_location_evidence(uuid,text) from public, anon, authenticated, service_role;
revoke execute on function public.admin_moderate_meetup(uuid,text,text,uuid) from public, anon, authenticated, service_role;
revoke execute on function public.admin_set_meetup_legal_hold(uuid,boolean,text) from public, anon, authenticated, service_role;
revoke execute on function public.admin_set_report_priority(uuid,text,text) from public, anon, authenticated, service_role;
revoke execute on function public.claim_notification_outbox(integer,uuid) from public, anon, authenticated, service_role;
revoke execute on function public.record_push_tickets(bigint,uuid,jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.list_pending_push_receipts(integer) from public, anon, authenticated, service_role;
revoke execute on function public.record_push_receipts(jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.disable_push_token(uuid,text) from public, anon, authenticated, service_role;
revoke execute on function public.purge_expired_meetups(integer) from public, anon, authenticated, service_role;
revoke execute on function public.export_account() from public, anon, authenticated, service_role;
revoke execute on function public.export_my_account() from public, anon, authenticated, service_role;
revoke execute on function private.export_my_account_impl() from public, anon, authenticated, service_role;
revoke execute on function private.meetup_feature_is_enabled() from public, anon, authenticated, service_role;
revoke execute on function private.assert_meetup_feature_enabled() from public, anon, authenticated, service_role;
revoke execute on function private.consume_meetup_place_search_quota_impl() from public, anon, authenticated, service_role;
revoke execute on function private.consume_meetup_participation_quota(uuid,uuid) from public, anon, authenticated, service_role;
revoke execute on function private.list_meetup_participants_impl(uuid) from public, anon, authenticated, service_role;
revoke execute on function private.set_meetup_feature_enabled_impl(boolean) from public, anon, authenticated, service_role;

grant usage on schema private to authenticated, service_role;

grant execute on function private.meetup_current_user_can_host() to authenticated;
grant execute on function private.consume_meetup_place_search_quota_impl() to authenticated;
grant execute on function private.meetup_block_exists(uuid,uuid) to authenticated;
grant execute on function private.meetup_is_host(uuid,uuid) to authenticated;
grant execute on function private.meetup_report_context_is_valid(uuid,uuid) to authenticated;
grant execute on function private.create_meetup_draft_impl(jsonb) to authenticated;
grant execute on function private.update_meetup_impl(uuid,jsonb) to authenticated;
grant execute on function private.publish_meetup_impl(uuid) to authenticated;
grant execute on function private.join_meetup_impl(uuid) to authenticated;
grant execute on function private.request_meetup_access_impl(uuid) to authenticated;
grant execute on function private.respond_to_meetup_request_impl(uuid,uuid,boolean) to authenticated;
grant execute on function private.reinstate_meetup_participant_impl(uuid,uuid,text) to authenticated;
grant execute on function private.cancel_meetup_request_impl(uuid) to authenticated;
grant execute on function private.leave_meetup_impl(uuid) to authenticated;
grant execute on function private.remove_meetup_participant_impl(uuid,uuid) to authenticated;
grant execute on function private.cancel_meetup_impl(uuid) to authenticated;
grant execute on function private.delete_meetup_draft_impl(uuid) to authenticated;
grant execute on function private.report_meetup_impl(uuid,text,text) to authenticated;
grant execute on function private.set_adult_content_preference_impl(boolean) to authenticated;
grant execute on function private.discover_meetups_impl(jsonb) to authenticated;
grant execute on function private.get_meetup_impl(uuid) to authenticated;
grant execute on function private.list_my_meetups_impl() to authenticated;
grant execute on function private.list_meetup_requests_impl(uuid) to authenticated;
grant execute on function private.list_meetup_participants_impl(uuid) to authenticated;
grant execute on function private.list_notifications_impl(integer) to authenticated;
grant execute on function private.mark_notification_read_impl(uuid) to authenticated;
grant execute on function private.register_push_token_impl(text,text,text) to authenticated;
grant execute on function private.unregister_push_token_impl(text) to authenticated;
grant execute on function private.admin_get_report_impl(uuid) to authenticated;
grant execute on function private.admin_get_meetup_location_evidence_impl(uuid,text) to authenticated;
grant execute on function private.admin_moderate_meetup_impl(uuid,text,text,uuid) to authenticated;
grant execute on function private.admin_set_meetup_legal_hold_impl(uuid,boolean,text) to authenticated;
grant execute on function private.admin_set_report_priority_impl(uuid,text,text) to authenticated;
grant execute on function private.export_account_impl() to authenticated;

grant execute on function public.can_create_meetup() to authenticated;
grant execute on function public.consume_meetup_place_search_quota() to authenticated;
grant execute on function public.create_meetup_draft(jsonb) to authenticated;
grant execute on function public.update_meetup(uuid,jsonb) to authenticated;
grant execute on function public.publish_meetup(uuid) to authenticated;
grant execute on function public.join_meetup(uuid) to authenticated;
grant execute on function public.request_meetup_access(uuid) to authenticated;
grant execute on function public.respond_to_meetup_request(uuid,uuid,boolean) to authenticated;
grant execute on function public.reinstate_meetup_participant(uuid,uuid,text) to authenticated;
grant execute on function public.cancel_meetup_request(uuid) to authenticated;
grant execute on function public.leave_meetup(uuid) to authenticated;
grant execute on function public.remove_meetup_participant(uuid,uuid) to authenticated;
grant execute on function public.cancel_meetup(uuid) to authenticated;
grant execute on function public.delete_meetup_draft(uuid) to authenticated;
grant execute on function public.report_meetup(uuid,text,text) to authenticated;
grant execute on function public.set_adult_content_preference(boolean) to authenticated;
grant execute on function public.discover_meetups(jsonb) to authenticated;
grant execute on function public.get_meetup(uuid) to authenticated;
grant execute on function public.list_my_meetups() to authenticated;
grant execute on function public.list_meetup_requests(uuid) to authenticated;
grant execute on function public.list_meetup_participants(uuid) to authenticated;
grant execute on function public.list_notifications(integer) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.register_push_token(text,text,text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.admin_get_report(uuid) to authenticated;
grant execute on function public.admin_get_meetup_location_evidence(uuid,text) to authenticated;
grant execute on function public.admin_moderate_meetup(uuid,text,text,uuid) to authenticated;
grant execute on function public.admin_set_meetup_legal_hold(uuid,boolean,text) to authenticated;
grant execute on function public.admin_set_report_priority(uuid,text,text) to authenticated;
grant execute on function public.export_account() to authenticated;
grant execute on function public.export_my_account() to authenticated;

grant execute on function private.claim_notification_outbox_impl(integer,uuid) to service_role;
grant execute on function private.record_push_tickets_impl(bigint,uuid,jsonb) to service_role;
grant execute on function private.list_pending_push_receipts_impl(integer) to service_role;
grant execute on function private.record_push_receipts_impl(jsonb) to service_role;
grant execute on function private.disable_push_token_impl(uuid,text) to service_role;
grant execute on function private.purge_expired_meetups_impl(integer) to service_role;
grant execute on function private.set_meetup_feature_enabled_impl(boolean) to service_role;
grant execute on function public.claim_notification_outbox(integer,uuid) to service_role;
grant execute on function public.record_push_tickets(bigint,uuid,jsonb) to service_role;
grant execute on function public.list_pending_push_receipts(integer) to service_role;
grant execute on function public.record_push_receipts(jsonb) to service_role;
grant execute on function public.disable_push_token(uuid,text) to service_role;
grant execute on function public.purge_expired_meetups(integer) to service_role;
grant execute on function public.set_meetup_feature_enabled(boolean) to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
