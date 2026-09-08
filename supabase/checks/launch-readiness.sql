-- Read-only deployed-schema preflight. Run against the intended staging/production project.
-- This does not replace pgTAP security tests or migration rehearsal.
select required.name, to_regclass(required.name) is not null as present
from (values ('public.profiles'), ('public.messages'), ('public.albums'),
 ('public.album_shares'), ('public.meetups'), ('public.groups'), ('public.notifications')) required(name);
select n.nspname as schema_name,c.relname as table_name,c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind='r' and n.nspname in ('public','private') order by 1,2;
select id, public from storage.buckets order by id;
