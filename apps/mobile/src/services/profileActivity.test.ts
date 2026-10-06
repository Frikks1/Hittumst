import { describe, expect, it, vi } from 'vitest';
import { MockRummalApi } from './mockApi';

vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

describe('demo profile interest', () => {
  it('shows deduplicated views and taps newest first with repeat counts', async () => {
    const api = new MockRummalApi();
    const views = await api.listProfileActivity('views');
    const taps = await api.listProfileActivity('taps');
    expect(views.items.length).toBeGreaterThan(0);
    expect(new Set(views.items.map(item => item.profile.id)).size).toBe(views.items.length);
    expect(views.items[0]?.count).toBe(3);
    expect(taps.items).toHaveLength(3);
    expect(views.items.map(item => item.occurredAt)).toEqual(views.items.map(item => item.occurredAt).sort().reverse());
  });

  it('does not turn outgoing actions into incoming interest', async () => {
    const api = new MockRummalApi();
    const before = await api.listProfileActivity('views');
    await api.recordProfileView('p-bjarni');
    await api.recordProfileView('p-bjarni');
    expect(await api.listProfileActivity('views')).toEqual(before);
    await api.sendProfileTap('p-bjarni');
    await expect(api.sendProfileTap('p-bjarni')).rejects.toThrow('tap_cooldown');
  });

  it('coalesces views and counts a later visit in the owner export', async () => {
    const api = new MockRummalApi();
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      await api.recordProfileView('p-bjarni');
      await api.recordProfileView('p-bjarni');
      let account = JSON.parse(await api.requestExport());
      expect(account.profileActivity.find((item: { actorId: string }) => item.actorId === 'demo-me').count).toBe(1);
      clock.mockReturnValue(now + 31 * 60_000);
      await api.recordProfileView('p-bjarni');
      account = JSON.parse(await api.requestExport());
      expect(account.profileActivity.find((item: { actorId: string }) => item.actorId === 'demo-me').count).toBe(2);
    } finally { clock.mockRestore(); }
  });

  it('keeps the hourly tap limit when the sender blocks and unblocks recipients', async () => {
    vi.useFakeTimers();
    try {
      const api = new MockRummalApi();
      for (let count = 0; count < 30; count += 1) {
        const tap = api.sendProfileTap('p-bjarni');
        await vi.runAllTimersAsync(); await tap;
        const block = api.block('p-bjarni');
        await vi.runAllTimersAsync(); await block;
        const unblock = api.unblock('p-bjarni');
        await vi.runAllTimersAsync(); await unblock;
      }
      const rejected = expect(api.sendProfileTap('p-elias')).rejects.toThrow('tap_rate_limited');
      await vi.runAllTimersAsync(); await rejected;
    } finally { vi.useRealTimers(); }
  });

  it('enforces self, block, hidden sender, and location privacy', async () => {
    const api = new MockRummalApi();
    await expect(api.sendProfileTap('demo-me')).rejects.toThrow('profile_unavailable');
    await api.block('p-bjarni');
    expect((await api.listProfileActivity('views')).items.some(item => item.profile.id === 'p-bjarni')).toBe(false);
    await expect(api.recordProfileView('p-bjarni')).rejects.toThrow('profile_unavailable');
    await expect(api.sendProfileTap('p-bjarni')).rejects.toThrow('profile_unavailable');
    await api.unblock('p-bjarni');
    expect((await api.listProfileActivity('taps')).items.some(item => item.profile.id === 'p-bjarni')).toBe(false);
    await api.updateProfile({ isHidden: true });
    await expect(api.recordProfileView('p-elias')).resolves.toBeUndefined();
    await expect(api.sendProfileTap('p-elias')).rejects.toThrow('profile_unavailable');
    await api.updateProfile({ isHidden: false, locationSharing: false });
    await expect(api.listProfileActivity('views')).rejects.toThrow('profile_access_required');
    await expect(api.sendProfileTap('p-elias')).rejects.toThrow('profile_access_required');
  });
});
