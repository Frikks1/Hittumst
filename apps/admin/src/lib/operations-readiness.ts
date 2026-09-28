const requiredWorkers = ['account-deletion', 'media', 'commerce', 'push', 'voice', 'billing'] as const;
const queueNames = ['media', 'cleanup', 'accountDeletion', 'push', 'billing'] as const;
type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}; }
function count(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
/** Only fixed names, enum states and nonnegative counters leave this boundary. */
export function evaluateReadiness(value: unknown) {
  const input = object(value);
  const rawWorkers = object(input.workers);
  const rawQueues = object(input.queues);
  const issues: string[] = [];
  const workers: Record<string, { state: string; ageSeconds: number | null }> = {};
  const queues: Record<string, { pending: number; overdue: number; failed: number }> = {};
  for (const name of requiredWorkers) {
    const item = object(rawWorkers[name]);
    const state = ['running', 'passed', 'failed'].includes(String(item.state)) ? String(item.state) : 'missing';
    const ageSeconds = count(item.ageSeconds) ? item.ageSeconds : null;
    workers[name] = { state, ageSeconds };
    if (state === 'missing' || state === 'failed' || ageSeconds === null || ageSeconds > (name === 'voice' ? 30 : 120) ||
      !count(item.successAgeSeconds) || item.successAgeSeconds > 1200) issues.push(name + '_unhealthy');
  }
  for (const name of queueNames) {
    const item = object(rawQueues[name]);
    if (![item.pending, item.overdue, item.failed].every(count)) { issues.push(name + '_metrics_missing'); continue; }
    queues[name] = { pending: item.pending as number, overdue: item.overdue as number, failed: item.failed as number };
    if ((item.overdue as number) > 0 || (item.failed as number) > 0) issues.push(name + '_backlog');
  }
  return { status: issues.length ? 'degraded' : 'ok', issues, workers, queues };
}

