// Real concurrent transactions against synthetic local fixtures; never accepts a remote URL.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
const config = { host: '127.0.0.1', port: 54322, database: 'postgres', user: 'postgres', password: 'postgres', connectionTimeoutMillis: 5000, query_timeout: 20000 };
const owner = '10000000-0000-0000-0000-000000000001', member = '10000000-0000-0000-0000-000000000002';
const actorSession = randomUUID(), ownerSession = randomUUID(), events = Array.from({length: 6}, randomUUID);
const db = new pg.Client(config);
let gates;
async function asMember(who, session, sql, params) {
  const client = new pg.Client(config);
  await client.connect();
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [who, JSON.stringify({sub: who, session_id: session, role:'authenticated'})]);
    const result = await client.query(sql, params);
    await client.query('commit');
    return {accepted:true,result};
  } catch(error) {
    await client.query('rollback');
    if (['meetup_monthly_join_limit_reached','meetup_attendee_monthly_join_limit_reached'].includes(error.message)) return {accepted:false};
    throw error;
  } finally { await client.end(); }
}
function exactlyOne(results, label) {
  if (results.filter(r => r.accepted).length !== 1) throw new Error(label + ': expected one accepted transaction');
  console.log('PASS ' + label + ': exactly one accepted and one rejected');
}
await db.connect();
try {
  const fixture = await db.query("select count(*)::int total,bool_and(email like '%@example.test') synthetic from auth.users");
  if (fixture.rows[0].total < 4 || !fixture.rows[0].synthetic) throw new Error('Exclusively synthetic local database required');
  if ((await db.query("select private.member_tier($1) tier", [member])).rows[0].tier !== 'plebbi') throw new Error('Synthetic member must start Free');
  gates = (await db.query('select enabled,expanded_launch_gates_passed from private.meetup_feature_config where id=1')).rows[0];
  await db.query('update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1');
  await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[actorSession,member,ownerSession,owner]);
  for (let n=0;n<events.length;n++) {
    await db.query("insert into public.meetups(id,host_id,title,description,category,starts_at,access_mode,location_visibility,general_area,prohibited_services_attested_at,status,published_at) values($1,$2,'Concurrent joining fixture','Synthetic transaction race','community',date_trunc('month',now())+($3::integer||' months')::interval+interval '12 hours',$4,'protected','reykjavik',now(),'published',now())",
      [events[n],owner,n<2?1:n<4?2:n===4?3:4,n>=2&&n<4?'private':'open']);
    await db.query("insert into private.meetup_locations(meetup_id,exact_point,discovery_point) values($1,extensions.st_setsrid(extensions.st_makepoint(-21.9511,64.1482),4326)::extensions.geography,extensions.st_setsrid(extensions.st_makepoint(-21.9511,64.1482),4326)::extensions.geography)",[events[n]]);
  }
  exactlyOne(await Promise.all(events.slice(0,2).map(id => asMember(member,actorSession,'select public.join_meetup($1)',[id]))),'simultaneous direct joins at Free monthly cap');
  for (const id of events.slice(2,4)) await asMember(member,actorSession,'select public.request_meetup_access($1)',[id]);
  exactlyOne(await Promise.all(events.slice(2,4).map(id => asMember(owner,ownerSession,'select public.respond_to_meetup_request($1,$2,true)',[id,member]))),'simultaneous host approvals at Free monthly cap');
  await asMember(member,actorSession,'select public.join_meetup($1)',[events[4]]);
  const mover = new pg.Client(config);
  await mover.connect();
  try {
    const move = mover.query("update public.meetups set starts_at=date_trunc('month',now())+interval '4 months 1 day 12 hours' where id=$1",[events[4]])
      .then(() => ({accepted:true})).catch(error => {if(error.message==='meetup_attendee_monthly_join_limit_reached') return {accepted:false}; throw error;});
    exactlyOne(await Promise.all([move,asMember(member,actorSession,'select public.join_meetup($1)',[events[5]])]),'reschedule racing admission to destination month');
    const count=(await db.query("select private.meetup_joins_used($1,(date_trunc('month',now())+interval '4 months')::date) used",[member])).rows[0].used;
    if(count!==1)throw new Error('Race left destination allowance over capacity');
    console.log('PASS destination month remains at exactly one consumed slot');
  } finally { await mover.end(); }
} finally {
  await db.query('delete from public.notifications where meetup_id=any($1::uuid[])',[events]);
  await db.query('delete from public.meetups where id=any($1::uuid[])',[events]);
  await db.query('delete from auth.sessions where id=any($1::uuid[])',[[actorSession,ownerSession]]);
  if(gates) await db.query('update private.meetup_feature_config set enabled=$1,expanded_launch_gates_passed=$2 where id=1',[gates.enabled,gates.expanded_launch_gates_passed]);
  await db.end();
}

