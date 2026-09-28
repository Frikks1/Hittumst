import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultMeetupFilters, safeMeetupPublicationDefaults, type MeetupDraftInput, type ContributionQuote } from '@rummal/shared';
import { MockRummalApi } from './mockApi';
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
const requestId = () => crypto.randomUUID();
function draft(overrides: Partial<MeetupDraftInput> = {}): MeetupDraftInput {
  return { title: 'Sponsored community walk', description: 'A friendly walk with the local community.', category: 'community', intention: 'community', venueMode: 'in_person', tags: [],
    startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: null, ...safeMeetupPublicationDefaults,
    generalAreaId: 'reykjavik', capacity: 12, isExplicit: false, rsvpVisibility: 'inherit', recurrence: null,
    prohibitedServicesAttested: true, publicLocationConfirmed: false, latitude: 64.1466, longitude: -21.9426, ...overrides };
}
async function quote(api: MockRummalApi, meetupId: string, amount=500, fundingSource: 'credit'|'cash'|'mixed'='credit') {
  return await api.walletCommand({ action: 'contribution_quote', meetupId, amount, fundingSource, ...(fundingSource==='mixed'?{creditAmount:500}:{}), requestId: requestId() }) as ContributionQuote;
}
describe('sponsorship integration', () => {
  beforeEach(() => {
    // Demo events start one to five days ahead; keep them in the same allowance month.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('publishes a funded draft once, shows its pool in listings, and refunds credit after cancellation', async () => {
    const api = new MockRummalApi(); await api.setSandboxTier('flottari_plebbi');
    const id = await api.createMeetupDraft(draft()); const q = await quote(api,id);
    const sponsorship = { quoteId:q.id, amount:q.amount, expectedHostBps:q.hostBps, requestId:requestId() };
    const event = await api.publishMeetup(id,sponsorship);
    expect(event.status).toBe('published'); expect(event.pool).toMatchObject({total:500,hostBps:2500,status:'accepting'});
    expect((await api.getWallet()).sponsorshipCredit).toBe(0);
    await api.publishMeetup(id,sponsorship);
    expect((await api.getMeetup(id)).pool?.total).toBe(500);
    expect((await api.listMyMeetups()).find(x=>x.id===id)?.pool?.total).toBe(500);
    await api.cancelMeetup(id);
    expect((await api.getWallet()).sponsorshipCredit).toBe(500);
    expect((await api.getMeetup(id)).pool).toMatchObject({total:0,fundedTotal:500,refundedTotal:500,status:'refunded'});
  });
  it('replays a committed self-sponsorship after cancellation and downgrade without charging again', async () => {
    const api = new MockRummalApi(); await api.setSandboxTier('flottari_plebbi');
    const id = await api.createMeetupDraft(draft()); const q = await quote(api, id);
    const sponsorship = { quoteId: q.id, amount: q.amount, expectedHostBps: q.hostBps, requestId: requestId() };
    await api.publishMeetup(id, sponsorship); await api.cancelMeetup(id); await api.setSandboxTier('plebbi');
    const journalLength = api.commerce.state.journal.length;
    const replay = await api.publishMeetup(id, sponsorship);
    expect(replay.status).toBe('cancelled');
    expect(replay.pool).toMatchObject({ total: 0, refundedTotal: 500 });
    expect((await api.getWallet()).sponsorshipCredit).toBe(500);
    expect(api.commerce.state.journal).toHaveLength(journalLength);
    await expect(api.publishMeetup(id, { ...sponsorship, amount: 1000 })).rejects.toThrow('idempotency_conflict');
  });
  it('leaves the draft and its full credit intact when publication fails', async () => {
    const api=new MockRummalApi(); await api.setSandboxTier('flottari_plebbi');
    const id=await api.createMeetupDraft(draft({prohibitedServicesAttested:false})); const q=await quote(api,id);
    await expect(api.publishMeetup(id,{quoteId:q.id,amount:q.amount,expectedHostBps:q.hostBps,requestId:requestId()})).rejects.toThrow('meetup_attestation_required');
    expect((await api.getMeetup(id)).status).toBe('draft');
    expect((await api.getWallet()).sponsorshipCredit).toBe(500);
    expect((await api.getMeetup(id)).pool?.total).toBe(0);
  });
  it('quotes cash service fees separately and restores principal and fees on reversal', async () => {
    const api=new MockRummalApi(); await api.setSandboxTier('flottari_plebbi');
    await api.walletCommand({action:'purchase',amount:1100,requestId:requestId()});
    const event=(await api.discoverMeetups(defaultMeetupFilters)).find(x=>x.host.id!=='demo-me')!;
    const q=await quote(api,event.id,1000,'cash'); expect(q).toMatchObject({amount:1000,cashAmount:1000,serviceFee:100,totalCash:1100,processingFee:0});
    const id=requestId(); await api.walletCommand({action:'contribute',meetupId:event.id,quoteId:q.id,amount:1000,expectedHostBps:q.hostBps,requestId:id});
    expect((await api.getMeetup(event.id)).pool?.total).toBe(1000); expect((await api.getWallet()).withdrawableBalance).toBe(0);
    const contribution=(await api.getWallet()).contributions[0]!;
    await api.walletCommand({action:'reverse',contributionId:contribution.id,requestId:requestId()});
    expect((await api.getWallet()).withdrawableBalance).toBe(1100);
    expect((await api.getMeetup(event.id)).pool?.total).toBe(0);
  });
  it('counts free joins separately from hosting and returns a pre-start seat on leaving', async () => {
    const api=new MockRummalApi(); const events=(await api.discoverMeetups(defaultMeetupFilters)).filter(x=>x.capabilities.canJoin);
    expect(events.length).toBeGreaterThan(1);
    await api.joinMeetup(events[0]!.id);
    expect(await api.getEntitlement()).toMatchObject({joinsUsed:1,joinsLimit:1,joinsRemaining:0});
    await expect(api.joinMeetup(events[1]!.id)).rejects.toThrow('meetup_join_monthly_limit_reached');
    await api.leaveMeetup(events[0]!.id); await api.joinMeetup(events[1]!.id);
    await api.setSandboxTier('flottari_plebbi');
    expect(await api.getEntitlement()).toMatchObject({joinsUsed:1,joinsLimit:5,joinsRemaining:4});
  });
});
