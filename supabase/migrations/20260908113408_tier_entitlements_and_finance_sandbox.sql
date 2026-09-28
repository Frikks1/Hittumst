-- Entitlements are authoritative server data, never JWT/user-editable profile data.
create table private.commerce_configuration (
  id boolean primary key default true check(id),
  mode text not null default 'disabled' check(mode in ('disabled','sandbox')),
  subscriptions_enabled boolean not null default false,
  money_enabled boolean not null default false,
  shop_enabled boolean not null default false,
  category_approvals jsonb not null default '{}'
);
insert into private.commerce_configuration(id) values(true);
create table private.member_subscriptions (
  account_id uuid primary key references public.profiles(id) on delete cascade,
  tier text not null check(tier in ('plebbi','flottari_plebbi','plebba_kongur')),
  paid_until timestamptz,
  premium_months integer not null default 0 check(premium_months >= 0),
  source text not null check(source in ('sandbox','store')),
  provider_updated_at timestamptz not null default now()
);
create table private.subscription_receipts (
  event_id text primary key,
  account_id uuid not null,
  received_at timestamptz not null default now(),
  payload_hash text not null,
  environment text not null check(environment in ('SANDBOX','PRODUCTION'))
);
create table private.finance_state (
  id boolean primary key default true check(id),
  revision bigint not null default 0,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
insert into private.finance_state(id) values(true);
create table private.finance_journal (
  revision bigint primary key,
  previous_hash text not null,
  state_hash text not null,
  created_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['commerce_configuration','member_subscriptions','subscription_receipts','finance_state','finance_journal'] loop
    execute format('alter table private.%I enable row level security',t);
    execute format('revoke all on private.%I from public, anon, authenticated, service_role',t);
  end loop;
end $$;

create function private.member_tier(p_account uuid) returns text
language sql stable security definer set search_path='' as $$
  select coalesce((select s.tier from private.member_subscriptions s
    where s.account_id=p_account and s.paid_until>now()
      and s.source='sandbox' and exists(select 1 from private.commerce_configuration c where c.mode='sandbox')),'plebbi');
$$;
create function private.tier_limits(p_tier text) returns jsonb
language sql immutable set search_path='' as $$
  select case p_tier
    when 'plebba_kongur' then '{"albums":6,"photos":30,"videos":3,"occurrences":10,"hostBps":2500}'::jsonb
    when 'flottari_plebbi' then '{"albums":3,"photos":10,"videos":2,"occurrences":5,"hostBps":1500}'::jsonb
    else '{"albums":1,"photos":10,"videos":1,"occurrences":1,"hostBps":500}'::jsonb end;
$$;
create function private.entitlement_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); subscription private.member_subscriptions; month_start timestamptz:=date_trunc('month',now() at time zone 'Atlantic/Reykjavik') at time zone 'Atlantic/Reykjavik';
begin
  if caller is null or not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  select * into subscription from private.member_subscriptions where account_id=caller;
  return jsonb_build_object('tier',private.member_tier(caller),'paidUntil',subscription.paid_until,
    'premiumMonths',coalesce(subscription.premium_months,0),'month',to_char(month_start at time zone 'Atlantic/Reykjavik','YYYY-MM'),
    'albumsUsed',(select count(*) from public.albums where owner_id=caller and deleted_at is null),
    'occurrencesUsed',(select count(*) from public.meetups where host_id=caller and published_at is not null and starts_at>=month_start and starts_at<month_start+interval '1 month' and not(status='cancelled' and cancelled_at<starts_at)),
    'purchasesEnabled',false,'moneyEnabled',false,'sandbox',(select mode='sandbox' from private.commerce_configuration where id));
end $$;
create function public.get_my_entitlement() returns jsonb language sql stable security invoker set search_path='' as $$ select private.entitlement_impl(); $$;
create function private.set_sandbox_tier_impl(p_tier text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid());
begin
  if caller is null or not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if not exists(select 1 from private.commerce_configuration where mode='sandbox') then raise exception using errcode='42501',message='sandbox_disabled'; end if;
  if p_tier not in ('plebbi','flottari_plebbi','plebba_kongur') then raise exception 'invalid_tier'; end if;
  insert into private.member_subscriptions(account_id,tier,paid_until,source) values(caller,p_tier,now()+interval '1 month','sandbox')
    on conflict(account_id) do update set tier=excluded.tier,paid_until=excluded.paid_until,source='sandbox';
  return private.entitlement_impl();
end $$;
create function public.set_sandbox_tier(tier text) returns jsonb language sql security invoker set search_path='' as $$ select private.set_sandbox_tier_impl(tier); $$;

-- Locks cover the owner, not just one album: parallel uploads cannot bypass caps.
alter table public.album_items drop constraint album_items_position_check;
alter table public.album_items add constraint album_items_position_check check(position between 1 and 33);
create or replace function private.validate_album() returns trigger
language plpgsql security definer set search_path='' as $$
declare limits jsonb;
begin
  new.name:=btrim(new.name);
  if tg_op='UPDATE' and new.owner_id<>old.owner_id then raise exception 'album_owner_immutable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text||':tier',0));
  limits:=private.tier_limits(private.member_tier(new.owner_id));
  if new.deleted_at is null and (tg_op='INSERT' or old.deleted_at is not null) and
    (select count(*) from public.albums where owner_id=new.owner_id and deleted_at is null and id<>new.id)>=(limits->>'albums')::int then
    raise exception using errcode='23514',message='album_limit_reached';
  end if;
  return new;
end $$;
create or replace function private.validate_album_item() returns trigger
language plpgsql security definer set search_path='' as $$
declare album_owner uuid; limits jsonb; increasing boolean;
begin
  select owner_id into album_owner from public.albums where id=new.album_id and deleted_at is null;
  if album_owner is null or album_owner<>new.owner_id then raise exception using errcode='42501',message='album_owner_mismatch'; end if;
  if tg_op='UPDATE' and (new.owner_id<>old.owner_id or new.album_id<>old.album_id or new.media_type<>old.media_type or new.storage_path<>old.storage_path) then raise exception 'album_item_identity_immutable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(album_owner::text||':tier',0));
  limits:=private.tier_limits(private.member_tier(album_owner));
  increasing:=new.deleted_at is null and (tg_op='INSERT' or old.deleted_at is not null);
  if increasing and (select count(*) from public.albums where owner_id=album_owner and deleted_at is null)>(limits->>'albums')::int then raise exception using errcode='23514',message='album_downgrade_limit'; end if;
  if increasing and (select count(*) from public.album_items where album_id=new.album_id and media_type=new.media_type and deleted_at is null and id<>new.id)>=
    (limits->>case when new.media_type='image' then 'photos' else 'videos' end)::int then
    raise exception using errcode='23514',message=case when new.media_type='image' then 'album_photo_limit_reached' else 'album_video_limit_reached' end;
  end if;
  return new;
end $$;

create function private.enforce_hosting_tier() returns trigger
language plpgsql security definer set search_path='' as $$
declare month_start timestamptz; cap integer;
begin
  if new.host_id is null or new.status<>'published' then return new; end if;
  if tg_op='UPDATE' and old.status='published' and old.host_id=new.host_id and old.published_at is not null and date_trunc('month',old.starts_at at time zone 'Atlantic/Reykjavik')=date_trunc('month',new.starts_at at time zone 'Atlantic/Reykjavik') then return new; end if;
  -- Administrative migration/backfill bypass is not available to authenticated callers.
  if (select auth.uid()) is null and current_setting('role',true) in ('none','postgres') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.host_id::text||':tier',0));
  month_start:=date_trunc('month',new.starts_at at time zone 'Atlantic/Reykjavik') at time zone 'Atlantic/Reykjavik';
  cap:=(private.tier_limits(private.member_tier(new.host_id))->>'occurrences')::int;
  if (select count(*) from public.meetups where host_id=new.host_id and id<>new.id and published_at is not null
    and starts_at>=month_start and starts_at<month_start+interval '1 month' and not(status='cancelled' and cancelled_at<starts_at))>=cap then
    raise exception using errcode='23514',message='meetup_monthly_limit_reached';
  end if;
  return new;
