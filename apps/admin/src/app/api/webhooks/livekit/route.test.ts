import {createHash} from 'node:crypto';
import {AccessToken,WebhookReceiver} from 'livekit-server-sdk';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({command:vi.fn(),revoke:vi.fn()}));
const key='unit-test-key',secret='unit-test-secret-with-no-real-access-12345';
vi.mock('@/lib/voice/server',async()=>({voiceCommand:mocks.command,revokeVoiceParticipant:mocks.revoke,voiceWebhookReceiver:()=>new WebhookReceiver('unit-test-key','unit-test-secret-with-no-real-access-12345')}));
import {POST} from './route';
const event={id:'event-1',event:'participant_joined',createdAt:String(Math.floor(Date.now()/1000)),room:{name:'group-96000000-0000-4000-8000-000000000010'},participant:{identity:'96000000-0000-4000-8000-000000000001'}};
async function request(payload=event) {
 const raw=JSON.stringify(payload);const token=new AccessToken(key,secret);token.sha256=createHash('sha256').update(raw).digest('base64');
 return new Request('https://app.example/api/webhooks/livekit',{method:'POST',body:raw,headers:{Authorization:await token.toJwt()}});
}
beforeEach(()=>{vi.resetAllMocks();mocks.command.mockImplementation(async(action:string)=>action==='validate'?true:{duplicate:false});mocks.revoke.mockResolvedValue(undefined);});
describe('signed LiveKit webhooks',()=>{
 it('rejects an unsigned webhook before DB or provider access',async()=>{
  expect((await POST(new Request('https://app.example',{method:'POST',body:JSON.stringify(event)}))).status).toBe(401);expect(mocks.command).not.toHaveBeenCalled();
 });
 it('rejects mutated content with a valid signature for different bytes',async()=>{
  const original=await request();const changed=new Request(original.url,{method:'POST',headers:original.headers,body:JSON.stringify({...event,id:'forged'})});
  expect((await POST(changed)).status).toBe(401);expect(mocks.command).not.toHaveBeenCalled();
 });
 it('records valid signed events and does not remove authorized participants',async()=>{
  expect((await POST(await request())).status).toBe(200);expect(mocks.command).toHaveBeenCalledWith('validate',event.participant.identity,{roomName:event.room.name});expect(mocks.revoke).not.toHaveBeenCalled();
 });
 it('retries invalid-participant removal on duplicate delivery after a provider outage',async()=>{
  mocks.command.mockImplementation(async(action:string)=>action==='validate'?false:{duplicate:true});mocks.revoke.mockRejectedValueOnce(Error('timeout'));
  expect((await POST(await request())).status).toBe(503);expect((await POST(await request())).status).toBe(200);expect(mocks.revoke).toHaveBeenCalledTimes(2);
 });
 it('rejects expired event replays beyond the receipt-retention window',async()=>{
  expect((await POST(await request({...event,createdAt:'1'}))).status).toBe(401);expect(mocks.command).not.toHaveBeenCalled();
 });
});

