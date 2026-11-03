-- Sponsorship affects display order only. Keep the existing host-only roster
-- authorization, private RSVP/history policy and waitlist/admission functions.
create or replace function private.list_meetup_participants_impl(p_meetup_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); result jsonb;
begin
  perform private.assert_meetup_feature_enabled();
  if not exists(select 1 from public.meetups m where m.id=p_meetup_id and m.host_id=caller and m.status='published') then
    raise exception using errcode='42501',message='meetup_host_required';
  end if;
  if not private.meetup_current_user_can_host() then
    raise exception using errcode='42501',message='meetup_host_not_eligible';
  end if;
  select coalesce(jsonb_agg(
    private.meetup_request_payload(mp.meetup_id,mp.profile_id)
      ||jsonb_build_object('isSponsor',private.community_sponsor_rank(mp.meetup_id,mp.profile_id)=0,'rsvpVisibility','private')
    order by private.community_sponsor_rank(mp.meetup_id,mp.profile_id),
      case mp.status when 'pending' then 0 when 'joined' then 1 when 'approved' then 2
        when 'removed' then 3 when 'declined' then 4 when 'withdrawn' then 5 else 6 end,
      coalesce(mp.requested_at,mp.joined_at,mp.created_at),mp.id
  ),'[]'::jsonb) into result
  from public.meetup_participations mp
  where mp.meetup_id=p_meetup_id and mp.profile_id is not null
    and mp.status in ('joined','pending','approved','declined','withdrawn','removed','left');
  return result;
end $$;

create or replace function private.list_public_meetup_roster_impl(p_meetup_id uuid,p_cursor uuid default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); n integer:=least(greatest(coalesce(p_limit,50),1),50); result jsonb; cursor_rank integer;
begin
  if not private.account_is_active() or not private.meetup_actor_is_active(caller) then
    raise exception using errcode='42501',message='account_unavailable';
  end if;
  if not private.meetup_is_host(p_meetup_id,caller) then return '{"items":[],"nextCursor":null}'::jsonb; end if;
  if not private.meetup_current_user_can_host() then
    raise exception using errcode='42501',message='meetup_host_not_eligible';
  end if;
  -- Retain the UUID cursor API; seek on the same sponsor-rank/UUID tuple used
  -- for ordering. Unknown or no-longer-authorized cursors return an empty page.
  if p_cursor is not null then
    select private.community_sponsor_rank(mp.meetup_id,mp.profile_id) into cursor_rank
    from public.meetup_participations mp where mp.meetup_id=p_meetup_id and mp.id=p_cursor
      and mp.profile_id is not null and mp.status in ('joined','approved');
  end if;
  with candidates as (
    select mp.id,private.community_sponsor_rank(mp.meetup_id,mp.profile_id) sponsor_rank,
      private.meetup_request_payload(mp.meetup_id,mp.profile_id)
        ||jsonb_build_object('isSponsor',private.community_sponsor_rank(mp.meetup_id,mp.profile_id)=0,'rsvpVisibility','private') payload
    from public.meetup_participations mp
    where mp.meetup_id=p_meetup_id and mp.profile_id is not null and mp.status in ('joined','approved')
      and (p_cursor is null or (private.community_sponsor_rank(mp.meetup_id,mp.profile_id),mp.id)>(cursor_rank,p_cursor))
    order by sponsor_rank,mp.id limit n+1
  ), page as (select * from candidates order by sponsor_rank,id limit n)
  select jsonb_build_object('items',coalesce((select jsonb_agg(payload order by sponsor_rank,id) from page),'[]'),
    'nextCursor',case when (select count(*) from candidates)>n then
      (select id::text from page order by sponsor_rank desc,id desc limit 1) else null end) into result;
  return result;
end $$;

-- CREATE OR REPLACE preserves the existing grants. Reaffirm the same caller
-- surface; the sponsor predicate remains inaccessible as a standalone API.
revoke all on function private.list_meetup_participants_impl(uuid),private.list_public_meetup_roster_impl(uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function private.list_meetup_participants_impl(uuid),private.list_public_meetup_roster_impl(uuid,uuid,integer) to authenticated;
