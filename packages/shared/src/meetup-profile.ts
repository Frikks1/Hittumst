import { profileGenderSchema, diagnosisIdSchema, normalizeGender } from './discovery';
import { z } from 'zod';
import { identitySchema } from './validation';

const age = z.number().int().min(18).max(120);
const limit = z.number().int().min(0).max(1000);
export const meetupEventProfileSchema = z.object({
  audienceGenders: z.array(profileGenderSchema).max(5).default([]),
  requiredDiagnosisIds: z.array(diagnosisIdSchema).max(3).default([]),
  customTags: z.array(z.string().trim().min(1).max(40)).max(20)
    .refine(tags => new Set(tags.map(tag => tag.toLocaleLowerCase())).size === tags.length, 'Duplicate tags'),
  rules: z.string().trim().max(4000),
  prerequisites: z.string().trim().max(4000),
  sections: z.array(z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(4000) }).strict()).max(6),
  joinMode: z.enum(['public', 'request', 'invite']),
  minAge: age,
  maxAge: age.nullable(),
  ageLimits: z.array(z.object({ minAge: age, maxAge: age, maxRsvp: limit }).strict()
    .refine(rule => rule.maxAge >= rule.minAge, 'Invalid age range')).max(12),
  genderLimits: z.array(z.object({ gender: identitySchema, maxRsvp: limit }).strict()).max(7)
    .refine(rules => new Set(rules.map(rule => rule.gender)).size === rules.length, 'Duplicate gender rule'),
}).strict().refine(profile => profile.maxAge === null || profile.maxAge >= profile.minAge, 'Invalid age range');
export type MeetupEventProfile = z.infer<typeof meetupEventProfileSchema>;
export function defaultMeetupEventProfile(accessMode: 'open' | 'private' = 'private'): MeetupEventProfile {
  return { audienceGenders: [], requiredDiagnosisIds: [], customTags: [], rules: '', prerequisites: '', sections: [], joinMode: accessMode === 'open' ? 'public' : 'request', minAge: 18, maxAge: null, ageLimits: [], genderLimits: [] };
}

/** Multiple identity labels and overlapping age bands must satisfy every matching rule. */
export function meetupEligibility(profile: MeetupEventProfile, person: { age: number | null; identities: string[]; approvedDiagnosisIds?: string[] },
  attendees: { age: number | null; identities: string[] }[] = []): boolean {
  if (profile.requiredDiagnosisIds.length && !profile.requiredDiagnosisIds.some(id => person.approvedDiagnosisIds?.includes(id))) return false;
  if (profile.audienceGenders.length && !person.identities.some(id => { const gender = normalizeGender(id); return gender !== null && profile.audienceGenders.includes(gender); })) return false;
  if (person.age === null || person.age < profile.minAge || (profile.maxAge !== null && person.age > profile.maxAge)) return false;
  if (profile.genderLimits.length && !person.identities.length) return false;
  return profile.ageLimits.every(rule => person.age! < rule.minAge || person.age! > rule.maxAge
    || attendees.filter(p => p.age !== null && p.age >= rule.minAge && p.age <= rule.maxAge).length < rule.maxRsvp)
    && profile.genderLimits.every(rule => !person.identities.includes(rule.gender)
      || attendees.filter(p => p.identities.includes(rule.gender)).length < rule.maxRsvp);
}

export const meetupMediaSchema = z.object({
  id: z.string(), kind: z.enum(['photo', 'video']), url: z.string(), position: z.number().int(),
});
export type MeetupMedia = z.infer<typeof meetupMediaSchema>;
export const meetupReviewSchema = z.object({
  id: z.string(), authorId: z.string(), authorName: z.string(), rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(3).max(2000), createdAt: z.string(),
});
export type MeetupReview = z.infer<typeof meetupReviewSchema>;
export const meetupReviewInputSchema = meetupReviewSchema.pick({ rating: true, body: true });
