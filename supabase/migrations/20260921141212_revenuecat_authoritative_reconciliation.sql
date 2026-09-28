-- Provider subscription facts are isolated from the sandbox FinanceState and never mint money.
create table private.billing_configuration (
 id boolean primary key default true check(id),
 environment text check(environment in ('SANDBOX','PRODUCTION')),
 enabled boolean not null default false
);
insert into private.billing_configuration default values;
create table private.billing_jobs (
 id uuid primary key default gen_random_uuid(), environment text not null check(environment in ('SANDBOX','PRODUCTION')),
 context jsonb not null, status text not null default 'queued' check(status in ('queued','processing','retry','verified','review')),
 attempts integer not null default 0, claim_id uuid, lease_until timestamptz,
 next_attempt_at timestamptz not null default now(), created_at timestamptz not null default now(), finished_at timestamptz, last_error text
);
create index billing_jobs_pending on private.billing_jobs(next_attempt_at,created_at) where status in ('queued','retry','processing');
create table private.billing_receipts (
 environment text not null check(environment in ('SANDBOX','PRODUCTION','UNKNOWN')), event_id text not null,
 payload_hash text not null check(length(payload_hash)=64), event_type text not null,
 job_id uuid references private.billing_jobs(id), disposition text not null,
 received_at timestamptz not null default now(), primary key(environment,event_id)
);
create table private.billing_transfer_clocks (
 environment text not null,account_id uuid not null,event_ms bigint not null,primary key(environment,account_id)
);
create table private.billing_members (
 environment text not null check(environment in ('SANDBOX','PRODUCTION')),
 account_id uuid not null references public.profiles(id) on delete cascade,
 tier text not null check(tier in ('plebbi','flottari_plebbi','plebba_kongur')),
 paid_until timestamptz, provider_updated_at timestamptz not null,
 verified_at timestamptz not null default now(), needs_review boolean not null default false,
 primary key(environment,account_id)
);
create table private.billing_periods (
 environment text not null check(environment in ('SANDBOX','PRODUCTION')), period_key text not null check(length(period_key)=64),
 owner_id uuid, tier text not null check(tier in ('flottari_plebbi','plebba_kongur')),
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 paid boolean not null, refunded boolean not null, provider_updated_at timestamptz not null,
 allowance_pending integer not null default 0 check(allowance_pending>=0 and allowance_pending<=1000),
 primary key(environment,period_key)
);
create index billing_periods_owner on private.billing_periods(environment,owner_id,starts_at);
comment on table private.billing_periods is 'Verified provider periods and unfunded allowance liabilities only. Not balances, money lots, reserves, payable payouts or fulfilment. Provider acceptance/funding remains mandatory.';
do $$ declare t text; begin
 foreach t in array array['billing_configuration','billing_jobs','billing_receipts','billing_transfer_clocks','billing_members','billing_periods'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create function private.billing_completed_months(p_account uuid,p_environment text) returns integer
language plpgsql stable security definer set search_path='' as $$
declare total integer:=0; last_end timestamptz:='-infinity'; period record;
begin
 for period in select starts_at,ends_at from private.billing_periods where environment=p_environment and owner_id=p_account
   and tier='plebba_kongur' and paid and not refunded and ends_at<=now() order by starts_at,ends_at loop
  if period.starts_at>=last_end and period.ends_at>=period.starts_at+interval '1 month' then total:=total+1; last_end:=period.ends_at; end if;
 end loop;
 return total;
end; $$;
revoke all on function private.billing_completed_months(uuid,text) from public,anon,authenticated,service_role;

create or replace function private.member_tier(p_account uuid) returns text
language sql stable security definer set search_path='' as $$
 select coalesce((select case when s.paid_until>now() and not s.needs_review then s.tier else 'plebbi' end from private.billing_members s join private.billing_configuration c on c.environment=s.environment
   where c.id and c.enabled and s.account_id=p_account),
   (select s.tier from private.member_subscriptions s where s.account_id=p_account and s.paid_until>now()
    and s.source='sandbox' and exists(select 1 from private.commerce_configuration c where c.mode='sandbox')),'plebbi');
$$;
create or replace function private.entitlement_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); subscription private.member_subscriptions; live private.billing_members;
 month_start timestamptz:=date_trunc('month',now() at time zone 'Atlantic/Reykjavik') at time zone 'Atlantic/Reykjavik';
