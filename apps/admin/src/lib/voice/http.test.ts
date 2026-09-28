import { describe,expect,it } from 'vitest';
import { readVoiceBody } from './http';
describe('bounded webhook bodies',()=>{
 it('keeps the raw bytes exact for signature validation',async()=>{
  const raw=' {"message":"Ísland"}\n';
  expect(await readVoiceBody(new Request('https://app.example',{method:'POST',body:raw}),100)).toBe(raw);
 });
 it('rejects a streamed body above the byte limit even without Content-Length',async()=>{
  await expect(readVoiceBody(new Request('https://app.example',{method:'POST',body:'í'.repeat(10)}),10)).rejects.toThrow('body_too_large');
 });
});
