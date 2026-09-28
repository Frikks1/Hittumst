// Local synthetic application recovery; no hosted URL or source-reset option exists.
import { Client } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const connection = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
  connectionTimeoutMillis: 5000,
  query_timeout: 120000,
};
const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';
const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
const triggerQuery =
  "select e.evtname,e.evtevent,e.evtenabled,e.evttags,pg_get_userbyid(e.evtowner) as owner,n.nspname as function_schema,p.proname as function_name from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid join pg_namespace n on n.oid=p.pronamespace where not exists(select 1 from pg_depend d where d.classid='pg_event_trigger'::regclass and d.objid=e.oid and d.deptype='e') order by e.evtname";

export function assertLocalDocker(endpoint) {
  if (!/^(unix:\/\/\/|npipe:\/\/)/.test(endpoint.trim()))
    throw new Error('Recovery requires a local Docker socket, never a remote daemon.');
}
export function assertDisposableDatabase(name) {
  if (!/^hittumst_restore_[a-f0-9]{32}$/.test(name))
    throw new Error('Refusing a non-disposable recovery database.');
}
async function docker(args, input = '') {
  const binary = process.platform === 'win32' ? 'wsl.exe' : 'docker';
  const prefix = process.platform === 'win32' ? ['-d', 'Ubuntu', '-u', 'root', '--', 'docker'] : [];
  return new Promise((resolve, reject) => {
    const child = execFile(
      binary,
      [...prefix, '--context', 'default', ...args],
      {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 180000,
        maxBuffer: 2 * 1024 * 1024,
      },
      (error, stdout) => {
        if (error) {
          // Tool errors can echo member data. Expose the operation and exit code only.
          reject(
            new Error(
              'Local recovery subprocess failed (' +
                (args[0] === 'exec' ? args[2] : args[0]) +
                ', exit ' +
                (error.code ?? 'unknown') +
                ').',
            ),
          );
        } else resolve(stdout.trim());
      },
    );
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
async function tableFingerprints(db) {
  const tables = await db.query(
    "select schemaname,tablename from pg_tables where schemaname in ('public','private','auth','storage','supabase_migrations') order by schemaname,tablename",
  );
  const results = [];
  for (const table of tables.rows) {
    const qualified = identifier(table.schemaname) + '.' + identifier(table.tablename);
    const { rows } = await db.query(
      "select count(*)::int as count,md5(coalesce(string_agg(row_hash,'' order by row_hash),'')) as hash from (select md5(to_jsonb(record)::text) as row_hash from " +
        qualified +
        ' record) hashes',
    );
    results.push({ table: table.schemaname + '.' + table.tablename, ...rows[0] });
  }
  return results;
}

export async function rehearseBackupRestore() {
  const started = Date.now();
  assertLocalDocker(await docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']));
  const config = await readFile(path.join(root, 'supabase/config.toml'), 'utf8');
  const projectId = config.match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"\s*$/m)?.[1];
  if (!projectId) throw new Error('The local Supabase project identifier could not be verified.');
  const container = 'supabase_db_' + projectId;
  const labels = JSON.parse(
    await docker(['inspect', container, '--format', '{{json .Config.Labels}}']),
  );
  if (labels['com.supabase.cli.project'] !== projectId)
    throw new Error('Container is not the expected local Supabase project.');
  const name = 'hittumst_restore_' + randomUUID().replaceAll('-', '');
  assertDisposableDatabase(name);
  const archive = '/tmp/' + name + '.dump';
  const toc = archive + '.list';
  const source = new Client(connection);
  const restored = new Client({ ...connection, database: name });
  let created = false;
  let connected = false;
  let report;
  try {
    await source.connect();
    await source.query('begin isolation level repeatable read read only');
    const accounts = await source.query(
      "select count(*)::int as total,count(*) filter (where email is null or email not like '%@example.test')::int as real_accounts from auth.users",
    );
    if (accounts.rows[0].total < 4 || accounts.rows[0].real_accounts > 0)
      throw new Error('Refusing a source without at least four exclusively synthetic accounts.');
    const snapshot = (await source.query('select pg_export_snapshot() as id')).rows[0].id;
    const before = await tableFingerprints(source);
    const catalogSql = (
      await readFile(path.join(root, 'scripts/database-catalog.sql'), 'utf8')
    ).replace(
      'unnest(relacl)',
      "unnest(coalesce(relacl,acldefault(case when relkind='S' then 's'::\"char\" else 'r'::\"char\" end,relowner)))",
    );
    const catalogBefore = (await source.query(catalogSql)).rows;
    const triggersBefore = (await source.query(triggerQuery)).rows;
    await docker([
      'exec',
      container,
      'pg_dump',
      '-U',
      'supabase_admin',
      '--dbname=postgres',
      '--format=custom',
      '--exclude-extension=pg_cron',
      '--exclude-schema=cron',
      '--lock-wait-timeout=10000',
      '--snapshot=' + snapshot,
      '--file=' + archive,
    ]);
    // Supabase protects event-trigger ownership. Recreate these as their original owners after
    // the normal privileged restore; this also preserves owner/ACL restoration order elsewhere.
    const entries = await docker(['exec', container, 'pg_restore', '--list', archive]);
    const withoutTriggers = entries
      .split('\n')
      .filter((line) => !/ EVENT TRIGGER /.test(line))
      .join('\n');
    await docker(['exec', '-i', container, 'tee', toc], withoutTriggers + '\n');
    await docker([
      'exec',
      container,
      'createdb',
      '-U',
      'supabase_admin',
      '--template=template0',
      '--owner=postgres',
      name,
    ]);
    created = true;
    await docker([
      'exec',
      container,
      'pg_restore',
      '-U',
      'supabase_admin',
      '--exit-on-error',
      '--use-list=' + toc,
      '--dbname=' + name,
      archive,
    ]);
    for (const trigger of triggersBefore) {
      if (
        !['ddl_command_start', 'ddl_command_end', 'sql_drop', 'table_rewrite'].includes(
          trigger.evtevent,
        )
      )
        throw new Error('Unrecognized event trigger.');
      const tags = trigger.evttags?.length
        ? ' WHEN TAG IN (' + trigger.evttags.map(literal).join(',') + ')'
        : '';
      const enabled = { O: 'ENABLE', D: 'DISABLE', A: 'ENABLE ALWAYS', R: 'ENABLE REPLICA' }[
        trigger.evtenabled
      ];
      if (!enabled) throw new Error('Unrecognized trigger state.');
      const sql =
        'SET ROLE ' +
        identifier(trigger.owner) +
        '; CREATE EVENT TRIGGER ' +
        identifier(trigger.evtname) +
        ' ON ' +
        trigger.evtevent +
        tags +
        ' EXECUTE FUNCTION ' +
        identifier(trigger.function_schema) +
        '.' +
        identifier(trigger.function_name) +
        '(); ALTER EVENT TRIGGER ' +
        identifier(trigger.evtname) +
        ' ' +
        enabled +
        ';';
      await docker([
        'exec',
        container,
        'psql',
        '-U',
        'supabase_admin',
        '-d',
        name,
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        sql,
      ]);
    }
    await restored.connect();
    connected = true;
    const after = await tableFingerprints(restored);
    const catalogAfter = (await restored.query(catalogSql)).rows;
    const triggersAfter = (await restored.query(triggerQuery)).rows;
    const dataMatches = JSON.stringify(before) === JSON.stringify(after);
    const schemaMatches = JSON.stringify(catalogBefore) === JSON.stringify(catalogAfter);
    const afterByKey = new Map(catalogAfter.map((item) => [item.key, item]));
    const schemaDifferences = catalogBefore
      .filter((item) => JSON.stringify(item) !== JSON.stringify(afterByKey.get(item.key)))
      .map((item) => ({
        key: item.key,
        fields: Object.keys(item.definition).filter(
          (key) =>
            JSON.stringify(item.definition[key]) !==
            JSON.stringify(afterByKey.get(item.key)?.definition[key]),
        ),
      }));
    const eventTriggersMatch = JSON.stringify(triggersBefore) === JSON.stringify(triggersAfter);
    let restoredAssertions = 0;
    let restoredSuites = 0;
    let restoredTestsPassed = true;
    const restoredResults = [];
    for (const file of (await readdir(path.join(root, 'supabase/tests/database')))
      .filter((name) => name.endsWith('.test.sql'))
      .sort()) {
      const lines = [];
      try {
        const query = new (await import('pg')).default.Query(
          await readFile(path.join(root, 'supabase/tests/database', file), 'utf8'),
        );
        query.on('row', (row) =>
          lines.push(
            ...Object.values(row)
              .filter((value) => typeof value === 'string')
              .flatMap((value) => value.split('\n')),
          ),
        );
        await new Promise((resolve, reject) => {
          query.callback = (error) => (error ? reject(error) : resolve());
          restored.query(query);
        });
        const assertions = lines.filter((line) => /^(not )?ok \d+/.test(line));
        const plan = lines.findLast((line) => /^1\.\.\d+$/.test(line));
        restoredAssertions += assertions.length;
        restoredSuites++;
        const passed =
          assertions.length > 0 &&
          Number(plan?.slice(3)) === assertions.length &&
          !assertions.some((line) => line.startsWith('not ok'));
        restoredResults.push({ file, assertions: assertions.length, passed });
        if (!passed) restoredTestsPassed = false;
      } catch {
        restoredResults.push({ file, assertions: 0, passed: false, error: 'sql_execution_failed' });
        restoredTestsPassed = false;
        await restored.query('rollback');
      }
    }
    report = {
      schemaVersion: 1,
      scope: 'local-synthetic-application-database-restore',
      completedAt: new Date().toISOString(),
      elapsedMilliseconds: Date.now() - started,
      accounts: accounts.rows[0].total,
      tablesCompared: before.length,
      rowsCompared: before.reduce((total, table) => total + table.count, 0),
      applicationCatalogObjectsCompared: catalogBefore.length,
      eventTriggersCompared: triggersBefore.length,
      schemaDifferences,
      dataMatches,
      schemaMatches,
      eventTriggersMatch,
      passed: dataMatches && schemaMatches && eventTriggersMatch && restoredTestsPassed,
      restoredAssertions,
      restoredSuites,
      restoredTestsPassed,
      restoredResults,
      sourceFingerprint: createHash('sha256').update(JSON.stringify(before)).digest('hex'),
      limitations: [
        'The pg_cron extension/schema is excluded because it requires a database named postgres. Storage object bytes, cluster role passwords, hosted PITR, scheduler restoration, signed devices and provider recovery are not covered.',
      ],
    };
  } finally {
    if (connected) await restored.end();
    await source.query('rollback').catch(() => {});
    await source.end().catch(() => {});
    assertDisposableDatabase(name);
    if (created)
      await docker([
        'exec',
        container,
        'dropdb',
        '-U',
        'supabase_admin',
        '--if-exists',
        '--force',
        name,
      ]);
    await docker(['exec', container, 'rm', '-f', '--', archive, toc]);
  }
  await mkdir(path.join(root, 'artifacts/operations'), { recursive: true });
  await writeFile(
    path.join(root, 'artifacts/operations/local-restore.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  rehearseBackupRestore()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (!report.passed) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
