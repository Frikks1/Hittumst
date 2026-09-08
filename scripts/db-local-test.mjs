// Execute the repository's real pgTAP cases when the Docker CLI is unavailable
// on Windows. This runner has no remote-connection option.
import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = new pg.Client({ host: '127.0.0.1', port: 54322, database: 'postgres', user: 'postgres', password: 'postgres', connectionTimeoutMillis: 5000, query_timeout: 120000 });
let failed = false;
try {
  await client.connect();
  const { rows } = await client.query("select count(*)::int as accounts, bool_and(email like '%@example.test') as synthetic from auth.users");
  if (rows[0].accounts < 4 || !rows[0].synthetic) throw new Error('Expected an exclusively synthetic local Supabase database');
  await client.query('create extension if not exists pgtap with schema extensions');
  const directory = path.join(root, 'supabase/tests/database');
  const files = (await readdir(directory)).filter(file => file.endsWith('.test.sql')).sort();
  for (const file of files) {
    const lines = [];
    try {
      const query = new pg.Query(await readFile(path.join(directory, file), 'utf8'));
      query.on('row', row => lines.push(...Object.values(row).filter(value => typeof value === 'string').flatMap(value => value.split('\n'))));
      await new Promise((resolve, reject) => {
        query.callback = error => error ? reject(error) : resolve();
        client.query(query);
      });
      const assertions = lines.filter(line => /^(not )?ok \d+/.test(line));
      const plan = lines.findLast(line => /^1\.\.\d+$/.test(line));
      const failures = lines.filter(line => /^not ok |^#/.test(line));
      const passed = assertions.length > 0 && Number(plan?.slice(3)) === assertions.length && !assertions.some(line => line.startsWith('not ok'));
      if (!passed) failed = true;
      console.log(`${passed ? 'PASS' : 'FAIL'} ${file}: ${assertions.length} database assertions`);
      for (const line of failures) console.log(line);
    } catch (error) {
      failed = true;
      console.error(`FAIL ${file}: ${error.message}`);
      if (error.where) console.error(error.where);
      for (const line of lines.filter(line => /^not ok |^#/.test(line))) console.log(line);
      await client.query('rollback');
    }
  }
} catch (error) {
  failed = true;
  console.error(error.message);
} finally {
  await client.end();
}
process.exitCode = failed ? 1 : 0;
