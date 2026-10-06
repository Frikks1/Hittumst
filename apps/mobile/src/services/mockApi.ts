import { decorateDemoCommunity, DemoCommunityStore, refreshDemoQueue, notifyDemoCommunity, demoEventFollowers, type DemoCommunityBridge } from './communityDemo';
import { activityRank, matchesActivity, profileOrientationTagsSchema, requiredSexualOrientationSelectionSchema } from '@rummal/shared';
import { validMessageBody } from '@/utils/chatDelivery';
import { getPoolSummary, settleEvent, TIERS, type MeetupSponsorship, activeTier, freeEntitlement, requireAlbumCapacity, requireAlbumMedia, type FinanceCommand, type TierId } from '@rummal/shared';
import { CommerceDemo } from './commerceDemo';
import * as Crypto from 'expo-crypto';
import { mockConversations, mockMessages, mockOwnProfile, mockProfiles } from '@/data/mock';
import { profileTags } from '@/data/profileTags';
import type {
  Album, AlbumAccessMode, AlbumItem, AlbumShare, AlbumViewer, ChatMessage, ConversationSummary,
  DiscoveryFilters, GeoCoordinate, LocationVerification, MeetupDraftInput, MeetupFilters,
  MeetupPlaceSearchOptions, MeetupReinstateStatus, MeetupReportInput, MeetupUpdateInput, OwnProfile, PublicProfile,
  PushPlatform, ContentComment, ContentRating, ContentReaction, ContentTargetType, FriendSummary, GroupAction, GroupMember, GroupMessage, GroupSummary, GroupVoiceSession,
  ProfileActivity, ProfileActivityKind, ProfileAudience, ProfileReactionEmoji, StarredItem, StarredTargetType,
  MeetupRoomMessage, MeetupRoomSummary, MeetupRsvpVisibility,
} from '@/types/domain';
import { expoPushTokenSchema, pushTokenRegistrationSchema } from '@/types/domain';
import { DemoMeetupService } from './meetupDemo';
import type { OnboardingPayload, RummalApi } from './types';
import { pageByTime } from '@/utils/messagePagination';
import { matchesIdentityGroups } from '@/utils/discoveryPreferences';
import { calculateAge } from '@/utils/age';

