import { describe, expect, it } from 'vitest';
import { profileOrientationTagsSchema, requiredSexualOrientationSelectionSchema, sexualOrientationSelectionSchema } from './profile-orientation';
import { identitySchema } from './validation';
import { profileGenderSchema } from './discovery';

describe('profile sexual orientation', () => {
  it.each(['not_applicable', 'prefer_not_to_say'])('accepts %s as the sole registration answer', value => {
    expect(requiredSexualOrientationSelectionSchema.parse([value])).toEqual([value]);
    expect(profileOrientationTagsSchema.parse([value])).toEqual([value]);
  });
  it.each([
    ['prefer_not_to_say', 'gay'], ['not_applicable', 'trans'],
    ['prefer_not_to_say', 'not_applicable'], ['not_applicable', 'not_applicable'],
  ])('rejects conflicting privacy answers %j', (...values) => {
    for (const schema of [sexualOrientationSelectionSchema, profileOrientationTagsSchema]) {
      expect(schema.safeParse(values).success).toBe(false);
    }
  });
  it('preserves legacy profile tags without broadening new registration choices', () => {
    expect(profileOrientationTagsSchema.parse(['trans_man', 'self_described'])).toEqual(['trans_man', 'self_described']);
    expect(requiredSexualOrientationSelectionSchema.safeParse(['trans_man']).success).toBe(false);
    expect(requiredSexualOrientationSelectionSchema.parse(['bi', 'queer'])).toEqual(['bi', 'queer']);
    expect(requiredSexualOrientationSelectionSchema.safeParse([]).success).toBe(false);
    expect(sexualOrientationSelectionSchema.parse([])).toEqual([]);
  });
  it('keeps privacy answers out of gender and meetup audience enums', () => {
    for (const value of ['not_applicable', 'prefer_not_to_say']) {
      expect(identitySchema.safeParse(value).success).toBe(false);
      expect(profileGenderSchema.safeParse(value).success).toBe(false);
    }
  });
});
