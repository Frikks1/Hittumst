import type { VoiceAdmission, VoiceGrant } from '@/services/voiceApi';
export type VoicePhase='idle'|'joining'|'connected'|'reconnecting'|'leaving';
export interface VoiceTransport {
  connect(grant:VoiceGrant):Promise<void>;
  disconnect():Promise<void>;
  mute(muted:boolean):Promise<void>;
}
export interface VoiceCallDependencies {
  join():Promise<VoiceGrant>;
  heartbeat(id:string):Promise<VoiceAdmission>;
  leave(id:string):Promise<unknown>;
  startAudio():Promise<void>;
  stopAudio():Promise<void>;
  createTransport(changed:(phase:'connected'|'reconnecting')=>void,disconnected:()=>void):VoiceTransport;
  changed(phase:VoicePhase,admission:VoiceAdmission|null,error?:string):void;
}
type Attempt={cancelled:boolean;grant?:VoiceGrant;transport?:VoiceTransport;audioStarted:boolean;start?:Promise<void>;dispose?:Promise<void>;timer?:ReturnType<typeof setInterval>;heartbeatPending:boolean};
let activeCall:VoiceCallController|null=null;
/** Owns all asynchronous resources. A cancelled join can never reopen audio or a room. */
export class VoiceCallController {
  private attempt:Attempt|null=null;
  private phase:VoicePhase='idle';
  constructor(private readonly deps:VoiceCallDependencies) {}
  private changed(phase:VoicePhase,attempt:Attempt,error?:string) {
    if(this.attempt!==attempt)return;
    this.phase=phase;this.deps.changed(phase,attempt.grant??null,error);
  }
  async join():Promise<void> {
    if(this.attempt)return;
    const attempt:Attempt={cancelled:false,audioStarted:false,heartbeatPending:false};
    this.attempt=attempt;this.changed('joining',attempt);
    attempt.start=this.start(attempt);
    await attempt.start;
  }
  private async start(attempt:Attempt) {
    try {
      if(activeCall && activeCall!==this)await activeCall.leave();
      if(attempt.cancelled)return;
      // Shared ownership registry, not a closure alias: serialize native audio across screens.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      activeCall=this;
      attempt.grant=await this.deps.join();
      if(attempt.cancelled)return;
      await this.deps.startAudio();attempt.audioStarted=true;
      if(attempt.cancelled)return;
      attempt.transport=this.deps.createTransport(phase=>{
        if(!attempt.cancelled) {
          if(phase==='reconnecting')void attempt.transport?.mute(true).catch(()=>{void this.leave('voice_connection_lost');});
          this.changed(phase,attempt);
        }
      },()=>{if(!attempt.cancelled)void this.leave('voice_connection_lost');});
      await attempt.transport.connect(attempt.grant);
      if(attempt.cancelled)return;
      // Microphone is never published by connect. Resuming it always needs an explicit tap.
      this.changed('connected',attempt);
      attempt.timer=setInterval(()=>{void this.heartbeat(attempt);},10000);
    } catch(error) {
      if(!attempt.cancelled)this.changed('leaving',attempt,error instanceof Error?error.message:'voice_unavailable');
      attempt.cancelled=true;
    } finally {
      if(attempt.cancelled)await this.dispose(attempt);
    }
  }
  private async heartbeat(attempt:Attempt) {
    if(attempt.cancelled || attempt.heartbeatPending || !attempt.grant)return;
    attempt.heartbeatPending=true;
    try {
      const admission=await this.deps.heartbeat(attempt.grant.admissionId);
      if(attempt.cancelled)return;
      attempt.grant={...attempt.grant,...admission};
      this.changed(this.phase,attempt);
    } catch { if(!attempt.cancelled)void this.leave('voice_access_lost'); }
    finally {attempt.heartbeatPending=false;}
  }
  async setMuted(muted:boolean) {
    const attempt=this.attempt;
    if(!attempt || attempt.cancelled || this.phase!=='connected' || !attempt.transport)throw new Error('voice_not_connected');
    // Revalidate before opening the microphone, including after an interruption.
    if(!muted && attempt.grant) {
      const admission=await this.deps.heartbeat(attempt.grant.admissionId);
      if(attempt.cancelled)throw new Error('voice_not_connected');
      attempt.grant={...attempt.grant,...admission};
    }
    await attempt.transport.mute(muted);
    if(attempt.cancelled)await attempt.transport.mute(true);
  }
  async leave(error?:string):Promise<void> {
    const attempt=this.attempt;
    if(!attempt)return;
    if(!attempt.cancelled) {
      attempt.cancelled=true;
      if(attempt.timer)clearInterval(attempt.timer);
      this.changed('leaving',attempt,error);
      // Abort the transport now; join may still be awaiting its connect promise.
      void attempt.transport?.disconnect().catch(()=>{});
    }
    await attempt.start;
    await this.dispose(attempt);
  }
  private dispose(attempt:Attempt):Promise<void> {
    if(attempt.dispose)return attempt.dispose;
    attempt.dispose=(async()=>{
      if(attempt.timer)clearInterval(attempt.timer);
      try {await attempt.transport?.disconnect();}catch { /* lease worker is the fallback */ }
      if(attempt.audioStarted) {try {await this.deps.stopAudio();}catch { /* native interruption may already have stopped it */ }}
      if(activeCall===this)activeCall=null;
      if(attempt.grant) {try {await this.deps.leave(attempt.grant.admissionId);}catch { /* expires in 45 seconds; worker revokes it */ }}
      if(this.attempt===attempt) {this.attempt=null;this.phase='idle';this.deps.changed('idle',null);}
    })();
    return attempt.dispose;
  }
}

