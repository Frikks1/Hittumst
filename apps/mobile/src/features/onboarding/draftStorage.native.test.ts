import { beforeEach, describe, expect, it, vi } from 'vitest';
const secure = vi.hoisted(() => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }));
vi.mock('@/services/secureStorage', () => ({ authStorage: secure }));
import { clearOnboardingLocalDraft, getOnboardingLocalDraft, setOnboardingLocalDraft } from './draftStorage.native';
beforeEach(() => vi.resetAllMocks());
describe('native onboarding recovery privacy', () => {
  it('stores, restores and clears sensitive fields through account-scoped secure storage', async () => {
    secure.getItem.mockResolvedValue('encrypted form');
    await setOnboardingLocalDraft('member-a', 'sensitive profile');
    expect(secure.setItem).toHaveBeenCalledWith('onboarding.local-draft.v1.member-a', 'sensitive profile');
    await expect(getOnboardingLocalDraft('member-b')).resolves.toBe('encrypted form');
    expect(secure.getItem).toHaveBeenCalledWith('onboarding.local-draft.v1.member-b');
    await clearOnboardingLocalDraft('member-a');
    expect(secure.removeItem).toHaveBeenCalledWith('onboarding.local-draft.v1.member-a');
  });
  it('propagates keystore failure without downgrading the draft to plain device storage', async () => {
    secure.setItem.mockRejectedValue(Error('keystore unavailable'));
    await expect(setOnboardingLocalDraft('a', 'private')).rejects.toThrow('keystore unavailable');
  });
});
