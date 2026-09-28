import { createCipheriv,createDecipheriv,createHash,randomBytes } from 'node:crypto';
import type { DeletionJob } from './account-deletion';
export type DeletionTombstone = { version:1; projectRef:string; keyId:string; accountId:string; jobId:string; recordedAt:string; objects:{bucket:string;name:string}[] };
const header=Buffer.from('HITTUMST-DELETION-1\0');
export function journalIdentity(job:DeletionJob) { return createHash('sha256').update(job.account_id+'\0'+job.id+'\0'+JSON.stringify([...job.objects].sort((a,b)=>(a.bucket+'/'+a.name).localeCompare(b.bucket+'/'+b.name)))).digest('hex'); }
export function createTombstone(job:DeletionJob,keyId:string,projectRef='synthetic'):DeletionTombstone {
 if(!/^[a-zA-Z0-9_-]{1,64}$/.test(keyId)||!job.id||!job.account_id||!Array.isArray(job.objects))throw new Error('invalid_deletion_tombstone');
 return {version:1,projectRef,keyId,accountId:job.account_id,jobId:job.id,recordedAt:new Date().toISOString(),
  objects:job.objects.map(({bucket,name})=>({bucket,name})).sort((a,b)=>(a.bucket+'/'+a.name).localeCompare(b.bucket+'/'+b.name))};
}
export function encryptTombstone(value:DeletionTombstone,key:Uint8Array) {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(header);
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return Buffer.concat([header,iv,cipher.getAuthTag(),ciphertext]);
}
export function decryptTombstone(bytes:Uint8Array,key:Uint8Array):DeletionTombstone {
 const body=Buffer.from(bytes);
 if(body.length<header.length+28||!body.subarray(0,header.length).equals(header))throw new Error('invalid_deletion_journal');
 const decipher=createDecipheriv('aes-256-gcm',key,body.subarray(header.length,header.length+12));decipher.setAAD(header);
 decipher.setAuthTag(body.subarray(header.length+12,header.length+28));
 const value=JSON.parse(Buffer.concat([decipher.update(body.subarray(header.length+28)),decipher.final()]).toString('utf8'));
 if(value.version!==1||typeof value.projectRef!=='string'||typeof value.keyId!=='string'||typeof value.accountId!=='string'||typeof value.jobId!=='string'||
  !Array.isArray(value.objects)||value.objects.some((item:{bucket?:unknown;name?:unknown})=>typeof item.bucket!=='string'||typeof item.name!=='string'))throw new Error('invalid_deletion_journal');
 return value;
}
export function assertTombstoneMatches(actual:DeletionTombstone,expected:DeletionTombstone) {
 if(actual.version!==1||actual.projectRef!==expected.projectRef||actual.accountId!==expected.accountId||actual.jobId!==expected.jobId||actual.keyId!==expected.keyId||
  JSON.stringify(actual.objects)!==JSON.stringify(expected.objects))throw new Error('deletion_journal_conflict');
}
export async function publishTombstone(job:DeletionJob,keyId:string,key:Uint8Array,store:{
 putIfAbsent(path:string,bytes:Uint8Array):Promise<void>;
 read(path:string):Promise<Uint8Array>;
},projectRef='synthetic') {
 const tombstone=createTombstone(job,keyId,projectRef),path=`deletions/${projectRef}/${keyId}/records/${journalIdentity(job)}.enc`;
 await store.putIfAbsent(path,encryptTombstone(tombstone,key));
 assertTombstoneMatches(decryptTombstone(await store.read(path),key),tombstone);
}
