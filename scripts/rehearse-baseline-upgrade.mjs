import { Client } from 'pg';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const mode=process.argv[2];
if(!['prepare','verify'].includes(mode))throw new Error('Use prepare or verify against the disposable local database');
mkdirSync(new URL('../tmp/',import.meta.url),{recursive:true});
const db=new Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres'});
const snapshotQuery=`select jsonb_build_object(
  'accounts',(select jsonb_agg(id order by id) from auth.users),
  'profiles',(select jsonb_agg(jsonb_build_array(id,display_name,date_of_birth,bio,terms_accepted_version,onboarding_completed_at) order by id) from public.profiles),
  'photos',(select jsonb_agg(jsonb_build_array(id,profile_id,storage_path,approval_status) order by id) from public.profile_photos),
  'reports',(select jsonb_agg(jsonb_build_array(id,reporter_id,reported_id,category,details,status) order by id) from public.reports),
  'conversation',(select jsonb_agg(jsonb_build_array(id,participant_low,participant_high) order by id) from public.conversations),
  'messages',(select jsonb_agg(jsonb_build_array(id,conversation_id,sender_id,body) order by id) from public.messages),
  'blocks',(select jsonb_agg(jsonb_build_array(blocker_id,blocked_id) order by blocker_id,blocked_id) from public.blocks),
  'boundary',(select md5(extensions.st_asewkb(boundary)::text) from private.iceland_boundaries where id=1)
) as snapshot`;
await db.connect();
try {
  const {rows}=await db.query("select count(*)::int as real_accounts from auth.users where email is null or email not like '%@example.test'");
  if(rows[0].real_accounts)throw new Error('Refusing a database with non-synthetic accounts');
  if(mode==='prepare') {
    const migrations=await db.query('select version from supabase_migrations.schema_migrations order by version');
    assert.deepEqual(migrations.rows,[{version:'20260831150105'}], 'Prepare requires only the original migration');
    await db.query(`begin;
      alter default privileges for role postgres in schema public revoke all on sequences from anon,authenticated,service_role;
      alter default privileges for role postgres in schema public revoke all on functions from anon,authenticated,service_role;
      alter default privileges for role postgres in schema public revoke select,insert,update,delete on tables from anon,authenticated,service_role;
      revoke select,insert,update,delete on all tables in schema public from service_role;
      revoke execute on all functions in schema public from service_role;
      create function public.rehearsal_auto_rls() returns event_trigger language plpgsql security definer set search_path=pg_catalog as $f$
      declare command record; begin
        for command in select * from pg_event_trigger_ddl_commands() where schema_name='public' and object_type in ('table','partitioned table') loop
          execute format('alter table if exists %s enable row level security',command.object_identity);
        end loop;
      end; $f$;
      revoke execute on function public.rehearsal_auto_rls() from public,anon,authenticated,service_role;
      create event trigger rehearsal_ensure_rls on ddl_command_end when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') execute function public.rehearsal_auto_rls();
      insert into public.conversations(id,participant_low,participant_high,created_by) values ('30000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
      insert into public.conversation_members(conversation_id,user_id) values ('30000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001'),('30000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000002');
      insert into public.messages(id,conversation_id,sender_id,body) values ('40000000-0000-0000-0000-000000000099','30000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001','Synthetic upgrade preservation fixture');
      insert into public.blocks(blocker_id,blocked_id) values ('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002');
      commit;`);
    const {rows}=await db.query(snapshotQuery);
    assert.equal(rows[0].snapshot.boundary,'623df3c2eb8a535843d9904b0628dfe8','Local Iceland boundary matches the hosted configuration');
    writeFileSync(new URL('../tmp/upgrade-preservation.json',import.meta.url),JSON.stringify(rows[0].snapshot,null,2));
    console.log('Prepared synthetic records, stricter hosted grants and automatic public-table RLS. Now run the local migration upgrade.');
  } else {
    const expected=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(name=>/^\d+_.*\.sql$/.test(name)).map(name=>({version:name.split('_')[0]})).sort((a,b)=>a.version.localeCompare(b.version));
    assert.deepEqual((await db.query('select version from supabase_migrations.schema_migrations order by version')).rows,expected,'All checked-in migrations must be applied before verifying preservation');
    const before=JSON.parse(readFileSync(new URL('../tmp/upgrade-preservation.json',import.meta.url),'utf8'));
    const {rows}=await db.query(snapshotQuery);
    assert.deepEqual(rows[0].snapshot,before,'Existing data must survive the upgrade unchanged');
    console.log('Upgrade preserved accounts, profile fields, photo metadata, reports, conversations, messages, blocks and the Iceland boundary.');
    await db.query("delete from public.conversations where id='30000000-0000-0000-0000-000000000099'; delete from public.blocks where blocker_id='10000000-0000-0000-0000-000000000003' and blocked_id='10000000-0000-0000-0000-000000000002';");
  }
} finally {await db.end();}
