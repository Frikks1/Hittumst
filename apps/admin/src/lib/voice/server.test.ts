import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenVerifier } from 'livekit-server-sdk';
import { makeVoiceToken, revokeVoiceParticipant, voiceConfig } from './server';
const config={LIVEKIT_URL:'wss://test.livekit.cloud',LIVEKIT_API_KEY:'test-api-key',LIVEKIT_API_SECRET:'test-secret-for-unit-tests-only-1234567890'};
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
describe('LiveKit security boundary',()=>{
  it.each([undefined,'ws://test.livekit.cloud','wss://test.livekit.cloud.evil.example','wss://user:pass@test.livekit.cloud','wss://test.livekit.cloud/path','wss://test.livekit.cloud:9000','wss://self-hosted.example'])('rejects unavailable/unreviewed provider URL %s',url=>{
    expect(()=>voiceConfig({...config,LIVEKIT_URL:url})).toThrow();
  });
  it('rejects missing API secrets',()=>{expect(()=>voiceConfig({LIVEKIT_URL:config.LIVEKIT_URL})).toThrow('voice_unavailable');});
  it('issues a 60-second microphone-only room grant without moderation/recording/data authority',async()=>{
    for(const [key,value]of Object.entries(config))vi.stubEnv(key,value);
    const admission={admissionId:'96000000-0000-4000-8000-000000000001',roomName:'group-96000000-0000-4000-8000-000000000010',name:'Member'};
    const {token,url}=await makeVoiceToken(admission);
    const claims=await new TokenVerifier(config.LIVEKIT_API_KEY,config.LIVEKIT_API_SECRET).verify(token);
    expect(url).toBe(config.LIVEKIT_URL);expect(claims.sub).toBe(admission.admissionId);
    const raw=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()) as {exp:number;nbf:number;video:Record<string,unknown>};
    expect(raw.exp-raw.nbf).toBe(60);
    expect(raw.video).toMatchObject({room:admission.roomName,roomJoin:true,canPublishSources:['microphone'],canPublishData:false,roomRecord:false,roomAdmin:false,roomCreate:false,canUpdateOwnMetadata:false,agent:false});
  });
  it('uses explicit Unix seconds within the Cloud revocation limit',async()=>{
    for(const [key,value]of Object.entries(config))vi.stubEnv(key,value);
    const {RoomServiceClient}=await import('livekit-server-sdk');
    const remove=vi.spyOn(RoomServiceClient.prototype,'removeParticipant').mockResolvedValue();
    await revokeVoiceParticipant('group-test','opaque-admission');
    const cutoff=Number(remove.mock.calls[0][2]?.revokeTokenTs);
    expect(cutoff-Math.floor(Date.now()/1000)).toBeGreaterThanOrEqual(29);
    expect(cutoff-Math.floor(Date.now()/1000)).toBeLessThanOrEqual(30);
  });
});
