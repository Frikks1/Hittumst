import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),enabled:vi.fn(),config:vi.fn(),create:vi.fn(),command:vi.fn(),token:vi.fn()}));
vi.mock('@/lib/auth/member-database',()=>({memberDatabase:()=>({rpc:mocks.rpc})}));
vi.mock('@/lib/voice/server',()=>({voiceEnabled:mocks.enabled,voiceConfig:mocks.config,voiceProvider:()=>({createRoom:mocks.create}),voiceCommand:mocks.command,makeVoiceToken:mocks.token}));
import {POST} from './route';
const id='96000000-0000-4000-8000-000000000001',groupId='96000000-0000-4000-8000-000000000010';
const admission={admissionId:id,roomName:`group-${groupId}`,name:'Member',expiresAt:'2026-09-21T00:00:45Z',role:'member',members:[]};
function request(body:unknown={groupId,action:'join'},headers:Record<string,string>={}) {return new Request('https://app.example/api/voice',{method:'POST',body:JSON.stringify(body),headers:{Authorization:'Bearer test-member-jwt','Content-Type':'application/json',...headers}});}
beforeEach(()=>{vi.resetAllMocks();mocks.enabled.mockReturnValue(true);mocks.config.mockReturnValue({});mocks.rpc.mockResolvedValue({data:admission,error:null});mocks.command.mockResolvedValue(true);mocks.token.mockResolvedValue({token:'grant',url:'wss://test.livekit.cloud'});});
describe('voice token endpoint',()=>{
 it('requires a bearer and rejects unexpected fields before member data access',async()=>{
  expect((await POST(request(undefined,{Authorization:''}))).status).toBe(401);
  expect((await POST(request({groupId,action:'join',identity:'forged'}))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it('fails closed when transport is disabled or credentials absent',async()=>{
  mocks.enabled.mockReturnValue(false);expect((await POST(request())).status).toBe(503);expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.enabled.mockReturnValue(true);mocks.config.mockImplementation(()=>{throw Error('credentials');});expect((await POST(request())).status).toBe(503);expect(mocks.token).not.toHaveBeenCalled();
 });
 it('will not trust a refused DB admission',async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{code:'42501'}});expect((await POST(request())).status).toBe(403);expect(mocks.create).not.toHaveBeenCalled();
 });
 it('binds the token to server-authorized identity and rechecks after provider latency',async()=>{
  const response=await POST(request());expect(response.status).toBe(200);expect(mocks.token).toHaveBeenCalledWith(admission);expect(mocks.command).toHaveBeenCalledTimes(2);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
 });
 it('withholds grants when access changes during room creation',async()=>{
  mocks.command.mockResolvedValue(false);expect((await POST(request())).status).toBe(403);expect(mocks.token).not.toHaveBeenCalled();
 });
 it('records leave after provider failure so the durable worker can revoke the identity',async()=>{
  mocks.create.mockRejectedValue(Error('offline'));expect((await POST(request())).status).toBe(503);
  expect(mocks.rpc).toHaveBeenLastCalledWith('group_voice_access',{p_group_id:groupId,p_action:'leave',p_admission_id:id});
 });
 it('does not accept a forged browser origin',async()=>{
  expect((await POST(request(undefined,{Origin:'https://attacker.example'}))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
