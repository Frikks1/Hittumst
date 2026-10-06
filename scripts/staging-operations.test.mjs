import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stagingOperationsConfig, runStagingOperations } from './staging-operations.mjs';
const env = {
  HITTUMST_STAGING_OPERATIONS_ENABLED: 'true',
  STAGING_SYNTHETIC_DATA_CONFIRMED: 'true',
  STAGING_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  STAGING_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  STAGING_ADMIN_URL: 'https://staging.hittumst.is',
  STAGING_APPROVED_ADMIN_ORIGIN: 'https://staging.hittumst.is',
  PRODUCTION_ADMIN_ORIGIN: 'https://hittumst.is',
  STAGING_CRON_SECRET: 'fixture-cron-'.repeat(4),
  STAGING_PUSH_WORKER_SECRET: 'fixture-push-'.repeat(4),
  STAGING_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
};
function verifiedFetch(worker) {
  return async (url, options) =>
    url.endsWith('/api/operations/health')
      ? Response.json({
          status: 'ok',
          appEnvironment: 'staging',
          supabaseProjectRef: env.STAGING_SUPABASE_PROJECT_REF,
        })
      : worker(url, options);
}
const successfulBodies = [
  { complete: 1, retry: 0 },
  { processed: 1, approved: true, cleanup: { cleaned: 1, retry: 0 } },
  { processed: true, sandbox: true },
  { ok: true, sent: { deliveries: 2 }, receipts: { requested: 1, received: 1 } },
];
test('explicit isolated staging worker configuration is accepted', () =>
  assert.equal(stagingOperationsConfig(env).ref, env.STAGING_SUPABASE_PROJECT_REF));
