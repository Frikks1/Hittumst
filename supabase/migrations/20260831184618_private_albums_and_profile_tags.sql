-- Private albums and the versioned My Tags catalog.
-- All user-visible tables use RLS and explicit Data API grants.

create table public.profile_tag_catalog (
  tag_id text primary key,
  label text not null unique,
  category text not null,
  sort_order smallint not null,
  catalog_version date not null default date '2026-08-31',
  active boolean not null default true,
  constraint profile_tag_catalog_id_check check (tag_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint profile_tag_catalog_category_check check (category in ('kinks', 'hobbies', 'personality', 'other')),
  unique (category, sort_order)
);

insert into public.profile_tag_catalog (tag_id, label, category, sort_order)
select regexp_replace(lower(label), '[^a-z0-9]+', '-', 'g'), label, 'kinks', ordinality
from unnest(array[
  'Anon','Bator','BB','BDSM','Bondage','Brat','Breeding','Bubblebutt','Carplay','Chastity','CMNM','Commando',
  'Condoms','Condomsonly','Cruising','Cuck','Cumdump','Cut','Deepthroat','Dirty','Discreet','DL','Dom','DTF',
  'Edging','Eyecontact','Feet','Femboy','FF','Fingering','Flexible','Foreplay','Frot','Furries','Furry','FWB',
  'Gear','GH','Gooner','Group','Hands','Hosting','Humiliation','Hung','JO','Kink','Kissing','Latex','Leather',
  'Limits','Lingerie','Looking','Married','Masc','Monogamy','Musk','Nipples','NSA','Nudist','Nylon','Oral',
  'Piercings','Pig','Pits','Poly','Public','Pup','Pupplay','Quickie','Rimming','Roleplay','Rough','Rubber',
  'Rugged','Safersex','Sauna','Sexting','Showoff','Slut','Socks','Spanking','Spit','Straight','Sub','Swallowing',
  'Tentacles','Thick','Threesome','Tickling','Toys','UC','Underwear','Vanilla','Verbal','Videochat','Visiting',
  'Watching','Worship','Wrestling','WS'
]) with ordinality as tags(label, ordinality);

insert into public.profile_tag_catalog (tag_id, label, category, sort_order)
select regexp_replace(lower(label), '[^a-z0-9]+', '-', 'g'), label, 'hobbies', ordinality
from unnest(array[
  'Anime','Apres ski','Art','Beach','Brunch','Concerts','Cooking','Dancing','DIY','Fashion','Gaming','Gym','Hiking',
  'Karaoke','Movies','Music','Naps','Pickleball','Popmusic','Reading','RPDR','Tattoos','Tennis','Theater','Tv',
  'Weightlifting','Workingout','Writing','Yoga'
]) with ordinality as tags(label, ordinality);

insert into public.profile_tag_catalog (tag_id, label, category, sort_order)
select regexp_replace(lower(label), '[^a-z0-9]+', '-', 'g'), label, 'personality', ordinality
from unnest(array[
  'Adventurous','Aquarius','Aries','Cancer','Capricorn','Catperson','Chill','Confident','Curious','Direct','Dogperson',
  'Fun','Gemini','Goofy','Kind','Leo','Libra','Loyal','Mature','Outgoing','Parent','Pisces','Reliable','Romantic',
  'Sagittarius','Scorpio','Shy','Taurus','Unicorn','Virgo'
]) with ordinality as tags(label, ordinality);

insert into public.profile_tag_catalog (tag_id, label, category, sort_order)
select regexp_replace(lower(label), '[^a-z0-9]+', '-', 'g'), label, 'other', ordinality
from unnest(array[
  'Bear','Beard','Bi','Chub','Cleancut','College','Couple','Cub','Cuddling','Daddy','Dating','Drag','Drugfree',
  'Femme','FTM','Friends','Gaymer','Geek','Hairy','Jock','Lesbian','LTR','Military','MTF','Muscle','Nosmoking',
  'Otter','Pic4pic','Poz','Sissy','Smooth','Sober','T4T','Trans','Twink','Twunk'
]) with ordinality as tags(label, ordinality);

alter table public.profiles
  add column profile_tags text[] not null default '{}',
  add constraint profiles_profile_tags_count check (cardinality(profile_tags) <= 10);

create index profiles_profile_tags_gin_idx on public.profiles using gin (profile_tags);

create or replace function private.validate_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  value text;
begin
  if new.display_name is not null then new.display_name := btrim(new.display_name); end if;
  if new.pronouns is not null then new.pronouns := nullif(btrim(new.pronouns), ''); end if;
  if new.bio is not null then new.bio := nullif(btrim(new.bio), ''); end if;
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
  if exists (
    select 1 from unnest(coalesce(new.profile_tags, '{}')) selected(tag_id)
    where not exists (
      select 1 from public.profile_tag_catalog catalog
      where catalog.tag_id = selected.tag_id and catalog.active
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid_profile_tag';
  end if;
  if cardinality(coalesce(new.profile_tags, '{}')) <> (
    select count(distinct selected) from unnest(coalesce(new.profile_tags, '{}')) selected
  ) then
    raise exception using errcode = '22023', message = 'duplicate_profile_tag';
  end if;
  return new;
end;
$$;

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  content_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint albums_name_length check (char_length(btrim(name)) between 1 and 40),
  constraint albums_content_version_check check (content_version > 0)
);
create index albums_owner_updated_idx on public.albums (owner_id, updated_at desc) where deleted_at is null;

create table public.album_items (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null,
  position smallint not null,
  byte_size integer not null,
  duration_ms integer,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint album_items_media_type_check check (media_type in ('image', 'video')),
  constraint album_items_position_check check (position between 1 and 11),
  constraint album_items_size_check check (byte_size between 1 and 31457280),
  constraint album_items_duration_check check (
    (media_type = 'image' and duration_ms is null)
    or (media_type = 'video' and duration_ms between 1 and 15000)
  ),
  constraint album_items_owner_path_check check (storage_path like owner_id::text || '/' || album_id::text || '/%')
);
create unique index album_items_album_position_unique_idx on public.album_items (album_id, position) where deleted_at is null;
create index album_items_album_position_idx on public.album_items (album_id, position) where deleted_at is null;

create table public.album_shares (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  access_mode text not null,
  status text not null default 'pending',
  shared_version integer not null,
  last_viewed_version integer not null default 0,
  shared_at timestamptz not null default now(),
  accepted_at timestamptz,
  expires_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint album_shares_not_self check (owner_id <> recipient_id),
  constraint album_shares_mode_check check (access_mode in ('indefinite', 'view_once', '10_minutes', '1_hour', '24_hours')),
  constraint album_shares_status_check check (status in ('pending', 'accepted', 'declined', 'revoked', 'consumed')),
  unique (album_id, recipient_id)
);
create index album_shares_recipient_updated_idx on public.album_shares (recipient_id, updated_at desc);
create index album_shares_owner_updated_idx on public.album_shares (owner_id, updated_at desc);

create table public.album_view_sessions (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.album_shares(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  unique (share_id)
);

create table public.album_reactions (
  share_id uuid not null references public.album_shares(id) on delete cascade,
  item_id uuid not null references public.album_items(id) on delete cascade,
  reactor_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null default '🔥',
  created_at timestamptz not null default now(),
  primary key (share_id, item_id, reactor_id),
  constraint album_reactions_emoji_check check (emoji = '🔥')
);

alter table public.messages
  add column message_kind text not null default 'text',
  add column album_share_id uuid references public.album_shares(id) on delete set null,
  add column album_item_id uuid references public.album_items(id) on delete set null;
alter table public.messages drop constraint messages_single_payload_check;
alter table public.messages add constraint messages_kind_check
  check (message_kind in ('text', 'image', 'album_share', 'album_reply', 'album_reaction'));
alter table public.messages add constraint messages_payload_check check (
  deleted_at is not null
  or (message_kind = 'text' and body is not null and image_path is null and album_share_id is null and album_item_id is null)
  or (message_kind = 'image' and body is null and image_path is not null and album_share_id is null and album_item_id is null)
  or (message_kind = 'album_share' and body is not null and image_path is null)
  or (message_kind in ('album_reply', 'album_reaction') and body is not null and image_path is null)
);

alter table public.reports
  add column album_share_id uuid references public.album_shares(id) on delete set null,
  add column album_item_id uuid references public.album_items(id) on delete set null,
  add constraint reports_album_context_shape check (
    (album_share_id is null and album_item_id is null)
    or (album_share_id is not null and album_item_id is not null)
  );
create index reports_album_item_idx on public.reports (album_item_id) where album_item_id is not null;

create function private.normalize_message_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.message_kind = 'text' and new.image_path is not null and new.body is null then
    new.message_kind := 'image';
  end if;
  return new;
end;
$$;
create trigger messages_normalize_kind
before insert on public.messages
for each row execute function private.normalize_message_kind();

create function private.validate_album()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'INSERT' and (
    select count(*) from public.albums a where a.owner_id = new.owner_id and a.deleted_at is null
  ) >= 10 then
    raise exception using errcode = '23514', message = 'album_limit_reached';
  end if;
  return new;
end;
$$;
create trigger albums_validate_before_write
before insert or update on public.albums
for each row execute function private.validate_album();
create trigger albums_set_updated_at
before update on public.albums
for each row execute function private.set_updated_at();

create function private.validate_album_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  album_owner uuid;
begin
  select owner_id into album_owner from public.albums where id = new.album_id and deleted_at is null;
  if album_owner is null or album_owner <> new.owner_id then
    raise exception using errcode = '42501', message = 'album_owner_mismatch';
  end if;
  if new.media_type = 'image' and (
    select count(*) from public.album_items where album_id = new.album_id and media_type = 'image' and deleted_at is null and id <> new.id
  ) >= 10 then
    raise exception using errcode = '23514', message = 'album_photo_limit_reached';
  end if;
  if new.media_type = 'video' and exists (
    select 1 from public.album_items where album_id = new.album_id and media_type = 'video' and deleted_at is null and id <> new.id
  ) then
    raise exception using errcode = '23514', message = 'album_video_limit_reached';
  end if;
  return new;
end;
$$;
create trigger album_items_validate_before_write
before insert or update on public.album_items
for each row execute function private.validate_album_item();

create function private.bump_album_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.albums
  set content_version = content_version + 1, updated_at = now()
  where id = coalesce(new.album_id, old.album_id);
  return coalesce(new, old);
end;
$$;
create trigger album_items_bump_version
after insert or update or delete on public.album_items
for each row execute function private.bump_album_version();

create function private.album_share_is_open(p_share_id uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer = (select auth.uid()) and coalesce(exists (
    select 1
    from public.album_shares s
    join public.albums a on a.id = s.album_id and a.deleted_at is null
    where s.id = p_share_id
      and s.recipient_id = p_viewer
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = s.owner_id and b.blocked_id = s.recipient_id)
           or (b.blocker_id = s.recipient_id and b.blocked_id = s.owner_id)
      )
      and (
        (s.status = 'accepted' and (s.expires_at is null or s.expires_at > now()))
        or (
          s.status = 'consumed' and s.access_mode = 'view_once'
          and exists (
            select 1 from public.album_view_sessions vs
            where vs.share_id = s.id and vs.viewer_id = p_viewer
              and vs.closed_at is null and vs.expires_at > now()
          )
        )
      )
  ), false);
$$;

create function private.can_upload_album_media_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.albums album
    where album.id::text = (storage.foldername(p_name))[2]
      and album.owner_id = (select auth.uid())
      and album.deleted_at is null
  ), false);
