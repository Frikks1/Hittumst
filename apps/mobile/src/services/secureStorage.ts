import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK_SIZE = 1800;
const prefix = 'rummal.auth.';

function metaKey(key: string) { return `${prefix}${key}.meta`; }
function chunkKey(key: string, index: number) { return `${prefix}${key}.${index}`; }

async function secureStoreAvailable(): Promise<boolean> {
  return Platform.OS !== 'web' && await SecureStore.isAvailableAsync();
}

export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!(await secureStoreAvailable())) return AsyncStorage.getItem(key);
    const meta = await SecureStore.getItemAsync(metaKey(key));
    if (!meta) return null;
    const count = Number(meta);
    if (!Number.isInteger(count) || count < 1 || count > 100) return null;
    const chunks = await Promise.all(Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))));
    return chunks.some((value) => value === null) ? null : chunks.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    if (!(await secureStoreAvailable())) {
      await AsyncStorage.setItem(key, value);
      return;
    }
    const previousCount = Number(await SecureStore.getItemAsync(metaKey(key)) ?? 0);
    const chunks = Array.from({ length: Math.ceil(value.length / CHUNK_SIZE) }, (_, index) =>
      value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
    );
    await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)));
    await SecureStore.setItemAsync(metaKey(key), String(chunks.length));
    if (previousCount > chunks.length) {
      await Promise.all(Array.from({ length: previousCount - chunks.length }, (_, offset) =>
        SecureStore.deleteItemAsync(chunkKey(key, chunks.length + offset))
      ));
    }
  },
  async removeItem(key: string): Promise<void> {
    if (!(await secureStoreAvailable())) {
      await AsyncStorage.removeItem(key);
      return;
    }
    const count = Number(await SecureStore.getItemAsync(metaKey(key)) ?? 0);
    await Promise.all(Array.from({ length: Math.max(0, count) }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, index))));
    await SecureStore.deleteItemAsync(metaKey(key));
  }
};
