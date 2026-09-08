-- Read-only application schema inventory. Contains definitions and configuration, never member data.
with relations as (
  select c.*, n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','S')
    and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
), functions as (
  select p.*,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind in ('f','p')
    and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
), objects as (
  select 'relation/'||nspname||'.'||relname as key,
    jsonb_build_object('kind',relkind,'rls',relrowsecurity,'forceRls',relforcerowsecurity,'owner',pg_get_userbyid(relowner),'acl',coalesce((select jsonb_agg(v::text order by v::text) from unnest(relacl) v),'null'::jsonb)) as definition from relations
  union all
  select 'column/'||r.nspname||'.'||r.relname||'.'||a.attname,
    jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text)
    from relations r join pg_attribute a on a.attrelid=r.oid and a.attnum>0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid=r.oid and d.adnum=a.attnum
  union all
  select 'constraint/'||r.nspname||'.'||r.relname||'.'||c.conname,
    jsonb_build_object('definition',pg_get_constraintdef(c.oid),'validated',c.convalidated)
    from relations r join pg_constraint c on c.conrelid=r.oid
  union all
  select 'index/'||r.nspname||'.'||r.relname||'.'||i.relname,
    jsonb_build_object('definition',pg_get_indexdef(i.oid),'valid',ix.indisvalid)
    from relations r join pg_index ix on ix.indrelid=r.oid join pg_class i on i.oid=ix.indexrelid
  union all
  select 'function/'||nspname||'.'||proname||'('||pg_get_function_identity_arguments(oid)||')',
    jsonb_build_object('definition',pg_get_functiondef(oid),'owner',pg_get_userbyid(proowner),'acl',coalesce((select jsonb_agg(v::text order by v::text) from unnest(proacl) v),'null'::jsonb)) from functions
  union all
  select 'policy/'||n.nspname||'.'||c.relname||'.'||p.polname,
    jsonb_build_object('command',p.polcmd,'permissive',p.polpermissive,'roles',(select jsonb_agg(case when role_id=0 then 'public' else pg_get_userbyid(role_id) end order by role_id) from unnest(p.polroles) role_id),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
    from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') or (n.nspname='storage' and c.relname='objects')
  union all
  select 'trigger/'||n.nspname||'.'||c.relname||'.'||t.tgname,
    jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    join pg_proc f on f.oid=t.tgfoid join pg_namespace fn on fn.oid=f.pronamespace
    where not t.tgisinternal and (n.nspname in ('public','private') or (n.nspname in ('auth','storage') and fn.nspname in ('public','private')))
  union all
  select 'schema/'||nspname,jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',coalesce((select jsonb_agg(v::text order by v::text) from unnest(nspacl) v),'null'::jsonb))
    from pg_namespace where nspname in ('public','private')
  union all
  select 'defaultAcl/'||n.nspname||'.'||pg_get_userbyid(d.defaclrole)||'.'||d.defaclobjtype::text,
    jsonb_build_object('acl',(select jsonb_agg(v::text order by v::text) from unnest(d.defaclacl) v))
    from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname in ('public','private')
  union all
  select 'publication/'||pubname||'.'||schemaname||'.'||tablename,jsonb_build_object('columns',attnames,'filter',rowfilter)
    from pg_publication_tables where schemaname in ('public','private')
  union all
  select 'bucket/'||id,jsonb_build_object('name',name,'public',public,'fileSizeLimit',file_size_limit,'allowedMimeTypes',allowed_mime_types)
    from storage.buckets where id in ('profile-photos','message-images','album-media','profile-videos')
)
select key,definition,md5(definition::text) as fingerprint from objects order by key;
