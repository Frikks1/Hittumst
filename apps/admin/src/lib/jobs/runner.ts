export const workerNames = ['account-deletion', 'media', 'commerce', 'push', 'voice', 'billing'] as const;
export type WorkerName = (typeof workerNames)[number];
export type WorkerResult = { ok: boolean; busy: boolean; metrics: Record<string, number> };
type Body = Record<string, unknown>;
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
/** Provider bodies and exceptions never enter logs or heartbeat rows. */
export function inspectWorkerResult(name: WorkerName, responseOk: boolean, raw: unknown): WorkerResult {
  const body = raw && typeof raw === 'object' ? raw as Body : {};
  const metrics: Record<string, number> = {};
  let ok = responseOk && !body.error;
  let busy = false;
  if (name === 'account-deletion') {
    ok = ok && count(body.complete) && body.retry === 0;
    if (count(body.complete)) metrics.complete = body.complete;
    if (count(body.retry)) metrics.retry = body.retry;
    busy = count(body.complete) && body.complete > 0;
  } else if (name === 'media') {
    const cleanup = (body.cleanup ?? {}) as Body;
    ok = ok && (body.processed === 0 || (body.processed === 1 && typeof body.approved === 'boolean')) &&
      count(cleanup.cleaned) && cleanup.retry === 0;
    if (count(body.processed)) metrics.processed = body.processed;
    if (count(cleanup.cleaned)) metrics.cleaned = cleanup.cleaned;
    if (count(cleanup.retry)) metrics.retry = cleanup.retry;
    busy = body.processed === 1 || (count(cleanup.cleaned) && cleanup.cleaned > 0);
  } else if (name === 'commerce') {
    // Live adapters must explicitly declare their mode; never call sandbox success production evidence.
    ok = ok && body.processed === true && typeof body.sandbox === 'boolean';
  } else if (name === 'billing') {
    ok = ok && body.disabled !== true && count(body.processed) && typeof body.pending === 'boolean' && typeof body.sandbox === 'boolean';
    if (count(body.processed)) metrics.processed = body.processed;
    busy = count(body.processed) && body.processed > 0 && body.pending === true;
  } else if (name === 'voice') {
    ok = ok && body.ok === true && body.disabled !== true && count(body.revoked) && count(body.ended);
    if (count(body.revoked)) metrics.revoked = body.revoked;
    if (count(body.ended)) metrics.ended = body.ended;
  } else {
    ok = ok && body.ok === true;
    for (const group of ['sent', 'receipts']) {
      const counters = body[group] as Body | undefined;
      for (const key of ['claimed', 'deliveries', 'requested', 'received', 'failed', 'retry']) {
        if (count(counters?.[key])) metrics[group + '_' + key] = counters[key] as number;
      }
      if (count(counters?.failed) && counters.failed > 0) ok = false;
      if (count(counters?.retry) && counters.retry > 0) ok = false;
    }
    busy = false; // Push receipt timing and batches are owned by its Edge Function.
  }
  return { ok: Boolean(ok), busy, metrics };
}

export async function drainWorker(
  name: WorkerName,
  invoke: () => Promise<{ ok: boolean; body: unknown }>,
  options: { maxBatches?: number; budgetMs?: number; now?: () => number; stopping?: () => boolean } = {},
) {
  const { maxBatches = 10, budgetMs = 600_000, now = Date.now, stopping = () => false } = options;
  if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 100 || budgetMs < 1)
    throw new Error('invalid_worker_budget');
  const started = now();
  const totals: Record<string, number> = {};
  let batches = 0;
  let ok = true;
  let busy = false;
  while (batches < maxBatches && now() - started < budgetMs && !stopping()) {
    batches++;
    try {
      const response = await invoke();
      const result = inspectWorkerResult(name, response.ok, response.body);
      for (const [key, value] of Object.entries(result.metrics)) totals[key] = (totals[key] ?? 0) + value;
      ok = result.ok;
      busy = result.busy;
      if (!ok || !busy) break;
    } catch {
      ok = false;
      break;
    }
  }
  return { ok, batches, limited: busy && (batches >= maxBatches || now() - started >= budgetMs),
    metrics: totals, durationMs: Math.max(0, now() - started) };
}

