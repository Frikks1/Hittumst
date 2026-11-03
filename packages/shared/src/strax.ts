import { z } from 'zod';

export const STRAX_LIFETIME_MS = 4 * 60 * 60 * 1000;
const timestamp = z.iso.datetime({ offset: true });
const nullableText = (maximum: number) => z.string().trim().max(maximum).transform(value => value || null).nullable().default(null);
export const straxJoinModeSchema = z.enum(['application', 'open']);
export const straxCreateInputSchema = z.object({
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(600),
  locationText: nullableText(200), address: nullableText(300), requirements: nullableText(600),
  spacesNeeded: z.number().int().min(1).max(50).nullable().default(null),
  joinMode: straxJoinModeSchema.default('application'),
  venueMode: z.enum(['in_person', 'online']).default('in_person'),
}).strict();
export type StraxCreateInput = z.input<typeof straxCreateInputSchema>;
export type StraxCreate = z.output<typeof straxCreateInputSchema>;
export const straxDetailSchema = z.object({
  id: z.string().min(1),
  host: z.object({ id: z.string().min(1), displayName: z.string().min(1), avatarPath: z.string().optional(), avatarUrl: z.string().optional() }),
  title: z.string().min(1).max(60), description: z.string().min(1).max(600),
  locationText: nullableText(200), address: nullableText(300), requirements: nullableText(600),
  spacesNeeded: z.number().int().min(1).max(50).nullable(),
  joinMode: straxJoinModeSchema, venueMode: z.enum(['in_person', 'online']),
  participantCount: z.number().int().nonnegative(),
  createdAt: timestamp, expiresAt: timestamp, serverNow: timestamp,
  status: z.enum(['active', 'closed', 'expired']),
  viewerState: z.enum(['host', 'none', 'pending', 'joined', 'declined']),
  viewerCapabilities: z.object({ canJoin: z.boolean(), canApply: z.boolean(), canLeave: z.boolean(), canWithdraw: z.boolean(), canManage: z.boolean() }),
  photoPath: z.string().nullable(), photoStatus: z.enum(['none', 'pending', 'approved', 'rejected']), photoUrl: z.string().optional(),
}).superRefine((value, context) => {
  if (Date.parse(value.expiresAt) - Date.parse(value.createdAt) !== STRAX_LIFETIME_MS)
    context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Strax must expire exactly four hours after publication' });
});
export type StraxDetail = z.infer<typeof straxDetailSchema>;
export const straxListSchema = z.object({ items: z.array(straxDetailSchema), serverNow: timestamp });
export type StraxList = z.infer<typeof straxListSchema>;
export const straxSummarySchema = z.object({ count: z.number().int().nonnegative(), nextExpiryAt: timestamp.nullable(), serverNow: timestamp });
export type StraxSummary = z.infer<typeof straxSummarySchema>;
export const straxBadgeSchema = z.object({ profileId: z.string().min(1), activityId: z.string().min(1), title: z.string().min(1).max(60), expiresAt: timestamp });
export type StraxBadge = z.infer<typeof straxBadgeSchema>;
export const straxBadgesSchema = z.object({ items: z.array(straxBadgeSchema), serverNow: timestamp });
export type StraxBadges = z.infer<typeof straxBadgesSchema>;
export const straxRosterEntrySchema = z.object({
  profileId: z.string().min(1), displayName: z.string().min(1),
  status: z.enum(['pending', 'joined', 'declined', 'left', 'withdrawn', 'removed']),
  introduction: z.string().max(1000), createdAt: timestamp, updatedAt: timestamp,
});
export type StraxRosterEntry = z.infer<typeof straxRosterEntrySchema>;
export const straxShareInputSchema = z.object({
  allFriends: z.boolean().default(false), friendIds: z.array(z.string().min(1)).max(500).default([]), groupIds: z.array(z.string().min(1)).max(50).default([]),
}).strict();
export type StraxShareInput = z.input<typeof straxShareInputSchema>;
const destination = z.object({ type: z.enum(['friend', 'group']), id: z.string().min(1) });
export const straxShareResultSchema = z.object({ sent: z.array(destination), failed: z.array(destination.extend({ reason: z.string().min(1) })) });
export type StraxShareResult = z.infer<typeof straxShareResultSchema>;
export const straxMessageReferenceSchema = z.object({ id: z.string().min(1), title: z.string().min(1).max(60), expiresAt: timestamp });
export type StraxMessageReference = z.infer<typeof straxMessageReferenceSchema>;
export const straxNotificationSchema = z.object({
  id: z.string().min(1), activityId: z.string().min(1), title: z.string().min(1).max(60),
  kind: z.enum(['invited', 'application_received', 'approved', 'declined', 'joined', 'closed', 'removed']),
  createdAt: timestamp, readAt: timestamp.nullable(),
});
export type StraxNotification = z.infer<typeof straxNotificationSchema>;

/** Derive a moving clock from a server snapshot, including devices with incorrect time. */
export function straxServerNow(serverNow: string, receivedAt: number, now = Date.now()): number {
  return Date.parse(serverNow) + Math.max(0, now - receivedAt);
}
export function straxIsActive(item: Pick<StraxDetail, 'status' | 'expiresAt'>, now: number): boolean {
  return item.status === 'active' && Date.parse(item.expiresAt) > now;
}
