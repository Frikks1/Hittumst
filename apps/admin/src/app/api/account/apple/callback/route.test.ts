import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({finish:vi.fn(),origin:vi.fn()}));
vi.mock('@/lib/commerce',()=>({commerceDatabase:()=>({})}));
vi.mock('@/lib/apple-authorize',async()=>{const original=await vi.importActual<typeof import('@/lib/apple-authorize')>('@/lib/apple-authorize');return {...original,finishAppleReauthorization:mocks.finish,appleWebsiteOrigin:mocks.origin};});
import {AppleReturnError} from '@/lib/apple-authorize';
import {POST} from './route';
const request=(body='state=nonce&code=private-code&returnMode=native&redirect=https%3A%2F%2Fevil.example')=>new Request('https://hittumst.example/api/account/apple/callback',{method:'POST',body,headers:{'Content-Type':'application/x-www-form-urlencoded'}});
beforeEach(()=>{vi.resetAllMocks();mocks.origin.mockReturnValue('https://hittumst.example');mocks.finish.mockResolvedValue('web');});
describe('Apple web and native callback return',()=>{
 it('redirects web success only to the configured account portal and never echoes secrets',async()=>{const response=await POST(request());expect(response.status).toBe(303);expect(response.headers.get('location')).toBe('https://hittumst.example/account?appleAuthorization=complete');expect(response.headers.get('referrer-policy')).toBe('no-referrer');expect(response.headers.get('cache-control')).toBe('no-store');});
 it('takes native return only from consumed server state',async()=>{mocks.finish.mockResolvedValue('native');expect((await POST(request())).headers.get('location')).toBe('rummal://privacy?appleAuthorization=complete');});
 it('returns invalid/replayed state failure to the web portal, ignoring submitted redirect',async()=>{mocks.finish.mockRejectedValue(Error('expired'));expect((await POST(request())).headers.get('location')).toBe('https://hittumst.example/account?appleAuthorization=failed');});
 it('uses stored return mode for a cancelled native authorization',async()=>{mocks.finish.mockRejectedValue(new AppleReturnError('native'));expect((await POST(request('state=nonce&error=access_denied'))).headers.get('location')).toBe('rummal://privacy?appleAuthorization=failed');});
 it('rejects oversized callback bodies before parsing or exchanging a code',async()=>{const response=await POST(request('x'.repeat(16385)));expect(mocks.finish).not.toHaveBeenCalled();expect(response.headers.get('location')).toContain('appleAuthorization=failed');});
});
