import { z } from 'zod';

export const tierIdSchema = z.enum(['plebbi', 'flottari_plebbi', 'plebba_kongur']);
export type TierId = z.infer<typeof tierIdSchema>;
export const TIER_IDS = tierIdSchema.options;
export const ALBUM_MAX_BYTES = 30 * 1024 * 1024;
export const ALBUM_VIDEO_MAX_MS = 15_000;
export const TIERS = {
  plebbi: {
    name: 'plebbi',
    priceIsk: 0,
    albums: 1,
    photos: 10,
    videos: 1,
    occurrences: 1,
    joins: 1,
    tokens: 0,
    tokenValueIsk: 0,
    hostBps: 2500,
    effects: false,
  },
  flottari_plebbi: {
    name: 'Flottari plebbi',
    priceIsk: 1995,
    albums: 3,
    photos: 10,
    videos: 2,
    occurrences: 5,
    joins: 5,
    tokens: 1,
    tokenValueIsk: 500,
    hostBps: 2500,
    effects: false,
  },
  plebba_kongur: {
    name: 'Plebba Kóngur',
    priceIsk: 4995,
    albums: 6,
    photos: 30,
    videos: 3,
    occurrences: 10,
    joins: 15,
    tokens: 2,
    tokenValueIsk: 500,
    hostBps: 2500,
    effects: true,
  },
} as const;

export const entitlementSchema = z.object({
  tier: tierIdSchema,
  paidUntil: z.string().nullable(),
  premiumMonths: z.number().int().nonnegative(),
  albumsUsed: z.number().int().nonnegative(),
  occurrencesUsed: z.number().int().nonnegative(),
  joinsUsed: z.number().int().nonnegative().default(0),
  joinsLimit: z.number().int().nonnegative().default(1),
  joinsRemaining: z.number().int().nonnegative().default(1),
  month: z.string(),
  purchasesEnabled: z.boolean(),
  moneyEnabled: z.boolean(),
  sandbox: z.boolean(),
});
export type Entitlement = z.infer<typeof entitlementSchema>;
export function monthInIceland(date: Date | string = new Date()): string {
  const value = new Date(date);
  if (!Number.isFinite(value.getTime())) throw new Error('invalid_date');
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Atlantic/Reykjavik',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(value);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}
export function withdrawalBadgeBps(tier: TierId, completedPremiumMonths: number): number {
  return tier === 'plebba_kongur'
    ? Math.min(750, Math.max(0, Math.floor(completedPremiumMonths)) * 100)
    : 0;
}
export function activeTier(tier: TierId, paidUntil: string | null, now = Date.now()): TierId {
  return tier !== 'plebbi' && paidUntil && Date.parse(paidUntil) > now ? tier : 'plebbi';
}
export function freeEntitlement(sandbox = false): Entitlement {
  return {
    tier: 'plebbi',
    paidUntil: null,
    premiumMonths: 0,
    albumsUsed: 0,
    occurrencesUsed: 0,
    joinsUsed: 0,
    joinsLimit: 1,
    joinsRemaining: 1,
    month: monthInIceland(),
    purchasesEnabled: false,
    moneyEnabled: false,
    sandbox,
  };
}
export function requireAlbumCapacity(
  tier: TierId,
  counts: { albums: number; photos?: number; videos?: number },
  kind: 'album' | 'image' | 'video',
) {
  const limits = TIERS[tier];
  if (kind === 'album' && counts.albums >= limits.albums) throw new Error('album_limit_reached');
  if (kind !== 'album' && counts.albums > limits.albums) throw new Error('album_downgrade_limit');
  if (kind === 'image' && (counts.photos ?? 0) >= limits.photos)
    throw new Error('album_photo_limit_reached');
  if (kind === 'video' && (counts.videos ?? 0) >= limits.videos)
    throw new Error('album_video_limit_reached');
}
export function requireAlbumMedia(kind: 'image' | 'video', bytes: number, durationMs?: number) {
  if (
    !Number.isInteger(bytes) ||
    bytes < 1 ||
    bytes > ALBUM_MAX_BYTES ||
    (kind === 'video' && (!durationMs || durationMs < 1 || durationMs > ALBUM_VIDEO_MAX_MS))
  )
    throw new Error('invalid_album_media');
}
