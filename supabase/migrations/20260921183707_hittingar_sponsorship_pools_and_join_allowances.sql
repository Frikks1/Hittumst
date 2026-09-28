-- Joining has a separate, durable occurrence reservation. A terminal RSVP cannot
-- erase a consumed slot; pre-start departure and cancellation release it.
create or replace function private.tier_limits(p_tier text) returns jsonb
language sql immutable set search_path='' as $$
  select case p_tier
    when 'plebba_kongur' then '{"albums":6,"photos":30,"videos":3,"occurrences":10,"joins":15,"hostBps":2500}'::jsonb
    when 'flottari_plebbi' then '{"albums":3,"photos":10,"videos":2,"occurrences":5,"joins":5,"hostBps":2500}'::jsonb
    else '{"albums":1,"photos":10,"videos":1,"occurrences":1,"joins":1,"hostBps":2500}'::jsonb end;
$$;
create table private.meetup_join_reservations (
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  month_start date not null,
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  primary key(meetup_id,profile_id)
);
create index meetup_join_reservations_allowance on private.meetup_join_reservations(profile_id,month_start) where released_at is null;
alter table private.meetup_join_reservations enable row level security;
revoke all on private.meetup_join_reservations from public,anon,authenticated,service_role;
-- Existing reservations survive migration/downgrade, even when over the new cap.
insert into private.meetup_join_reservations(meetup_id,profile_id,month_start,reserved_at)
select p.meetup_id,p.profile_id,date_trunc('month',m.starts_at at time zone 'Atlantic/Reykjavik')::date,
  coalesce(p.joined_at,p.responded_at,p.created_at)
from public.meetup_participations p join public.meetups m on m.id=p.meetup_id
where p.profile_id is not null and p.profile_id is distinct from m.host_id and m.status<>'cancelled'
  and (p.status in ('joined','approved') or (coalesce(p.joined_at,p.responded_at) is not null and
    ((p.status='left' and p.left_at>=m.starts_at) or (p.status='removed' and p.removed_at>=m.starts_at))));
create function private.meetup_joins_used(p_profile uuid,p_month date) returns integer
language sql stable security definer set search_path='' as $$
  select count(*)::integer from private.meetup_join_reservations where profile_id=p_profile and month_start=p_month and released_at is null;
$$;
create function private.enforce_meetup_join_allowance() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.meetups; slot private.meetup_join_reservations; target_month date; cap integer;
begin
  if new.profile_id is null then return new; end if;
  if tg_op='UPDATE' and new.meetup_id=old.meetup_id and new.profile_id=old.profile_id and new.status=old.status then return new; end if;
  select * into m from public.meetups where id=new.meetup_id for update;
  if m.id is null or new.profile_id=m.host_id then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.profile_id::text||':meetup-joins',0));
  select * into slot from private.meetup_join_reservations where meetup_id=new.meetup_id and profile_id=new.profile_id;
  if new.status not in ('joined','approved') then
    if tg_op='UPDATE' and old.status in ('joined','approved') and now()<m.starts_at then
      update private.meetup_join_reservations set released_at=now() where meetup_id=new.meetup_id and profile_id=new.profile_id and released_at is null;
    end if;
    return new;
  end if;
  if slot.meetup_id is not null and slot.released_at is null then return new; end if;
  target_month:=date_trunc('month',m.starts_at at time zone 'Atlantic/Reykjavik')::date;
  cap:=(private.tier_limits(private.member_tier(new.profile_id))->>'joins')::integer;
  if private.meetup_joins_used(new.profile_id,target_month)>=cap then
    raise exception using errcode='23514',message='meetup_monthly_join_limit_reached';
  end if;
  insert into private.meetup_join_reservations(meetup_id,profile_id,month_start) values(new.meetup_id,new.profile_id,target_month)
  on conflict(meetup_id,profile_id) do update set month_start=excluded.month_start,reserved_at=now(),released_at=null;
  return new;
