import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

const supabaseMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: {
    functions: { invoke: supabaseMocks.invoke },
    rpc: supabaseMocks.rpc,
  },
}));

import { LiveMeetupService } from './meetupLive';

describe('LiveMeetupService wire adapters', () => {
  beforeEach(() => {
    supabaseMocks.invoke.mockReset();
    supabaseMocks.rpc.mockReset();
  });

  it('parses the sanitized places envelope returned by the Edge Function', async () => {
    supabaseMocks.invoke.mockResolvedValue({
      data: {
        places: [
          {
            id: 'maptiler:harpa',
            provider: 'maptiler',
            name: 'Harpa',
            fullAddress: 'Austurbakki 2, 101 Reykjavík',
            generalArea: 'Reykjavík',
            generalAreaId: 'reykjavik',
            kind: 'venue',
            coordinate: { latitude: 64.1505, longitude: -21.9326 },
          },
        ],
      },
      error: null,
    });

    const service = new LiveMeetupService();
    const places = await service.searchPlaces('Harpa', { locale: 'is', limit: 3 });

    expect(places).toHaveLength(1);
    expect(places[0]?.name).toBe('Harpa');
    expect(supabaseMocks.invoke).toHaveBeenCalledWith('place-search', {
      body: { query: 'Harpa', locale: 'is', limit: 3 },
    });
  });

  it('normalizes DB notification aliases and nested payload titles', async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: [
        {
          id: 'd1d4cb4d-729e-4ae7-b2fd-18159ade5a01',
          meetupId: 'c38df8a4-f792-4aa7-aec7-093140d54a04',
          kind: 'meetup_access_requested',
          payload: { title: 'Hinsegin spilakvöld', profileId: 'p-bjarni' },
          createdAt: '2026-08-31T19:00:00.000Z',
        },
      ],
      error: null,
    });

    const service = new LiveMeetupService();
    const notifications = await service.listNotifications();

    expect(notifications).toEqual([
      expect.objectContaining({
        kind: 'access_requested',
        meetupTitle: 'Hinsegin spilakvöld',
      }),
    ]);
    expect(notifications[0]?.actor).toBeUndefined();
  });

  it('maps push-token registration and removal to caller-bound RPC arguments', async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: null });
    const service = new LiveMeetupService();
    const token = 'ExponentPushToken[demo-device-token]';

    await service.registerPushToken(token, 'android');
    await service.unregisterPushToken(token);

    expect(supabaseMocks.rpc).toHaveBeenNthCalledWith(1, 'register_push_token', {
      expo_push_token: token,
      platform: 'android',
      locale: 'is',
    });
    expect(supabaseMocks.rpc).toHaveBeenNthCalledWith(2, 'unregister_push_token', {
      expo_push_token: token,
    });
  });

  it('parses the canonical host participant roster, including terminal states', async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: [
        {
          meetupId: 'c38df8a4-f792-4aa7-aec7-093140d54a04',
          profile: { id: 'p-bjarni', displayName: 'Bjarni' },
          status: 'removed',
          requestedAt: '2026-08-31T19:00:00.000Z',
          respondedAt: '2026-08-31T20:00:00.000Z',
        },
      ],
      error: null,
    });

    const service = new LiveMeetupService();
    const roster = await service.listParticipants(
      'c38df8a4-f792-4aa7-aec7-093140d54a04',
    );

    expect(roster[0]).toMatchObject({ status: 'removed', profile: { displayName: 'Bjarni' } });
    expect(supabaseMocks.rpc).toHaveBeenCalledWith('list_meetup_participants', {
      meetup_id: 'c38df8a4-f792-4aa7-aec7-093140d54a04',
    });
  });
});