begin
 if caller is null or not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 select s.* into live from private.billing_members s join private.billing_configuration c on c.environment=s.environment where c.enabled and c.id and s.account_id=caller;
 select * into subscription from private.member_subscriptions where account_id=caller;
 return jsonb_build_object('tier',private.member_tier(caller),'paidUntil',case when live.account_id is not null then live.paid_until else subscription.paid_until end,
  'premiumMonths',case when live.account_id is not null then private.billing_completed_months(caller,live.environment) else coalesce(subscription.premium_months,0) end,
  'month',to_char(month_start at time zone 'Atlantic/Reykjavik','YYYY-MM'),
  'albumsUsed',(select count(*) from public.albums where owner_id=caller and deleted_at is null),
  'occurrencesUsed',(select count(*) from public.meetups where host_id=caller and published_at is not null and starts_at>=month_start and starts_at<month_start+interval '1 month' and not(status='cancelled' and cancelled_at<starts_at)),
  'purchasesEnabled',false,'moneyEnabled',false,'sandbox',case when live.account_id is not null then live.environment='SANDBOX' else (select mode='sandbox' from private.commerce_configuration where id) end);
end; $$;

create function private.billing_sync_access_impl(p_enqueue boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); config private.billing_configuration; job private.billing_jobs;
begin
 if caller is null or not private.has_current_session() or not private.account_is_active() or not private.current_user_is_ready(false) then
  raise exception using errcode='42501',message='billing_authentication_required'; end if;
 select * into config from private.billing_configuration where id;
 if not config.enabled or config.environment is null then return jsonb_build_object('accountId',caller,'configured',false,'purchaseAllowed',false,'reason','billing_unavailable'); end if;
 if p_enqueue then
  perform private.consume_write_quota('billing_sync',6,interval '1 minute');
  perform pg_advisory_xact_lock(hashtextextended(caller::text||':billing-sync',0));
  select * into job from private.billing_jobs where environment=config.environment and status in ('queued','processing','retry')
    and context->'identities' @> jsonb_build_array(caller::text) order by created_at desc limit 1;
  if job.id is null then insert into private.billing_jobs(environment,context) values(config.environment,
   jsonb_build_object('identities',jsonb_build_array(caller),'transferFrom','[]'::jsonb,'transferTo','[]'::jsonb,'source','sync')) returning * into job; end if;
 end if;
 return jsonb_build_object('accountId',caller,'configured',true,'environment',config.environment,'jobId',job.id,
  'status',case when job.status='processing' then 'processing' else 'queued' end,
  'purchaseAllowed',false,'reason','financial_provider_approval_required');
end; $$;
create function public.billing_sync_access(p_enqueue boolean default false) returns jsonb
language sql security invoker set search_path='' as $$select private.billing_sync_access_impl(p_enqueue);$$;
revoke all on function private.billing_sync_access_impl(boolean),public.billing_sync_access(boolean) from public,anon,authenticated,service_role;
grant execute on function private.billing_sync_access_impl(boolean),public.billing_sync_access(boolean) to authenticated;

