-- Money features retired by the owner on 3 November 2026.
-- Preserve historical records for audit/export/erasure; close all transaction paths.
update private.commerce_configuration set mode='disabled',subscriptions_enabled=false,money_enabled=false,shop_enabled=false;
alter table private.commerce_configuration add constraint money_features_removed
  check(mode='disabled' and not subscriptions_enabled and not money_enabled and not shop_enabled);
update private.billing_configuration set enabled=false;
alter table private.billing_configuration add constraint subscriptions_removed check(not enabled);

-- All members receive the same free allowances, independent of old receipts.
create or replace function private.member_tier(p_account uuid) returns text
language sql stable security definer set search_path='' as $$ select 'plebbi'::text; $$;
create or replace function private.tier_limits(p_tier text) returns jsonb
language sql immutable set search_path='' as $$
 select '{"albums":6,"photos":30,"videos":3,"occurrences":10,"joins":15,"hostBps":0}'::jsonb;
$$;
create or replace function private.entitlement_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); used integer; month_start timestamptz:=date_trunc('month',now() at time zone 'Atlantic/Reykjavik') at time zone 'Atlantic/Reykjavik';
begin
 if caller is null or not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 used:=private.meetup_joins_used(caller,month_start::date);
 return jsonb_build_object('tier','plebbi','paidUntil',null,'premiumMonths',0,
  'month',to_char(month_start at time zone 'Atlantic/Reykjavik','YYYY-MM'),
  'albumsUsed',(select count(*) from public.albums where owner_id=caller and deleted_at is null),
  'occurrencesUsed',(select count(*) from public.meetups where host_id=caller and published_at is not null and starts_at>=month_start and starts_at<month_start+interval '1 month' and not(status='cancelled' and cancelled_at<starts_at)),
  'joinsUsed',used,'joinsLimit',15,'joinsRemaining',greatest(0,15-used),
  'purchasesEnabled',false,'moneyEnabled',false,'sandbox',false);
end $$;

-- Existing and new events are free. Direct table writes cannot restore fees.
update public.meetups set admission_mode='free',price_minor=null,currency=null
 where admission_mode<>'free' or price_minor is not null or currency is not null;
alter table public.meetups add constraint free_events_only
 check(admission_mode='free' and price_minor is null and currency is null);
create or replace function private.set_meetup_host_fee(p_meetup_id uuid,p_input jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_input ? 'feeIsk' and p_input->'feeIsk' is distinct from '0'::jsonb then
  raise exception using errcode='22023',message='money_features_removed';
 end if;
end $$;
-- Remove the pool projection from all event payloads, including old events.
alter function private.meetup_payload(uuid,uuid,boolean) rename to meetup_payload_before_money_removal;
create function private.meetup_payload(p_meetup_id uuid,p_viewer_id uuid,p_include_description boolean default true)
returns jsonb language sql stable security definer set search_path='' as $$
 select (private.meetup_payload_before_money_removal(p_meetup_id,p_viewer_id,p_include_description)-'pool')
   || jsonb_build_object('feeIsk',0,'admissionMode','free','priceMinor',null,'currency',null);
$$;
revoke all on function private.meetup_payload(uuid,uuid,boolean),private.meetup_payload_before_money_removal(uuid,uuid,boolean) from public,anon,authenticated,service_role;

-- No paid queue priority or publicly displayed sponsor identity/history.
create or replace function private.community_sponsor_rank(p_meetup uuid,p_profile uuid) returns integer
language sql stable security definer set search_path='' as $$ select 1; $$;
create or replace function private.list_meetup_sponsors_impl(p_meetup_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$ select '[]'::jsonb; $$;
create or replace function private.get_premium_profile_impl(p_profile uuid) returns jsonb
language sql stable security definer set search_path='' as $$ select '{"effect":false,"badge":false,"months":0}'::jsonb; $$;

-- Close public AND private finance RPCs, including privileged service callers.
-- Keep billing erasure helpers available solely for removing historical provider data.
do $$ declare f record; begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and
   (p.proname like 'finance\_%' escape '\' or p.proname in
    ('set_sandbox_tier','set_sandbox_tier_impl','set_premium_profile','set_premium_profile_impl','billing_sync_access','billing_sync_access_impl'))
 loop execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',f.nspname,f.proname,f.args); end loop;
end $$;
