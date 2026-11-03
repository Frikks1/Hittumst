// Local synthetic database only. Proves two sessions cannot stage two replacements.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const connection = { host: '127.0.0.1', port: 54322, database: 'postgres', user: 'postgres', password: 'postgres', connectionTimeoutMillis: 5000 };
const clients = [new pg.Client(connection), new pg.Client(connection), new pg.Client(connection)];
const owner = '10000000-0000-0000-0000-000000000001';
const sessionId = randomUUID();
let stagedId;
let secondStagedId;
let generation;
try {
  await Promise.all(clients.map(client => client.connect()));
  const [first, second, observer] = clients;
  const fixture = await observer.query("select count(*)::int count,bool_and(email like '%@example.test') synthetic from auth.users");
  assert.ok(fixture.rows[0].count >= 4 && fixture.rows[0].synthetic, 'exclusively synthetic local fixture required');
  const state = await observer.query('select main_photo_generation from public.profiles where id=$1', [owner]);
  generation = state.rows[0].main_photo_generation;
  await observer.query('insert into auth.sessions(id,user_id) values($1,$2)', [sessionId, owner]);
  for (const client of [first, second]) {
    await client.query('begin');
    await client.query("set local role authenticated; set local statement_timeout='5s'");
    await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',$2,true)",
      [owner, JSON.stringify({ sub: owner, role: 'authenticated', session_id: sessionId })]);
  }
  stagedId = (await first.query("select public.reserve_media_upload('profile_photo',$1,'image') reservation", [owner])).rows[0].reservation.id;
  let finished = false;
  const competing = second.query("select public.reserve_media_upload('profile_photo',$1,'image')", [owner])
    .then(result => { finished = true; secondStagedId = result.rows[0].reserve_media_upload.id; return null; }, error => { finished = true; return error; });
  // Wait for PostgreSQL's actual lock state, rather than assuming scheduling order.
  const targetPid = second.processID;
  let waiting = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await observer.query("select wait_event_type from pg_stat_activity where pid=$1", [targetPid]);
    waiting = result.rows[0]?.wait_event_type === 'Lock';
    if (waiting || finished) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(waiting && !finished, 'second reservation must wait for the shared main-photo lock');
  await first.query('commit');
  const rejected = await competing;
  assert.equal(rejected?.code, '23514');
  assert.equal(rejected?.message, 'main_photo_replacement_pending');
  await second.query('rollback');
  const count = await observer.query("select count(*)::int count from private.media_uploads where owner_id=$1 and target_type='profile_photo' and metadata->>'purpose'='main_profile_photo' and status in('reserved','processing','appealed')", [owner]);
  assert.equal(count.rows[0].count, 1);
  console.log('PASS main photo concurrency: one generation-bound replacement across two sessions');
} finally {
  await Promise.allSettled(clients.slice(0, 2).map(client => client.query('rollback')));
  const observer = clients[2];
  if (stagedId || secondStagedId) {
    await observer.query('delete from private.media_uploads where id=any($1::uuid[]) and owner_id=$2', [[stagedId, secondStagedId].filter(Boolean), owner]);
    await observer.query('update public.profiles set main_photo_generation=$1 where id=$2', [generation, owner]);
  }
  await observer.query('delete from auth.sessions where id=$1 and user_id=$2', [sessionId, owner]).catch(() => {});
  await Promise.allSettled(clients.map(client => client.end()));
}
