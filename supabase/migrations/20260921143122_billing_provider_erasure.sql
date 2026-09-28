-- Service-only coordination prevents get-or-create lookups from racing provider erasure.
create function private.billing_provider_guard_impl(p_account uuid,p_job uuid,p_claim uuid,p_erasing boolean default false,p_aliases jsonb default '[]') returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.billing_jobs; config private.billing_configuration; identities jsonb;
begin
 if p_erasing then
  if not exists(select 1 from private.account_deletion_jobs where id=p_job and account_id=p_account and status='processing' and claim_token=p_claim and lease_until>now()) then
   raise exception using errcode='42501',message='deletion_claim_expired';end if;
  if exists(select 1 from public.profiles where id=p_account and deletion_requested_at is null) then raise exception 'billing_erasure_not_requested';end if;
  identities:=p_aliases||jsonb_build_array(p_account::text);
  if exists(select 1 from public.profiles p where p.id<>p_account and p.deletion_requested_at is null and identities @> jsonb_build_array(p.id::text)) then
   return jsonb_build_object('state','alias_review_required');end if;
  if exists(select 1 from private.billing_jobs j where j.status='processing' and j.lease_until>now()-interval '10 seconds'
    and exists(select 1 from jsonb_array_elements_text(identities) i where j.context->'identities' @> jsonb_build_array(i))) then
   return jsonb_build_object('state','processing');end if;
  select * into config from private.billing_configuration where id;
  return jsonb_build_object('state','ready','environment',config.environment,'required',config.environment is not null or exists(select 1 from private.billing_members where account_id=p_account));
 end if;
 select * into job from private.billing_jobs where id=p_job;
 if job.id is null or job.status<>'processing' or job.claim_id is distinct from p_claim or job.lease_until<now()+interval '15 seconds'
   or not(job.context->'identities' @> jsonb_build_array(p_account::text)) then return jsonb_build_object('state','claim_expired');end if;
 if not exists(select 1 from public.profiles where id=p_account and deletion_requested_at is null) then return jsonb_build_object('state','deleted');end if;
 return jsonb_build_object('state','allowed','validUntil',job.lease_until);
end;$$;
create function public.billing_provider_guard(p_account uuid,p_job uuid,p_claim uuid,p_erasing boolean default false,p_aliases jsonb default '[]') returns jsonb
language sql security invoker set search_path='' as $$select private.billing_provider_guard_impl(p_account,p_job,p_claim,p_erasing,p_aliases);$$;
revoke all on function private.billing_provider_guard_impl(uuid,uuid,uuid,boolean,jsonb),public.billing_provider_guard(uuid,uuid,uuid,boolean,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.billing_provider_guard_impl(uuid,uuid,uuid,boolean,jsonb),public.billing_provider_guard(uuid,uuid,uuid,boolean,jsonb) to service_role;
