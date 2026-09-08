import { timingSafeEqual, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { runDeletionJob, type DeletionJob } from '@/lib/jobs/account-deletion';

export const runtime = 'nodejs';
export const maxDuration = 240;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!secret || secret.length < 32 || !url || !key || !key.startsWith('sb_secret_')) return Response.json({ error: 'worker_unavailable' }, { status: 503 });
  const supplied = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = randomUUID();
  const claimed = await db.rpc('claim_account_deletions', { claim_token: token, batch_size: 1 });
  if (claimed.error || !Array.isArray(claimed.data)) return Response.json({ error: 'queue_unavailable' }, { status: 503 });
  let complete = 0;
  let retry = 0;
  for (const job of claimed.data as DeletionJob[]) {
    try {
      const succeeded = await runDeletionJob(job, {
        async removeObjects(bucket, names) { const { error } = await db.storage.from(bucket).remove(names); if (error) throw error; },
        async deleteAuthUser(id) { const { error } = await db.auth.admin.deleteUser(id); if (error && error.status !== 404) throw error; },
        async finish(id, succeeded) { const { error } = await db.rpc('finish_account_deletion', { job_id: id, claim_token: token, succeeded }); if (error) throw error; },
      });
      if (succeeded) complete++; else retry++;
    } catch { retry++; }
  }
  return Response.json({ complete, retry }, { headers: { 'Cache-Control': 'no-store' } });
}
