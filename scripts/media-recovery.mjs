// Encrypted approved-media backup and deletion-aware isolated staging restore rehearsal.
// No automatic production cutover: canonical source must remain reachable for fresh deletion checks.
import {closeDeletionJournal,deletionJournalConfig,initializeDeletionJournal,loadDeletionJournal} from './deletion-journal-store.mjs';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checksum,decryptRecovery,encryptRecovery,recoveryKey,restoreRecoveryObject,validateRecoveryObject } from './media-recovery-lib.mjs';
import { requireSyntheticUsers } from './staging-workload-lib.mjs';
const env=process.env,mode=process.argv[2];
if(!['backup','restore','initialize-journal'].includes(mode))throw new Error('Use backup, restore or initialize-journal');
const key=recoveryKey(env.MEDIA_BACKUP_ENCRYPTION_KEY);
function connection(prefix) {
 const ref=env[prefix+'_PROJECT_REF'],url=env[prefix+'_URL'],secret=env[prefix+'_SECRET_KEY'];
 if(!/^[a-z]{20}$/.test(ref??'')||url!==`https://${ref}.supabase.co`||!secret?.startsWith('sb_secret_'))throw new Error('recovery_project_identity_required');
 return {ref,client:createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false},
  global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(60000)})}})};
}
function checked(result){if(result.error)throw new Error('recovery_backend_failed');return result.data;}
async function current(client,entry){return checked(await client.rpc('recovery_media_is_current',{bucket:entry.bucket,object_path:entry.name}))===true;}
const source=connection('MEDIA_BACKUP_SOURCE');
if(env.MEDIA_BACKUP_SOURCE_APPROVED!=='true'||(mode!=='initialize-journal'&&!env.MEDIA_BACKUP_DIRECTORY))throw new Error('backup_operator_configuration_required');
const directory=path.resolve(env.MEDIA_BACKUP_DIRECTORY??'.');
const journalConfig=deletionJournalConfig(env,source.ref);
let report={scope:'encrypted-media-backup',completed:false,objects:0,excluded:0,existing:0,bytes:0};
try {
 if(mode==='initialize-journal'){
  await initializeDeletionJournal(journalConfig);report.scope='independent-deletion-journal-initialized';
 }else if(mode==='backup'){
  const journal=await loadDeletionJournal(journalConfig);
  // An existing backup directory is never overwritten, even after a previous failed run.
  await mkdir(directory,{recursive:false,mode:0o700});
  const manifest={version:1,sourceProjectRef:source.ref,createdAt:new Date().toISOString(),journalInitializedAt:journal.initializedAt,objects:[]};
  let cursor='';
  for(;;){
   const entries=checked(await source.client.rpc('get_recovery_media_manifest',{after_key:cursor,batch_size:500}));
   if(!Array.isArray(entries))throw new Error('invalid_recovery_manifest');
   for(const item of entries){
    if(journal.accounts.has(item.ownerId)||journal.objects.has(item.bucket+'/'+item.name)){report.excluded++;continue;}
    const result=await source.client.storage.from(item.bucket).download(item.name);
    if(result.error){if(!await current(source.client,item)){report.excluded++;continue;}throw new Error('backup_media_unavailable');}
    const bytes=Buffer.from(await result.data.arrayBuffer());
    const entry=validateRecoveryObject({...item,file:randomUUID()+'.enc',sha256:checksum(bytes),bytes:bytes.length,
     contentType:result.data.type.split(';')[0]});
    if(!await current(source.client,entry)){report.excluded++;continue;}
    await writeFile(path.join(directory,entry.file),encryptRecovery(bytes,key),{flag:'wx',mode:0o600});
    manifest.objects.push(entry);report.objects++;report.bytes+=bytes.length;
   }
   if(entries.length<500)break;
   const last=entries.at(-1),next=last.bucket+'/'+last.name;
   if(next<=cursor)throw new Error('invalid_manifest_cursor');cursor=next;
  }
  await writeFile(path.join(directory,'manifest.enc'),encryptRecovery(Buffer.from(JSON.stringify(manifest)),key),{flag:'wx',mode:0o600});
 }else{
  report.scope='isolated-staging-media-restore-rehearsal';
  const target=connection('MEDIA_RESTORE_TARGET');
  if(target.ref===source.ref||target.ref==='yztxwdhajgoqvtsqmcdw'||env.MEDIA_RESTORE_TARGET_SYNTHETIC!=='true'||env.MEDIA_RESTORE_TARGET_QUARANTINED!=='true')
   throw new Error('isolated_quarantined_restore_target_required');
  for(let page=1;;page++){
   const users=checked(await target.client.auth.admin.listUsers({page,perPage:1000})).users;
   requireSyntheticUsers(users);if(users.length<1000)break;
  }
  checked(await target.client.rpc('prepare_media_restore',{restore_id:randomUUID()}));
  report.accountsRemainQuarantined=true;report.restoredSessionsRevoked=true;
  const jwks=await Promise.all([source,target].map(async project=>{
   const response=await fetch(`https://${project.ref}.supabase.co/auth/v1/.well-known/jwks.json`,{signal:AbortSignal.timeout(15000),redirect:'error'});
   if(!response.ok)throw new Error('signing_key_verification_failed');const payload=await response.json();
   if(!Array.isArray(payload.keys)||!payload.keys.length)throw new Error('asymmetric_signing_keys_required');
   return payload.keys.map(value=>JSON.stringify([value.kty,value.crv,value.x,value.y,value.n,value.e]));
  }));
  if(jwks[0].some(key=>jwks[1].includes(key)))throw new Error('restore_signing_keys_not_separate');
  report.separateSigningKeysVerified=true;
  const journal=await loadDeletionJournal(journalConfig);
  const manifest=JSON.parse(decryptRecovery(await readFile(path.join(directory,'manifest.enc')),key).toString('utf8'));
  if(manifest.version!==1||manifest.sourceProjectRef!==source.ref||!Array.isArray(manifest.objects)||
   !Number.isFinite(Date.parse(manifest.createdAt))||Date.parse(manifest.createdAt)<Date.parse(journal.initializedAt))throw new Error('backup_project_mismatch');
  const seen=new Set();
  for(const entry of manifest.objects){
   validateRecoveryObject(entry);
   const identity=entry.bucket+'/'+entry.name;if(seen.has(identity))throw new Error('duplicate_backup_object');seen.add(identity);
   const bytes=decryptRecovery(await readFile(path.join(directory,entry.file)),key);
   const outcome=await restoreRecoveryObject(entry,bytes,{
    journalDenies:item=>journal.accounts.has(item.ownerId)||journal.objects.has(item.bucket+'/'+item.name),
    sourceCurrent:item=>current(source.client,item),targetCurrent:item=>current(target.client,item),
    async existing(item){const response=await target.client.storage.from(item.bucket).download(item.name);
     if(response.error){if(Number(response.error.statusCode??response.error.status)===404||response.error.code==='NoSuchKey')return null;throw new Error('restore_read_failed');}
     return Buffer.from(await response.data.arrayBuffer());},
    async upload(item,value){checked(await target.client.storage.from(item.bucket).upload(item.name,value,{contentType:item.contentType,upsert:false}));},
    async remove(item){checked(await target.client.storage.from(item.bucket).remove([item.name]));},
   });
   if(outcome==='restored'){report.objects++;report.bytes+=bytes.length;}else report[outcome]++;
  }
 }
 report.completed=true;
}catch{process.exitCode=1;report.code='media_recovery_failed';}
finally{key.fill(0);closeDeletionJournal(journalConfig);console.log(JSON.stringify({...report,completedAt:new Date().toISOString(),limitations:[
 'Requires live canonical source for deletion checks','No production cutover','All restored accounts stay quarantined; source-loss accounts cannot be automatically reopened','Off-site backup retention and 8-hour RTO/24-hour RPO drill remain unverified']}));}
