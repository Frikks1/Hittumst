import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),user:vi.fn(),vault:vi.fn()}));
vi.mock('@/lib/auth/member-database',()=>({memberDatabase:()=>({auth:{getUser:mock.user},rpc:mock.rpc})}));
vi.mock('@/lib/commerce',()=>({commerceDatabase:()=>({rpc:mock.vault})}));
import { GET,POST } from './route';
const request=(body?:unknown,headers:Record<string,string>={})=>new Request('https://hittumst.example/api/account/lifecycle',{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer member-token',...headers},body:body===undefined?undefined:JSON.stringify(body)});
beforeEach(()=>{
  vi.clearAllMocks();
  mock.user.mockResolvedValue({data:{user:{id:'member-a'}},error:null});
  mock.rpc.mockImplementation(async(name:string)=>({data:name==='apple_session_active'?true:name==='export_my_account'?{profile:{id:'member-a'}}:null,error:null}));
  mock.vault.mockResolvedValue({data:{requiresRevocation:false,token:null},error:null});
});
describe('hosted account lifecycle',()=>{
  it('denies missing/revoked sessions and foreign origins without exporting data',async()=>{
    expect((await GET(new Request('https://hittumst.example/api/account/lifecycle'))).status).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect((await GET(request(undefined,{Origin:'https://attacker.example'}))).status).toBe(403);
    mock.rpc.mockResolvedValueOnce({data:false,error:null});
    expect((await GET(request())).status).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalledWith('export_my_account');
  });
  it('exports only the actor through caller-authorized RPC and forbids caching',async()=>{
    const response=await GET(request());
    expect(response.status).toBe(200);expect(await response.json()).toEqual({profile:{id:'member-a'}});
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Content-Disposition')).toContain('attachment');
  });
  it('requires explicit confirmation but allows missing Apple custody with manual instructions',async()=>{
    expect((await POST(request({action:'delete',confirmation:'no'}))).status).toBe(400);
    expect(mock.vault).not.toHaveBeenCalled();
    mock.vault.mockResolvedValueOnce({data:{requiresRevocation:true,token:null},error:null});
    const response=await POST(request({action:'delete',confirmation:'DELETE'}));
    expect(response.status).toBe(202);expect(await response.json()).toMatchObject({appleManualRevocationRequired:true});
    expect(mock.rpc).toHaveBeenCalledWith('delete_my_account');
  });
  it('reports queued deletion, never claims external cleanup already completed',async()=>{
    const response=await POST(request({action:'delete',confirmation:'DELETE'}));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({status:'queued',accessRevoked:true});
    expect(mock.vault).toHaveBeenCalledWith('apple_token_get',{account_id:'member-a'});
    expect(mock.rpc).toHaveBeenCalledWith('delete_my_account');
  });
  it('fails closed when financial/retention policy requires support',async()=>{
    mock.rpc.mockImplementation(async(name:string)=>name==='delete_my_account'?{data:null,error:{message:'private balance'}}:{data:true,error:null});
    const response=await POST(request({action:'delete',confirmation:'DELETE'}));
    expect(response.status).toBe(409);expect(JSON.stringify(await response.json())).not.toContain('private balance');
  });
});

