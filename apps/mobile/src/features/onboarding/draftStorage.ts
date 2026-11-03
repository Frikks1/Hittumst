// Browser drafts remain in memory for this page session. Native builds resolve
// draftStorage.native.ts so sensitive profile fields use OS-protected storage.
import { createOnboardingDraftStore } from './draftLifecycle';
const drafts = new Map<string, string>();
const store = createOnboardingDraftStore({
  getItem: async accountId => drafts.get(accountId) ?? null,
  setItem: async (accountId, value) => { drafts.set(accountId, value); },
  removeItem: async accountId => { drafts.delete(accountId); },
});
export const onboardingDraftGeneration = store.generation;
export const getOnboardingLocalDraft = store.get;
export const setOnboardingLocalDraft = store.set;
export const clearOnboardingLocalDraft = store.clear;
