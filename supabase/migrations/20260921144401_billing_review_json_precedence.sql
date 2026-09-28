-- JSON extraction operators and containment have the same precedence; keep both operands explicit.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.billing_service_impl(text,jsonb)'::regprocedure);
 if position('job.context->''identities'' @> context->''identities''' in definition)=0 then raise exception 'billing_review_patch_target_missing'; end if;
 definition:=replace(definition,'job.context->''identities'' @> context->''identities''','(job.context->''identities'') @> (context->''identities'')');
 definition:=replace(definition,
  'if exists(select 1 from private.billing_members where environment=env and account_id=account and provider_updated_at>updated) then continue; end if;',
  'if exists(select 1 from private.billing_members where environment=env and account_id=account and provider_updated_at>updated) then review_needed:=review_needed or coalesce((select needs_review from private.billing_members where environment=env and account_id=account),false);continue;end if;');
 execute definition;
end $$;
