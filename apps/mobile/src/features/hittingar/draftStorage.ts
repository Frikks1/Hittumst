// Non-native/test fallback. Expo web resolves draftStorage.web.ts and native
// builds resolve draftStorage.native.ts.
const drafts = new Map<string, string>();

export async function getHittingarLocalDraft(ownerId: string): Promise<string | null> {
  return drafts.get(ownerId) ?? null;
}

export async function setHittingarLocalDraft(ownerId: string, value: string): Promise<void> {
  drafts.set(ownerId, value);
}

export async function clearHittingarLocalDraft(ownerId: string): Promise<void> {
  drafts.delete(ownerId);
}

export async function clearLegacyHittingarLocalDrafts(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const legacy = keys.filter((key) => key.startsWith('rummal.hittingar.draft.v1.'));
  if (legacy.length > 0) await AsyncStorage.multiRemove(legacy);
}
import AsyncStorage from '@react-native-async-storage/async-storage';
