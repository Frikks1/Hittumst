create or replace function private.finance_save_impl(p_revision bigint,p_state jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare previous private.finance_state; item record; tx jsonb; entry jsonb; actual jsonb:='{}'; amount bigint; balance bigint;
begin
  if not exists(select 1 from private.commerce_configuration where mode='sandbox') then raise exception 'finance_disabled'; end if;
  if jsonb_typeof(p_state)<>'object' or p_state->>'environment'<>'sandbox' then raise exception 'invalid_finance_state'; end if;
  select * into previous from private.finance_state where id for update;
  if previous.revision<>p_revision then return false; end if;
  if jsonb_typeof(p_state->'journal') is distinct from 'array' or jsonb_typeof(p_state->'balances') is distinct from 'object' then raise exception 'invalid_ledger'; end if;
  -- Existing financial history is immutable, even to the service adapter.
  for item in select value,ordinality from jsonb_array_elements(coalesce(previous.state->'journal','[]')) with ordinality loop
    if p_state->'journal'->(item.ordinality::int-1) is distinct from item.value then raise exception 'ledger_history_immutable'; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(p_state->'journal'))<>(select count(distinct value->>'id') from jsonb_array_elements(p_state->'journal')) then raise exception 'duplicate_ledger_id'; end if;
  for tx in select value from jsonb_array_elements(p_state->'journal') loop
    if (select sum((value->>'amount')::bigint) from jsonb_array_elements(tx->'entries'))<>0 then raise exception 'unbalanced_ledger'; end if;
    for entry in select value from jsonb_array_elements(tx->'entries') loop
      amount:=(entry->>'amount')::bigint;
      balance:=coalesce((actual->>(entry->>'account'))::bigint,0)+amount;
      if abs(balance)>9007199254740991 or (entry->>'account' not like 'external:%' and balance<0) then raise exception 'invalid_ledger_balance'; end if;
      actual:=jsonb_set(actual,array[entry->>'account'],to_jsonb(balance));
    end loop;
  end loop;
  if actual is distinct from p_state->'balances' then raise exception 'balance_drift'; end if;
  for item in select key,value from jsonb_each(p_state->'members') loop
    if not exists(select 1 from public.profiles where id=item.key::uuid and deletion_requested_at is null) then continue; end if;
    insert into private.member_subscriptions(account_id,tier,paid_until,premium_months,source)
    values(item.key::uuid,item.value->>'tier',(item.value->>'paidUntil')::timestamptz,(item.value->>'premiumMonths')::integer,'sandbox')
    on conflict(account_id) do update set tier=excluded.tier,paid_until=excluded.paid_until,premium_months=excluded.premium_months,source='sandbox';
  end loop;
  insert into private.finance_journal(revision,previous_hash,state_hash)
    values(p_revision+1,encode(extensions.digest(previous.state::text,'sha256'),'hex'),encode(extensions.digest(p_state::text,'sha256'),'hex'));
  update private.finance_state set revision=p_revision+1,state=p_state,updated_at=now() where id;
  return true;
end $$;

-- Hold sandbox claims during deletion without deleting or rewriting financial history.
-- Production retention/redemption policy remains an independent launch prerequisite.
create function private.freeze_deleted_finance_member() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous private.finance_state; updated jsonb; member_id text; event record;
begin
  if tg_op='UPDATE' and (new.deletion_requested_at is null or old.deletion_requested_at is not null) then return new; end if;
  member_id:=old.id::text;
  select * into previous from private.finance_state where id for update;
  if previous.state->'members'->member_id is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  updated:=jsonb_set(previous.state,array['members',member_id,'suspended'],'true');
  updated:=jsonb_set(updated,array['members',member_id,'payoutIdentity'],'null');
  for event in select key,value from jsonb_each(coalesce(updated->'events','{}')) where value->>'hostId'=member_id and not coalesce((value->>'settled')::boolean,false) loop
    updated:=jsonb_set(updated,array['events',event.key,'cancelled'],'true');
  end loop;
  if updated is distinct from previous.state then
    insert into private.finance_journal(revision,previous_hash,state_hash)
      values(previous.revision+1,encode(extensions.digest(previous.state::text,'sha256'),'hex'),encode(extensions.digest(updated::text,'sha256'),'hex'));
    update private.finance_state set revision=previous.revision+1,state=updated,updated_at=now() where id;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger profiles_freeze_finance before update of deletion_requested_at or delete on public.profiles
for each row execute function private.freeze_deleted_finance_member();
revoke all on function private.freeze_deleted_finance_member() from public,anon,authenticated,service_role;

