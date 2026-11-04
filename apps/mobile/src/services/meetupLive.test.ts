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

import { LiveMeetupService, parseMeetupSummaries } from './meetupLive';
import { DemoMeetupService } from './meetupDemo';

describe('LiveMeetupService wire adapters', () => {
  it('removes legacy prices from incoming event data', async () => {
    const [event] = await new DemoMeetupService().discover();
    const [paid] = await parseMeetupSummaries([{ ...event, feeIsk: 1500, admissionMode: 'paid', priceMinor: 1500, currency: 'ISK' }]);
    expect(paid).toMatchObject({ feeIsk: 0, priceMinor: null, currency: null, admissionMode: 'free' });
    const [legacy] = await parseMeetupSummaries([{ ...event, feeIsk: undefined, admissionMode: 'paid', priceMinor: 450, currency: 'EUR' }]);
    expect(legacy).toMatchObject({ priceMinor: null, currency: null, admissionMode: 'free' });
    expect(legacy?.feeIsk).toBe(0);
  });

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
          isSponsor: true,
          rsvpVisibility: 'private',
        },
      ],
      error: null,
    });

    const service = new LiveMeetupService();
    const roster = await service.listParticipants(
      'c38df8a4-f792-4aa7-aec7-093140d54a04',
    );

    expect(roster[0]).toMatchObject({ status: 'removed', profile: { displayName: 'Bjarni' }, isSponsor: true, rsvpVisibility: 'private' });
    expect(supabaseMocks.rpc).toHaveBeenCalledWith('list_meetup_participants', {
      meetup_id: 'c38df8a4-f792-4aa7-aec7-093140d54a04',
    });
  });

  it('returns no sponsor history for an authorized event', async () => {
    const demo = new DemoMeetupService();
    const [event] = await demo.discover();
    const detail = await demo.get(event!.id);
    supabaseMocks.rpc.mockResolvedValue({ data: detail, error: null });
    expect(await new LiveMeetupService().listSponsors(detail.id)).toEqual([]);
    expect(supabaseMocks.rpc).toHaveBeenCalledExactlyOnceWith('get_meetup', { meetup_id: detail.id });
  });

  it('fails closed when the sponsor list loses event authorization', async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: new Error('meetup_not_visible') });
    await expect(new LiveMeetupService().listSponsors('event')).rejects.toThrow('meetup_not_visible');
  });
  it.each([null, {}, { items: [] }])('rejects malformed event authorization responses (%j)', async value => {
    supabaseMocks.rpc.mockResolvedValue({ data: value, error: null });
    await expect(new LiveMeetupService().listSponsors('event')).rejects.toThrow();
  });
});