$$;

create function private.can_view_album_media_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.album_items item
    join public.albums album on album.id = item.album_id
    where item.storage_path = p_name
      and (
        (album.owner_id = (select auth.uid()) and item.deleted_at is null and album.deleted_at is null)
        or exists (
          select 1 from public.album_shares share
          where share.album_id = album.id
            and item.deleted_at is null and album.deleted_at is null
            and private.album_share_is_open(share.id, (select auth.uid()))
        )
        or (
          private.is_admin()
          and exists (select 1 from public.reports r where r.album_item_id = item.id)
        )
      )
  ), false);
$$;

create function private.can_delete_album_media_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.album_items item
    where item.storage_path = p_name
      and item.owner_id = (select auth.uid())
      and not exists (
        select 1 from public.reports r
        where r.album_item_id = item.id
      )
  ), false);
$$;

create function private.album_report_context_is_valid(p_share_id uuid, p_item_id uuid, p_reported_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.album_shares s
    join public.album_items item on item.album_id = s.album_id and item.id = p_item_id
    where s.id = p_share_id
      and s.recipient_id = (select auth.uid())
      and s.owner_id = p_reported_id
      and s.status in ('accepted', 'consumed', 'revoked')
  ), false);
$$;

create function private.revoke_album_shares_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.album_shares
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where status in ('pending', 'accepted', 'consumed')
    and ((owner_id = new.blocker_id and recipient_id = new.blocked_id)
      or (owner_id = new.blocked_id and recipient_id = new.blocker_id));
  update public.album_view_sessions vs
  set closed_at = now()
  from public.album_shares s
  where vs.share_id = s.id and vs.closed_at is null
    and ((s.owner_id = new.blocker_id and s.recipient_id = new.blocked_id)
      or (s.owner_id = new.blocked_id and s.recipient_id = new.blocker_id));
  return new;
