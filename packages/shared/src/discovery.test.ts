import { describe, it, expect } from 'vitest';
import {
  activityRank,
  matchesActivity,
  discoveryExtensionSchema,
  normalizeGender,
} from './discovery';
import { defaultMeetupEventProfile, meetupEligibility } from './meetup-profile';
describe('discovery boundaries', () => {
  const now = Date.UTC(2026, 8, 24);
  it('uses strict activity windows and neutral hidden presence', () => {
    for (const [filter, duration] of [
      ['now', 300000],
      ['recent', 7 * 86400000],
      ['month', 30 * 86400000],
    ] as const) {
      expect(matchesActivity(filter, now - duration, true, now)).toBe(false);
      expect(matchesActivity(filter, now - duration + 1, true, now)).toBe(true);
      expect(matchesActivity(filter, now, false, now)).toBe(false);
    }
    expect(activityRank(now, false, now)).toBe(activityRank(now - 90 * 86400000, false, now));
    expect(matchesActivity('all', null, false, now)).toBe(true);
  });
  it('validates radius bounds and explicit genders', () => {
    expect(discoveryExtensionSchema.parse({}).radiusKm).toBeNull();
    for (const radiusKm of [1, 500])
      expect(discoveryExtensionSchema.safeParse({ radiusKm }).success).toBe(true);
    for (const radiusKm of [0, 501, 1.5])
      expect(discoveryExtensionSchema.safeParse({ radiusKm }).success).toBe(false);
    expect(normalizeGender('trans_man')).toBe('man');
    expect(normalizeGender('trans_woman')).toBe('woman');
    expect(normalizeGender('gay')).toBeNull();
  });
  it('requires any approved diagnosis independently from public disclosure and audience', () => {
    const profile = {
      ...defaultMeetupEventProfile('open'),
      requiredDiagnosisIds: ['autism', 'adhd'] as ('autism' | 'adhd')[],
      audienceGenders: ['woman'] as 'woman'[],
    };
    expect(
      meetupEligibility(profile, {
        age: 30,
        identities: ['trans_woman'],
        approvedDiagnosisIds: ['adhd'],
      }),
    ).toBe(true);
    expect(
      meetupEligibility(profile, { age: 30, identities: ['woman'], approvedDiagnosisIds: [] }),
    ).toBe(false);
    expect(
      meetupEligibility(profile, { age: 30, identities: ['man'], approvedDiagnosisIds: ['adhd'] }),
    ).toBe(false);
  });
});
