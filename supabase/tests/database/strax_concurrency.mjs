// Run only against an exclusively synthetic, local database. This supplements
// pgTAP with real independent transactions competing for the same last slot.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const config = { host: '127.0.0.1', port: Number(process.env.STRAX_TEST_PORT ?? 54322),
  database: 'postgres', user: 'postgres', password: process.env.STRAX_TEST_PASSWORD ?? 'postgres' };
const admin = new pg.Client(config);
const clients = [];
const activities = new Set();
const sessions = [];
const memberIds = [1, 2, 3].map(value => `10000000-0000-0000-0000-${String(value).padStart(12, '0')}`);
async function member(index) {
  const client = new pg.Client(config);
  await client.connect();
  clients.push(client);
  const session = randomUUID();
  sessions.push(session);
  await admin.query('insert into auth.sessions(id,user_id) values($1,$2)', [session, memberIds[index]]);
  await client.query('set role authenticated');
  await client.query(`select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false),
    set_config('request.jwt.claims',$2,false)`, [memberIds[index], JSON.stringify({ sub: memberIds[index], session_id: session, role: 'authenticated' })]);
  return client;
}
async function create(client, input, requestId = randomUUID()) {
  const { rows } = await client.query('select public.strax_create($1::jsonb,$2::uuid) activity', [JSON.stringify(input), requestId]);
  activities.add(rows[0].activity.id);
  return rows[0].activity;
}
function oneWinner(results, code, message) {
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const loser = results.find(result => result.status === 'rejected');
  assert.equal(loser.reason.code, code);
  assert.equal(loser.reason.message, message);
}
await admin.connect();
try {
  const { rows } = await admin.query("select count(*)::int accounts,bool_and(email like '%@example.test') synthetic from auth.users");
  assert.ok(rows[0].accounts >= 4 && rows[0].synthetic, 'Only an exclusively synthetic local database is allowed');
  assert.equal((await admin.query("select count(*)::int amount from public.strax_activities where host_id=$1 and status='active' and expires_at>clock_timestamp()", [memberIds[0]])).rows[0].amount, 0,
    'Test host must have no existing active activity');
  const [hostA, hostB, personA, personB] = await Promise.all([member(0), member(0), member(1), member(2)]);
  const input = { title: 'Synthetic publication race', description: 'Concurrent immediate activity', joinMode: 'open', spacesNeeded: 1 };
  const publications = await Promise.allSettled([create(hostA, input), create(hostB, input)]);
  oneWinner(publications, '23514', 'strax_already_active');
  let activity = publications.find(result => result.status === 'fulfilled').value;
  await hostA.query('select public.strax_close($1)', [activity.id]);
  console.log('PASS competing publication allows exactly one active activity');

  const request = randomUUID();
  const retry = await Promise.all([create(hostA, input, request), create(hostB, input, request)]);
  assert.equal(retry[0].id, retry[1].id);
  assert.equal(retry[0].expiresAt, retry[1].expiresAt);
  activity = retry[0];
  console.log('PASS simultaneous retry recovers one immutable publication');
  const joins = await Promise.allSettled([personA, personB].map(client => client.query("select public.strax_participate($1,'join','',true)", [activity.id])));
  oneWinner(joins, '23514', 'strax_full');
  assert.equal((await admin.query("select count(*)::int amount from private.strax_participations where activity_id=$1 and status='joined'", [activity.id])).rows[0].amount, 1);
  await hostA.query('select public.strax_close($1)', [activity.id]);
  console.log('PASS concurrent open joins cannot overfill the last slot');

  activity = await create(hostA, { ...input, title: 'Synthetic approval race', joinMode: 'application' });
  await Promise.all([personA, personB].map(client => client.query("select public.strax_participate($1,'apply','',false)", [activity.id])));
  const approvals = await Promise.allSettled([hostA, hostB].map((client, index) => client.query("select public.strax_respond($1,$2,'approve')", [activity.id, memberIds[index + 1]])));
  oneWinner(approvals, '23514', 'strax_full');
  assert.equal((await admin.query("select count(*)::int amount from private.strax_participations where activity_id=$1 and status='joined'", [activity.id])).rows[0].amount, 1);
  await hostA.query('select public.strax_close($1)', [activity.id]);
  console.log('PASS concurrent host approvals cannot overfill the last slot');

  activity = await create(hostA, { ...input, title: 'Synthetic deadline race' });
  // Fixture-only time travel is bracketed in one transaction. Client publication
  // APIs never accept either timestamp, and the guard is immediately restored.
  await admin.query('begin');
  await admin.query('alter table public.strax_activities disable trigger strax_clock_guard');
  await admin.query(`update public.strax_activities set created_at=moment.end_at-interval '4 hours',expires_at=moment.end_at
    from (select clock_timestamp()+interval '250 milliseconds' end_at) moment where id=$1`, [activity.id]);
  await admin.query('alter table public.strax_activities enable trigger strax_clock_guard');
  await admin.query('commit');
  await admin.query('begin');
  await admin.query('select id from public.strax_activities where id=$1 for update', [activity.id]);
  const lateJoin = personA.query("select public.strax_participate($1,'join','',true)", [activity.id]).then(() => null, error => error);
  await admin.query('select pg_sleep(0.35)');
  await admin.query('commit');
  const expired = await lateJoin;
  assert.equal(expired?.code, '42501');
  assert.equal(expired?.message, 'strax_unavailable');
  assert.equal((await admin.query('select count(*)::int amount from private.strax_participations where activity_id=$1', [activity.id])).rows[0].amount, 0);
  console.log('PASS an action queued before expiry fails after acquiring its lock');
} finally {
  await admin.query('rollback').catch(() => {});
  await Promise.all(clients.map(client => client.end()));
  if (activities.size) await admin.query('delete from public.strax_activities where id=any($1::uuid[])', [[...activities]]);
  if (sessions.length) await admin.query('delete from auth.sessions where id=any($1::uuid[])', [sessions]);
  await admin.end();
}
