import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultFilters } from '@/types/domain';
import { MockRummalApi } from './mockApi';
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
afterEach(() => vi.useRealTimers());

describe('daily discovery selection', () => {
  it('keeps a selection across reloads and filters, and rotates only once a day', async () => {
    const api = new MockRummalApi();
    const first = await api.discover(defaultFilters);
    expect(first.items.length).toBeLessThanOrEqual(20);
    expect(await api.discover(defaultFilters)).toEqual(first);
    expect((await api.discover({ ...defaultFilters, tags: ['gaming'] })).items.every(p => first.items.some(x => x.id === p.id))).toBe(true);
    await api.discoveryAllowance(true);
    const refreshed = await api.discover(defaultFilters);
    expect(refreshed.items.every(p => !first.items.some(x => x.id === p.id))).toBe(true);
    await expect(api.discoveryAllowance(true)).rejects.toThrow('daily_discovery_refresh_unavailable');
    expect((await api.discoveryAllowance()).canRefresh).toBe(false);
  });
  it('does not spend refreshes on an empty filtered view and verifies paid limits', async () => {
    const api = new MockRummalApi();
    expect((await api.discover({ ...defaultFilters, ageMin: 99 })).items).toEqual([]);
    expect((await api.discover(defaultFilters)).items.length).toBeGreaterThan(0);
    expect((await api.discoveryAllowance()).limit).toBe(20);
    await api.setSandboxTier('flottari_plebbi');
    expect((await api.discoveryAllowance()).limit).toBe(60);
    await api.setSandboxTier('plebba_kongur');
    expect((await api.discoveryAllowance()).limit).toBe(120);
    await api.setSandboxTier('plebbi');
    expect((await api.discoveryAllowance()).limit).toBe(20);
  });
  it('re-enables one refresh at the next Iceland calendar day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T23:59:00.000Z'));
    const api = new MockRummalApi();
    await api.discover(defaultFilters);
    await api.discoveryAllowance(true);
    await api.discover(defaultFilters);
    expect(await api.discoveryAllowance()).toEqual({ limit: 20, canRefresh: false, nextRefreshAt: '2026-10-02T00:00:00.000Z' });
    vi.setSystemTime(new Date('2026-10-02T00:00:00.000Z'));
    expect((await api.discoveryAllowance()).canRefresh).toBe(true);
    await api.discoveryAllowance(true);
    await expect(api.discoveryAllowance(true)).rejects.toThrow('daily_discovery_refresh_unavailable');
  });
});
