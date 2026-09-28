const knownProduction = 'yztxwdhajgoqvtsqmcdw';
export function workloadConfig(env, smoke = false) {
  const projectRef = env.STAGING_WORKLOAD_PROJECT_REF;
  let url;
  try { url = new URL(env.STAGING_WORKLOAD_URL); } catch { throw new Error('staging_configuration_required'); }
  if (!/^[a-z]{20}$/.test(projectRef ?? '') || projectRef === knownProduction ||
      env.STAGING_WORKLOAD_SYNTHETIC_CONFIRMED !== 'true' || env.STAGING_WORKLOAD_ALLOW_WRITES !== 'true' ||
      url.href !== `https://${projectRef}.supabase.co/` ||
      !env.STAGING_WORKLOAD_PUBLISHABLE_KEY?.startsWith('sb_publishable_') ||
      !env.STAGING_WORKLOAD_SECRET_KEY?.startsWith('sb_secret_')) throw new Error('isolated_synthetic_staging_required');
  return { projectRef, origin: url.origin, publishableKey: env.STAGING_WORKLOAD_PUBLISHABLE_KEY,
    secretKey: env.STAGING_WORKLOAD_SECRET_KEY, accounts: smoke ? 12 : 1000,
    occurrences: smoke ? 4 : 200, concurrent: smoke ? 10 : 100, durationMs: smoke ? 30000 : 1800000,
    smoke, thresholds: { read: 750, write: 1000, storage: 5000, realtime: 2000 } };
}
export function requireSyntheticUsers(users) {
  if (!Array.isArray(users) || users.some(user => typeof user.email !== 'string' || !user.email.endsWith('@example.test')))
    throw new Error('non_synthetic_account_present');
}
export function evaluateWorkload(samples, thresholds, isolationFailures = 0) {
  const metrics = {};
  const issues = [];
  for (const [operation, maximum] of Object.entries(thresholds)) {
    const data = samples.filter(sample => sample.operation === operation);
    const durations = data.map(sample => sample.durationMs).sort((a, b) => a - b);
    const failures = data.filter(sample => !sample.ok).length;
    const p95 = durations.length ? durations[Math.ceil(durations.length * .95) - 1] : null;
    const errorRate = data.length ? failures / data.length : 1;
    metrics[operation] = { requests: data.length, failures, errorRate, p95Milliseconds: p95, targetP95Milliseconds: maximum };
    if (!data.length || errorRate >= .01 || p95 >= maximum || (operation === 'realtime' && failures)) issues.push(operation + '_budget_exceeded');
  }
  if (isolationFailures) issues.push('privacy_isolation_failed');
  return { passed: !issues.length, metrics, isolationFailures, issues };
}
export const fixtureEmail = (runId, index) => `capacity-${runId}-${index}@example.test`;
export async function pool(items, concurrency, action) {
  let next = 0;
  const results = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) await action(items[next++]);
  }));
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
}
