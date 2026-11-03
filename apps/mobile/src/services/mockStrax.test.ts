import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
import { hittingarFeature } from '@/features/hittingar/config';
import { defaultFilters } from '@/types/domain';
import { getDemoStraxApi } from './straxDemo';
import { MockRummalApi } from './mockApi';

const enabled = hittingarFeature.enabled;
afterEach(() => { hittingarFeature.enabled = enabled; vi.restoreAllMocks(); });
describe('demo Strax profile enrichment', () => {
  it('uses one shared service for grid badges, details and group shares', async () => {
    hittingarFeature.enabled = true;
    const api = new MockRummalApi(); const strax = getDemoStraxApi(api);
    const page = await api.discover(defaultFilters);
    expect(page.items.find(item => item.id === 'p-bjarni')?.activeStrax?.title).toBe('Kaffi og spjall núna?');
    const detail = await api.getProfile('p-bjarni'); expect(detail.activeStrax?.id).toBe(page.items.find(item => item.id === 'p-bjarni')?.activeStrax?.id);
    const badge = detail.activeStrax!; expect((await strax.get(badge.id)).host.id).toBe('p-bjarni');
    expect(badge.receivedAt).toBeGreaterThanOrEqual(0);
    await api.block('p-bjarni'); expect((await strax.badges(['p-bjarni'])).items).toHaveLength(0);
    const groupId = await api.createGroup('Game friends');
    const own = await strax.create({ title: 'One more gamer', description: 'DM me' });
    expect((await strax.share(own.id, { groupIds: [groupId] })).sent).toEqual([{ type: 'group', id: groupId }]);
    const messages = await api.listGroupMessages(groupId);
    expect(messages[0]?.strax).toEqual({ id: own.id, title: own.title, expiresAt: own.expiresAt });
    await strax.share(own.id, { groupIds: [groupId] });
    expect(await api.listGroupMessages(groupId)).toHaveLength(1);
  });
  it('keeps profile discovery usable when the supplemental feature fails or is disabled', async () => {
    const api = new MockRummalApi(); const lookup = vi.spyOn(getDemoStraxApi(api), 'badges').mockRejectedValue(new Error('temporary'));
    hittingarFeature.enabled = true;
    expect((await api.discover(defaultFilters)).items.length).toBeGreaterThan(0);
    expect((await api.getProfile('p-bjarni')).activeStrax).toBeNull();
    lookup.mockClear(); hittingarFeature.enabled = false; await api.discover(defaultFilters); await api.getProfile('p-bjarni'); expect(lookup).not.toHaveBeenCalled();
  });
});
