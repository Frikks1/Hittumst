alter table private.apple_authorization_flows add column return_mode text not null default 'native' check(return_mode in ('native','web'));
create function private.apple_authorization_start_web_impl(p_account uuid,p_subject text,p_hash text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.apple_authorization_start_impl(p_account,p_subject,p_hash);
  update private.apple_authorization_flows set return_mode='web' where state_hash=p_hash and account_id=p_account;
end $$;
create function public.apple_authorization_start_web(account_id uuid,apple_subject text,state_hash text) returns void
language sql security invoker set search_path='' as $$ select private.apple_authorization_start_web_impl(account_id,apple_subject,state_hash); $$;
revoke all on function private.apple_authorization_start_web_impl(uuid,text,text),public.apple_authorization_start_web(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function private.apple_authorization_start_web_impl(uuid,text,text),public.apple_authorization_start_web(uuid,text,text) to service_role;
create or replace function private.apple_authorization_take_impl(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare flow private.apple_authorization_flows;
begin
  delete from private.apple_authorization_flows where state_hash=p_hash returning * into flow;
  if flow.created_at is null or flow.created_at<now()-interval '10 minutes' then return null; end if;
  return jsonb_build_object('accountId',flow.account_id,'subject',flow.apple_subject,'returnMode',flow.return_mode);
end $$;
