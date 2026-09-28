// Mutates ONLY an explicitly identified synthetic staging project. Never invoke for production.
// Keys and sessions remain in memory; the private journal contains fixture IDs for interrupted-run recovery.
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { workloadConfig, requireSyntheticUsers, evaluateWorkload, fixtureEmail, pool } from './staging-workload-lib.mjs';

const config = workloadConfig(process.env, process.argv.includes('--smoke'));
const clientOptions = { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) }) } };
const operator = createClient(config.origin, config.secretKey, { ...clientOptions, auth: { ...clientOptions.auth, autoRefreshToken: false } });
const runId = randomUUID();
const accounts = [];
const occurrences = [];
const samples = [];
const pendingMessages = new Map();
let isolationFailures = 0, completed = false, interrupted = false, phase = 'identity', cleanupFailed = 0;
let actualDurationMs = 0, closingChannels = false;
const startedAt = new Date().toISOString();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
process.once('SIGINT', () => { interrupted = true; });
process.once('SIGTERM', () => { interrupted = true; });
function checked(result) { if (result.error) throw new Error('backend_operation_failed'); return result.data; }
function ensureRunning() { if (interrupted) throw new Error('workload_interrupted'); }
function progress(value) { console.log(JSON.stringify({ scope: 'staging-capacity', phase: value })); }
async function timed(operation, action) {
  const started = performance.now();
  try { const data = await action(); samples.push({ operation, ok: true, durationMs: performance.now() - started }); return data; }
  catch { samples.push({ operation, ok: false, durationMs: performance.now() - started }); throw new Error(operation + '_failed'); }
}
async function journal() {
  await mkdir('tmp', { recursive: true });
  await writeFile(`tmp/capacity-fixtures-${runId}.json`, JSON.stringify({ synthetic: true, runId, projectRef: config.projectRef,
    accountIds: accounts.map(account => account.id), occurrenceIds: occurrences }, null, 2), { mode: 0o600 });
}
async function createAccount(index) {
  ensureRunning();
  const email = fixtureEmail(runId, index), password = randomBytes(32).toString('base64url');
  const user = checked(await operator.auth.admin.createUser({ email, password, email_confirm: true })).user;
  const account = { id: user.id, client: createClient(config.origin, config.publishableKey, clientOptions), index, authenticated: false };
  accounts.push(account);
  checked(await account.client.auth.signInWithPassword({ email, password }));
  account.authenticated = true;
  checked(await account.client.rpc('complete_onboarding', { date_of_birth: '1995-01-01', display_name: `Capacity ${index}`,
    pronouns: 'they/them', identity_tags: ['queer'], looking_for: ['chat'], bio: 'Synthetic capacity fixture',
    region: 'hofudborgarsvaedid', sensitive_data_consent: true, locale: 'en',
    terms_version: '2026-08-31', privacy_version: '2026-08-31', guidelines_version: '2026-08-31' }));
  const location = checked(await account.client.rpc('update_location', { latitude: 64.1482, longitude: -21.9511,
    accuracy: 20, captured_at: new Date().toISOString() }));
  if (location.verified !== true) throw new Error('fixture_location_not_verified');
}
async function subscribe(account, conversation, foreign = false) {
  const channel = account.client.channel(`capacity-${runId}-${account.index}-${foreign}`).on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation}`,
  }, event => {
    if (foreign) { isolationFailures++; return; }
    const pending = pendingMessages.get(event.new.id);
    if (pending?.recipient === account.id) {
      samples.push({ operation: 'realtime', ok: true, durationMs: performance.now() - pending.started });
      clearTimeout(pending.timer); pendingMessages.delete(event.new.id);
    }
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('subscription_timeout')), 20000);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      else if (!closingChannels && ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        clearTimeout(timer); samples.push({ operation: 'realtime', ok: false, durationMs: 0 });
        reject(new Error('subscription_failed'));
      }
    });
  });
}
async function checkStorage(account, outsider) {
  await timed('storage', async () => {
    const reservation = checked(await account.client.rpc('reserve_media_upload', {
      target_type: 'profile_photo', target_id: account.id, media_type: 'image', metadata: { tags: [] },
    }));
    if (reservation.bucket !== 'media-quarantine' || !reservation.path?.startsWith(account.id + '/')) throw new Error('unexpected_reservation');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI1sAAAAASUVORK5CYII=', 'base64');
    checked(await account.client.storage.from(reservation.bucket).upload(reservation.path, png, { contentType: 'image/png' }));
    // The quarantine is private even to the uploader until normalization and moderation complete.
    if (!(await account.client.storage.from(reservation.bucket).download(reservation.path)).error) isolationFailures++;
    if (!(await outsider.client.storage.from(reservation.bucket).createSignedUrl(reservation.path, 60)).error) isolationFailures++;
  });
}
async function sendMessage(account, recipient) {
  const id = randomUUID(), started = performance.now();
  const timer = setTimeout(() => {
    if (pendingMessages.delete(id)) samples.push({ operation: 'realtime', ok: false, durationMs: performance.now() - started });
  }, 10000);
  pendingMessages.set(id, { recipient: recipient.id, started, timer });
  await timed('write', async () => checked(await account.client.from('messages').insert({ id,
    conversation_id: account.conversation, sender_id: account.id, body: `Synthetic capacity ${runId}` })));
}
try {
  // A signed operator assertion alone is insufficient: refuse any visible non-test Auth account.
  for (let page = 1; ; page++) {
    const users = checked(await operator.auth.admin.listUsers({ page, perPage: 1000 })).users;
    requireSyntheticUsers(users);
    if (users.length < 1000) break;
  }
  phase = 'fixtures'; progress(phase);
  // Deliberately do not change Auth rate limits, feature gates, subscription tiers or RLS policies.
  await pool(Array.from({ length: config.accounts }, (_, index) => index), 4, createAccount);
  accounts.sort((a, b) => a.index - b.index);
  await journal();
  await pool(accounts.slice(0, config.occurrences), 4, async (account) => {
    ensureRunning();
    const id = checked(await account.client.rpc('create_meetup_draft', { input: {
      title: 'Synthetic capacity event', description: 'Disposable staging workload event.', category: 'community',
      tags: ['community'], startsAt: new Date(Date.now() + 172800000).toISOString(), endsAt: new Date(Date.now() + 176400000).toISOString(),
      accessMode: 'open', locationVisibility: 'protected', releasePolicy: 'immediate', generalAreaId: 'reykjavik',
      capacity: 100, isExplicit: false, rsvpVisibility: 'inherit', recurrence: null,
      prohibitedServicesAttested: true, publicLocationConfirmed: false, latitude: 64.1482, longitude: -21.9511,
    } }));
    occurrences.push(id);
    checked(await account.client.rpc('publish_meetup', { meetup_id: id }));
  });
  await journal();
  const active = accounts.slice(0, config.concurrent);
  for (let index = 0; index < active.length; index += 2) {
    const conversation = checked(await active[index].client.rpc('start_conversation', { other_profile_id: active[index + 1].id }));
    active[index].conversation = conversation; active[index + 1].conversation = conversation;
  }
  phase = 'subscriptions'; progress(phase);
  await pool(active, 10, async account => {
    await subscribe(account, account.conversation);
    await subscribe(account, active[(account.index + 2) % active.length].conversation, true);
  });
  phase = 'workload'; progress(phase);
  const started = performance.now();
  await Promise.all(active.map(async account => {
    let iteration = 0;
    try { await checkStorage(account, active[(account.index + 2) % active.length]); } catch { /* counted */ }
    while (!interrupted && performance.now() - started < config.durationMs) {
      try { await timed('read', async () => {
        const rpc = iteration % 2 ? 'get_my_entitlement' : 'get_meetup';
        return checked(await account.client.rpc(rpc, rpc === 'get_meetup' ? { meetup_id: occurrences[(iteration + account.index) % occurrences.length] } : {}));
      }); } catch { /* counted */ }
      if (iteration++ % 30 === 0) {
        try { await sendMessage(account, active[account.index % 2 ? account.index - 1 : account.index + 1]); } catch { /* counted */ }
      }
      await sleep(1000);
    }
  }));
  actualDurationMs = performance.now() - started;
  if (pendingMessages.size) await sleep(10500);
  ensureRunning(); completed = true;
} catch {
  console.error(JSON.stringify({ scope: 'staging-capacity', phase, code: interrupted ? 'interrupted' : 'workload_failed' }));
  process.exitCode = 1;
} finally {
  for (const pending of pendingMessages.values()) clearTimeout(pending.timer);
  pendingMessages.clear();
  await journal();
  closingChannels = true;
  progress('cleanup');
  await pool(accounts, 10, async account => {
    await account.client.removeAllChannels();
    // Exercise the deployed deletion queue so concurrently processed derivatives cannot be orphaned.
    // If onboarding/auth never succeeded, no member objects were created and direct removal is safe.
    if (account.authenticated) {
      if ((await account.client.rpc('delete_my_account')).error) cleanupFailed++;
    } else if ((await operator.auth.admin.deleteUser(account.id)).error) cleanupFailed++;
    account.client.auth.stopAutoRefresh();
  });
  const remaining = new Set(accounts.map(account => account.id));
  const deadline = Date.now() + 600000;
  while (remaining.size && Date.now() < deadline) {
    await pool([...remaining], 10, async id => {
      const result = await operator.auth.admin.getUserById(id);
      if (result.error?.status === 404 || result.error?.code === 'user_not_found') remaining.delete(id);
    });
    if (remaining.size) await sleep(15000);
  }
  cleanupFailed += remaining.size;
  const evaluation = evaluateWorkload(samples, config.thresholds, isolationFailures);
  const report = { runId, scope: config.smoke ? 'isolated-staging-smoke' : 'isolated-staging-capacity', projectRef: config.projectRef,
    startedAt, completedAt: new Date().toISOString(), completed, accounts: accounts.length, occurrences: occurrences.length,
    concurrentUsers: config.concurrent, durationSeconds: actualDurationMs / 1000, cleanupFailed, ...evaluation,
    passed: completed && evaluation.passed && cleanupFailed === 0 && actualDurationMs >= config.durationMs,
    qualifiesForCapacityGate: !config.smoke && completed && evaluation.passed && cleanupFailed === 0 && actualDurationMs >= config.durationMs,
    limitations: ['Synthetic hosted workload; physical devices, billing, voice audio and restore are separate gates'] };
  await writeFile('tmp/staging-workload-result.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
}
