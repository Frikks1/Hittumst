import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const walk=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(`${directory}/${entry.name}`):[`${directory}/${entry.name}`]);
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const listed=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const sourceFiles=[...new Set(listed)].filter(file=>existsSync(file)&&(/^(apps|packages|supabase|scripts|\.github)\//.test(file)||['package.json','package-lock.json','eslint.config.mjs','tsconfig.json'].includes(file))).sort();
const manifest=sourceFiles.map(file=>({path:file,sha256:hash(file)}));
const app=json('apps/mobile/app.json').expo;
const result={generatedAt:new Date().toISOString(),scope:'Source inventory and synthetic local database catalog. File presence is not proof of functional completion or hosted deployment.',releaseVersion:app.version,iosBundleIdentifier:app.ios.bundleIdentifier,androidPackage:app.android.package,gitHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceState:'Uncommitted working tree; existing unrelated work preserved',sourceManifestSha256:createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),mobileRoutes:walk('apps/mobile/app').filter(file=>file.endsWith('.tsx')&&!file.endsWith('_layout.tsx')).sort(),adminPages:walk('apps/admin/src/app').filter(file=>file.endsWith('/page.tsx')).sort(),adminRoutes:walk('apps/admin/src/app').filter(file=>file.endsWith('/route.ts')).sort(),edgeFunctions:readdirSync('supabase/functions',{withFileTypes:true}).filter(entry=>entry.isDirectory()&&existsSync(`supabase/functions/${entry.name}/index.ts`)).map(entry=>entry.name).sort(),migrations:readdirSync('supabase/migrations').filter(file=>file.endsWith('.sql')).sort().map(file=>({path:`supabase/migrations/${file}`,sha256:hash(`supabase/migrations/${file}`)})),packages:['package.json','apps/mobile/package.json','apps/admin/package.json','packages/shared/package.json'].map(file=>({path:file,...json(file)})),sourceManifest:manifest};
if(process.argv.includes('--local-catalog')){
  const db=new pg.Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres'});
  await db.connect();
  try{
    result.localDatabase={scope:'Read-only catalog of isolated localhost Supabase; no user rows or credentials exported',tables:(await db.query(`select n.nspname as schema,c.relname as name,c.relrowsecurity as rls_enabled,c.relforcerowsecurity as rls_forced,(select count(*)::int from pg_policy p where p.polrelid=c.oid) as policy_count,(select jsonb_agg(jsonb_build_object('name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p') order by n.nspname,c.relname`)).rows,functions:(await db.query(`select n.nspname as schema,p.proname as name,pg_get_function_identity_arguments(p.oid) as arguments,p.prosecdef as security_definer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1,2,3`)).rows,migrations:(await db.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(row=>row.version),storageBuckets:(await db.query('select id,public,file_size_limit,allowed_mime_types from storage.buckets order by id')).rows};
  }finally{await db.end();}
}
writeFileSync('docs/release-inventory.json',`${JSON.stringify(result,null,2)}\n`);
console.log(JSON.stringify({version:result.releaseVersion,mobileRoutes:result.mobileRoutes.length,adminPages:result.adminPages.length,adminRoutes:result.adminRoutes.length,edgeFunctions:result.edgeFunctions,migrations:result.migrations.length,sourceFiles:manifest.length,sourceManifestSha256:result.sourceManifestSha256,localTables:result.localDatabase?.tables.length}));