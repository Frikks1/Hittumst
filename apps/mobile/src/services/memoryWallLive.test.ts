import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('./supabase', () => ({ supabase: { storage: { from: () => ({ createSignedUrls: mocks.sign }) } } }));
import { LiveMemoryWallApi, type MemoryWallTransport } from './memoryWallLive';
import { defaultMemoryWallSettings } from '@rummal/shared';

const post = { id: 'post', meetupId: 'event', authorId: null, authorName: 'Guest', kind: 'photo', storagePath: 'event/post.jpg',
  caption: 'A lovely evening', createdAt: '2026-10-07T12:00:00Z', likeCount: 1, commentCount: 0, likedByViewer: false, pinned: false, canDelete: false };
const wall = { meetupId: 'event', meetupTitle: 'Gathering', settings: { ...defaultMemoryWallSettings, enabled: true },
  canPost: false, canManage: false, canInteract: false, posts: [post], hasMore: false };
beforeEach(() => mocks.sign.mockReset());
const media = (): MemoryWallTransport => ({ sign: vi.fn(async posts => posts), read: vi.fn(async () => new ArrayBuffer(10)), upload: vi.fn(async () => {}) });

describe('live memory wall boundaries', () => {
  it('signs only approved paths returned by the public RPC with short expiry', async () => {
    mocks.sign.mockResolvedValue({ data: [{ path: post.storagePath, signedUrl: 'https://storage.test/approved' }], error: null });
    const rpc = vi.fn(async () => ({ ...wall, exactLocation: 'secret' }));
    const result = await new LiveMemoryWallApi(rpc).getWall('event');
    expect(rpc).toHaveBeenCalledWith('get_meetup_memory_wall', { p_meetup_id: 'event', p_limit: 30, p_offset: 0 });
    expect(mocks.sign).toHaveBeenCalledWith([post.storagePath], 300);
    expect(result.posts[0]?.url).toBe('https://storage.test/approved');
    expect(result).not.toHaveProperty('exactLocation');
  });
  it('retains captions and wall access when media signing fails', async () => {
    mocks.sign.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    const result = await new LiveMemoryWallApi(async () => wall).getWall('event');
    expect(result.posts[0]).toMatchObject({ caption: post.caption, url: undefined });
  });
  it('ignores per-object signing failures even when a URL is present in the failed row', async () => {
    mocks.sign.mockResolvedValue({ data: [{ path: post.storagePath, signedUrl: 'https://storage.test/denied', error: 'denied' }], error: null });
    const result = await new LiveMemoryWallApi(async () => ({ ...wall, posts: [{ ...post, url: 'https://rpc.test/untrusted' }] })).getWall('event');
    expect(result.posts[0]?.url).toBeUndefined();
  });
  it('rejects mismatched event responses and never signs disabled-wall media', async () => {
    await expect(new LiveMemoryWallApi(async () => ({ ...wall, meetupId: 'other' })).getWall('event')).rejects.toThrow('invalid_memory_wall');
    const disabled = await new LiveMemoryWallApi(async () => ({ ...wall, settings: defaultMemoryWallSettings })).getWall('event');
    expect(disabled.posts).toEqual([]);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('validates uploads before reserving, quarantines media, and cancels failed uploads', async () => {
    const rpc = vi.fn(async () => ({ id: 'reservation', path: 'quarantine/path', bucket: 'media-quarantine' }));
    const transport = media(); const api = new LiveMemoryWallApi(rpc, transport);
    await expect(api.upload('event', 'file://image', 'photo', 'text/html', '')).rejects.toThrow('invalid_media_type');
    expect(rpc).not.toHaveBeenCalled();
    await api.upload('event', 'file://image', 'photo', 'image/jpeg', '  Our memory  ');
    expect(rpc).toHaveBeenCalledWith('reserve_meetup_memory', { p_meetup_id: 'event', p_kind: 'photo', p_caption: 'Our memory' });
    expect(transport.upload).toHaveBeenCalledWith('media-quarantine', 'quarantine/path', expect.any(ArrayBuffer), 'image/jpeg');
    vi.mocked(transport.upload).mockRejectedValueOnce(new Error('upload_failed'));
    await expect(api.upload('event', 'file://image', 'photo', 'image/jpeg', '')).rejects.toThrow('upload_failed');
    expect(rpc).toHaveBeenLastCalledWith('cancel_media_upload', { upload_id: 'reservation' });
  });
  it('rejects oversized payloads without allocating a reservation', async () => {
    const rpc = vi.fn(); const transport = media();
    vi.mocked(transport.read).mockResolvedValueOnce(new ArrayBuffer(50 * 1024 * 1024 + 1));
    await expect(new LiveMemoryWallApi(rpc, transport).upload('event', 'file://video', 'video', 'video/mp4', '')).rejects.toThrow('invalid_media_size');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('sends idempotent like state and bounded comment queries', async () => {
    const rpc = vi.fn(async () => []); const api = new LiveMemoryWallApi(rpc, media());
    await api.setLike('post', true);
    await api.listComments('post', 50, 50);
    expect(rpc).toHaveBeenNthCalledWith(1, 'set_meetup_memory_like', { p_post_id: 'post', p_liked: true });
    expect(rpc).toHaveBeenNthCalledWith(2, 'list_meetup_memory_comments', { p_post_id: 'post', p_limit: 50, p_offset: 50 });
    await expect(api.listComments('post', 500)).rejects.toThrow();
    await expect(api.listComments('post', 50, 10001)).rejects.toThrow();
    await expect(api.addComment('post', '   ')).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
