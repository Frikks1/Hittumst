-- Replace isolated train test units with the existing audited, wallet-backed sandbox ledger.
-- Production commerce remains disabled by the existing independent provider launch gates.
update private.trains set pool_enabled=false;

alter function private.train_command_impl(text,uuid,jsonb) rename to train_command_social_impl;
create function private.train_command_impl(p_action text,p_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_action in ('pool_settings','pool_deposit') then raise exception 'train_pool_commerce_required'; end if;
 result:=private.train_command_social_impl(p_action,p_id,p_input);
 if p_action='get' then
   -- Legacy balances are never represented as cash or migrated into funded liabilities.
   result:=jsonb_set(result,'{pool}',jsonb_build_object('enabled',false,'amountPerEvent',0,'monthlyCap',0,
     'balance',0,'sandbox',true,'available',false,'allocations','[]'::jsonb));
 end if;
 return result;
end; $$;
create or replace function public.train_command(action text,group_id uuid default null,input jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select private.train_command_impl(action,group_id,input); $$;
revoke all on function private.train_command_social_impl(text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.train_command_impl(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.train_command_impl(text,uuid,jsonb) to authenticated;

-- Only a boolean badge is public. Donors, balance and allocation details stay within the train.
alter function private.train_summary(uuid) rename to train_summary_social;
create function private.train_summary(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when private.train_summary_social(p_id) is null then null else
   private.train_summary_social(p_id)||jsonb_build_object('sponsored',coalesce((
     select (s.state->'trainPools'->p_id::text->>'sponsored')::boolean from private.finance_state s where id
   ),false)) end;
$$;
revoke all on function private.train_summary_social(uuid),private.train_summary(uuid) from public,anon,authenticated,service_role;


-- Membership is resolved on the server, and rechecked under locks at ledger commit.
create function private.finance_train_context_impl(p_member uuid,p_session uuid,p_train uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; member_role text; visibility text;
 old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
 perform private.require_service_role();
 if p_action not in ('train_pool_info','train_pool_settings','train_pool_deposit') then raise exception 'invalid_train_action'; end if;
 if not exists(select 1 from auth.sessions where id=p_session and user_id=p_member and (not_after is null or not_after>now())) then
   raise exception using errcode='42501',message='active_session_required'; end if;
 perform set_config('request.jwt.claim.sub',p_member::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_member,'session_id',p_session,'role','authenticated')::text,true);
 if not private.current_user_is_ready(false) then raise exception using errcode='42501',message='account_unavailable'; end if;
 select t.visibility into visibility from private.trains t join public.groups g on g.id=t.group_id
   where t.group_id=p_train and g.status='active' and not private.meetup_block_exists(p_member,g.owner_id)
   and not exists(select 1 from private.group_blocks b where b.group_id=p_train and b.profile_id=p_member)
   for update of t,g;
 if not found then raise exception using errcode='42501',message='train_unavailable'; end if;
 perform 1 from public.group_members where group_id=p_train and profile_id=p_member for update;
 member_role:=private.group_member_role(p_train,p_member);
 if member_role is null and not (visibility='public' and p_action='train_pool_deposit') then
   raise exception using errcode='42501',message='train_forbidden'; end if;
 if p_action='train_pool_settings' and coalesce(member_role,'') not in ('owner','admin') then
   raise exception using errcode='42501',message='train_admin_required'; end if;
 result:=jsonb_build_object('id',p_train,'role',member_role,'public',visibility='public');
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 return result;
end; $$;
create function public.finance_train_context(member_id uuid,session_id uuid,train_id uuid,command_action text) returns jsonb
language sql security invoker set search_path='' as $$ select private.finance_train_context_impl(member_id,session_id,train_id,command_action); $$;
create function private.finance_train_save_impl(p_member uuid,p_session uuid,p_train uuid,p_action text,p_revision bigint,p_state jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare current_revision bigint;
begin
 perform private.require_service_role();
 select revision into current_revision from private.finance_state where id for update;
 if current_revision<>p_revision then return false; end if;
 if p_action not in ('train_pool_settings','train_pool_deposit') then raise exception 'invalid_train_action'; end if;
 perform private.finance_train_context_impl(p_member,p_session,p_train,p_action);
 return private.finance_save_impl(p_revision,p_state);
end; $$;
create function public.finance_train_save(member_id uuid,session_id uuid,train_id uuid,command_action text,revision bigint,state jsonb) returns boolean
language sql security invoker set search_path='' as $$ select private.finance_train_save_impl(member_id,session_id,train_id,command_action,revision,state); $$;

-- Selecting "going" alone cannot spend pooled money. An active member must have an
-- actual approved/joined RSVP (or host the event), and its plan and visibility must remain valid.
create function private.finance_train_auto_context_impl(p_train uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare configured_by uuid; enabled boolean; result jsonb;
begin
 perform private.require_service_role();
 select coalesce((s.state->'trainPools'->p_train::text->>'enabled')::boolean,false),
   (s.state->'trainPools'->p_train::text->>'configuredBy')::uuid into enabled,configured_by
 from private.finance_state s where id;
 if not enabled or configured_by is null then return '[]'; end if;
 perform 1 from private.trains t join public.groups g on g.id=t.group_id
   where t.group_id=p_train and g.status='active' for update of t,g;
 if not found then return '[]'; end if;
 perform 1 from public.group_members where group_id=p_train for update;
 if coalesce(private.group_member_role(p_train,configured_by),'') not in ('owner','admin') then return '[]'; end if;
 perform 1 from private.train_plans where group_id=p_train for update;
 perform 1 from private.train_going where group_id=p_train for update;
 perform 1 from public.meetups m where exists(select 1 from private.train_plans p where p.group_id=p_train and p.meetup_id=m.id) for update;
 perform 1 from public.meetup_participations mp where exists(select 1 from private.train_plans p where p.group_id=p_train and p.meetup_id=mp.meetup_id) for update;
 select coalesce(jsonb_agg(jsonb_set(private.finance_event_context_impl(m.id),'{eligibleAttendees}',
   coalesce((select jsonb_agg(mp.profile_id order by mp.profile_id) from public.meetup_participations mp where mp.meetup_id=m.id and mp.status in ('joined','approved')),'[]'::jsonb)) order by m.starts_at,m.id),'[]'::jsonb)
 into result from public.meetups m join private.train_plans p on p.meetup_id=m.id and p.group_id=p_train
 where m.status='published' and not m.is_explicit and m.starts_at>clock_timestamp()
   and private.community_event_visible(m.id,configured_by)
   and exists(select 1 from private.train_going a where a.group_id=p_train and a.meetup_id=m.id
     and private.group_member_role(p_train,a.profile_id) is not null and private.community_event_visible(m.id,a.profile_id)
     and (a.profile_id=m.host_id or exists(select 1 from public.meetup_participations mp
       where mp.meetup_id=m.id and mp.profile_id=a.profile_id and mp.status in ('joined','approved'))));
 return result;
end; $$;
create function public.finance_train_auto_context(train_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.finance_train_auto_context_impl(train_id); $$;
create function private.finance_train_auto_save_impl(p_train uuid,p_revision bigint,p_state jsonb,p_context jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare current_revision bigint; actual jsonb;
begin
 perform private.require_service_role();
 select revision into current_revision from private.finance_state where id for update;
 if current_revision<>p_revision then return false; end if;
 actual:=private.finance_train_auto_context_impl(p_train);
 if actual is distinct from p_context then raise exception 'train_context_changed'; end if;
 return private.finance_save_impl(p_revision,p_state);
end; $$;
create function public.finance_train_auto_save(train_id uuid,revision bigint,state jsonb,event_context jsonb) returns boolean
language sql security invoker set search_path='' as $$ select private.finance_train_auto_save_impl(train_id,revision,state,event_context); $$;

revoke all on function private.finance_train_context_impl(uuid,uuid,uuid,text),public.finance_train_context(uuid,uuid,uuid,text),
 private.finance_train_save_impl(uuid,uuid,uuid,text,bigint,jsonb),public.finance_train_save(uuid,uuid,uuid,text,bigint,jsonb),
 private.finance_train_auto_context_impl(uuid),public.finance_train_auto_context(uuid),
 private.finance_train_auto_save_impl(uuid,bigint,jsonb,jsonb),public.finance_train_auto_save(uuid,bigint,jsonb,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function private.finance_train_context_impl(uuid,uuid,uuid,text),public.finance_train_context(uuid,uuid,uuid,text),
 private.finance_train_save_impl(uuid,uuid,uuid,text,bigint,jsonb),public.finance_train_save(uuid,uuid,uuid,text,bigint,jsonb),
 private.finance_train_auto_context_impl(uuid),public.finance_train_auto_context(uuid),
 private.finance_train_auto_save_impl(uuid,bigint,jsonb,jsonb),public.finance_train_auto_save(uuid,bigint,jsonb,jsonb)
 to service_role;
notify pgrst,'reload schema';

-- The administrator approving a pooled budget is not an individual sponsor.
create or replace function private.community_sponsor_rank(p_meetup uuid,p_profile uuid) returns integer
language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from private.finance_state f,
 lateral jsonb_each(coalesce(f.state->'contributions','{}'::jsonb)) c
 where f.id and c.value->>'eventId'=p_meetup::text and c.value->>'memberId'=p_profile::text
 and c.value->>'trainId' is null
 and coalesce((c.value->>'amount')::numeric,0)>0 and not coalesce((c.value->>'reversed')::boolean,false)
 and c.value->>'refundReason' is null) then 0 else 1 end;
$$;

-- Account erasure stops that administrator's standing spending mandate, preserving pooled liabilities.
do $$
declare source text; needle text := 'updated:=jsonb_set(previous.state,array[''members'',member_id,''suspended''],''true'');';
begin
 source:=pg_get_functiondef('private.freeze_deleted_finance_member()'::regprocedure);
 source:=replace(source,'if previous.state->''members''->member_id is null then',
   'if previous.state->''members''->member_id is null and not exists(select 1 from jsonb_each(coalesce(previous.state->''trainPools'',''{}'')) pool where exists(select 1 from public.groups g where g.id::text=pool.key and g.owner_id::text=member_id)) then');
 if position(needle in source)=0 then raise exception 'missing_financial_member_freeze'; end if;
 execute replace(source,needle,needle||$body$
  for event in select key,value from jsonb_each(coalesce(updated->'trainPools','{}'))
    where value->>'configuredBy'=member_id or exists(select 1 from public.groups g where g.id::text=key and g.owner_id::text=member_id) loop
    updated:=jsonb_set(updated,array['trainPools',event.key,'enabled'],'false');
    updated:=jsonb_set(updated,'{flags}',coalesce(updated->'flags','[]'::jsonb)||jsonb_build_array(
      jsonb_build_object('accountId',member_id,'reason','train_pool_admin_deleted:'||event.key)));
  end loop;
$body$);
end $$;

-- A normal archive cannot strand group-owned cash or a later event refund. Take the
-- ledger lock first, matching deposits and automatic funding, before the group lock.
alter function private.group_action_impl(uuid,text,jsonb) rename to group_action_before_train_finance;
create function private.group_action_impl(p_group_id uuid,p_action text,p_input jsonb default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare ledger jsonb;
begin
 if p_action='archive' then
   if not private.current_user_is_ready(false) or coalesce(private.group_member_role(p_group_id,(select auth.uid())),'')<>'owner' then
     raise exception using errcode='42501',message='group_admin_required'; end if;
   select state into ledger from private.finance_state where id for update;
   if coalesce((ledger->'balances'->>('train:'||p_group_id::text))::bigint,0)>0 or exists(
     select 1 from jsonb_each(coalesce(ledger->'contributions','{}')) c
     where c.value->>'trainId'=p_group_id::text and not coalesce((c.value->>'reversed')::boolean,false)
       and not coalesce((ledger->'events'->(c.value->>'eventId')->>'settled')::boolean,false)
   ) then raise exception 'train_pool_has_funds'; end if;
 end if;
 perform private.group_action_before_train_finance(p_group_id,p_action,p_input);
end; $$;
create or replace function public.group_action(group_id uuid,action text,input jsonb default '{}') returns void
language sql security invoker set search_path='' as $$ select private.group_action_impl(group_id,action,input); $$;
revoke all on function private.group_action_before_train_finance(uuid,text,jsonb),private.group_action_impl(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.group_action_impl(uuid,text,jsonb) to authenticated;
