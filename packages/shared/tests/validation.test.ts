import { describe, expect, it } from 'vitest';
import { calculateAge, discoveryFiltersSchema, isAdult, messageSchema } from '../src/validation';

describe('shared validation', () => {
  it('handles birthdays without local-time drift', () => {
    expect(calculateAge('2008-08-31', new Date('2026-08-31T00:01:00Z'))).toBe(18);
    expect(calculateAge('2008-09-01', new Date('2026-08-31T23:59:00Z'))).toBe(17);
    expect(isAdult('2008-08-31', new Date('2026-08-31T12:00:00Z'))).toBe(true);
  });

  it('rejects inverted discovery ages', () => {
    expect(
      discoveryFiltersSchema.safeParse({
        ageMin: 40,
        ageMax: 20,
        identities: [],
        intents: [],
        onlineOnly: false,
      }).success,
    ).toBe(false);
  });

  it('requires message text or an image', () => {
    expect(messageSchema.safeParse({ body: null, imagePath: null }).success).toBe(false);
    expect(messageSchema.safeParse({ body: 'Halló', imagePath: null }).success).toBe(true);
  });
});
