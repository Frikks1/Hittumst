import { GetObjectCommand,ListObjectsV2Command,PutObjectCommand,S3Client } from '@aws-sdk/client-s3';
import { createTombstone,decryptTombstone,encryptTombstone,journalIdentity } from '../apps/admin/src/lib/jobs/deletion-journal-crypto.ts';
import { recoveryKey } from './media-recovery-lib.mjs';
export function deletionJournalConfig(env,projectRef){
 const Bucket=env.MEDIA_BACKUP_BUCKET,keyId=env.MEDIA_BACKUP_KEY_ID;
 if(env.AWS_REGION!=='eu-central-1'||!Bucket||Bucket===env.AWS_MEDIA_BUCKET||!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId??''))throw new Error('independent_deletion_journal_required');
 const keys=new Map([[keyId,recoveryKey(env.MEDIA_BACKUP_ENCRYPTION_KEY)]]);
 if(env.MEDIA_BACKUP_OLD_KEYS_JSON){for(const[id,value]of Object.entries(JSON.parse(env.MEDIA_BACKUP_OLD_KEYS_JSON))){
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id)||id===keyId)throw new Error('invalid_journal_keyring');keys.set(id,recoveryKey(value));}}
 return {Bucket,keyId,keys,projectRef,client:new S3Client({region:'eu-central-1',maxAttempts:3})};
}
async function read(config,Key){
 const result=await config.client.send(new GetObjectCommand({Bucket:config.Bucket,Key}),{abortSignal:AbortSignal.timeout(30000)});
 if(!result.Body||(result.ContentLength??0)>10485760)throw new Error('invalid_journal_record');
 const keyId=Key.split('/')[2],key=config.keys.get(keyId);if(!key)throw new Error('historical_journal_key_required');
 const entry=decryptTombstone(await result.Body.transformToByteArray(),key);
 if(entry.projectRef!==config.projectRef||entry.keyId!==keyId)throw new Error('journal_project_mismatch');
 return entry;
}
export async function initializeDeletionJournal(config){
 const Key=`deletions/${config.projectRef}/${config.keyId}/initialized.enc`;
 const marker=createTombstone({id:'__init__',account_id:'__journal__',objects:[]},config.keyId,config.projectRef);
 try{await config.client.send(new PutObjectCommand({Bucket:config.Bucket,Key,Body:encryptTombstone(marker,config.keys.get(config.keyId)),
  IfNoneMatch:'*',ServerSideEncryption:'AES256',ContentType:'application/octet-stream'}),{abortSignal:AbortSignal.timeout(30000)});}
 catch(error){if(error.$metadata?.httpStatusCode!==412)throw new Error('journal_initialization_failed');}
 const result=await read(config,Key);if(result.accountId!=='__journal__'||result.jobId!=='__init__')throw new Error('invalid_journal_initialization');
 return result.recordedAt;
}
export async function loadDeletionJournal(config){
 const marker=await read(config,`deletions/${config.projectRef}/${config.keyId}/initialized.enc`);
 if(marker.accountId!=='__journal__'||marker.jobId!=='__init__'||!Number.isFinite(Date.parse(marker.recordedAt)))throw new Error('invalid_journal_initialization');
 const accounts=new Set(),objects=new Set();let cursor,records=0;
 do{
  const page=await config.client.send(new ListObjectsV2Command({Bucket:config.Bucket,Prefix:`deletions/${config.projectRef}/`,MaxKeys:1000,ContinuationToken:cursor}),{abortSignal:AbortSignal.timeout(30000)});
  for(const item of page.Contents??[]){
   if(!item.Key||!/\/([a-zA-Z0-9_-]{1,64})\/(initialized\.enc|records\/[a-f0-9]{64}\.enc)$/.test(item.Key))throw new Error('invalid_journal_object');
   const entry=await read(config,item.Key);
   if(entry.accountId==='__journal__'&&entry.jobId==='__init__')continue;
   if(!item.Key.endsWith('/records/'+journalIdentity({id:entry.jobId,account_id:entry.accountId,objects:entry.objects})+'.enc'))throw new Error('journal_record_identity_mismatch');
   accounts.add(entry.accountId);for(const object of entry.objects)objects.add(object.bucket+'/'+object.name);records++;
  }
  if(page.IsTruncated&&!page.NextContinuationToken)throw new Error('incomplete_deletion_journal');
  cursor=page.IsTruncated?page.NextContinuationToken:undefined;
 }while(cursor);
 return {accounts,objects,records,initializedAt:marker.recordedAt};
}
export function closeDeletionJournal(config){for(const key of config.keys.values())key.fill(0);config.client.destroy();}