const delay = (ms = 160) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockRummalApi implements RummalApi {
  readonly isDemo = true;
  readonly demoCommunityStore = new DemoCommunityStore();
  readonly communityDemo: DemoCommunityBridge = {
    sponsored: (id, profileId) => Object.values(this.commerce.state.contributions).some(row => row.eventId === id && row.memberId === profileId && row.amount > 0 && !row.reversed && !row.refundReason),
    feedbackEvent: async id => {
      if (!this.demoCommunityStore.receipts.get(id)?.has(this.own.id) && !this.demoCommunityStore.appeals.get(id)?.has(this.own.id)) return this.getMeetup(id);
      return this.meetupService.get(id);
    },
    eligible: (id, profileId) => !this.blocked.has(profileId) && !this.blocked.has(this.meetupService.communityHostId(id)) && this.meetupService.isCommunityEligible(id, profileId),
    acceptOffer: (id, approved) => this.meetupService.acceptCommunityOffer(id, approved),
    all: async () => (await this.meetupService.allForCommunity()).filter(event => !this.blocked.has(event.host.id)),
    host: async id => {
      if (this.blocked.has(id)) throw new Error('host_unavailable');
      const profile = id === this.own.id ? this.own : this.profiles.find(value => value.id === id);
      if (!profile) throw new Error('host_unavailable');
      return { displayName: profile.displayName, profileVisible: id === this.own.id ? !this.own.isHidden : this.discoveryFixture(id).visible };
    },
    participants: id => this.meetupService.communityParticipants(id),
  };
  readonly commerce = new CommerceDemo();
  private get tier(): TierId { const member = this.commerce.state.members['demo-me']!; return activeTier(member.tier, member.paidUntil); }
  async getEntitlement() {
    return { ...freeEntitlement(true), tier: this.tier, paidUntil: this.commerce.state.members['demo-me']!.paidUntil,
      premiumMonths: this.commerce.state.members['demo-me']!.premiumMonths,
      albumsUsed: this.albums.filter(a => a.ownerId === this.own.id).length,
      occurrencesUsed: this.meetupService.hostedUsage(), joinsUsed: this.meetupService.joinedUsage(),
      joinsLimit: TIERS[this.tier].joins, joinsRemaining: Math.max(0, TIERS[this.tier].joins - this.meetupService.joinedUsage()) };
  }
  async setSandboxTier(tier: TierId) { this.commerce.setTier(tier); return this.getEntitlement(); }
  async getWallet() { return this.commerce.snapshot(); }
  async getPendingFinanceCommand() { return null; }
  async listMediaUploads(_albumId: string) { return []; }
  async appealMediaUpload(_id: string) { throw new Error('appeal_unavailable'); }
  private premiumProfile={effect:false,badge:false};
  async getPremiumProfile(id:string) { if(id!==this.own.id){await this.getProfile(id);return {effect:false,badge:false,months:0};} const premium=this.tier==='plebba_kongur';return {effect:premium&&this.premiumProfile.effect,badge:premium&&this.premiumProfile.badge,months:premium&&this.premiumProfile.badge?this.commerce.state.members[this.own.id]!.premiumMonths:0}; }
  async setPremiumProfile(effect:boolean,badge:boolean) {if((effect||badge)&&this.tier!=='plebba_kongur')throw new Error('premium_required');this.premiumProfile={effect,badge};}
  async walletCommand(command: FinanceCommand) {
    // Return a committed receipt before checking today's event state or membership.
    if (this.commerce.state.requests[this.own.id + ':' + command.requestId]) return this.commerce.command(command);
    if(command.action==='gift') {await this.getProfile(command.recipientId);this.commerce.state.members[command.recipientId]??={tier:'plebbi',paidUntil:null,premiumMonths:0,payoutIdentity:`sandbox:${command.recipientId}`,suspended:false};}
    const eventId = 'meetupId' in command ? command.meetupId : command.action === 'reverse' ? this.commerce.state.contributions[command.contributionId]?.eventId : undefined;
    if (eventId) {
      const meetup = await this.meetupService.get(eventId);
      const draftAllowed = meetup.status === 'draft' && meetup.host.id === this.own.id && ['contribution_quote', 'pool_info', 'publish_sponsored'].includes(command.action);
      if (meetup.status !== 'published' && !draftAllowed && command.action !== 'pool_info') throw new Error('pool_closed');
      if (command.action === 'publish_sponsored' && meetup.host.id !== this.own.id) throw new Error('meetup_forbidden');
      const old = this.commerce.state.events[meetup.id];
      this.commerce.state.members[meetup.host.id] ??= { tier: 'plebbi', paidUntil: null, premiumMonths: 0, payoutIdentity: null, suspended: false };
      this.commerce.state.events[meetup.id] = { ...old, id: meetup.id, hostId: meetup.host.id, startsAt: meetup.startsAt, endsAt: meetup.effectiveEnd,
        cancelled: meetup.status !== 'published' && !draftAllowed, eligibleAttendees: ['joined','approved'].includes(meetup.viewerState.participationStatus) ? [this.own.id] : [],
        hostBps: old?.hostBps ?? null, checkedIn: old?.checkedIn ?? {}, code: old?.code ?? null, review: old?.review ?? 'pending', settled: old?.settled ?? false };
    }
    if (command.action === 'publish_sponsored') {
      let result: unknown;
      await this.meetupService.publishFunded(command.meetupId, () => { result = this.commerce.command(command); });
      return result;
    }
    return this.commerce.command(command);
  }
  private readonly meetupService = new DemoMeetupService(new Date(), () => this.tier, event => {
    const old = this.commerce.state.events[event.id];
    const projected = { ...old, id: event.id, hostId: event.hostId, startsAt: event.startsAt, endsAt: event.endsAt,
      cancelled: event.status === 'cancelled', eligibleAttendees: old?.eligibleAttendees ?? [],
      hostBps: old?.hostBps ?? null, checkedIn: old?.checkedIn ?? {}, code: old?.code ?? null,
      review: old?.review ?? 'pending' as const, settled: old?.settled ?? false };
    const pool = getPoolSummary({ ...this.commerce.state, events: { ...this.commerce.state.events, [event.id]: projected } }, event.id);
    if (Date.now() < Date.parse(event.startsAt)) {
      pool.eligibleParticipantCount = event.participantCount;
      pool.estimatedParticipantReward = event.participantCount > 0 && !['paid_out', 'refunded'].includes(pool.status) ? Math.floor((pool.total - Math.floor(pool.total * pool.hostBps / 10000)) / event.participantCount) : null;
    }
    return pool;
  }, {
    now: () => new Date(),
    reservedSeats: (event, excluding) => refreshDemoQueue(this.demoCommunityStore, event, Date.now(), profileId => this.communityDemo.eligible(event.id, profileId), profileId => this.communityDemo.sponsored(event.id, profileId))
      .filter(row => row.status === 'offered' && row.profileId !== excluding).length,
  });
  private own: OwnProfile = structuredClone(mockOwnProfile);
  private profiles = structuredClone(mockProfiles);
  private conversations = structuredClone(mockConversations);
  private messages = structuredClone(mockMessages);
  private blocked = new Set<string>();
  private profileTapSends: number[] = [];
  private profileActivity: Array<ProfileActivity & { actorId: string; recipientId: string; kind: ProfileActivityKind }> = this.profiles.slice(0, 5).flatMap((profile, index) => {
    const occurredAt = new Date(Date.now() - (index + 1) * 45 * 60_000).toISOString();
    const view = { id: `demo-view-${profile.id}`, profile, actorId: profile.id, recipientId: this.own.id, kind: 'views' as const, occurredAt, count: index === 0 ? 3 : 1 };
    return index < 3 ? [view, { ...view, id: `demo-tap-${profile.id}`, kind: 'taps' as const, count: 1 }] : [view];
  });
  private pushTokens = new Map<string, { platform: PushPlatform; locale: 'is' | 'en' }>();
  private listeners = new Map<string, Set<(message: ChatMessage) => void>>();
  private albumSessions = new Map<string, { shareId: string; expiresAt: string; requestId: string }>();
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

  private discoveryFixture(id:string) {
    // Explicit synthetic activity and graph facts; never derive gender or diagnoses.
    const days:Record<string,number>={'p-bjarni':0,'p-elias':0,'p-salka':3,'p-noa':0,'p-dagur':45,'p-embla':20};
    return {lastActive:Date.now()-(days[id]??45)*86400000,visible:id!=='p-embla',fof:id==='p-salka'};
  }
  async discover(filters: DiscoveryFilters) {
    await delay();
    const items = this.profiles.filter((profile) =>
      !this.blocked.has(profile.id)
      && profile.age >= filters.ageMin && profile.age <= filters.ageMax
      && matchesActivity(filters.activity,this.discoveryFixture(profile.id).lastActive,this.discoveryFixture(profile.id).visible,Date.now())
      && (!filters.genders.length || (profile.gender != null && filters.genders.includes(profile.gender)))
      && (!filters.diagnosisIds.length || filters.diagnosisIds.some(id => profile.diagnosisIds?.includes(id)))
      && (filters.radiusKm === null || (profile.distanceBand !== null && ({under1:0.5,'1to3':2,'3to10':6,'10to25':18,'25plus':40,'10to30':20,'30plus':40}[profile.distanceBand] <= filters.radiusKm)))
      && (filters.social === 'all' || filters.social === 'favorites' && this.stars.some(s => s.targetType === 'friend' && s.targetId === profile.id) || filters.social === 'friends' && this.friends.some(f => f.profileId === profile.id && f.status === 'accepted') || filters.social === 'friends_of_friends' && this.discoveryFixture(profile.id).fof && this.friends.some(f=>f.status==='accepted'&&!this.blocked.has(f.profileId)))
      && matchesIdentityGroups(filters.identities, profile.identity)
      && (filters.intents.length === 0 || filters.intents.some((intent) => profile.lookingFor.includes(intent)))
      && (filters.tags.length === 0 || filters.tags.some((tag) => profile.tags.includes(tag)))
    );
    items.sort((a,b) => activityRank(this.discoveryFixture(a.id).lastActive,this.discoveryFixture(a.id).visible,Date.now())-activityRank(this.discoveryFixture(b.id).lastActive,this.discoveryFixture(b.id).visible,Date.now()));
    return { items, nextCursor: null };
  }

  async getProfile(id: string) {
    await delay(80);
    const profile = this.profiles.find((item) => item.id === id);
    if (!profile || this.blocked.has(id)) throw new Error('Profile not found');
    return structuredClone(profile);
  }

  async listProfileActivity(kind: ProfileActivityKind, cursor?: string | null) {
    await delay();
    if (!this.own.locationSharing) throw new Error('profile_access_required');
    const visible = this.profileActivity.filter(item => item.recipientId === this.own.id && item.kind === kind &&
      !this.blocked.has(item.actorId) && this.discoveryFixture(item.actorId).visible);
    return structuredClone(pageByTime(visible, item => item.occurredAt, 40, cursor));
  }

  private async recordActivity(profileId: string, kind: ProfileActivityKind) {
    if (!this.own.locationSharing) throw new Error('profile_access_required');
    if (profileId === this.own.id || this.blocked.has(profileId) || !this.discoveryFixture(profileId).visible) throw new Error('profile_unavailable');
    const profile = await this.getProfile(profileId);
    if (this.own.isHidden) {
      if (kind === 'views') return;
      throw new Error('profile_unavailable');
    }
    const now = Date.now();
    const previous = this.profileActivity.find(item => item.actorId === this.own.id && item.recipientId === profileId && item.kind === kind);
    if (previous && now - Date.parse(previous.occurredAt) < (kind === 'views' ? 30 * 60_000 : 24 * 60 * 60_000)) {
      if (kind === 'views') return;
      throw new Error('tap_cooldown');
    }
    if (kind === 'taps') {
      this.profileTapSends = this.profileTapSends.filter(sentAt => now - sentAt < 24 * 60 * 60_000);
      if (this.profileTapSends.filter(sentAt => now - sentAt < 60 * 60_000).length >= 30 ||
          this.profileTapSends.length >= 100) throw new Error('tap_rate_limited');
      this.profileTapSends.push(now);
    }
    if (previous) { previous.occurredAt = new Date(now).toISOString(); previous.count += 1; }
    else this.profileActivity.push({ id: Crypto.randomUUID(), profile, actorId: this.own.id, recipientId: profileId, kind, occurredAt: new Date(now).toISOString(), count: 1 });
  }

  async recordProfileView(profileId: string): Promise<void> { await this.recordActivity(profileId, 'views'); }
  async sendProfileTap(profileId: string): Promise<void> { await this.recordActivity(profileId, 'taps'); }

  async hasCompletedOnboarding() { return true; }
  async getOwnProfile() { await delay(80); return structuredClone(this.own); }
  async updateProfile(profile: Partial<OwnProfile>) {
    if (profile.identity !== undefined) profileOrientationTagsSchema.parse(profile.identity);
    this.own = { ...this.own, ...profile }; await delay(); return structuredClone(this.own);
  }
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
  async listGroupMessagePage(groupId: string, cursor?: string | null) {
    const all = await this.listGroupMessages(groupId);
    const before = cursor ? Number(cursor) : all.length;
    return { items: all.slice(Math.max(0, before - 50), before), nextCursor: before > 50 ? String(before - 50) : null };
  }
  async listGroupMembers(groupId: string): Promise<GroupMember[]> {
    const group = this.groups.find(item => item.id === groupId);
    return group ? [{ profileId: this.own.id, displayName: this.own.displayName, role: group.role, status: 'active' }] : [];
  }
  async inviteGroupMember(_groupId: string, _profileId: string) { throw new Error('demo_invitation_requires_second_user'); }
  async groupAction(groupId: string, action: GroupAction, input: Record<string, string> = {}) {
    const group = this.groups.find(item => item.id === groupId);
    if (!group) throw new Error('group_not_found');
    if (action === 'archive' || action === 'leave' || action === 'decline') this.groups = this.groups.filter(item => item.id !== groupId);
    else if (action === 'hide_message') this.groupMessages = this.groupMessages.filter(item => item.id !== input.messageId);
    else if (action === 'lock' || action === 'unlock') group.status = action === 'lock' ? 'locked' : 'active';
    else if (action === 'accept') group.membershipStatus = 'active';
    await delay();
  }
  async sendGroupMessage(groupId: string, body: string, clientMessageId = Crypto.randomUUID()) {
    if (!validMessageBody(body)) throw new Error('invalid_message_body');
    const existing = this.groupMessages.find(item => item.id === clientMessageId);
    if (existing) {
      if (existing.groupId !== groupId || existing.body !== body.trim()) throw new Error('group_message_id_conflict');
      return structuredClone(existing);
    }
    const message: GroupMessage = { id: clientMessageId, groupId, senderId: this.own.id, senderName: this.own.displayName, body: body.trim(), createdAt: new Date().toISOString() };
    this.groupMessages.push(message);
    await delay();
    return structuredClone(message);
  }
  async startGroupVoice(_groupId: string): Promise<GroupVoiceSession> {
    throw new Error('voice_provider_unavailable');
  }
  async completeOnboarding(payload: OnboardingPayload) {
    if (!payload.sensitiveDataConsent || !payload.privacyAccepted || !payload.termsAccepted || !payload.guidelinesAccepted) throw new Error('explicit_consent_required');
    requiredSexualOrientationSelectionSchema.parse(payload.identity);
    const age = calculateAge(payload.dateOfBirth);
    if (age === null || age < 18) throw new Error('adult_profile_required');
    this.own = {
      ...this.own, displayName: payload.displayName, dateOfBirth: payload.dateOfBirth, age, pronouns: payload.pronouns,
      identity: payload.identity, lookingFor: payload.lookingFor, bio: payload.bio, region: payload.region,
      videos: [...(payload.videos ?? [])], socials: structuredClone(payload.socials ?? []), interests: [...(payload.interests ?? [])],
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
    requireAlbumCapacity(this.tier, { albums: this.albums.filter(a => a.ownerId === this.own.id).length }, 'album');
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
    requireAlbumMedia(input.mediaType, input.byteSize, input.durationMs);
    requireAlbumCapacity(this.tier, { albums: this.albums.filter(a => a.ownerId === this.own.id).length, photos: album.items.filter(i => i.mediaType === 'image').length, videos: album.items.filter(i => i.mediaType === 'video').length }, input.mediaType);
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
  async openAlbumShare(shareId: string, requestId = Crypto.randomUUID()): Promise<AlbumViewer> {
    const prior = [...this.albumSessions.entries()].find(([, session]) => session.requestId === requestId);
    if (prior) {
      if (prior[1].shareId !== shareId) throw new Error('album_share_locked');
      return this.refreshAlbumShare(shareId, prior[0]);
    }
    const share = this.albumShares.find((item) => item.id === shareId && item.recipientId === this.own.id);
    if (!share || share.status !== 'accepted' || this.blocked.has(share.ownerId) || (share.expiresAt && Date.parse(share.expiresAt) <= Date.now())) throw new Error('album_share_locked');
    const album = this.albums.find((item) => item.id === share.albumId);
    if (!album) throw new Error('album_not_found');
    let sessionId: string | undefined;
    let sessionExpiresAt: string | undefined;
    if (share.accessMode === 'view_once') {
      share.status = 'consumed'; sessionId = Crypto.randomUUID(); sessionExpiresAt = new Date(Date.now() + 600_000).toISOString();
      this.albumSessions.set(sessionId, { shareId, expiresAt: sessionExpiresAt, requestId });
    }
    share.lastViewedVersion = album.contentVersion;
    await delay();
    return structuredClone({ shareId, albumId: album.id, name: album.name, contentVersion: album.contentVersion, sessionId, sessionExpiresAt, accessExpiresAt: sessionExpiresAt ?? share.expiresAt, urlsExpireAt: new Date(Date.now() + 60_000).toISOString(), items: album.items });
  }
  async refreshAlbumShare(shareId: string, sessionId?: string): Promise<AlbumViewer> {
    const share = this.albumShares.find(item => item.id === shareId && item.recipientId === this.own.id);
    const session = sessionId ? this.albumSessions.get(sessionId) : undefined;
    if (!share || this.blocked.has(share.ownerId) || (share.expiresAt && Date.parse(share.expiresAt) <= Date.now()) ||
      (share.accessMode === 'view_once' ? share.status !== 'consumed' || !session || session.shareId !== shareId || Date.parse(session.expiresAt) <= Date.now() : share.status !== 'accepted' || Boolean(sessionId))) throw new Error('album_share_locked');
    const album = this.albums.find(item => item.id === share.albumId);
    if (!album) throw new Error('album_share_locked');
    await delay();
    return structuredClone({ shareId, albumId: album.id, name: album.name, contentVersion: album.contentVersion, sessionId, sessionExpiresAt: session?.expiresAt, accessExpiresAt: session?.expiresAt ?? share.expiresAt, urlsExpireAt: new Date(Date.now() + 60_000).toISOString(), items: album.items });
  }
  async closeAlbumViewer(sessionId: string) { this.albumSessions.delete(sessionId); await delay(20); }
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
    this.profileActivity = this.profileActivity.filter(item => item.actorId !== profileId && item.recipientId !== profileId);
    this.albumShares = this.albumShares.map((share) => [share.ownerId, share.recipientId].includes(profileId) && ['pending', 'accepted', 'consumed'].includes(share.status) ? { ...share, status: 'revoked' } : share);
    await delay();
  }
  async unblock(profileId: string) { this.blocked.delete(profileId); await delay(); }
  async listBlocked() { await delay(); return structuredClone(this.profiles.filter((item) => this.blocked.has(item.id))); }
  async report() { await delay(250); }
  async discoverMeetups(filters: MeetupFilters) { await delay(); const results=(await this.meetupService.discover(filters)).map(event=>decorateDemoCommunity(event, this.own.id, this.demoCommunityStore)); return results.filter(event=>!this.blocked.has(event.host.id)).filter(event=>filters.social==='all'||filters.social==='favorites'&&this.stars.some(s=>s.targetType==='event'&&s.targetId===event.id)||filters.social==='friends'&&this.friends.some(f=>f.profileId===event.host.id&&f.status==='accepted')||filters.social==='friends_of_friends'&&this.discoveryFixture(event.host.id).fof&&this.friends.some(f=>f.status==='accepted')); }
  async getMeetup(id: string) { await delay(80); const event = await this.meetupService.get(id); if (this.blocked.has(event.host.id)) throw new Error('meetup_unavailable'); return decorateDemoCommunity(event, this.own.id, this.demoCommunityStore); }
  async listMyMeetups() { await delay(); return (await this.meetupService.listMine()).filter(event => !this.blocked.has(event.host.id)).map(event => decorateDemoCommunity(event, this.own.id, this.demoCommunityStore)); }
  async listMeetupRequests(id: string) { await delay(); return this.meetupService.listRequests(id); }
  async listMeetupParticipants(id: string) { await delay(); return this.meetupService.listParticipants(id); }
  async getMeetupGender(id: string) { return this.meetupService.getGender(id); }
  async setMeetupGender(id: string, gender: string | null) { return this.meetupService.setGender(id, gender); }
  async listMeetupMedia(id: string) { await this.getMeetup(id); return this.meetupService.listMedia(id); }
  async uploadMeetupMedia(id: string, uri: string, kind: 'photo' | 'video', mimeType: string) { return this.meetupService.uploadMedia(id, uri, kind, mimeType); }
  async removeMeetupMedia(id: string, mediaId: string) { await this.meetupService.removeMedia(id, mediaId); if (this.demoCommunityStore.covers.get(id)?.id === mediaId) this.demoCommunityStore.covers.delete(id); }
  async listMeetupReviews(id: string) { return this.meetupService.listReviews(id); }
  async saveMeetupReview(id: string, rating: number, body: string) { return this.meetupService.saveReview(id, rating, body); }
  async deleteMeetupReview(id: string) { return this.meetupService.deleteReview(id); }
  async listMeetupInvitations(id: string) { return this.meetupService.listInvitations(id); }
  async setMeetupInvitation(id: string, profileId: string, invited: boolean) { return this.meetupService.setInvitation(id, profileId, invited); }
  async createMeetupDraft(input: MeetupDraftInput) { await delay(); return this.meetupService.createDraft(input); }
  async updateMeetup(id: string, input: MeetupUpdateInput) { await delay(); return this.meetupService.update(id, input); }
  async publishMeetup(id: string, sponsorship?: MeetupSponsorship) {
    await delay();
    if (!sponsorship) { const event = await this.meetupService.publish(id); notifyDemoCommunity(this.demoCommunityStore, event, 'community_published', 'published', demoEventFollowers(this.demoCommunityStore, event)); return event; }
    await this.walletCommand({ action: 'publish_sponsored', meetupId: id, ...sponsorship });
    const event = await this.meetupService.get(id); notifyDemoCommunity(this.demoCommunityStore, event, 'community_published', 'published', demoEventFollowers(this.demoCommunityStore, event)); return event;
  }
  async deleteMeetupDraft(id: string) { await this.meetupService.deleteDraft(id); await delay(); }
  async joinMeetup(id: string) { await this.getMeetup(id); return this.meetupService.join(id); }
  async requestMeetupAccess(id: string) { await this.getMeetup(id); return this.meetupService.requestAccess(id); }
  async cancelMeetupRequest(id: string) { await this.meetupService.cancelRequest(id); this.demoCommunityStore.applications.get(id)?.delete(this.own.id); this.demoCommunityStore.queues.set(id, (this.demoCommunityStore.queues.get(id) ?? []).filter(row => row.profileId !== this.own.id)); await delay(); }
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
  async cancelMeetup(id: string) {
    await this.meetupService.cancel(id);
    if (this.commerce.state.events[id]) {
      this.commerce.state.events[id]!.cancelled = true;
      this.commerce.state = settleEvent(this.commerce.state, id, new Date().toISOString());
    }
    await delay();
  }
  async reportMeetup(id: string, input: MeetupReportInput) { await delay(); return this.meetupService.report(id, input); }
  async listPublicMeetupRoster(_id: string) { await delay(); return { items: [], nextCursor: null }; }
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
  async resolveNotification(notificationId: string) {
    const item = (await this.listMeetupNotifications(200)).find(notification => notification.id === notificationId);
    if (!item) throw new Error('notification_unavailable');
    await this.meetupService.get(item.meetupId);
    await this.meetupService.markNotificationRead(notificationId);
    return { type: 'meetup' as const, id: item.meetupId };
  }
  async listMeetupNotifications(limit = 50) {
    await delay();
    for (const event of await this.communityDemo.all()) {
      const until = Date.parse(event.startsAt) - Date.now();
      if (event.status !== 'published' || until <= 0) continue;
      const recipients = [...this.communityDemo.participants(event.id), ...demoEventFollowers(this.demoCommunityStore, event, false)];
      if (until <= 86400000 && until > 3600000) notifyDemoCommunity(this.demoCommunityStore, event, 'community_reminder', 'reminder:24h', recipients);
      if (until <= 3600000) notifyDemoCommunity(this.demoCommunityStore, event, 'community_reminder', 'reminder:1h', recipients);
    }
    return [...await this.meetupService.listNotifications(limit), ...(this.demoCommunityStore.notifications.get(this.own.id) ?? [])]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
  async markMeetupNotificationRead(notificationId: string) {
    const community = this.demoCommunityStore.notifications.get(this.own.id)?.find(item => item.id === notificationId);
    if (community) community.readAt = new Date().toISOString(); else await this.meetupService.markNotificationRead(notificationId); await delay();
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
  async requestExport() { await delay(300); return JSON.stringify({ demo: true, profile: this.own, conversations: this.conversations, messages: this.messages, albums: this.albums.filter(album => album.ownerId === this.own.id), profileActivity: this.profileActivity.filter(item => item.actorId === this.own.id || !this.blocked.has(item.actorId) && this.discoveryFixture(item.actorId).visible).map(({ profile: _profile, ...item }) => item), profileTapSends: this.profileTapSends.map(sentAt => new Date(sentAt).toISOString()) }, null, 2); }
  async withdrawSensitiveConsent() { this.own.isHidden = true; await delay(); }
  async deleteAccount() { this.profileActivity = []; this.profileTapSends = []; await delay(300); }
}
