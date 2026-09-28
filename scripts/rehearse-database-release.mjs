// Local synthetic release rehearsal only. No hosted URL, credentials or reset target is accepted.
import { Client } from 'pg';
import { spawn, execFileSync } from 'node:child_process';
import { assertLocalDocker } from './rehearse-backup-restore.mjs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const childEnvironment = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.startsWith('SERVICE_TEST_') && !['DOCKER_HOST', 'DOCKER_CONTEXT'].includes(key),
    ),
  ),
  DOCKER_CONTEXT: 'default',
};
const connection = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
  connectionTimeoutMillis: 2000,
  query_timeout: 10000,
};
const report = {
  schemaVersion: 1,
  scope: 'local-synthetic-database-release-rehearsal',
  startedAt: new Date().toISOString(),
  passed: false,
  state: 'running',
  steps: [],
  limitations: [
    'Local Docker only; no hosted deployment, PITR or storage bytes recovery evidence.',
  ],
};
async function assertExpectedDocker() {
  const invoke = (args) =>
    execFileSync(
      'wsl.exe',
      ['-d', 'Ubuntu', '-u', 'root', '--', 'docker', '--context', 'default', ...args],
      {
        cwd: root,
        env: childEnvironment,
        encoding: 'utf8',
        timeout: 45000,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
  assertLocalDocker(invoke(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']));
  const config = await readFile(path.join(root, 'supabase/config.toml'), 'utf8');
  const id = config.match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"\s*$/m)?.[1];
  if (!id) throw new Error('invalid_local_project');
  const container = JSON.parse(invoke(['inspect', 'supabase_db_' + id]));
  if (
    container.length !== 1 ||
    container[0].Config.Labels['com.supabase.cli.project'] !== id ||
    !container[0].HostConfig.PortBindings['5432/tcp']?.some(
      (binding) => binding.HostPort === '54322',
    )
  )
    throw new Error('unexpected_local_container');
}
async function sourceIsSynthetic() {
  const db = new Client(connection);
  try {
    await db.connect();
    const result = await db.query(
      "select count(*)::int as total,count(*) filter(where email is null or email not like '%@example.test')::int as real_accounts from auth.users",
    );
    if (result.rows[0].total < 4 || result.rows[0].real_accounts > 0)
      throw new Error('synthetic_source_required');
  } finally {
    await db.end();
  }
}
async function ready() {
  for (let attempt = 0; attempt < 90; attempt++) {
    const db = new Client(connection);
    try {
      await db.connect();
      await db.query('select 1');
      return;
    } catch {
    } finally {
      await db.end().catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('local_database_not_ready');
}
async function databaseFingerprint() {
  const names = (await readdir(path.join(root, 'supabase/migrations')))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  const hash = createHash('sha256');
  for (const name of names) {
    hash.update(name).update(await readFile(path.join(root, 'supabase/migrations', name)));
  }
  const tests = (await readdir(path.join(root, 'supabase/tests/database')))
    .filter((name) => name.endsWith('.test.sql'))
    .sort();
  for (const name of tests) {
    hash.update(name).update(await readFile(path.join(root, 'supabase/tests/database', name)));
  }
  return { migrations: names.length, suites: tests.length, sha256: hash.digest('hex') };
}
async function run(name, args, { sql = false } = {}) {
  console.log('Starting ' + name);
  const start = Date.now();
  let output = '';
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: childEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const timeout = setTimeout(() => child.kill(), 1200000);
    const collect = (chunk) => {
      output += chunk.toString('utf8');
      if (output.length > 20 * 1024 * 1024) child.kill();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  await writeFile(path.join(root, 'tmp', 'database-release-' + name + '.log'), output, {
    mode: 0o600,
  });
  const summary = sql ? output.match(/Files=(\d+), Tests=(\d+)/) : null;
  const step = {
    name,
    passed: code === 0 && (!sql || Boolean(summary)),
    exitCode: code,
    elapsedMilliseconds: Date.now() - start,
    ...(summary ? { suites: Number(summary[1]), assertions: Number(summary[2]) } : {}),
  };
  report.steps.push(step);
  console.log(JSON.stringify(step));
  if (!step.passed) throw new Error('local_stage_failed:' + name);
}
async function db(name, command, options) {
  await ready();
  await run(name, ['scripts/db-wsl.mjs', command], options);
  await ready();
}
try {
  if (process.platform !== 'win32')
    throw new Error(
      'Use the CI clean/upgrade matrix on Linux; this coordinator uses the Windows WSL CLI bridge.',
    );
  await mkdir(path.join(root, 'tmp'), { recursive: true });
  await mkdir(path.join(root, 'artifacts/operations'), { recursive: true });
  await writeFile(path.join(root,'artifacts/operations/database-release-rehearsal.json'),JSON.stringify(report,null,2)+'\n');
  await assertExpectedDocker();
  await ready();
  await sourceIsSynthetic();
  report.databaseInputs = await databaseFingerprint();
  await db('clean-reset', 'reset');
  await db('clean-sql', 'test', { sql: true });
  await db('clean-lint', 'lint');
  await run('clean-services', ['scripts/test-service-workflows.mjs']);
  report.services = JSON.parse(
    await readFile(path.join(root, 'tmp/service-workflows-result.json'), 'utf8'),
  );
  await run('clean-logical-recovery', ['scripts/rehearse-backup-restore.mjs']);
  report.recovery = JSON.parse(
    await readFile(path.join(root, 'artifacts/operations/local-restore.json'), 'utf8'),
  );
  await sourceIsSynthetic();
  await db('baseline-reset', 'baseline');
  await run('baseline-prepare', ['scripts/rehearse-baseline-upgrade.mjs', 'prepare']);
  await db('baseline-upgrade', 'upgrade');
  await run('baseline-preservation', ['scripts/rehearse-baseline-upgrade.mjs', 'verify']);
  await db('upgrade-sql', 'test', { sql: true });
  await db('upgrade-lint', 'lint');
  const final = await databaseFingerprint();
  if (final.sha256 !== report.databaseInputs.sha256)
    throw new Error('database_inputs_changed_during_rehearsal');
  report.passed = true;
} catch (error) {
  report.failureCode =
    /^(?:local_stage_failed:[a-z-]+|synthetic_source_required|local_database_not_ready|database_inputs_changed_during_rehearsal)$/.test(
      error.message,
    )
      ? error.message
      : 'local_rehearsal_failed';
  process.exitCode = 1;
} finally {
  report.state = 'completed';
  report.completedAt = new Date().toISOString();
  await mkdir(path.join(root, 'artifacts/operations'), { recursive: true });
  await writeFile(
    path.join(root, 'artifacts/operations/database-release-rehearsal.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      scope: report.scope,
      passed: report.passed,
      failureCode: report.failureCode,
      steps: report.steps.length,
    }),
  );
}
