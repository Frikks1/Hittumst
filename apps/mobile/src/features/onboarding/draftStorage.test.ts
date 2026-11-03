import { describe, expect, it } from 'vitest';
import { clearOnboardingLocalDraft, getOnboardingLocalDraft, setOnboardingLocalDraft } from './draftStorage';

describe('session onboarding draft isolation', () => {
  it('never returns another member’s draft and clears the signed-out account', async () => {
    await setOnboardingLocalDraft('a', 'private profile');
    expect(await getOnboardingLocalDraft('b')).toBeNull();
    await setOnboardingLocalDraft('b', 'other profile');
    await clearOnboardingLocalDraft('a');
    expect(await getOnboardingLocalDraft('a')).toBeNull();
    expect(await getOnboardingLocalDraft('b')).toBe('other profile');
    await clearOnboardingLocalDraft('b');
  });
});
