-- Reuse the existing private queue and worker for every retired profile photo.
-- Keep the trigger function identity so the existing GIF hook stays attached.
create or replace function private.cleanup_retired_profile_gif() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.storage_path is distinct from old.storage_path then
    insert into private.media_cleanup_jobs(bucket, name)
    values ('profile-photos', old.storage_path) on conflict do nothing;
    if old.storage_path = old.profile_id::text || '/' || old.id::text || '.gif' then
      insert into private.media_cleanup_jobs(bucket, name)
      values ('profile-photos', old.profile_id::text || '/' || old.id::text || '-thumb.jpg')
      on conflict do nothing;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.cleanup_retired_profile_gif() from public, anon, authenticated, service_role;
