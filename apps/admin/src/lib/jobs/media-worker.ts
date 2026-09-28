import { z } from 'zod';
import type { normalizeMedia } from './media';

export type MediaJob = { id: string; owner_id: string; album_id: string | null; target_type?: 'album' | 'profile_photo' | 'profile_video' | 'message' | 'meetup'; target_id?: string; object_path: string; media_type: 'image' | 'video'; review_approved?: boolean };
export type MediaOperations = {
  download(path: string): Promise<Uint8Array>;
  normalize: typeof normalizeMedia;
  moderate(bytes: Uint8Array, kind: 'image' | 'video'): Promise<boolean>;
  upload(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  finish(details: { byte_size: number; duration_ms: number | null; object_path: string; thumbnail_path: string | null; rejection_reason: string | null }): Promise<boolean>;
  fail(permanent: boolean): Promise<void>;
};
const permanentErrors = new Set(['invalid_media', 'invalid_dimensions', 'invalid_duration', 'invalid_image', 'normalized_media_too_large']);
export function isInvalidMedia(error: unknown) {
  return error instanceof z.ZodError || (error instanceof Error && permanentErrors.has(error.message));
}

/** Finalization atomically records raw-object cleanup in the database; never delete before it commits. */
export async function processMediaJob(job: MediaJob, operations: MediaOperations) {
  try {
    const target = job.target_type ?? 'album';
    const limits = mediaLimits(target);
    const normalized = await operations.normalize(await operations.download(job.object_path), job.media_type, limits);
    const approved = job.review_approved === true || await operations.moderate(normalized.bytes, job.media_type);
    const destination = mediaDestination(job);
    const thumbnail = target === 'album' ? `${job.owner_id}/${job.album_id}/${job.id}-thumb.jpg`
      : target === 'meetup' && job.media_type === 'video' ? `${job.target_id}/${job.id}-thumb.jpg` : null;
    const bucket = mediaBucket(target);
    if (approved) {
      await operations.upload(bucket, destination, normalized.bytes, job.media_type === 'image' ? 'image/jpeg' : 'video/mp4');
      if (thumbnail) await operations.upload(bucket, thumbnail, normalized.thumbnail, 'image/jpeg');
    }
    if (!await operations.finish({ byte_size: normalized.bytes.byteLength, duration_ms: normalized.durationMs,
      object_path: destination, thumbnail_path: thumbnail, rejection_reason: approved ? null : 'moderation_review_required' })) throw new Error('completion_pending');
    return { processed: 1, approved };
  } catch (error) {
    await operations.fail(isInvalidMedia(error));
    throw new Error('media_retry_required', { cause: error });
  }
}

export type CleanupJob = { id: string; bucket: string; name: string };
export async function processMediaCleanup(jobs: CleanupJob[], operations: {
  remove(bucket: string, name: string): Promise<void>;
  finish(id: string, succeeded: boolean): Promise<boolean>;
}) {
  let cleaned = 0;
  let retry = 0;
  for (const job of jobs) {
    try {
      await operations.remove(job.bucket, job.name);
      if (!await operations.finish(job.id, true)) throw new Error('cleanup_claim_expired');
      cleaned++;
    } catch {
      // Failure to acknowledge leaves the lease recoverable; processing other items continues.
      try { await operations.finish(job.id, false); } catch { /* recovered after lease expiry */ }
      retry++;
    }
  }
  return { cleaned, retry };
}

export function mediaLimits(target: NonNullable<MediaJob['target_type']>) {
  return { maxBytes: (target === 'album' ? 30 : ['profile_photo','message'].includes(target) ? 10 : 50) * 1024 * 1024,
    maxDurationMs: target === 'album' ? 15000 : target === 'profile_video' ? 10000 : null };
}
export function mediaBucket(target: NonNullable<MediaJob['target_type']>) {
  return { album:'album-media', profile_photo:'profile-photos', profile_video:'profile-videos', message:'message-images', meetup:'meetup-media' }[target];
}
export function mediaDestination(job: MediaJob) {
  const target = job.target_type ?? 'album';
  const prefix = target === 'album' ? `${job.owner_id}/${job.album_id}` : target === 'meetup' ? job.target_id : job.owner_id;
  return `${prefix}/${job.id}${job.media_type === 'image' ? '.jpg' : '.mp4'}`;
}