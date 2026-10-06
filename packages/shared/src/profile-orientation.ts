import { z } from 'zod';

// Keep the existing profile choices for compatibility with saved profiles.
// Gender and meetup audience schemas are separate from these profile tags.
export const sexualOrientationSchema = z.enum([
  'gay', 'bi', 'queer', 'trans', 'nonbinary', 'lesbian',
  'not_applicable', 'prefer_not_to_say',
]);
export type SexualOrientation = z.infer<typeof sexualOrientationSchema>;

function exclusivePrivacyChoice(values: readonly string[]): boolean {
  return !values.some(value => value === 'not_applicable' || value === 'prefer_not_to_say') || values.length === 1;
}

export const sexualOrientationSelectionSchema = z.array(sexualOrientationSchema).max(10)
  .refine(exclusivePrivacyChoice, { message: 'orientation_privacy_choice_exclusive' });

export const requiredSexualOrientationSelectionSchema = z.array(sexualOrientationSchema).min(1).max(10)
  .refine(exclusivePrivacyChoice, { message: 'orientation_privacy_choice_exclusive' });

// Older profile APIs accepted arbitrary short identity tags. Existing tags may
// still be saved, but a privacy answer must always be the sole stored answer.
export const profileOrientationTagsSchema = z.array(z.string().min(1).max(40)).max(10)
  .refine(exclusivePrivacyChoice, { message: 'orientation_privacy_choice_exclusive' });
