-- Use the account-deletion advisory lock before session/profile/flow row locks.
-- The callback must not lock its flow row before a concurrent Auth logout cascades from sessions.
create or replace function private.apple_assert_custody_session(p_account uuid,p_session uuid) returns void
language plpgsql security definer set search_path='' as $$
declare profile public.profiles;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_account::text||':delete',0));
 perform 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=p_session and s.user_id=p_account
  and (s.not_after is null or s.not_after>now()) and (u.banned_until is null or u.banned_until<=now()) for share of s,u;
 if not found then raise exception using errcode='42501',message='apple_session_required';end if;
 select * into profile from public.profiles where id=p_account for share;
 if profile.deletion_requested_at is not null or exists(select 1 from private.media_restore_quarantine where account_id=p_account) then
  raise exception using errcode='42501',message='apple_session_required';end if;
end;$$;
create or replace function private.apple_authorization_take_impl(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare flow private.apple_authorization_flows;
begin
 select * into flow from private.apple_authorization_flows where state_hash=p_hash;
 if flow.created_at is null then return null;end if;
 if flow.created_at<now()-interval '10 minutes' or flow.session_id is null then
  delete from private.apple_authorization_flows where state_hash=p_hash;return null;end if;
 begin
  perform private.apple_assert_custody_session(flow.account_id,flow.session_id);
 exception when insufficient_privilege then
  delete from private.apple_authorization_flows where state_hash=p_hash;return null;end;
 -- Only one contender can consume the state after the session/profile locks are held.
 delete from private.apple_authorization_flows where state_hash=p_hash returning * into flow;
 if not found then return null;end if;
 if not exists(select 1 from auth.identities where user_id=flow.account_id and provider='apple' and identity_data->>'sub'=flow.apple_subject) then return null;end if;
 return jsonb_build_object('accountId',flow.account_id,'subject',flow.apple_subject,'returnMode',flow.return_mode,'sessionId',flow.session_id);
end;$$;
