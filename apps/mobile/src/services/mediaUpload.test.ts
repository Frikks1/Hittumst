import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), from: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc, storage: { from: mocks.from } } }));
import { queueMediaUpload } from './mediaUpload';

describe('profile GIF quarantine uploads', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(100) })));
    mocks.from.mockReturnValue({ upload: mocks.upload });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ error: null, data: { id: 'upload', path: 'owner/upload', bucket: 'media-quarantine' } });
  });
  it('uploads a GIF only through the profile-photo approval reservation', async () => {
    expect(await queueMediaUpload('profile_photo', 'owner', 'file:///banner.gif', 'image', 'image/gif')).toBe('upload');
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_media_upload', { target_type: 'profile_photo', target_id: 'owner', media_type: 'image', metadata: { tags: [] } });
    expect(mocks.from).toHaveBeenCalledWith('media-quarantine');
    expect(mocks.upload).toHaveBeenCalledWith('owner/upload', expect.any(ArrayBuffer), { contentType: 'image/gif', upsert: false, cacheControl: '0' });
  });
  it('rejects GIFs for every other media target before fetching bytes', async () => {
    for (const target of ['profile_video', 'message', 'meetup', 'strax'] as const) {
      await expect(queueMediaUpload(target, 'id', 'file:///banner.gif', 'image', 'image/gif')).rejects.toThrow('invalid_media_type');
    }
    await expect(queueMediaUpload('profile_photo', 'id', 'file:///banner.gif', 'video', 'image/gif')).rejects.toThrow('invalid_media_type');
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('quarantines a Strax still image and rejects videos and oversized files before reserving', async () => {
    await queueMediaUpload('strax', 'activity', 'file:///activity.jpg', 'image', 'image/jpeg');
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_media_upload', { target_type: 'strax', target_id: 'activity', media_type: 'image', metadata: { tags: [] } });
    mocks.rpc.mockClear();
    await expect(queueMediaUpload('strax', 'activity', 'file:///activity.mp4', 'video', 'video/mp4')).rejects.toThrow('invalid_media_type');
    vi.mocked(fetch).mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(10 * 1024 * 1024 + 1) } as Response);
    await expect(queueMediaUpload('strax', 'activity', 'file:///activity.jpg', 'image', 'image/jpeg')).rejects.toThrow('invalid_media_size');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('keeps the 10 MiB profile photo limit including GIFs', async () => {
    vi.mocked(fetch).mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(10 * 1024 * 1024 + 1) } as Response);
    await expect(queueMediaUpload('profile_photo', 'owner', 'file:///banner.gif', 'image', 'image/gif')).rejects.toThrow('invalid_media_size');
    expect(mocks.rpc).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(10 * 1024 * 1024) } as Response);
    await expect(queueMediaUpload('profile_photo', 'owner', 'file:///banner.gif', 'image', 'image/gif')).resolves.toBe('upload');
  });
  it('cancels a failed GIF upload before anything can be published', async () => {
    mocks.upload.mockResolvedValueOnce({ error: new Error('storage_failure') });
    await expect(queueMediaUpload('profile_photo', 'owner', 'file:///banner.gif', 'image', 'image/gif')).rejects.toThrow('storage_failure');
    expect(mocks.rpc).toHaveBeenLastCalledWith('cancel_media_upload', { upload_id: 'upload' });
  });
  it('preserves an already-uploaded Strax quarantine object when retrying a lost receipt', async () => {
    mocks.upload.mockResolvedValueOnce({ error: { statusCode: '409', message: 'The resource already exists' } });
    await expect(queueMediaUpload('strax', 'activity', 'file:///activity.jpg', 'image', 'image/jpeg')).resolves.toBe('upload');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalledWith('cancel_media_upload', expect.anything());
  });
  it('reserves room attachments with the send retry ID and preserves an uploaded retry', async () => {
    mocks.upload.mockResolvedValueOnce({ error: { statusCode: '409', message: 'The resource already exists' } });
    await expect(queueMediaUpload('meetup_room_message', 'room', 'file:///photo.jpg', 'image', 'image/jpeg', [], 'request')).resolves.toBe('upload');
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_media_upload', { target_type: 'meetup_room_message', target_id: 'room', media_type: 'image', metadata: { tags: [], clientMessageId: 'request' } });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('reuses a server-confirmed uploaded room attachment after its quarantine original is cleaned', async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: { id: 'upload', path: 'owner/upload', bucket: 'media-quarantine', alreadyUploaded: true } });
    await expect(queueMediaUpload('meetup_room_message', 'room', 'file:///photo.jpg', 'image', 'image/jpeg', [], 'request')).resolves.toBe('upload');
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('enforces smaller chat photo limits and image-only chat avatars', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(11 * 1024 * 1024) })));
    await expect(queueMediaUpload('meetup_room_message', 'room', 'file:///large.jpg', 'image', 'image/jpeg')).rejects.toThrow('invalid_media_size');
    await expect(queueMediaUpload('meetup_room_avatar', 'room', 'file:///video.mp4', 'video', 'video/mp4')).rejects.toThrow('invalid_media_type');
    await expect(queueMediaUpload('meetup_room_avatar', 'room', 'file:///chat.gif', 'image', 'image/gif')).rejects.toThrow('invalid_media_type');
    expect(mocks.rpc).not.toHaveBeenCalled();
    await expect(queueMediaUpload('meetup_room_message', 'room', 'file:///video.mp4', 'video', 'video/mp4')).resolves.toBe('upload');
  });
});
