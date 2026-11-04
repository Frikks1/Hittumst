import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
import { MockRummalApi } from './mockApi';
import { FREE_MEMBER_LIMITS, meetupDraftInputSchema } from '@rummal/shared';
describe('free app', () => {
 it('has free access without a store identity', async () => {
  const api = new MockRummalApi(); const access = await api.getEntitlement();
  expect(access).toMatchObject({ tier: 'plebbi', paidUntil: null, moneyEnabled: false, purchasesEnabled: false, sandbox: false, joinsLimit: FREE_MEMBER_LIMITS.joins });
  expect((await api.createAlbum('Free album')).name).toBe('Free album');
  await expect(api.getWallet()).rejects.toThrow('money_features_removed');
  await expect(api.setSandboxTier('plebba_kongur')).rejects.toThrow('money_features_removed');
  await expect(api.walletCommand({ action: 'purchase', amount: 1000, requestId: crypto.randomUUID() })).rejects.toThrow('money_features_removed');
 });
 it('rejects nonzero fee input at the shared boundary', () => {
  expect(meetupDraftInputSchema.shape.feeIsk.safeParse(1000).success).toBe(false);
  expect(meetupDraftInputSchema.shape.feeIsk.safeParse(0).success).toBe(true);
 });
});
