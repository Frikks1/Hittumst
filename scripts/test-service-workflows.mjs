// Actual Auth, REST, Storage and Realtime tests with disposable, synthetic accounts.
// Tokens/passwords stay in memory. This script cannot target the known production project.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import pg from 'pg';
import { loadChatCatchup } from '../apps/mobile/src/utils/chatSync.ts';
import { runDeletionJob } from '../apps/admin/src/lib/jobs/account-deletion.ts';
import { publishTombstone, decryptTombstone } from '../apps/admin/src/lib/jobs/deletion-journal-crypto.ts';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionRef = 'yztxwdhajgoqvtsqmcdw';
let endpoint = process.env.SERVICE_TEST_SUPABASE_URL;
let publishableKey = process.env.SERVICE_TEST_PUBLISHABLE_KEY;
let secretKey = process.env.SERVICE_TEST_SECRET_KEY;
if (!endpoint) {
  let status;
  if (process.platform === 'win32') {
    const linuxRoot = root.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replaceAll('\\', '/');
    const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
    status = execFileSync('wsl.exe', ['-d', 'Ubuntu', '-u', 'root', '--', 'sh', '-s'], {
      input: `cd ${quote(linuxRoot)}\nsupabase status -o json\n`, encoding: 'utf8', timeout: 45000,
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } else {
    status = execFileSync('supabase', ['status', '-o', 'json'], { cwd: root, encoding: 'utf8', timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  const config = JSON.parse(status.slice(status.indexOf('{')));
  endpoint = config.API_URL;
  publishableKey = config.PUBLISHABLE_KEY ?? config.ANON_KEY;
  secretKey = config.SECRET_KEY ?? config.SERVICE_ROLE_KEY;
}
const url = new URL(endpoint);
const local = ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '54321' && url.protocol === 'http:';
const stagingRef = process.env.SERVICE_TEST_STAGING_REF;
const staging = /^[a-z]{20}$/.test(stagingRef ?? '') && stagingRef !== productionRef &&
  url.origin === `https://${stagingRef}.supabase.co` && process.env.SERVICE_TEST_SYNTHETIC === 'true';
if ((!local && !staging) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !publishableKey || !secretKey) {
  throw new Error('Use disposable localhost:54321 or an explicitly identified isolated synthetic staging project with its own keys.');
}

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15000) }) } };
const operator = createClient(url.origin, secretKey, options);
const createdUsers = [];
const uploadedObjects = [];
const clients = [];
const results = [];
const observations = {};
const runId = randomUUID();
const startedAt = new Date().toISOString();
let completed = false;
function requireOk(result, label) {
  assert.equal(result.error, null, `${label}: ${result.error?.code ?? result.error?.status ?? ''} ${result.error?.message ?? ''}`);
  return result.data;
}
async function check(name, action) {
  const started = performance.now();
  try { await action(); results.push({ name, status: 'passed', durationMs: Math.round(performance.now() - started) }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'failed', durationMs: Math.round(performance.now() - started) }); console.error(`FAIL ${name}: ${error.message}`); throw error; }
}
async function account(label) {
  const email = `service-${runId}-${label}@example.test`;
  const password = randomBytes(32).toString('base64url');
  const user = requireOk(await operator.auth.admin.createUser({ email, password, email_confirm: true }), 'Create synthetic account').user;
  createdUsers.push(user.id);
  const client = createClient(url.origin, publishableKey, options);
  clients.push(client);
  requireOk(await client.auth.signInWithPassword({ email, password }), 'Password authentication');
  requireOk(await client.rpc('complete_onboarding', {
    date_of_birth: '1995-01-01', display_name: `Test ${label}`, pronouns: 'they/them', identity_tags: ['queer'], looking_for: ['chat'],
    bio: 'Synthetic service integration account', region: 'hofudborgarsvaedid', sensitive_data_consent: true, locale: 'en',
    terms_version: '2026-08-31', privacy_version: '2026-08-31', guidelines_version: '2026-08-31',
  }), 'Onboarding');
  const location = requireOk(await client.rpc('update_location', { latitude: 64.1482, longitude: -21.9511, accuracy: 20, captured_at: new Date().toISOString() }), 'Location verification');
  assert.equal(location.verified, true);
  return { client, id: user.id };
}
function subscribe(client, conversation, onMessage) {
  const channel = client.channel(`service-test-${randomUUID()}`).on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation}`,
  }, onMessage);
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timeout')), 20000);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      else if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) { clearTimeout(timer); reject(new Error(`Realtime ${status}`)); }
    });
  });
  return { channel, ready };
}
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.toUpperCase().replace(/=+$/, '')].map(char => {
    const value = alphabet.indexOf(char); assert.ok(value >= 0, 'Valid TOTP secret'); return value.toString(2).padStart(5, '0');
  }).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
async function until(predicate, label) {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`${label} timed out`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
try {
  let alice, bob, outsider, conversation;
  await check('three independent Auth sessions, onboarding and coarse location verification', async () => {
    alice = await account('alice'); bob = await account('bob'); outsider = await account('outsider');
    assert.equal(new Set([alice.id, bob.id, outsider.id]).size, 3);
  });
  await check('anonymous access and cross-account sensitive profile isolation', async () => {
    const anon = createClient(url.origin, publishableKey, options); clients.push(anon);
    assert.ok((await anon.rpc('export_my_account')).error);
    const own = requireOk(await alice.client.from('profiles').select('*').eq('id', alice.id), 'Own profile');
    assert.equal(own.length, 1);
    const foreign = await outsider.client.from('profiles').select('*').eq('id', alice.id);
    assert.ok(foreign.error || foreign.data.length === 0, 'Raw profile including date of birth must not leak');
    const privateSchema = await outsider.client.schema('private').from('private_locations').select('*');
    assert.ok(privateSchema.error, 'Private coordinates must not be exposed');
  });
  await check('concurrent conversation creation produces one conversation', async () => {
    const ids = await Promise.all(Array.from({ length: 4 }, (_, i) => i % 2
      ? bob.client.rpc('start_conversation', { other_profile_id: alice.id })
      : alice.client.rpc('start_conversation', { other_profile_id: bob.id })));
    ids.forEach(result => requireOk(result, 'Concurrent conversation'));
    assert.equal(new Set(ids.map(result => result.data)).size, 1);
    conversation = ids[0].data;
  });
  await check('initial message history recovery and subsequent Realtime delivery preserve recipient isolation', async () => {
    const received = [], leaked = [];
    const member = subscribe(bob.client, conversation, event => received.push(event.new.id));
    const stranger = subscribe(outsider.client, conversation, event => leaked.push(event.new.id));
    await Promise.all([member.ready, stranger.ready]);
    const id = randomUUID();
    requireOk(await alice.client.from('messages').insert({ id, conversation_id: conversation, sender_id: alice.id, body: 'Synthetic realtime message' }), 'Send message');
    // The local Realtime tenant can acknowledge SUBSCRIBED before its first WAL
    // slot is ready. Record the actual first-message outcome; do not relabel a
    // missed event as Realtime success. Exercise the app's real REST recovery.
    await new Promise(resolve => setTimeout(resolve, 4000));
    observations.initialRealtimeEventDelivered = received.includes(id);
    const recovered = await loadChatCatchup(async cursor => {
      const page = requireOk(await bob.client.rpc('list_messages_page', { conversation_id: conversation, page_size: 2, cursor }), 'Actual app catch-up history');
      return { ...page, items: page.items.map(row => ({ ...row, createdAt: row.created_at })) };
    });
    assert.ok(recovered.items.some(message => message.id === id), 'The same app helper must recover the confirmed message even if its socket event is missed');
    observations.initialMessageRecoveredFromHistory = true;
    const nextId = randomUUID();
    requireOk(await alice.client.from('messages').insert({ id: nextId, conversation_id: conversation, sender_id: alice.id, body: 'Synthetic subsequent realtime message' }), 'Send subsequent message');
    await until(() => received.includes(nextId), 'Subsequent recipient Realtime event');
    await new Promise(resolve => setTimeout(resolve, 1200));
    assert.deepEqual(leaked, []);
    await bob.client.removeChannel(member.channel); await outsider.client.removeChannel(stranger.channel);
  });
  await check('duplicate send ID is recoverable without creating duplicate messages', async () => {
    const id = randomUUID();
    const payload = { id, conversation_id: conversation, sender_id: alice.id, body: 'Synthetic idempotent send' };
    requireOk(await alice.client.from('messages').insert(payload), 'First send');
    assert.equal((await alice.client.from('messages').insert(payload)).error?.code, '23505');
    const existing = requireOk(await alice.client.from('messages').select('id,body').eq('id', id), 'Recover acknowledged send');
    assert.equal(existing.length, 1); assert.equal(existing[0].body, payload.body);
    assert.ok((await outsider.client.from('messages').insert({ ...payload, id: randomUUID(), sender_id: outsider.id })).error);
    assert.ok((await outsider.client.rpc('list_messages_page', { conversation_id: conversation })).error);
  });
  await check('reconnect restores realtime and paginated history', async () => {
    const received = [];
    const connection = subscribe(bob.client, conversation, event => received.push(event.new.id)); await connection.ready;
    const id = randomUUID();
    requireOk(await alice.client.from('messages').insert({ id, conversation_id: conversation, sender_id: alice.id, body: 'After reconnect' }), 'Send after reconnect');
    await until(() => received.includes(id), 'Reconnected delivery');
    const page = requireOk(await bob.client.rpc('list_messages_page', { conversation_id: conversation, page_size: 2 }), 'History page');
    assert.equal(page.items.length, 2); assert.ok(page.nextCursor);
    const next = requireOk(await bob.client.rpc('list_messages_page', { conversation_id: conversation, page_size: 2, cursor: page.nextCursor }), 'Next history page');
    assert.ok(next.items.length >= 1); assert.ok(!next.items.some(item => page.items.some(first => first.id === item.id)));
    await bob.client.removeChannel(connection.channel);
  });
  await check('real REST catch-up backfills 51 messages sent while recipient is offline', async () => {
    const previous = requireOk(await alice.client.rpc('list_messages_page', { conversation_id: conversation, page_size: 1 }), 'Offline anchor');
    const anchor = { ...previous.items[0], createdAt: previous.items[0].created_at };
    const messages = Array.from({ length: 51 }, (_, index) => ({ id: randomUUID(), conversation_id: conversation, sender_id: bob.id, body: `Offline synthetic message ${index}` }));
    requireOk(await bob.client.from('messages').insert(messages), 'Messages sent without recipient subscription');
    let pages = 0;
    const recovered = await loadChatCatchup(async cursor => {
      pages++;
      const page = requireOk(await alice.client.rpc('list_messages_page', { conversation_id: conversation, page_size: 20, cursor }), 'Offline catch-up page');
      return { ...page, items: page.items.map(row => ({ ...row, createdAt: row.created_at })) };
    }, anchor);
    assert.ok(pages >= 3, 'Recovery must continue beyond the first page');
    assert.equal(new Set(recovered.items.map(message => message.id)).size, recovered.items.length);
    assert.ok(messages.every(message => recovered.items.some(recoveredMessage => recoveredMessage.id === message.id)), 'Every offline message must be recovered');
    observations.offlineMessagesRecovered = messages.length;
  });
  await check('all profile uploads require quarantine and raw bytes stay inaccessible', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI1sAAAAASUVORK5CYII=', 'base64');
    const rawPath = `${alice.id}/${runId}.png`;
    assert.ok((await alice.client.storage.from('profile-photos').upload(rawPath, png, { contentType: 'image/png' })).error, 'Owner cannot bypass quarantine');
    assert.ok((await outsider.client.rpc('reserve_media_upload', { target_type: 'profile_photo', target_id: alice.id, media_type: 'image' })).error);
    const reservation = requireOk(await alice.client.rpc('reserve_media_upload', { target_type: 'profile_photo', target_id: alice.id, media_type: 'image', metadata: { tags: [] } }), 'Reserve profile upload');
    assert.equal(reservation.bucket, 'media-quarantine');
    assert.ok((await outsider.client.storage.from(reservation.bucket).upload(reservation.path, png, { contentType: 'image/png' })).error);
    requireOk(await alice.client.storage.from(reservation.bucket).upload(reservation.path, png, { contentType: 'image/png' }), 'Reserved quarantine upload');
    uploadedObjects.push({ bucket: reservation.bucket, path: reservation.path });
    assert.ok((await alice.client.storage.from(reservation.bucket).download(reservation.path)).error, 'Even owner cannot download unprocessed quarantine bytes');
    assert.ok((await outsider.client.storage.from(reservation.bucket).createSignedUrl(reservation.path, 60)).error);
    assert.ok((await alice.client.from('profile_photos').insert({ profile_id: alice.id, storage_path: rawPath, position: 1 })).error, 'Raw metadata cannot bypass worker');
    const pending = requireOk(await alice.client.rpc('list_my_media_uploads', { target_type: 'profile_photo', target_id: alice.id }), 'Pending upload state');
    assert.ok(pending.some(item => item.id === reservation.id));
    const exported = requireOk(await alice.client.rpc('export_my_account'), 'Export excludes quarantine');
    assert.ok(!(exported.mediaManifest ?? []).some(item => item.bucket === 'media-quarantine'));
  });
  await check('account export contains only requesting account and its interactions', async () => {
    const exported = requireOk(await alice.client.rpc('export_my_account'), 'Account export');
    assert.ok(JSON.stringify(exported).includes(alice.id));
    assert.ok(!JSON.stringify(exported).includes(outsider.id));
  });
  await check('blocking immediately revokes history, inbox and new message writes', async () => {
    requireOk(await alice.client.from('blocks').insert({ blocker_id: alice.id, blocked_id: bob.id }), 'Block user');
    assert.ok((await bob.client.rpc('list_messages_page', { conversation_id: conversation })).error);
    assert.ok((await bob.client.from('messages').insert({ conversation_id: conversation, sender_id: bob.id, body: 'Blocked send' })).error);
    const inbox = requireOk(await bob.client.rpc('list_conversations_page'), 'Blocked inbox');
    assert.ok(!inbox.items.some(item => item.id === conversation));
  });
  await check('global logout immediately rejects the old access JWT and refresh token across member APIs', async () => {
    const refreshed = requireOk(await outsider.client.auth.refreshSession(), 'Refresh session');
    assert.equal(refreshed.user.id, outsider.id);
    const { access_token: accessToken, refresh_token: refreshToken } = refreshed.session;
    const stale = createClient(url.origin, publishableKey, { ...options, global: { ...options.global, headers: { Authorization: 'Bearer ' + accessToken } } });
    clients.push(stale);
    requireOk(await stale.rpc('export_my_account'), 'Existing JWT works before logout');
    const reservation = requireOk(await stale.rpc('reserve_media_upload', { target_type: 'profile_photo', target_id: outsider.id, media_type: 'image' }), 'Pre-logout Storage reservation');
    requireOk(await outsider.client.auth.signOut({ scope: 'global' }), 'Sign out');
    assert.ok((await outsider.client.auth.refreshSession({ refresh_token: refreshToken })).error);
    assert.ok((await stale.from('profiles').select('id').eq('id', outsider.id)).error, 'PostgREST pre-request must reject a logged-out JWT');
    assert.ok((await stale.rpc('export_my_account')).error, 'Logged-out JWT cannot export');
    assert.ok((await stale.rpc('create_group', { name: 'Denied stale group' })).error, 'Logged-out JWT cannot create a group');
    assert.ok((await stale.rpc('delete_my_account')).error, 'Deletion path cannot bypass session revocation');
    assert.ok((await stale.rpc('reserve_media_upload', { target_type: 'profile_photo', target_id: outsider.id, media_type: 'image' })).error, 'Logged-out JWT cannot reserve media');
    const bytes = Buffer.from('synthetic stale upload');
    assert.ok((await stale.storage.from(reservation.bucket).upload(reservation.path, bytes, { contentType: 'image/jpeg' })).error, 'Storage RLS must independently reject the revoked JWT');
    assert.ok((await stale.rpc('register_push_token', { expo_push_token: 'ExpoPushToken[stale_' + runId.replaceAll('-', '') + ']', platform: 'ios', locale: 'en' })).error, 'Logged-out JWT cannot bind push delivery');
    assert.ok((await stale.rpc('billing_sync_access', { p_enqueue: true })).error, 'Logged-out JWT cannot queue billing work');
    const stillExists = requireOk(await operator.auth.admin.getUserById(outsider.id), 'Stale deletion did not remove account');
    assert.equal(stillExists.user.id, outsider.id);
  });
  await check('staff access requires real TOTP MFA and protected role; user metadata cannot escalate', async () => {
    requireOk(await alice.client.auth.updateUser({ data: { role: 'admin', financial_operator: true } }), 'Attempt user metadata escalation');
    assert.ok((await alice.client.rpc('admin_list_reports')).error);
    const staff = await account('staff');
    requireOk(await operator.auth.admin.updateUserById(staff.id, { app_metadata: { role: 'admin', financial_operator: true } }), 'Provision synthetic staff role');
    requireOk(await staff.client.auth.refreshSession(), 'Refresh protected staff claims');
    assert.ok((await staff.client.rpc('admin_list_reports')).error, 'Staff password login alone cannot access moderation');
    const factor = requireOk(await staff.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Synthetic integration factor' }), 'Enroll authenticator');
    if (Date.now() % 30000 > 28000) await new Promise(resolve => setTimeout(resolve, 2100));
    requireOk(await staff.client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(factor.totp.secret) }), 'Verify real TOTP');
    requireOk(await staff.client.rpc('admin_list_reports'), 'MFA staff moderation access');
    assert.equal(requireOk(await staff.client.rpc('get_financial_access'), 'MFA financial authorization'), true);
    const session = requireOk(await staff.client.auth.getSession(), 'MFA session').session;
    const stale = createClient(url.origin, publishableKey, { ...options, global: { ...options.global, headers: { Authorization: `Bearer ${session.access_token}` } } });
    clients.push(stale);
    requireOk(await staff.client.auth.signOut({ scope: 'global' }), 'Staff logout');
    const staleAccess = await stale.rpc('get_financial_access');
    assert.ok(staleAccess.error || staleAccess.data === false, 'An unexpired but signed-out staff JWT cannot authorize finance');
  });
  await check('deletion immediately revokes old JWT and actual worker removes Storage and Auth', async () => {
    // Only use the queue on the exclusive disposable local fixture database.
    // Never claim jobs belonging to another staging test or user.
    assert.ok(local, 'Hosted deletion delivery requires a separately reserved exclusive staging worker queue');
    const sql = new pg.Client({ host: '127.0.0.1', port: 54322, user: 'postgres', password: 'postgres', database: 'postgres' });
    await sql.connect();
    let deletionAccount;
    try {
      const queued = await sql.query("select count(*)::int n from private.account_deletion_jobs where status<>'complete'");
      assert.equal(queued.rows[0].n, 0, 'The local worker queue must be free before the delivery test');
      deletionAccount = await account('deletion');
      const reservation = requireOk(await deletionAccount.client.rpc('reserve_media_upload', { target_type: 'profile_photo', target_id: deletionAccount.id, media_type: 'image' }), 'Deletion quarantine reservation');
      const objectPath = reservation.path;
      const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI1sAAAAASUVORK5CYII=', 'base64');
      requireOk(await deletionAccount.client.storage.from('media-quarantine').upload(objectPath, bytes, { contentType: 'image/png' }), 'Deletion media fixture');
      uploadedObjects.push({ bucket: 'media-quarantine', path: objectPath });
      const session = requireOk(await deletionAccount.client.auth.getSession(), 'Deletion session').session;
      requireOk(await deletionAccount.client.rpc('delete_my_account'), 'Request account deletion');
      assert.ok((await deletionAccount.client.rpc('export_my_account')).error, 'Old JWT must lose export access immediately');
      assert.ok((await deletionAccount.client.storage.from('media-quarantine').download(objectPath)).error, 'Old JWT must lose Storage access immediately');
      const token = randomUUID();
      const claimed = requireOk(await operator.rpc('claim_account_deletions', { claim_token: token, batch_size: 1 }), 'Claim deletion');
      assert.equal(claimed.length, 1); assert.equal(claimed[0].account_id, deletionAccount.id);
      let journalPublished = false;
      const journalKey = randomBytes(32);
      const journalRecords = new Map();
      const delivered = await runDeletionJob(claimed[0], {
        async publishDeletionTombstone(job) {
          assert.equal(job.account_id, deletionAccount.id);
          assert.deepEqual(job.objects, claimed[0].objects);
          await publishTombstone(job, 'synthetic-integration', journalKey, {
            async putIfAbsent(key, bytes) { if (!journalRecords.has(key)) journalRecords.set(key, Buffer.from(bytes)); },
            async read(key) { assert.ok(journalRecords.has(key)); return journalRecords.get(key); },
          }, 'local-synthetic');
          const encrypted = [...journalRecords.values()][0];
          assert.ok(!encrypted.includes(Buffer.from(job.account_id)), 'Independent tombstone bytes are encrypted');
          const verified = decryptTombstone(encrypted, journalKey);
          assert.equal(verified.accountId, job.account_id); assert.equal(verified.jobId, job.id);
          journalPublished = true; // Actual encryption/read verification; synthetic memory store, no S3 network.
        },
        async revokeIdentityProvider(id) {
          assert.equal(journalPublished,true,'deletion journal precedes identity removal');
          const { data, error } = await operator.rpc('apple_token_get', { account_id: id });
          assert.equal(error, null);
          assert.equal(data.requiresRevocation, false, 'synthetic email fixture has no Apple identity');
        },
        async removeObjects(bucket, names) { assert.equal(journalPublished, true, 'read-verified journal precedes any byte removal'); requireOk(await operator.storage.from(bucket).remove(names), 'Remove deleted account objects'); },
        async deleteAuthUser(id) { assert.equal(journalPublished, true, 'read-verified journal precedes Auth deletion'); requireOk(await operator.auth.admin.deleteUser(id), 'Remove deleted Auth account'); },
        async finish(jobId, succeeded) { requireOk(await operator.rpc('finish_account_deletion', { job_id: jobId, claim_token: token, succeeded }), 'Finish deletion lease'); },
      });
      assert.equal(delivered, true);
      assert.ok((await operator.auth.admin.getUserById(deletionAccount.id)).error);
      assert.ok((await operator.storage.from('media-quarantine').download(objectPath)).error);
      assert.ok((await deletionAccount.client.auth.refreshSession({ refresh_token: session.refresh_token })).error);
      assert.equal((await sql.query('select status from private.account_deletion_jobs where account_id=$1', [deletionAccount.id])).rows[0].status, 'complete');
      createdUsers.splice(createdUsers.indexOf(deletionAccount.id), 1);
    } finally {
      if (deletionAccount) await sql.query('delete from private.account_deletion_jobs where account_id=$1', [deletionAccount.id]);
      await sql.end();
    }
  });
  completed = true;
} catch {
  process.exitCode = 1;
} finally {
  for (const client of clients) await client.removeAllChannels();
  let cleanupErrors = 0;
  for (const object of uploadedObjects) if ((await operator.storage.from(object.bucket).remove([object.path])).error) cleanupErrors++;
  for (const id of createdUsers) if ((await operator.auth.admin.deleteUser(id)).error) cleanupErrors++;
  if (cleanupErrors) { process.exitCode = 1; console.error(`FAIL synthetic fixture cleanup (${cleanupErrors})`); }
  await mkdir(path.join(root, 'tmp'), { recursive: true });
  await writeFile(path.join(root, 'tmp/service-workflows-result.json'), JSON.stringify({ runId, scope: local ? 'local-real-services' : 'isolated-hosted-staging',
    projectRef: local ? null : stagingRef, startedAt, completedAt: new Date().toISOString(), completed,
    cleanup: cleanupErrors === 0 ? 'passed' : 'failed', results, observations,
    limitations: ['No physical devices', 'No real provider transactions', 'No hosted evidence when scope is local-real-services'],
  }, null, 2));
}
