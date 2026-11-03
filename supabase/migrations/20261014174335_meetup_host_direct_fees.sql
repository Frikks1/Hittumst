-- Participation fees describe payment directly to the host. They are unrelated
-- to sponsorship, balances, settlement, or membership allowances. No legacy
-- financial rows are rewritten. For newly set ISK fees, one unit is one króna.
create function private.set_meetup_host_fee(p_meetup_id uuid,p_input jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare m public.meetups%rowtype; fee numeric;
begin
  perform private.assert_meetup_feature_enabled();
  if not private.current_user_is_ready(false) then
    raise exception using errcode='42501',message='account_unavailable';
  end if;
  select * into m from public.meetups where id=p_meetup_id
    and host_id=(select auth.uid()) and status in ('draft','published') for update;
  if m.id is null then raise exception using errcode='42501',message='owned_meetup_required'; end if;
  if not (p_input ? 'feeIsk') then return; end if;
  if jsonb_typeof(p_input->'feeIsk') <> 'number' then
    raise exception using errcode='22023',message='invalid_meetup_fee_isk';
  end if;
  fee:=(p_input->>'feeIsk')::numeric;
  if fee<0 or fee<>trunc(fee) or fee>2147483647 then
    raise exception using errcode='22023',message='invalid_meetup_fee_isk';
  end if;
  update public.meetups set admission_mode=case when fee=0 then 'free' else 'paid' end,
    price_minor=case when fee=0 then null else fee::integer end,
    currency=case when fee=0 then null else 'ISK' end where id=m.id;
  if m.status='published' and (m.admission_mode,m.price_minor,m.currency) is distinct from
    (case when fee=0 then 'free' else 'paid' end,case when fee=0 then null else fee::integer end,case when fee=0 then null else 'ISK' end) then
    perform private.capture_meetup_revision(m.id,'material_update',(select auth.uid()));
    perform private.notify_meetup_participants(m.id,'meetup_materially_changed',jsonb_build_object('title',m.title,'changes',jsonb_build_array('fee')));
  end if;
end $$;
revoke all on function private.set_meetup_host_fee(uuid,jsonb) from public,anon,authenticated,service_role;

alter function private.create_meetup_draft_impl(jsonb) rename to create_meetup_draft_before_host_fee;
create function private.create_meetup_draft_impl(p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare id uuid;
begin
  id:=private.create_meetup_draft_before_host_fee(p_input);
  perform private.set_meetup_host_fee(id,p_input);
  return id;
end $$;
alter function private.update_meetup_impl(uuid,jsonb) rename to update_meetup_before_host_fee;
create function private.update_meetup_impl(p_meetup_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.update_meetup_before_host_fee(p_meetup_id,p_input);
  perform private.set_meetup_host_fee(p_meetup_id,p_input);
  return private.meetup_payload(p_meetup_id,(select auth.uid()),true);
end $$;
revoke all on function private.create_meetup_draft_before_host_fee(jsonb),private.update_meetup_before_host_fee(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.create_meetup_draft_impl(jsonb),private.update_meetup_impl(uuid,jsonb) from public,anon,service_role;
grant execute on function private.create_meetup_draft_impl(jsonb),private.update_meetup_impl(uuid,jsonb) to authenticated;

alter function private.meetup_payload(uuid,uuid,boolean) rename to meetup_payload_before_host_fee;
create function private.meetup_payload(p_meetup_id uuid,p_viewer_id uuid,p_include_description boolean default true)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; m public.meetups%rowtype;
begin
  result:=private.meetup_payload_before_host_fee(p_meetup_id,p_viewer_id,p_include_description);
  if result is null then return null; end if;
  select * into m from public.meetups where id=p_meetup_id;
  return result||jsonb_build_object('admissionMode',m.admission_mode,'priceMinor',m.price_minor,'currency',m.currency)
    ||case when m.admission_mode='free' then jsonb_build_object('feeIsk',0)
      when m.currency='ISK' then jsonb_build_object('feeIsk',m.price_minor) else '{}'::jsonb end;
end $$;
revoke all on function private.meetup_payload_before_host_fee(uuid,uuid,boolean),private.meetup_payload(uuid,uuid,boolean) from public,anon,authenticated,service_role;
