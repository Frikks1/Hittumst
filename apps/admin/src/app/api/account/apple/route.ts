import { readVoiceBody } from '@/lib/voice/http';
import { startAppleReauthorization, retainAppleCredentials } from '@/lib/apple-authorize';
import { z } from 'zod';
import { commerceDatabase } from '@/lib/commerce';
import { memberDatabase } from '@/lib/auth/member-database';
import { memberCors, memberPreflight } from '@/lib/auth/member-cors';
import { exchangeAppleCode } from '@/lib/apple-tokens';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = (request: Request) => memberPreflight(request, request.headers.get('access-control-request-method') === 'GET' ? 'GET' : 'POST');

async function identity(request: Request) {
  const token = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) throw new Error('authentication_required');
  const result=await memberDatabase(token).rpc('apple_custody_context');
  if(result.error)throw Error('authentication_required');
  return z.object({accountId:z.string().uuid(),sessionId:z.string().uuid(),subject:z.string().nullable()}).parse(result.data);
}
export async function GET(request: Request) {
  const cors = memberCors(request, 'GET');
  if (!cors.allowed) return Response.json({ error: 'forbidden' }, { status: 403, headers: cors.headers });
  try {
    const member = await identity(request);
    if (!member.subject) return Response.json({ requiresRevocation: false, ready: true }, { headers: cors.headers });
    const result = await commerceDatabase().rpc('apple_token_get', { account_id: member.accountId });
    if (result.error || !result.data) throw new Error('apple_provider_unavailable');
    return Response.json({ requiresRevocation: true, ready: Boolean(result.data.token) }, { headers: cors.headers });
  } catch(error) {
    return failure(error,cors.headers);
  }
}

export async function POST(request: Request) {
  const cors = memberCors(request, 'POST');
  if (!cors.allowed) return Response.json({ error: 'forbidden' }, { status: 403, headers: cors.headers });
  try {
    const member = await identity(request);
    if (!member.subject) return Response.json({ error: 'apple_identity_required' }, { status: 403, headers: cors.headers });
    const raw = await readVoiceBody(request,8192);
    if (raw.length > 8192) return Response.json({ error: 'invalid_request' }, { status: 400, headers: cors.headers });
    const input = JSON.parse(raw);
    if (input.action === 'reauthorize') {
      const { returnMode } = z.object({ action:z.literal('reauthorize'),returnMode:z.enum(['native','web']).optional() }).strict().parse(input);
      const url = await startAppleReauthorization(commerceDatabase(), member.accountId, member.subject, member.sessionId, returnMode);
      return Response.json({ url }, { headers: cors.headers });
    }
    const { code } = z.object({ code: z.string().min(1).max(4096) }).strict().parse(input);
    const credentials = await exchangeAppleCode(code, member.subject);
    await retainAppleCredentials(commerceDatabase(),member.accountId,member.subject,member.sessionId,credentials);
    return Response.json({ ready: true }, { headers: cors.headers });
  } catch(error) {
    return failure(error,cors.headers);
  }
}


function failure(error:unknown,headers:Headers){
  if(error instanceof Error&&error.message==='authentication_required')return Response.json({error:'authentication_required'},{status:401,headers});
  if(error instanceof z.ZodError||error instanceof SyntaxError||(error instanceof Error&&['invalid_body','body_too_large'].includes(error.message)))return Response.json({error:'invalid_request'},{status:400,headers});
  return Response.json({error:'apple_authorization_unavailable'},{status:503,headers});
}
