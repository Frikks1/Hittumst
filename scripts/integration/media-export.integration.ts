import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { GET, OPTIONS } from '../../apps/admin/src/app/api/account/media/[id]/route';
import { normalizeMedia } from '../../apps/admin/src/lib/jobs/media';

// Independent of Next's server and .env loading: actual route, actual Auth/REST/Storage.
const endpoint = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://invalid.test');
const dbUrl = new URL(process.env.MEDIA_EXPORT_LOCAL_DB_URL ?? 'https://invalid.test');
if (process.env.MEDIA_EXPORT_LOCAL_TESTS !== 'synthetic-only' || endpoint.protocol !== 'http:' || !['localhost','127.0.0.1'].includes(endpoint.hostname) || endpoint.port !== '54321' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || !['localhost','127.0.0.1'].includes(dbUrl.hostname) || dbUrl.port !== '54322' || dbUrl.pathname !== '/postgres') throw new Error('Run only through node scripts/test-media-export.mjs against the disposable local stack.');
const options = { auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }, global:{ fetch:(input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal:init?.signal ?? AbortSignal.timeout(15000) }) } };
const operator = createClient(endpoint.origin, process.env.SUPABASE_SECRET_KEY!, options);
const sql = new pg.Client({ connectionString:dbUrl.toString() });
const runId = randomUUID();
const users = new Set<string>();
const clients: SupabaseClient[] = [];
const objects: {bucket:string; path:string}[] = [];
let sqlConnected = false;
let owner: {id:string; token:string; client:SupabaseClient};
let stranger: {id:string; token:string; client:SupabaseClient};
let objectId: string;
let uploadPath: string;
let publishedPath: string;
let expectedBytes: Uint8Array;
function data<T>(result:{data:T;error:unknown}, description:string):T {
  if (result.error) throw new Error(`${description} failed`);
  return result.data;
}
async function account(label:string) {
  const email=`media-export-${runId}-${label}@example.test`;
  const password=randomBytes(32).toString('base64url');
  const created=data(await operator.auth.admin.createUser({email,password,email_confirm:true}), 'Synthetic Auth creation').user;
  if (!created) throw new Error('Synthetic Auth creation returned no user');
  users.add(created.id);
  const client=createClient(endpoint.origin,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,options); clients.push(client);
  const session=data(await client.auth.signInWithPassword({email,password}),'Real password session').session;
  if (!session) throw new Error('No authenticated session');
  data(await client.rpc('complete_onboarding', {
    date_of_birth:'1995-01-01', display_name:`Export ${label}`, pronouns:'they/them', identity_tags:['queer'], looking_for:['chat'],
    bio:'Synthetic local binary-export test', region:'hofudborgarsvaedid', sensitive_data_consent:true, locale:'en',
    terms_version:'2026-08-31', privacy_version:'2026-08-31', guidelines_version:'2026-08-31',
  }),'Synthetic onboarding');
  return {id:created.id,token:session.access_token,client};
}
function request(token?:string, origin?:string) {
  const headers=new Headers();
  if (token) headers.set('Authorization',`Bearer ${token}`);
  if (origin) headers.set('Origin',origin);
  return new Request(`http://localhost:3001/api/account/media/${objectId}`,{headers});
}
const context=() => ({params:Promise.resolve({id:objectId})});
beforeAll(async () => {
  await sql.connect(); sqlConnected=true;
  owner=await account('owner'); stranger=await account('stranger');
  // A synthetic media fixture uses trusted publication without invoking a content provider.
  // Refuse global claims when another task has pending uploaded work.
  const unrelated=await sql.query("select count(*)::int n from private.media_uploads u where u.status in ('reserved','processing') and exists(select 1 from storage.objects o where o.bucket_id='media-quarantine' and o.name=u.object_path)");
  expect(unrelated.rows[0].n,'Shared local media queue must be empty before the fixture claim').toBe(0);
  const reserved=data(await owner.client.rpc('reserve_media_upload',{target_type:'profile_photo',target_id:owner.id,media_type:'image'}),'Own reservation');
  uploadPath=reserved.path;
  const input=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI1sAAAAASUVORK5CYII=','base64');
  objects.push({bucket:'media-quarantine',path:uploadPath});
  data(await owner.client.storage.from('media-quarantine').upload(uploadPath,input,{contentType:'image/png'}),'Real quarantine upload');
  const claim=randomUUID();
  const job=data(await operator.rpc('claim_media_upload',{claim_id:claim}),'Claim fixture publication');
  expect(job.id).toBe(reserved.id); expect(job.owner_id).toBe(owner.id);
  expectedBytes=new Uint8Array((await normalizeMedia(input,'image')).bytes);
  publishedPath=`${owner.id}/${reserved.id}.jpg`;
  objects.push({bucket:'profile-photos',path:publishedPath});
  data(await operator.storage.from('profile-photos').upload(publishedPath,expectedBytes,{contentType:'image/jpeg'}),'Real normalized Storage upload');
  expect(data(await operator.rpc('finish_media_upload',{job_id:reserved.id,claim_id:claim,byte_size:expectedBytes.byteLength,duration_ms:null,object_path:publishedPath,thumbnail_path:null,rejection_reason:null}),'Trusted fixture publication')).toBe(true);
  const profile=data(await owner.client.from('profile_photos').select('approval_status').eq('id',reserved.id).single(),'Published profile attachment');
  expect(profile.approval_status).toBe('approved');
  const manifest=data(await owner.client.rpc('export_my_account'),'Real own export').mediaManifest;
  expect(manifest.some((item:{bucket:string}) => item.bucket==='media-quarantine')).toBe(false);
  const file=manifest.find((item:{name:string}) => item.name===publishedPath);
  expect(file).toBeDefined(); objectId=file.id;
});
afterAll(async () => {
  const failures:string[]=[];
  for (const client of clients) await client.removeAllChannels();
  for (const object of objects) if ((await operator.storage.from(object.bucket).remove([object.path])).error) failures.push('Storage fixture');
  if (sqlConnected && uploadPath) await sql.query("delete from private.media_cleanup_jobs where bucket='media-quarantine' and name=$1",[uploadPath]);
  for (const id of users) if ((await operator.auth.admin.deleteUser(id)).error) failures.push('Auth fixture');
  if (sqlConnected) {
    const remaining=await sql.query('select count(*)::int n from auth.users where id=any($1::uuid[])',[Array.from(users)]);
    if (remaining.rows[0].n!==0) failures.push('Auth cleanup verification');
    const remainingFiles=await sql.query('select count(*)::int n from storage.objects where name=any($1::text[])',[objects.map(item=>item.path)]);
    if (remainingFiles.rows[0].n!==0) failures.push('Storage cleanup verification');
    await sql.end();
  }
  expect(failures,'All synthetic fixture cleanup must succeed').toEqual([]);
});

