import { createClient } from '@supabase/supabase-js';
import { AccessToken, RoomServiceClient, TrackSource, WebhookReceiver } from 'livekit-server-sdk';

export function voiceConfig(env: Record<string, string | undefined> = process.env) {
  const raw = env.LIVEKIT_URL;
  if (!raw || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || env.LIVEKIT_API_SECRET.length < 32) throw new Error('voice_unavailable');
  const url = new URL(raw);
  // Cloud removal revokes issued tokens. Self-hosting needs a different revocation design.
  if (url.protocol !== 'wss:' || !/^[a-z0-9-]+\.livekit\.cloud$/.test(url.hostname) || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('voice_unavailable');
  return { url: url.origin, apiUrl: `https://${url.host}`, key: env.LIVEKIT_API_KEY, secret: env.LIVEKIT_API_SECRET };
}
export function voiceEnabled() { return process.env.HITTUMST_GROUP_VOICE_ENABLED === 'true'; }
export function voiceDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('voice_unavailable');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function voiceProvider() {
  const config = voiceConfig();
  return new RoomServiceClient(config.apiUrl, config.key, config.secret, { requestTimeout: 5 });
}
export function voiceWebhookReceiver() {
  const config = voiceConfig();
  return new WebhookReceiver(config.key, config.secret);
}
export async function voiceCommand(action: string, id: string | null = null, event: Record<string, unknown> = {}) {
  const { data, error } = await voiceDatabase().rpc('voice_service', { p_action: action, p_id: id, p_event: event });
  if (error) throw new Error('voice_database_unavailable');
  return data;
}
export async function makeVoiceToken(admission: { admissionId: string; roomName: string; name: string }) {
  const config = voiceConfig();
  const token = new AccessToken(config.key, config.secret, { identity: admission.admissionId, name: admission.name, ttl: 60 });
  token.addGrant({ room: admission.roomName, roomJoin: true, canSubscribe: true, canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE], canPublishData: false, canUpdateOwnMetadata: false,
    roomAdmin: false, roomCreate: false, roomList: false, roomRecord: false, recorder: false,
    agent: false, canManageAgentSession: false, canSubscribeMetrics: false });
  return { token: await token.toJwt(), url: config.url };
}
export function isProviderNotFound(error: unknown) {
  // Only acknowledge actual provider not-found, never transport/authentication failures.
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'not_found';
}
export async function revokeVoiceParticipant(roomName: string, identity: string) {
  // Opaque identity is never reused. A future cutoff also closes concurrent token-issue races.
  await voiceProvider().removeParticipant(roomName, identity, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 30) });
}


