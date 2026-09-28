import { readVoiceBody } from '@/lib/voice/http';
import { z } from 'zod';
import { memberDatabase } from '@/lib/auth/member-database';
import { memberCors, memberPreflight } from '@/lib/auth/member-cors';
import { commerceDatabase } from '@/lib/commerce';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = (request: Request) => memberPreflight(request, request.headers.get('access-control-request-method') === 'GET' ? 'GET' : 'POST');
async function authorized(request: Request) {
  const token = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) throw new Error('authentication_required');
  const db = memberDatabase(token);
  const user = await db.auth.getUser(token);
  const active = await db.rpc('apple_session_active');
  if (user.error || !user.data.user || active.error || active.data !== true) throw new Error('authentication_required');
  return { db, user: user.data.user };
}
export async function GET(request: Request) {
  const cors = memberCors(request,'GET');
  if (!cors.allowed) return Response.json({ error:'forbidden' },{ status:403,headers:cors.headers });
  try {
    const { db } = await authorized(request);
    const result = await db.rpc('export_my_account');
    if (result.error || !result.data) throw new Error('account_unavailable');
    const stillActive = await db.rpc('apple_session_active');
    if (stillActive.error || stillActive.data !== true) throw new Error('authentication_required');
    cors.headers.set('Content-Disposition','attachment; filename="hittumst-account.json"');
    return Response.json(result.data,{ headers:cors.headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.message === 'authentication_required' ? 'authentication_required' : 'account_unavailable' },{ status:403,headers:cors.headers });
  }
}
export async function POST(request: Request) {
  const cors = memberCors(request,'POST');
  if (!cors.allowed) return Response.json({ error:'forbidden' },{ status:403,headers:cors.headers });
  try {
    const { db,user } = await authorized(request);
    const raw = await readVoiceBody(request,2048);
    if (raw.length>2048 || !z.object({ action:z.literal('delete'),confirmation:z.literal('DELETE') }).strict().safeParse(JSON.parse(raw)).success)
      return Response.json({ error:'confirmation_required' },{ status:400,headers:cors.headers });
    const apple = await commerceDatabase().rpc('apple_token_get',{account_id:user.id});
    if (apple.error || !apple.data) throw new Error('account_unavailable');
    const appleManualRevocationRequired=Boolean(apple.data.requiresRevocation&&!apple.data.token);
    const removed = await db.rpc('delete_my_account');
    if (removed.error) return Response.json({ error:'deletion_requires_support' },{ status:409,headers:cors.headers });
    return Response.json({ status:'queued',accessRevoked:true,...appleManualRevocationRequired?{appleManualRevocationRequired:true}:{} },{ status:202,headers:cors.headers });
  } catch {
    return Response.json({ error:'account_unavailable' },{ status:503,headers:cors.headers });
  }
}

