import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
import { DemoSocialFeedApi } from './socialFeedDemo';
import type { OwnProfile, PublicProfile } from '@/types/domain';
const profile = {
  id: 'member-a',
  displayName: 'Alex',
  pronouns: 'þau/þeim',
  photos: [],
  coverPhotoId: null,
} as unknown as OwnProfile;
function fixture() {
  let person = profile;
  let blocked: PublicProfile[] = [];
  const api = new DemoSocialFeedApi(
    { getOwnProfile: async () => person, listBlocked: async () => blocked },
    () => 2000000000000,
  );
  return {
    api,
    switchUser: (id: string) => {
      person = { ...profile, id };
    },
    block: (id: string) => {
      blocked = [{ id } as PublicProfile];
    },
  };
}
describe('member social feed', () => {
  it('uses real demo membership counts and explicit desired-state likes', async () => {
    const f = fixture();
    const group = (await f.api.directory())[0]!;
    expect(group.memberCount).toBe(0);
    expect((await f.api.setMembership(group.id, true)).memberCount).toBe(1);
    expect((await f.api.setMembership(group.id, true)).memberCount).toBe(1);
    const post = await f.api.publish({
      requestId: crypto.randomUUID(),
      communityId: group.id,
      body: 'Hello',
    });
    expect(post.community?.id).toBe(group.id);
    expect((await f.api.setLiked(post.id, true)).likeCount).toBe(1);
    expect((await f.api.setLiked(post.id, true)).likeCount).toBe(1);
    expect((await f.api.setLiked(post.id, false)).likeCount).toBe(0);
  });
  it('recovers unknown successful publication/comment replies without duplicating', async () => {
    const f = fixture();
    const input = { requestId: crypto.randomUUID(), communityId: null, body: 'Hello' };
    const first = await f.api.publish(input);
    expect((await f.api.publish(input)).id).toBe(first.id);
    await expect(f.api.publish({ ...input, body: 'Changed' })).rejects.toThrow(
      'social_feed_request_conflict',
    );
    const reply = { requestId: crypto.randomUUID(), body: 'A reply' };
    expect((await f.api.comment(first.id, reply)).id).toBe(
      (await f.api.comment(first.id, reply)).id,
    );
    expect((await f.api.post(first.id)).commentCount).toBe(1);
  });
  it('requires membership only for community publication', async () => {
    const f = fixture();
    const group = (await f.api.directory())[0]!;
    await expect(
      f.api.publish({ requestId: crypto.randomUUID(), communityId: group.id, body: 'Hello' }),
    ).rejects.toThrow('community_membership_required');
    const original = (await f.api.feed()).items[0]!;
    await expect(
      f.api.comment(original.id, { requestId: crypto.randomUUID(), body: 'Everyone can reply' }),
    ).resolves.toMatchObject({ body: 'Everyone can reply' });
  });
  it('filters blocked authors and binds deletion to the active account', async () => {
    const f = fixture();
    const own = await f.api.publish({
      requestId: crypto.randomUUID(),
      communityId: null,
      body: 'My post',
    });
    f.switchUser('member-b');
    expect((await f.api.post(own.id)).canDelete).toBe(false);
    await expect(f.api.deletePost(own.id)).rejects.toThrow('social_feed_owner_required');
    f.block('member-a');
    expect((await f.api.feed()).items.some((item) => item.id === own.id)).toBe(false);
    await expect(f.api.post(own.id)).rejects.toThrow('social_feed_unavailable');
  });
  it('paginates posts with a stable tie breaker even if a new post appears', async () => {
    const f = fixture();
    for (let i = 0; i < 25; i++)
      await f.api.publish({ requestId: crypto.randomUUID(), communityId: null, body: String(i) });
    const first = await f.api.feed();
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toBeTruthy();
    const second = await f.api.feed(null, first.nextCursor);
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(26);
  });
  it('enforces content length and removes own contributions', async () => {
    const f = fixture();
    await expect(
      f.api.publish({ requestId: crypto.randomUUID(), communityId: null, body: 'x'.repeat(2001) }),
    ).rejects.toThrow();
    const post = await f.api.publish({
      requestId: crypto.randomUUID(),
      communityId: null,
      body: 'Hello',
    });
    const reply = await f.api.comment(post.id, { requestId: crypto.randomUUID(), body: 'Reply' });
    await f.api.deleteComment(reply.id);
    await f.api.deleteComment(reply.id);
    expect((await f.api.comments(post.id)).items).toHaveLength(0);
    await f.api.deletePost(post.id);
    await f.api.deletePost(post.id);
    await expect(f.api.post(post.id)).rejects.toThrow('social_feed_unavailable');
  });
});
