import { describe, expect, it, vi } from 'vitest';
import { showcaseSaveInputSchema, showcaseSaveInput } from '@rummal/shared';
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
import { DemoShowcaseApi, DemoShowcaseStore, showcaseDemoPair } from './showcaseDemo';
import type { OwnProfile } from '@/types/domain';
const owner = '10000000-0000-4000-8000-000000000001';
const friend = '10000000-0000-4000-8000-000000000002';
const outsider = '10000000-0000-4000-8000-000000000003';
const host = '10000000-0000-4000-8000-000000000004';
const eventId = '20000000-0000-4000-8000-000000000001';
const hiddenEvent = '20000000-0000-4000-8000-000000000002';
const series = '20000000-0000-4000-8000-000000000003';
const entryId = '30000000-0000-4000-8000-000000000001';
function setup() {
  let actor = owner; const store = new DemoShowcaseStore();
  for (const person of [owner, friend, outsider, host]) store.people.set(person, { displayName: person, active: true, visible: true });
  store.friendships.add(showcaseDemoPair(owner, friend));
  store.events.set(eventId, { id: eventId, title: 'Selected walk', seriesId: series, private: false, hostId: host, attendees: new Set([owner, friend]) });
  store.events.set(hiddenEvent, { id: hiddenEvent, title: 'Private second visit', seriesId: series, private: true, hostId: host, attendees: new Set([owner, friend]) });
  const api = new DemoShowcaseApi({ getOwnProfile: async () => ({ id: owner, displayName: 'Owner', isHidden: false } as OwnProfile) }, store, { viewerId: () => actor, seed: false });
  return { api, store, actAs: (id: string) => { actor = id; } };
}
function draft(kind: 'story' | 'event' | 'person' = 'story', extra: Record<string, unknown> = {}) {
  return showcaseSaveInputSchema.parse({ id: null, expectedRevision: 0, template: kind === 'person' ? 'people' : kind === 'event' ? 'hittingar' : 'passions', title: 'Our moments', entries: [{ id: entryId, kind, title: 'Entry', body: 'A story', ...extra }] });
}
describe('demo showcase consent and visibility', () => {
  it('requires audience selection and hides friends-only stories from outsiders', async () => {
    const { api, actAs } = setup(); const saved = await api.save(draft());
    expect(saved.audience).toBeNull(); expect(saved.revision).toBe(1);
    await expect(api.publish(saved.id, null as never, 1)).rejects.toThrow();
    const published = await api.publish(saved.id, 'friends', 1); expect(published.revision).toBe(2);
    actAs(outsider); expect(await api.listProfile(owner)).toEqual([]);
    await expect(api.get(saved.id)).rejects.toThrow('showcase_unavailable');
    actAs(friend); expect((await api.listProfile(owner))[0]?.entries[0]?.body).toBe('A story');
  });
  it('binds person approval to exact revision and requires renewal after edits', async () => {
    const { api, actAs } = setup(); const saved = await api.save(draft('person', { personId: friend }));
    await api.publish(saved.id, 'everyone', saved.revision);
    actAs(outsider); expect(await api.listProfile(owner)).toEqual([]);
    actAs(friend); const [approval] = await api.listApprovals(); expect(approval?.snapshot.body).toBe('A story');
    await api.respondApproval(approval!.id, 'approve'); actAs(outsider); expect(await api.listProfile(owner)).toHaveLength(1);
    actAs(owner); const published = await api.get(saved.id); published.entries[0]!.body = 'Different story';
    const changed = await api.save(showcaseSaveInput(published)); expect(changed.status).toBe('draft');
    await expect(api.publish(saved.id, 'everyone', published.revision)).rejects.toThrow('showcase_revision_conflict');
    await api.publish(saved.id, 'everyone', changed.revision); actAs(friend);
    await expect(api.respondApproval(approval!.id, 'approve')).rejects.toThrow('stale_showcase_approval');
    const [renewed] = await api.listApprovals(); expect(renewed?.snapshot.body).toBe('Different story');
  });
  it('freezes full recurrence counts and asks private-event hosts for unselected contributing visits', async () => {
    const { api, actAs, store } = setup(); const saved = await api.save(draft('event', { meetupIds: [eventId], showCount: true }));
    const published = await api.publish(saved.id, 'everyone', saved.revision);
    expect(published.entries[0]?.verifiedCount).toBe(2); expect(published.entries[0]?.meetups).toEqual([{ id: eventId, title: 'Selected walk' }]);
    actAs(outsider); expect((await api.get(saved.id)).entries[0]?.verifiedCount).toBeNull();
    actAs(host); const [approval] = await api.listApprovals(); expect(approval?.role).toBe('host'); await api.respondApproval(approval!.id, 'approve');
    actAs(outsider); expect((await api.get(saved.id)).entries[0]?.verifiedCount).toBe(2);
    store.events.set('20000000-0000-4000-8000-000000000009', { id: '20000000-0000-4000-8000-000000000009', title: 'New visit', seriesId: series, private: false, hostId: host, attendees: new Set([owner]) });
    expect((await api.get(saved.id)).entries[0]?.verifiedCount).toBe(2);
    store.events.get(hiddenEvent)!.available = false; expect((await api.get(saved.id)).entries[0]?.verifiedCount).toBeNull();
  });
  it('revocation, blocking and unfriending remove current person disclosures', async () => {
    const { api, actAs, store } = setup(); const saved = await api.save(draft('person', { personId: friend })); await api.publish(saved.id, 'everyone', 1);
    actAs(friend); const [approval] = await api.listApprovals(); await api.respondApproval(approval!.id, 'approve');
    actAs(outsider); expect(await api.listProfile(owner)).toHaveLength(1);
    store.blocks.add(showcaseDemoPair(friend, outsider)); expect(await api.listProfile(owner)).toEqual([]); store.blocks.clear();
    actAs(friend); await api.respondApproval(approval!.id, 'revoke'); actAs(outsider); expect(await api.listProfile(owner)).toEqual([]);
    actAs(owner); const republished = await api.publish(saved.id, 'everyone', (await api.get(saved.id)).revision); actAs(friend); const [next] = await api.listApprovals(); await api.respondApproval(next!.id, 'approve');
    store.friendships.clear(); actAs(outsider); expect(await api.listProfile(owner)).toEqual([]); expect(republished.entries[0]?.approvalStatus).toBe('pending');
  });
  it('keeps upload URLs private until moderation and requests media uploader consent', async () => {
    const { api, store, actAs } = setup(); const saved = await api.save(draft());
    await api.upload(saved.id, entryId, 'file://queued-image', 'photo', 'image/jpeg', 'My image');
    const queued = await api.get(saved.id); expect(queued.entries[0]?.media[0]).toMatchObject({ status: 'pending', url: undefined });
    await expect(api.publish(saved.id, 'everyone', queued.revision)).rejects.toThrow('approved_media_required');
    const upload = [...store.uploads.values()][0]!; upload.status = 'approved'; upload.uploaderId = friend;
    const approved = await api.get(saved.id); await api.publish(saved.id, 'everyone', approved.revision);
    actAs(friend); const [approval] = await api.listApprovals(); expect(approval?.role).toBe('media'); await api.respondApproval(approval!.id, 'approve');
    actAs(outsider); expect((await api.get(saved.id)).entries[0]?.media[0]?.url).toBe('file://queued-image');
    upload.available = false; expect((await api.get(saved.id)).entries[0]?.media).toEqual([]);
  });
  it('rejects unverified events, invite-only group membership and incomplete reorders', async () => {
    const { api, store } = setup(); store.events.get(eventId)!.attendees.delete(owner);
    await expect(api.save(draft('event', { meetupIds: [eventId] }))).rejects.toThrow('verified_attendance_required');
    const groupId = '40000000-0000-4000-8000-000000000001'; store.groups.set(groupId, { id: groupId, name: 'Crew', ownerId: host, admins: new Set([host]), members: new Set([host]), active: true });
    await expect(api.save(showcaseSaveInputSchema.parse({ ...draft(), template: 'groups', entries: [{ id: entryId, kind: 'group', groupId }] }))).rejects.toThrow('active_group_membership_required');
    const saved = await api.save(draft()); await expect(api.reorder([])).rejects.toThrow('invalid_showcase_order'); await api.reorder([saved.id]);
  });
  it('uses group consent while treating joining requirements as descriptive text', async () => {
    const { api, store, actAs } = setup(); const groupId = '40000000-0000-4000-8000-000000000001';
    store.groups.set(groupId, { id: groupId, name: 'A private crew', ownerId: host, admins: new Set([host]), members: new Set([owner, host]), active: true });
    const saved = await api.save(showcaseSaveInputSchema.parse({ ...draft(), template: 'groups', entries: [{ id: entryId, kind: 'group', groupId, groupName: 'My coffee crew', body: 'We like slow Sundays.', requirements: { minAge: 90, maxAge: 120, memberType: 'Coffee lovers', meetupId: eventId, text: 'Contact us if interested.' } }] }));
    await api.publish(saved.id, 'everyone', 1); actAs(outsider); expect(await api.listProfile(owner)).toEqual([]);
    actAs(host); const [approval] = await api.listApprovals(); expect(approval?.role).toBe('group'); await api.respondApproval(approval!.id, 'approve');
    actAs(outsider); const visible = await api.get(saved.id); expect(visible.entries[0]).toMatchObject({ groupName: 'My coffee crew', requirementsInformational: true, requirements: { minAge: 90 } });
    expect(store.groups.get(groupId)?.members.has(outsider)).toBe(false);
    actAs(outsider); await expect(api.remove(saved.id)).rejects.toThrow('showcase_owner_required');
  });
  it('only simulates approved uploads when the demo explicitly enables review simulation', async () => {
    const { store } = setup(); const api = new DemoShowcaseApi({ getOwnProfile: async () => ({ id: owner, displayName: 'Owner', isHidden: false } as OwnProfile) }, store, { seed: false, simulateMediaReview: true });
    const saved = await api.save(draft()); await api.upload(saved.id, entryId, 'file://my-demo-photo', 'photo', 'image/jpeg', 'Demo photo');
    const ready = await api.get(saved.id); expect(ready.status).toBe('draft'); expect(ready.revision).toBe(3);
    expect(ready.entries[0]?.media[0]).toMatchObject({ status: 'approved', url: 'file://my-demo-photo' });
    await api.publish(saved.id, 'everyone', ready.revision);
  });
  it('allows a personal event score while requiring explicit attribution of review text', async () => {
    const { api } = setup(); const score = await api.save(draft('event', { meetupIds: [eventId], rating: 4 }));
    expect((await api.publish(score.id, 'everyone', 1)).entries[0]?.rating).toBe(4);
    const review = await api.save(draft('event', { meetupIds: [eventId], review: 'An imported anonymous review.' }));
    await expect(api.publish(review.id, 'everyone', 1)).rejects.toThrow('review_identity_acknowledgement_required');
  });
  it('lets a current group admin approve and withdraws that consent after their role is lost', async () => {
    const { api, store, actAs } = setup(); const groupId = '40000000-0000-4000-8000-000000000001';
    store.groups.set(groupId, { id: groupId, name: 'Crew', ownerId: host, admins: new Set([host, friend]), members: new Set([owner, host, friend]), active: true });
    const saved = await api.save(showcaseSaveInputSchema.parse({ ...draft(), template: 'groups', entries: [{ id: entryId, kind: 'group', groupId }] })); await api.publish(saved.id, 'everyone', 1);
    actAs(friend); const [request] = await api.listApprovals(); expect(request?.recipientId).toBe(host);
    actAs(outsider); await expect(api.respondApproval(request!.id, 'approve')).rejects.toThrow('approval_recipient_required');
    actAs(friend); await api.respondApproval(request!.id, 'approve'); expect(store.approvals.get(request!.id)?.recipientId).toBe(friend);
    actAs(outsider); expect(await api.listProfile(owner)).toHaveLength(1);
    store.groups.get(groupId)!.admins.delete(friend); expect(await api.listProfile(owner)).toEqual([]);
    actAs(friend); expect(await api.listApprovals()).toEqual([]); await expect(api.respondApproval(request!.id, 'revoke')).rejects.toThrow('approval_recipient_required');
  });
});

