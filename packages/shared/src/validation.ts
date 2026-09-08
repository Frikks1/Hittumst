import { z } from 'zod';

export const localeSchema = z.enum(['is', 'en']);
export const identitySchema = z.enum([
  'man',
  'woman',
  'nonbinary',
  'trans_man',
  'trans_woman',
  'genderqueer',
  'self_described',
]);
export const intentSchema = z.enum([
  'chat',
  'friends',
  'dates',
  'relationship',
  'networking',
  'right_now',
]);
export const regionSchema = z.enum([
  'capital',
  'south',
  'west',
  'westfjords',
  'northwest',
  'northeast',
  'east',
  'southwest',
]);

export const onboardingSchema = z.object({
  locale: localeSchema,
  dateOfBirth: z.iso.date(),
  termsAcceptedAt: z.iso.datetime(),
  privacyAcceptedAt: z.iso.datetime(),
  guidelinesAcceptedAt: z.iso.datetime(),
  sensitiveDataConsentAt: z.iso.datetime(),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  dateOfBirth: z.iso.date(),
  pronouns: z.string().trim().max(40).nullable().optional(),
  identity: identitySchema,
  identityDescription: z.string().trim().max(60).nullable().optional(),
  intents: z.array(intentSchema).min(1).max(6),
  bio: z.string().trim().max(500).nullable().optional(),
  region: regionSchema,
});

export const discoveryFiltersSchema = z
  .object({
    ageMin: z.number().int().min(18).max(99),
    ageMax: z.number().int().min(18).max(99),
    identities: z.array(identitySchema).max(7).default([]),
    intents: z.array(intentSchema).max(6).default([]),
    onlineOnly: z.boolean().default(false),
  })
  .refine((value) => value.ageMin <= value.ageMax, {
    message: 'Minimum age must not exceed maximum age',
    path: ['ageMin'],
  });

export const messageSchema = z
  .object({
    body: z.string().trim().max(2_000).nullable(),
    imagePath: z.string().max(500).nullable(),
  })
  .refine((value) => Boolean(value.body || value.imagePath), {
    message: 'A message needs text or an image',
  });

export const reportSchema = z.object({
  reportedUserId: z.uuid(),
  conversationId: z.uuid().nullable().optional(),
  messageId: z.uuid().nullable().optional(),
  reason: z.enum([
    'harassment',
    'hate',
    'impersonation',
    'spam',
    'underage',
    'non_consensual_intimate_image',
    'threat',
    'other',
  ]),
  details: z.string().trim().max(1_000).nullable().optional(),
});

export function calculateAge(dateOfBirth: string, now = new Date()): number {
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  if (!year || !month || !day) return Number.NaN;
  let age = now.getUTCFullYear() - year;
  const birthdayPassed =
    now.getUTCMonth() + 1 > month ||
    (now.getUTCMonth() + 1 === month && now.getUTCDate() >= day);
  if (!birthdayPassed) age -= 1;
  return age;
}

export function isAdult(dateOfBirth: string, now = new Date()): boolean {
  return calculateAge(dateOfBirth, now) >= 18;
}
