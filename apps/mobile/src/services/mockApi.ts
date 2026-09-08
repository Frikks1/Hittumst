import { validMessageBody } from '@/utils/chatDelivery';
import * as Crypto from 'expo-crypto';
import { mockConversations, mockMessages, mockOwnProfile, mockProfiles } from '@/data/mock';
import { profileTags } from '@/data/profileTags';
import type {
  Album, AlbumAccessMode, AlbumItem, AlbumShare, AlbumViewer, ChatMessage, ConversationSummary,
  DiscoveryFilters, GeoCoordinate, LocationVerification, MeetupDraftInput, MeetupFilters,
  MeetupPlaceSearchOptions, MeetupReinstateStatus, MeetupReportInput, MeetupUpdateInput, OwnProfile, PublicProfile,
  PushPlatform, ContentComment, ContentRating, ContentReaction, ContentTargetType, FriendSummary, GroupMessage, GroupSummary, GroupVoiceSession,
  ProfileAudience, ProfileReactionEmoji, StarredItem, StarredTargetType,
  MeetupRoomMessage, MeetupRoomSummary, MeetupRsvpVisibility,
} from '@/types/domain';
import { expoPushTokenSchema, pushTokenRegistrationSchema } from '@/types/domain';
import { DemoMeetupService } from './meetupDemo';
import type { OnboardingPayload, RummalApi } from './types';
import { pageByTime } from '@/utils/messagePagination';

