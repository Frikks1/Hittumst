-- Staff permissions are resolved from current protected records on every request.
create function private.current_staff_roles() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(distinct role),'[]'::jsonb) from (
    select jsonb_array_elements_text(case when jsonb_typeof(u.raw_app_meta_data->'roles')='array'
      then u.raw_app_meta_data->'roles' else '[]'::jsonb end || jsonb_build_array(u.raw_app_meta_data->>'role')) as role
    from auth.users u join public.profiles p on p.id=u.id
    where u.id=(select auth.uid()) and p.deletion_requested_at is null and p.moderation_status='active'
  ) roles where role in ('moderator','admin','super_admin');
$$;
revoke all on function private.current_staff_roles() from public,anon,authenticated;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select auth.jwt()->>'aal')='aal2',false) and jsonb_array_length(private.current_staff_roles())>0;
$$;
create function private.get_staff_access_impl() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',u.id,'email',u.email,
    'name',coalesce(u.raw_app_meta_data->>'display_name',split_part(u.email,'@',1)),
    'roles',private.current_staff_roles(),'mfaRequired',not private.is_admin())
  from auth.users u where u.id=(select auth.uid()) and jsonb_array_length(private.current_staff_roles())>0;
$$;
create function public.get_staff_access() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.get_staff_access_impl(); $$;
revoke all on function public.get_staff_access(),private.get_staff_access_impl() from public,anon;
grant execute on function public.get_staff_access(),private.get_staff_access_impl() to authenticated;
