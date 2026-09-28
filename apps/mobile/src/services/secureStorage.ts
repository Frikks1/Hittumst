import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const prefix = 'rummal.auth.';
const MAX_CHUNKS = 100;
// 450 Unicode code points occupy at most 1,800 UTF-8 bytes, below the native limit.
const CHUNK_CODE_POINTS = 450;
type Manifest = { count: number; generation?: string };
const operations = new Map<string, Promise<unknown>>();
function metaKey(key: string) { return `${prefix}${key}.meta`; }
function chunkKey(key: string, index: number, generation?: string) {
  return `${prefix}${key}.${generation ? `${generation}.` : ''}${index}`;
}
function manifest(raw: string | null): Manifest | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    const entry = typeof value === 'number' ? { count: value } : value as Partial<Manifest> | null;
    if (!entry || !Number.isInteger(entry.count) || entry.count! < 1 || entry.count! > MAX_CHUNKS) return null;
    if (entry.generation !== undefined && !/^[a-zA-Z0-9-]{1,64}$/.test(entry.generation)) return null;
    return entry as Manifest;
  } catch { return null; }
}
async function requireSecureStore() {
  if (Platform.OS !== 'web' && !(await SecureStore.isAvailableAsync())) throw new Error('secure_auth_storage_unavailable');
}
function serialized<T>(key: string, action: () => Promise<T>): Promise<T> {
  const operation = (operations.get(key) ?? Promise.resolve()).catch(() => undefined).then(action);
  operations.set(key, operation);
  void operation.finally(() => { if (operations.get(key) === operation) operations.delete(key); }).catch(() => undefined);
  return operation;
}
async function removeChunks(key: string, entry: Manifest | null) {
  if (entry) await Promise.all(Array.from({ length: entry.count }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, index, entry.generation))));
}

export const authStorage = {
  getItem(key: string): Promise<string | null> {
    return serialized(key, async () => {
      await requireSecureStore();
      if (Platform.OS === 'web') return AsyncStorage.getItem(key);
      const entry = manifest(await SecureStore.getItemAsync(metaKey(key)));
      if (!entry) return null;
      const chunks = await Promise.all(Array.from({ length: entry.count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index, entry.generation))));
      return chunks.some(value => value === null) ? null : chunks.join('');
    });
  },
  setItem(key: string, value: string): Promise<void> {
    return serialized(key, async () => {
      await requireSecureStore();
      if (Platform.OS === 'web') { await AsyncStorage.setItem(key, value); return; }
      const points = Array.from(value);
      const chunks = Array.from({ length: Math.max(1, Math.ceil(points.length / CHUNK_CODE_POINTS)) }, (_, index) => points.slice(index * CHUNK_CODE_POINTS, (index + 1) * CHUNK_CODE_POINTS).join(''));
      if (chunks.length > MAX_CHUNKS) throw new Error('auth_session_too_large');
      const previous = manifest(await SecureStore.getItemAsync(metaKey(key)));
      const next: Manifest = { generation: Crypto.randomUUID(), count: chunks.length };
      try {
        // Commit the new manifest only after every chunk is durably stored.
        // Failed refresh writes therefore preserve the previous complete session.
        for (const [index, chunk] of chunks.entries()) await SecureStore.setItemAsync(chunkKey(key, index, next.generation), chunk);
        await SecureStore.setItemAsync(metaKey(key), JSON.stringify(next));
      } catch (error) {
        await removeChunks(key, next).catch(() => undefined);
        throw error;
      }
      await removeChunks(key, previous).catch(() => undefined);
      await AsyncStorage.removeItem(key).catch(() => undefined);
    });
  },
  removeItem(key: string): Promise<void> {
    return serialized(key, async () => {
      await requireSecureStore();
      if (Platform.OS === 'web') { await AsyncStorage.removeItem(key); return; }
      const entry = manifest(await SecureStore.getItemAsync(metaKey(key)));
      await removeChunks(key, entry);
      await SecureStore.deleteItemAsync(metaKey(key));
      await AsyncStorage.removeItem(key);
    });
  },
};
