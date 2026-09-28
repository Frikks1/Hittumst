-- Unexpired JWTs must not outlive the Auth session that issued them.
-- Preserve backup-restore quarantine and allow not-yet-onboarded active Auth users.
create or replace function private.account_is_active() returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_current_session() and exists(
   select 1 from public.profiles p join auth.users u on u.id=p.id
   where p.id=(select auth.uid()) and p.deletion_requested_at is null
     and not exists(select 1 from private.media_restore_quarantine q where q.account_id=p.id));
$$;

create or replace function private.current_user_is_ready(require_fresh_location boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.account_is_active() and coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.onboarding_completed_at is not null
        and p.special_category_consent_at is not null
        and p.moderation_status <> 'banned'
        and (p.moderation_status <> 'suspended' or p.suspended_until <= now())
        and (
          not require_fresh_location
          or (
            p.is_location_sharing_enabled
            and exists (
              select 1
              from private.private_locations l
              where l.profile_id = p.id
                and l.verified_at >= now() - interval '15 minutes'
            )
          )
        )
    ),
    false
  );
$$;

-- Data API pre-request covers all exposed RPCs, including security-definer implementations.
-- Session validity is not bypassed by the account-deletion path exemption.
create or replace function private.check_account_access_impl() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if ((select auth.uid()) is not null or (select auth.role())='authenticated') and not private.has_current_session() then
   raise exception using errcode='42501',message='account_unavailable';
 end if;
 if (select auth.uid()) is not null and not private.account_is_active()
   and coalesce(current_setting('request.path',true),'')<>'/rpc/delete_my_account' then
   raise exception using errcode='42501',message='account_unavailable';
 end if;
end;
$$;

-- Also enforce it inside deletion itself; a direct database invocation never trusts the pre-request hook.
alter function private.delete_my_account_impl() rename to delete_my_account_before_session_guard;
revoke all on function private.delete_my_account_before_session_guard() from public,anon,authenticated,service_role;
create function private.delete_my_account_impl() returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.has_current_session() then raise exception using errcode='42501',message='active_session_required'; end if;
 perform private.delete_my_account_before_session_guard();
end;
$$;
revoke all on function private.delete_my_account_impl() from public,anon,authenticated,service_role;
grant execute on function private.delete_my_account_impl() to authenticated;
create or replace function public.delete_my_account() returns void
language sql security invoker set search_path='' as $$ select private.delete_my_account_impl(); $$;

-- A provider session with an explicit expiry must not continue receiving push while awaiting cleanup.
create or replace function private.claim_notification_outbox_impl(p_batch_size integer,p_claim_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare claimed jsonb;
begin
  perform private.require_service_role();
  claimed:=private.claim_notification_outbox_before_message_scope(p_batch_size,p_claim_token);
  return (select coalesce(jsonb_agg(jsonb_set(c,'{tokens}',case when private.message_notification_access((c->'notification'->>'id')::uuid,(c->'notification'->>'recipientId')::uuid)
    then coalesce((select jsonb_agg(t) from jsonb_array_elements(c->'tokens') t join private.push_tokens pt on pt.id=(t->>'tokenId')::uuid
      join auth.sessions s on s.id=pt.auth_session_id and s.user_id=pt.profile_id where pt.enabled and (s.not_after is null or s.not_after>now())),'[]') else '[]'::jsonb end)),'[]') from jsonb_array_elements(claimed) c);
end; $$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
