import { describe, expect, it } from 'vitest';
import { defaultMeetupEventProfile, meetupEligibility, meetupEventProfileSchema, meetupReviewInputSchema } from '../src/meetup-profile';

describe('Event profile rules', () => {
  it('accepts custom topics and rejects duplicate, oversized or empty labels', () => {
    const profile = { ...defaultMeetupEventProfile(), customTags: ['Gaming', 'Dungeons and Dragons', 'Útivist'] };
    expect(meetupEventProfileSchema.parse(profile).customTags).toEqual(profile.customTags);
    for (const tags of [['Gaming', 'gaming'], [' '], ['x'.repeat(41)]]) expect(meetupEventProfileSchema.safeParse({ ...profile, customTags: tags }).success).toBe(false);
  });
  it('rejects inverted ages, minors and malformed information sections', () => {
    for (const patch of [{ minAge: 17 }, { minAge: 40, maxAge: 30 }, { sections: [{ title: '', body: 'Text' }] }, { genderLimits: [{ gender: 'man', maxRsvp: -1 }] }]) {
      expect(meetupEventProfileSchema.safeParse({ ...defaultMeetupEventProfile(), ...patch }).success).toBe(false);
    }
  });
  it('enforces inclusive age bounds and zero-cap exclusions', () => {
    const profile = { ...defaultMeetupEventProfile(), minAge: 21, maxAge: 60, ageLimits: [{ minAge: 30, maxAge: 35, maxRsvp: 0 }] };
    expect(meetupEligibility(profile, { age: 21, identities: [] })).toBe(true);
    for (const age of [null, 20, 30, 35, 61]) expect(meetupEligibility(profile, { age, identities: [] })).toBe(false);
  });
  it('counts overlapping age quotas and every matching gender rule', () => {
    const profile = { ...defaultMeetupEventProfile(), ageLimits: [{ minAge: 25, maxAge: 40, maxRsvp: 1 }], genderLimits: [{ gender: 'man' as const, maxRsvp: 1 }] };
    const person = { age: 30, identities: ['man'] };
    expect(meetupEligibility(profile, person)).toBe(true);
    expect(meetupEligibility(profile, person, [{ age: 26, identities: ['woman'] }])).toBe(false);
    expect(meetupEligibility(profile, person, [{ age: 50, identities: ['man'] }])).toBe(false);
    expect(meetupEligibility(profile, { age: 30, identities: [] })).toBe(false);
  });
  it('requires a real review body and one to five stars', () => {
    expect(meetupReviewInputSchema.safeParse({ rating: 5, body: 'Great evening!' }).success).toBe(true);
    expect(meetupReviewInputSchema.safeParse({ rating: 6, body: 'ok' }).success).toBe(false);
  });
});
