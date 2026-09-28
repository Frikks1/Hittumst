import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
const requestSchema = z
  .object({
    action: z.enum(['list', 'claim', 'evidence', 'decide']),
    input: z
      .object({
        id: z.string().uuid().optional(),
        decision: z.enum(['approved', 'more_information', 'rejected', 'revoked']).optional(),
        checked: z.boolean().optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
export async function POST(request: Request) {
  // Cookie authentication: reject cross-origin mutations, including missing Origin.
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'forbidden' }, { status: 403, headers });
  try {
    const parsed = requestSchema.parse(await request.json());
    const member = await createClient();
    const { data, error } = await member.rpc('review_diagnosis', parsed);
    if (error) return Response.json({ error: 'review_unavailable' }, { status: 403, headers });
    // Never return a storage path to a browser. File bytes use the audited proxy.
    if (parsed.action === 'evidence')
      return Response.json(
        { name: data.name, birthDate: data.birthDate, diagnosisId: data.diagnosisId },
        { headers },
      );
    return Response.json(data, { headers });
  } catch {
    return Response.json({ error: 'review_unavailable' }, { status: 400, headers });
  }
}
