// Production compilation and HTTP verification without loading any local .env file.
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDir = path.join(root, 'artifacts/operations');
await mkdir(path.join(root, 'tmp'), { recursive: true });
await mkdir(artifactDir, { recursive: true });
const reportPath = path.join(artifactDir, 'admin-production-http.json');
// Invalidate the previous result before building, so failed reruns cannot reuse stale success.
await writeFile(
  reportPath,
  JSON.stringify(
    {
      schemaVersion: 1,
      scope: 'isolated-local-admin-production-build-and-http',
      startedAt: new Date().toISOString(),
      buildPassed: false,
      passed: false,
      state: 'running',
      checks: [],
    },
    null,
    2,
  ) + '\n',
);
const snapshot = await mkdtemp(path.join(root, 'tmp/admin-production-check-'));
const admin = path.join(root, 'apps/admin');
await cp(admin, snapshot, {
  recursive: true,
  filter: (source) => {
    const basename = path.basename(source);
    return !basename.startsWith('.env') && !['node_modules', '.next', '.git'].includes(basename);
  },
});
// Preserve the admin workspace's pinned TypeScript installation; no environment files are linked.
await symlink(
  path.join(admin, 'node_modules'),
  path.join(snapshot, 'node_modules'),
  process.platform === 'win32' ? 'junction' : 'dir',
);
if ((await readdir(snapshot)).some((name) => name.startsWith('.env')))
  throw new Error('Environment isolation failed.');

