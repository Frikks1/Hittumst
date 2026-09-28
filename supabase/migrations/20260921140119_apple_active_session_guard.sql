-- Native Apple sign-in occurs before profile onboarding; require a live Auth session
-- without accidentally requiring an already-created profile.
create function private.apple_session_active_impl() returns boolean
language sql stable security definer set search_path='' as $$
  select private.has_current_session() and exists (
    select 1 from auth.users u where u.id=(select auth.uid())
      and (u.banned_until is null or u.banned_until<=now())
  );
$$;
create function public.apple_session_active() returns boolean
language sql stable security invoker set search_path='' as $$ select private.apple_session_active_impl(); $$;
revoke all on function private.apple_session_active_impl(),public.apple_session_active() from public,anon,authenticated,service_role;
grant execute on function private.apple_session_active_impl(),public.apple_session_active() to authenticated;