end;
$$;
create trigger blocks_revoke_album_shares
after insert on public.blocks
for each row execute function private.revoke_album_shares_on_block();

alter table public.profile_tag_catalog enable row level security;
alter table public.albums enable row level security;
alter table public.album_items enable row level security;
alter table public.album_shares enable row level security;
alter table public.album_view_sessions enable row level security;
alter table public.album_reactions enable row level security;

create policy profile_tag_catalog_read on public.profile_tag_catalog
for select to authenticated using (active);
create policy albums_owner_all on public.albums
for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy albums_shared_metadata_select on public.albums
for select to authenticated using (
  exists (
    select 1 from public.album_shares s
    where s.album_id = id
      and s.recipient_id = (select auth.uid())
      and private.album_share_is_open(s.id, (select auth.uid()))
  )
);
create policy album_items_owner_select on public.album_items
for select to authenticated using (owner_id = (select auth.uid()));
create policy album_items_owner_insert on public.album_items
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy album_items_owner_update on public.album_items
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy album_shares_participant_select on public.album_shares
for select to authenticated
using ((select auth.uid()) in (owner_id, recipient_id));
create policy album_reactions_participant_select on public.album_reactions
for select to authenticated using (
  exists (
    select 1 from public.album_shares s
    where s.id = share_id and (select auth.uid()) in (s.owner_id, s.recipient_id)
  )
);

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
      album_share_id is null and album_item_id is null
      and (select private.report_context_is_valid(conversation_id, message_id, reported_id))
    )
    or (
      album_share_id is not null and album_item_id is not null
      and (select private.album_report_context_is_valid(album_share_id, album_item_id, reported_id))
    )
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'album-media', 'album-media', false, 31457280,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy album_media_objects_select
on storage.objects for select to authenticated
using (bucket_id = 'album-media' and private.can_view_album_media_object(name));
create policy album_media_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'album-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.can_upload_album_media_object(name)
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov')
);
create policy album_media_objects_update
on storage.objects for update to authenticated
using (bucket_id = 'album-media' and owner_id = (select auth.uid())::text)
with check (
  bucket_id = 'album-media'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.can_upload_album_media_object(name)
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov')
);
create policy album_media_objects_delete
on storage.objects for delete to authenticated
using (bucket_id = 'album-media' and private.can_delete_album_media_object(name));

