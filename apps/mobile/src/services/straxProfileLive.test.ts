import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: mock.rpc } }));
vi.mock('./env', () => ({ runtimeEnv: { websiteUrl: 'https://commerce.test' } }));
vi.mock('@/features/hittingar/config', () => ({ hittingarFeature: { enabled: true } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
vi.mock('expo-image-manipulator', () => ({ manipulateAsync: vi.fn(), SaveFormat: { JPEG: 'jpeg' } }));
import { LiveRummalApi } from './liveApi';
import { defaultFilters } from '@/types/domain';

const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
const serverNow = '2026-10-13T23:00:00.000Z';
const expiresAt = '2026-10-14T03:00:00.000Z';
beforeEach(() => vi.resetAllMocks());

describe('live Strax profile integration', () => {
  it('fetches badges once for the authorized discovery page and ignores extra profile IDs', async () => {
    mock.rpc.mockImplementation(async name => ({ error: null, data: name === 'discover_nearby' ? ids.map(profile_id => ({ profile_id,
      display_name: 'Member', age: 30, identity_tags: [], looking_for: [], bio: '', region: 'hofudborgarsvaedid', photo_paths: [] })) : {
        serverNow, items: [{ profileId: ids[0], activityId: 'post', title: 'One more player', expiresAt }, { profileId: 'hidden', activityId: 'hidden-post', title: 'Hidden', expiresAt }],
      } }));
    const page = await new LiveRummalApi().discover(defaultFilters);
    expect(mock.rpc.mock.calls.map(call => call[0])).toEqual(['discover_nearby', 'strax_profile_badges']);
    expect(mock.rpc).toHaveBeenLastCalledWith('strax_profile_badges', { p_profile_ids: ids });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.activeStrax).toMatchObject({ id: 'post', title: 'One more player', serverNow, expiresAt });
    expect(page.items[1]?.activeStrax).toBeNull();
  });
  it('keeps profile discovery usable when only supplemental Strax is unavailable', async () => {
    mock.rpc.mockResolvedValueOnce({ error: null, data: [{ profile_id: ids[0], display_name: 'Member', age: 30, identity_tags: [], looking_for: [], bio: '', photo_paths: [] }] })
      .mockResolvedValueOnce({ error: new Error('strax_unavailable') });
    expect((await new LiveRummalApi().discover(defaultFilters)).items[0]?.activeStrax).toBeNull();
  });
  it('does not look up badges when profile authorization fails', async () => {
    mock.rpc.mockResolvedValueOnce({ error: new Error('profile_unavailable') });
    await expect(new LiveRummalApi().getProfile(ids[0]!)).rejects.toThrow('profile_unavailable');
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it('preserves validated group Strax cards in the legacy history mapper', async () => {
    const reference = { id: 'activity', title: 'Coffee', expiresAt };
    mock.rpc.mockResolvedValueOnce({ error: null, data: [{ id: 'message', group_id: 'group', sender_id: ids[0], sender_name: 'Member', body: 'Strax · Coffee', created_at: serverNow, strax: reference }] });
    expect((await new LiveRummalApi().listGroupMessages('group'))[0]?.strax).toEqual(reference);
  });
});