end; $$;
create trigger meetup_join_allowance before insert or update on public.meetup_participations for each row execute function private.enforce_meetup_join_allowance();
-- Event lock precedes UUID-ordered account locks, including moves between months.
create function private.move_meetup_join_allowances() returns trigger
language plpgsql security definer set search_path='' as $$
declare attendee record; destination date; cap integer;
begin
  if new.status='cancelled' and old.status is distinct from 'cancelled' then
    for attendee in select profile_id from private.meetup_join_reservations where meetup_id=new.id and released_at is null order by profile_id loop
      perform pg_advisory_xact_lock(hashtextextended(attendee.profile_id::text||':meetup-joins',0));
    end loop;
    update private.meetup_join_reservations set released_at=now() where meetup_id=new.id and released_at is null;
    return new;
  end if;
  if date_trunc('month',old.starts_at at time zone 'Atlantic/Reykjavik')=date_trunc('month',new.starts_at at time zone 'Atlantic/Reykjavik') then return new; end if;
  if old.starts_at<=now() and exists(select 1 from private.meetup_join_reservations where meetup_id=new.id and released_at is null) then
    raise exception using errcode='23514',message='started_meetup_month_immutable';
  end if;
  destination:=date_trunc('month',new.starts_at at time zone 'Atlantic/Reykjavik')::date;
  for attendee in select profile_id from private.meetup_join_reservations where meetup_id=new.id and released_at is null order by profile_id loop
    perform pg_advisory_xact_lock(hashtextextended(attendee.profile_id::text||':meetup-joins',0));
    cap:=(private.tier_limits(private.member_tier(attendee.profile_id))->>'joins')::integer;
    if private.meetup_joins_used(attendee.profile_id,destination)>=cap then
      raise exception using errcode='23514',message='meetup_attendee_monthly_join_limit_reached';
    end if;
  end loop;
  update private.meetup_join_reservations set month_start=destination where meetup_id=new.id and released_at is null;
  return new;
end; $$;
create trigger meetups_move_join_allowances before update of starts_at,status on public.meetups for each row execute function private.move_meetup_join_allowances();
alter function private.entitlement_impl() rename to entitlement_before_join_allowance;
create function private.entitlement_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; used integer; cap integer;
begin
  result:=private.entitlement_before_join_allowance();
  cap:=(private.tier_limits(result->>'tier')->>'joins')::integer;
  used:=private.meetup_joins_used((select auth.uid()),date_trunc('month',now() at time zone 'Atlantic/Reykjavik')::date);
  return result||jsonb_build_object('joinsUsed',used,'joinsLimit',cap,'joinsRemaining',greatest(0,cap-used));
end; $$;
revoke all on function private.entitlement_before_join_allowance(),private.entitlement_impl(),private.meetup_joins_used(uuid,date),private.enforce_meetup_join_allowance(),private.move_meetup_join_allowances() from public,anon,authenticated,service_role;
grant execute on function private.entitlement_impl() to authenticated;

