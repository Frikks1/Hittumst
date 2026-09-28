import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { commerceDatabase } from '@/lib/commerce';
import { normalizeMedia } from '@/lib/jobs/media';
import { mediaLimits } from '@/lib/jobs/media-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentAdmin();
  if (!staff || staff.demo) return new Response(null, { status: 403 });
  try {
    const id = z
      .string()
      .uuid()
      .parse((await context.params).id);
    const member = await createClient();
    // Current MFA and staff role are checked again in this audited, case-specific RPC.
    const evidence = await member.rpc('admin_media_evidence', { upload_id: id });
    if (evidence.error || !evidence.data) return new Response(null, { status: 403 });
    const file = await commerceDatabase()
      .storage.from('media-quarantine')
      .download(evidence.data.path);
    if (file.error) throw new Error('evidence_unavailable');
    const normalized = await normalizeMedia(
      new Uint8Array(await file.data.arrayBuffer()),
      evidence.data.mediaType,
      mediaLimits(evidence.data.targetType ?? 'album'),
    );
    // Proxy normalized bytes instead of disclosing raw storage paths or reusable signed URLs.
    return new Response(new Uint8Array(normalized.bytes), {
      headers: {
        'Content-Type': evidence.data.mediaType === 'image' ? 'image/jpeg' : 'video/mp4',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; media-src 'self'; img-src 'self'",
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
