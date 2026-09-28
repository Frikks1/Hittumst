-- OAuth capability and token custody must not outlive the authenticating Supabase session.
alter table private.apple_authorization_flows add column session_id uuid references auth.sessions(id) on delete cascade;
create function private.apple_assert_custody_session(p_account uuid,p_session uuid) returns void
language plpgsql security definer set search_path='' as $$
declare profile public.profiles;
begin
 perform 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=p_session and s.user_id=p_account
  and (s.not_after is null or s.not_after>now()) and (u.banned_until is null or u.banned_until<=now()) for share of s,u;
 if not found then raise exception using errcode='42501',message='apple_session_required';end if;
 select * into profile from public.profiles where id=p_account for share;
 if profile.deletion_requested_at is not null or exists(select 1 from private.media_restore_quarantine where account_id=p_account) then
  raise exception using errcode='42501',message='apple_session_required';end if;
end;$$;
create function private.apple_custody_context_impl() returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); session uuid:=((select auth.jwt())->>'session_id')::uuid;
begin
 perform private.apple_assert_custody_session(caller,session);
 return jsonb_build_object('accountId',caller,'sessionId',session,'subject',(select identity_data->>'sub' from auth.identities where user_id=caller and provider='apple' limit 1));
end;$$;
create function public.apple_custody_context() returns jsonb language sql security invoker set search_path='' as $$select private.apple_custody_context_impl();$$;
revoke all on function private.apple_assert_custody_session(uuid,uuid),private.apple_custody_context_impl(),public.apple_custody_context() from public,anon,authenticated,service_role;
grant execute on function private.apple_custody_context_impl(),public.apple_custody_context() to authenticated;

create function private.apple_authorization_start_bound_impl(p_account uuid,p_subject text,p_hash text,p_session uuid,p_mode text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.apple_assert_custody_session(p_account,p_session);
 if p_mode not in ('native','web') then raise exception 'apple_return_mode_invalid';end if;
 perform private.apple_authorization_start_impl(p_account,p_subject,p_hash);
 update private.apple_authorization_flows set session_id=p_session,return_mode=p_mode where state_hash=p_hash;
end;$$;
create function public.apple_authorization_start_bound(account_id uuid,apple_subject text,state_hash text,session_id uuid,return_mode text) returns void
language sql security invoker set search_path='' as $$select private.apple_authorization_start_bound_impl(account_id,apple_subject,state_hash,session_id,return_mode);$$;
create function private.apple_token_store_authorized_impl(p_account uuid,p_subject text,p_client text,p_token text,p_session uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.apple_assert_custody_session(p_account,p_session);
 perform private.apple_token_store_impl(p_account,p_subject,p_client,p_token);
end;$$;
create function public.apple_token_store_authorized(account_id uuid,apple_subject text,client_id text,sealed_token text,session_id uuid) returns void
language sql security invoker set search_path='' as $$select private.apple_token_store_authorized_impl(account_id,apple_subject,client_id,sealed_token,session_id);$$;
revoke all on function private.apple_authorization_start_bound_impl(uuid,text,text,uuid,text),public.apple_authorization_start_bound(uuid,text,text,uuid,text),private.apple_token_store_authorized_impl(uuid,text,text,text,uuid),public.apple_token_store_authorized(uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.apple_authorization_start_bound_impl(uuid,text,text,uuid,text),public.apple_authorization_start_bound(uuid,text,text,uuid,text),private.apple_token_store_authorized_impl(uuid,text,text,text,uuid),public.apple_token_store_authorized(uuid,text,text,text,uuid) to service_role;
-- Retain implementation functions for the narrow wrappers, not as bypasses for external callers.
revoke all on function private.apple_authorization_start_impl(uuid,text,text),public.apple_authorization_start(uuid,text,text),private.apple_authorization_start_web_impl(uuid,text,text),public.apple_authorization_start_web(uuid,text,text),private.apple_token_store_impl(uuid,text,text,text),public.apple_token_store(uuid,text,text,text) from service_role;
create or replace function private.apple_authorization_take_impl(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare flow private.apple_authorization_flows;
begin
 delete from private.apple_authorization_flows where state_hash=p_hash returning * into flow;
 if flow.created_at is null or flow.created_at<now()-interval '10 minutes' or flow.session_id is null then return null;end if;
 begin
  perform private.apple_assert_custody_session(flow.account_id,flow.session_id);
 exception when insufficient_privilege then return null;end;
 if not exists(select 1 from auth.identities where user_id=flow.account_id and provider='apple' and identity_data->>'sub'=flow.apple_subject) then return null;end if;
 return jsonb_build_object('accountId',flow.account_id,'subject',flow.apple_subject,'returnMode',flow.return_mode,'sessionId',flow.session_id);
end;$$;