-- A small server projection provides confirmed amounts in discovery responses.
-- The finance document and check-in identities are never exposed to clients.
create table private.meetup_pool_summaries (
  meetup_id uuid primary key references public.meetups(id) on delete cascade,
  host_bps integer not null check(host_bps between 0 and 10000),
  split_locked boolean not null,
  total bigint not null check(total>=0),
  funded_total bigint not null check(funded_total>=0),
  paid_total bigint not null check(paid_total>=0),
  refunded_total bigint not null check(refunded_total>=0),
  settlement_outcome text check(settlement_outcome in ('paid_out','refunded')),
  checked_in jsonb not null default '{}'
);
alter table private.meetup_pool_summaries enable row level security;
revoke all on private.meetup_pool_summaries from public,anon,authenticated,service_role;
create function private.refresh_meetup_pool_summaries(p_state jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare event record; funded bigint; paid bigint; refunded bigint; settled boolean; outcome text;
begin
  for event in select key,value from jsonb_each(coalesce(p_state->'events','{}')) loop
    if not exists(select 1 from public.meetups where id::text=event.key) then continue; end if;
    settled:=coalesce((event.value->>'settled')::boolean,false);
    select coalesce(sum((c.value->>'amount')::bigint) filter(where not coalesce((c.value->>'reversed')::boolean,false)
      or c.value->>'refundReason' in ('cancelled','rejected','no_attendees')
      or (c.value->>'refundReason' is null and exists(select 1 from jsonb_array_elements(coalesce(p_state->'journal','[]')) tx where tx->>'id'='refund:'||(c.value->>'id') and tx->>'kind'='contribution_refund'))),0),
      coalesce(sum((c.value->>'amount')::bigint) filter(where coalesce((c.value->>'reversed')::boolean,false)
      and (c.value->>'refundReason' in ('cancelled','rejected','no_attendees') or (c.value->>'refundReason' is null and exists(select 1 from jsonb_array_elements(coalesce(p_state->'journal','[]')) tx where tx->>'id'='refund:'||(c.value->>'id') and tx->>'kind'='contribution_refund')))),0)
      into funded,refunded from jsonb_each(coalesce(p_state->'contributions','{}')) c where c.value->>'eventId'=event.key;
    select coalesce(sum(-(entry->>'amount')::bigint),0) into paid
      from jsonb_array_elements(coalesce(p_state->'journal','[]')) tx, lateral jsonb_array_elements(tx->'entries') entry
      where tx->>'kind'='event_settlement' and entry->>'account'='pool:'||event.key and (entry->>'amount')::bigint<0;
    paid:=coalesce((event.value->>'paidTotal')::bigint,paid);
    refunded:=coalesce((event.value->>'refundedTotal')::bigint,refunded);
    outcome:=coalesce(event.value->>'settlementOutcome',case when settled then case when paid>0 then 'paid_out' else 'refunded' end end);
    insert into private.meetup_pool_summaries(meetup_id,host_bps,split_locked,total,funded_total,paid_total,refunded_total,settlement_outcome,checked_in)
      values(event.key::uuid,coalesce((event.value->>'hostBps')::integer,2500),event.value->>'hostBps' is not null,
        coalesce((p_state->'balances'->>('pool:'||event.key))::bigint,0),funded,paid,refunded,outcome,coalesce(event.value->'checkedIn','{}'))
      on conflict(meetup_id) do update set host_bps=excluded.host_bps,split_locked=excluded.split_locked,total=excluded.total,
        funded_total=excluded.funded_total,paid_total=excluded.paid_total,refunded_total=excluded.refunded_total,
        settlement_outcome=excluded.settlement_outcome,checked_in=excluded.checked_in;
  end loop;
end; $$;
create function private.sync_meetup_pool_summaries() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform private.refresh_meetup_pool_summaries(new.state);
  return new;
end; $$;
create trigger finance_state_pool_summaries after insert or update of state on private.finance_state
for each row execute function private.sync_meetup_pool_summaries();
select private.refresh_meetup_pool_summaries(state) from private.finance_state;
create function private.meetup_pool_payload(p_meetup uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare m public.meetups; pool private.meetup_pool_summaries; participants integer; amount bigint; split integer; state text;
begin
  select * into m from public.meetups where id=p_meetup;
  select * into pool from private.meetup_pool_summaries where meetup_id=p_meetup;
  split:=coalesce(pool.host_bps,2500); amount:=coalesce(pool.total,0);
  if now()<m.starts_at then
    select count(*)::integer into participants from public.meetup_participations p
      where p.meetup_id=p_meetup and p.profile_id is distinct from m.host_id and p.profile_id is not null and p.status in ('joined','approved');
  else
    -- Attendance evidence survives a later RSVP change, as it does in settlement.
    select count(*)::integer into participants from jsonb_object_keys(coalesce(pool.checked_in,'{}')) attendee
      where attendee<>m.host_id::text;
  end if;
  state:=coalesce(pool.settlement_outcome,case when m.status='cancelled' or now()>=m.effective_end then 'awaiting_settlement'
    when now()>=m.starts_at then 'locked' else 'accepting' end);
  return jsonb_build_object('hostBps',split,'locked',coalesce(pool.split_locked,false),'total',amount,
    'fundedTotal',coalesce(pool.funded_total,0),'paidTotal',coalesce(pool.paid_total,0),'refundedTotal',coalesce(pool.refunded_total,0),
    'status',state,'eligibleParticipantCount',participants,'estimatedParticipantReward',
    case when participants>0 and state not in ('paid_out','refunded') then (amount-(amount*split/10000))/participants else null end);
end; $$;
-- Entry points already authorize event visibility before this private formatter.
alter function private.meetup_payload(uuid,uuid,boolean) rename to meetup_payload_before_pool;
create function private.meetup_payload(p_meetup_id uuid,p_viewer_id uuid,p_include_description boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  result:=private.meetup_payload_before_pool(p_meetup_id,p_viewer_id,p_include_description);
  return result||jsonb_build_object('pool',private.meetup_pool_payload(p_meetup_id));
end; $$;
revoke all on function private.refresh_meetup_pool_summaries(jsonb),private.sync_meetup_pool_summaries(),private.meetup_pool_payload(uuid),
  private.meetup_payload_before_pool(uuid,uuid,boolean),private.meetup_payload(uuid,uuid,boolean) from public,anon,authenticated,service_role;

create function private.finance_publish_context_impl(p_member uuid,p_meetup uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare m public.meetups;
begin
  perform private.require_service_role();
  select * into m from public.meetups where id=p_meetup and host_id=p_member and status in ('draft','published') and not is_explicit;
  if m.id is null then raise exception using errcode='42501',message='owned_draft_required'; end if;
  return jsonb_build_object('id',m.id,'hostId',m.host_id,'startsAt',m.starts_at,'endsAt',m.effective_end,'cancelled',false,
    'eligibleAttendees',coalesce((select jsonb_agg(profile_id) from public.meetup_participations where meetup_id=m.id and status in ('joined','approved')),'[]'::jsonb));
end; $$;
create function public.finance_publish_context(member_id uuid,meetup_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.finance_publish_context_impl(member_id,meetup_id); $$;

-- Money reservation and publication commit together. Any publication failure
-- rolls back both, so the existing draft remains recoverable without lost funds.
create function private.finance_publish_meetup_impl(p_member uuid,p_session uuid,p_meetup uuid,p_request uuid,p_revision bigint,p_state jsonb,p_recurrence jsonb,p_occurrences jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.meetups; current_state private.finance_state; request_key text:=p_member::text||':'||p_request::text;
  submitted jsonb; old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
  perform private.require_service_role();
  if not exists(select 1 from private.commerce_configuration where mode='sandbox') then raise exception 'finance_disabled'; end if;
  if not exists(select 1 from auth.sessions where id=p_session and user_id=p_member and (not_after is null or not_after>now())) then
    raise exception using errcode='42501',message='active_session_required'; end if;
  -- Global finance lock precedes event locks, matching financial account cleanup.
  select * into current_state from private.finance_state where id for update;
  select * into m from public.meetups where id=p_meetup and host_id=p_member and not is_explicit for update;
  if m.id is null then raise exception using errcode='42501',message='owned_draft_required'; end if;
  submitted:=p_state->'requests'->request_key;
  if m.status='published' and submitted is not null and current_state.state->'requests'->request_key=submitted
    and exists(select 1 from jsonb_each(coalesce(current_state.state->'contributions','{}')) c where c.value->>'eventId'=p_meetup::text
      and c.value->>'memberId'=p_member::text and c.value->>'id'=submitted->'result'->>'id') then return true; end if;
  if m.status<>'draft' then raise exception using errcode='55000',message='meetup_not_draft'; end if;
  if current_state.revision<>p_revision then return false; end if;
  if m.starts_at<=clock_timestamp() then raise exception 'pool_closed'; end if;
  if private.member_tier(p_member)='plebbi' then raise exception using errcode='42501',message='paid_sponsor_required'; end if;
  if submitted is null or not exists(select 1 from jsonb_each(coalesce(p_state->'contributions','{}')) c where c.value->>'eventId'=p_meetup::text
    and c.value->>'memberId'=p_member::text and not coalesce((c.value->>'reversed')::boolean,false)
    and c.value->>'id'=submitted->'result'->>'id') then raise exception 'self_sponsorship_required'; end if;
  if p_state->'events'->p_meetup::text->>'hostId' is distinct from p_member::text
    or (p_state->'events'->p_meetup::text->>'startsAt')::timestamptz is distinct from m.starts_at
    or (p_state->'events'->p_meetup::text->>'endsAt')::timestamptz is distinct from m.effective_end
    or coalesce((p_state->'events'->p_meetup::text->>'cancelled')::boolean,true) then raise exception 'event_context_changed'; end if;
  perform set_config('request.jwt.claim.sub',p_member::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_member,'session_id',p_session,'role','authenticated')::text,true);
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if not private.finance_save_impl(p_revision,p_state) then raise exception 'finance_revision_changed'; end if;
  if p_recurrence is null or p_recurrence='null'::jsonb then perform private.publish_meetup_impl(p_meetup);
  else perform private.publish_meetup_series_impl(p_meetup,p_recurrence,p_occurrences); end if;
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
  return true;
end; $$;
create function public.finance_publish_meetup(member_id uuid,session_id uuid,meetup_id uuid,request_id uuid,revision bigint,state jsonb,recurrence jsonb default null,occurrence_starts jsonb default null) returns boolean
language sql security invoker set search_path='' as $$
  select private.finance_publish_meetup_impl(member_id,session_id,meetup_id,request_id,revision,state,recurrence,occurrence_starts);
$$;
revoke all on function private.finance_publish_context_impl(uuid,uuid),public.finance_publish_context(uuid,uuid),
  private.finance_publish_meetup_impl(uuid,uuid,uuid,uuid,bigint,jsonb,jsonb,jsonb),public.finance_publish_meetup(uuid,uuid,uuid,uuid,bigint,jsonb,jsonb,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function private.finance_publish_context_impl(uuid,uuid),public.finance_publish_context(uuid,uuid),
  private.finance_publish_meetup_impl(uuid,uuid,uuid,uuid,bigint,jsonb,jsonb,jsonb),public.finance_publish_meetup(uuid,uuid,uuid,uuid,bigint,jsonb,jsonb,jsonb) to service_role;

-- Event commands bind the ledger CAS to the current locked event context. An
-- edit/cancellation/admission between quoting and saving cannot spend stale data.
create function private.finance_event_save_impl(p_member uuid,p_session uuid,p_meetup uuid,p_action text,p_revision bigint,p_state jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.meetups; current_revision bigint; current_state jsonb; snapshot jsonb; actual_attendees jsonb; submitted_attendees jsonb;
  old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true); saved boolean;
begin
  perform private.require_service_role();
  if not exists(select 1 from auth.sessions where id=p_session and user_id=p_member and (not_after is null or not_after>now())) then
    raise exception using errcode='42501',message='active_session_required'; end if;
  if p_action not in ('contribution_quote','contribute','pool_info','checkin','checkin_code','reverse') then raise exception 'invalid_event_action'; end if;
  select revision,state into current_revision,current_state from private.finance_state where id for update;
  if current_revision<>p_revision then return false; end if;
  select * into m from public.meetups where id=p_meetup and not is_explicit for update;
  if m.id is null then raise exception 'event_unavailable'; end if;
  if m.status='draft' and (m.host_id<>p_member or p_action not in ('contribution_quote','pool_info')) then raise exception 'event_unavailable'; end if;
  if p_action in ('contribute','checkin','checkin_code') and m.status<>'published' then raise exception 'event_unavailable'; end if;
  if p_action in ('contribution_quote','contribute') and private.member_tier(p_member)='plebbi' then
    raise exception using errcode='42501',message='paid_subscription_required'; end if;
  if p_action in ('contribution_quote','contribute','reverse') and m.starts_at<=clock_timestamp() then raise exception 'pool_closed'; end if;
  if p_action='reverse' and not exists(
    select 1 from jsonb_each(coalesce(current_state->'contributions','{}')) prior
    join lateral (select p_state->'contributions'->prior.key as value) proposed on true
    where prior.value->>'memberId'=p_member::text and prior.value->>'eventId'=p_meetup::text
      and not coalesce((prior.value->>'reversed')::boolean,false)
      and coalesce((proposed.value->>'reversed')::boolean,false)
      and proposed.value->>'refundReason'='reversed'
  ) then raise exception using errcode='42501',message='contribution_unavailable'; end if;
  snapshot:=p_state->'events'->p_meetup::text;
  select coalesce(jsonb_agg(profile_id::text order by profile_id::text),'[]') into actual_attendees
    from public.meetup_participations where meetup_id=p_meetup and status in ('joined','approved');
  select coalesce(jsonb_agg(value order by value),'[]') into submitted_attendees from jsonb_array_elements_text(coalesce(snapshot->'eligibleAttendees','[]'));
  if snapshot->>'hostId' is distinct from m.host_id::text
    or (snapshot->>'startsAt')::timestamptz is distinct from m.starts_at
    or (snapshot->>'endsAt')::timestamptz is distinct from m.effective_end
    or (snapshot->>'cancelled')::boolean is distinct from (m.status not in ('draft','published'))
    or actual_attendees is distinct from submitted_attendees then raise exception 'event_context_changed'; end if;
  perform set_config('request.jwt.claim.sub',p_member::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_member,'session_id',p_session,'role','authenticated')::text,true);
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if p_action<>'reverse' then perform private.get_meetup_impl(p_meetup); end if;
  saved:=private.finance_save_impl(p_revision,p_state);
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
  return saved;
end; $$;
create function public.finance_event_save(member_id uuid,session_id uuid,meetup_id uuid,command_action text,revision bigint,state jsonb) returns boolean
language sql security invoker set search_path='' as $$ select private.finance_event_save_impl(member_id,session_id,meetup_id,command_action,revision,state); $$;
revoke all on function private.finance_event_save_impl(uuid,uuid,uuid,text,bigint,jsonb),public.finance_event_save(uuid,uuid,uuid,text,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.finance_event_save_impl(uuid,uuid,uuid,text,bigint,jsonb),public.finance_event_save(uuid,uuid,uuid,text,bigint,jsonb) to service_role;
notify pgrst,'reload schema';


-- Keep the member's export complete as credit and withdrawable money separate.
alter function private.export_account_impl() rename to export_account_before_sponsorship_credit;
create function private.export_account_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); base jsonb; ledger jsonb; wallet jsonb;
begin
  if caller is null or not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  base:=private.export_account_before_sponsorship_credit();
  select state into ledger from private.finance_state where id;
  wallet:=coalesce(base->'wallet','{}')||jsonb_build_object(
    'withdrawableBalance',coalesce(ledger->'balances'->('wallet:'||caller::text),'0'::jsonb),
    'sponsorshipCredit',coalesce(ledger->'balances'->('sponsorship:'||caller::text),'0'::jsonb),
    'transactions',coalesce((select jsonb_agg(jsonb_build_object('id',tx->>'id','kind',tx->>'kind','at',tx->>'at',
      'amount',(select sum((entry->>'amount')::bigint) from jsonb_array_elements(tx->'entries') entry
        where entry->>'account' in ('wallet:'||caller::text,'sponsorship:'||caller::text))))
      from jsonb_array_elements(coalesce(ledger->'journal','[]')) tx
      where exists(select 1 from jsonb_array_elements(tx->'entries') entry where entry->>'account' in ('wallet:'||caller::text,'sponsorship:'||caller::text))),'[]'));
  return jsonb_set(base,'{wallet}',wallet);
end; $$;
revoke all on function private.export_account_before_sponsorship_credit(),private.export_account_impl() from public,anon,authenticated,service_role;
grant execute on function private.export_account_impl() to authenticated;
create or replace function public.export_account() returns jsonb language sql stable security invoker set search_path='' as $$select private.export_account_impl();$$;
create or replace function public.export_my_account() returns jsonb language sql stable security invoker set search_path='' as $$select private.export_account_impl();$$;
create or replace function public.get_my_entitlement() returns jsonb language sql stable security invoker set search_path='' as $$select private.entitlement_impl();$$;

-- Background settlement uses the same event/ledger lock order as contributions.
-- A stale worker snapshot asks the adapter to reload, never pays a cancelled or
-- rescheduled occurrence from data fetched before the transaction.
create function private.finance_settlement_save_impl(p_meetup uuid,p_revision bigint,p_state jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.meetups; previous private.finance_state; snapshot jsonb; actual_attendees jsonb; submitted_attendees jsonb;
begin
  perform private.require_service_role();
  select * into previous from private.finance_state where id for update;
  if previous.revision<>p_revision then return false; end if;
  snapshot:=p_state->'events'->p_meetup::text;
  select * into m from public.meetups where id=p_meetup for update;
  if m.id is null then
    -- Account deletion marks the immutable ledger event cancelled before removing it.
    if not coalesce((previous.state->'events'->p_meetup::text->>'cancelled')::boolean,false)
      or not coalesce((snapshot->>'cancelled')::boolean,false) then return false; end if;
  else
    if m.status='draft' then return false; end if;
    select coalesce(jsonb_agg(profile_id::text order by profile_id::text),'[]') into actual_attendees
      from public.meetup_participations where meetup_id=p_meetup and status in ('joined','approved');
    select coalesce(jsonb_agg(value order by value),'[]') into submitted_attendees
      from jsonb_array_elements_text(coalesce(snapshot->'eligibleAttendees','[]'));
    if snapshot->>'hostId' is distinct from m.host_id::text
      or (snapshot->>'startsAt')::timestamptz is distinct from m.starts_at
      or (snapshot->>'endsAt')::timestamptz is distinct from m.effective_end
      or (snapshot->>'cancelled')::boolean is distinct from (m.status<>'published')
      or actual_attendees is distinct from submitted_attendees then return false; end if;
  end if;
  return private.finance_save_impl(p_revision,p_state);
end; $$;
create function public.finance_settlement_save(meetup_id uuid,revision bigint,state jsonb) returns boolean
language sql security invoker set search_path='' as $$ select private.finance_settlement_save_impl(meetup_id,revision,state); $$;
revoke all on function private.finance_settlement_save_impl(uuid,bigint,jsonb),public.finance_settlement_save(uuid,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.finance_settlement_save_impl(uuid,bigint,jsonb),public.finance_settlement_save(uuid,bigint,jsonb) to service_role;
notify pgrst,'reload schema';


-- Verified billing facts can fund sponsorship credit only in the existing local
-- commerce sandbox. Production facts remain unfunded liabilities.
create function private.finance_billing_snapshot_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare body jsonb;
begin
  perform private.require_service_role();
  if not exists(select 1 from private.commerce_configuration where mode='sandbox')
    or not exists(select 1 from private.billing_configuration where id and enabled and environment='SANDBOX') then return null; end if;
  body:=jsonb_build_object('environment','SANDBOX',
    'members',coalesce((select jsonb_agg(jsonb_build_object('accountId',m.account_id,'tier',m.tier,'paidUntil',m.paid_until,
      'premiumMonths',private.billing_completed_months(m.account_id,'SANDBOX'),'needsReview',m.needs_review
        or p.moderation_status='banned' or (p.moderation_status='suspended' and p.suspended_until>now())
        or (u.banned_until is not null and u.banned_until>now())
        or exists(select 1 from private.media_restore_quarantine q where q.account_id=m.account_id)) order by m.account_id)
      from private.billing_members m join public.profiles p on p.id=m.account_id and p.deletion_requested_at is null
      join auth.users u on u.id=m.account_id where m.environment='SANDBOX'),'[]'::jsonb),
    'periods',coalesce((select jsonb_agg(jsonb_build_object('periodKey',period_key,'ownerId',owner_id,'tier',tier,'startsAt',starts_at,'endsAt',ends_at,
      'paid',paid,'refunded',refunded,'allowancePending',allowance_pending) order by period_key)
      from private.billing_periods where environment='SANDBOX'),'[]'::jsonb));
  return body||jsonb_build_object('fingerprint',encode(extensions.digest(body::text,'sha256'),'hex'));
end; $$;
create function public.finance_billing_snapshot() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.finance_billing_snapshot_impl(); $$;
create function private.finance_billing_save_impl(p_revision bigint,p_state jsonb,p_fingerprint text) returns boolean
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; current_revision bigint;
begin
  perform private.require_service_role();
  -- Keep environment/gate changes outside the verified funding transaction.
  perform 1 from private.billing_configuration where id for share;
  perform 1 from private.commerce_configuration for share;
  -- Provider apply takes ownership before period rows and never takes finance.
  -- Other financial paths do not take ownership after finance; deletion likewise
  -- does not take this ownership lock. Keep this order when adding new writers.
  perform pg_advisory_xact_lock(hashtextextended('SANDBOX:billing-ownership',0));
  select revision into current_revision from private.finance_state where id for update;
  if current_revision<>p_revision then return false; end if;
  snapshot:=private.finance_billing_snapshot_impl();
  if snapshot is null or snapshot->>'fingerprint' is distinct from p_fingerprint then return false; end if;
  return private.finance_save_impl(p_revision,p_state);
end; $$;
create function public.finance_billing_save(revision bigint,state jsonb,fingerprint text) returns boolean
language sql security invoker set search_path='' as $$ select private.finance_billing_save_impl(revision,state,fingerprint); $$;
revoke all on function private.finance_billing_snapshot_impl(),public.finance_billing_snapshot(),
  private.finance_billing_save_impl(bigint,jsonb,text),public.finance_billing_save(bigint,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function private.finance_billing_snapshot_impl(),public.finance_billing_snapshot(),
  private.finance_billing_save_impl(bigint,jsonb,text),public.finance_billing_save(bigint,jsonb,text) to service_role;
notify pgrst,'reload schema';


-- Quoted drafts are finance context only for their owner's creation flow.
-- They are not cancelled occurrences and must never be consumed by settlement.
create or replace function private.finance_event_context_impl(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare event public.meetups;
begin
  perform private.require_service_role();
  select * into event from public.meetups where id=p_id and not is_explicit and status<>'draft';
  if not found then raise exception 'event_unavailable'; end if;
  return jsonb_build_object('id',event.id,'hostId',event.host_id,'startsAt',event.starts_at,
    'endsAt',event.effective_end,'cancelled',event.status<>'published',
    'eligibleAttendees',coalesce((select jsonb_agg(profile_id) from public.meetup_participations where meetup_id=p_id and status in ('joined','approved')),'[]'::jsonb));
end; $$;