test('missing enablement, real data, known production and mismatched origins are denied', () => {
  for (const change of [
    { HITTUMST_STAGING_OPERATIONS_ENABLED: 'false' },
    { STAGING_SYNTHETIC_DATA_CONFIRMED: 'false' },
    {
      STAGING_SUPABASE_PROJECT_REF: 'yztxwdhajgoqvtsqmcdw',
      STAGING_SUPABASE_URL: 'https://yztxwdhajgoqvtsqmcdw.supabase.co',
    },
    { STAGING_SUPABASE_URL: 'https://differentprojectname.supabase.co' },
    { STAGING_ADMIN_URL: 'https://hittumst.is' },
    { STAGING_ADMIN_URL: 'https://user:password@staging.hittumst.is' },
    {
      STAGING_APPROVED_ADMIN_ORIGIN: 'https://hittumst.is',
      STAGING_ADMIN_URL: 'https://hittumst.is',
    },
    { STAGING_CRON_SECRET: 'short' },
    { STAGING_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_fixture' },
  ])
    assert.throws(() => stagingOperationsConfig({ ...env, ...change }));
});
test('valid responses execute all jobs with redirect refusal and credential separation', async () => {
  const calls = [];
  const result = await runStagingOperations(stagingOperationsConfig(env), {
    fetchImpl: verifiedFetch(async (url, options) => {
      calls.push({ url, options });
      return Response.json(successfulBodies[calls.length - 1]);
    }),
  });
  assert.equal(result.passed, true);
  assert.equal(calls.length, 4);
  for (const { options } of calls) assert.equal(options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + env.STAGING_CRON_SECRET);
  assert.equal(calls[3].options.headers.Authorization, undefined);
  assert.equal(calls[3].options.headers['x-worker-secret'], env.STAGING_PUSH_WORKER_SECRET);
  assert.equal(JSON.stringify(result).includes(env.STAGING_CRON_SECRET), false);
});
test('retry counts, malformed success, wrong commerce mode and failures keep the monitor red', async () => {
  let call = 0;
  const bodies = [
    { complete: 0, retry: 1 },
    { hello: true },
    { processed: true, sandbox: false },
    { ok: false },
  ];
  const result = await runStagingOperations(stagingOperationsConfig(env), {
    fetchImpl: verifiedFetch(async () => Response.json(bodies[call++])),
  });
  assert.equal(result.passed, false);
  assert.equal(result.jobs.filter((job) => job.status === 'failed').length, 4);
});
test('reports omit arbitrary provider bodies, tokens, member identifiers and exception text', async () => {
  let call = 0;
  const secret = 'do-not-log-this-value';
  const result = await runStagingOperations(stagingOperationsConfig(env), {
    fetchImpl: verifiedFetch(async () => {
      call++;
      if (call === 1) throw new Error(secret);
      if (call === 2) return Response.json({ error: secret }, { status: 503 });
      if (call === 3)
        return Response.json({ ...successfulBodies[2], memberId: secret, token: secret });
      return Response.json({ ok: true, sent: { deliveries: 1, message: secret, userId: secret } });
    }),
  });
  assert.equal(result.passed, false);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(result.jobs.length, 4);
});

test('a mislabeled deployment cannot run even one mutating worker', async () => {
  for (const identity of [
    {
      status: 'ok',
      appEnvironment: 'production',
      supabaseProjectRef: env.STAGING_SUPABASE_PROJECT_REF,
    },
    { status: 'ok', appEnvironment: 'staging', supabaseProjectRef: 'yztxwdhajgoqvtsqmcdw' },
    { status: 'ok' },
  ]) {
    const calls = [];
    const result = await runStagingOperations(stagingOperationsConfig(env), {
      fetchImpl: async (url, options) => {
        calls.push(url);
        assert.equal(options.redirect, 'error');
        return Response.json(identity);
      },
    });
    assert.equal(result.passed, false);
    assert.equal(result.code, 'deployment_identity_unverified');
    assert.equal(result.jobs.length, 0);
    assert.deepEqual(calls, [env.STAGING_ADMIN_URL + '/api/operations/health']);
  }
});

test('media raw cleanup failures fail the run and remain visible as safe counts', async () => {
 let index=0;const bodies=[successfulBodies[0],{processed:0,cleanup:{cleaned:2,retry:4,objectPath:'private'}},...successfulBodies.slice(2)];
 const result=await runStagingOperations(stagingOperationsConfig(env),{fetchImpl:verifiedFetch(async()=>Response.json(bodies[index++]))});
 assert.equal(result.passed,false);assert.deepEqual(result.jobs[1].metrics.cleanup,{cleaned:2,retry:4});assert.equal(JSON.stringify(result).includes('private'),false);
});

test('manual diagnostics only observe readiness and never execute queues', async () => {
 const calls=[];
 const result=await runStagingOperations(stagingOperationsConfig(env),{readOnly:true,fetchImpl:verifiedFetch(async url=>{calls.push(url);return Response.json({status:'ok'});})});
 assert.equal(result.passed,true);assert.deepEqual(calls,[env.STAGING_ADMIN_URL+'/api/operations/ready']);
});

test('read-only readiness needs no push credential or publishable key, while queue execution still does', async () => {
  const minimal = { ...env, STAGING_PUSH_WORKER_SECRET: undefined, STAGING_SUPABASE_PUBLISHABLE_KEY: undefined };
  assert.throws(() => stagingOperationsConfig(minimal));
  assert.throws(() => stagingOperationsConfig({ ...minimal, STAGING_CRON_SECRET: undefined }, { readOnly: true }));
  const calls = [];
  const result = await runStagingOperations(stagingOperationsConfig(minimal, { readOnly: true }), {
    readOnly: true,
    fetchImpl: verifiedFetch(async (url, options) => {
      calls.push(url);
      assert.equal(options.headers['x-worker-secret'], undefined);
      return Response.json({ status: 'ok' });
    }),
  });
  assert.equal(result.passed, true);
  assert.deepEqual(calls, [env.STAGING_ADMIN_URL + '/api/operations/ready']);
});
