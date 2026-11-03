import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: { rpc: mocks.rpc, storage: { from: () => ({ upload: mocks.upload }) } },
}));
import { queueMediaUpload } from './mediaUpload';
describe('feed image upload retries', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(100) })),
    );
    mocks.rpc.mockResolvedValue({
      error: null,
      data: { id: 'upload', path: 'member/upload', bucket: 'media-quarantine' },
    });
    mocks.upload.mockResolvedValue({ error: null });
  });
  it('preserves the quarantine job when concurrent retries find the original object', async () => {
    mocks.upload.mockResolvedValue({ error: { statusCode: '409' } });
    await expect(
      queueMediaUpload('social_feed_post', 'post', 'file:///chosen.jpg', 'image', 'image/jpeg'),
    ).resolves.toBe('upload');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalledWith('cancel_media_upload', expect.anything());
  });
  it('does not overwrite an existing reservation that is already uploaded', async () => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: {
        id: 'upload',
        path: 'member/upload',
        bucket: 'media-quarantine',
        alreadyUploaded: true,
      },
    });
    await queueMediaUpload('social_feed_post', 'post', 'file:///chosen.jpg', 'image', 'image/jpeg');
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('rejects animated pictures, videos and oversized originals before publication', async () => {
    await expect(
      queueMediaUpload('social_feed_post', 'post', 'file:///chosen.gif', 'image', 'image/gif'),
    ).rejects.toThrow('invalid_media_type');
    await expect(
      queueMediaUpload('social_feed_post', 'post', 'file:///chosen.mp4', 'video', 'video/mp4'),
    ).rejects.toThrow('invalid_media_type');
    vi.mocked(fetch).mockResolvedValue({
      arrayBuffer: async () => new ArrayBuffer(10485761),
    } as Response);
    await expect(
      queueMediaUpload('social_feed_post', 'post', 'file:///chosen.jpg', 'image', 'image/jpeg'),
    ).rejects.toThrow('invalid_media_size');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
