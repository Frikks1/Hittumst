-- Refresh tokens are encrypted outside Postgres and never exposed to members.
create table private.apple_revocation_tokens (
  account_id uuid primary key references auth.users(id) on delete cascade,
  apple_subject text not null,
  client_id text not null,
  sealed_token text not null check (length(sealed_token) between 30 and 24000),
  updated_at timestamptz not null default now()
);
alter table private.apple_revocation_tokens enable row level security;
revoke all on private.apple_revocation_tokens from public, anon, authenticated, service_role;

create function private.apple_token_store_impl(p_account uuid, p_subject text, p_client text, p_token text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from auth.identities where user_id=p_account and provider='apple' and identity_data->>'sub'=p_subject)
    then raise exception using errcode='42501',message='apple_identity_mismatch'; end if;
  insert into private.apple_revocation_tokens(account_id,apple_subject,client_id,sealed_token)
    values(p_account,p_subject,p_client,p_token)
    on conflict(account_id) do update set apple_subject=excluded.apple_subject,client_id=excluded.client_id,sealed_token=excluded.sealed_token,updated_at=now();
end $$;
create function public.apple_token_store(account_id uuid, apple_subject text, client_id text, sealed_token text)
returns void language sql security invoker set search_path='' as $$ select private.apple_token_store_impl(account_id,apple_subject,client_id,sealed_token); $$;

create function private.apple_token_get_impl(p_account uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('requiresRevocation',exists(select 1 from auth.identities where user_id=p_account and provider='apple'),
    'token',(select jsonb_build_object('clientId',client_id,'sealedToken',sealed_token) from private.apple_revocation_tokens where account_id=p_account));
$$;
create function public.apple_token_get(account_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.apple_token_get_impl(account_id); $$;

revoke all on function private.apple_token_store_impl(uuid,text,text,text),public.apple_token_store(uuid,text,text,text),private.apple_token_get_impl(uuid),public.apple_token_get(uuid) from public,anon,authenticated,service_role;
grant execute on function private.apple_token_store_impl(uuid,text,text,text),public.apple_token_store(uuid,text,text,text),private.apple_token_get_impl(uuid),public.apple_token_get(uuid) to service_role;

-- One-use, ten-minute OAuth state for an Apple member deleting their account on Android.
create table private.apple_authorization_flows (
  state_hash text primary key check(state_hash ~ '^[0-9a-f]{64}$'),
  account_id uuid not null references auth.users(id) on delete cascade,
  apple_subject text not null,
  created_at timestamptz not null default now()
);
create index apple_authorization_account_created on private.apple_authorization_flows(account_id,created_at);
alter table private.apple_authorization_flows enable row level security;
revoke all on private.apple_authorization_flows from public,anon,authenticated,service_role;
create function private.apple_authorization_start_impl(p_account uuid,p_subject text,p_hash text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from auth.identities where user_id=p_account and provider='apple' and identity_data->>'sub'=p_subject)
    then raise exception using errcode='42501',message='apple_identity_mismatch'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_account::text||':apple-auth',0));
  delete from private.apple_authorization_flows where created_at<now()-interval '10 minutes';
  if (select count(*) from private.apple_authorization_flows where account_id=p_account)>=5 then raise exception 'apple_authorization_rate_limited'; end if;
  insert into private.apple_authorization_flows(state_hash,account_id,apple_subject) values(p_hash,p_account,p_subject);
end $$;
create function public.apple_authorization_start(account_id uuid,apple_subject text,state_hash text) returns void
language sql security invoker set search_path='' as $$ select private.apple_authorization_start_impl(account_id,apple_subject,state_hash); $$;
create function private.apple_authorization_take_impl(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare flow private.apple_authorization_flows;
begin
  delete from private.apple_authorization_flows where state_hash=p_hash returning * into flow;
  if flow.created_at is null or flow.created_at<now()-interval '10 minutes' then return null; end if;
  return jsonb_build_object('accountId',flow.account_id,'subject',flow.apple_subject);
end $$;
create function public.apple_authorization_take(state_hash text) returns jsonb
language sql security invoker set search_path='' as $$ select private.apple_authorization_take_impl(state_hash); $$;
revoke all on function private.apple_authorization_start_impl(uuid,text,text),public.apple_authorization_start(uuid,text,text),private.apple_authorization_take_impl(text),public.apple_authorization_take(text) from public,anon,authenticated,service_role;
grant execute on function private.apple_authorization_start_impl(uuid,text,text),public.apple_authorization_start(uuid,text,text),private.apple_authorization_take_impl(text),public.apple_authorization_take(text) to service_role;
