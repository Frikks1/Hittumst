import { authStorage } from '@/services/secureStorage';
import { createOnboardingDraftStore } from './draftLifecycle';
const keyFor = (accountId: string) => `onboarding.local-draft.v1.${accountId}`;
const store = createOnboardingDraftStore({
  getItem: accountId => authStorage.getItem(keyFor(accountId)),
  setItem: (accountId, value) => authStorage.setItem(keyFor(accountId), value),
  removeItem: accountId => authStorage.removeItem(keyFor(accountId)),
});
export const onboardingDraftGeneration = store.generation;
export const getOnboardingLocalDraft = store.get;
export const setOnboardingLocalDraft = store.set;
export const clearOnboardingLocalDraft = store.clear;
