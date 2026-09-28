import { z } from 'zod';
export const profileGenderSchema = z.enum([
  'man',
  'woman',
  'nonbinary',
  'genderqueer',
  'self_described',
]);
export type ProfileGender = z.infer<typeof profileGenderSchema>;
export const diagnosisIdSchema = z.enum(['autism', 'adhd', 'schizophrenia']);
export type DiagnosisId = z.infer<typeof diagnosisIdSchema>;
export const activityFilterSchema = z.enum(['all', 'now', 'recent', 'month']);
export const socialFilterSchema = z.enum(['all', 'favorites', 'friends', 'friends_of_friends']);
export const discoveryExtensions = {
  radiusKm: z.number().int().min(1).max(500).nullable().default(null),
  genders: z.array(profileGenderSchema).max(5).default([]),
  social: socialFilterSchema.default('all'),
  diagnosisIds: z.array(diagnosisIdSchema).max(3).default([]),
};
export const discoveryExtensionSchema = z.object(discoveryExtensions);
export type DiscoveryExtensions = z.infer<typeof discoveryExtensionSchema>;
export const defaultDiscoveryExtensions: DiscoveryExtensions = {
  radiusKm: null,
  genders: [],
  social: 'all',
  diagnosisIds: [],
};
export const diagnosisStatusSchema = z.enum([
  'pending',
  'more_information',
  'approved',
  'rejected',
  'withdrawn',
  'revoked',
  'expired',
]);
export const diagnosisSubmissionSchema = z.object({
  diagnosisId: diagnosisIdSchema,
  legalName: z.string().trim().min(2).max(160),
  consent: z.literal(true),
});
export const diagnosisRecordSchema = z.object({
  id: z.string().uuid(),
  diagnosisId: diagnosisIdSchema,
  status: diagnosisStatusSchema,
  discoverable: z.boolean(),
  createdAt: z.string(),
  reason: z.string().nullable(),
});
export type DiagnosisRecord = z.infer<typeof diagnosisRecordSchema>;
export function normalizeGender(value: string | null | undefined): ProfileGender | null {
  if (value === 'trans_man') return 'man';
  if (value === 'trans_woman') return 'woman';
  const result = profileGenderSchema.safeParse(value);
  return result.success ? result.data : null;
}
/** Hidden presence has a fixed neutral rank, independent of the private timestamp. */
export function activityRank(lastActive: number | null, visible: boolean, now: number): number {
  if (!visible || lastActive === null) return 2;
  const elapsed = Math.max(0, now - lastActive);
  return elapsed < 300_000 ? 0 : elapsed < 7 * 86400_000 ? 1 : elapsed < 30 * 86400_000 ? 2 : 3;
}
export function matchesActivity(
  filter: z.infer<typeof activityFilterSchema>,
  lastActive: number | null,
  visible: boolean,
  now: number,
): boolean {
  if (filter === 'all') return true;
  if (!visible || lastActive === null) return false;
  return (
    now - lastActive <
    (filter === 'now' ? 300_000 : filter === 'recent' ? 7 * 86400_000 : 30 * 86400_000)
  );
}