const runtime = {};
for (const name of [
  'PATH',
  'Path',
  'SystemRoot',
  'WINDIR',
  'ComSpec',
  'PATHEXT',
  'TEMP',
  'TMP',
  'LOCALAPPDATA',
  'APPDATA',
  'USERPROFILE',
  'HOME',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'PROCESSOR_ARCHITECTURE',
  'NUMBER_OF_PROCESSORS',
]) {
  if (process.env[name]) runtime[name] = process.env[name];
}
const listener = createServer();
await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const origin = 'http://127.0.0.1:' + port;
const cronSecret = randomBytes(32).toString('hex');
Object.assign(runtime, {
  NODE_ENV: 'production',
  CI: 'true',
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_build_fixture',
  NEXT_PUBLIC_APP_URL: origin,
  NEXT_PUBLIC_RUMMAL_DEMO_MODE: 'false',
  HITTUMST_APP_ENV: 'staging',
  HITTUMST_POLICIES_APPROVED: 'false',
  HITTUMST_PUBLIC_RELEASE: 'false',
  COMMERCE_MODE: 'disabled',
  CRON_SECRET: cronSecret,
});
const next = path.join(root, 'node_modules/next/dist/bin/next');
let buildLog = '';
console.log(
  'Building an isolated admin source copy; .env files and deployment credentials are excluded.',
);
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [next, 'build', snapshot], {
    cwd: snapshot,
    env: runtime,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error('Admin build timed out.'));
  }, 300000);
  const consume = (chunk) => {
    buildLog += chunk.toString();
  };
  child.stdout.on('data', consume);
  child.stderr.on('data', consume);
  child.on('error', (error) => {
    clearTimeout(timer);
    reject(error);
  });
  child.on('exit', (code) => {
    clearTimeout(timer);
    code === 0 ? resolve() : reject(new Error('Admin build failed with exit ' + code));
  });
}).catch(async (error) => {
  await writeFile(path.join(artifactDir, 'admin-production-build.log'), buildLog);
  throw error;
});
await writeFile(path.join(artifactDir, 'admin-production-build.log'), buildLog);
console.log(
  'Production build passed; verifying local public routes and authenticated deployment identity.',
);
const server = spawn(
  process.execPath,
  [next, 'start', snapshot, '--hostname', '127.0.0.1', '--port', String(port)],
  { cwd: snapshot, env: runtime, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverLog = '';
server.stdout.on('data', (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  serverLog += chunk.toString();
});
const checks = [];
const record = (name, passed, detail) =>
  checks.push({ name, passed, ...(detail ? { detail } : {}) });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Local production server did not become ready.');
  for (const pathname of [
    '/',
    '/privacy',
    '/support',
    '/delete-account',
    '/account',
    '/terms',
    '/community',
    '/child-safety',
  ]) {
    const texts = {};
    for (const language of ['is', 'en']) {
      const response = await fetch(origin + pathname + (language === 'en' ? '?lang=en' : ''), {
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.text();
      texts[language] = body
        .match(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/i)?.[1]
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const name = pathname + ' [' + language + ']';
      record(name + ' public response', response.status === 200 && body.includes('Hittumst'), {
        status: response.status,
      });
      record(name + ' no staff session cookie', !response.headers.has('set-cookie'));
      record(
        name + ' security headers',
        response.headers.get('x-frame-options') === 'DENY' &&
          response.headers.get('x-content-type-options') === 'nosniff',
      );
      record(name + ' indexing blocked before approval', /noindex/.test(body));
    }
    record(pathname + ' localized content', Boolean(texts.is && texts.en && texts.is !== texts.en));
  }
  const missing = await fetch(origin + '/nonexistent-release-document', { redirect: 'manual' });
  record('Unknown public document returns 404', missing.status === 404);
  const portalDenied = await fetch(origin + '/api/account/lifecycle');
  record('Account portal requires a live member session', portalDenied.status === 403);
  const deletionDenied = await fetch(origin + '/api/account/lifecycle', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',confirmation:'DELETE'})});
  record('Account deletion cannot use an anonymous request', deletionDenied.status !== 202);
  const live = await fetch(origin + '/api/operations/live');
  record('Liveness responds without exposing service details', live.status === 200 && JSON.stringify(await live.json()) === JSON.stringify({status:'ok'}));
  const readyDenied = await fetch(origin + '/api/operations/ready');
  record('Readiness requires operator authorization', readyDenied.status === 401);
  const readinessResponse = await fetch(origin + '/api/operations/ready', {headers:{Authorization:'Bearer ' + cronSecret}});
  record('Missing backend cannot report ready', readinessResponse.status === 503 && (await readinessResponse.json()).status === 'degraded');
  const financeDenied = await fetch(origin + '/finance', {redirect:'manual'});
  record('Finance console requires a staff session', [302,303,307,308].includes(financeDenied.status) && (financeDenied.headers.get('location')??'').includes('/login'));
  const unauthorized = await fetch(origin + '/api/operations/health');
  record('Deployment identity rejects unauthenticated callers', unauthorized.status === 401);
  const authorized = await fetch(origin + '/api/operations/health', {
    headers: { Authorization: 'Bearer ' + cronSecret },
  });
  const identity = await authorized.json();
  record(
    'Authenticated staging identity is exact and contains no credential',
    authorized.status === 200 &&
      JSON.stringify(identity) ===
        JSON.stringify({
          status: 'ok',
          appEnvironment: 'staging',
          supabaseProjectRef: 'abcdefghijklmnopqrst',
        }) &&
      !JSON.stringify(identity).includes(cronSecret),
  );
  record(
    'Deployment identity cannot be cached',
    authorized.headers.get('cache-control') === 'no-store',
  );
  const report = {
    schemaVersion: 1,
    releaseVersion: JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version,
    scope: 'isolated-local-admin-production-build-and-http',
    completedAt: new Date().toISOString(),
    buildPassed: true,
    passed: checks.every((check) => check.passed),
    checks,
    limitations: [
      'Synthetic build configuration only; no real backend, hosted deployment, signing or legal approval was verified.',
      'Source copy excludes all .env files; installed workspace dependencies are reused. Snapshot retained under tmp for review.',
    ],
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        checks: checks.length,
        failed: checks.filter((check) => !check.passed),
      },
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
} finally {
  server.kill();
  await writeFile(path.join(artifactDir, 'admin-production-server.log'), serverLog);
}
