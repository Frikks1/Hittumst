import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { authStorage } from '@/services/secureStorage';

export type ConversationPreference = { pinned?: boolean; archived?: boolean };
export type ConversationPreferences = Record<string, ConversationPreference>;
const webDrafts = new Map<string, Record<string, string>>();
const generations = new Map<string, number>();
const queues = new Map<string, Promise<unknown>>();
const listeners = new Set<(ownerId: string, kind: 'draft' | 'preferences') => void>();
const encodeKey = (value: string) => Array.from(value).map(char => char.codePointAt(0)!.toString(16)).join('-');
const draftIndexKey = (ownerId: string) => `chat.drafts.v1.${encodeKey(ownerId)}.index`;
const draftKey = (ownerId: string, id: string) => `chat.drafts.v1.${encodeKey(ownerId)}.${encodeKey(id)}`;
const preferencesKey = (ownerId: string) => `rummal.chat.preferences.v1.${encodeKey(ownerId)}`;
function serialize<T>(ownerId: string, work: () => Promise<T>): Promise<T> {
  const result = (queues.get(ownerId) ?? Promise.resolve()).catch(() => undefined).then(work);
  queues.set(ownerId, result);
  void result.finally(() => { if (queues.get(ownerId) === result) queues.delete(ownerId); }).catch(() => undefined);
  return result;
}
function changed(ownerId: string, kind: 'draft' | 'preferences') { listeners.forEach(listener => listener(ownerId, kind)); }
function parseIndex(raw: string | null): string[] {
  try { const value: unknown = JSON.parse(raw ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length < 200) : []; }
  catch { return []; }
}
export function chatAccountGeneration(ownerId: string) { return generations.get(ownerId) ?? 0; }
export function subscribeChatLocalState(listener: (ownerId: string, kind: 'draft' | 'preferences') => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function readChatDrafts(ownerId: string): Promise<Record<string, string>> {
  return serialize(ownerId, async () => {
    if (Platform.OS === 'web') return { ...webDrafts.get(ownerId) };
    const ids = parseIndex(await authStorage.getItem(draftIndexKey(ownerId)));
    const values = await Promise.all(ids.map(async id => [id, await authStorage.getItem(draftKey(ownerId, id))] as const));
    return Object.fromEntries(values.filter((entry): entry is readonly [string, string] => entry[1] !== null));
  });
}
export function saveChatDraft(ownerId: string, id: string, value: string, generation = chatAccountGeneration(ownerId)): Promise<void> {
  return serialize(ownerId, async () => {
    if (generation !== chatAccountGeneration(ownerId)) return;
    if (Platform.OS === 'web') {
      const drafts = webDrafts.get(ownerId) ?? {};
      if (value) drafts[id] = value; else delete drafts[id];
      webDrafts.set(ownerId, drafts); changed(ownerId, 'draft'); return;
    }
    const ids = parseIndex(await authStorage.getItem(draftIndexKey(ownerId)));
    if (value) {
      // Publish the index before writing so account cleanup can always locate a partial write.
      if (!ids.includes(id)) await authStorage.setItem(draftIndexKey(ownerId), JSON.stringify([...ids, id]));
      await authStorage.setItem(draftKey(ownerId, id), value);
    } else {
      await authStorage.removeItem(draftKey(ownerId, id));
      await authStorage.setItem(draftIndexKey(ownerId), JSON.stringify(ids.filter(entry => entry !== id)));
    }
    changed(ownerId, 'draft');
  });
}
/** Revokes pending writes before wiping private drafts during signout/account changes. */
export function clearChatLocalAccount(ownerId: string): Promise<void> {
  generations.set(ownerId, chatAccountGeneration(ownerId) + 1);
  return serialize(ownerId, async () => {
    webDrafts.delete(ownerId);
    if (Platform.OS !== 'web') {
      const ids = parseIndex(await authStorage.getItem(draftIndexKey(ownerId)));
      await Promise.all(ids.map(id => authStorage.removeItem(draftKey(ownerId, id))));
      await authStorage.removeItem(draftIndexKey(ownerId));
    }
    changed(ownerId, 'draft');
  });
}
export async function readConversationPreferences(ownerId: string): Promise<ConversationPreferences> {
  const raw = await AsyncStorage.getItem(preferencesKey(ownerId));
  try {
    const value: unknown = JSON.parse(raw ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry && typeof entry === 'object').map(([id, entry]) => [id, { pinned: (entry as ConversationPreference).pinned === true, archived: (entry as ConversationPreference).archived === true }]));
  } catch { return {}; }
}
export function setConversationPreference(ownerId: string, id: string, patch: ConversationPreference): Promise<ConversationPreferences> {
  return serialize(ownerId, async () => {
    const preferences = await readConversationPreferences(ownerId);
    preferences[id] = { ...preferences[id], ...patch };
    await AsyncStorage.setItem(preferencesKey(ownerId), JSON.stringify(preferences));
    changed(ownerId, 'preferences'); return preferences;
  });
}
