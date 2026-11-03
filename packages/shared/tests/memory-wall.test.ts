import { describe, expect, it } from 'vitest';
import { defaultMemoryWallSettings, memoryWallSettingsSchema, memoryCommentBodySchema, memoryWallSchema } from '../src/memory-wall';

describe('memory wall public contract', () => {
  it('starts private and constrains host customization', () => {
    expect(defaultMemoryWallSettings.enabled).toBe(false);
    expect(memoryWallSettingsSchema.parse({ ...defaultMemoryWallSettings, title: '  Our evening  ' }).title).toBe('Our evening');
    for (const patch of [{ title: '' }, { description: 'x'.repeat(1001) }, { layout: 'script' }, { accentColor: 'url(https://example.test)' }, { hostId: 'forged' }]) {
      expect(memoryWallSettingsSchema.safeParse({ ...defaultMemoryWallSettings, ...patch }).success).toBe(false);
    }
  });
  it('strips protected event data from the public boundary', () => {
    const wall = memoryWallSchema.parse({ meetupId: 'event', meetupTitle: 'Our gathering', settings: defaultMemoryWallSettings,
      canPost: false, canManage: false, canInteract: false, posts: [], hasMore: false,
      exactLocation: { address: 'secret' }, participants: ['private-profile'] });
    expect(wall).not.toHaveProperty('exactLocation');
    expect(wall).not.toHaveProperty('participants');
  });
  it('rejects whitespace-only and oversized comments', () => {
    expect(memoryCommentBodySchema.safeParse('   ').success).toBe(false);
    expect(memoryCommentBodySchema.safeParse('x'.repeat(2001)).success).toBe(false);
    expect(memoryCommentBodySchema.parse('  A wonderful night!  ')).toBe('A wonderful night!');
  });
});
