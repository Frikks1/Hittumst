import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
import { DemoCommunityApi, DemoCommunityStore, refreshDemoQueue } from './communityDemo';
import { MockRummalApi } from './mockApi';
import { defaultMeetupFilters } from '@rummal/shared';
const now = Date.parse('2026-09-26T12:00:00Z');
const event = { id: 'event', title: 'Gathering', host: { id: 'host', displayName: 'Host' }, seriesId: null, capacity: 1, participantCount: 0, startsAt: new Date(now + 3600000).toISOString(), status: 'published' as const };
const entry = (profileId: string, createdAt: number) => ({ profileId, createdAt, status: 'waiting' as const, approved: true, expiresAt: null });
describe('community demo waitlist', () => {
  it('prioritizes sponsors and preserves FIFO within the group without auto-joining', () => {
    const store = new DemoCommunityStore(); store.queues.set(event.id, [entry('ordinary',1),entry('sponsor-first',2),entry('sponsor-later',3)]);
    const queue = refreshDemoQueue(store,event,now,()=>true,id=>id.startsWith('sponsor'));
    expect(queue.map(row=>[row.profileId,row.status])).toEqual([['sponsor-first','offered'],['sponsor-later','waiting'],['ordinary','waiting']]);
    expect(queue[0]?.expiresAt).toBe(Date.parse(event.startsAt));
    expect(event.participantCount).toBe(0);
    expect(store.notifications.get('sponsor-first')).toHaveLength(1);
  });
  it('keeps existing offers when a sponsor arrives and rechecks admission', () => {
    const store=new DemoCommunityStore();store.queues.set(event.id,[entry('ordinary',1)]);
    refreshDemoQueue(store,event,now);store.queues.get(event.id)!.push(entry('sponsor',2));
    expect(refreshDemoQueue(store,event,now,()=>true,id=>id==='sponsor').find(row=>row.profileId==='ordinary')?.status).toBe('offered');
    store.queues.set(event.id,[entry('ineligible-sponsor',1),entry('eligible',2)]);
    expect(refreshDemoQueue(store,event,now,id=>id==='eligible',()=>true).map(row=>row.profileId)).toEqual(['eligible']);
  });
  it('recomputes rank after reversal and promotes after expiry', () => {
    const store=new DemoCommunityStore();store.queues.set(event.id,[entry('ordinary',1),entry('former-sponsor',2)]);
    const queue=refreshDemoQueue(store,event,now,()=>true,()=>false);expect(queue[0]?.profileId).toBe('ordinary');
    queue[0]!.expiresAt=now-1;
    expect(refreshDemoQueue(store,event,now).find(row=>row.profileId==='former-sponsor')?.status).toBe('offered');
  });
});
describe('community demo integration', () => {
  it('following is private, does not join, and is isolated across demo accounts', async () => {
    const api=new MockRummalApi(); const community=new DemoCommunityApi(api);
    const event=(await api.discoverMeetups(defaultMeetupFilters))[0]!;
    const before=await api.getEntitlement();await community.setFollow('event',event.id,true,false);
    const state=await community.getState(event.id);
    expect(state.follows.event).toEqual({count:1,following:true,notifications:false});
    expect((await api.getEntitlement()).joinsUsed).toBe(before.joinsUsed);
    expect((await api.getMeetup(event.id)).viewerState.participationStatus).toBe(event.viewerState.participationStatus);
    expect(await community.listFollowing()).toHaveLength(1);
    expect((await new DemoCommunityApi(new MockRummalApi()).getState(event.id)).follows.event.count).toBe(0);
  });
  it('keeps sponsorship priority tied to an active event contribution', () => {
    const api=new MockRummalApi();api.commerce.state.contributions.test={id:'test',eventId:'event',memberId:'demo-me',amount:500,lotIds:[],reversed:false};
    expect(api.communityDemo.sponsored('event','demo-me')).toBe(true);
    expect(api.communityDemo.sponsored('other','demo-me')).toBe(false);
    api.commerce.state.contributions.test.reversed=true;
    expect(api.communityDemo.sponsored('event','demo-me')).toBe(false);
  });
});
