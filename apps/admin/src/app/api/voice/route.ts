import { z } from 'zod';
import { memberCors, memberPreflight } from '@/lib/auth/member-cors';
import { memberDatabase } from '@/lib/auth/member-database';
import { makeVoiceToken, voiceCommand, voiceConfig, voiceEnabled, voiceProvider } from '@/lib/voice/server';
import { readVoiceBody } from '@/lib/voice/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const bodySchema = z.object({ groupId: z.string().uuid(), action: z.enum(['join', 'heartbeat', 'leave', 'remove', 'end']),
  admissionId: z.string().uuid().optional(), targetId: z.string().uuid().optional() }).strict();
const admissionSchema = z.object({ admissionId: z.string().uuid(), roomName: z.string().regex(/^group-[0-9a-f-]{36}$/),
  name: z.string(), expiresAt: z.string(), role: z.enum(['owner','admin','moderator','member']),
  members: z.array(z.object({ identity:z.string().uuid(), profileId:z.string().uuid(), name:z.string(), role:z.string() })) });
export async function POST(request: Request) {
  const cors = memberCors(request, 'POST');
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors.headers });
  if (!cors.allowed) return reply({ error: 'forbidden_origin' }, 403);
  const bearer = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!bearer) return reply({ error: 'authentication_required' }, 401);
  let input: z.infer<typeof bodySchema>;
  try {
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'invalid_request' }, 415);
    input = bodySchema.parse(JSON.parse(await readVoiceBody(request, 4096)));
    if (['heartbeat','leave'].includes(input.action) && !input.admissionId) throw new Error('invalid_request');
    if (input.action === 'remove' && !input.targetId) throw new Error('invalid_request');
  } catch { return reply({ error: 'invalid_request' }, 400); }
  try {
    if (['join','heartbeat'].includes(input.action)) { if (!voiceEnabled()) throw new Error('voice_unavailable'); voiceConfig(); }
    const member = memberDatabase(bearer);
    const { data, error } = await member.rpc('group_voice_access', { p_group_id: input.groupId, p_action: input.action,
      p_admission_id: input.admissionId ?? null, p_target_id: input.targetId ?? null });
    if (error) {
      if (error.code === '42501' || error.code === 'PGRST301') return reply({ error: 'voice_access_denied' }, 403);
      if (error.message === 'rate_limit_exceeded') return reply({ error: 'voice_rate_limited' }, 429);
      throw new Error('voice_unavailable');
    }
    if (input.action !== 'join') return reply(data);
    const admission = admissionSchema.parse(data);
    try {
      await voiceProvider().createRoom({ name: admission.roomName, emptyTimeout: 60, departureTimeout: 60, maxParticipants: 100 });
      // Recheck after the provider request: membership/session may have changed while waiting.
      if (await voiceCommand('validate', admission.admissionId) !== true) return reply({ error: 'voice_access_denied' }, 403);
      const grant = await makeVoiceToken(admission);
      if (await voiceCommand('validate', admission.admissionId) !== true) throw new Error('voice_access_denied');
      return reply({ ...admission, ...grant });
    } catch (error) {
      await member.rpc('group_voice_access', { p_group_id:input.groupId, p_action:'leave', p_admission_id:admission.admissionId });
      throw error;
    }
  } catch { return reply({ error: 'voice_unavailable' }, 503); }
}
export function OPTIONS(request: Request) { return memberPreflight(request, 'POST'); }

