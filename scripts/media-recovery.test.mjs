import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { checksum,decryptRecovery,encryptRecovery,restoreRecoveryObject,validateRecoveryObject } from './media-recovery-lib.mjs';
const bytes=Buffer.from('synthetic media');
const entry={ownerId:randomUUID(),bucket:'profile-photos',name:`${randomUUID()}/${randomUUID()}.jpg`,file:`${randomUUID()}.enc`,sha256:checksum(bytes),bytes:bytes.length,contentType:'image/jpeg'};
test('encrypted backup authenticates the whole ciphertext and rejects tampering/wrong keys',()=>{
 const key=randomBytes(32),encrypted=encryptRecovery(bytes,key);
 assert.deepEqual(decryptRecovery(encrypted,key),bytes);
 assert.ok(!encrypted.includes(bytes));
 assert.throws(()=>decryptRecovery(encrypted,randomBytes(32)));
 encrypted[encrypted.length-1]^=1;assert.throws(()=>decryptRecovery(encrypted,key));
});
test('manifest denies quarantine and path traversal',()=>{
 validateRecoveryObject(entry);
 for(const update of [{bucket:'media-quarantine'},{file:'../secret'},{name:entry.name+'/../secret'},{bytes:52428801}])
  assert.throws(()=>validateRecoveryObject({...entry,...update}));
});
test('deleted source or target references exclude objects without a write',async()=>{
 for(const [source,target]of[[false,true],[true,false]]){
  const result=await restoreRecoveryObject(entry,bytes,{sourceCurrent:async()=>source,targetCurrent:async()=>target,upload:async()=>assert.fail('must not restore')});
  assert.equal(result,'excluded');
 }
});
test('restore verifies bytes and never overwrites a conflicting existing object',async()=>{
 await assert.rejects(restoreRecoveryObject(entry,bytes,{sourceCurrent:async()=>true,targetCurrent:async()=>true,existing:async()=>Buffer.from('different'),upload:async()=>assert.fail('must not overwrite')}),/conflict/);
 await assert.rejects(restoreRecoveryObject(entry,Buffer.from('tampered'),{}),/checksum/);
});
test('deletion during restoration removes the newly written copy',async()=>{
 let checks=0,stored=null,removed=false;
 const result=await restoreRecoveryObject(entry,bytes,{sourceCurrent:async()=>++checks===1,targetCurrent:async()=>true,existing:async()=>stored,
  upload:async(_entry,value)=>{stored=value;},remove:async()=>{removed=true;stored=null;}});
 assert.equal(result,'excluded');assert.equal(removed,true);assert.equal(stored,null);
});
test('active object restores and passes a byte checksum',async()=>{
 let stored=null;
 assert.equal(await restoreRecoveryObject(entry,bytes,{sourceCurrent:async()=>true,targetCurrent:async()=>true,existing:async()=>stored,
  upload:async(_entry,value)=>{stored=value;},remove:async()=>assert.fail()}),'restored');
});

test('independent deletion tombstones deny bytes even if both restored databases claim active',async()=>{
 let queried=false;const result=await restoreRecoveryObject(entry,bytes,{journalDenies:()=>true,sourceCurrent:async()=>{queried=true;return true;},targetCurrent:async()=>true,upload:async()=>assert.fail('deleted bytes must never restore')});
 assert.equal(result,'excluded');assert.equal(queried,false);
});

// The journal adapter is exercised with encrypted bytes and an in-memory S3 interface.
// No credentials or network operations are used by these tests.
import { loadDeletionJournal } from './deletion-journal-store.mjs';
import { createTombstone,encryptTombstone,journalIdentity } from '../apps/admin/src/lib/jobs/deletion-journal-crypto.ts';
function journalFixture(){
 const key=randomBytes(32),keyId='test-key',projectRef='a'.repeat(20),prefix=`deletions/${projectRef}/${keyId}/`;
 const job={id:randomUUID(),account_id:entry.ownerId,objects:[{bucket:entry.bucket,name:entry.name}]};
 const store=new Map([[prefix+'initialized.enc',encryptTombstone(createTombstone({id:'__init__',account_id:'__journal__',objects:[]},keyId,projectRef),key)],
  [prefix+'records/'+journalIdentity(job)+'.enc',encryptTombstone(createTombstone(job,keyId,projectRef),key)]]);
 const config={keyId,projectRef,keys:new Map([[keyId,key]]),Bucket:'synthetic-journal',client:{async send(command){
  if(command.constructor.name==='ListObjectsV2Command')return {Contents:[...store.keys()].map(Key=>({Key})),IsTruncated:false};
  const body=store.get(command.input.Key);if(!body)throw new Error('missing_journal_record');return {ContentLength:body.length,Body:{async transformToByteArray(){return body;}}};
 }}};
 return {config,store,prefix,job};
}
test('journal replay denies accounts and objects and rejects renamed record identities',async()=>{
 const {config,store,prefix,job}=journalFixture();const loaded=await loadDeletionJournal(config);
 assert.equal(loaded.records,1);assert.ok(loaded.accounts.has(entry.ownerId));assert.ok(loaded.objects.has(entry.bucket+'/'+entry.name));
 const correct=prefix+'records/'+journalIdentity(job)+'.enc';const bytes=store.get(correct);store.delete(correct);store.set(prefix+'records/'+'0'.repeat(64)+'.enc',bytes);
 await assert.rejects(loadDeletionJournal(config),/journal_record_identity_mismatch/);
});
test('missing journal initialization and unknown historical keys fail closed',async()=>{
 const {config,store,prefix}=journalFixture();const init=store.get(prefix+'initialized.enc');store.delete(prefix+'initialized.enc');
 await assert.rejects(loadDeletionJournal(config),/missing_journal_record/);store.set(prefix+'initialized.enc',init);
 store.set(`deletions/${config.projectRef}/old-key/records/${'a'.repeat(64)}.enc`,Buffer.from('encrypted-with-unavailable-key'));
 await assert.rejects(loadDeletionJournal(config),/historical_journal_key_required/);
});
