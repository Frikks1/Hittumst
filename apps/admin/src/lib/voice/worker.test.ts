import { beforeEach,describe,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({command:vi.fn(),revoke:vi.fn(),list:vi.fn(),removeRoom:vi.fn()}));
vi.mock('./server',()=>({voiceCommand:mocks.command,revokeVoiceParticipant:mocks.revoke,voiceProvider:()=>({listRooms:mocks.list,deleteRoom:mocks.removeRoom}),isProviderNotFound:(error:unknown)=>(error as {code?:string})?.code==='not_found'}));
import {reconcileVoice} from './worker';
const item={id:'96000000-0000-4000-8000-000000000001',roomName:'group-96000000-0000-4000-8000-000000000010'};
beforeEach(()=>{vi.resetAllMocks();mocks.list.mockResolvedValue([]);mocks.revoke.mockResolvedValue(undefined);mocks.removeRoom.mockResolvedValue(undefined);mocks.command.mockImplementation(async(action:string)=>action==='reconcile'?{revocations:[item],rooms:[item]}:true);});
describe('voice reconciliation',()=>{
 it('acknowledges participant removal before deleting the room and certifying worker health',async()=>{
  expect(await reconcileVoice()).toEqual({revoked:1,ended:1});
  expect(mocks.command.mock.calls.map(call=>call[0])).toEqual(['reconcile','revoked','deleted','healthy']);
  expect(mocks.revoke).toHaveBeenCalledWith(item.roomName,item.id);
 });
 it('provider removal failure leaves the queue pending and cannot certify health',async()=>{
  mocks.revoke.mockRejectedValue(Error('provider unavailable'));await expect(reconcileVoice()).rejects.toThrow();
  expect(mocks.command.mock.calls.map(call=>call[0])).toEqual(['reconcile']);expect(mocks.removeRoom).not.toHaveBeenCalled();
 });
 it('ignores an already deleted room but rejects transport failures',async()=>{
  mocks.removeRoom.mockRejectedValue({code:'not_found'});expect(await reconcileVoice()).toEqual({revoked:1,ended:1});
  mocks.removeRoom.mockRejectedValue({code:'unavailable'});await expect(reconcileVoice()).rejects.toEqual({code:'unavailable'});
 });
 it('disabled-mode cleanup does not enable admission with a fresh worker heartbeat',async()=>{
  await reconcileVoice(false);expect(mocks.command).not.toHaveBeenCalledWith('healthy');
 });
 it('checks provider reachability even on an empty queue',async()=>{
  mocks.command.mockResolvedValue({revocations:[],rooms:[]});mocks.list.mockRejectedValue(Error('offline'));await expect(reconcileVoice()).rejects.toThrow('offline');expect(mocks.command).not.toHaveBeenCalled();
 });
});
