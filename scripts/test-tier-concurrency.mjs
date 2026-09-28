import pg from 'pg';
import {randomUUID} from 'node:crypto';
const config={host:'127.0.0.1',port:54322,database:'postgres',user:'postgres',password:'postgres',connectionTimeoutMillis:5000};
const operator=new pg.Client(config);const album=randomUUID();const owner='10000000-0000-0000-0000-000000000001';
const events=[randomUUID(),randomUUID()];const session=randomUUID();let previousGates;
await operator.connect();
try{
 const verified=await operator.query("select bool_and(email like '%@example.test') synthetic from auth.users");if(!verified.rows[0]?.synthetic)throw new Error('Synthetic local database required');
 await operator.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,owner]);
 await operator.query('insert into public.albums(id,owner_id,name) values($1,$2,$3)',[album,owner,'Concurrency fixture']);
 const results=await Promise.all(Array.from({length:11},async()=>{const client=new pg.Client(config);await client.connect();try{
  await client.query('set role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[owner,JSON.stringify({sub:owner,session_id:session,role:'authenticated'})]);
  await client.query('select public.reserve_album_upload($1,$2)',[album,'image']);return true;
 }catch(error){if(error.message==='album_media_limit_reached')return false;throw error;}finally{await client.end();}}));
 const successful=results.filter(Boolean).length;if(successful!==10)throw new Error(`Expected ten reserved slots, got ${successful}`);
 console.log('PASS: 11 simultaneous upload reservations yield exactly 10 accepted and 1 rejected.');
 previousGates=(await operator.query('select enabled,expanded_launch_gates_passed from private.meetup_feature_config where id=1')).rows[0];
 await operator.query('update private.meetup_feature_config set enabled=true,expanded_launch_gates_passed=true where id=1');
 for(const event of events){
  await operator.query("insert into public.meetups(id,host_id,title,description,category,starts_at,access_mode,location_visibility,general_area,prohibited_services_attested_at) values($1,$2,'Concurrent fixture','Synthetic publication boundary','community',date_trunc('month',now())+interval '1 month 12 hours','open','protected','reykjavik',now())",[event,owner]);
  await operator.query("insert into private.meetup_locations(meetup_id,exact_point,discovery_point) values($1,extensions.st_setsrid(extensions.st_makepoint(-21.9511,64.1482),4326)::extensions.geography,extensions.st_setsrid(extensions.st_makepoint(-21.9511,64.1482),4326)::extensions.geography)",[event]);
 }
 const published=await Promise.all(events.map(async event=>{const client=new pg.Client(config);await client.connect();try{await client.query('set role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[owner,JSON.stringify({sub:owner,session_id:session,role:'authenticated'})]);await client.query('select public.publish_meetup($1)',[event]);return true;}catch(error){if(error.message==='meetup_monthly_limit_reached')return false;throw error;}finally{await client.end();}}));
 if(published.filter(Boolean).length!==1)throw new Error('Concurrent publications exceeded the Free monthly slot');
 console.log('PASS: 2 simultaneous publications yield exactly 1 accepted and 1 rejected.');
}finally{
 await operator.query('delete from public.notifications where meetup_id=any($1::uuid[])',[events]);
 await operator.query('delete from auth.sessions where id=$1',[session]);
 await operator.query('delete from public.albums where id=$1',[album]);await operator.query('delete from public.meetups where id=any($1::uuid[])',[events]);
 if(previousGates)await operator.query('update private.meetup_feature_config set enabled=$1,expanded_launch_gates_passed=$2 where id=1',[previousGates.enabled,previousGates.expanded_launch_gates_passed]);
 await operator.end();
}