end $$;
create trigger meetups_tier_limit before insert or update of status,starts_at on public.meetups for each row execute function private.enforce_hosting_tier();

-- The sandbox service is the only writer. No financial tables are exposed to clients.
create function private.finance_load_impl() returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('revision',s.revision,'state',s.state,'mode',c.mode)
  from private.finance_state s cross join private.commerce_configuration c;
$$;
create function public.finance_load() returns jsonb language sql security invoker set search_path='' as $$ select private.finance_load_impl(); $$;
create function private.finance_save_impl(p_revision bigint,p_state jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare previous private.finance_state; item record; tx jsonb; entry jsonb; actual jsonb:='{}'; amount bigint; balance bigint;
begin
  if not exists(select 1 from private.commerce_configuration where mode='sandbox') then raise exception 'finance_disabled'; end if;
  if jsonb_typeof(p_state)<>'object' or p_state->>'environment'<>'sandbox' then raise exception 'invalid_finance_state'; end if;
  select * into previous from private.finance_state where id for update;
  if previous.revision<>p_revision then return false; end if;
  if jsonb_typeof(p_state->'journal') is distinct from 'array' or jsonb_typeof(p_state->'balances') is distinct from 'object' then raise exception 'invalid_ledger'; end if;
  -- Existing financial history is immutable, even to the service adapter.
  for item in select value,ordinality from jsonb_array_elements(coalesce(previous.state->'journal','[]')) with ordinality loop
    if p_state->'journal'->(item.ordinality::int-1) is distinct from item.value then raise exception 'ledger_history_immutable'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_state->'journal'))<>(select count(distinct value->>'id') from jsonb_array_elements(p_state->'journal')) then raise exception 'duplicate_ledger_id'; end if;
  for tx in select value from jsonb_array_elements(p_state->'journal') loop
    if (select sum((value->>'amount')::bigint) from jsonb_array_elements(tx->'entries'))<>0 then raise exception 'unbalanced_ledger'; end if;
    for entry in select value from jsonb_array_elements(tx->'entries') loop
      amount:=(entry->>'amount')::bigint;
      balance:=coalesce((actual->>(entry->>'account'))::bigint,0)+amount;
      if abs(balance)>9007199254740991 or (entry->>'account' not like 'external:%' and balance<0) then raise exception 'invalid_ledger_balance'; end if;
      actual:=jsonb_set(actual,array[entry->>'account'],to_jsonb(balance));
    end loop;
  end loop;
  if actual is distinct from p_state->'balances' then raise exception 'balance_drift'; end if;
  for item in select key,value from jsonb_each(p_state->'members') loop
    insert into private.member_subscriptions(account_id,tier,paid_until,premium_months,source)
    values(item.key::uuid,item.value->>'tier',(item.value->>'paidUntil')::timestamptz,(item.value->>'premiumMonths')::integer,'sandbox')
    on conflict(account_id) do update set tier=excluded.tier,paid_until=excluded.paid_until,premium_months=excluded.premium_months,source='sandbox';
  end loop;
  insert into private.finance_journal(revision,previous_hash,state_hash)
    values(p_revision+1,encode(extensions.digest(previous.state::text,'sha256'),'hex'),encode(extensions.digest(p_state::text,'sha256'),'hex'));
  update private.finance_state set revision=p_revision+1,state=p_state,updated_at=now() where id;
  return true;
end $$;
create function public.finance_save(revision bigint,state jsonb) returns boolean language sql security invoker set search_path='' as $$ select private.finance_save_impl(revision,state); $$;

revoke all on function private.member_tier(uuid),private.tier_limits(text),private.entitlement_impl(),private.set_sandbox_tier_impl(text),private.enforce_hosting_tier(),private.validate_album(),private.validate_album_item(),private.finance_load_impl(),private.finance_save_impl(bigint,jsonb),public.get_my_entitlement(),public.set_sandbox_tier(text),public.finance_load(),public.finance_save(bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.entitlement_impl(),private.set_sandbox_tier_impl(text),public.get_my_entitlement(),public.set_sandbox_tier(text) to authenticated;
grant execute on function private.finance_load_impl(),private.finance_save_impl(bigint,jsonb),public.finance_load(),public.finance_save(bigint,jsonb) to service_role;
