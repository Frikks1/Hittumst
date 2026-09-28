import { z } from 'zod';
import { runtimeEnv } from './env';
import { supabase } from './supabase';
const memberSchema = z.object({ identity:z.string().uuid(), profileId:z.string().uuid(), name:z.string(), role:z.enum(['owner','admin','moderator','member']) });
export const voiceAdmissionSchema = z.object({ admissionId:z.string().uuid(), roomName:z.string().regex(/^group-[0-9a-f-]{36}$/),
  expiresAt:z.string().datetime({ offset:true }), role:z.enum(['owner','admin','moderator','member']), name:z.string(), members:z.array(memberSchema) });
export const voiceGrantSchema = voiceAdmissionSchema.extend({ token:z.string().min(10), url:z.string().refine(value => {
  try { const url=new URL(value); return url.protocol==='wss:' && /^[a-z0-9-]+\.livekit\.cloud$/.test(url.hostname) && !url.port && !url.username && !url.password && url.pathname==='/' && !url.search && !url.hash; } catch { return false; }
}) });
export type VoiceAdmission = z.infer<typeof voiceAdmissionSchema>;
export type VoiceGrant = z.infer<typeof voiceGrantSchema>;
export type VoiceMember = z.infer<typeof memberSchema>;
export type VoiceAction = 'join'|'heartbeat'|'leave'|'remove'|'end';
export function voiceApiUrl(origin=runtimeEnv.websiteUrl) {
  if (!origin || runtimeEnv.isDemo) throw new Error('voice_unavailable');
  const url = new URL(origin);
  const local=runtimeEnv.appEnvironment==='development' && url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname) && url.port==='3001';
  if ((!local && (url.protocol!=='https:' || url.port)) || url.username || url.password || url.pathname!=='/' || url.search || url.hash) throw new Error('voice_unavailable');
  return `${url.origin}/api/voice`;
}
export async function voiceRequest(groupId:string, action:VoiceAction, admissionId?:string, targetId?:string):Promise<unknown> {
  z.string().uuid().parse(groupId);
  const url=voiceApiUrl();
  const session=await supabase?.auth.getSession();
  if (!session?.data.session || session.error) throw new Error('voice_authentication_required');
  const token=session.data.session.access_token;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try {
    const response=await fetch(url,{ method:'POST', headers:{ Authorization:`Bearer ${token}`,'Content-Type':'application/json' },
      body:JSON.stringify({groupId,action,admissionId,targetId}), credentials:'omit', redirect:'error', cache:'no-store',signal:controller.signal });
    if (!response.ok) throw new Error(response.status===403 ? 'voice_access_denied' : response.status===429 ? 'voice_rate_limited' : 'voice_unavailable');
    const data:unknown=await response.json();
    const current=await supabase?.auth.getSession();
    // A credential change while a request is in flight must not connect the previous login.
    if (!current?.data.session || current.error || current.data.session.access_token!==token) throw new Error('voice_authentication_required');
    return data;
  } finally { clearTimeout(timer); }
}
export async function joinVoice(groupId:string) { return voiceGrantSchema.parse(await voiceRequest(groupId,'join')); }
export async function heartbeatVoice(groupId:string,admissionId:string) { return voiceAdmissionSchema.parse(await voiceRequest(groupId,'heartbeat',admissionId)); }