const delay = (ms = 160) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockRummalApi implements RummalApi {
  readonly isDemo = true;
  private readonly meetupService = new DemoMeetupService();
  private own: OwnProfile = structuredClone(mockOwnProfile);
  private profiles = structuredClone(mockProfiles);
  private conversations = structuredClone(mockConversations);
  private messages = structuredClone(mockMessages);
  private blocked = new Set<string>();
  private pushTokens = new Map<string, { platform: PushPlatform; locale: 'is' | 'en' }>();
  private listeners = new Map<string, Set<(message: ChatMessage) => void>>();
  private ratings: ContentRating[] = [];
  private comments: ContentComment[] = [];
  private reactions: Array<{ targetType: ContentTargetType; targetId: string; emoji: ProfileReactionEmoji; userId: string }> = [];
  private friends: FriendSummary[] = [];
  private stars: StarredItem[] = [];
  private groups: GroupSummary[] = [];
  private groupMessages: GroupMessage[] = [];
  private meetupRooms = new Map<string, MeetupRoomSummary>();
  private meetupRoomMessages = new Map<string, MeetupRoomMessage[]>();
  private meetupRoomListeners = new Map<string, Set<() => void>>();
  private albums: Album[] = [
    {
      id: 'album-private', ownerId: 'demo-me', name: 'Private', contentVersion: 1,
      items: [], createdAt: '2026-08-31T17:00:00.000Z', updatedAt: '2026-08-31T17:00:00.000Z',
    },
    {
      id: 'album-bjarni', ownerId: 'p-bjarni', name: 'After dark', contentVersion: 1,
      items: [{ id: 'album-bjarni-1', albumId: 'album-bjarni', mediaType: 'image', position: 1, url: mockProfiles[0]?.photos[0]?.url }],
      createdAt: '2026-08-31T18:00:00.000Z', updatedAt: '2026-08-31T18:00:00.000Z',
    },
  ];
  private albumShares: AlbumShare[] = [{
    id: 'share-bjarni', albumId: 'album-bjarni', albumName: 'After dark', ownerId: 'p-bjarni', recipientId: 'demo-me',
    conversationId: 'c-bjarni', accessMode: '24_hours', status: 'pending', sharedVersion: 1, lastViewedVersion: 0,
    sharedAt: '2026-08-31T19:08:00.000Z', isIncoming: true, itemCount: 1,
  }];

  async discover(filters: DiscoveryFilters) {
    await delay();
    const items = this.profiles.filter((profile) =>
      !this.blocked.has(profile.id)
      && profile.age >= filters.ageMin && profile.age <= filters.ageMax
      && (!filters.onlineOnly || profile.isOnline)
      && (filters.identities.length === 0 || filters.identities.some((identity) => profile.identity.includes(identity)))
      && (filters.intents.length === 0 || filters.intents.some((intent) => profile.lookingFor.includes(intent)))
      && (filters.tags.length === 0 || filters.tags.every((tag) => profile.tags.includes(tag)))
    );
    return { items, nextCursor: null };
  }

  async getProfile(id: string) {
    await delay(80);
    const profile = this.profiles.find((item) => item.id === id);
    if (!profile || this.blocked.has(id)) throw new Error('Profile not found');
    return structuredClone(profile);
  }

  async getOwnProfile() { await delay(80); return structuredClone(this.own); }
  async updateProfile(profile: Partial<OwnProfile>) { this.own = { ...this.own, ...profile }; await delay(); return structuredClone(this.own); }
  async listProfileTags() { await delay(40); return structuredClone(profileTags); }
  async uploadProfilePhoto(uri: string) {
    this.own.photos.push({ id: Crypto.randomUUID(), url: uri, status: 'pending' });
    await delay();
  }
  async uploadProfileVideo(uri: string, _mimeType = 'video/mp4', durationMs = 0, tags: string[] = []) {
    if (durationMs < 1 || durationMs > 10_000) throw new Error('profile_video_limit');
    if (this.own.profileVideos.length >= 3) throw new Error('profile_video_limit_reached');
    this.own.profileVideos.push({ id: Crypto.randomUUID(), url: uri, tags, durationMs, status: 'pending' }); await delay();
  }
  async updateProfileMediaTags(mediaType: 'photo' | 'video', mediaId: string, tags: string[]) {
    if (mediaType === 'photo') { const photo = this.own.photos.find((item) => item.id === mediaId); if (photo) photo.tags = tags; }
    else { const video = this.own.profileVideos.find((item) => item.id === mediaId); if (video) video.tags = tags; }
    await delay(20);
  }
  async listFeedback(targetType: ContentTargetType, targetId: string) {
    await delay(30);
    const matching = this.reactions.filter((item) => item.targetType === targetType && item.targetId === targetId);
    const reactions: ContentReaction[] = (['❤️', '🔥', '😊', '👏', '🏳️‍🌈'] as ProfileReactionEmoji[]).map((emoji) => ({
      emoji,
      count: matching.filter((item) => item.emoji === emoji).length,
      reacted: matching.some((item) => item.emoji === emoji && item.userId === this.own.id),
    }));
    return {
      ratings: structuredClone(this.ratings.filter((item) => item.targetType === targetType && item.targetId === targetId)),
      comments: structuredClone(this.comments.filter((item) => item.targetType === targetType && item.targetId === targetId)),
      reactions,
    };
  }
  async rateContent(targetType: ContentTargetType, targetId: string, value: -1 | 1) {
    const existing = this.ratings.find((item) => item.targetType === targetType && item.targetId === targetId && item.userId === this.own.id);
    if (existing) existing.value = value; else this.ratings.push({ id: Crypto.randomUUID(), targetType, targetId, userId: this.own.id, value, isAnonymous: true }); await delay(30);
  }
  async commentOnContent(targetType: ContentTargetType, targetId: string, body: string) {
    const comment: ContentComment = { id: Crypto.randomUUID(), targetType, targetId, authorId: this.own.id, authorName: 'You', body: body.trim(), createdAt: new Date().toISOString() };
    this.comments.unshift(comment); await delay(30); return structuredClone(comment);
  }
  async toggleContentReaction(targetType: ContentTargetType, targetId: string, emoji: ProfileReactionEmoji) {
    const index = this.reactions.findIndex((item) => item.targetType === targetType && item.targetId === targetId && item.emoji === emoji && item.userId === this.own.id);
    if (index >= 0) this.reactions.splice(index, 1);
    else this.reactions.push({ targetType, targetId, emoji, userId: this.own.id });
    await delay(20);
  }
  async listFriends() { await delay(); return structuredClone(this.friends); }
  async setFriendship(profileId: string, action: 'request' | 'accept' | 'decline' | 'remove') {
    const existing = this.friends.find((item) => item.profileId === profileId);
    if (action === 'remove' || action === 'decline') this.friends = this.friends.filter((item) => item.profileId !== profileId);
    else if (existing) {
      existing.status = action === 'accept' ? 'accepted' : 'pending';
      existing.direction = action === 'accept' ? 'friend' : existing.direction;
    } else {
      const profile = this.profiles.find((item) => item.id === profileId);
      if (!profile) throw new Error('profile_not_found');
      this.friends.push({
        friendshipId: Crypto.randomUUID(), profileId, displayName: profile.displayName, avatarUrl: profile.photos[0]?.url,
        status: action === 'accept' ? 'accepted' : 'pending', direction: action === 'accept' ? 'friend' : 'outgoing',
        createdAt: new Date().toISOString(),
      });
    }
    await delay();
  }
  async listStarredItems() { await delay(); return structuredClone(this.stars); }
  async toggleStarredItem(targetType: StarredTargetType, targetId: string, label: string, audience: ProfileAudience = this.own.starredProfileAudience ?? 'no_one') {
    const index = this.stars.findIndex((item) => item.targetType === targetType && item.targetId === targetId);
    if (index >= 0) { this.stars.splice(index, 1); await delay(); return false; }
    this.stars.unshift({ id: Crypto.randomUUID(), targetType, targetId, label, profileAudience: audience, createdAt: new Date().toISOString() });
    await delay();
    return true;
  }
  async listGroups() { await delay(); return structuredClone(this.groups); }
  async createGroup(name: string, bio = '') {
    const id = Crypto.randomUUID();
    this.groups.unshift({ id, name: name.trim(), bio: bio.trim(), role: 'owner', memberCount: 1, isVoiceActive: false, updatedAt: new Date().toISOString() });
    await delay();
    return id;
  }
  async listGroupMessages(groupId: string) { await delay(); return structuredClone(this.groupMessages.filter((item) => item.groupId === groupId)); }
  async sendGroupMessage(groupId: string, body: string) {
    const message: GroupMessage = { id: Crypto.randomUUID(), groupId, senderId: this.own.id, senderName: this.own.displayName, body: body.trim(), createdAt: new Date().toISOString() };
    this.groupMessages.push(message);
    await delay();
    return structuredClone(message);
  }
  async startGroupVoice(groupId: string): Promise<GroupVoiceSession> {
    const group = this.groups.find((item) => item.id === groupId);
    if (group) group.isVoiceActive = true;
    await delay();
    return { id: Crypto.randomUUID(), groupId, startedBy: this.own.id, startedAt: new Date().toISOString(), participantCount: 1 };
  }
  async completeOnboarding(payload: OnboardingPayload) {
    this.own = {
      ...this.own, displayName: payload.displayName, dateOfBirth: payload.dateOfBirth, pronouns: payload.pronouns,
      identity: payload.identity, lookingFor: payload.lookingFor, bio: payload.bio, region: payload.region
    };
    await delay();
  }
  async updateLocation(_fix: { latitude: number; longitude: number; accuracy: number; capturedAt: string }): Promise<LocationVerification> {
    await delay(); return { verified: true, verifiedAt: new Date().toISOString() };
  }
  async touchPresence() {}
  async listConversations(cursor?: string | null, query = '') {
    await delay();
    const needle = query.trim().toLocaleLowerCase();
    return structuredClone(pageByTime(this.conversations.filter(c => !this.blocked.has(c.member.id) &&
      `${c.member.displayName} ${c.lastMessage}`.toLocaleLowerCase().includes(needle)), c => c.lastMessageAt, 30, cursor));
  }
  async startConversation(profileId: string) {
    const existing = this.conversations.find((item) => item.member.id === profileId);
    if (existing) return existing.id;
    const member = await this.getProfile(profileId);
    const conversation: ConversationSummary = { id: `c-${profileId}`, member, lastMessage: '', lastMessageAt: new Date().toISOString(), unreadCount: 0 };
    this.conversations.unshift(conversation);
    this.messages[conversation.id] = [];
    return conversation.id;
  }
  async listMessages(conversationId: string, cursor?: string | null) {
    await delay();
    const page = pageByTime(this.messages[conversationId] ?? [], m => m.createdAt, 50, cursor);
    return structuredClone({ ...page, items: page.items.reverse() });
  }
  async sendText(conversationId: string, text: string, clientMessageId = Crypto.randomUUID()) {
    if (!validMessageBody(text)) throw new Error('invalid_message_body');
    const existing = Object.values(this.messages).flat().find(item => item.id === clientMessageId);
    if (existing) { if(existing.conversationId !== conversationId || existing.senderId !== this.own.id || existing.body !== text.trim()) throw new Error('message_id_conflict'); return structuredClone(existing); } return this.addMessage(conversationId, { body: text.trim() }, clientMessageId); }
  async markConversationRead(conversationId: string, _through: string) {
    const conversation = this.conversations.find(item => item.id === conversationId);
    if (conversation) conversation.unreadCount = 0;
  }

  async sendImage(conversationId: string, uri: string) { return this.addMessage(conversationId, { imageUrl: uri }); }
  private async addMessage(conversationId: string, content: Pick<ChatMessage, 'body' | 'imageUrl'>, messageId = Crypto.randomUUID()) {
    const message: ChatMessage = {
      id: messageId, conversationId, senderId: this.own.id, createdAt: new Date().toISOString(), status: 'sent',
      kind: content.imageUrl ? 'image' : 'text', ...content
    };
    this.messages[conversationId] ??= [];
    this.messages[conversationId]!.push(message);
    const conversation = this.conversations.find((item) => item.id === conversationId);
    if (conversation) {
      conversation.lastMessage = content.body ?? '📷';
      conversation.lastMessageAt = message.createdAt;
    }
    await delay(100);
    this.listeners.get(conversationId)?.forEach((listener) => listener(structuredClone(message)));
    return structuredClone(message);
  }
  async listMyAlbums() { await delay(); return structuredClone(this.albums.filter((album) => album.ownerId === this.own.id)); }
  async createAlbum(name: string) {
    if (this.albums.filter((album) => album.ownerId === this.own.id).length >= 10) throw new Error('album_limit_reached');
    const now = new Date().toISOString();
    const album: Album = { id: Crypto.randomUUID(), ownerId: this.own.id, name: name.trim(), contentVersion: 1, items: [], createdAt: now, updatedAt: now };
    this.albums.unshift(album); await delay(); return structuredClone(album);
  }
  async renameAlbum(albumId: string, name: string) {
    const album = this.albums.find((item) => item.id === albumId && item.ownerId === this.own.id);
    if (!album) throw new Error('album_not_found');
    album.name = name.trim(); album.updatedAt = new Date().toISOString(); await delay();
  }
  async deleteAlbum(albumId: string) {
    this.albums = this.albums.filter((item) => !(item.id === albumId && item.ownerId === this.own.id));
    this.albumShares = this.albumShares.map((share) => share.albumId === albumId ? { ...share, status: 'revoked' } : share);
    await delay();
  }
  async addAlbumItem(albumId: string, input: { uri: string; mimeType: string; mediaType: 'image' | 'video'; byteSize: number; durationMs?: number }) {
    const album = this.albums.find((item) => item.id === albumId && item.ownerId === this.own.id);
    if (!album) throw new Error('album_not_found');
    if (input.byteSize > 30 * 1024 * 1024 || (input.mediaType === 'video' && (input.durationMs ?? 0) > 15_000)) throw new Error('invalid_album_media');
    if (input.mediaType === 'image' && album.items.filter((item) => item.mediaType === 'image').length >= 10) throw new Error('album_photo_limit_reached');
    if (input.mediaType === 'video' && album.items.some((item) => item.mediaType === 'video')) throw new Error('album_video_limit_reached');
    const item: AlbumItem = { id: Crypto.randomUUID(), albumId, mediaType: input.mediaType, position: album.items.length + 1, url: input.uri, byteSize: input.byteSize, durationMs: input.durationMs };
    album.items.push(item); album.contentVersion += 1; album.updatedAt = new Date().toISOString(); await delay(); return structuredClone(item);
  }
  async deleteAlbumItem(itemId: string) {
    const album = this.albums.find((entry) => entry.ownerId === this.own.id && entry.items.some((item) => item.id === itemId));
    if (!album) throw new Error('album_item_not_found');
    album.items = album.items.filter((item) => item.id !== itemId).map((item, index) => ({ ...item, position: index + 1 }));
    album.contentVersion += 1; album.updatedAt = new Date().toISOString(); await delay();
  }
  async listAlbumShares() {
    await delay();
    const now = Date.now();
    return structuredClone(this.albumShares.map((share) => {
      const album = this.albums.find((item) => item.id === share.albumId);
      const current = album ? { ...share, sharedVersion: album.contentVersion, itemCount: share.isIncoming ? 0 : album.items.length } : share;
      return current.status === 'accepted' && current.expiresAt && Date.parse(current.expiresAt) <= now ? { ...current, status: 'expired' as const } : current;
    }));
  }
  async shareAlbums(profileIds: string | string[], albumIds: string[], accessMode: AlbumAccessMode) {
    const recipients = Array.isArray(profileIds) ? profileIds : [profileIds];
    if (recipients.length < 1 || recipients.length > 5 || new Set(recipients).size !== recipients.length) throw new Error('invalid_recipient_selection');
    if (albumIds.length < 1 || albumIds.length > 5) throw new Error('invalid_album_selection');
    const conversationIds: Record<string, string> = {};
    const shareIds: string[] = [];
    for (const profileId of recipients) {
      const conversationId = await this.startConversation(profileId);
      conversationIds[profileId] = conversationId;
      for (const albumId of albumIds) {
        const album = this.albums.find((item) => item.id === albumId && item.ownerId === this.own.id);
        if (!album) throw new Error('album_not_found');
        const share: AlbumShare = {
          id: Crypto.randomUUID(), albumId, albumName: album.name, ownerId: this.own.id, recipientId: profileId,
          conversationId, accessMode, status: 'pending', sharedVersion: album.contentVersion, lastViewedVersion: 0,
          sharedAt: new Date().toISOString(), isIncoming: false, itemCount: album.items.length,
        };
        this.albumShares = this.albumShares.filter((item) => !(item.albumId === albumId && item.recipientId === profileId));
        this.albumShares.unshift(share); shareIds.push(share.id);
        const message: ChatMessage = { id: Crypto.randomUUID(), conversationId, senderId: this.own.id, kind: 'album_share', body: 'Private album request', albumShareId: share.id, createdAt: share.sharedAt, status: 'sent' };
        this.messages[conversationId] ??= []; this.messages[conversationId]!.push(message);
        this.listeners.get(conversationId)?.forEach((listener) => listener(structuredClone(message)));
      }
    }
    return { conversationId: conversationIds[recipients[0]!], conversationIds, shareIds };
  }
  async respondToAlbumShare(shareId: string, accept: boolean) {
    const share = this.albumShares.find((item) => item.id === shareId && item.recipientId === this.own.id && item.status === 'pending');
    if (!share) throw new Error('album_share_not_pending');
    share.status = accept ? 'accepted' : 'declined';
    if (accept) {
      share.acceptedAt = new Date().toISOString();
      const durations: Partial<Record<AlbumAccessMode, number>> = { '10_minutes': 600_000, '1_hour': 3_600_000, '24_hours': 86_400_000 };
      if (durations[share.accessMode]) share.expiresAt = new Date(Date.now() + durations[share.accessMode]!).toISOString();
    }
    await delay();
  }
  async revokeAlbumShare(shareId: string) {
    const share = this.albumShares.find((item) => item.id === shareId && item.ownerId === this.own.id);
    if (!share) throw new Error('album_share_not_revocable'); share.status = 'revoked'; await delay();
  }
  async openAlbumShare(shareId: string): Promise<AlbumViewer> {
    const share = this.albumShares.find((item) => item.id === shareId && item.recipientId === this.own.id);
    if (!share || !['accepted'].includes(share.status)) throw new Error('album_share_locked');
    const album = this.albums.find((item) => item.id === share.albumId);
    if (!album) throw new Error('album_not_found');
    let sessionId: string | undefined;
    let sessionExpiresAt: string | undefined;
    if (share.accessMode === 'view_once') {
      share.status = 'consumed'; sessionId = Crypto.randomUUID(); sessionExpiresAt = new Date(Date.now() + 600_000).toISOString();
    }
    share.lastViewedVersion = album.contentVersion;
    await delay();
    return structuredClone({ shareId, albumId: album.id, name: album.name, contentVersion: album.contentVersion, sessionId, sessionExpiresAt, items: album.items });
  }
  async closeAlbumViewer() { await delay(20); }
  async toggleAlbumReaction(shareId: string, itemId: string) {
    const share = this.albumShares.find((item) => item.id === shareId);
    if (!share) throw new Error('album_share_locked');
    const message: ChatMessage = { id: Crypto.randomUUID(), conversationId: share.conversationId, senderId: this.own.id, kind: 'album_reaction', body: '🔥 reacted to an album item', albumShareId: shareId, albumItemId: itemId, createdAt: new Date().toISOString(), status: 'sent' };
    this.messages[share.conversationId] ??= []; this.messages[share.conversationId]!.push(message); await delay(); return true;
  }
  async sendAlbumReply(shareId: string, itemId: string, body: string) {
    const share = this.albumShares.find((item) => item.id === shareId); if (!share) throw new Error('album_share_locked');
    const message: ChatMessage = { id: Crypto.randomUUID(), conversationId: share.conversationId, senderId: this.own.id, kind: 'album_reply', body, albumShareId: shareId, albumItemId: itemId, createdAt: new Date().toISOString(), status: 'sent' };
    this.messages[share.conversationId] ??= []; this.messages[share.conversationId]!.push(message); await delay();
  }
  subscribeMessages(conversationId: string, callback: (message: ChatMessage) => void) {
    const listeners = this.listeners.get(conversationId) ?? new Set();
    listeners.add(callback);
    this.listeners.set(conversationId, listeners);
    return () => listeners.delete(callback);
  }
  async deleteConversation(conversationId: string) { this.conversations = this.conversations.filter((item) => item.id !== conversationId); await delay(); }
  async block(profileId: string) {
    this.blocked.add(profileId);
    this.albumShares = this.albumShares.map((share) => [share.ownerId, share.recipientId].includes(profileId) && ['pending', 'accepted', 'consumed'].includes(share.status) ? { ...share, status: 'revoked' } : share);
    await delay();
  }
  async unblock(profileId: string) { this.blocked.delete(profileId); await delay(); }
  async listBlocked() { await delay(); return structuredClone(this.profiles.filter((item) => this.blocked.has(item.id))); }
  async report() { await delay(250); }
  async discoverMeetups(filters: MeetupFilters) { await delay(); return this.meetupService.discover(filters); }
  async getMeetup(id: string) { await delay(80); return this.meetupService.get(id); }
  async listMyMeetups() { await delay(); return this.meetupService.listMine(); }
  async listMeetupRequests(id: string) { await delay(); return this.meetupService.listRequests(id); }
  async listMeetupParticipants(id: string) { await delay(); return this.meetupService.listParticipants(id); }
  async createMeetupDraft(input: MeetupDraftInput) { await delay(); return this.meetupService.createDraft(input); }
  async updateMeetup(id: string, input: MeetupUpdateInput) { await delay(); return this.meetupService.update(id, input); }
  async publishMeetup(id: string) { await delay(); return this.meetupService.publish(id); }
  async deleteMeetupDraft(id: string) { await this.meetupService.deleteDraft(id); await delay(); }
  async joinMeetup(id: string) { await delay(); return this.meetupService.join(id); }
  async requestMeetupAccess(id: string) { await delay(); return this.meetupService.requestAccess(id); }
  async cancelMeetupRequest(id: string) { await this.meetupService.cancelRequest(id); await delay(); }
  async leaveMeetup(id: string) { await this.meetupService.leave(id); await delay(); }
  async respondToMeetupRequest(id: string, profileId: string, approve: boolean) {
    await delay(); return this.meetupService.respond(id, profileId, approve);
  }
  async removeMeetupParticipant(id: string, profileId: string) {
    await this.meetupService.removeParticipant(id, profileId); await delay();
  }
  async reinstateMeetupParticipant(id: string, profileId: string, status: MeetupReinstateStatus) {
    await delay(); return this.meetupService.reinstateParticipant(id, profileId, status);
  }
  async cancelMeetup(id: string) { await this.meetupService.cancel(id); await delay(); }
  async reportMeetup(id: string, input: MeetupReportInput) { await delay(); return this.meetupService.report(id, input); }
  async listPublicMeetupRoster(id: string) { await delay(); return { items: (await this.meetupService.listParticipants(id)).filter((item) => item.rsvpVisibility !== 'private'), nextCursor: null }; }
  async listProfileMeetupHistory(_profileId: string) { await delay(); return { items: [], nextCursor: null }; }
  async listProfileUpcomingMeetups(_profileId: string) { await delay(); return { items: [], nextCursor: null }; }
  async setMeetupRsvpVisibility(_id: string, _visibility: MeetupRsvpVisibility) { await delay(20); }
  async confirmMeetupAttendance(_id: string) { await delay(20); }
  async completeMeetupAttendance(_id: string, _outcome: 'attended' | 'did_not_attend' | 'dismiss', _historyVisibility: 'visible' | 'private' = 'private') { await delay(20); }
  async setMeetupHistoryVisibility(_id: string, _visibility: 'visible' | 'private') { await delay(20); }
  async getMeetupRoom(id: string) {
    let room = this.meetupRooms.get(id);
    if (!room) {
      const detail = await this.meetupService.get(id);
      if (!detail.capabilities.canViewRoom) return null;
      room = { id: Crypto.randomUUID(), meetupId: id, postingClosesAt: new Date(Date.parse(detail.effectiveEnd) + 2 * 60 * 60 * 1000).toISOString(), readingClosesAt: new Date(Date.parse(detail.effectiveEnd) + 24 * 60 * 60 * 1000).toISOString(), isPaused: false, canPost: true, unreadCount: 0 };
      this.meetupRooms.set(id, room);
      this.meetupRoomMessages.set(room.id, []);
    }
    await delay();
    return structuredClone(room);
  }
  async listMeetupRoomMessages(roomId: string, cursor?: string | null) {
    await delay();
    const page = pageByTime(this.meetupRoomMessages.get(roomId) ?? [], message => message.createdAt, 50, cursor);
    return structuredClone({ ...page, items: page.items.reverse() });
  }
  async sendMeetupRoomMessage(roomId: string, body: string, clientMessageId = Crypto.randomUUID()) {
    const previous = this.meetupRoomMessages.get(roomId)?.find(item => item.id === clientMessageId);
    if (previous) {
      if (previous.body !== body.trim()) throw new Error('message_id_conflict');
      return structuredClone(previous);
    }
    const links = body.match(/https?:\/\/[^\s<>{}"']+/gi) ?? [];
    const message: MeetupRoomMessage = { id: clientMessageId, roomId, sender: { id: this.own.id, displayName: this.own.displayName }, kind: 'text', body: body.trim(), linkHostnames: links.flatMap((url) => { try { return [new URL(url).hostname]; } catch { return []; } }), createdAt: new Date().toISOString() };
    const messages = this.meetupRoomMessages.get(roomId) ?? [];
    messages.push(message); this.meetupRoomMessages.set(roomId, messages);
    this.meetupRoomListeners.get(roomId)?.forEach((listener) => listener());
    await delay(); return structuredClone(message);
  }
  subscribeMeetupRoom(roomId: string, onInvalidate: () => void) {
    const listeners = this.meetupRoomListeners.get(roomId) ?? new Set<() => void>();
    listeners.add(onInvalidate); this.meetupRoomListeners.set(roomId, listeners);
    return () => { listeners.delete(onInvalidate); };
  }
  async setAdultContentPreference(enabled: boolean) { await this.meetupService.setAdultPreference(enabled); await delay(); }
  async listMeetupNotifications(limit?: number) { await delay(); return this.meetupService.listNotifications(limit); }
  async markMeetupNotificationRead(notificationId: string) {
    await this.meetupService.markNotificationRead(notificationId); await delay();
  }
  async registerPushToken(expoPushToken: string, platform: PushPlatform, locale: 'is' | 'en' = 'is') {
    const registration = pushTokenRegistrationSchema.parse({ expoPushToken, platform, locale });
    this.pushTokens.set(registration.expoPushToken, {
      platform: registration.platform,
      locale: registration.locale,
    });
    await delay(20);
  }
  async unregisterPushToken(expoPushToken: string) {
    this.pushTokens.delete(expoPushTokenSchema.parse(expoPushToken));
    await delay(20);
  }
  async searchMeetupPlaces(query: string, options?: MeetupPlaceSearchOptions) {
    await delay(80); return this.meetupService.searchPlaces(query, options);
  }
  async reverseGeocodeMeetupPlace(coordinate: GeoCoordinate, options?: MeetupPlaceSearchOptions) {
    await delay(80); return this.meetupService.reverseGeocode(coordinate, options);
  }
  async requestExport() { await delay(300); return JSON.stringify({ demo: true, profile: this.own, conversations: this.conversations, messages: this.messages, albums: this.albums.filter(album => album.ownerId === this.own.id) }, null, 2); }
  async withdrawSensitiveConsent() { this.own.isHidden = true; await delay(); }
  async deleteAccount() { await delay(300); }
}
