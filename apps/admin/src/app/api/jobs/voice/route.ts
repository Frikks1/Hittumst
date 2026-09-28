import { timingSafeEqual } from 'node:crypto';
import { reconcileVoice } from '@/lib/voice/worker';
import { voiceCommand, voiceEnabled } from '@/lib/voice/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const secret = process.env.VOICE_WORKER_SECRET;
  const actual = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  const headers = { 'Cache-Control': 'no-store' };
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ ok:false, error:'unauthorized' }, { status:403, headers });
  if (process.env.HITTUMST_APP_ENV !== 'development' && (process.env.WORKER_EXECUTION_ROLE !== 'worker' || process.env.WORKER_SCHEDULER !== 'render'))
    return Response.json({ ok:false, error:'dedicated_worker_required' }, { status:403, headers });
  try {
    if (!voiceEnabled()) {
      // Turning off voice prevents admission and revokes any previously connected calls.
      await voiceCommand('disable');
      if (process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL) {
        const result = await reconcileVoice(false);
        return Response.json({ ok:true, disabled:true, ...result }, { headers });
      }
      const pending = await voiceCommand('reconcile') as { revocations:unknown[]; rooms:unknown[] };
      if (pending.revocations.length || pending.rooms.length) throw new Error('voice_revocation_credentials_missing');
      return Response.json({ ok:true, disabled:true, revoked:0, ended:0 }, { headers });
    }
    return Response.json({ ok:true, ...await reconcileVoice() }, { headers });
  } catch { return Response.json({ ok:false, error:'voice_worker_failed' }, { status:503, headers }); }
}

