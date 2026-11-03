import { describe, expect, it } from 'vitest';
import { mergeStraxBadges, straxBadgeRemaining, straxBubbleTitle } from './straxBadge';
import type { PublicProfile } from '@/types/domain';

describe('Strax profile badges', () => {
  const serverNow = '2026-10-13T23:00:00.000Z';
  const expiresAt = '2026-10-14T03:00:00.000Z';
  it('enriches only profiles already returned by authorized discovery', () => {
    const profiles = [{ id: 'visible' }, { id: 'other', activeStrax: { id: 'stale' } }] as PublicProfile[];
    const merged = mergeStraxBadges(profiles, { serverNow, items: [
      { profileId: 'visible', activityId: 'one', title: 'One more gamer', expiresAt },
      { profileId: 'hidden', activityId: 'two', title: 'Hidden', expiresAt },
    ] }, 100);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.activeStrax).toEqual({ id: 'one', title: 'One more gamer', expiresAt, serverNow, receivedAt: 100 });
    expect(merged[1]?.activeStrax).toBeNull();
    expect(profiles[0]?.activeStrax).toBeUndefined();
  });
  it('expires across midnight using elapsed time, independent of device date', () => {
    const badge = { id: 'one', title: 'Tonight', expiresAt, serverNow, receivedAt: 100 };
    expect(straxBadgeRemaining(badge, 100)).toBe(14_400_000);
    expect(straxBadgeRemaining(badge, 14_400_100)).toBe(0);
    expect(straxBadgeRemaining(badge, 14_500_100)).toBe(0);
  });
  it('removes already-expired responses and limits the bubble including ellipsis', () => {
    expect(mergeStraxBadges([{ id: 'one' }] as PublicProfile[], { serverNow: expiresAt, items: [{ profileId: 'one', activityId: 'post', title: 'Done', expiresAt }] })[0]?.activeStrax).toBeNull();
    expect(Array.from(straxBubbleTitle('😀'.repeat(30)))).toHaveLength(24);
    expect(straxBubbleTitle('Coffee?')).toBe('Coffee?');
  });
});
