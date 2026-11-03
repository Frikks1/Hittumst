import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
import { STRAX_LIFETIME_MS } from '@rummal/shared';
import { DemoStraxApi, getDemoStraxApi, type DemoStraxSource } from './straxDemo';

function fixture(seed = false) {
  let actor = { id: 'host', displayName: 'Aron' }; let clock = Date.parse('2026-10-13T23:00:00Z');
  const blocked: string[] = []; const send = vi.fn(async () => ({ id: 'message', groupId: 'group', senderId: 'host', senderName: 'Aron', body: 'Strax', createdAt: new Date(clock).toISOString() }));
  const source = { getOwnProfile: async () => actor, listBlocked: async () => blocked.map(id => ({ id })),
    listFriends: async () => [{ profileId: 'friend', status: 'accepted' }], listGroups: async () => [{ id: 'group', status: 'active', membershipStatus: 'active' }], sendGroupMessage: send } as unknown as DemoStraxSource;
  return { api: new DemoStraxApi(source, () => clock, seed), source, send, actor: (id: string) => { actor = { id, displayName: id }; }, block: (id: string) => { blocked.push(id); }, advance: (ms: number) => { clock += ms; } };
}
const create = { title: 'Leikjapartý', description: 'DM me for more info', spacesNeeded: 1, joinMode: 'application' as const };
describe('Strax demo flow', () => {
  it('publishes immediately with exact expiry, enforces a single active post and recovers create retries', async () => {
    const f = fixture(); const item = await f.api.create(create, 'request');
    expect(item.expiresAt).toBe('2026-10-14T03:00:00.000Z');
    expect((await f.api.create(create, 'request')).id).toBe(item.id);
    await expect(f.api.create({ ...create, title: 'Changed' }, 'request')).rejects.toThrow('strax_request_conflict');
    await expect(f.api.create(create)).rejects.toThrow('strax_active_limit');
    f.advance(STRAX_LIFETIME_MS);
    expect(await f.api.summary()).toMatchObject({ count: 0, nextExpiryAt: null });
    expect((await f.api.create(create)).status).toBe('active');
  });
  it('keeps applications private, excludes pending from capacity, and rejects a racing approval', async () => {
    const f = fixture(); const item = await f.api.create(create);
    f.actor('a'); await f.api.participate(item.id, 'I own the game');
    expect((await f.api.get(item.id)).participantCount).toBe(0);
    await expect(f.api.roster(item.id)).rejects.toThrow('strax_host_required');
    f.actor('b'); await f.api.participate(item.id, 'I can play too');
    f.actor('host'); await f.api.decide(item.id, 'a', 'approve');
    await expect(f.api.decide(item.id, 'b', 'approve')).rejects.toThrow('strax_full');
    expect((await f.api.summary()).count).toBe(1); // Full posts remain discoverable.
    f.actor('a'); expect((await f.api.notifications())[0]?.kind).toBe('approved');
    await f.api.leave(item.id);
    f.actor('host'); await f.api.decide(item.id, 'b', 'approve');
  });
  it('requires rules acknowledgement, revokes blocks and rejects stale joins at exact expiry', async () => {
    const f = fixture(); const item = await f.api.create({ ...create, joinMode: 'open', requirements: 'Own the game' });
    f.actor('a'); await expect(f.api.participate(item.id)).rejects.toThrow('acknowledgement');
    await f.api.participate(item.id, '', true);
    f.block('host'); expect((await f.api.badges(['host'])).items).toHaveLength(0);
    await expect(f.api.get(item.id)).rejects.toThrow('strax_unavailable');
    const fresh = fixture(); const expiring = await fresh.api.create({ ...create, joinMode: 'open' }); fresh.actor('a'); fresh.advance(STRAX_LIFETIME_MS);
    await expect(fresh.api.participate(expiring.id)).rejects.toThrow('strax_unavailable');
  });
  it('allows applications with no introduction and preserves revocation after unblock', async () => {
    const f = fixture(); const item = await f.api.create(create);
    f.actor('a'); expect((await f.api.participate(item.id)).viewerState).toBe('pending');
    f.actor('host'); await f.api.decide(item.id, 'a', 'approve');
    f.api.revokeBlock('host', 'a'); f.actor('a');
    expect((await f.api.get(item.id)).viewerState).toBe('declined');
    await expect(f.api.participate(item.id)).rejects.toThrow('strax_participation_unavailable');
    f.actor('host'); expect((await f.api.roster(item.id))[0]?.introduction).toBe('');
    await f.api.close(item.id); expect((await f.api.close(item.id)).status).toBe('closed');
  });
  it('returns partial sharing failures and suppresses duplicate successes on retry', async () => {
    const f = fixture(); const item = await f.api.create(create);
    const input = { allFriends: true, friendIds: ['missing'], groupIds: ['group'] };
    const first = await f.api.share(item.id, input); expect(first.sent).toHaveLength(2); expect(first.failed).toHaveLength(1);
    await f.api.share(item.id, input); expect(f.send).toHaveBeenCalledTimes(1);
    f.actor('friend'); expect((await f.api.notifications()).filter(row => row.kind === 'invited')).toHaveLength(1);
  });
  it('provides isolated per-source singleton state and rich visible demo examples', async () => {
    const a = fixture(true); const b = fixture();
    expect(getDemoStraxApi(a.source)).toBe(getDemoStraxApi(a.source)); expect(getDemoStraxApi(a.source)).not.toBe(getDemoStraxApi(b.source));
    expect((await a.api.list()).items).toHaveLength(4);
    expect((await a.api.list()).items.some(row => row.venueMode === 'online')).toBe(true);
  });
});
