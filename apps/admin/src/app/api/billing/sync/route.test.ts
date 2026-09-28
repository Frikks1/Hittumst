import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),command:vi.fn(),config:vi.fn(),process:vi.fn(),readiness:vi.fn()}));
vi.mock('@/lib/auth/member-database',()=>({memberDatabase:()=>({rpc:mocks.rpc})}));
vi.mock('@/lib/billing/server',()=>({billingCommand:mocks.command,billingConfig:mocks.config,processBillingJob:mocks.process,purchaseReadiness:mocks.readiness}));
import {GET,POST} from './route';
const id='10000000-0000-4000-8000-000000000001';
function request(method='POST',body:unknown={},headers:Record<string,string>={}){return new Request('https://app.example/api/billing/sync',{method,...method==='POST'?{body:JSON.stringify(body)}:{},headers:{Authorization:'Bearer member-session',...headers}});}
beforeEach(()=>{vi.resetAllMocks();mocks.rpc.mockResolvedValue({data:{accountId:id,configured:true,environment:'PRODUCTION',jobId:id},error:null});mocks.config.mockReturnValue({environment:'PRODUCTION'});mocks.readiness.mockReturnValue({purchaseAllowed:false,reason:'financial_provider_approval_required'});mocks.command.mockResolvedValue('verified');});
describe('authenticated billing synchronization',()=>{
 it('does not accept client identities or customer entitlements',async()=>{expect((await POST(request('POST',{appUserId:id,customerInfo:{}}))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();});
 it('requires bearer authentication and rejects foreign browser origins',async()=>{expect((await POST(request('POST',{}, {Authorization:''}))).status).toBe(401);expect((await GET(request('GET',{}, {Origin:'https://attacker.example'}))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();});
 it('returns production sales closed while allowing authoritative restore synchronization',async()=>{expect(await (await GET(request('GET'))).json()).toMatchObject({purchaseAllowed:false});const response=await POST(request());expect(response.status).toBe(200);expect(await response.json()).toMatchObject({status:'verified',purchaseAllowed:false});expect(mocks.process).toHaveBeenCalledWith(id);});
 it('keeps a successfully requested sync pending after provider failure',async()=>{mocks.process.mockRejectedValue(Error('provider'));const response=await POST(request());expect(response.status).toBe(202);expect(await response.json()).toMatchObject({status:'queued'});});
 it('does not call a historical review or in-progress claim verified',async()=>{mocks.command.mockResolvedValue('review');const response=await POST(request());expect(response.status).toBe(202);expect(await response.json()).toMatchObject({status:'queued',reason:'billing_review_required'});});
 it('separates authorization, rate limit and database outage',async()=>{for(const [error,status]of [[{code:'42501'},403],[{message:'rate_limit_exceeded'},429],[{code:'network'},503]] as const){mocks.rpc.mockResolvedValue({data:null,error});expect((await POST(request())).status).toBe(status);}});
});
