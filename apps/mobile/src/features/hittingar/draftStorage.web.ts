// Browser storage is deliberately avoided because an incomplete protected
// meetup may contain an exact address. This scoped, in-memory cache survives
// navigation within the current page; once the form is complete, the normal
// authenticated draft API is authoritative.
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