describe('showcase audience, album and member extensions', () => {
  it('limits chosen-people access to current accepted recipients and hides their list from viewers', async () => {
    const { api, store, actAs } = setup(); const saved = await api.save(draft());
    await expect(api.publish(saved.id, 'people', 1)).rejects.toThrow('invalid_showcase_audience_scope');
    await expect(api.publish(saved.id, 'people', 1, { personIds: [outsider] })).rejects.toThrow('eligible_friend_required');
    const published = await api.publish(saved.id, 'people', 1, { personIds: [friend] });
    expect(published.audiencePeople).toEqual([{ id: friend, displayName: friend }]);
    actAs(outsider); expect(await api.listProfile(owner)).toEqual([]);
    actAs(friend); const viewed = await api.get(saved.id); expect(viewed.audiencePersonIds).toEqual([]); expect(viewed.audiencePeople).toEqual([]);
    store.friendships.clear(); await expect(api.get(saved.id)).rejects.toThrow('showcase_unavailable');
  });
  it('requires current active group membership for both author and viewer', async () => {
    const { api, store, actAs } = setup(); const groupId = '40000000-0000-4000-8000-000000000001';
    store.groups.set(groupId, { id: groupId, name: 'Weekend crew', ownerId: owner, admins: new Set([owner]), members: new Set([owner, friend]), active: true });
    const saved = await api.save(draft()); await api.publish(saved.id, 'group', 1, { groupId });
    actAs(friend); expect((await api.get(saved.id)).audienceGroupName).toBe('Weekend crew');
    actAs(outsider); await expect(api.get(saved.id)).rejects.toThrow('showcase_unavailable');
    store.groups.get(groupId)!.members.delete(owner); actAs(friend); await expect(api.get(saved.id)).rejects.toThrow('showcase_unavailable');
  });
  it('renews exact recipient scope approvals even when the audience category stays the same', async () => {
    const { api, store, actAs } = setup(); store.friendships.add(showcaseDemoPair(owner, outsider));
    const saved = await api.save(draft('person', { personId: friend })); await api.publish(saved.id, 'people', 1, { personIds: [friend] });
    actAs(friend); const [first] = await api.listApprovals(); expect(first!.audiencePersonIds).toEqual([friend]); await api.respondApproval(first!.id, 'approve');
    actAs(owner); await api.publish(saved.id, 'people', (await api.get(saved.id)).revision, { personIds: [outsider] });
    actAs(friend); await expect(api.respondApproval(first!.id, 'revoke')).rejects.toThrow('stale_showcase_approval');
    const [renewed] = await api.listApprovals(); expect(renewed!.audiencePersonIds).toEqual([outsider]);
    actAs(outsider); expect(await api.listProfile(owner)).toEqual([]);
  });
  it('offers the full verified intersection and preserves more than fifty selected shared meetups', async () => {
    const { api, store } = setup(); store.events.delete(hiddenEvent);
    for (let index = 10; index < 70; index++) {
      const id = `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      store.events.set(id, { id, title: `Shared outing ${index}`, seriesId: null, private: false, hostId: host, attendees: new Set([owner, friend]) });
    }
    store.events.set(hiddenEvent, { id: hiddenEvent, title: 'Owner only', seriesId: null, private: false, hostId: host, attendees: new Set([owner]) });
    const shared = await api.pickers(friend); expect(shared.events).toHaveLength(61); expect(shared.events.some(event => event.id === hiddenEvent)).toBe(false);
    const saved = await api.save(draft('person', { personId: friend, meetupIds: shared.events.map(event => event.id) }));
    expect(saved.entries[0]!.meetups).toHaveLength(61);
    await expect(api.save(draft('person', { personId: friend, meetupIds: [hiddenEvent] }))).rejects.toThrow('shared_attendance_required');
  });
  it('only exposes linked album names and IDs through existing unexpired access', async () => {
    const { api, store, actAs } = setup(); const albumId = '60000000-0000-4000-8000-000000000001'; const shareId = '61000000-0000-4000-8000-000000000001';
    store.albums.set(albumId, { id: albumId, ownerId: owner, title: 'Private sketchbook', available: true, viewers: new Map() });
    const saved = await api.save(draft('story', { albumIds: [albumId] })); await api.publish(saved.id, 'everyone', 1);
    actAs(friend); let viewed = await api.get(saved.id); expect(viewed.entries[0]!.albums).toEqual([]); expect(viewed.entries[0]!.albumIds).toEqual([]);
    store.albums.get(albumId)!.viewers.set(friend, { shareId }); viewed = await api.get(saved.id);
    expect(viewed.entries[0]!.albums).toEqual([{ id: albumId, title: 'Private sketchbook', shareId }]);
    store.albums.get(albumId)!.viewers.get(friend)!.expiresAt = '2000-01-01'; expect((await api.get(saved.id)).entries[0]!.albums).toEqual([]);
    actAs(owner); expect((await api.pickers()).albums).toEqual([{ id: albumId, title: 'Private sketchbook' }]);
    store.albums.get(albumId)!.ownerId = outsider; await expect(api.save(draft('story', { albumIds: [albumId] }))).rejects.toThrow('owned_album_required');
  });
  it('freezes member names, obtains individual consent outside the group, and suppresses opt-outs immediately', async () => {
    const { api, store, actAs } = setup(); const groupId = '40000000-0000-4000-8000-000000000001';
    store.groups.set(groupId, { id: groupId, name: 'Crew', ownerId: owner, admins: new Set([owner]), members: new Set([owner, friend]), active: true });
    const saved = await api.save(showcaseSaveInputSchema.parse({ ...draft(), template: 'groups', entries: [{ id: entryId, kind: 'group', groupId, title: 'Our crew', showMembers: true }] }));
    await api.publish(saved.id, 'everyone', 1); actAs(outsider);
    expect((await api.get(saved.id)).entries[0]!.groupMembers.map(member => member.id)).toEqual([owner]);
    actAs(friend); const [approval] = await api.listApprovals(); expect(approval!.role).toBe('person'); await api.respondApproval(approval!.id, 'approve');
    actAs(outsider); expect((await api.get(saved.id)).entries[0]!.groupMembers.map(member => member.id)).toEqual([owner, friend]);
    store.groups.get(groupId)!.members.add(host); expect((await api.get(saved.id)).entries[0]!.groupMembers.map(member => member.id)).not.toContain(host);
    actAs(friend); await api.setGroupMemberVisibility(groupId, false); actAs(outsider);
    expect((await api.get(saved.id)).entries[0]!.groupMembers.map(member => member.id)).toEqual([owner]);
    actAs(friend); await api.setGroupMemberVisibility(groupId, true); actAs(outsider);
    expect((await api.get(saved.id)).entries[0]!.groupMembers.map(member => member.id)).toEqual([owner]);
    await expect(api.setGroupMemberVisibility(groupId, false)).rejects.toThrow('active_group_membership_required');
  });
});

describe('chosen group contacts', () => {
  it('lets an author choose a current group contact and withdraws access after they leave', async () => {
    const { api, store, actAs } = setup(); const groupId = '40000000-0000-4000-8000-000000000001';
    store.groups.set(groupId, { id: groupId, name: 'Crew', ownerId: owner, admins: new Set([owner]), members: new Set([owner, outsider]), active: true });
    const saved = await api.save(draft()); await api.publish(saved.id, 'people', 1, { personIds: [outsider] });
    actAs(outsider); expect((await api.get(saved.id)).entries).toHaveLength(1);
    store.groups.get(groupId)!.members.delete(outsider); await expect(api.get(saved.id)).rejects.toThrow('showcase_unavailable');
  });
});


describe('current member approval preview permissions', () => {
  const groupId = '40000000-0000-4000-8000-000000000001';
  function memberStory() {
    return showcaseSaveInputSchema.parse({ ...draft(), template: 'groups', entries: [{ id: entryId, kind: 'group', groupId, title: 'Our crew', showMembers: true }] });
  }
  it('removes member requests and rejects responses after leaving or hiding membership', async () => {
    const { api, store, actAs } = setup();
    store.groups.set(groupId, { id: groupId, name: 'Crew', ownerId: owner, admins: new Set([owner]), members: new Set([owner, friend]), active: true });
    const saved = await api.save(memberStory()); await api.publish(saved.id, 'everyone', 1);
    actAs(friend); const [request] = await api.listApprovals(); expect(request).toBeDefined();
    store.groups.get(groupId)!.members.delete(friend);
    expect(await api.listApprovals()).toEqual([]);
    await expect(api.respondApproval(request!.id, 'approve')).rejects.toThrow('approval_recipient_required');
    store.groups.get(groupId)!.members.add(friend); await api.setGroupMemberVisibility(groupId, false);
    expect(await api.listApprovals()).toEqual([]);
    await expect(api.respondApproval(request!.id, 'approve')).rejects.toThrow('approval_recipient_required');
    actAs(outsider); expect((await api.get(saved.id)).entries[0]!.groupMembers.map(member => member.id)).toEqual([owner]);
    actAs(friend); await api.setGroupMemberVisibility(groupId, true); await api.respondApproval(request!.id, 'approve');
    await api.respondApproval(request!.id, 'approve');
    actAs(outsider); expect((await api.get(saved.id)).entries[0]!.groupMembers.map(member => member.id)).toEqual([owner, friend]);
  });
  it('requires host context before a non-attending member can preview a selected private outing', async () => {
    const { api, store, actAs } = setup();
    store.groups.set(groupId, { id: groupId, name: 'Crew', ownerId: owner, admins: new Set([owner]), members: new Set([owner, outsider]), active: true });
    const input = memberStory(); input.entries[0]!.meetupIds = [hiddenEvent];
    const saved = await api.save(input); await api.publish(saved.id, 'everyone', 1);
    const member = [...store.approvals.values()].find(request => request.recipientId === outsider)!;
    actAs(outsider); expect(await api.listApprovals()).toEqual([]);
    await expect(api.respondApproval(member.id, 'approve')).rejects.toThrow('approval_recipient_required');
    actAs(host); const [hostRequest] = await api.listApprovals(); await api.respondApproval(hostRequest!.id, 'approve');
    actAs(outsider); expect((await api.listApprovals())[0]!.snapshot.meetups).toEqual([{ id: hiddenEvent, title: 'Private second visit' }]);
    store.blocks.add(showcaseDemoPair(outsider, host)); expect(await api.listApprovals()).toEqual([]);
    await expect(api.respondApproval(member.id, 'approve')).rejects.toThrow('approval_recipient_required');
    store.blocks.clear();
    actAs(host); await api.respondApproval(hostRequest!.id, 'revoke');
    actAs(outsider); expect(await api.listApprovals()).toEqual([]);
  });
  it('requires uploader consent for a member preview without original media access and honors revocation', async () => {
    const { api, store, actAs } = setup(); const mediaId = '50000000-0000-4000-8000-000000000001';
    store.groups.set(groupId, { id: groupId, name: 'Crew', ownerId: owner, admins: new Set([owner]), members: new Set([owner, outsider]), active: true });
    store.uploads.set(mediaId, { id: mediaId, kind: 'photo', caption: 'Private image', uploaderId: friend, status: 'approved', available: true, url: 'https://example.test/private-photo', posterUrl: 'https://example.test/private-poster', meetupId: hiddenEvent });
    const input = memberStory(); input.entries[0]!.meetupIds = [hiddenEvent]; input.entries[0]!.media = [{ id: mediaId, sourceUploadId: mediaId, kind: 'photo', caption: 'Private image' }];
    const saved = await api.save(input); await api.publish(saved.id, 'everyone', 1);
    actAs(host); const [hostRequest] = await api.listApprovals(); await api.respondApproval(hostRequest!.id, 'approve');
    actAs(outsider); expect((await api.listApprovals())[0]!.snapshot.media).toEqual([]);
    actAs(friend); const [mediaRequest] = await api.listApprovals(); expect(mediaRequest!.snapshot.media[0]!.url).toBe('https://example.test/private-photo');
    await api.respondApproval(mediaRequest!.id, 'approve');
    actAs(outsider); expect((await api.listApprovals())[0]!.snapshot.media[0]!.url).toBe('https://example.test/private-photo');
    actAs(friend); await api.respondApproval(mediaRequest!.id, 'revoke');
    actAs(outsider); expect((await api.listApprovals())[0]!.snapshot.media).toEqual([]);
    actAs(friend); await api.respondApproval(mediaRequest!.id, 'approve');
    actAs(outsider); expect((await api.listApprovals())[0]!.snapshot.media).toHaveLength(1);
    store.people.get(friend)!.active = false; expect(await api.listApprovals()).toEqual([]);
  });
});
