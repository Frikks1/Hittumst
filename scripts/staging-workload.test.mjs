import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workloadConfig, requireSyntheticUsers, evaluateWorkload, pool } from './staging-workload-lib.mjs';
const env = { STAGING_WORKLOAD_PROJECT_REF: 'abcdefghijklmnopqrst', STAGING_WORKLOAD_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  STAGING_WORKLOAD_SYNTHETIC_CONFIRMED: 'true', STAGING_WORKLOAD_ALLOW_WRITES: 'true',
  STAGING_WORKLOAD_PUBLISHABLE_KEY: 'sb_publishable_synthetic', STAGING_WORKLOAD_SECRET_KEY: 'sb_secret_synthetic' };
test('writes require independent exact staging identity and explicit synthetic opt-in', () => {
  assert.equal(workloadConfig(env).accounts, 1000);
  for (const change of [ { STAGING_WORKLOAD_PROJECT_REF: 'yztxwdhajgoqvtsqmcdw' }, { STAGING_WORKLOAD_ALLOW_WRITES: '' },
    { STAGING_WORKLOAD_SYNTHETIC_CONFIRMED: '' }, { STAGING_WORKLOAD_URL: env.STAGING_WORKLOAD_URL + '/path' },
    { STAGING_WORKLOAD_URL: 'https://user:secret@abcdefghijklmnopqrst.supabase.co' }, { STAGING_WORKLOAD_SECRET_KEY: 'legacy-jwt' } ])
    assert.throws(() => workloadConfig({ ...env, ...change }));
});
test('smoke evidence cannot claim the full capacity sizes or duration', () => {
  const config = workloadConfig(env, true);
  assert.deepEqual([config.accounts, config.occurrences, config.concurrent, config.durationMs], [12, 4, 10, 30000]);
});
test('fixtures refuse a project containing a real email address', () => {
  requireSyntheticUsers([{email:'fixture@example.test'}]);
  assert.throws(() => requireSyntheticUsers([{email:'member@example.com'}]));
  assert.throws(() => requireSyntheticUsers([{}]));
});
test('acceptance enforces latency, errors, samples and every Realtime/privacy miss', () => {
  assert.equal(evaluateWorkload([{operation:'read',ok:true,durationMs:100}], {read:750}).passed, true);
  assert.equal(evaluateWorkload([{operation:'read',ok:true,durationMs:900}], {read:750}).passed, false);
  assert.equal(evaluateWorkload([], {read:750}).passed, false);
  const samples = Array.from({length:1000}, () => ({operation:'realtime',ok:true,durationMs:20}));
  samples[0].ok = false;
  assert.equal(evaluateWorkload(samples, {realtime:2000}).passed, false);
  assert.equal(evaluateWorkload([{operation:'read',ok:true,durationMs:5}], {read:750}, 1).passed, false);
});
test('fixture pool limits concurrency and visits each fixture exactly once', async () => {
  let active=0,maximum=0;const visited=[];
  await pool([1,2,3,4,5],2,async item=>{active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,1));visited.push(item);active--;});
  assert.equal(maximum,2);assert.deepEqual(visited.sort(),[1,2,3,4,5]);
});

test('approved API/chat/error budget boundaries are strict', () => {
 const config=workloadConfig(env);assert.equal(config.thresholds.write,1000);assert.equal(config.thresholds.realtime,2000);
 assert.equal(evaluateWorkload([{operation:'write',ok:true,durationMs:1000}],{write:1000}).passed,false);
 assert.equal(evaluateWorkload([{operation:'realtime',ok:true,durationMs:2000}],{realtime:2000}).passed,false);
 const samples=Array.from({length:100},(_,i)=>({operation:'read',ok:i!==0,durationMs:1}));
 assert.equal(evaluateWorkload(samples,{read:750}).passed,false);
});
