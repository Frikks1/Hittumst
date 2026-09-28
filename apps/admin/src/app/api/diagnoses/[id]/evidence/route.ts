import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { commerceDatabase } from '@/lib/commerce';
import { normalizeMedia } from '@/lib/jobs/media';
import { mediaLimits } from '@/lib/jobs/media-worker';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; img-src 'self'",
  'Cross-Origin-Resource-Policy': 'same-origin',
};
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z
      .string()
      .uuid()
      .parse((await context.params).id);
    const member = await createClient();
    const evidence = await member.rpc('review_diagnosis', { action: 'evidence', input: { id } });
    if (evidence.error || !evidence.data) return new Response(null, { status: 403, headers });
    const file = await commerceDatabase()
      .storage.from('diagnosis-evidence')
      .download(evidence.data.path);
    if (file.error) throw Error('unavailable');
    // Local image normalization only. Never invoke Rekognition or another moderation provider.
    const normalized = await normalizeMedia(
      new Uint8Array(await file.data.arrayBuffer()),
      'image',
      mediaLimits('profile_photo'),
    );
    // Consent and assignment may have changed while downloading/decoding.
    const recheck = await member.rpc('review_diagnosis', { action: 'evidence', input: { id } });
    if (recheck.error) return new Response(null, { status: 403, headers });
    return new Response(new Uint8Array(normalized.bytes), {
      headers: { ...headers, 'Content-Type': 'image/jpeg' },
    });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
