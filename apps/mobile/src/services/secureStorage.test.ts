import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ available: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn(), plainGet: vi.fn(), plainSet: vi.fn(), plainRemove: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('expo-secure-store', () => ({ isAvailableAsync: mocks.available, getItemAsync: mocks.get, setItemAsync: mocks.set, deleteItemAsync: mocks.remove }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: mocks.plainGet, setItem: mocks.plainSet, removeItem: mocks.plainRemove } }));
import { authStorage } from './secureStorage';
let data: Map<string, string>;
beforeEach(() => {
  vi.resetAllMocks(); data = new Map();
  mocks.available.mockResolvedValue(true); mocks.plainRemove.mockResolvedValue(undefined);
  mocks.get.mockImplementation(async key => data.get(key) ?? null);
  mocks.set.mockImplementation(async (key, value) => { data.set(key, value); });
  mocks.remove.mockImplementation(async key => { data.delete(key); });
});
describe('native auth session storage', () => {
  it('never downgrades native tokens to plaintext if the keystore is unavailable', async () => {
    mocks.available.mockResolvedValue(false);
    await expect(authStorage.setItem('session', 'secret')).rejects.toThrow('secure_auth_storage_unavailable');
    await expect(authStorage.getItem('session')).rejects.toThrow('secure_auth_storage_unavailable');
    expect(mocks.plainSet).not.toHaveBeenCalled(); expect(mocks.plainGet).not.toHaveBeenCalled();
  });
  it('round-trips Unicode using native-size chunks', async () => {
    const value = '🔐æ'.repeat(1500);
    await authStorage.setItem('session', value);
    await expect(authStorage.getItem('session')).resolves.toBe(value);
    for (const [key, part] of data) if (!key.endsWith('.meta')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(1800);
  });
  it('preserves the existing token when a refresh write fails midway', async () => {
    await authStorage.setItem('session', 'old token');
    let writes = 0;
    mocks.set.mockImplementation(async (key, value) => { if (++writes === 2) throw new Error('keystore full'); data.set(key, value); });
    await expect(authStorage.setItem('session', 'new'.repeat(500))).rejects.toThrow('keystore full');
    await expect(authStorage.getItem('session')).resolves.toBe('old token');
    expect(data.size).toBe(2);
  });
  it('serializes refresh and logout so a delayed refresh cannot restore a signed-out token', async () => {
    await Promise.all([authStorage.setItem('session', 'first'), authStorage.setItem('session', 'latest'), authStorage.removeItem('session')]);
    await expect(authStorage.getItem('session')).resolves.toBeNull();
    expect(data.size).toBe(0);
  });
  it('reads the previous chunk format and removes it after migration', async () => {
    data.set('rummal.auth.session.meta', '1'); data.set('rummal.auth.session.0', 'legacy');
    await expect(authStorage.getItem('session')).resolves.toBe('legacy');
    await authStorage.setItem('session', 'current');
    expect(data.has('rummal.auth.session.0')).toBe(false);
    await expect(authStorage.getItem('session')).resolves.toBe('current');
  });
  it('bounds cleanup of corrupt metadata', async () => {
    data.set('rummal.auth.session.meta', '999999999');
    await authStorage.removeItem('session');
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
});
