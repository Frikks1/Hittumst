import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveGeneratedTypes } from './generated-types.mjs';
test('failed and empty type generation preserve the previous generated schema', async () => {
 const directory = await mkdtemp(path.join(os.tmpdir(),'hittumst-typegen-'));
 const target = path.join(directory,'database.ts');
 try {
  await writeFile(target,'previous schema');
  for (const [body,code] of [['',0],['connection failed',1],['export type Database = {};',1]]) {
   await assert.rejects(saveGeneratedTypes(target,body,code));
   assert.equal(await readFile(target,'utf8'),'previous schema');
  }
  await saveGeneratedTypes(target,'export type Database = {};',0);
  assert.equal(await readFile(target,'utf8'),'export type Database = {};');
 } finally { await rm(directory,{recursive:true,force:true}); }
});
