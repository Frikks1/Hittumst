-- A legacy UPDATE-only Storage policy must not permit replacing approved bytes.
drop policy album_media_objects_update on storage.objects;
create or replace function private.list_my_media_uploads_impl(p_type text,p_target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
 return coalesce((select jsonb_agg(to_jsonb(q)) from (
 select id,status,created_at as "createdAt",rejection_reason as reason,target_type as "targetType",coalesce(target_id,album_id) as "targetId"
 from private.media_uploads where owner_id=(select auth.uid()) and (p_type is null or target_type=p_type) and (p_target is null or coalesce(target_id,album_id)=p_target)
 order by created_at desc limit 100) q),'[]');
end $$;
create or replace function public.list_my_media_uploads(target_type text default null,target_id uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$select private.list_my_media_uploads_impl(target_type,target_id);$$;
