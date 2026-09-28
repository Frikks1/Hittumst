import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),sandbox:vi.fn()}));
vi.mock('@/lib/commerce',()=>({commerceDatabase:()=>({rpc:mocks.rpc}),requireSandbox:mocks.sandbox}));
import {billingConfig,purchaseReadiness,processBillingJob,fetchBillingSnapshot} from './server';
const config={HITTUMST_APP_ENV:'production',REVENUECAT_ENVIRONMENT:'PRODUCTION',REVENUECAT_SECRET_KEY:'test-private-key-with-sufficient-length',REVENUECAT_PLUS_PRODUCTS:'plus.ios,plus.android',REVENUECAT_PREMIUM_PRODUCTS:'premium.ios,premium.android',REVENUECAT_PLUS_ENTITLEMENT:'plus',REVENUECAT_PREMIUM_ENTITLEMENT:'premium'};
const id='10000000-0000-4000-8000-000000000001';
beforeEach(()=>{vi.resetAllMocks();for(const [key,value]of Object.entries(config))vi.stubEnv(key,value);});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('billing worker boundary',()=>{
 it('requires separate environment and exact product mappings',()=>{
  expect(Object.keys(billingConfig(config).products)).toHaveLength(4);
  expect(()=>billingConfig({...config,REVENUECAT_ENVIRONMENT:'SANDBOX'})).toThrow('billing_environment_unavailable');
  expect(()=>billingConfig({...config,REVENUECAT_PREMIUM_PRODUCTS:'plus.ios'})).toThrow('billing_catalog_conflict');
 });
 it('production sales cannot be enabled by credentials or fake sandbox reserves',()=>{
  expect(purchaseReadiness('PRODUCTION')).toEqual({purchaseAllowed:false,reason:'financial_provider_approval_required'});expect(mocks.sandbox).not.toHaveBeenCalled();
  mocks.sandbox.mockImplementation(()=>{throw Error();});expect(purchaseReadiness('SANDBOX').purchaseAllowed).toBe(false);
 });
 it('does no provider work without a claimed durable job',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);mocks.rpc.mockResolvedValue({data:null,error:null});
  expect(await processBillingJob()).toMatchObject({processed:0,pending:false});expect(fetcher).not.toHaveBeenCalled();
 });
 it('renews claims and persists retry status when the provider is unavailable',async()=>{
  mocks.rpc.mockImplementation(async(name:string,args:{p_action:string;p_input:{claimId?:string}})=>({error:null,data:name==='billing_provider_guard'?{state:'allowed',validUntil:new Date(Date.now()+120000).toISOString()}:args.p_action==='claim'?{id,claimId:args.p_input.claimId,environment:'PRODUCTION',context:{identities:[id],transferFrom:[],transferTo:[],source:'sync'}}:true}));
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:503})));
  await expect(processBillingJob(id)).rejects.toThrow('billing_provider_unavailable');
  expect(mocks.rpc.mock.calls.map(call=>call[1].p_action)).toEqual(['claim','renew',undefined,'retry']);
 });
 it('retains its lease until every parallel lookup has settled after a partial failure',async()=>{
  const second='10000000-0000-4000-8000-000000000002';let finishSecond!:(response:Response)=>void;
  const waiting=new Promise<Response>(resolve=>{finishSecond=resolve;});
  mocks.rpc.mockImplementation(async(name:string,args:{p_action:string;p_input:{claimId?:string}})=>({error:null,data:name==='billing_provider_guard'?{state:'allowed',validUntil:new Date(Date.now()+120000).toISOString()}:args.p_action==='claim'?{id,claimId:args.p_input.claimId,environment:'PRODUCTION',context:{identities:[id,second],transferFrom:[],transferTo:[],source:'sync'}}:true}));
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('',{status:503})).mockReturnValueOnce(waiting);vi.stubGlobal('fetch',fetcher);
  const running=processBillingJob(id);await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
  expect(mocks.rpc.mock.calls.some(call=>call[1].p_action==='retry')).toBe(false);
  finishSecond(new Response(JSON.stringify({request_date_ms:Date.now(),subscriber:{original_app_user_id:second,subscriptions:{},entitlements:{}}})));
  await expect(running).rejects.toThrow('billing_provider_unavailable');
  expect(mocks.rpc.mock.calls.filter(call=>call[1].p_action==='retry')).toHaveLength(1);
 });
 it('uses the authenticated UUID at a fixed provider origin and rejects redirects',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({request_date_ms:Date.now(),subscriber:{original_app_user_id:id,subscriptions:{},entitlements:{}}})));vi.stubGlobal('fetch',fetcher);
  expect((await fetchBillingSnapshot(id)).periods).toEqual([]);
  expect(fetcher).toHaveBeenCalledWith(`https://api.revenuecat.com/v1/subscribers/${id}`,expect.objectContaining({redirect:'error',cache:'no-store'}));
 });
});


