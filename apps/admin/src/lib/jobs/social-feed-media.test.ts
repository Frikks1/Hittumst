import { describe, expect, it, vi } from 'vitest';
import { processMediaJob, type MediaOperations } from './media-worker';
function operations(approved = true): MediaOperations {
  return {
    download: vi.fn(async () => new Uint8Array([1])),
    normalize: vi.fn(async () => ({
      bytes: Buffer.from([1, 2]),
      thumbnail: Buffer.from([1]),
      durationMs: null,
      width: 100,
      height: 100,
    })),
    moderate: vi.fn(async () => approved),
    upload: vi.fn(async () => {}),
    finish: vi.fn(async () => true),
    fail: vi.fn(async () => {}),
  };
}
describe('social feed quarantine boundary', () => {
  it.each(['social_feed_post', 'community_cover'] as const)(
    'normalizes and moderates %s before publishing one private JPEG',
    async (target_type) => {
      const ops = operations();
      await processMediaJob(
        {
          id: 'upload',
          owner_id: 'member',
          album_id: null,
          object_path: 'member/source',
          target_type,
          target_id: 'target',
          media_type: 'image',
        },
        ops,
      );
      expect(ops.normalize).toHaveBeenCalledWith(expect.any(Uint8Array), 'image', {
        maxBytes: 10485760,
        maxDurationMs: null,
      });
      expect(ops.upload).toHaveBeenCalledExactlyOnceWith(
        'social-feed-media',
        'target/upload.jpg',
        expect.any(Uint8Array),
        'image/jpeg',
      );
      expect(vi.mocked(ops.upload).mock.invocationCallOrder[0]).toBeGreaterThan(
        vi.mocked(ops.moderate).mock.invocationCallOrder[0]!,
      );
    },
  );
  it('does not publish a rejected post picture or accept feed video', async () => {
    const ops = operations(false);
    const job = {
      id: 'upload',
      owner_id: 'member',
      album_id: null,
      object_path: 'member/source',
      target_type: 'social_feed_post' as const,
      target_id: 'target',
      media_type: 'image' as const,
    };
    await processMediaJob(job, ops);
    expect(ops.upload).not.toHaveBeenCalled();
    expect(ops.finish).toHaveBeenCalledWith(
      expect.objectContaining({ rejection_reason: 'moderation_review_required' }),
    );
    const video = operations();
    await expect(processMediaJob({ ...job, media_type: 'video' }, video)).rejects.toThrow();
    expect(video.normalize).not.toHaveBeenCalled();
    expect(video.fail).toHaveBeenCalledWith(true);
  });
});
