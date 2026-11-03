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
  it('maps host-direct fees without reinterpreting whole ISK units or foreign currencies', async () => {
    const [event] = await new DemoMeetupService().discover();
    const [paid] = await parseMeetupSummaries([{ ...event, feeIsk: 1500, admissionMode: 'paid', priceMinor: 1500, currency: 'ISK' }]);
    expect(paid).toMatchObject({ feeIsk: 1500, priceMinor: 1500, currency: 'ISK' });
    const [legacy] = await parseMeetupSummaries([{ ...event, feeIsk: undefined, admissionMode: 'paid', priceMinor: 450, currency: 'EUR' }]);
    expect(legacy).toMatchObject({ priceMinor: 450, currency: 'EUR' });
    expect(legacy?.feeIsk).toBeUndefined();
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

  it('preserves server sponsor order and masked identities without attendance fields', async () => {
    const sponsors = [
      { id: 'receipt-a', profile: null, amount: 500, contributingMonths: 3, cumulativeAmount: 1500, repeatSupport: true },
      { id: 'receipt-b', profile: { id: 'p-ari', displayName: 'Ari' }, amount: 5000, contributingMonths: 1, cumulativeAmount: 5000, repeatSupport: false },
    ];
    supabaseMocks.rpc.mockResolvedValue({ data: sponsors, error: null });
    expect(await new LiveMeetupService().listSponsors('event')).toEqual(sponsors);
    expect(supabaseMocks.rpc).toHaveBeenCalledWith('list_meetup_sponsors', { meetup_id: 'event' });
    supabaseMocks.rpc.mockResolvedValue({ data: [{ ...sponsors[0], status: 'joined' }], error: null });
    await expect(new LiveMeetupService().listSponsors('event')).rejects.toThrow();
  });

  it('fails closed when the sponsor list loses event authorization', async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: new Error('meetup_not_visible') });
    await expect(new LiveMeetupService().listSponsors('event')).rejects.toThrow('meetup_not_visible');
  });
  it.each([null, {}, { items: [] }])('rejects malformed sponsor projections (%j)', async value => {
    supabaseMocks.rpc.mockResolvedValue({ data: value, error: null });
    await expect(new LiveMeetupService().listSponsors('event')).rejects.toThrow('invalid_meetup_sponsors');
  });
});
