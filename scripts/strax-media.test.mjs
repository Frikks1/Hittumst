import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const id = '81000000-0000-4000-8000-000000000001';
const origin = 'https://abcdefghijklmnopqrst.supabase.co';
const start = Date.parse('2026-10-13T12:00:00Z');
const env = { SUPABASE_URL: origin, SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_fixture"}', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_fixture"}' };
const bundled = await build({ entryPoints: [fileURLToPath(new URL('../supabase/functions/strax-media/index.ts', import.meta.url))],
  bundle: true, write: false, format: 'iife', platform: 'neutral', plugins: [{ name: 'supabase-boundary', setup(builder) {
    builder.onResolve({ filter: /^npm:@supabase\/supabase-js@/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const createClient = globalThis.createClient;', loader: 'js' }));
  } }] });

function fixture({ user = { id: 'member', is_anonymous: false }, denied = false, expires = start + 10_000, status = 'active', overshoot = [], afterSignDenied = false, config = env, malformedToken = false } = {}) {
  let handler; let signed = 0; const calls = { clients: [], rpc: [], ttl: [] };
  runInNewContext(bundled.outputFiles[0].text, { Request, Response, Headers, URL, atob, performance: { now: () => 0 },
    Deno: { env: { get: name => config[name] }, serve: callback => { handler = callback; } },
    createClient: (_url, key, settings) => {
      calls.clients.push({ key, authorization: settings.global?.headers?.Authorization });
      if (key.startsWith('sb_secret')) return { storage: { from: bucket => ({ createSignedUrl: async (path, ttl) => {
        assert.equal(bucket, 'strax-media'); assert.equal(path, `${id}/photo.jpg`); calls.ttl.push(ttl);
        const exp = Math.floor(start / 1000) + ttl + (overshoot[signed++] ?? 0);
        const token = malformedToken ? 'invalid' : `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
        return { data: { signedUrl: `${origin}/storage/v1/object/sign/strax-media/${path}?token=${token}` }, error: null };
      } }) } };
      return { auth: { getUser: async () => ({ data: { user }, error: null }) }, rpc: async (name, args) => {
        calls.rpc.push({ name, args });
        if (denied || afterSignDenied && signed > 0) return { data: null, error: new Error('private access reason') };
        return { data: { id: args.p_id, status, photoStatus: 'approved', photoPath: `${args.p_id}/photo.jpg`, expiresAt: new Date(expires).toISOString(), serverNow: new Date(start).toISOString() }, error: null };
      } };
    },
  });
  const request = (body = { activityIds: [id] }, authorization = 'Bearer member-token') => new Request(`${origin}/functions/v1/strax-media`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) }, body: JSON.stringify(body),
  });
  return { handler, calls, request };
}

test('Strax media validates current bearer identity and rejects caller paths and excessive batches', async () => {
  for (const [user, authorization] of [[{ id: 'member' }, null], [null, 'Bearer token'], [{ id: 'anonymous', is_anonymous: true }, 'Bearer token']]) {
    const f = fixture({ user }); const response = await f.handler(f.request(undefined, authorization));
    assert.equal(response.status, 401); assert.equal(f.calls.ttl.length, 0);
  }
  for (const body of [null, { path: `${id}/photo.jpg` }, { activityIds: ['bad-id'] }, { activityIds: Array.from({ length: 41 }, () => id) }]) {
    const f = fixture(); assert.equal((await f.handler(f.request(body))).status, 400); assert.equal(f.calls.ttl.length, 0);
  }
});
test('Strax media authorizes as the caller and signs only server-selected approved paths', async () => {
  const f = fixture(); const response = await f.handler(f.request({ activityIds: [id, id] })); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert.equal(body.photos.length, 1);
  assert.equal(f.calls.clients[0].authorization, 'Bearer member-token'); assert.equal(f.calls.clients[1].authorization, undefined);
  assert.equal(f.calls.rpc.length, 2); assert.equal(f.calls.rpc[0].name, 'strax_get'); assert.deepEqual(f.calls.ttl, [9]);
  const payload = JSON.parse(Buffer.from(new URL(body.photos[0].url).searchParams.get('token').split('.')[1], 'base64url'));
  assert.ok(payload.exp * 1000 <= start + 10_000);
});
test('Strax media never returns expired, closed, blocked or revoked-session photos', async () => {
  for (const settings of [{ expires: start }, { status: 'expired' }, { status: 'closed' }, { denied: true }, { afterSignDenied: true }]) {
    const f = fixture(settings); const response = await f.handler(f.request()); assert.deepEqual((await response.json()).photos, []);
  }
});
test('Strax media validates actual signed JWT expiry and retries at most once', async () => {
  const retry = fixture({ overshoot: [5, 0] });
  assert.equal((await (await retry.handler(retry.request())).json()).photos.length, 1); assert.deepEqual(retry.calls.ttl, [9, 8]);
  for (const settings of [{ overshoot: [5, 5] }, { malformedToken: true }]) {
    const f = fixture(settings); assert.deepEqual((await (await f.handler(f.request())).json()).photos, []); assert.equal(f.calls.ttl.length, 2);
  }
  const boundary = fixture({ expires: start + 1000 }); assert.deepEqual((await (await boundary.handler(boundary.request())).json()).photos, []); assert.equal(boundary.calls.ttl.length, 0);
});
test('Strax media configuration failures remain private and do not return URLs', async () => {
  const f = fixture({ config: { ...env, SUPABASE_SECRET_KEYS: 'private-config-value' } }); const response = await f.handler(f.request());
  assert.equal(response.status, 503); assert.equal((await response.text()).includes('private-config-value'), false);
});
test('Strax media permits the browser SDK client header in CORS preflight', async () => {
  const f = fixture(); const response = await f.handler(new Request(`${origin}/functions/v1/strax-media`, { method: 'OPTIONS' }));
  assert.equal(response.status, 204); assert.match(response.headers.get('Access-Control-Allow-Headers'), /x-client-info/); assert.equal(f.calls.clients.length, 0);
});
