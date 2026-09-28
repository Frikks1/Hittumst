import { describe,it,expect } from 'vitest';
import {randomBytes} from 'node:crypto';
import {publishTombstone,decryptTombstone} from './deletion-journal-crypto';
const job={id:'synthetic-job',account_id:'synthetic-account',objects:[{bucket:'profile-photos',name:'private-path'}]};
describe('independent deletion journal',()=>{
 it('publishes encrypted records once and verifies an identical retry',async()=>{
  const key=randomBytes(32),objects=new Map<string,Uint8Array>();let writes=0;
  const store={async putIfAbsent(path:string,bytes:Uint8Array){if(!objects.has(path)){objects.set(path,bytes);writes++;}},async read(path:string){return objects.get(path)!;}};
  await publishTombstone(job,'v1',key,store);await publishTombstone(job,'v1',key,store);
  expect(writes).toBe(1);expect([...objects.keys()][0]).not.toContain('synthetic-account');
  expect(Buffer.from([...objects.values()][0]!).toString()).not.toContain('private-path');
  expect(decryptTombstone([...objects.values()][0]!,key)).toMatchObject({accountId:job.account_id,jobId:job.id,objects:job.objects});
 });
 it('does not accept a write without read verification or mismatched journal content',async()=>{
  const key=randomBytes(32);let bytes:Uint8Array;
  const store={async putIfAbsent(_path:string,value:Uint8Array){bytes??=value;},async read(){if(!bytes)throw new Error('missing');return bytes;}};
  await publishTombstone(job,'v1',key,store);
  await expect(publishTombstone({...job,objects:[]},'v1',key,store)).rejects.toThrow('conflict');
  await expect(publishTombstone(job,'v1',randomBytes(32),store)).rejects.toThrow();
 });
});
