import { accountMediaFilename } from '@/lib/account-download';
import { z } from 'zod';
import { commerceDatabase } from '@/lib/commerce';
import { memberDatabase } from '@/lib/auth/member-database';
import { memberCors, memberPreflight } from '@/lib/auth/member-cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const basePrivateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
/** Authenticated own-file download. The database excludes quarantined and other members' media. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const cors = memberCors(request, 'GET');
  const privateHeaders = { ...basePrivateHeaders, ...Object.fromEntries(cors.headers) };
  if (!cors.allowed) return new Response(null, { status:403, headers:privateHeaders });
  const token = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return new Response(null, { status: 401, headers: privateHeaders });
  const id = z.string().uuid().safeParse((await context.params).id);
  if (!id.success) return new Response(null, { status: 404, headers: privateHeaders });
  try {
    const member = memberDatabase(token);
    const access = await member.rpc('get_account_media', { object_id: id.data });
    if (access.error || !access.data) return new Response(null, { status: 404, headers: privateHeaders });
    const file = await commerceDatabase().storage.from(access.data.bucket).download(access.data.name);
    if (file.error) return new Response(null, { status: 503, headers: privateHeaders });
    // Check again after Storage I/O so account/session revocation during download is respected.
    const stillAllowed = await member.rpc('get_account_media', { object_id: id.data });
    if (stillAllowed.error || !stillAllowed.data) return new Response(null, { status: 404, headers: privateHeaders });
    return new Response(file.data, {
      headers: { ...privateHeaders, 'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${accountMediaFilename(id.data,access.data.name)}"`, 'Content-Security-Policy': "default-src 'none'" },
    });
  } catch {
    return new Response(null, { status: 503, headers: privateHeaders });
  }
}

export function OPTIONS(request: Request) { return memberPreflight(request, 'GET'); }

