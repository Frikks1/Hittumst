-- Personal profile customization. Existing profile visibility and location gates remain in force.
alter table public.profiles
  add column cover_photo_id uuid references public.profile_photos(id) on delete set null,
  add column conversation_prompt text not null default ''
    check (char_length(conversation_prompt) <= 160);
grant update (cover_photo_id, conversation_prompt) on public.profiles to authenticated;

create function private.validate_profile_cover()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.cover_photo_id is not null and not exists (
    select 1 from public.profile_photos photo
    where photo.id = new.cover_photo_id and photo.profile_id = new.id and photo.approval_status = 'approved'
  ) then
    raise exception using errcode = '23514', message = 'cover_requires_own_approved_photo';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_profile_cover() from public, anon, authenticated;
create trigger profile_cover_guard before insert or update of cover_photo_id on public.profiles
  for each row execute function private.validate_profile_cover();

-- Choices within a section match ANY; separately selected sections must BOTH match.
create function private.matches_discovery_identity_groups(actual text[], chosen text[])
returns boolean language sql immutable set search_path = '' as $$
  select (not exists (select 1 from unnest(chosen) choice where choice in ('gay','bi','queer','lesbian'))
    or actual && array(select choice from unnest(chosen) choice where choice in ('gay','bi','queer','lesbian')))
  and (not exists (select 1 from unnest(chosen) choice where choice in ('trans','nonbinary'))
    or actual && array(select choice from unnest(chosen) choice where choice in ('trans','nonbinary')))
  and not exists (select 1 from unnest(chosen) choice where choice not in ('gay','bi','queer','lesbian','trans','nonbinary'));
$$;
revoke all on function private.matches_discovery_identity_groups(text[], text[]) from public, anon, authenticated;

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
      and private.matches_discovery_identity_groups(c.identity_tags, identity_filter)
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
    ) from public.profiles p join private.private_locations l on l.profile_id = p.id
    where p.id = p_profile_id and p.id <> (select auth.uid()) and p.is_profile_visible and p.moderation_status = 'active'
      and l.verified_at >= now() - interval '15 minutes'
      and not exists (select 1 from public.blocks b where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = (select auth.uid())))
  ) else null end;
$$;
