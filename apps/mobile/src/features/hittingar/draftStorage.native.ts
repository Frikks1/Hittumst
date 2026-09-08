import AsyncStorage from '@react-native-async-storage/async-storage';
import { authStorage } from '@/services/secureStorage';

const keyFor = (ownerId: string) => `hittingar.local-draft.v2.${ownerId}`;

/**
 * Incomplete drafts may contain a protected address and arrival instructions.
 * Native builds therefore use the chunked OS-protected storage adapter already
 * used for auth secrets, with a key scoped to the authenticated member.
 */
export function getHittingarLocalDraft(ownerId: string): Promise<string | null> {
  return authStorage.getItem(keyFor(ownerId));
}

export function setHittingarLocalDraft(ownerId: string, value: string): Promise<void> {
  return authStorage.setItem(keyFor(ownerId), value);
}

export function clearHittingarLocalDraft(ownerId: string): Promise<void> {
  return authStorage.removeItem(keyFor(ownerId));
}

export async function clearLegacyHittingarLocalDrafts(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const legacy = keys.filter((key) => key.startsWith('rummal.hittingar.draft.v1.'));
  if (legacy.length > 0) await AsyncStorage.multiRemove(legacy);
}
