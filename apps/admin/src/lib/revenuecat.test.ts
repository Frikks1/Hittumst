import { createHmac } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { verifyRevenueCat, revenueEventSchema } from './revenuecat';
describe('RevenueCat boundary', () => {
  it('rejects changed bodies, invalid signatures and stale deliveries', () => {
    const secret = 'test-secret';
    const raw = '{"event":{}}';
    const stamp = 100000;
    const digest = createHmac('sha256', secret).update(`${stamp}.${raw}`).digest('hex');
    const signature = `t=${stamp},v1=${digest}`;
    expect(verifyRevenueCat(raw, signature, secret, stamp * 1000)).toBe(true);
    expect(verifyRevenueCat(raw + ' ', signature, secret, stamp * 1000)).toBe(false);
    expect(verifyRevenueCat(raw, signature, secret, (stamp + 301) * 1000)).toBe(false);
    expect(verifyRevenueCat(raw, 't=0,v1=x', secret)).toBe(false);
  });
  it('never accepts production receipts into the sandbox', () =>
    expect(revenueEventSchema.safeParse({ event: { environment: 'PRODUCTION' } }).success).toBe(
      false,
    ));
});
