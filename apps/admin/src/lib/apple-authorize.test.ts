import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({config:vi.fn(),exchange:vi.fn(),seal:vi.fn(),revoke:vi.fn()}));
vi.mock('./apple-tokens',()=>({appleConfiguration:mocks.config,exchangeAppleCode:mocks.exchange,sealAppleToken:mocks.seal,revokeAppleToken:mocks.revoke}));
import {startAppleReauthorization,finishAppleReauthorization,AppleReturnError} from './apple-authorize';
const account='10000000-0000-4000-8000-000000000001',session='10000000-0000-4000-8000-000000000002',state='a'.repeat(43);
const rpc=vi.fn();const db={rpc} as unknown as SupabaseClient;
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('NEXT_PUBLIC_APP_URL','https://hittumst.example');vi.stubEnv('APPLE_SERVICE_CLIENT_ID','is.rummal.web');mocks.config.mockReturnValue({clientId:'is.rummal.web'});mocks.exchange.mockResolvedValue({clientId:'is.rummal.web',refreshToken:'private-refresh'});mocks.seal.mockReturnValue('encrypted-envelope');rpc.mockImplementation(async(name:string)=>({error:null,data:name==='apple_authorization_take'?{accountId:account,sessionId:session,subject:'apple-sub',returnMode:'web'}:null}));});
afterEach(()=>vi.unstubAllEnvs());
describe('Apple OAuth state and custody',()=>{
 it('registers only a hash of random state and binds the verified session and web return',async()=>{
  const url=new URL(await startAppleReauthorization(db,account,'apple-sub',session,'web'));const nonce=url.searchParams.get('state')!;
  expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(url.origin).toBe('https://appleid.apple.com');expect(url.searchParams.get('redirect_uri')).toBe('https://hittumst.example/api/account/apple/callback');
  expect(rpc).toHaveBeenCalledWith('apple_authorization_start_bound',{account_id:account,apple_subject:'apple-sub',session_id:session,return_mode:'web',state_hash:createHash('sha256').update(nonce).digest('hex')});
 });
 it('does not exchange an unknown, malformed, replayed or expired state',async()=>{
  await expect(finishAppleReauthorization(db,'invalid','code')).rejects.toThrow('apple_authorization_invalid');expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValue({error:null,data:null});await expect(finishAppleReauthorization(db,state,'code')).rejects.toThrow('apple_authorization_expired');expect(mocks.exchange).not.toHaveBeenCalled();
 });
 it('uses only the stored account, session and subject for successful token custody',async()=>{
  expect(await finishAppleReauthorization(db,state,'apple-code')).toBe('web');
  expect(mocks.exchange).toHaveBeenCalledWith('apple-code','apple-sub','is.rummal.web','https://hittumst.example/api/account/apple/callback');
  expect(rpc).toHaveBeenLastCalledWith('apple_token_store_authorized',{account_id:account,apple_subject:'apple-sub',session_id:session,client_id:'is.rummal.web',sealed_token:'encrypted-envelope'});
  expect(JSON.stringify(rpc.mock.calls)).not.toContain('private-refresh');
 });
 it('consumes cancellation state and preserves its approved return mode',async()=>{
  await expect(finishAppleReauthorization(db,state,'')).rejects.toMatchObject({returnMode:'web'});expect(mocks.exchange).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledOnce();
 });
 it('revokes an exchanged token when the session disappears before atomic storage',async()=>{
  rpc.mockImplementation(async(name:string)=>name==='apple_authorization_take'?{error:null,data:{accountId:account,sessionId:session,subject:'apple-sub',returnMode:'native'}}:{error:{code:'42501'},data:null});
  await expect(finishAppleReauthorization(db,state,'code')).rejects.toBeInstanceOf(AppleReturnError);expect(mocks.revoke).toHaveBeenCalledWith('private-refresh','is.rummal.web');
 });
 it('does not accept a configured return origin containing credentials, paths or HTTP',async()=>{
  for(const value of ['http://hittumst.example','https://name:pass@hittumst.example','https://hittumst.example/attacker']){vi.stubEnv('NEXT_PUBLIC_APP_URL',value);await expect(startAppleReauthorization(db,account,'apple-sub',session,'web')).rejects.toThrow('apple_provider_unavailable');}
 });
});
