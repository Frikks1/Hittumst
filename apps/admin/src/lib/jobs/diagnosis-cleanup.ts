import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
/** Leased, idempotent erasure. Do not log paths, documents or member identifiers. */
export async function processDiagnosisCleanup(db: SupabaseClient) {
  const claim = randomUUID();
  const jobs = await db.rpc('claim_diagnosis_cleanup', { claim });
  if (jobs.error || !Array.isArray(jobs.data)) throw Error('cleanup_unavailable');
  let completed = 0;
  for (const path of jobs.data) {
    if (typeof path !== 'string') throw Error('invalid_cleanup');
    const removed = await db.storage.from('diagnosis-evidence').remove([path]);
    if (removed.error) continue;
    const result = await db.rpc('finish_diagnosis_cleanup', { path, claim });
    if (!result.error && result.data === true) completed++;
  }
  return { completed, retry: jobs.data.length - completed };
}
