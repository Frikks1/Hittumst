import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({member:vi.fn(),service:vi.fn(),exchange:vi.fn(),retain:vi.fn(),start:vi.fn()}));
vi.mock('@/lib/auth/member-database',()=>({memberDatabase:()=>({rpc:mocks.member})}));
vi.mock('@/lib/commerce',()=>({commerceDatabase:()=>({rpc:mocks.service})}));
vi.mock('@/lib/apple-tokens',()=>({exchangeAppleCode:mocks.exchange}));
vi.mock('@/lib/apple-authorize',()=>({startAppleReauthorization:mocks.start,retainAppleCredentials:mocks.retain}));
import {GET,POST} from './route';
const account='10000000-0000-4000-8000-000000000001',session='10000000-0000-4000-8000-000000000002';
function request(body?:unknown,headers:Record<string,string>={}){return new Request('https://hittumst.example/api/account/apple',{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer member-token',...headers},...body===undefined?{}:{body:JSON.stringify(body)}});}
beforeEach(()=>{vi.resetAllMocks();mocks.member.mockResolvedValue({data:{accountId:account,sessionId:session,subject:'apple-sub'},error:null});mocks.service.mockResolvedValue({data:{token:{sealedToken:'never-public'}},error:null});mocks.start.mockResolvedValue('https://appleid.apple.com/auth/authorize?state=opaque');mocks.exchange.mockResolvedValue({refreshToken:'private-refresh',clientId:'native-client'});});
describe('Apple custody API',()=>{
 it('requires a current session and denies foreign origins before vault access',async()=>{expect((await GET(request(undefined,{Authorization:''}))).status).toBe(401);expect((await GET(request(undefined,{Origin:'https://evil.example'}))).status).toBe(403);expect(mocks.service).not.toHaveBeenCalled();mocks.member.mockResolvedValue({error:{code:'42501'},data:null});expect((await POST(request({code:'code'}))).status).toBe(401);expect(mocks.exchange).not.toHaveBeenCalled();});
 it('returns readiness without leaking encrypted or plaintext provider credentials',async()=>{const response=await GET(request());expect(await response.json()).toEqual({requiresRevocation:true,ready:true});expect(response.headers.get('cache-control')).toContain('no-store');});
 it('binds web reauthorization to authoritative member and session context',async()=>{expect((await POST(request({action:'reauthorize',returnMode:'web'}))).status).toBe(200);expect(mocks.start).toHaveBeenCalledWith(expect.anything(),account,'apple-sub',session,'web');});
 it('binds native code custody to the current provider identity and session',async()=>{expect((await POST(request({code:'one-use-code'}))).status).toBe(200);expect(mocks.exchange).toHaveBeenCalledWith('one-use-code','apple-sub');expect(mocks.retain).toHaveBeenCalledWith(expect.anything(),account,'apple-sub',session,{refreshToken:'private-refresh',clientId:'native-client'});});
 it('rejects supplied identities and redirect URLs instead of silently ignoring them',async()=>{for(const body of [{code:'x',accountId:account},{action:'reauthorize',returnMode:'web',redirect:'https://evil.example'}])expect((await POST(request(body))).status).toBe(400);expect(mocks.start).not.toHaveBeenCalled();expect(mocks.exchange).not.toHaveBeenCalled();});
 it('does not report readiness when the vault write or cleanup failed',async()=>{mocks.retain.mockRejectedValue(Error('provider unavailable'));expect((await POST(request({code:'code'}))).status).toBe(503);});
});
