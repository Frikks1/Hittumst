create table private.premium_profile_preferences (
 account_id uuid primary key references public.profiles(id) on delete cascade,
 effect boolean not null default false, badge boolean not null default false
);
alter table private.premium_profile_preferences enable row level security;
revoke all on private.premium_profile_preferences from public,anon,authenticated,service_role;
create function private.get_premium_profile_impl(p_profile uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare preferences private.premium_profile_preferences; premium boolean;
begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 if p_profile<>(select auth.uid()) and public.get_public_profile(p_profile) is null then raise exception using errcode='42501',message='profile_unavailable'; end if;
 select * into preferences from private.premium_profile_preferences where account_id=p_profile;
 premium:=private.member_tier(p_profile)='plebba_kongur';
 return jsonb_build_object('effect',premium and coalesce(preferences.effect,false),'badge',premium and coalesce(preferences.badge,false),
 'months',case when premium and coalesce(preferences.badge,false) then coalesce((select premium_months from private.member_subscriptions where account_id=p_profile),0) else 0 end);
end $$;
create function public.get_premium_profile(profile_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.get_premium_profile_impl(profile_id);$$;
create function private.set_premium_profile_impl(p_effect boolean,p_badge boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid());
begin
 if caller is null or not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 if (p_effect or p_badge) and private.member_tier(caller)<>'plebba_kongur' then raise exception 'premium_required'; end if;
 insert into private.premium_profile_preferences(account_id,effect,badge) values(caller,p_effect,p_badge)
 on conflict(account_id) do update set effect=excluded.effect,badge=excluded.badge;
 return private.get_premium_profile_impl(caller);
end $$;
create function public.set_premium_profile(effect boolean,badge boolean) returns jsonb language sql security invoker set search_path='' as $$select private.set_premium_profile_impl(effect,badge);$$;
revoke all on function private.get_premium_profile_impl(uuid),public.get_premium_profile(uuid),private.set_premium_profile_impl(boolean,boolean),public.set_premium_profile(boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function private.get_premium_profile_impl(uuid),public.get_premium_profile(uuid),private.set_premium_profile_impl(boolean,boolean),public.set_premium_profile(boolean,boolean) to authenticated;

alter function private.export_account_impl() rename to export_account_before_commerce_impl;
create function private.export_account_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); ledger jsonb; base jsonb;
begin
 if caller is null or not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 base:=private.export_account_before_commerce_impl();
 select state into ledger from private.finance_state where id;
 return base||jsonb_build_object(
 'subscription',(select to_jsonb(s)-'provider_updated_at' from private.member_subscriptions s where account_id=caller),
 'premiumProfile',(select to_jsonb(p) from private.premium_profile_preferences p where account_id=caller),
 'mediaUploads',coalesce((select jsonb_agg(to_jsonb(u)-'claim_id') from private.media_uploads u where owner_id=caller),'[]'),
 'wallet',jsonb_build_object('balance',coalesce(ledger->'balances'->('wallet:'||caller::text),'0'::jsonb),
 'payouts',coalesce((select jsonb_agg(value) from jsonb_each(coalesce(ledger->'payouts','{}')) where value->>'memberId'=caller::text),'[]'),
 'orders',coalesce((select jsonb_agg(value) from jsonb_each(coalesce(ledger->'orders','{}')) where value->>'memberId'=caller::text),'[]'),
 'contributions',coalesce((select jsonb_agg(value) from jsonb_each(coalesce(ledger->'contributions','{}')) where value->>'memberId'=caller::text),'[]'),
 'transactions',coalesce((select jsonb_agg(jsonb_build_object('id',tx->>'id','kind',tx->>'kind','at',tx->>'at','amount',(select sum((e->>'amount')::bigint) from jsonb_array_elements(tx->'entries') e where e->>'account'='wallet:'||caller::text))) from jsonb_array_elements(coalesce(ledger->'journal','[]')) tx where exists(select 1 from jsonb_array_elements(tx->'entries') e where e->>'account'='wallet:'||caller::text)),'[]')));
end $$;
revoke all on function private.export_account_impl(),private.export_account_before_commerce_impl() from public,anon,authenticated,service_role;
grant execute on function private.export_account_impl() to authenticated;
-- Rebind SQL wrapper dependencies after renaming the previous implementation.
create or replace function public.export_account() returns jsonb language sql stable security invoker set search_path='' as $$select private.export_account_impl();$$;
create or replace function public.export_my_account() returns jsonb language sql stable security invoker set search_path='' as $$select private.export_account_impl();$$;
