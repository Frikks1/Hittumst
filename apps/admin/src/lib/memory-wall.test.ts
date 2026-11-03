import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { defaultMemoryWallSettings } from '@rummal/shared';
import { loadMemoryWall, loadMemoryComments, runMemoryMutation, uploadMemory, validateMemoryFile } from './memory-wall';

const post = { id: 'post', meetupId: 'event', authorId: null, authorName: 'Member ABC123', kind: 'photo', storagePath: 'event/post.jpg',
  caption: 'Our evening', createdAt: '2026-10-07T12:00:00Z', likeCount: 0, commentCount: 0, likedByViewer: false, pinned: false, canDelete: false };
const wall = { meetupId: 'event', meetupTitle: 'A gathering', settings: { ...defaultMemoryWallSettings, enabled: true },
  canPost: false, canManage: false, canInteract: false, posts: [post], hasMore: false };
function fixture() {
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: wall as unknown, error: null as unknown }));
  const sign = vi.fn(async () => ({ data: [{ path: post.storagePath, signedUrl: 'https://storage.test/approved', error: null }], error: null }));
  const upload = vi.fn(async () => ({ error: null as unknown }));
  const getUser = vi.fn(async () => ({ data: { user: { id: 'member', is_anonymous: false } as { id: string; is_anonymous: boolean } | null }, error: null as unknown }));
  const db = { rpc, auth: { getUser }, storage: { from: vi.fn(() => ({ createSignedUrls: sign, upload })) } } as unknown as SupabaseClient;
  return { db, rpc, sign, upload, getUser };
}
describe('public memory wall client boundaries', () => {
  it('reads with member privileges and replaces RPC-supplied URLs with expiring Storage URLs', async () => {
    const { db, rpc, sign } = fixture();
    rpc.mockResolvedValueOnce({ data: { ...wall, attendeeIds: ['private'], posts: [{ ...post, url: 'https://rpc.test/untrusted' }] }, error: null });
    const result = await loadMemoryWall(db, 'event');
    expect(sign).toHaveBeenCalledWith([post.storagePath], 300);
    expect(result?.posts[0]?.url).toBe('https://storage.test/approved');
    expect(result).not.toHaveProperty('attendeeIds');
  });
  it('never signs a disabled wall or mismatched occurrence', async () => {
    const { db, rpc, sign } = fixture();
    rpc.mockResolvedValueOnce({ data: { ...wall, settings: defaultMemoryWallSettings }, error: null });
    expect((await loadMemoryWall(db, 'event'))?.posts).toEqual([]);
    rpc.mockResolvedValueOnce({ data: { ...wall, meetupId: 'other-event' }, error: null });
    await expect(loadMemoryWall(db, 'event')).rejects.toThrow('invalid_memory_wall');
    expect(sign).not.toHaveBeenCalled();
  });
  it('keeps denied attachment URLs unavailable', async () => {
    const { db, sign } = fixture();
    sign.mockResolvedValueOnce({ data: [{ path: post.storagePath, signedUrl: 'https://storage.test/denied', error: 'denied' }], error: null } as never);
    expect((await loadMemoryWall(db, 'event'))?.posts[0]?.url).toBeUndefined();
  });
  it('rejects comments from a different post', async () => {
    const { db, rpc } = fixture();
    rpc.mockResolvedValueOnce({ data: [{ id: 'comment', postId: 'other-post', authorId: null, authorName: 'Member', body: 'Hello', createdAt: '2026-10-07T12:00:00Z', canDelete: false }], error: null });
    await expect(loadMemoryComments(db, 'post')).rejects.toThrow('invalid_memory_comments');
  });
  it('requires a verified non-anonymous member before any write RPC', async () => {
    const { db, rpc, getUser } = fixture();
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(runMemoryMutation(db, 'set_meetup_memory_like', {})).rejects.toThrow('authentication_required');
    getUser.mockResolvedValueOnce({ data: { user: { id: 'temporary', is_anonymous: true } }, error: null });
    await expect(runMemoryMutation(db, 'set_meetup_memory_like', {})).rejects.toThrow('authentication_required');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects unsupported, empty and oversized files before creating a reservation', () => {
    expect(() => validateMemoryFile({ type: 'text/html', size: 20 })).toThrow('invalid_media_type');
    expect(() => validateMemoryFile({ type: 'image/jpeg', size: 0 })).toThrow('invalid_media_size');
    expect(() => validateMemoryFile({ type: 'video/mp4', size: 50 * 1024 * 1024 + 1 })).toThrow('invalid_media_size');
  });
  it('uploads only into quarantine and preserves the storage error if reservation cancellation fails', async () => {
    const { db, rpc, upload } = fixture();
    rpc.mockResolvedValueOnce({ data: { id: 'reservation', path: 'member/reservation', bucket: 'media-quarantine' }, error: null });
    rpc.mockRejectedValueOnce(new Error('cancellation unavailable'));
    const storageError = new Error('upload unavailable');
    upload.mockResolvedValueOnce({ error: storageError });
    await expect(uploadMemory(db, 'event', { type: 'image/jpeg', size: 20 } as File, '  Our memory  ')).rejects.toBe(storageError);
    expect(rpc).toHaveBeenNthCalledWith(1, 'reserve_meetup_memory', { p_meetup_id: 'event', p_kind: 'photo', p_caption: 'Our memory' });
    expect(db.storage.from).toHaveBeenCalledWith('media-quarantine');
    expect(upload).toHaveBeenCalledWith('member/reservation', expect.anything(), { contentType: 'image/jpeg', upsert: false, cacheControl: '0' });
    expect(rpc).toHaveBeenLastCalledWith('cancel_media_upload', { upload_id: 'reservation' });
  });
});
