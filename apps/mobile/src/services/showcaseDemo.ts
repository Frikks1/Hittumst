import * as Crypto from 'expo-crypto';
import {
  showcaseSchema, showcaseSaveInputSchema, showcaseAudienceSchema, showcaseCaptionSchema,
  showcaseApprovalActionSchema, showcaseEntrySchema, type Showcase, type ShowcaseEntry,
  type ShowcaseSaveInput, type ShowcaseApproval, type ShowcaseApprovalAction, type ShowcasePickers,
  type ShowcasePickerMedia, type ShowcaseAudience, type ShowcaseAudienceScope, validateShowcaseAudienceScope,
} from '@rummal/shared';
import type { RummalApi } from './types';
import { validateMemoryMedia } from './memoryWallTypes';
import type { ShowcaseApi } from './showcaseTypes';

export type ShowcaseDemoSource = Pick<RummalApi, 'getOwnProfile'> & Partial<Pick<RummalApi, 'getProfile' | 'listFriends' | 'listGroups' | 'listGroupMembers' | 'listBlocked' | 'listMyAlbums' | 'listAlbumShares'>>;
export type DemoShowcaseEvent = { id: string; title: string; seriesId: string | null; private: boolean; hostId: string; attendees: Set<string>; ownReview?: string; available?: boolean };
export type DemoShowcaseGroup = { id: string; name: string; ownerId: string; admins: Set<string>; members: Set<string>; active: boolean };
export type DemoShowcaseUpload = ShowcasePickerMedia & { status: 'pending' | 'approved' | 'rejected'; available: boolean };
export type DemoShowcaseAlbum = { id: string; ownerId: string; title: string; available: boolean; viewers: Map<string, { shareId: string; expiresAt?: string }> };
export const showcaseDemoPair = (a: string, b: string) => [a, b].sort().join('|');
export class DemoShowcaseStore {
  showcases = new Map<string, Showcase>();
  approvals = new Map<string, ShowcaseApproval>();
  events = new Map<string, DemoShowcaseEvent>();
  groups = new Map<string, DemoShowcaseGroup>();
  people = new Map<string, { displayName: string; active: boolean; visible: boolean }>();
  friendships = new Set<string>();
  blocks = new Set<string>();
  uploads = new Map<string, DemoShowcaseUpload>();
  attachedUploads = new Map<string, { showcaseId: string; entryId: string }>();
  countContributors = new Map<string, string[]>();
  groupSelfAuthorizations = new Set<string>();
  groupMemberVisibility = new Map<string, boolean>();
  groupMemberContributors = new Map<string, string[]>();
  memberApprovalIds = new Set<string>();
  albums = new Map<string, DemoShowcaseAlbum>();
  reports: Array<{ reporterId: string; showcaseId: string; entryId?: string; notes: string }> = [];
  seeded = false;
}
const copy = <T,>(value: T): T => structuredClone(value);

