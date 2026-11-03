import { z } from 'zod';
import type { normalizeMedia } from './media';

export type MediaJob = { id: string; owner_id: string; album_id: string | null; target_type?: 'album' | 'profile_photo' | 'profile_video' | 'message' | 'meetup' | 'meetup_memory' | 'meetup_room_message' | 'meetup_room_avatar' | 'showcase' | 'strax' | 'social_feed_post' | 'community_cover'; target_id?: string; object_path: string; media_type: 'image' | 'video'; review_approved?: boolean };
export type MediaOperations = {
  download(path: string): Promise<Uint8Array>;
  normalize: typeof normalizeMedia;
  moderate(bytes: Uint8Array, kind: 'image' | 'video'): Promise<boolean>;
  upload(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  finish(details: { byte_size: number; duration_ms: number | null; object_path: string; thumbnail_path: string | null; rejection_reason: string | null }): Promise<boolean>;
  fail(permanent: boolean): Promise<void>;
};
const permanentErrors = new Set(['invalid_media', 'invalid_dimensions', 'invalid_duration', 'invalid_image', 'invalid_animation', 'normalized_media_too_large']);
export function isInvalidMedia(error: unknown) {
  return error instanceof z.ZodError || (error instanceof Error && permanentErrors.has(error.message));
}

/** Finalization atomically records raw-object cleanup in the database; never delete before it commits. */
export async function processMediaJob(job: MediaJob, operations: MediaOperations) {
  try {
    const target = job.target_type ?? 'album';
    if (['strax', 'meetup_room_avatar', 'social_feed_post', 'community_cover'].includes(target) && job.media_type !== 'image') throw new Error('invalid_media');
    if (['meetup_room_message', 'meetup_room_avatar', 'social_feed_post', 'community_cover'].includes(target) && !job.target_id) throw new Error('invalid_media');
    const limits = mediaLimits(target, job.media_type);
    const normalized = await operations.normalize(await operations.download(job.object_path), job.media_type, limits);
    const animated = normalized.contentType === 'image/gif';
    if (animated && (target !== 'profile_photo' || job.media_type !== 'image' || !normalized.moderationFrames?.length)) throw new Error('invalid_animation');
    let approved = job.review_approved === true;
    if (!approved && normalized.moderationFrames) {
      approved = true;
      for (let index = 0; index < normalized.moderationFrames.length; index += 4) {
        const results = await Promise.all(normalized.moderationFrames.slice(index, index + 4).map(frame => operations.moderate(frame, 'image')));
        if (results.some(result => !result)) { approved = false; break; }
      }
    } else if (!approved) approved = await operations.moderate(normalized.bytes, job.media_type);
    const destination = mediaDestination(job, animated ? '.gif' : undefined);
    const thumbnail = target === 'album' ? `${job.owner_id}/${job.album_id}/${job.id}-thumb.jpg`
      : animated ? `${job.owner_id}/${job.id}-thumb.jpg`
      : ['meetup', 'meetup_memory', 'meetup_room_message', 'showcase'].includes(target) && job.media_type === 'video' ? `${job.target_id}/${job.id}-thumb.jpg` : null;
    const bucket = mediaBucket(target);
    if (approved) {
      await operations.upload(bucket, destination, normalized.bytes, normalized.contentType ?? (job.media_type === 'image' ? 'image/jpeg' : 'video/mp4'));
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

export function mediaLimits(target: NonNullable<MediaJob['target_type']>, mediaType: MediaJob['media_type'] = 'image') {
  return { maxBytes: (target === 'album' ? 30 : ['profile_photo','message','strax','meetup_room_avatar','social_feed_post','community_cover'].includes(target) || (target === 'meetup_room_message' && mediaType === 'image') ? 10 : 50) * 1024 * 1024,
    maxDurationMs: target === 'album' ? 15000 : target === 'profile_video' ? 10000 : null,
    ...(target === 'profile_photo' ? { allowAnimatedImages: true } : {}) };
}
export function mediaBucket(target: NonNullable<MediaJob['target_type']>) {
  return { album:'album-media', profile_photo:'profile-photos', profile_video:'profile-videos', message:'message-images', meetup:'meetup-media', meetup_memory:'meetup-media', meetup_room_message:'meetup-room-media', meetup_room_avatar:'meetup-room-media', showcase:'showcase-media', strax:'strax-media', social_feed_post:'social-feed-media', community_cover:'social-feed-media' }[target];
}
export function mediaDestination(job: MediaJob, imageExtension: '.gif' | '.jpg' = '.jpg') {
  const target = job.target_type ?? 'album';
  const prefix = target === 'album' ? `${job.owner_id}/${job.album_id}` : ['meetup', 'meetup_memory', 'meetup_room_message', 'meetup_room_avatar', 'showcase', 'strax', 'social_feed_post', 'community_cover'].includes(target) ? job.target_id : job.owner_id;
  return `${prefix}/${job.id}${job.media_type === 'image' ? imageExtension : '.mp4'}`;
}
