import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VoiceGrant } from '@/services/voiceApi';
import { VoiceCallController, type VoiceCallDependencies } from './voiceCall';
const grant:VoiceGrant={admissionId:'96000000-0000-4000-8000-000000000001',roomName:'group-96000000-0000-4000-8000-000000000010',expiresAt:'2026-09-21T12:00:45Z',role:'member',name:'Member',members:[],token:'not-a-real-token',url:'wss://test.livekit.cloud'};
function deferred<T>() {let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function setup(overrides:Partial<VoiceCallDependencies>={}) {
  const transport={connect:vi.fn(async()=>{}),disconnect:vi.fn(async()=>{}),mute:vi.fn(async()=>{})};
  const deps:VoiceCallDependencies={join:vi.fn(async()=>grant),heartbeat:vi.fn(async()=>grant),leave:vi.fn(async()=>{}),startAudio:vi.fn(async()=>{}),stopAudio:vi.fn(async()=>{}),createTransport:vi.fn(()=>transport),changed:vi.fn(),...overrides};
  return {controller:new VoiceCallController(deps),deps,transport};
}
afterEach(()=>{vi.useRealTimers();});
describe('voice lifecycle',()=>{
  it('cancelled token request never opens audio and revokes a late admission',async()=>{
    const pending=deferred<VoiceGrant>();const {controller,deps}=setup({join:()=>pending.promise});
    const joining=controller.join();const leaving=controller.leave();pending.resolve(grant);await Promise.all([joining,leaving]);
    expect(deps.startAudio).not.toHaveBeenCalled();expect(deps.createTransport).not.toHaveBeenCalled();expect(deps.leave).toHaveBeenCalledWith(grant.admissionId);
  });
  it('interruption during audio startup waits then tears down the late native session',async()=>{
    const audio=deferred<void>();const {controller,deps}=setup({startAudio:()=>audio.promise});
    const joining=controller.join();await vi.waitFor(()=>expect(deps.join).toHaveBeenCalled());await Promise.resolve();
    const leaving=controller.leave();audio.resolve();await Promise.all([joining,leaving]);
    expect(deps.createTransport).not.toHaveBeenCalled();expect(deps.stopAudio).toHaveBeenCalledTimes(1);
  });
  it('failed heartbeat disconnects without waiting for a cooperative server leave',async()=>{
    vi.useFakeTimers();const {controller,deps,transport}=setup({heartbeat:vi.fn(async()=>{throw Error('denied');})});
    await controller.join();expect(transport.mute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10000);expect(transport.disconnect).toHaveBeenCalled();expect(deps.stopAudio).toHaveBeenCalledOnce();
    await controller.leave();
  });
  it('reconnection mutes and never automatically reopens the microphone',async()=>{
    let change!:(phase:'connected'|'reconnecting')=>void;
    const sample=setup();const {controller}=setup({createTransport:(callback)=>{change=callback;return sample.transport;}});
    await controller.join();change('reconnecting');await Promise.resolve();change('connected');
    expect(sample.transport.mute).toHaveBeenCalledExactlyOnceWith(true);await controller.leave();
  });
  it('rechecks admission before unmute and refuses it on lost access',async()=>{
    const {controller,transport}=setup({heartbeat:vi.fn(async()=>{throw Error('denied');})});await controller.join();
    await expect(controller.setMuted(false)).rejects.toThrow('denied');expect(transport.mute).not.toHaveBeenCalled();await controller.leave();
  });
  it('serializes simultaneous joins and new calls wait for earlier native audio cleanup',async()=>{
    const stop=deferred<void>();const first=setup({stopAudio:()=>stop.promise});const second=setup();
    await Promise.all([first.controller.join(),first.controller.join()]);expect(first.deps.join).toHaveBeenCalledTimes(1);
    const joining=second.controller.join();await Promise.resolve();expect(second.deps.startAudio).not.toHaveBeenCalled();
    stop.resolve();await joining;expect(second.deps.startAudio).toHaveBeenCalledTimes(1);await second.controller.leave();
  });
});
