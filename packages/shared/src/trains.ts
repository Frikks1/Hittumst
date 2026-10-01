import { z } from 'zod';

export const DISCOVERY_PROFILE_LIMITS = { plebbi: 20, flottari_plebbi: 60, plebba_kongur: 120 } as const;
export const discoveryAllowanceSchema = z.object({ limit: z.number().int().positive(), canRefresh: z.boolean(), nextRefreshAt: z.string() });
export type DiscoveryAllowance = z.infer<typeof discoveryAllowanceSchema>;
export const trainSettingsSchema = z.object({
  name: z.string().trim().min(1).max(80), bio: z.string().trim().max(500).default(''),
  symbol: z.string().trim().min(1).max(16).default('🚂'), visibility: z.enum(['private', 'public']).default('private'),
});
export type TrainSettings = z.infer<typeof trainSettingsSchema>;
export const trainSchema = trainSettingsSchema.extend({ id: z.string(), role: z.string().nullable(), membershipStatus: z.string().nullable(), memberCount: z.number(), status: z.string() });
export type Train = z.infer<typeof trainSchema>;
export const trainPlanSchema = z.object({ meetupId: z.string(), title: z.string(), note: z.string(), recommendedBy: z.string(), going: z.array(z.string()), createdAt: z.string() });
export const trainLocationSchema = z.object({ profileId: z.string(), displayName: z.string(), latitude: z.number(), longitude: z.number(), expiresAt: z.string(), updatedAt: z.string() });
export const groupMediaSchema = z.object({ id: z.string(), kind: z.enum(['image', 'video']), path: z.string(), caption: z.string(), cover: z.boolean(), senderId: z.string(), createdAt: z.string(), url: z.string().optional() });
export type GroupMedia = z.infer<typeof groupMediaSchema>;
export const trainPoolSchema = z.object({ enabled: z.boolean(), amountPerEvent: z.number().int().nonnegative(), monthlyCap: z.number().int().nonnegative(), balance: z.number().int().nonnegative(), sandbox: z.boolean(), allocations: z.array(z.object({ meetupId: z.string(), amount: z.number() })) });
export const trainDetailSchema = z.object({ train: trainSchema, plans: z.array(trainPlanSchema), locations: z.array(trainLocationSchema), pool: trainPoolSchema });
export type TrainDetail = z.infer<typeof trainDetailSchema>;
export function locationShareInput(latitude: number, longitude: number, minutes: number, recipients: string[] | null) {
  return z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), minutes: z.union([z.literal(15), z.literal(60)]), recipients: z.array(z.string().min(1)).min(1).max(100).nullable() }).parse({ latitude, longitude, minutes, recipients });
}

/** A pool allocation is once per gathering, never once per attending member. */
export function allocateTrainPool(pool: TrainDetail['pool'], meetupId: string, monthlySpent: number): TrainDetail['pool'] {
  if (!pool.enabled || pool.amountPerEvent <= 0 || pool.allocations.some(item => item.meetupId === meetupId)
    || pool.balance < pool.amountPerEvent || monthlySpent + pool.amountPerEvent > pool.monthlyCap) return pool;
  return { ...pool, balance: pool.balance - pool.amountPerEvent, allocations: [...pool.allocations, { meetupId, amount: pool.amountPerEvent }] };
}
