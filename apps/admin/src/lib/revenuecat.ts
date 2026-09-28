import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { TierId } from '@rummal/shared';

export function verifyRevenueCat(
  raw: string,
  signature: string | null,
  secret: string,
  now = Date.now(),
) {
  const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(signature ?? '');
  if (!match || Math.abs(now / 1000 - Number(match[1])) > 300) return false;
  return timingSafeEqual(
    createHmac('sha256', secret).update(`${match[1]}.${raw}`).digest(),
    Buffer.from(match[2]!, 'hex'),
  );
}
export const revenueEventSchema = z.object({
  event: z.object({
    id: z.string(),
    app_user_id: z.string().uuid(),
    environment: z.literal('SANDBOX'),
    type: z.string(),
    product_id: z.string(),
    transaction_id: z.string(),
    purchased_at_ms: z.number().int(),
    expiration_at_ms: z.number().int(),
    period_type: z.enum(['NORMAL', 'INTRO', 'TRIAL', 'PREPAID']).optional(),
    cancel_reason: z.string().optional(),
  }),
});
export function productTier(product: string): TierId {
  if (process.env.REVENUECAT_PLUS_PRODUCT && product === process.env.REVENUECAT_PLUS_PRODUCT)
    return 'flottari_plebbi';
  if (process.env.REVENUECAT_PREMIUM_PRODUCT && product === process.env.REVENUECAT_PREMIUM_PRODUCT)
    return 'plebba_kongur';
  throw new Error('unknown_product');
}
