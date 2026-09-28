-- Restore targets remain unusable until access has been separately revalidated.
create table private.media_restore_quarantine (
 account_id uuid primary key references auth.users(id) on delete cascade,
 restore_id uuid not null,
 quarantined_at timestamptz not null default now()
);
alter table private.media_restore_quarantine enable row level security;
revoke all on private.media_restore_quarantine from public,anon,authenticated,service_role;
create or replace function private.account_is_active() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=(select auth.uid()) and p.deletion_requested_at is null
 and not exists(select 1 from private.media_restore_quarantine q where q.account_id=p.id));
$$;
create function private.deny_quarantined_session() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.media_restore_quarantine where account_id=new.user_id) then raise exception using errcode='28000',message='account_recovery_verification_required'; end if;
 return new;
end $$;
revoke all on function private.deny_quarantined_session() from public,anon,authenticated,service_role;
create trigger recovery_session_guard before insert on auth.sessions for each row execute function private.deny_quarantined_session();
create function private.prepare_media_restore_impl(p_restore uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 perform private.require_service_role();
 if p_restore is null or exists(select 1 from auth.users where email is null or email not like '%@example.test') then raise exception 'isolated_synthetic_restore_required'; end if;
 insert into private.media_restore_quarantine(account_id,restore_id) select id,p_restore from auth.users on conflict(account_id) do nothing;
 get diagnostics affected=row_count;
 delete from auth.sessions where user_id in(select account_id from private.media_restore_quarantine);
 delete from auth.refresh_tokens where user_id in(select account_id::text from private.media_restore_quarantine);
 return affected;
end $$;
create function public.prepare_media_restore(restore_id uuid) returns integer
language sql security invoker set search_path='' as $$select private.prepare_media_restore_impl(restore_id);$$;
revoke all on function private.prepare_media_restore_impl(uuid),public.prepare_media_restore(uuid) from public,anon,authenticated,service_role;
grant execute on function private.prepare_media_restore_impl(uuid),public.prepare_media_restore(uuid) to service_role;
-- No unquarantine function is exposed: restoring media never reopens account access.
