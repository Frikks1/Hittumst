import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const productionRef = 'yztxwdhajgoqvtsqmcdw';
const jobNames = ['account-deletion', 'media', 'commerce', 'push'];
const allowedCounters = new Set([
  'complete',
  'retry',
  'processed',
  'approved',
  'sandbox',
  'ok',
  'claimed',
  'deliveries',
  'requested',
  'received',
  'cleaned',
]);

function httpsOrigin(value, label) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error();
    if (
      !url.hostname.includes('.') ||
      /(^|\.)(localhost|local|test|invalid|example)$/.test(url.hostname)
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error(label + ' must be an explicit HTTPS origin.');
  }
}

export function stagingOperationsConfig(env) {
  if (
    env.HITTUMST_STAGING_OPERATIONS_ENABLED !== 'true' ||
    env.STAGING_SYNTHETIC_DATA_CONFIRMED !== 'true'
  )
    throw new Error(
      'Staging operations require explicit enablement and a confirmed synthetic-only project.',
    );
  const ref = env.STAGING_SUPABASE_PROJECT_REF;
  if (!/^[a-z]{20}$/.test(ref ?? '') || ref === productionRef)
    throw new Error(
      'An isolated staging Supabase project reference is required; production is denied.',
    );
  const supabaseOrigin = httpsOrigin(env.STAGING_SUPABASE_URL, 'Supabase URL');
  if (supabaseOrigin !== 'https://' + ref + '.supabase.co')
    throw new Error('Staging Supabase URL does not match the approved project reference.');
  const adminOrigin = httpsOrigin(env.STAGING_ADMIN_URL, 'Admin URL');
  const approvedAdminOrigin = httpsOrigin(env.STAGING_APPROVED_ADMIN_ORIGIN, 'Approved admin URL');
  if (adminOrigin !== approvedAdminOrigin)
    throw new Error('Admin URL does not match the independently approved staging origin.');
  if (
    env.PRODUCTION_ADMIN_ORIGIN &&
    adminOrigin === httpsOrigin(env.PRODUCTION_ADMIN_ORIGIN, 'Production admin URL')
  )
    throw new Error('The production admin origin is denied.');
  if (
    (env.STAGING_CRON_SECRET ?? '').length < 32 ||
    (env.STAGING_PUSH_WORKER_SECRET ?? '').length < 32
  )
    throw new Error('Separate worker credentials with at least 32 characters are required.');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.STAGING_SUPABASE_PUBLISHABLE_KEY ?? ''))
    throw new Error('An isolated staging publishable key is required.');
  return {
    ref,
    adminOrigin,
    supabaseOrigin,
    cronSecret: env.STAGING_CRON_SECRET,
    pushSecret: env.STAGING_PUSH_WORKER_SECRET,
    publishableKey: env.STAGING_SUPABASE_PUBLISHABLE_KEY,
  };
}

function safeMetrics(value) {
  if (!value || typeof value !== 'object') return {};
  const metrics = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      allowedCounters.has(key) &&
      (typeof item === 'boolean' || (Number.isSafeInteger(item) && item >= 0))
    )
      metrics[key] = item;
    if (['sent', 'receipts', 'cleanup'].includes(key) && item && typeof item === 'object')
      metrics[key] = safeMetrics(item);
  }
  return metrics;
}

function validJobResult(job, body) {
  if (!body || typeof body !== 'object' || body.error) return false;
  if (job === 'account-deletion')
    return Number.isSafeInteger(body.complete) && body.complete >= 0 && body.retry === 0;
  if (job === 'media')
    return (body.processed === 0 || (body.processed === 1 && typeof body.approved === 'boolean')) &&
      Number.isSafeInteger(body.cleanup?.cleaned) && body.cleanup.cleaned >= 0 && body.cleanup.retry === 0;
  if (job === 'commerce') return body.processed === true && body.sandbox === true;
  return body.ok === true;
}

export async function runStagingOperations(
  config,
  { fetchImpl = fetch, now = () => new Date(), timeoutMs = 330_000, readOnly = false } = {},
) {
  let identityVerified = false;
  try {
    const health = await fetchImpl(config.adminOrigin + '/api/operations/health', {
      headers: { Authorization: 'Bearer ' + config.cronSecret },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(Math.min(timeoutMs, 10000)),
    });
    const identity = health.ok ? await health.json() : null;
    identityVerified =
      identity?.status === 'ok' &&
      identity.appEnvironment === 'staging' &&
      identity.supabaseProjectRef === config.ref;
  } catch {
    /* Verify identity before any operation that can mutate a queue. */
  }
  if (!identityVerified)
    return {
      schemaVersion: 1,
      scope: 'synthetic-staging-worker-execution',
      projectRef: config.ref,
      completedAt: now().toISOString(),
      passed: false,
      code: 'deployment_identity_unverified',
      jobs: [],
    };
  if (readOnly) {
    let passed = false;
    try {
      const response = await fetchImpl(config.adminOrigin + '/api/operations/ready', {
        headers: { Authorization: 'Bearer ' + config.cronSecret }, redirect: 'error',
        cache: 'no-store', signal: AbortSignal.timeout(15000),
      });
      passed = response.ok && (await response.json())?.status === 'ok';
    } catch { /* Aggregate status only; no remote response is logged. */ }
    return { schemaVersion: 1, scope: 'staging-readiness-observation', projectRef: config.ref,
      completedAt: now().toISOString(), passed, code: passed ? 'ok' : 'readiness_failed', jobs: [] };
  }
  const results = [];
  for (const job of jobNames) {
    const isPush = job === 'push';
    const url = isPush
      ? config.supabaseOrigin + '/functions/v1/push-worker'
      : config.adminOrigin + '/api/jobs/' + job;
    const headers = isPush
      ? {
          'x-worker-secret': config.pushSecret,
          apikey: config.publishableKey,
          'Content-Type': 'application/json',
        }
      : { Authorization: 'Bearer ' + config.cronSecret };
    const started = now();
    let result = { job, status: 'failed', code: 'network_or_timeout' };
    try {
      // Never forward a worker credential to a redirect destination.
      const response = await fetchImpl(url, {
        method: isPush ? 'POST' : 'GET',
        headers,
        redirect: 'error',
        cache: 'no-store',
        ...(isPush ? { body: JSON.stringify({ mode: 'all' }) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = response.ok ? await response.json() : null;
      const passed = response.ok && validJobResult(job, body);
      result = {
        job,
        status: passed ? 'passed' : 'failed',
        code: passed ? 'ok' : response.ok ? 'invalid_response_or_retry' : 'http_' + response.status,
        metrics: safeMetrics(body),
      };
    } catch {
      /* Raw responses and error messages can contain credentials or member data. */
    }
    results.push({ ...result, durationMs: Math.max(0, now().getTime() - started.getTime()) });
  }
  return {
    schemaVersion: 1,
    scope: 'synthetic-staging-worker-execution',
    projectRef: config.ref,
    completedAt: now().toISOString(),
    passed: results.every((result) => result.status === 'passed'),
    jobs: results,
  };
}

async function main() {
  const config = stagingOperationsConfig(process.env);
  const report = await runStagingOperations(config, { readOnly: process.argv.includes('--health-only') });
  await mkdir('artifacts/operations', { recursive: true });
  await writeFile('artifacts/operations/staging-jobs.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error(
      'Staging operations refused or failed. Verify the isolated environment configuration; credentials and response bodies are omitted.',
    );
    process.exitCode = 1;
  });
}