describe('real local account media route', () => {
  it('permits configured browser preflight without cookies or wildcards', () => {
    const response=OPTIONS(new Request(`http://localhost:3001/api/account/media/${objectId}`,{method:'OPTIONS',headers:{Origin:'http://localhost:8081','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}}));
    expect(response.status).toBe(204); expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
  it('returns the exact published bytes to the owner across the configured browser origin', async () => {
    const response=await GET(request(owner.token,'http://localhost:8081'),context());
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(expectedBytes);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Disposition')).toContain('attachment');
  });
  it('permits native bearer requests without Origin but denies all requests missing the bearer token', async () => {
    expect((await GET(request(owner.token),context())).status).toBe(200);
    expect((await GET(request(),context())).status).toBe(401);
    expect((await GET(request(undefined,'http://localhost:8081'),context())).status).toBe(401);
  });
  it('rejects an unconfigured origin even with a valid owner session', async () => {
    const response=await GET(request(owner.token,'https://untrusted.example.test'),context());
    expect(response.status).toBe(403); expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(await response.text()).toBe('');
  });
  it('withholds the owner file from an independently authenticated account', async () => {
    const response=await GET(request(stranger.token,'http://localhost:8081'),context());
    expect(response.status).toBe(404); expect(await response.text()).toBe('');
  });
  it('returns the same private empty response for nonexistent objects', async () => {
    const response=await GET(request(owner.token),{params:Promise.resolve({id:randomUUID()})});
    expect(response.status).toBe(404); expect(await response.text()).toBe('');
  });
  it('rejects a deleted-account JWT while its service-owned published bytes still exist', async () => {
    data(await operator.storage.from('media-quarantine').remove([uploadPath]),'Remove owned raw fixture before Auth deletion');
    data(await operator.auth.admin.deleteUser(owner.id),'Delete synthetic owner Auth account'); users.delete(owner.id);
    // Retaining the normalized fixture proves authorization fails independently of missing bytes.
    expect(data(await operator.storage.from('profile-photos').download(publishedPath),'Retained service-owned fixture').size).toBe(expectedBytes.byteLength);
    const response=await GET(request(owner.token,'http://localhost:8081'),context());
    expect(response.status).toBe(404); expect(await response.text()).toBe('');
  });
});
