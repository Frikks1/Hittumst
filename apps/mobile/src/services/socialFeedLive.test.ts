import { describe, expect, it, vi } from 'vitest';
vi.mock('./supabase', () => ({ supabase: null }));
vi.mock('./mediaUpload', () => ({ queueMediaUpload: vi.fn() }));
import { LiveSocialFeedApi } from './socialFeedLive';
import { queueMediaUpload } from './mediaUpload';
const post = {
  id: 'post',
  author: { id: 'member', displayName: 'Alex', pronouns: null, photoPath: null },
  community: null,
  body: 'Hi',
  createdAt: '2026-10-14T00:00:00Z',
  liked: false,
  likeCount: 0,
  commentCount: 0,
  canDelete: true,
  imageStatus: 'pending',
  imagePath: null,
};
describe('live social feed contract', () => {
  it('passes stable cursors and community scope to the server without inventing results', async () => {
    const rpc = vi.fn(async () => ({ items: [post], nextCursor: 'cursor' }));
    const api = new LiveSocialFeedApi(rpc, async (rows) => rows);
    expect(await api.feed('community', 'before')).toMatchObject({
      nextCursor: 'cursor',
      items: [{ id: 'post' }],
    });
    expect(rpc).toHaveBeenCalledWith('social_feed_posts', {
      p_community: 'community',
      p_cursor: 'before',
    });
  });
  it('uses desired-state like updates and does not publish unvalidated text', async () => {
    const rpc = vi.fn(async () => post);
    const api = new LiveSocialFeedApi(rpc, async (rows) => rows);
    await api.setLiked('post', true);
    expect(rpc).toHaveBeenCalledWith('social_feed_like', { p_id: 'post', p_liked: true });
    await expect(
      api.publish({ requestId: crypto.randomUUID(), body: ' ', communityId: null }),
    ).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('sends media through the existing quarantine pipeline', async () => {
    const api = new LiveSocialFeedApi();
    await api.uploadImage('post', 'file:///chosen.png', 'image/png');
    expect(queueMediaUpload).toHaveBeenCalledWith(
      'social_feed_post',
      'post',
      'file:///chosen.png',
      'image',
      'image/png',
    );
  });
  it('requires server schema-compatible replies', async () => {
    const api = new LiveSocialFeedApi(async () => ({ items: [], nextCursor: 1 }));
    await expect(api.feed()).rejects.toThrow();
  });
});
