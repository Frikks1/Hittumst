import { processDiagnosisCleanup } from '@/lib/jobs/diagnosis-cleanup';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { commerceDatabase } from '@/lib/commerce';
import { normalizeMedia } from '@/lib/jobs/media';
import { moderateMedia } from '@/lib/jobs/media-moderation';
import {
  processMediaCleanup,
  processMediaJob,
  type CleanupJob,
  type MediaJob,
} from '@/lib/jobs/media-worker';
export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (process.env.WORKER_SCHEDULER === 'render' && process.env.WORKER_EXECUTION_ROLE !== 'worker')
    return Response.json({ error: 'dedicated_worker_required' }, { status: 503 });
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    secret.length < 32 ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const db = commerceDatabase();
    const claim = randomUUID();
    const diagnosisCleanup = await processDiagnosisCleanup(db);
    // Cleanup must work even while transcoding or the moderation provider is unavailable.
    const pendingCleanup = await db.rpc('claim_media_cleanup', { claim_id: claim });
    if (pendingCleanup.error || !Array.isArray(pendingCleanup.data))
      throw new Error('queue_unavailable');
    const cleanup = await processMediaCleanup(pendingCleanup.data as CleanupJob[], {
      async remove(bucket, name) {
        const { error } = await db.storage.from(bucket).remove([name]);
        if (error) throw error;
      },
      async finish(id, succeeded) {
        const { data, error } = await db.rpc('finish_media_cleanup', {
          job_id: id,
          claim_id: claim,
          succeeded,
        });
        if (error) throw error;
        return data === true;
      },
    });
    if (
      !process.env.FFMPEG_PATH ||
      !process.env.FFPROBE_PATH ||
      process.env.AWS_MEDIA_PRIVACY_VERIFIED !== 'true'
    )
      return Response.json(
        { error: 'processor_unavailable', cleanup, diagnosisCleanup },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    const claimed = await db.rpc('claim_media_upload', { claim_id: claim });
    if (claimed.error) throw new Error('queue_unavailable');
    if (!claimed.data)
      return Response.json(
        { processed: 0, cleanup, diagnosisCleanup },
        { status: diagnosisCleanup.retry ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
      );
    const job = claimed.data as MediaJob;
    const result = await processMediaJob(job, {
      async download(path) {
        const file = await db.storage.from('media-quarantine').download(path);
        if (file.error) throw file.error;
        return new Uint8Array(await file.data.arrayBuffer());
      },
      normalize: normalizeMedia,
      moderate: moderateMedia,
      async upload(bucket, path, bytes, contentType) {
        const { error } = await db.storage
          .from(bucket)
          .upload(path, bytes, { contentType, upsert: true });
        if (error) throw error;
      },
      async finish(details) {
        const { data, error } = await db.rpc('finish_media_upload', {
          job_id: job.id,
          claim_id: claim,
          ...details,
        });
        if (error) throw error;
        return data === true;
      },
      async fail(permanent) {
        const { error } = await db.rpc('fail_media_upload', {
          job_id: job.id,
          claim_id: claim,
          permanent,
        });
        if (error) throw error;
      },
    });
    return Response.json(
      { ...result, cleanup, diagnosisCleanup },
      { status: diagnosisCleanup.retry ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'media_retry_required' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
