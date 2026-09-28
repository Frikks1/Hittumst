import {createHmac} from 'node:crypto';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({command:vi.fn(),config:vi.fn()}));
vi.mock('@/lib/billing/server',()=>({billingCommand:mocks.command,billingConfig:mocks.config}));
import {POST} from './route';
const secret='test-webhook-secret-longer-than-thirty-two-characters';
function request(event:unknown,sign=true){const raw=JSON.stringify({event});const timestamp=Math.floor(Date.now()/1000);const digest=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');return new Request('https://app.example/api/webhooks/revenuecat',{method:'POST',body:raw,headers:sign?{'x-revenuecat-webhook-signature':`t=${timestamp},v1=${digest}`}:{}});}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('REVENUECAT_WEBHOOK_SECRET',secret);mocks.command.mockResolvedValue({disposition:'queued',jobId:'job'});});
afterEach(()=>vi.unstubAllEnvs());
describe('durable RevenueCat webhook',()=>{
 it('rejects unsigned events before database access',async()=>{expect((await POST(request({id:'x',type:'TRANSFER'},false))).status).toBe(401);expect(mocks.command).not.toHaveBeenCalled();});
 it('accepts signed transfer arrays without app_user_id and acknowledges after commit',async()=>{expect((await POST(request({id:'transfer',type:'TRANSFER',transferred_from:['10000000-0000-4000-8000-000000000001'],transferred_to:['10000000-0000-4000-8000-000000000002'],event_timestamp_ms:Date.now()}))).status).toBe(200);expect(mocks.command).toHaveBeenCalledWith('receipt',expect.objectContaining({eventEnvironment:'UNKNOWN',eventType:'TRANSFER',context:expect.objectContaining({identities:expect.any(Array)})}));});
 it('asks the provider to retry when durable storage is unavailable',async()=>{mocks.command.mockRejectedValue(Error('offline'));expect((await POST(request({id:'refund',type:'CANCELLATION',environment:'PRODUCTION'}))).status).toBe(503);});
 it('refuses reuse of an event ID with a different body',async()=>{mocks.command.mockRejectedValue(Error('billing_receipt_conflict'));expect((await POST(request({id:'same',type:'BILLING_ISSUE'}))).status).toBe(409);});
});