/** Explicit synthetic consent/attendance state; actor switching permits real two-person demo flows. */
export class DemoShowcaseApi implements ShowcaseApi {
  private sourceBlocks = new Set<string>();
  private sourceFriends = new Set<string>();
  private sourceGroups = new Set<string>();
  constructor(private readonly source: ShowcaseDemoSource, readonly store = new DemoShowcaseStore(), private readonly options: { viewerId?: () => string; seed?: boolean; simulateMediaReview?: boolean } = {}) {}
  private async actor() {
    const own = await this.source.getOwnProfile();
    const actor = this.options.viewerId?.() ?? own.id;
    if (!this.store.people.has(own.id)) this.store.people.set(own.id, { displayName: own.displayName, active: true, visible: !own.isHidden });
    if (!this.store.people.has(actor)) this.store.people.set(actor, { displayName: actor, active: true, visible: true });
    if (this.options.seed !== false && !this.store.seeded) this.seed(own.id, own.displayName, own.photos?.find(photo => photo.status === 'approved')?.url);
    if (!this.store.people.get(actor)?.active) throw new Error('active_account_required');
    return actor;
  }
  private seed(ownerId: string, name: string, samplePhoto?: string) {
    this.store.seeded = true;
    const peer = 'p-bjarni';
    this.store.people.set(peer, { displayName: 'Bjarni', active: true, visible: true });
    this.store.friendships.add(showcaseDemoPair(ownerId, peer));
    const seriesId = '71000000-0000-4000-8000-000000000010';
    for (let index = 1; index <= 3; index++) {
      const eventId = `71000000-0000-4000-8000-00000000000${index}`;
      this.store.events.set(eventId, { id: eventId, title: index === 1 ? 'Sunday walks by the harbour' : `Sunday walks · visit ${index}`, seriesId, private: false, hostId: peer, attendees: new Set([ownerId, peer]), available: true, ownReview: 'Good company and a relaxed walk.' });
    }
    const groupId = '72000000-0000-4000-8000-000000000001';
    this.store.groups.set(groupId, { id: groupId, name: 'Weekend friends', ownerId: peer, admins: new Set([peer]), members: new Set([ownerId, peer]), active: true });
    const entry = showcaseEntrySchema.parse({ id: Crypto.randomUUID(), kind: 'event', title: 'My favourite walks', body: 'The kind of afternoon I want more of.', meetupIds: ['71000000-0000-4000-8000-000000000001'], showCount: true, verifiedCount: 3, approvalStatus: 'approved', meetups: [{ id: '71000000-0000-4000-8000-000000000001', title: 'Sunday walks by the harbour' }] });
    const showcase = showcaseSchema.parse({ id: Crypto.randomUUID(), ownerId, template: 'hittingar', title: 'Out and about', introduction: 'A few gatherings I chose to share.', layout: 'list', audience: 'everyone', status: 'published', revision: 1, entries: [entry] });
    this.store.showcases.set(showcase.id, showcase);
    this.store.countContributors.set(`${showcase.id}:${entry.id}:1`, [...this.store.events.keys()]);
    const draft = showcaseSchema.parse({ id: Crypto.randomUUID(), ownerId, template: 'groups', title: 'My weekend crew', revision: 1, order: 1, entries: [{ id: Crypto.randomUUID(), kind: 'group', groupId, groupName: 'The walking crew', title: 'Weekend friends', body: 'Walks, coffee and catching up.', meetupIds: [entry.meetupIds[0]], requirements: { minAge: 18, memberType: 'Friends who like easy walks', text: 'Message me if you would like to hear more.' } }] });
    this.store.showcases.set(draft.id, draft);
    const peerEntry = showcaseEntrySchema.parse({ id: Crypto.randomUUID(), kind: 'person', personId: ownerId, title: name, body: 'Always up for good conversation after a walk.', meetupIds: [entry.meetupIds[0]], showCount: true, verifiedCount: 3, approvalStatus: 'pending', meetups: entry.meetups });
    const peerShowcase = showcaseSchema.parse({ id: Crypto.randomUUID(), ownerId: peer, template: 'people', title: 'Favourite people', audience: 'friends', status: 'published', revision: 1, entries: [peerEntry] });
    this.store.showcases.set(peerShowcase.id, peerShowcase);
    this.store.countContributors.set(`${peerShowcase.id}:${peerEntry.id}:1`, [...this.store.events.keys()]);
    this.addApproval(peerShowcase, peerEntry, 'person', ownerId);
    this.addApproval(peerShowcase, peerEntry, 'person', ownerId, true);
    const story = showcaseSchema.parse({ id: Crypto.randomUUID(), ownerId: peer, template: 'passions', title: 'A little of what I love', introduction: 'Good coffee, fresh air and new people.', audience: 'everyone', status: 'published', revision: 1, order: 1, entries: [{ id: Crypto.randomUUID(), kind: 'story', title: 'An ordinary good day', body: 'A walk by the water followed by coffee with friends.', approvalStatus: 'approved' }] });
    this.store.showcases.set(story.id, story);
    if (samplePhoto) {
      const mediaId = Crypto.randomUUID();
      this.store.uploads.set(mediaId, { id: mediaId, kind: 'photo', caption: 'A little of my world', uploaderId: ownerId, url: samplePhoto, status: 'approved', available: true });
      const gallery = showcaseSchema.parse({ id: Crypto.randomUUID(), ownerId, template: 'creations', title: 'A little of my world', introduction: 'A space for the things I make and love.', layout: 'gallery', coverMediaId: mediaId, audience: 'everyone', status: 'published', revision: 1, order: 2, entries: [{ id: Crypto.randomUUID(), kind: 'story', title: 'My latest inspiration', body: 'Add a photo, video or a story to make this yours.', approvalStatus: 'approved', media: [{ id: mediaId, kind: 'photo', caption: 'A little of my world' }] }] });
      this.store.showcases.set(gallery.id, gallery);
    }
  }
  private blocked(a: string, b: string) { return this.store.blocks.has(showcaseDemoPair(a, b)); }
  private friends(a: string, b: string) { return this.store.friendships.has(showcaseDemoPair(a, b)) && !this.blocked(a, b); }
  private groupAdmin(groupId: string | undefined, actor: string) {
    const group = groupId ? this.store.groups.get(groupId) : undefined;
    return Boolean(group?.active && group.members.has(actor) && this.store.people.get(actor)?.active && (group.ownerId === actor || group.admins.has(actor)));
  }
  private own(showcaseId: string, actor: string) {
    const showcase = this.store.showcases.get(showcaseId);
    if (!showcase || showcase.ownerId !== actor) throw new Error('showcase_owner_required');
    return showcase;
  }
  private audienceContact(owner: string, personId: string) {
    const person = this.store.people.get(personId);
    return personId !== owner && person?.active && person.visible && !this.blocked(owner, personId)
      && (this.friends(owner, personId) || [...this.store.groups.values()].some(group => group.active && group.members.has(owner) && group.members.has(personId)));
  }
  private activeMember(groupId: string | null | undefined, actor: string) {
    const group = groupId ? this.store.groups.get(groupId) : undefined;
    return Boolean(group?.active && group.members.has(actor) && this.store.people.get(actor)?.active);
  }
  private members(groupId: string, viewer: string) {
    const group = this.store.groups.get(groupId);
    return group?.active ? [...group.members].filter(member => {
      const person = this.store.people.get(member);
      return person?.active && person.visible && !this.blocked(viewer, member)
        && this.store.groupMemberVisibility.get(`${groupId}:${member}`) !== false;
    }) : [];
  }
  private albumLinks(entry: ShowcaseEntry, owner: string, viewer: string) {
    return entry.albumIds.flatMap(albumId => {
      const album = this.store.albums.get(albumId);
      if (!album?.available || album.ownerId !== owner || this.blocked(owner, viewer)) return [];
      if (owner === viewer) return [{ id: album.id, title: album.title }];
      const access = album.viewers.get(viewer);
      return access && (!access.expiresAt || Date.parse(access.expiresAt) > Date.now())
        ? [{ id: album.id, title: album.title, shareId: access.shareId }] : [];
    });
  }
  private memberRoster(showcase: Showcase, entry: ShowcaseEntry, viewer: string) {
    if (!entry.groupId || !entry.showMembers) return [];
    const current = new Set(this.members(entry.groupId, viewer));
    const frozen = this.store.groupMemberContributors.get(`${showcase.id}:${entry.id}:${showcase.revision}`) ?? [];
    return frozen.filter(member => current.has(member) && (this.activeMember(entry.groupId, viewer)
      || member === showcase.ownerId || member === viewer || this.currentApprovals(showcase, entry).some(approval => this.store.memberApprovalIds.has(approval.id)
        && approval.recipientId === member && approval.status === 'approved' && !this.blocked(showcase.ownerId, member))))
      .map(member => ({ id: member, displayName: this.store.people.get(member)!.displayName }));
  }
  private audienceLabels(showcase: Showcase, viewer: string) {
    return { audienceGroupName: showcase.audienceGroupId && this.activeMember(showcase.audienceGroupId, viewer) ? this.store.groups.get(showcase.audienceGroupId)?.name ?? null : null,
      audiencePeople: showcase.audiencePersonIds.flatMap(personId => { const person = this.store.people.get(personId); return person?.active && person.visible && !this.blocked(viewer, personId) ? [{ id: personId, displayName: person.displayName }] : []; }) };
  }
  private async refreshGraph(actor: string) {
    const own = await this.source.getOwnProfile();
    if (own.id !== actor) return;
    const person = this.store.people.get(actor); if (person) person.visible = !own.isHidden;
    if (this.source.listMyAlbums) {
      for (const album of this.store.albums.values()) if (album.ownerId === actor) album.available = false;
      for (const album of await this.source.listMyAlbums()) {
        const previous = this.store.albums.get(album.id);
        this.store.albums.set(album.id, { id: album.id, ownerId: actor, title: album.name, available: true, viewers: previous?.viewers ?? new Map() });
      }
    }
    if (this.source.listAlbumShares) {
      for (const album of this.store.albums.values()) if (album.ownerId === actor) album.viewers.clear();
      for (const share of await this.source.listAlbumShares()) {
        if (share.ownerId !== actor || share.status !== 'accepted' || share.expiresAt && Date.parse(share.expiresAt) <= Date.now()) continue;
        this.store.albums.get(share.albumId)?.viewers.set(share.recipientId, { shareId: share.id, expiresAt: share.expiresAt });
      }
    }
    if (this.source.listBlocked) {
      for (const pair of this.sourceBlocks) this.store.blocks.delete(pair);
      this.sourceBlocks = new Set((await this.source.listBlocked()).map(blocked => showcaseDemoPair(actor, blocked.id)));
      for (const pair of this.sourceBlocks) this.store.blocks.add(pair);
    }
    if (this.source.listFriends) {
      for (const pair of this.sourceFriends) this.store.friendships.delete(pair); this.sourceFriends.clear();
      for (const friend of await this.source.listFriends()) if (friend.status === 'accepted') {
        this.store.people.set(friend.profileId, { displayName: friend.displayName, active: true, visible: true });
        const pair = showcaseDemoPair(actor, friend.profileId); this.store.friendships.add(pair); this.sourceFriends.add(pair);
      }
    }
    if (this.source.listGroups) {
      for (const groupId of this.sourceGroups) this.store.groups.get(groupId)?.members.delete(actor); this.sourceGroups.clear();
      for (const group of await this.source.listGroups()) if (group.membershipStatus !== 'invited') {
      let stored = this.store.groups.get(group.id);
      if (!stored) { stored = { id: group.id, name: group.name, ownerId: actor, admins: new Set(), members: new Set(), active: true }; this.store.groups.set(group.id, stored); }
      stored.members.add(actor); stored.active = true; this.sourceGroups.add(group.id);
      stored.admins.delete(actor);
      if (group.role === 'owner' || group.role === 'admin') stored.admins.add(actor);
      if (this.source.listGroupMembers) { stored.members = new Set([actor]); stored.admins = new Set(group.role === 'owner' || group.role === 'admin' ? [actor] : []); }
      if (this.source.listGroupMembers) for (const member of await this.source.listGroupMembers(group.id)) if (member.status === 'active') {
        stored.members.add(member.profileId); if (member.role === 'owner') stored.ownerId = member.profileId;
        if (!this.store.people.has(member.profileId)) this.store.people.set(member.profileId, { displayName: member.displayName, active: true, visible: true });
        if (member.role === 'owner' || member.role === 'admin') stored.admins.add(member.profileId);
      }
      }
    }
  }
  private countEvents(entry: ShowcaseEntry, ownerId: string) {
    const events = [...this.store.events.values()].filter(event => event.available !== false && event.attendees.has(ownerId));

    const selected = entry.meetupIds.map(meetupId => this.store.events.get(meetupId)).filter((event): event is DemoShowcaseEvent => Boolean(event));
    const series = new Set(selected.flatMap(event => event.seriesId ? [event.seriesId] : []));
    return events.filter(event => (!entry.personId || event.attendees.has(entry.personId)) && (entry.meetupIds.includes(event.id) || Boolean(event.seriesId && series.has(event.seriesId))));
  }
  private validateEntry(entry: ShowcaseEntry, ownerId: string) {
    if (entry.kind === 'person' && (!entry.personId || !this.friends(ownerId, entry.personId) || !this.store.people.get(entry.personId)?.active || !this.store.people.get(entry.personId)?.visible)) throw new Error('eligible_friend_required');
    if (entry.kind === 'group') {
      const group = entry.groupId ? this.store.groups.get(entry.groupId) : undefined;
      if (!group?.active || !group.members.has(ownerId)) throw new Error('active_group_membership_required');
      if (entry.showCount) throw new Error('group_attendance_count_unavailable');
    }
    if (entry.kind === 'event' && !entry.meetupIds.length) throw new Error('attended_event_required');
    for (const meetupId of entry.meetupIds) {
      const event = this.store.events.get(meetupId);
      if (!event || event.available === false || !event.attendees.has(ownerId) || this.blocked(ownerId, event.hostId)) throw new Error('verified_attendance_required');
      if (entry.personId && !event.attendees.has(entry.personId)) throw new Error('shared_attendance_required');
    }
    if (entry.showMembers && entry.kind !== 'group') throw new Error('group_members_required');
    if (new Set(entry.albumIds).size !== entry.albumIds.length) throw new Error('duplicate_album');
    for (const albumId of entry.albumIds) {
      const album = this.store.albums.get(albumId);
      if (!album || album.ownerId !== ownerId) throw new Error('owned_album_required');
    }
    for (const meetupId of [entry.requirements?.meetupId]) if (meetupId) {
      const event = this.store.events.get(meetupId);
      if (!event || event.available === false || this.blocked(ownerId, event.hostId) || event.private && !event.attendees.has(ownerId) && event.hostId !== ownerId) throw new Error('requirement_event_unavailable');
    }
    for (const media of entry.media) {
      const upload = this.store.uploads.get(media.sourceUploadId ?? media.id);
      if (!upload || upload.status !== 'approved' || !upload.available || !this.store.people.get(upload.uploaderId)?.active || this.blocked(ownerId, upload.uploaderId)) throw new Error('approved_media_required');
      if (upload.meetupId && !entry.meetupIds.includes(upload.meetupId)) throw new Error('media_event_not_selected');
    }
  }
  private invalidate(showcase: Showcase) {
    for (const approval of this.store.approvals.values()) if (approval.showcaseId === showcase.id && approval.status !== 'revoked') approval.status = 'revoked';
    showcase.revision++; showcase.status = 'draft'; showcase.audience = null; showcase.audienceGroupId = null; showcase.audiencePersonIds = []; showcase.audienceGroupName = null; showcase.audiencePeople = [];
    for (const entry of showcase.entries) { entry.approvalStatus = 'draft'; entry.verifiedCount = null; }
  }
  private hydrate(showcase: Showcase, includePending = true) {
    return { ...copy(showcase), ...this.audienceLabels(showcase, showcase.ownerId), entries: showcase.entries.map(entry => ({ ...copy(entry),
      meetups: entry.meetupIds.flatMap(meetupId => { const event = this.store.events.get(meetupId); return event && event.available !== false ? [{ id: event.id, title: event.title }] : []; }),
      requirementMeetups: [entry.requirements?.meetupId].flatMap(meetupId => { const event = meetupId ? this.store.events.get(meetupId) : undefined; return event && event.available !== false ? [{ id: event.id, title: event.title }] : []; }),
      albums: entry.albumIds.flatMap(albumId => { const album = this.store.albums.get(albumId); return album?.available ? [{ id: album.id, title: album.title }] : []; }),
      groupMembers: entry.groupId && entry.showMembers ? (showcase.status === 'published' ? this.memberRoster(showcase, entry, showcase.ownerId) : this.members(entry.groupId, showcase.ownerId).map(member => ({ id: member, displayName: this.store.people.get(member)!.displayName }))) : [],
      media: entry.media.flatMap(media => { const upload = this.store.uploads.get(media.sourceUploadId ?? media.id); return upload?.available && (includePending || upload.status === 'approved') ? [{ ...copy(media), status: upload.status, url: upload.status === 'approved' ? upload.url : undefined, posterUrl: upload.status === 'approved' ? upload.posterUrl : undefined }] : []; }),
    })) };
  }
  private currentApprovals(showcase: Showcase, entry: ShowcaseEntry) { return [...this.store.approvals.values()].filter(approval => approval.showcaseId === showcase.id && approval.entryId === entry.id && approval.revision === showcase.revision && approval.audience === showcase.audience
    && approval.audienceGroupId === showcase.audienceGroupId && JSON.stringify(approval.audiencePersonIds) === JSON.stringify(showcase.audiencePersonIds)); }
  private approved(showcase: Showcase, entry: ShowcaseEntry) {
    const approvals = this.currentApprovals(showcase, entry).filter(approval => !approval.countOnly && !this.store.memberApprovalIds.has(approval.id));
    return entry.approvalStatus === 'approved' && approvals.every(approval => approval.status === 'approved'
      && this.store.people.get(approval.recipientId)?.active && !this.blocked(approval.recipientId, showcase.ownerId)
      && (approval.role !== 'group' || this.groupAdmin(entry.groupId, approval.recipientId)));
  }
  private visible(showcase: Showcase, actor: string) {
    const owner = this.store.people.get(showcase.ownerId);
    return owner?.active && owner.visible && !this.blocked(showcase.ownerId, actor) && showcase.status === 'published'
      && (showcase.audience === 'everyone' || showcase.audience === 'friends' && this.friends(showcase.ownerId, actor)
        || showcase.audience === 'people' && showcase.audiencePersonIds.includes(actor) && this.audienceContact(showcase.ownerId, actor)
        || showcase.audience === 'group' && this.activeMember(showcase.audienceGroupId, showcase.ownerId) && this.activeMember(showcase.audienceGroupId, actor));
  }
  private projection(showcase: Showcase, actor: string) {
    if (!this.visible(showcase, actor)) return null;
    const hydrated = this.hydrate(showcase, false);
    hydrated.entries = hydrated.entries.filter(entry => {
      if (!this.approved(showcase, entry)) return false;
      if (entry.groupId && this.store.groupSelfAuthorizations.has(`${showcase.id}:${entry.id}:${showcase.revision}`)) {
        if (!this.groupAdmin(entry.groupId, showcase.ownerId)) return false;
      }

      try { this.validateEntry(entry, showcase.ownerId); } catch { return false; }
      if (entry.personId && (this.blocked(actor, entry.personId) || !this.store.people.get(entry.personId)?.visible)) return false;
      return !entry.meetupIds.some(meetupId => { const event = this.store.events.get(meetupId); return event && this.blocked(actor, event.hostId); });
    }).map(entry => {
      const frozen = this.store.countContributors.get(`${showcase.id}:${entry.id}:${showcase.revision}`) ?? [];
      const countAllowed = this.currentApprovals(showcase, entry).filter(approval => approval.countOnly).every(approval => approval.status === 'approved' && this.store.people.get(approval.recipientId)?.active && !this.blocked(approval.recipientId, showcase.ownerId))
        && frozen.every(meetupId => { const event = this.store.events.get(meetupId); return event && event.available !== false && event.attendees.has(showcase.ownerId)
          && (!entry.personId || event.attendees.has(entry.personId)) && !this.blocked(showcase.ownerId, event.hostId) && !this.blocked(actor, event.hostId); });
      const albums = this.albumLinks(entry, showcase.ownerId, actor);
      return { ...entry, verifiedCount: countAllowed ? entry.verifiedCount : null, albums, albumIds: albums.map(album => album.id), groupMembers: this.memberRoster(showcase, entry, actor),
        media: entry.media.filter(media => { const upload = this.store.uploads.get(media.sourceUploadId ?? media.id); return upload && !this.blocked(actor, upload.uploaderId); }) };
    });
    if (hydrated.coverMediaId && !hydrated.entries.some(entry => entry.media.some(media => media.id === hydrated.coverMediaId))) hydrated.coverMediaId = null;
    // A visitor's showcase payload never enumerates the other selected recipients.
    hydrated.audiencePersonIds = []; hydrated.audiencePeople = [];
    hydrated.audienceGroupName = showcase.audienceGroupId && this.activeMember(showcase.audienceGroupId, actor) ? this.store.groups.get(showcase.audienceGroupId)?.name ?? null : null;
    return hydrated.entries.length ? hydrated : null;
  }
  async listOwn() { const actor = await this.actor(); await this.refreshGraph(actor); return [...this.store.showcases.values()].filter(showcase => showcase.ownerId === actor).sort((a, b) => a.order - b.order).map(showcase => this.hydrate(showcase)); }
  async listProfile(ownerId: string) { const actor = await this.actor(); await this.refreshGraph(actor); return [...this.store.showcases.values()].filter(showcase => showcase.ownerId === ownerId).sort((a, b) => a.order - b.order).flatMap(showcase => { const visible = this.projection(showcase, actor); return visible ? [visible] : []; }); }
  async get(showcaseId: string) { const actor = await this.actor(); await this.refreshGraph(actor); const showcase = this.store.showcases.get(showcaseId); if (!showcase) throw new Error('showcase_unavailable'); const result = showcase.ownerId === actor ? this.hydrate(showcase) : this.projection(showcase, actor); if (!result) throw new Error('showcase_unavailable'); return result; }
  async save(input: ShowcaseSaveInput) {
    const parsed = showcaseSaveInputSchema.parse(input); const actor = await this.actor(); await this.refreshGraph(actor);
    const existing = parsed.id ? this.own(parsed.id, actor) : undefined;
    if (parsed.expectedRevision !== (existing?.revision ?? 0)) throw new Error('showcase_revision_conflict');
    if (new Set(parsed.entries.map(entry => entry.id)).size !== parsed.entries.length) throw new Error('duplicate_showcase_entry');
    const entries = parsed.entries.map(entry => showcaseEntrySchema.parse(entry));
    for (const entry of entries) this.validateEntry(entry, actor);
    if (parsed.coverMediaId && !entries.some(entry => entry.media.some(media => media.id === parsed.coverMediaId))) throw new Error('invalid_showcase_cover');
    if (existing) this.invalidate(existing);
    const showcase = showcaseSchema.parse({ ...parsed, id: existing?.id ?? Crypto.randomUUID(), ownerId: actor, audience: null, status: 'draft', revision: existing?.revision ?? 1, order: existing?.order ?? [...this.store.showcases.values()].filter(item => item.ownerId === actor).length, entries });
    this.store.showcases.set(showcase.id, showcase); return this.hydrate(showcase);
  }
  private addApproval(showcase: Showcase, entry: ShowcaseEntry, role: ShowcaseApproval['role'], recipientId: string, countOnly = false, member = false) {
    if (recipientId === showcase.ownerId || this.currentApprovals(showcase, entry).some(approval => approval.role === role && approval.recipientId === recipientId && approval.countOnly === countOnly && this.store.memberApprovalIds.has(approval.id) === member)) return;
    const approval: ShowcaseApproval = { id: Crypto.randomUUID(), showcaseId: showcase.id, entryId: entry.id, revision: showcase.revision,
      role, recipientId, status: 'pending', audience: showcase.audience!, audienceGroupId: showcase.audienceGroupId, audiencePersonIds: [...showcase.audiencePersonIds],
      ...this.audienceLabels(showcase, recipientId), showcaseTitle: showcase.title,
      entryTitle: entry.title, entryBody: entry.body, snapshot: this.hydrate(showcase).entries.find(item => item.id === entry.id)!, countOnly };
    if (countOnly) approval.snapshot = showcaseEntrySchema.parse({
      id: entry.id, kind: 'story', title: 'Verified attendance', showCount: true,
      verifiedCount: entry.verifiedCount, approvalStatus: 'pending',
    });
    this.store.approvals.set(approval.id, approval);
    if (member) this.store.memberApprovalIds.add(approval.id);
  }
  async publish(showcaseId: string, audience: ShowcaseAudience, expectedRevision: number, scope: ShowcaseAudienceScope = {}) {
    const parsedAudience = showcaseAudienceSchema.parse(audience); const actor = await this.actor(); await this.refreshGraph(actor); const showcase = this.own(showcaseId, actor);
    const selectedScope = validateShowcaseAudienceScope(parsedAudience, scope);
    if (selectedScope.groupId && !this.activeMember(selectedScope.groupId, actor)) throw new Error('active_group_membership_required');
    if (selectedScope.personIds.some(personId => !this.audienceContact(actor, personId))) throw new Error('eligible_friend_required');
    if (showcase.revision !== expectedRevision) throw new Error('showcase_revision_conflict');
    if (!showcase.entries.length) throw new Error('showcase_entries_required');
    for (const entry of showcase.entries) { this.validateEntry(entry, actor); if (entry.review && !entry.reviewIdentified) throw new Error('review_identity_acknowledgement_required'); }
    this.invalidate(showcase); showcase.status = 'published'; showcase.audience = parsedAudience; showcase.audienceGroupId = selectedScope.groupId ?? null; showcase.audiencePersonIds = [...selectedScope.personIds].sort();
    for (const entry of showcase.entries) {
      entry.verifiedCount = entry.showCount ? this.countEvents(entry, actor).length : null;
      this.store.countContributors.set(`${showcase.id}:${entry.id}:${showcase.revision}`, entry.showCount ? this.countEvents(entry, actor).map(event => event.id) : []);
      entry.meetups = entry.meetupIds.map(meetupId => ({ id: meetupId, title: this.store.events.get(meetupId)!.title }));
      entry.approvalStatus = 'approved';
      const roster = entry.groupId && entry.showMembers ? this.members(entry.groupId, actor) : [];
      this.store.groupMemberContributors.set(`${showcase.id}:${entry.id}:${showcase.revision}`, roster);
      if (audience !== 'no_one') {
        if (entry.personId) { this.addApproval(showcase, entry, 'person', entry.personId); if (entry.showCount) this.addApproval(showcase, entry, 'person', entry.personId, true); }
        if (entry.groupId) { const group = this.store.groups.get(entry.groupId)!; if (!group.admins.has(actor) && group.ownerId !== actor) this.addApproval(showcase, entry, 'group', group.ownerId); else this.store.groupSelfAuthorizations.add(`${showcase.id}:${entry.id}:${showcase.revision}`); }
        for (const member of roster) this.addApproval(showcase, entry, 'person', member, false, true);
        const selected = new Set([...entry.meetupIds, ...[entry.requirements?.meetupId].filter((meetupId): meetupId is string => Boolean(meetupId))]);
        for (const meetupId of selected) { const event = this.store.events.get(meetupId)!; if (event.private) this.addApproval(showcase, entry, 'host', event.hostId); }
        if (entry.showCount) for (const event of this.countEvents(entry, actor)) if (event.private) this.addApproval(showcase, entry, 'host', event.hostId, true);
        for (const media of entry.media) { const upload = this.store.uploads.get(media.sourceUploadId ?? media.id)!; if (upload.uploaderId !== actor) this.addApproval(showcase, entry, 'media', upload.uploaderId); }
      }
      if (this.currentApprovals(showcase, entry).some(approval => !approval.countOnly && !this.store.memberApprovalIds.has(approval.id) && approval.status !== 'approved')) entry.approvalStatus = 'pending';
    }
    return this.hydrate(showcase);
  }
  async unpublish(showcaseId: string) { const showcase = this.own(showcaseId, await this.actor()); this.invalidate(showcase); return this.hydrate(showcase); }
  async remove(showcaseId: string) { const showcase = this.own(showcaseId, await this.actor()); this.invalidate(showcase); this.store.showcases.delete(showcaseId); }
  async reorder(ids: string[]) {
    const actor = await this.actor(); const owned = [...this.store.showcases.values()].filter(showcase => showcase.ownerId === actor);
    if (new Set(ids).size !== ids.length || ids.length !== owned.length || owned.some(showcase => !ids.includes(showcase.id))) throw new Error('invalid_showcase_order');
    ids.forEach((showcaseId, order) => { this.own(showcaseId, actor).order = order; });
  }
  async pickers(personId?: string): Promise<ShowcasePickers> {
    const actor = await this.actor(); await this.refreshGraph(actor);
    if (personId && (!this.friends(actor, personId) || !this.store.people.get(personId)?.active || !this.store.people.get(personId)?.visible)) throw new Error('eligible_friend_required');
    return { events: [...this.store.events.values()].filter(event => event.available !== false && event.attendees.has(actor) && (!personId || event.attendees.has(personId)) && !this.blocked(actor, event.hostId)).map(event => ({ id: event.id, title: event.title, seriesId: event.seriesId, private: event.private, ownReview: event.ownReview ?? '' })),
      requirementEvents: [...this.store.events.values()].filter(event => event.available !== false && !this.blocked(actor, event.hostId) && (!event.private || event.attendees.has(actor) || event.hostId === actor)).map(event => ({ id: event.id, title: event.title, private: event.private })),
      friends: [...this.store.people.entries()].filter(([personId, person]) => personId !== actor && person.active && person.visible && this.friends(actor, personId)).map(([personId, person]) => ({ id: personId, displayName: person.displayName })),
      groups: [...this.store.groups.values()].filter(group => group.active && group.members.has(actor)).map(group => ({ id: group.id, name: group.name,
        memberVisible: this.store.groupMemberVisibility.get(`${group.id}:${actor}`) !== false,
        members: this.members(group.id, actor).map(member => ({ id: member, displayName: this.store.people.get(member)!.displayName })),
      })),
      albums: [...this.store.albums.values()].filter(album => album.available && album.ownerId === actor).map(album => ({ id: album.id, title: album.title })),
      media: [...this.store.uploads.values()].filter(upload => upload.status === 'approved' && upload.available && !this.blocked(actor, upload.uploaderId) && (upload.uploaderId === actor || Boolean(upload.meetupId && this.store.events.get(upload.meetupId)?.attendees.has(actor)))).map(upload => { const { status: _status, available: _available, ...media } = upload; return copy(media); }),
    };
  }
  async setGroupMemberVisibility(groupId: string, visible: boolean) {
    const actor = await this.actor(); await this.refreshGraph(actor);
    if (typeof visible !== 'boolean' || !this.activeMember(groupId, actor)) throw new Error('active_group_membership_required');
    this.store.groupMemberVisibility.set(`${groupId}:${actor}`, visible);
    // Hiding a membership revokes old publication permission; showing it again
    // does not restore a permission that the member previously withdrew.
    if (!visible) for (const approval of this.store.approvals.values()) {
      const showcase = this.store.showcases.get(approval.showcaseId);
      const entry = showcase?.entries.find(entry => entry.id === approval.entryId);
      if (this.store.memberApprovalIds.has(approval.id) && approval.recipientId === actor && entry?.groupId === groupId) approval.status = 'revoked';
    }
  }
  private memberApprovalCurrent(approval: ShowcaseApproval, showcase: Showcase, entry: ShowcaseEntry, actor: string) {
    if (!this.store.memberApprovalIds.has(approval.id)) return true;
    if (!entry.groupId || !this.members(entry.groupId, showcase.ownerId).includes(actor)) return false;
    const selected = [...entry.meetupIds, ...(entry.requirements?.meetupId ? [entry.requirements.meetupId] : [])];
    return selected.every(meetupId => {
      const event = this.store.events.get(meetupId);
      return event && event.available !== false && this.store.people.get(event.hostId)?.active && !this.blocked(actor, event.hostId) && (!event.private || actor === showcase.ownerId || actor === event.hostId || event.attendees.has(actor)
        || this.currentApprovals(showcase, entry).some(request => request.role === 'host' && !request.countOnly && request.recipientId === event.hostId && request.status === 'approved'));
    });
  }
  private approvalMediaVisible(showcase: Showcase, entry: ShowcaseEntry, media: ShowcaseEntry['media'][number], actor: string) {
    const upload = this.store.uploads.get(media.sourceUploadId ?? media.id);
    if (!upload || !upload.available || upload.status !== 'approved' || !this.store.people.get(upload.uploaderId)?.active || this.blocked(actor, upload.uploaderId)) return false;
    const event = upload.meetupId ? this.store.events.get(upload.meetupId) : undefined;
    return actor === showcase.ownerId || actor === upload.uploaderId || upload.uploaderId === showcase.ownerId
      || Boolean(event && event.available !== false && !this.blocked(actor, event.hostId) && (!event.private || event.attendees.has(actor) || event.hostId === actor))
      || this.currentApprovals(showcase, entry).some(approval => approval.role === 'media' && approval.recipientId === upload.uploaderId && approval.status === 'approved');
  }
  async listApprovals() {
    const actor = await this.actor(); await this.refreshGraph(actor); return [...this.store.approvals.values()].filter(approval => {
      const showcase = this.store.showcases.get(approval.showcaseId); const entry = showcase?.entries.find(item => item.id === approval.entryId);
      if (!showcase || !entry || showcase.revision !== approval.revision || showcase.status !== 'published' || this.blocked(actor, showcase.ownerId) || !this.store.people.get(showcase.ownerId)?.active) return false;
      if (approval.role === 'group' ? !this.groupAdmin(entry.groupId, actor) : approval.recipientId !== actor) return false;
      if (!this.memberApprovalCurrent(approval, showcase, entry, actor)) return false;
      try { this.validateEntry(entry, showcase.ownerId); } catch { return false; }
      return (!entry.personId || !this.blocked(actor, entry.personId)) && !entry.media.some(media => { const upload = this.store.uploads.get(media.sourceUploadId ?? media.id); return upload && this.blocked(actor, upload.uploaderId); });
    }).map(approval => {
      const showcase = this.store.showcases.get(approval.showcaseId)!;
      const snapshot = copy(approval.snapshot);
      snapshot.albums = this.albumLinks(snapshot, showcase.ownerId, actor); snapshot.albumIds = snapshot.albums.map(album => album.id);
      snapshot.groupMembers = this.memberRoster(showcase, snapshot, actor);
      snapshot.media = snapshot.media.filter(media => this.approvalMediaVisible(showcase, snapshot, media, actor));
      return { ...copy(approval), ...this.audienceLabels(showcase, actor), snapshot };
    });
  }
  async respondApproval(approvalId: string, action: ShowcaseApprovalAction) {
    showcaseApprovalActionSchema.parse(action); const actor = await this.actor(); await this.refreshGraph(actor); const approval = this.store.approvals.get(approvalId);
    if (!approval) throw new Error('approval_recipient_required');
    const showcase = this.store.showcases.get(approval.showcaseId); const entry = showcase?.entries.find(item => item.id === approval.entryId);
    if (!showcase || !entry || showcase.revision !== approval.revision || showcase.audience !== approval.audience || showcase.audienceGroupId !== approval.audienceGroupId || JSON.stringify(showcase.audiencePersonIds) !== JSON.stringify(approval.audiencePersonIds) || showcase.status !== 'published') throw new Error('stale_showcase_approval');
    if (approval.role === 'group' ? !this.groupAdmin(entry.groupId, actor) : approval.recipientId !== actor) throw new Error('approval_recipient_required');
    if (!this.memberApprovalCurrent(approval, showcase, entry, actor)) throw new Error('approval_recipient_required');
    if (this.blocked(actor, showcase.ownerId)) throw new Error('showcase_unavailable');

    this.validateEntry(entry, showcase.ownerId);
    if (approval.role === 'group' && action === 'approve') approval.recipientId = actor;
    approval.status = action === 'approve' ? 'approved' : action === 'decline' ? 'declined' : 'revoked';
    entry.approvalStatus = this.currentApprovals(showcase, entry).filter(item => !item.countOnly && !this.store.memberApprovalIds.has(item.id)).every(item => item.status === 'approved') ? 'approved' : 'pending';
  }
  async upload(showcaseId: string, entryId: string, uri: string, kind: 'photo' | 'video', mimeType: string, caption: string) {
    validateMemoryMedia(kind, mimeType); const body = showcaseCaptionSchema.parse(caption); const actor = await this.actor(); const showcase = this.own(showcaseId, actor);
    const entry = showcase.entries.find(item => item.id === entryId); if (!entry) throw new Error('showcase_entry_required');
    if (entry.media.length >= 12) throw new Error('showcase_media_limit');
    const mediaId = Crypto.randomUUID(); this.invalidate(showcase);
    entry.media.push({ id: mediaId, kind, caption: body, status: 'pending' });
    this.store.uploads.set(mediaId, { id: mediaId, kind, caption: body, uploaderId: actor, url: uri, status: 'pending', available: true });
    this.store.attachedUploads.set(mediaId, { showcaseId, entryId });
    // Synthetic moderation must explicitly approve before this item appears anywhere.
    if (this.options.simulateMediaReview) {
      this.store.uploads.get(mediaId)!.status = 'approved'; this.invalidate(showcase);
    }
  }
  async report(showcaseId: string, entryId?: string, notes = '') {
    const actor = await this.actor(); const showcase = await this.get(showcaseId);
    if (entryId && !showcase.entries.some(entry => entry.id === entryId)) throw new Error('showcase_entry_required');
    if (notes.trim().length > 2000) throw new Error('report_too_long');
    this.store.reports.push({ reporterId: actor, showcaseId, entryId, notes: notes.trim() });
  }
}
