import { describe, expect, it } from 'vitest';
import { communityCoverReservationSchema, feedModerationInputSchema } from './social-feed';
import { staffCommunityInputSchema } from '@rummal/shared';
describe('staff community boundaries', () => {
  it('requires a complete, audited directory edit', () => {
    const input = {
      id: crypto.randomUUID(),
      name: ' Group ',
      description: '',
      status: 'archived',
      reason: 'Requested archive',
    };
    expect(staffCommunityInputSchema.parse(input).name).toBe('Group');
    expect(staffCommunityInputSchema.safeParse({ ...input, reason: '' }).success).toBe(false);
    expect(staffCommunityInputSchema.safeParse({ ...input, status: 'deleted' }).success).toBe(
      false,
    );
  });
  it('rejects arbitrary media bucket publication and unknown content targets', () => {
    expect(
      communityCoverReservationSchema.safeParse({
        id: crypto.randomUUID(),
        bucket: 'social-feed-media',
        path: 'x',
      }).success,
    ).toBe(false);
    expect(
      feedModerationInputSchema.safeParse({
        id: crypto.randomUUID(),
        kind: 'profile',
        hidden: true,
        reason: 'Valid reason',
      }).success,
    ).toBe(false);
  });
});