create function private.share_albums_impl(p_recipient_id uuid, p_album_ids uuid[], p_access_mode text)
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
    join private.private_locations l on l.profile_id = p.id
    where p.id = p_recipient_id and p.onboarding_completed_at is not null
      and p.special_category_consent_at is not null and p.date_of_birth <= current_date - interval '18 years'
      and p.is_profile_visible and p.is_location_sharing_enabled
      and p.moderation_status = 'active' and l.verified_at >= now() - interval '15 minutes'
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

create function public.share_albums(recipient_id uuid, album_ids uuid[], access_mode text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.share_albums_impl(recipient_id, album_ids, access_mode); $$;

create function private.share_albums_with_profiles_impl(p_recipient_ids uuid[], p_album_ids uuid[], p_access_mode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  share_result jsonb;
  conversations jsonb := '{}'::jsonb;
  share_ids jsonb := '[]'::jsonb;
begin
  if cardinality(p_recipient_ids) not between 1 and 5
    or cardinality(p_recipient_ids) <> cardinality(array(select distinct unnest(p_recipient_ids))) then
    raise exception using errcode = '22023', message = 'invalid_recipient_selection';
  end if;
  foreach recipient in array p_recipient_ids loop
    share_result := private.share_albums_impl(recipient, p_album_ids, p_access_mode);
    conversations := conversations || jsonb_build_object(recipient::text, share_result -> 'conversation_id');
    share_ids := share_ids || coalesce(share_result -> 'share_ids', '[]'::jsonb);
  end loop;
  return jsonb_build_object('conversation_ids', conversations, 'share_ids', share_ids);
end;
$$;

create function public.share_albums_with_profiles(recipient_ids uuid[], album_ids uuid[], access_mode text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.share_albums_with_profiles_impl(recipient_ids, album_ids, access_mode); $$;

create function private.respond_to_album_share_impl(p_share_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare s public.album_shares%rowtype;
begin
  select * into s from public.album_shares where id = p_share_id for update;
  if s.id is null or s.recipient_id <> (select auth.uid()) or s.status <> 'pending' then
    raise exception using errcode = '42501', message = 'album_share_not_pending';
  end if;
  if p_accept and exists (
    select 1 from public.blocks b where
      (b.blocker_id = s.owner_id and b.blocked_id = s.recipient_id)
      or (b.blocker_id = s.recipient_id and b.blocked_id = s.owner_id)
  ) then raise exception using errcode = '42501', message = 'album_share_blocked'; end if;
  update public.album_shares set
    status = case when p_accept then 'accepted' else 'declined' end,
    accepted_at = case when p_accept then now() else null end,
    expires_at = case
      when not p_accept or s.access_mode in ('indefinite', 'view_once') then null
      when s.access_mode = '10_minutes' then now() + interval '10 minutes'
      when s.access_mode = '1_hour' then now() + interval '1 hour'
      when s.access_mode = '24_hours' then now() + interval '24 hours'
    end,
    updated_at = now()
  where id = s.id;
  return jsonb_build_object('status', case when p_accept then 'accepted' else 'declined' end);
end;
$$;
create function public.respond_to_album_share(share_id uuid, accept boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.respond_to_album_share_impl(share_id, accept); $$;

create function private.open_album_share_impl(p_share_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.album_shares%rowtype;
  a public.albums%rowtype;
  session_id uuid;
  items jsonb;
begin
  select * into s from public.album_shares where id = p_share_id for update;
  if s.id is null or s.recipient_id <> (select auth.uid()) then
    raise exception using errcode = '42501', message = 'album_share_not_found';
  end if;
  if not private.album_share_is_open(s.id, s.recipient_id) then
    raise exception using errcode = '42501', message = 'album_share_locked';
  end if;
  if s.access_mode = 'view_once' then
    if s.status <> 'accepted' or s.consumed_at is not null then
      raise exception using errcode = '42501', message = 'album_already_viewed';
    end if;
    insert into public.album_view_sessions (share_id, viewer_id, expires_at)
    values (s.id, s.recipient_id, now() + interval '10 minutes') returning id into session_id;
    update public.album_shares set status = 'consumed', consumed_at = now(), updated_at = now()
    where id = s.id;
  end if;
  select * into a from public.albums where id = s.album_id and deleted_at is null;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.id, 'media_type', item.media_type, 'storage_path', item.storage_path,
    'position', item.position, 'duration_ms', item.duration_ms
  ) order by item.position), '[]'::jsonb) into items
  from public.album_items item where item.album_id = a.id and item.deleted_at is null;
  update public.album_shares set last_viewed_version = a.content_version, updated_at = now() where id = s.id;
  return jsonb_build_object(
    'share_id', s.id, 'album_id', a.id, 'name', a.name, 'content_version', a.content_version,
    'session_id', session_id, 'session_expires_at', case when session_id is null then null else now() + interval '10 minutes' end,
    'items', items
  );
end;
$$;
create function public.open_album_share(share_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.open_album_share_impl(share_id); $$;

create function private.close_album_view_session_impl(p_session_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.album_view_sessions set closed_at = now()
  where id = p_session_id and viewer_id = (select auth.uid()) and closed_at is null;
end;
$$;
create function public.close_album_view_session(session_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.close_album_view_session_impl(session_id); $$;

create function private.revoke_album_share_impl(p_share_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.album_shares set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = p_share_id and owner_id = (select auth.uid()) and status in ('pending', 'accepted', 'consumed');
  if not found then raise exception using errcode = '42501', message = 'album_share_not_revocable'; end if;
  update public.album_view_sessions set closed_at = now() where share_id = p_share_id and closed_at is null;
end;
$$;
create function public.revoke_album_share(share_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.revoke_album_share_impl(share_id); $$;

create function private.toggle_album_reaction_impl(p_share_id uuid, p_item_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare s public.album_shares%rowtype;
begin
  select * into s from public.album_shares where id = p_share_id;
  if s.id is null or s.recipient_id <> (select auth.uid())
    or not private.album_share_is_open(s.id, s.recipient_id)
    or not exists (select 1 from public.album_items where id = p_item_id and album_id = s.album_id and deleted_at is null)
  then raise exception using errcode = '42501', message = 'album_item_not_accessible'; end if;
  if exists (select 1 from public.album_reactions where share_id = s.id and item_id = p_item_id and reactor_id = s.recipient_id) then
    delete from public.album_reactions where share_id = s.id and item_id = p_item_id and reactor_id = s.recipient_id;
    return false;
  end if;
  insert into public.album_reactions (share_id, item_id, reactor_id) values (s.id, p_item_id, s.recipient_id);
  insert into public.messages (conversation_id, sender_id, body, message_kind, album_share_id, album_item_id)
  values (s.conversation_id, s.recipient_id, '🔥 reacted to an album item', 'album_reaction', s.id, p_item_id);
  return true;
end;
$$;
create function public.toggle_album_reaction(share_id uuid, item_id uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select private.toggle_album_reaction_impl(share_id, item_id); $$;

create function private.send_album_reply_impl(p_share_id uuid, p_item_id uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare s public.album_shares%rowtype; message_id uuid;
begin
  select * into s from public.album_shares where id = p_share_id;
  if s.id is null or s.recipient_id <> (select auth.uid())
    or not private.album_share_is_open(s.id, s.recipient_id)
    or char_length(btrim(p_body)) not between 1 and 2000
    or not exists (select 1 from public.album_items where id = p_item_id and album_id = s.album_id and deleted_at is null)
  then raise exception using errcode = '42501', message = 'album_reply_not_allowed'; end if;
  insert into public.messages (conversation_id, sender_id, body, message_kind, album_share_id, album_item_id)
  values (s.conversation_id, s.recipient_id, btrim(p_body), 'album_reply', s.id, p_item_id)
  returning id into message_id;
  return message_id;
end;
$$;
create function public.send_album_reply(share_id uuid, item_id uuid, body text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.send_album_reply_impl(share_id, item_id, body); $$;

create function private.delete_album_item_impl(p_item_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare item public.album_items%rowtype; preserve boolean;
begin
  select * into item from public.album_items where id = p_item_id and owner_id = (select auth.uid()) for update;
  if item.id is null then raise exception using errcode = '42501', message = 'album_item_not_found'; end if;
  preserve := exists (select 1 from public.reports where album_item_id = item.id);
  if preserve then update public.album_items set deleted_at = now() where id = item.id;
  else delete from public.album_items where id = item.id; end if;
  return jsonb_build_object('storage_path', item.storage_path, 'preserved', preserve);
end;
$$;
create function public.delete_album_item(item_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.delete_album_item_impl(item_id); $$;

create function private.delete_album_impl(p_album_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.albums where id = p_album_id and owner_id = (select auth.uid())) then
    raise exception using errcode = '42501', message = 'album_not_found';
  end if;
  if exists (
    select 1 from public.reports r join public.album_items item on item.id = r.album_item_id
    where item.album_id = p_album_id
  ) then
    update public.albums set deleted_at = now() where id = p_album_id;
    update public.album_items set deleted_at = now() where album_id = p_album_id;
    update public.album_shares set status = 'revoked', revoked_at = now(), updated_at = now()
    where album_id = p_album_id and status in ('pending', 'accepted', 'consumed');
  else
    delete from public.albums where id = p_album_id;
  end if;
end;
$$;
create function public.delete_album(album_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.delete_album_impl(album_id); $$;

create or replace function private.get_public_profile_impl(p_profile_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when private.current_user_is_ready(true) then (
    select jsonb_build_object(
      'id', p.id, 'display_name', p.display_name,
      'age', extract(year from age(current_date, p.date_of_birth))::integer,
      'pronouns', p.pronouns, 'identity_tags', p.identity_tags, 'looking_for', p.looking_for,
      'profile_tags', p.profile_tags, 'bio', p.bio, 'region', p.region,
      'is_online', p.is_online_status_visible and p.last_active_at >= now() - interval '5 minutes',
      'photo_paths', coalesce((
        select jsonb_agg(photo.storage_path order by photo.position)
        from public.profile_photos photo
        where photo.profile_id = p.id and photo.approval_status = 'approved'
      ), '[]'::jsonb)
    )
    from public.profiles p
    join private.private_locations l on l.profile_id = p.id
    where p.id = p_profile_id and p.id <> (select auth.uid()) and p.is_profile_visible
      and p.moderation_status = 'active' and l.verified_at >= now() - interval '15 minutes'
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = (select auth.uid()))
      )
  ) else null end;
$$;

drop function public.discover_nearby(jsonb, jsonb);
drop function private.discover_nearby_impl(jsonb, jsonb);
create function private.discover_nearby_impl(filters jsonb, cursor jsonb)
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
  identity_filter text[]; intent_filter text[]; tag_filter text[]; online_only boolean := false;
begin
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
    begin cursor_band := coalesce((cursor ->> 'band_rank')::integer, -1); cursor_profile := coalesce((cursor ->> 'profile_id')::uuid, cursor_profile);
    exception when invalid_text_representation then raise exception using errcode = '22023', message = 'invalid_cursor'; end;
  end if;
  return query
  with candidates as (
    select p.id, p.display_name, extract(year from age(current_date, p.date_of_birth))::smallint calculated_age,
      p.pronouns, p.identity_tags, p.looking_for, p.profile_tags, p.bio, p.region, coalesce(photos.paths, '{}') paths,
      case when extensions.st_distance(l.cell_center, requester_location) < 1000 then 0
        when extensions.st_distance(l.cell_center, requester_location) < 3000 then 1
        when extensions.st_distance(l.cell_center, requester_location) < 10000 then 2
        when extensions.st_distance(l.cell_center, requester_location) < 30000 then 3 else 4 end band_rank,
      p.is_online_status_visible and p.last_active_at >= now() - interval '5 minutes' calculated_online
    from public.profiles p join private.private_locations l on l.profile_id = p.id
    left join lateral (
      select array_agg(photo.storage_path order by photo.position) paths from public.profile_photos photo
      where photo.profile_id = p.id and photo.approval_status = 'approved'
    ) photos on true
    where p.id <> caller and p.display_name is not null and p.date_of_birth <= current_date - interval '18 years'
      and p.onboarding_completed_at is not null and p.special_category_consent_at is not null
      and p.is_profile_visible and p.is_location_sharing_enabled and l.verified_at >= now() - interval '15 minutes'
      and p.moderation_status <> 'banned' and (p.moderation_status <> 'suspended' or p.suspended_until <= now())
      and not exists (select 1 from public.blocks b where
        (b.blocker_id = caller and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = caller))
  ), filtered as (
    select * from candidates c where c.calculated_age between min_age and max_age
      and (identity_filter is null or cardinality(identity_filter) = 0 or c.identity_tags && identity_filter)
      and (intent_filter is null or cardinality(intent_filter) = 0 or c.looking_for && intent_filter)
      and (tag_filter is null or cardinality(tag_filter) = 0 or c.profile_tags @> tag_filter)
      and (not online_only or c.calculated_online)
      and (c.band_rank > cursor_band or (c.band_rank = cursor_band and c.id > cursor_profile))
  )
  select f.id, f.display_name, f.calculated_age, f.pronouns, f.identity_tags, f.looking_for, f.profile_tags,
    f.bio, f.region, f.paths,
    case f.band_rank when 0 then '<1 km' when 1 then '1-3 km' when 2 then '3-10 km' when 3 then '10-30 km' else '30+ km' end,
    f.calculated_online, jsonb_build_object('band_rank', f.band_rank, 'profile_id', f.id)
  from filtered f order by f.band_rank, f.id limit page_size;
end;
$$;

create function public.discover_nearby(filters jsonb default '{}', cursor jsonb default null)
returns table (
  profile_id uuid, display_name text, age smallint, pronouns text, identity_tags text[], looking_for text[],
  profile_tags text[], bio text, region text, photo_paths text[], distance_band text, is_online boolean,
  result_cursor jsonb
)
language sql stable security invoker set search_path = ''
as $$ select * from private.discover_nearby_impl(filters, cursor); $$;

create or replace function private.export_my_account_impl()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is null or not exists (select 1 from auth.users where id = caller) then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = caller),
    'profile_photos', coalesce((select jsonb_agg(to_jsonb(pp) order by pp.position) from public.profile_photos pp where pp.profile_id = caller), '[]'::jsonb),
    'albums', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.albums a where a.owner_id = caller), '[]'::jsonb),
    'album_items', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at) from public.album_items i where i.owner_id = caller), '[]'::jsonb),
    'album_shares', coalesce((select jsonb_agg(to_jsonb(s) order by s.shared_at) from public.album_shares s where caller in (s.owner_id, s.recipient_id)), '[]'::jsonb),
    'blocks', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at) from public.blocks b where b.blocker_id = caller), '[]'::jsonb),
    'conversation_memberships', coalesce((select jsonb_agg(to_jsonb(cm) order by cm.joined_at) from public.conversation_members cm where cm.user_id = caller), '[]'::jsonb),
    'authored_messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.messages m where m.sender_id = caller), '[]'::jsonb),
    'submitted_reports', coalesce((select jsonb_agg(to_jsonb(r) - 'assigned_admin' - 'resolution_notes' order by r.created_at) from public.reports r where r.reporter_id = caller), '[]'::jsonb)
  );
end;
$$;

create or replace function private.admin_get_report_impl(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception using errcode = '42501', message = 'admin_required'; end if;
  select jsonb_build_object(
    'report', to_jsonb(r),
    'reporter_profile', case when reporter.id is null then null else jsonb_build_object('id', reporter.id, 'display_name', reporter.display_name, 'moderation_status', reporter.moderation_status) end,
    'reported_profile', case when reported.id is null then null else jsonb_build_object('id', reported.id, 'display_name', reported.display_name, 'moderation_status', reported.moderation_status, 'suspended_until', reported.suspended_until) end,
    'message_evidence', case when m.id is null then null else to_jsonb(m) end,
    'album_evidence', case when item.id is null then null else jsonb_build_object(
      'share_id', s.id, 'album_id', item.album_id, 'item_id', item.id, 'media_type', item.media_type,
      'storage_path', item.storage_path, 'duration_ms', item.duration_ms, 'deleted_at', item.deleted_at
    ) end
  ) into result
  from public.reports r
  left join public.profiles reporter on reporter.id = r.reporter_id
  left join public.profiles reported on reported.id = r.reported_id
  left join public.messages m on m.id = r.message_id
  left join public.album_items item on item.id = r.album_item_id
  left join public.album_shares s on s.id = r.album_share_id
  where r.id = p_report_id;
  if result is null then raise exception using errcode = 'P0001', message = 'report_not_found'; end if;
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

grant select on public.profile_tag_catalog to authenticated;
grant select on public.albums to authenticated;
grant insert (owner_id, name) on public.albums to authenticated;
grant update (name, deleted_at) on public.albums to authenticated;
grant select on public.album_items to authenticated;
grant insert (album_id, owner_id, storage_path, media_type, position, byte_size, duration_ms) on public.album_items to authenticated;
grant update (position, deleted_at) on public.album_items to authenticated;
grant select on public.album_shares to authenticated;
grant select on public.album_reactions to authenticated;
grant update (profile_tags) on public.profiles to authenticated;
grant insert (reporter_id, reported_id, conversation_id, message_id, album_share_id, album_item_id, category, details) on public.reports to authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_user_is_ready(boolean) to authenticated;
grant execute on function private.is_conversation_member(uuid) to authenticated;
grant execute on function private.can_message(uuid) to authenticated;
grant execute on function private.report_context_is_valid(uuid,uuid,uuid) to authenticated;
grant execute on function private.can_view_profile_photo_object(text) to authenticated;
grant execute on function private.can_view_message_image_object(text) to authenticated;
grant execute on function private.get_public_profile_impl(uuid) to authenticated;
grant execute on function private.start_conversation_impl(uuid) to authenticated;
grant execute on function private.discover_nearby_impl(jsonb,jsonb) to authenticated;
grant execute on function private.album_share_is_open(uuid,uuid) to authenticated;
grant execute on function private.can_upload_album_media_object(text) to authenticated;
grant execute on function private.can_view_album_media_object(text) to authenticated;
grant execute on function private.can_delete_album_media_object(text) to authenticated;
grant execute on function private.album_report_context_is_valid(uuid,uuid,uuid) to authenticated;
grant execute on function private.share_albums_impl(uuid,uuid[],text) to authenticated;
grant execute on function private.share_albums_with_profiles_impl(uuid[],uuid[],text) to authenticated;
grant execute on function private.respond_to_album_share_impl(uuid,boolean) to authenticated;
grant execute on function private.open_album_share_impl(uuid) to authenticated;
grant execute on function private.close_album_view_session_impl(uuid) to authenticated;
grant execute on function private.revoke_album_share_impl(uuid) to authenticated;
grant execute on function private.toggle_album_reaction_impl(uuid,uuid) to authenticated;
grant execute on function private.send_album_reply_impl(uuid,uuid,text) to authenticated;
grant execute on function private.delete_album_item_impl(uuid) to authenticated;
grant execute on function private.delete_album_impl(uuid) to authenticated;
grant execute on function public.get_public_profile(uuid) to authenticated;
grant execute on function public.discover_nearby(jsonb,jsonb) to authenticated;
grant execute on function public.share_albums(uuid,uuid[],text) to authenticated;
grant execute on function public.share_albums_with_profiles(uuid[],uuid[],text) to authenticated;
grant execute on function public.respond_to_album_share(uuid,boolean) to authenticated;
grant execute on function public.open_album_share(uuid) to authenticated;
grant execute on function public.close_album_view_session(uuid) to authenticated;
grant execute on function public.revoke_album_share(uuid) to authenticated;
grant execute on function public.toggle_album_reaction(uuid,uuid) to authenticated;
grant execute on function public.send_album_reply(uuid,uuid,text) to authenticated;
grant execute on function public.delete_album_item(uuid) to authenticated;
grant execute on function public.delete_album(uuid) to authenticated;
grant execute on function public.export_my_account() to authenticated;
grant execute on function public.admin_get_report(uuid) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'album_shares'
  ) then alter publication supabase_realtime add table public.album_shares; end if;
end $$;

comment on table public.profile_tag_catalog is 'Exact English My Tags catalog snapshot dated 2026-08-31.';
comment on table public.album_items is 'Private album metadata. Storage access is checked independently for every signed URL request.';
