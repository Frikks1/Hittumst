-- Read-only recognition of actual committed support. Membership renewals,
-- recurring event schedules, quotes and uncommitted pledges are not evidence.
-- No finance state, subscription, mandate, charge or RSVP is written here.
create function private.sponsorship_committed_at(p_value text) returns timestamptz
language plpgsql immutable set search_path='' as $$
begin
  if p_value is null or p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then return null; end if;
  return p_value::timestamptz;
exception when invalid_datetime_format or datetime_field_overflow or sqlstate '22009' then return null;
end $$;
revoke all on function private.sponsorship_committed_at(text) from public,anon,authenticated,service_role;

create function private.list_meetup_sponsors_impl(p_meetup_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); event_row public.meetups%rowtype; result jsonb;
begin
  perform private.assert_meetup_feature_enabled();
  -- Reuse the current session/account/event visibility boundary, including
  -- blocked hosts and unpublished/private event authorization.
  perform private.get_meetup_impl(p_meetup_id);
  if not private.meetup_diagnosis_eligible(p_meetup_id,caller) then
    raise exception using errcode='42501',message='meetup_not_visible';
  end if;
  select * into event_row from public.meetups where id=p_meetup_id;
  if event_row.status<>'published' then return '[]'::jsonb; end if;
  with ledger as (select state from private.finance_state where id),
  committed as (
    select c.value->>'id' receipt_id,p.id member_id,sm.id meetup_id,
      (c.value->>'amount')::bigint amount,private.sponsorship_committed_at(tx.value->>'at') committed_at
    from ledger l cross join lateral jsonb_each(coalesce(l.state->'contributions','{}'::jsonb)) c
    join public.meetups sm on sm.id::text=c.value->>'eventId'
    join public.profiles p on p.id::text=c.value->>'memberId'
    join lateral jsonb_array_elements(coalesce(l.state->'journal','[]'::jsonb)) tx
      on tx.value->>'id'=c.value->>'id' and tx.value->>'kind'='contribution'
    where (sm.id=event_row.id or event_row.series_id is not null and sm.series_id=event_row.series_id)
      and private.community_event_visible(sm.id,caller) and private.meetup_diagnosis_eligible(sm.id,caller)
      and p.deletion_requested_at is null and p.moderation_status='active'
      and private.meetup_actor_is_active(p.id)
      and not exists(select 1 from private.media_restore_quarantine q where q.account_id=p.id)
      and not private.meetup_block_exists(p.id,caller)
      and (c.value->>'amount')::bigint>0 and not coalesce((c.value->>'reversed')::boolean,false)
      and c.value->>'refundReason' is null
      and private.sponsorship_committed_at(tx.value->>'at')<=now()
      and (select coalesce(sum((entry->>'amount')::bigint),0)
        from jsonb_array_elements(coalesce(tx.value->'entries','[]'::jsonb)) entry
        where entry->>'account'='pool:'||sm.id::text)=(c.value->>'amount')::bigint
  ), current_support as (
    select member_id,min(receipt_id) receipt_id,sum(amount) amount,min(committed_at) first_commit
    from committed where meetup_id=event_row.id group by member_id
  ), history as (
    select member_id,sum(amount) cumulative_amount,
      count(distinct date_trunc('month',committed_at at time zone 'Atlantic/Reykjavik')) contributing_months
    from committed group by member_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.receipt_id,
    -- A masked row has no name, member ID, avatar or participation metadata.
    'profile',case when p.is_profile_visible then jsonb_build_object('id',p.id,'displayName',p.display_name) else null end,
    'amount',s.amount,'contributingMonths',h.contributing_months,
    'cumulativeAmount',h.cumulative_amount,'repeatSupport',h.contributing_months>=2
  ) order by s.first_commit,s.receipt_id),'[]'::jsonb) into result
  from current_support s join history h using(member_id) join public.profiles p on p.id=s.member_id;
  return result;
end $$;

create function public.list_meetup_sponsors(meetup_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select private.list_meetup_sponsors_impl(meetup_id);$$;
revoke all on function private.list_meetup_sponsors_impl(uuid),public.list_meetup_sponsors(uuid) from public,anon,authenticated,service_role;
grant execute on function private.list_meetup_sponsors_impl(uuid),public.list_meetup_sponsors(uuid) to authenticated;
