import { captureDiagnostic, flushDiagnostics } from './lib/diagnostics';
import { createClient } from '@supabase/supabase-js';
import { GET as media } from './app/api/jobs/media/route';
import { GET as deletion } from './app/api/jobs/account-deletion/route';
import { POST as voice } from './app/api/jobs/voice/route';
import { GET as billing } from './app/api/jobs/billing/route';
import { GET as commerce } from './app/api/jobs/commerce/route';
import { operationsHealth } from './lib/operations';
import { drainWorker, workerNames, type WorkerName } from './lib/jobs/runner';

const env = process.env;
if (env.WORKER_EXECUTION_ROLE !== 'worker' || env.WORKER_SCHEDULER !== 'render')
  throw new Error('worker_configuration_required');
const identity = operationsHealth(env, 'Bearer ' + env.CRON_SECRET);
if (identity.status !== 200 || !env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_') ||
  !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_') ||
  (env.PUSH_WORKER_SECRET?.length ?? 0) < 32 || (env.VOICE_WORKER_SECRET?.length ?? 0) < 32) throw new Error('worker_configuration_required');
if (env.HITTUMST_APP_ENV === 'staging' && env.STAGING_SYNTHETIC_DATA_CONFIRMED !== 'true')
  throw new Error('synthetic_staging_required');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(30000) }) } });
if (!('supabaseProjectRef' in identity.body) || env.WORKER_EXPECTED_PROJECT_REF !== identity.body.supabaseProjectRef)
  throw new Error('worker_project_identity_mismatch');
let stopping = false;
const wake = new Set<() => void>();
const stop = () => { stopping = true; for (const callback of wake) callback(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
const pause = (milliseconds: number) => new Promise<void>(resolve => {
  const done = () => { clearTimeout(timer); wake.delete(done); resolve(); };
  const timer = setTimeout(done, milliseconds);
  wake.add(done);
});
const intervals: Record<WorkerName, number> = { media: 5000, 'account-deletion': 15000, commerce: 30000, push: 60000, voice: 10000, billing: 30000 };
async function heartbeat(name: WorkerName, state: 'running' | 'passed' | 'failed', batches = 0) {
  const { error } = await supabase.rpc('record_worker_heartbeat', { worker_name: name, worker_state: state, batches });
  if (error) throw new Error('heartbeat_unavailable');
}
async function invoke(name: WorkerName) {
  if (name === 'push') {
    const response = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/push-worker', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { 'Content-Type': 'application/json', 'x-worker-secret': env.PUSH_WORKER_SECRET!,
        apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! }, body: JSON.stringify({ mode: 'all' }),
    });
    return { ok: response.ok, body: await response.json() };
  }
  const request = new Request('http://worker.internal/api/jobs/' + name,
    { method: name === 'voice' ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + (name === 'voice' ? env.VOICE_WORKER_SECRET : env.CRON_SECRET) } });
  const handler = name === 'media' ? media : name === 'account-deletion' ? deletion : name === 'voice' ? voice : name === 'billing' ? billing : commerce;
  const response = await handler(request);
  const body = await response.json();
  if ((name === 'commerce' || name === 'billing') && env.HITTUMST_APP_ENV === 'production' && body.sandbox !== false)
    return { ok: false, body: {} };
  return { ok: response.ok, body };
}
async function loop(name: WorkerName) {
  while (!stopping) {
    let delay = intervals[name];
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    try {
      await heartbeat(name, 'running');
      heartbeatTimer = setInterval(() => { void heartbeat(name, 'running').catch(() => {
        captureDiagnostic('worker_heartbeat_failed', name);
        console.error(JSON.stringify({ worker: name, code: 'heartbeat_failed' }));
      }); }, 30000);
      const result = await drainWorker(name, () => invoke(name), { stopping: () => stopping });
      clearInterval(heartbeatTimer);
      if (result.limited) delay = Math.min(delay, 250);
      await heartbeat(name, result.ok ? 'passed' : 'failed', result.batches);
      if (!result.ok) captureDiagnostic('worker_result_failed', name);
      console.log(JSON.stringify({ worker: name, state: result.ok ? 'passed' : 'failed', ...result }));
    } catch {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      await heartbeat(name, 'failed').catch(() => {});
      captureDiagnostic('worker_cycle_failed', name);
      console.error(JSON.stringify({ worker: name, code: 'worker_cycle_failed' }));
    }
    if (!stopping) await pause(delay);
  }
}
await Promise.all(workerNames.map(loop));
await flushDiagnostics();

