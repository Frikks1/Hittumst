import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Execute the real Deno entrypoints with isolated environment/provider boundaries.
const bundles = new Map();
async function handler(name, { env = {}, rpc, user, fetchImpl, createError } = {}) {
  if (!bundles.has(name)) {
    const output = await build({
      entryPoints: [fileURLToPath(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url))],
      bundle: true, write: false, format: 'iife', platform: 'neutral',
      plugins: [{ name: 'supabase-test-boundary', setup(builder) {
        builder.onResolve({ filter: /^npm:@supabase\/supabase-js@/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const createClient = globalThis.createClient;', loader: 'js' }));
      } }],
    });
    bundles.set(name, output.outputFiles[0].text);
  }
  let serve;
  const calls = { clients: 0, rpc: [], fetch: 0 };
  runInNewContext(bundles.get(name), {
    Request, Response, Headers, URL, AbortSignal, TextEncoder, crypto: webcrypto,
    Deno: { env: { get: name => env[name] }, serve: callback => { serve = callback; } },
    createClient: () => {
      calls.clients++;
      if (createError) throw new Error('private-config-value');
      return {
        auth: { getUser: async () => ({ data: { user: user ?? { id: 'synthetic-member', is_anonymous: false } }, error: null }) },
        rpc: async (name, args) => { calls.rpc.push(name); return rpc ? rpc(name, args) : { data: true, error: null }; },
      };
    },
    fetch: async (...args) => { calls.fetch++; return fetchImpl ? fetchImpl(...args) : Response.json({ features: [] }); },
  });
  return { serve, calls };
}
const base = { SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_fixture"}', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_fixture"}' };
const pushSecret = 'synthetic-worker-secret-'.repeat(3);
function request(name, body, secret) {
  return new Request(`https://functions.example.test/${name}`, { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(name === 'place-search' ? { Authorization: 'Bearer synthetic-user-token' } : secret ? { 'x-worker-secret': secret } : {}),
  }, body: JSON.stringify(body) });
}

test('push missing or weak deployment secret fails closed without touching providers', async () => {
  for (const secret of [undefined, 'short']) {
    const { serve, calls } = await handler('push-worker', { env: { ...base, PUSH_WORKER_SECRET: secret } });
    const response = await serve(request('push-worker', {}, pushSecret));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(calls, { clients: 0, rpc: [], fetch: 0 });
  }
});
test('push rejects missing and wrong credentials before backend access', async () => {
  for (const supplied of [undefined, 'wrong']) {
    const { serve, calls } = await handler('push-worker', { env: { ...base, PUSH_WORKER_SECRET: pushSecret } });
    assert.equal((await serve(request('push-worker', {}, supplied))).status, 401);
    assert.equal(calls.clients, 0);
  }
});
test('push configuration errors return a sanitized unavailable response', async () => {
  const { serve, calls } = await handler('push-worker', { env: { ...base, SUPABASE_SECRET_KEYS: '{private-config-value', PUSH_WORKER_SECRET: pushSecret } });
  const response = await serve(request('push-worker', {}, pushSecret));
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('private-config-value'), false);
  assert.deepEqual(calls.rpc, []);
});
test('authorized empty push cycle checks outbox and receipts without external delivery', async () => {
  const { serve, calls } = await handler('push-worker', { env: { ...base, PUSH_WORKER_SECRET: pushSecret }, rpc: async () => ({ data: [], error: null }) });
  const response = await serve(request('push-worker', { mode: 'all' }, pushSecret));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.deepEqual(calls.rpc, ['claim_notification_outbox', 'list_pending_push_receipts']);
  assert.equal(calls.fetch, 0);
});
test('place search rejects non-object bodies before consuming quota or contacting MapTiler', async () => {
  for (const body of [null, [], 'Reykjavik', 1]) {
    const { serve, calls } = await handler('place-search', { env: base });
    assert.equal((await serve(request('place-search', body))).status, 400);
    assert.deepEqual(calls.rpc, ['can_create_meetup']);
    assert.equal(calls.fetch, 0);
  }
});
test('place search without provider configuration does not spend member quota', async () => {
  const { serve, calls } = await handler('place-search', { env: base });
  assert.equal((await serve(request('place-search', { query: 'Reykjavik' }))).status, 503);
  assert.deepEqual(calls.rpc, ['can_create_meetup']);
  assert.equal(calls.fetch, 0);
});
test('place search handles malformed provider JSON and feature collections', async () => {
  for (const fetchImpl of [() => new Response('not-json'), () => Response.json(null), () => Response.json({ features: {} })]) {
    const { serve } = await handler('place-search', { env: { ...base, MAPTILER_SERVER_API_KEY: 'fixture-key' }, fetchImpl });
    const response = await serve(request('place-search', { query: 'Reykjavik' }));
    assert.equal(response.status, 502);
    assert.equal((await response.text()).includes('fixture-key'), false);
  }
});
test('place search preserves authorization, quota, Iceland filtering and provider redirect refusal', async () => {
  const { serve, calls } = await handler('place-search', {
    env: { ...base, MAPTILER_SERVER_API_KEY: 'fixture-key' },
    fetchImpl: (_url, options) => {
      assert.equal(options.redirect, 'error');
      return Response.json({ features: [null, { center: [-21.94, 64.14], text: 'Reykjavik', properties: { country_code: 'is' }, context: [] }, { center: [0, 51], text: 'London', properties: { country_code: 'gb' } }] });
    },
  });
  const response = await serve(request('place-search', { query: 'Reykjavik' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).places.length, 1);
  assert.deepEqual(calls.rpc, ['can_create_meetup', 'consume_meetup_place_search_quota']);
});

test('place search denies absent authentication, anonymous users and ineligible members', async () => {
  const unauthenticated = await handler('place-search', { env: base });
  assert.equal((await unauthenticated.serve(new Request('https://functions.example.test/place-search', { method: 'POST', body: '{}' }))).status, 401);
  assert.equal(unauthenticated.calls.clients, 0);
  const anonymous = await handler('place-search', { env: base, user: { is_anonymous: true } });
  assert.equal((await anonymous.serve(request('place-search', { query: 'Reykjavik' }))).status, 401);
  assert.deepEqual(anonymous.calls.rpc, []);
  const ineligible = await handler('place-search', { env: base, rpc: async () => ({ data: false, error: null }) });
  assert.equal((await ineligible.serve(request('place-search', { query: 'Reykjavik' }))).status, 403);
  assert.deepEqual(ineligible.calls.rpc, ['can_create_meetup']);
});

test('place search quota rejection never contacts the provider', async () => {
  const { serve, calls } = await handler('place-search', { env: { ...base, MAPTILER_SERVER_API_KEY: 'fixture-key' },
    rpc: async name => ({ data: name === 'can_create_meetup', error: null }) });
  assert.equal((await serve(request('place-search', { query: 'Reykjavik' }))).status, 429);
  assert.equal(calls.fetch, 0);
});

test('place search refuses insecure provider configuration before quota or network access', async () => {
  for (const origin of ['http://api.maptiler.eu', 'https://user:secret@api.maptiler.eu', 'invalid']) {
    const { serve, calls } = await handler('place-search', { env: { ...base, MAPTILER_SERVER_API_KEY: 'fixture-key', MAPTILER_GEOCODING_BASE_URL: origin } });
    assert.equal((await serve(request('place-search', { query: 'Reykjavik' }))).status, 503);
    assert.deepEqual(calls.rpc, ['can_create_meetup']);
    assert.equal(calls.fetch, 0);
  }
});
