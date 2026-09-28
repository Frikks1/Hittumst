import { GetObjectCommand,PutObjectCommand,S3Client } from '@aws-sdk/client-s3';
import type { DeletionJob } from './account-deletion';
import { publishTombstone,decryptTombstone } from './deletion-journal-crypto';
/** Separate encrypted AWS storage survives Supabase PITR. No configured journal => no completed deletion. */
export async function publishDeletionTombstone(job:DeletionJob) {
 const { MEDIA_BACKUP_BUCKET:Bucket,MEDIA_BACKUP_ENCRYPTION_KEY:encoded,MEDIA_BACKUP_KEY_ID:keyId }=process.env;
 if(process.env.AWS_REGION!=='eu-central-1'||!Bucket||Bucket===process.env.AWS_MEDIA_BUCKET||!keyId||!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId)||!/^[a-f0-9]{64}$/i.test(encoded??''))
  throw new Error('deletion_journal_unavailable');
 const projectRef=process.env.WORKER_EXPECTED_PROJECT_REF;
 if(!/^[a-z]{20}$/.test(projectRef??''))throw new Error('deletion_journal_identity_required');
 const key=Buffer.from(encoded!,'hex');
 const client=new S3Client({region:'eu-central-1',maxAttempts:3});
 try {
  const initialized=await client.send(new GetObjectCommand({Bucket,Key:`deletions/${projectRef}/${keyId}/initialized.enc`}),{abortSignal:AbortSignal.timeout(30000)});
  if(!initialized.Body)throw new Error('deletion_journal_uninitialized');
  const marker=decryptTombstone(await initialized.Body.transformToByteArray(),key);
  if(marker.projectRef!==projectRef||marker.keyId!==keyId||marker.accountId!=='__journal__'||marker.jobId!=='__init__')throw new Error('deletion_journal_uninitialized');
  await publishTombstone(job,keyId,key,{
   async putIfAbsent(Key,Body){
    try{await client.send(new PutObjectCommand({Bucket,Key,Body,IfNoneMatch:'*',ServerSideEncryption:'AES256',ContentType:'application/octet-stream'}),{abortSignal:AbortSignal.timeout(30000)});}
    catch(error){if((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==412)throw new Error('deletion_journal_write_failed', { cause: error });}
   },
   async read(Key){const response=await client.send(new GetObjectCommand({Bucket,Key}),{abortSignal:AbortSignal.timeout(30000)});
    if(!response.Body)throw new Error('deletion_journal_read_failed');return response.Body.transformToByteArray();},
  },projectRef);
 }finally{key.fill(0);client.destroy();}
}