create function private.billing_service_impl(p_action text,p_input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare config private.billing_configuration; receipt private.billing_receipts; job private.billing_jobs; previous private.billing_periods;
 env text; event_env text; v_hash text; v_job uuid; snapshot jsonb; period jsonb; account uuid; current_tier text; current_until timestamptz;
 updated timestamptz; owner uuid; allowance integer; granted integer; period_start timestamptz; period_end timestamptz;
 review_needed boolean:=false; member_review boolean; eligible boolean; transfer_allowed boolean; transfer_current boolean; existing_count integer;
begin
 select * into config from private.billing_configuration where id;
 env:=p_input->>'environment';
 if not config.enabled or config.environment is null or env is distinct from config.environment then
  raise exception using errcode='55000',message='billing_environment_unavailable'; end if;
 if p_action='receipt' then
  event_env:=coalesce(p_input->>'eventEnvironment','UNKNOWN'); v_hash:=p_input->>'hash';
  if length(p_input->>'eventId') not between 1 and 200 or length(v_hash)<>64 or event_env not in ('SANDBOX','PRODUCTION','UNKNOWN') then raise exception 'billing_receipt_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(event_env||':'||(p_input->>'eventId'),0));
  select * into receipt from private.billing_receipts where environment=event_env and event_id=p_input->>'eventId';
  if found then
   if receipt.payload_hash<>v_hash then raise exception using errcode='23505',message='billing_receipt_conflict'; end if;
   return jsonb_build_object('duplicate',true,'jobId',receipt.job_id,'disposition',receipt.disposition);
  end if;
  if event_env<>'UNKNOWN' and event_env<>env then
   insert into private.billing_receipts(environment,event_id,payload_hash,event_type,disposition) values(event_env,p_input->>'eventId',v_hash,p_input->>'eventType','ignored_environment');
   return jsonb_build_object('disposition','ignored_environment');
  end if;
  if p_input->>'eventType'='TEST' or jsonb_array_length(p_input->'context'->'identities')=0 then
   insert into private.billing_receipts(environment,event_id,payload_hash,event_type,disposition) values(event_env,p_input->>'eventId',v_hash,p_input->>'eventType','no_member_identity');
   return jsonb_build_object('disposition','no_member_identity');
  end if;
  if p_input->>'eventType'='TRANSFER' then
   if (p_input->'context'->>'eventTimestampMs') is null then raise exception 'billing_transfer_timestamp_required'; end if;
   insert into private.billing_transfer_clocks(environment,account_id,event_ms)
    select env,(value#>>'{}')::uuid,(p_input->'context'->>'eventTimestampMs')::bigint from jsonb_array_elements(p_input->'context'->'identities')
    on conflict(environment,account_id) do update set event_ms=greatest(private.billing_transfer_clocks.event_ms,excluded.event_ms);
  end if;
  insert into private.billing_jobs(environment,context) values(env,p_input->'context') returning id into v_job;
  insert into private.billing_receipts(environment,event_id,payload_hash,event_type,job_id,disposition) values(event_env,p_input->>'eventId',v_hash,p_input->>'eventType',v_job,'queued');
  return jsonb_build_object('disposition','queued','jobId',v_job,'duplicate',false);
 elsif p_action='claim' then
  -- Catch missed provider deliveries without relying on a client launch. Never query deleted members.
  if p_input->>'jobId' is null then
   perform pg_advisory_xact_lock(hashtextextended(env||':billing-sweep',0));
   insert into private.billing_jobs(environment,context)
    select env,jsonb_build_object('identities',jsonb_build_array(m.account_id),'transferFrom','[]'::jsonb,'transferTo','[]'::jsonb,'source','sweep')
    from private.billing_members m join public.profiles p on p.id=m.account_id
    where m.environment=env and m.verified_at<now()-interval '6 hours' and p.deletion_requested_at is null
     and not exists(select 1 from private.billing_jobs j where j.environment=env and j.status in ('queued','processing','retry') and j.context->'identities' @> jsonb_build_array(m.account_id::text))
    order by m.verified_at limit 25;
  end if;
  select * into job from private.billing_jobs where environment=env
   and (p_input->>'jobId' is null or id=(p_input->>'jobId')::uuid)
   and ((status in ('queued','retry') and next_attempt_at<=now()) or (status='processing' and lease_until<now()))
   order by created_at for update skip locked limit 1;
  if job.id is null then return 'null'::jsonb; end if;
  update private.billing_jobs set status='processing',claim_id=(p_input->>'claimId')::uuid,lease_until=now()+interval '2 minutes',attempts=attempts+1 where id=job.id returning * into job;
  job.context:=jsonb_set(job.context,'{identities}',coalesce((select jsonb_agg(value) from jsonb_array_elements(job.context->'identities') where exists(select 1 from public.profiles p where p.id::text=value#>>'{}' and p.deletion_requested_at is null)),'[]'::jsonb));
  update private.billing_jobs set context=job.context where id=job.id;
  return jsonb_build_object('id',job.id,'claimId',job.claim_id,'environment',job.environment,'context',job.context);
 elsif p_action='renew' then
  update private.billing_jobs set lease_until=now()+interval '2 minutes' where id=(p_input->>'jobId')::uuid and environment=env and claim_id=(p_input->>'claimId')::uuid and status='processing' and lease_until>now();
  return to_jsonb(found);
 elsif p_action='status' then
  return coalesce((select to_jsonb(status) from private.billing_jobs where id=(p_input->>'jobId')::uuid and environment=env),'null'::jsonb);
 elsif p_action='retry' then
  update private.billing_jobs set status='retry',claim_id=null,lease_until=null,last_error='provider_reconciliation_pending',
   next_attempt_at=now()+make_interval(secs=>least(3600,30*(2^least(attempts,7))::integer))
   where id=(p_input->>'jobId')::uuid and environment=env and claim_id=(p_input->>'claimId')::uuid and status='processing';
  return 'true'::jsonb;
 elsif p_action='apply' then
  select * into job from private.billing_jobs where id=(p_input->>'jobId')::uuid and environment=env for update;
  if job.id is null or job.status<>'processing' or job.claim_id is distinct from (p_input->>'claimId')::uuid or job.lease_until<now() then return 'false'::jsonb; end if;
  if jsonb_array_length(p_input->'snapshots')<>jsonb_array_length(job.context->'identities') or (select count(distinct value->>'accountId') from jsonb_array_elements(p_input->'snapshots'))<>jsonb_array_length(job.context->'identities') then raise exception 'billing_snapshot_incomplete'; end if;
  -- Serialize period ownership across sync/webhook workers; a transaction can belong to only one account.
  perform pg_advisory_xact_lock(hashtextextended(env||':billing-ownership',0));
  transfer_current:=coalesce(job.context->>'eventType'='TRANSFER',false) and coalesce((job.context->>'eventTimestampMs')::bigint,0)>0
   and not exists(select 1 from private.billing_transfer_clocks c where c.environment=env and job.context->'identities' @> jsonb_build_array(c.account_id::text) and c.event_ms>(job.context->>'eventTimestampMs')::bigint);
  for snapshot in select value from jsonb_array_elements(p_input->'snapshots') loop
   account:=(snapshot->>'accountId')::uuid;
   if not(job.context->'identities' @> jsonb_build_array(account::text)) then raise exception 'billing_snapshot_identity_mismatch'; end if;
   if not exists(select 1 from public.profiles where id=account and deletion_requested_at is null) then continue; end if;
   updated:=(snapshot->>'providerUpdatedAt')::timestamptz;
   if updated>now()+interval '5 minutes' or updated<now()-interval '10 minutes' then raise exception 'billing_snapshot_stale'; end if;
   if exists(select 1 from private.billing_members where environment=env and account_id=account and provider_updated_at>updated) then continue; end if;
   current_tier:='plebbi';current_until:=null;member_review:=coalesce((snapshot->>'needsReview')::boolean,false);
   for period in select value from jsonb_array_elements(snapshot->'periods') loop
    if transfer_current and jsonb_array_length(job.context->'transferTo')=1 and job.context->'transferFrom' @> jsonb_build_array(account::text)
      and not(job.context->'transferTo' @> jsonb_build_array(account::text))
      and exists(select 1 from jsonb_array_elements(p_input->'snapshots') s,jsonb_array_elements(s->'periods') p
       where job.context->'transferTo' @> jsonb_build_array(s->>'accountId') and p->>'key'=period->>'key' and (p->>'active')::boolean) then continue;end if;
    period_start:=(period->>'startsAt')::timestamptz;period_end:=(period->>'endsAt')::timestamptz;
    if period_end<=period_start or period->>'tier' not in ('flottari_plebbi','plebba_kongur') then raise exception 'billing_period_invalid'; end if;
    select * into previous from private.billing_periods where environment=env and period_key=period->>'key' for update;
    owner:=previous.owner_id;
    transfer_allowed:=transfer_current and coalesce((period->>'active')::boolean,false) and jsonb_array_length(job.context->'transferTo')=1 and job.context->'transferTo' @> jsonb_build_array(account::text)
     and (previous.owner_id is null or job.context->'transferFrom' @> jsonb_build_array(previous.owner_id::text));
    if previous.period_key is null and not transfer_allowed and (select count(*) from jsonb_array_elements(p_input->'snapshots') s where exists(select 1 from jsonb_array_elements(s->'periods') p where p->>'key'=period->>'key'))>1 then member_review:=true;continue;end if;
    if previous.period_key is null then owner:=account;
    elsif owner is distinct from account and transfer_allowed then owner:=account;
    elsif owner is distinct from account then member_review:=true;continue; end if;
    if previous.provider_updated_at>updated then continue; end if;
    allowance:=case period->>'tier' when 'plebba_kongur' then 1000 else 500 end;
    granted:=coalesce(previous.allowance_pending,0);
    if coalesce((period->>'refunded')::boolean,false) then granted:=0;
    elsif coalesce((period->>'paid')::boolean,false) then
     select greatest(granted,allowance-coalesce(sum(allowance_pending),0))::integer into granted from private.billing_periods
      where environment=env and owner_id=account and period_key<>period->>'key' and not refunded and starts_at<period_end and ends_at>period_start;
    end if;
    insert into private.billing_periods(environment,period_key,owner_id,tier,starts_at,ends_at,paid,refunded,provider_updated_at,allowance_pending)
     values(env,period->>'key',owner,period->>'tier',period_start,period_end,coalesce((period->>'paid')::boolean,false),coalesce((period->>'refunded')::boolean,false),updated,greatest(0,granted))
     on conflict(environment,period_key) do update set owner_id=excluded.owner_id,tier=excluded.tier,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
       paid=private.billing_periods.paid or excluded.paid,refunded=excluded.refunded,provider_updated_at=excluded.provider_updated_at,allowance_pending=excluded.allowance_pending;
    if previous.owner_id is not null and previous.owner_id<>owner then
     update private.billing_members set tier='plebbi',paid_until=null,needs_review=true where environment=env and account_id=previous.owner_id;
    end if;
    eligible:=coalesce((period->>'active')::boolean,false) and not coalesce((period->>'refunded')::boolean,false);
    if eligible and (current_tier='plebbi' or period->>'tier'='plebba_kongur' or current_tier=period->>'tier') then
     if current_tier<>period->>'tier' then current_until:=null;end if;
     current_tier:=period->>'tier';current_until:=greatest(current_until,(period->>'accessUntil')::timestamptz);
    end if;
   end loop;
   insert into private.billing_members(environment,account_id,tier,paid_until,provider_updated_at,needs_review)
    values(env,account,current_tier,current_until,updated,member_review)
    on conflict(environment,account_id) do update set tier=excluded.tier,paid_until=excluded.paid_until,provider_updated_at=excluded.provider_updated_at,verified_at=now(),needs_review=excluded.needs_review;
   review_needed:=review_needed or member_review;
  end loop;
  update private.billing_jobs set status=case when review_needed then 'review' else 'verified' end,finished_at=now(),claim_id=null,lease_until=null,
   last_error=case when review_needed then 'ambiguous_provider_ownership' else null end where id=job.id;
  if not review_needed then
   update private.billing_jobs set status='verified',last_error=null,finished_at=now() where environment=env and status='review'
    and created_at<=job.created_at and job.context->'identities' @> context->'identities';
  end if;
  return jsonb_build_object('status',case when review_needed then 'review' else 'verified' end);
 end if;
 raise exception using errcode='22023',message='billing_action_invalid';
end; $$;
create function public.billing_service(p_action text,p_input jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$select private.billing_service_impl(p_action,p_input);$$;
revoke all on function private.billing_service_impl(text,jsonb),public.billing_service(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.billing_service_impl(text,jsonb),public.billing_service(text,jsonb) to service_role;




