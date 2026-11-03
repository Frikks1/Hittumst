import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), session: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: mocks.session }, functions: { invoke: mocks.invoke } } }));
vi.mock('./mediaUpload', () => ({ queueMediaUpload: vi.fn() }));
import { LiveStraxApi, signStraxPhotos } from './straxLive';
import { straxDetailSchema } from '@rummal/shared';

beforeEach(() => { vi.restoreAllMocks(); mocks.invoke.mockReset(); mocks.session.mockReset(); mocks.session.mockResolvedValue({ data: { session: { access_token: 'fixture-token', user: { id: 'viewer' } } }, error: null }); });

const detail = { id: 'activity', host: { id: 'host', displayName: 'Aron' }, title: 'Leikur', description: 'DM me', locationText: null, address: null, requirements: 'Own the game', spacesNeeded: 1, joinMode: 'application', venueMode: 'online', participantCount: 0, createdAt: '2026-10-13T12:00:00Z', expiresAt: '2026-10-13T16:00:00Z', serverNow: '2026-10-13T12:00:00Z', status: 'active', viewerState: 'none', viewerCapabilities: { canJoin: false, canApply: true, canLeave: false, canWithdraw: false, canManage: false }, photoPath: null, photoStatus: 'none' };
describe('Strax live boundaries', () => {
  it('validates create input and preserves its idempotency key', async () => {
    const rpc = vi.fn(async () => detail); const api = new LiveStraxApi(rpc, async items => items);
    await expect(api.create({ title: '', description: 'DM me' })).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
    const id = '81000000-0000-4000-8000-000000000001'; await api.create({ title: 'Leikur', description: 'DM me' }, id);
    expect(rpc).toHaveBeenCalledWith('strax_create', { input: expect.objectContaining({ joinMode: 'application' }), p_request_id: id });
  });
  it('allows an optional introduction while requiring requirements acknowledgement', async () => {
    const rpc = vi.fn(async () => detail); const api = new LiveStraxApi(rpc, async items => items);
    await api.participate('activity', '', true);
    expect(rpc).toHaveBeenLastCalledWith('strax_participate', { p_id: 'activity', p_action: 'apply', p_introduction: '', p_acknowledged: true });
    await expect(api.participate('activity', 'Hello', false)).rejects.toThrow('acknowledgement');
    await api.participate('activity', 'Hello', true);
    expect(rpc).toHaveBeenLastCalledWith('strax_participate', { p_id: 'activity', p_action: 'apply', p_introduction: 'Hello', p_acknowledged: true });
  });
  it('rejects malformed server data and a lifetime beyond four hours', async () => {
    const api = new LiveStraxApi(async () => ({ ...detail, expiresAt: '2026-10-13T17:00:00Z' }), async items => items);
    await expect(api.get('activity')).rejects.toThrow();
    await expect(new LiveStraxApi(async () => ({ count: -1 }), async items => items).summary()).rejects.toThrow();
  });
  it('deduplicates share destinations and preserves partial failures', async () => {
    const result = { sent: [{ type: 'friend', id: 'a' }], failed: [{ type: 'group', id: 'b', reason: 'group_unavailable' }] };
    const rpc = vi.fn(async () => result); const api = new LiveStraxApi(rpc, async items => items);
    expect(await api.share('activity', { friendIds: ['a', 'a'], groupIds: ['b'] })).toEqual(result);
    expect(rpc).toHaveBeenCalledWith('strax_share', { p_id: 'activity', p_all_friends: false, p_friend_ids: ['a'], p_group_ids: ['b'] });
  });
  it('requests server-authorized URLs only for eligible photos and uses the current session token', async () => {
    mocks.invoke.mockResolvedValue({ data: { photos: [{ activityId: 'activity', url: 'https://media.example/photo.jpg' }] }, error: null });
    const active = straxDetailSchema.parse({ ...detail, serverNow: '2026-10-13T15:59:58Z', photoStatus: 'approved', photoPath: 'photo.jpg' });
    const expired = straxDetailSchema.parse({ ...active, status: 'expired', photoPath: 'expired.jpg' });
    const closed = straxDetailSchema.parse({ ...active, status: 'closed', photoPath: 'closed.jpg' });
    const values = await signStraxPhotos([active, expired, closed]);
    expect(mocks.invoke).toHaveBeenCalledWith('strax-media', { body: { activityIds: ['activity'] }, headers: { Authorization: 'Bearer fixture-token' } });
    expect(values[0]?.photoUrl).toContain('photo.jpg'); expect(values[1]?.photoUrl).toBeUndefined(); expect(values[2]?.photoUrl).toBeUndefined();
  });
  it('keeps the text result when optional photo signing fails', async () => {
    mocks.invoke.mockRejectedValue(new Error('storage unavailable'));
    const value = straxDetailSchema.parse({ ...detail, photoStatus: 'approved', photoPath: 'photo.jpg' });
    const result = await signStraxPhotos([value]); expect(result[0]).toMatchObject({ id: value.id, title: value.title }); expect(result[0]?.photoUrl).toBeUndefined();
  });
  it('discards signed photos after an account change and never sends paths for signing', async () => {
    mocks.session.mockResolvedValueOnce({ data: { session: { access_token: 'old-token', user: { id: 'old' } } }, error: null })
      .mockResolvedValueOnce({ data: { session: { access_token: 'new-token', user: { id: 'new' } } }, error: null });
    mocks.invoke.mockResolvedValue({ data: { photos: [{ activityId: 'activity', url: 'https://media.example/photo.jpg' }] }, error: null });
    const value = straxDetailSchema.parse({ ...detail, photoStatus: 'approved', photoPath: 'photo.jpg' });
    expect((await signStraxPhotos([value]))[0]?.photoUrl).toBeUndefined();
    expect(mocks.invoke.mock.calls[0]![1].body).toEqual({ activityIds: ['activity'] });
  });
  it('accounts for response delay in the server clock', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(2100);
    const value = await new LiveStraxApi(async () => ({ count: 1, nextExpiryAt: detail.expiresAt, serverNow: detail.serverNow })).summary();
    expect(value.serverNow).toBe('2026-10-13T12:00:02.000Z');
  });
});
