import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
import { DemoMemoryWallApi, DemoMemoryWallStore } from './memoryWallDemo';
import { DemoCommunityStore } from './communityDemo';
import { defaultMemoryWallSettings } from '@rummal/shared';
import type { RummalApi } from './types';

function fixture() {
  const now = Date.parse('2026-10-07T12:00:00Z');
  const viewer = { id: 'host', displayName: 'Host' };
  const event = { id: 'event', title: 'Gathering', host: { id: 'host' }, status: 'published', accessMode: 'open',
    startsAt: new Date(now - 1000).toISOString(), isExplicit: false, diagnosisRestricted: false,
    requiresDiagnosisVerification: false, viewerState: { participationStatus: 'joined' } };
  const attendance = new DemoCommunityStore();
  const source = { getOwnProfile: async () => viewer, getMeetup: async () => event, demoCommunityStore: attendance };
  const store = new DemoMemoryWallStore();
  const api = new DemoMemoryWallApi(source as unknown as RummalApi, store, () => now);
  return { api, viewer, event, attendance, store, now };
}
describe('demo memory wall workflows', () => {
  it('requires host opt-in and real recorded attendance, beyond merely joining', async () => {
    const { api, viewer, attendance } = fixture();
    expect((await api.getWall('event')).settings.enabled).toBe(false);
    await api.updateSettings('event', { ...defaultMemoryWallSettings, enabled: true });
    viewer.id = 'guest'; viewer.displayName = 'Guest';
    expect((await api.getWall('event')).canPost).toBe(false);
    await expect(api.upload('event', 'file://photo', 'photo', 'image/jpeg', '')).rejects.toThrow('recorded_attendance_required');
    attendance.receipts.set('event', new Set(['guest']));
    expect((await api.getWall('event')).canPost).toBe(true);
    await api.upload('event', 'file://photo', 'photo', 'image/jpeg', 'Our evening');
    expect((await api.getWall('event')).posts[0]).toMatchObject({ authorName: 'Guest', caption: 'Our evening', canDelete: true });
  });
  it('keeps likes idempotent, comments per post, and host deletion cascades', async () => {
    const { api, viewer } = fixture();
    await api.updateSettings('event', { ...defaultMemoryWallSettings, enabled: true });
    await api.upload('event', 'file://photo', 'photo', 'image/jpeg', '');
    const post = (await api.getWall('event')).posts[0]!;
    viewer.id = 'visitor'; viewer.displayName = 'Visitor';
    await api.setLike(post.id, true); await api.setLike(post.id, true);
    await api.addComment(post.id, '  Beautiful!  ');
    expect((await api.getWall('event')).posts[0]).toMatchObject({ likeCount: 1, commentCount: 1, likedByViewer: true, canDelete: false });
    expect((await api.listComments(post.id))[0]).toMatchObject({ body: 'Beautiful!', canDelete: true });
    await expect(api.deletePost(post.id)).rejects.toThrow('memory_owner_required');
    await expect(api.pinPost(post.id, true)).rejects.toThrow('host_required');
    viewer.id = 'host';
    await api.pinPost(post.id, true);
    expect((await api.getWall('event')).posts[0]?.pinned).toBe(true);
    await api.deletePost(post.id);
    expect((await api.getWall('event')).posts).toEqual([]);
    expect(api.store.comments.size).toBe(0);
    expect(api.store.likes.size).toBe(0);
  });
  it('prevents pre-event posts and hides a disabled or newly restricted wall', async () => {
    const { api, event, now, viewer } = fixture();
    await api.updateSettings('event', { ...defaultMemoryWallSettings, enabled: true });
    event.startsAt = new Date(now + 1000).toISOString();
    expect((await api.getWall('event')).canPost).toBe(false);
    event.diagnosisRestricted = true;
    await expect(api.updateSettings('event', { ...defaultMemoryWallSettings, enabled: true })).rejects.toThrow('public_event_required');
    viewer.id = 'visitor';
    await expect(api.getWall('event')).rejects.toThrow('memory_wall_unavailable');
    event.diagnosisRestricted = false; viewer.id = 'host';
    await api.updateSettings('event', defaultMemoryWallSettings);
    viewer.id = 'visitor';
    await expect(api.getWall('event')).rejects.toThrow('memory_wall_unavailable');
  });
});
