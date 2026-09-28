import { describe, expect, it } from 'vitest';
import { communityApplicationInputSchema, communityQuestionsSchema, communityRecommendationInputSchema, normalizeMeetupNotificationKind } from './index';
describe('community input contracts', () => {
  it('keeps applications bounded and requires explicit rule acceptance', () => {
    expect(communityApplicationInputSchema.safeParse({ introduction: 'Hello', answers: [], rulesAccepted: true }).success).toBe(true);
    expect(communityApplicationInputSchema.safeParse({ introduction: ' ', answers: [], rulesAccepted: true }).success).toBe(false);
    expect(communityQuestionsSchema.safeParse(['One?', 'Two?', 'Three?']).success).toBe(false);
    expect(communityQuestionsSchema.safeParse(['x'.repeat(201)]).success).toBe(false);
  });
  it('uses a boolean recommendation and optional text without converting stars', () => {
    expect(communityRecommendationInputSchema.parse({ recommended: false, body: '' })).toEqual({ recommended: false, body: '' });
    expect(communityRecommendationInputSchema.safeParse({ rating: 5, body: 'Great' }).success).toBe(false);
  });
  it('recognizes community notifications without confusing social follows with subscriptions', () => {
    for (const kind of ['community_published', 'community_announcement', 'community_waitlist_offer', 'community_reminder']) expect(normalizeMeetupNotificationKind(kind)).toBe(kind);
    expect(normalizeMeetupNotificationKind('subscription_renewed')).toBeNull();
  });
});
