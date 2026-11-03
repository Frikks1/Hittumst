import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultMeetupFilters, type MeetupDraftInput, safeMeetupPublicationDefaults } from '@rummal/shared';
import { MockRummalApi } from './mockApi';
import { DemoMeetupService } from './meetupDemo';
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
const draft = (): MeetupDraftInput => ({ title: 'Support history fixture', description: 'A synthetic community gathering for adapter tests.', category: 'community', intention: 'community', venueMode: 'in_person', tags: [], startsAt: '2026-10-10T12:00:00Z', endsAt: null, ...safeMeetupPublicationDefaults, generalAreaId: 'reykjavik', capacity: 12, isExplicit: false, rsvpVisibility: 'private', recurrence: { frequency: 'monthly', interval: 1, weekdays: [], monthlyPattern: { kind: 'day_of_month', day: 10 }, end: { kind: 'count', count: 3 }, skippedDates: [], timezone: 'Atlantic/Reykjavik' }, prohibitedServicesAttested: true, publicLocationConfirmed: false, latitude: 64.1466, longitude: -21.9426 });
function committed(api: MockRummalApi, id: string, eventId: string, memberId: string, amount: number, at: string) {
  api.commerce.state.contributions[id] = { id, eventId, memberId, amount, lotIds: [], reversed: false };
  api.commerce.state.journal.push({ id, kind: 'contribution', at, entries: [{ account: `pool:${eventId}`, amount }] });
}
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-07T12:00:00Z')); });
afterEach(() => vi.useRealTimers());
describe('demo sponsor disclosures', () => {
  it('shows actual same-series support months, masks hidden identities and omits blocked accounts', async () => {
    const api = new MockRummalApi(); await api.setSandboxTier('flottari_plebbi');
    const id = await api.createMeetupDraft(draft()); const event = await api.publishMeetup(id);
    const series = (await api.listMyMeetups()).filter(item => item.seriesId === event.seriesId);
    expect(series).toHaveLength(3);
    committed(api, 'old-july', series[1]!.id, 'p-bjarni', 500, '2026-07-01T00:00:00Z');
    committed(api, 'old-august', series[2]!.id, 'p-bjarni', 700, '2026-08-01T00:00:00Z');
    committed(api, 'current', id, 'p-bjarni', 1000, '2026-09-01T00:00:00Z');
    committed(api, 'hidden', id, 'p-embla', 500, '2026-09-02T00:00:00Z');
    const sponsors = await api.listMeetupSponsors(id);
    expect(sponsors[0]).toMatchObject({ amount: 1000, contributingMonths: 3, cumulativeAmount: 2200, repeatSupport: true, profile: { id: 'p-bjarni' } });
    expect(sponsors.find(row => row.id === 'hidden')?.profile).toBeNull();
    expect(sponsors.every(row => !('status' in row) && !('attendanceState' in row))).toBe(true);
    await api.block('p-bjarni');
    expect((await api.listMeetupSponsors(id)).map(row => row.id)).toEqual(['hidden']);
    api.commerce.state.contributions.hidden!.refundReason = 'cancelled';
    expect(await api.listMeetupSponsors(id)).toEqual([]);
  });
  it('does not treat subscription credit or a recurring meetup schedule as support', async () => {
    const api = new MockRummalApi(); await api.setSandboxTier('flottari_plebbi');
    const id = await api.createMeetupDraft(draft()); await api.publishMeetup(id);
    expect((await api.getWallet()).sponsorshipCredit).toBeGreaterThan(0);
    expect(await api.listMeetupSponsors(id)).toEqual([]);
    const unrelated = (await api.discoverMeetups(defaultMeetupFilters)).find(item => item.id !== id)!;
    committed(api, 'other', unrelated.id, 'p-bjarni', 500, '2026-08-01T00:00:00Z');
    committed(api, 'current', id, 'p-bjarni', 500, '2026-09-01T00:00:00Z');
    expect((await api.listMeetupSponsors(id))[0]).toMatchObject({ contributingMonths: 1, cumulativeAmount: 500, repeatSupport: false });
  });
});
describe('demo authorized host roster ordering', () => {
  it('places sponsors first, retains within-group order and hides attendee lists from nonhosts', async () => {
    let viewer = 'demo-me'; let sponsoring = true;
    const service = new DemoMeetupService(new Date(), () => 'flottari_plebbi', undefined, { viewerId: () => viewer, sponsored: (_id, member) => sponsoring && member === 'p-salka' });
    const [event] = await service.listMine();
    viewer = 'p-salka'; await service.requestAccess(event!.id);
    viewer = 'demo-me';
    expect((await service.listParticipants(event!.id)).map(row => row.profile.id)).toEqual(['p-salka', 'p-bjarni']);
    sponsoring = false;
    expect((await service.listParticipants(event!.id)).map(row => row.profile.id)).toEqual(['p-bjarni', 'p-salka']);
    await service.respond(event!.id, 'p-salka', true); await service.respond(event!.id, 'p-bjarni', true);
    sponsoring = true;
    expect((await service.listPublicRoster(event!.id)).items.map(row => row.profile.id)).toEqual(['p-salka', 'p-bjarni']);
    viewer = 'p-salka';
    expect(await service.listPublicRoster(event!.id)).toEqual({ items: [], nextCursor: null });
    await expect(service.listParticipants(event!.id)).rejects.toThrow('meetup_forbidden');
  });
  it('uses only unreversed, unrefunded positive sponsorship at this occurrence', async () => {
    const api = new MockRummalApi(); const [event] = await api.listMyMeetups();
    committed(api, 'current', event!.id, 'p-bjarni', 500, '2026-09-01T00:00:00Z');
    expect((await api.listMeetupParticipants(event!.id))[0]?.isSponsor).toBe(true);
    api.commerce.state.contributions.current!.reversed = true;
    expect((await api.listMeetupParticipants(event!.id))[0]?.isSponsor).toBe(false);
    api.commerce.state.contributions.current!.reversed = false;
    api.commerce.state.contributions.current!.refundReason = 'cancelled';
    expect((await api.listMeetupParticipants(event!.id))[0]?.isSponsor).toBe(false);
    delete api.commerce.state.contributions.current!.refundReason;
    api.commerce.state.contributions.current!.eventId = 'other-occurrence';
    expect((await api.listMeetupParticipants(event!.id))[0]?.isSponsor).toBe(false);
  });
});
