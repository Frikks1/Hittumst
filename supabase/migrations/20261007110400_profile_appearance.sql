-- Appearance values are selections from a local design catalog, never CSS, URLs,
-- or executable content. Existing members retain their current profile styling.
alter table public.profiles
  add column profile_appearance jsonb not null
  default '{"palette":"default","banner":"photo","effect":"none","avatarBorder":"none"}'::jsonb;

alter table public.profiles add constraint profiles_appearance_catalog_check check (
  coalesce(
    jsonb_typeof(profile_appearance) = 'object'
    and profile_appearance ?& array['palette', 'banner', 'effect', 'avatarBorder']
    and profile_appearance - array['palette', 'banner', 'effect', 'avatarBorder'] = '{}'::jsonb
    and profile_appearance ->> 'palette' in ('default', 'fern', 'violet', 'ember', 'ocean')
    and profile_appearance ->> 'banner' in ('photo', 'aurora', 'sunset', 'midnight')
    and profile_appearance ->> 'effect' in ('none', 'fireflies', 'sparkles', 'hearts')
    and profile_appearance ->> 'avatarBorder' in ('none', 'glow', 'rainbow', 'ferns', 'orbit'),
    false
  )
);

-- The existing owner-only UPDATE policy continues to govern the new column.
grant update (profile_appearance) on public.profiles to authenticated;

-- Preserve the existing visibility, consent, location, moderation and block checks.
-- Extend the protected profile payload rather than exposing profiles via a new view.
create or replace function private.get_public_profile_impl(p_profile_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when private.current_user_is_ready(true) then (
    select jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'gender',p.gender,
      'diagnosis_ids',coalesce((select jsonb_agg(s.diagnosis_id) from private.diagnosis_submissions s where s.profile_id=p.id and s.status='approved' and s.consent_at is not null and s.discoverable and private.discovery_enabled()),'[]'),
      'age', extract(year from age(current_date, p.date_of_birth))::integer,
      'pronouns', p.pronouns, 'identity_tags', p.identity_tags, 'looking_for', p.looking_for,
      'profile_tags', case when p.adult_profile_tags_enabled then p.profile_tags else
        coalesce((select array_agg(selected.tag_id order by selected.tag_id) from unnest(p.profile_tags) as selected(tag_id)
                  where not exists (select 1 from public.profile_tag_catalog catalog
                                    where catalog.tag_id = selected.tag_id and catalog.category = 'kinks')), '{}') end,
      'custom_tags', p.custom_tags, 'bio', p.bio, 'region', p.region,
      'distance_band',case when l.verified_at>=now()-interval '15 minutes' then
       (select case when extensions.st_distance(l.cell_center,viewer.cell_center)<1000 then '<1 km' when extensions.st_distance(l.cell_center,viewer.cell_center)<3000 then '1-3 km' when extensions.st_distance(l.cell_center,viewer.cell_center)<10000 then '3-10 km' when extensions.st_distance(l.cell_center,viewer.cell_center)<30000 then '10-30 km' else '30+ km' end from private.private_locations viewer where viewer.profile_id=(select auth.uid()) and viewer.verified_at>=now()-interval '15 minutes') else null end,
      'videos', p.videos, 'socials', p.socials, 'interests', p.interests,
      'conversation_prompt', p.conversation_prompt,
      'profile_appearance', p.profile_appearance,
      'cover_photo_id', (select photo.id from public.profile_photos photo
        where photo.id = p.cover_photo_id and photo.profile_id = p.id and photo.approval_status = 'approved'),
      'comment_wall_enabled', p.comment_wall_enabled,
      'anonymous_ratings_enabled', p.anonymous_ratings_enabled,
      'is_online', p.is_online_status_visible and p.last_active_at >= now() - interval '5 minutes',
      'photo_paths', coalesce((select jsonb_agg(jsonb_build_object('path', photo.storage_path, 'id', photo.id, 'tags', photo.tags) order by photo.position)
        from public.profile_photos photo where photo.profile_id = p.id and photo.approval_status = 'approved'), '[]'::jsonb),
      'profile_videos', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'path', v.storage_path, 'tags', v.tags, 'duration_ms', v.duration_ms) order by v.position)
        from public.profile_videos v where v.profile_id = p.id and v.approval_status = 'approved'), '[]'::jsonb)
    ) from public.profiles p left join private.private_locations l on l.profile_id = p.id
    where p.id = p_profile_id and p.id <> (select auth.uid()) and p.is_profile_visible and p.moderation_status = 'active'
      and private.discovery_target_allowed(p.id)
      and not exists (select 1 from public.blocks b where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = (select auth.uid())))
  ) else null end;
$$;
revoke all on function private.get_public_profile_impl(uuid) from public, anon;
grant execute on function private.get_public_profile_impl(uuid) to authenticated;
