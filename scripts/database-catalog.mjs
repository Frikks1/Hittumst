import { Client } from 'pg';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
mkdirSync(new URL('../tmp/',import.meta.url),{recursive:true});
const client = new Client({host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres'});
await client.connect();
try {
  const check=await client.query("select count(*)::int as real_accounts from auth.users where email is null or email not like '%@example.test'");
  if(check.rows[0].real_accounts)throw new Error('Local database contains non-synthetic accounts; refusing development snapshot');
  const {rows}=await client.query(readFileSync(new URL('./database-catalog.sql',import.meta.url),'utf8'));
  writeFileSync(new URL('../tmp/local-catalog.json',import.meta.url),JSON.stringify(rows,null,2));
  console.log(`Recorded ${rows.length} local schema/configuration objects; no member rows exported.`);
} finally {await client.end();}
