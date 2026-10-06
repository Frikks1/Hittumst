import type { Entitlement, FinanceCommand, FinanceSnapshot, TierId, MeetupMedia, MeetupReview, MeetupSponsorship } from '@rummal/shared';
import type {
  Album, AlbumAccessMode, AlbumItem, AlbumShare, AlbumViewer, ChatMessage, ConversationSummary, NotificationTarget,
  DiscoveryFilters, GeoCoordinate, LocationVerification, MeetupDetail, MeetupDraftInput,
  MeetupFilters, MeetupNotification, MeetupParticipation, MeetupPlaceResult,
  MeetupPlaceSearchOptions, MeetupProfileHistoryPage, MeetupProfileUpcomingPage, MeetupReinstateStatus, MeetupReportInput, MeetupRequest, MeetupRosterEntry, MeetupRoomMessage,
  MeetupPublicRosterPage, MeetupRoomMessagePage, MeetupRoomSummary, MeetupRsvpVisibility, MeetupSummary, MeetupUpdateInput,
  ContentComment, ContentRating, ContentReaction, ContentTargetType, FriendSummary, GroupAction, GroupMember, GroupMessage, GroupSummary, GroupVoiceSession,
  OwnProfile, Page, ProfileActivity, ProfileActivityKind, ProfileAudience, ProfileReactionEmoji, ProfileSocial, ProfileTag, PublicProfile, PushPlatform, ReportCategory,
  StarredItem, StarredTargetType
} from '@/types/domain';

export type AuthUser = { id: string; email: string | null };
export type AuthProvider = 'apple' | 'google' | 'facebook';

export type OnboardingPayload = {
  dateOfBirth: string;
  displayName: string;
  pronouns?: string;
  identity: OwnProfile['identity'];
  lookingFor: OwnProfile['lookingFor'];
  videos?: string[];
  socials?: ProfileSocial[];
  customTags?: string[];
  interests?: string[];
  bio: string;
  region: OwnProfile['region'];
  sensitiveDataConsent: boolean;
  privacyAccepted: boolean;
  termsAccepted: boolean;
  guidelinesAccepted: boolean;
  locale: 'is' | 'en';
};

export interface AuthService {
  getUser(): Promise<AuthUser | null>;
  requestEmailOtp(email: string): Promise<void>;
  verifyEmailOtp(email: string, token: string): Promise<AuthUser>;
  signInWithProvider(provider: AuthProvider): Promise<AuthUser>;
  signOut(): Promise<void>;
  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void;
}

export interface RummalApi {
  readonly isDemo: boolean;
  getEntitlement(): Promise<Entitlement>;
  setSandboxTier(tier: TierId): Promise<Entitlement>;
  getWallet(): Promise<FinanceSnapshot>;
  getPendingFinanceCommand(): Promise<FinanceCommand | null>;
  walletCommand(command: FinanceCommand): Promise<unknown>;
  listMediaUploads(albumId: string): Promise<{ id: string; status: string; createdAt: string; reason: string | null }[]>;
  appealMediaUpload(id: string): Promise<void>;
  getPremiumProfile(id: string): Promise<{effect: boolean; badge: boolean; months: number}>;
  setPremiumProfile(effect: boolean, badge: boolean): Promise<void>;
  discover(filters: DiscoveryFilters, cursor?: string | null): Promise<Page<PublicProfile>>;
  getProfile(id: string): Promise<PublicProfile>;
  listProfileActivity(kind: ProfileActivityKind, cursor?: string | null): Promise<Page<ProfileActivity>>;
  recordProfileView(profileId: string): Promise<void>;
  sendProfileTap(profileId: string): Promise<void>;
  hasCompletedOnboarding(): Promise<boolean>;
  getOwnProfile(): Promise<OwnProfile>;
  updateProfile(profile: Partial<OwnProfile>): Promise<OwnProfile>;
  listProfileTags(): Promise<ProfileTag[]>;
  uploadProfilePhoto(uri: string, mimeType?: string): Promise<void>;
  uploadProfileVideo(uri: string, mimeType?: string, durationMs?: number, tags?: string[]): Promise<void>;
  updateProfileMediaTags(mediaType: 'photo' | 'video', mediaId: string, tags: string[]): Promise<void>;
  listFeedback(targetType: ContentTargetType, targetId: string): Promise<{ ratings: ContentRating[]; comments: ContentComment[]; reactions: ContentReaction[] }>;
  rateContent(targetType: ContentTargetType, targetId: string, value: -1 | 1): Promise<void>;
  commentOnContent(targetType: ContentTargetType, targetId: string, body: string): Promise<ContentComment>;
  toggleContentReaction(targetType: ContentTargetType, targetId: string, emoji: ProfileReactionEmoji): Promise<void>;
  listFriends(): Promise<FriendSummary[]>;
  setFriendship(profileId: string, action: 'request' | 'accept' | 'decline' | 'remove'): Promise<void>;
  listStarredItems(ownerId?: string): Promise<StarredItem[]>;
  toggleStarredItem(targetType: StarredTargetType, targetId: string, label: string, audience?: ProfileAudience): Promise<boolean>;
  listGroups(): Promise<GroupSummary[]>;
  createGroup(name: string, bio?: string): Promise<string>;
  listGroupMessages(groupId: string): Promise<GroupMessage[]>;
  listGroupMessagePage(groupId: string, cursor?: string | null): Promise<Page<GroupMessage>>;
  listGroupMembers(groupId: string): Promise<GroupMember[]>;
  inviteGroupMember(groupId: string, profileId: string): Promise<void>;
  groupAction(groupId: string, action: GroupAction, input?: Record<string, string>): Promise<void>;
  sendGroupMessage(groupId: string, body: string, clientMessageId?: string): Promise<GroupMessage>;
  startGroupVoice(groupId: string): Promise<GroupVoiceSession>;
  completeOnboarding(payload: OnboardingPayload): Promise<void>;
  updateLocation(fix: { latitude: number; longitude: number; accuracy: number; capturedAt: string }): Promise<LocationVerification>;
  touchPresence(): Promise<void>;
  listConversations(cursor?: string | null, query?: string): Promise<Page<ConversationSummary>>;
  startConversation(profileId: string): Promise<string>;
  listMessages(conversationId: string, cursor?: string | null): Promise<Page<ChatMessage>>;
  sendText(conversationId: string, text: string, clientMessageId?: string): Promise<ChatMessage>;
  markConversationRead(conversationId: string, through: string): Promise<void>;
  sendImage(conversationId: string, uri: string, mimeType?: string): Promise<ChatMessage>;
  listMyAlbums(): Promise<Album[]>;
  createAlbum(name: string): Promise<Album>;
  renameAlbum(albumId: string, name: string): Promise<void>;
  deleteAlbum(albumId: string): Promise<void>;
  addAlbumItem(albumId: string, input: { uri: string; mimeType: string; mediaType: 'image' | 'video'; byteSize: number; durationMs?: number }): Promise<AlbumItem>;
  deleteAlbumItem(itemId: string): Promise<void>;
  listAlbumShares(): Promise<AlbumShare[]>;
  shareAlbums(profileIds: string | string[], albumIds: string[], accessMode: AlbumAccessMode): Promise<{ conversationId?: string; conversationIds: Record<string, string>; shareIds: string[] }>;
  respondToAlbumShare(shareId: string, accept: boolean): Promise<void>;
  revokeAlbumShare(shareId: string): Promise<void>;
  openAlbumShare(shareId: string, requestId?: string): Promise<AlbumViewer>;
  refreshAlbumShare(shareId: string, sessionId?: string): Promise<AlbumViewer>;
  closeAlbumViewer(sessionId: string): Promise<void>;
  toggleAlbumReaction(shareId: string, itemId: string): Promise<boolean>;
  sendAlbumReply(shareId: string, itemId: string, body: string): Promise<void>;
  subscribeMessages(conversationId: string, callback: (message: ChatMessage) => void, onReconnect?: () => void): () => void;
  deleteConversation(conversationId: string): Promise<void>;
  block(profileId: string): Promise<void>;
  unblock(profileId: string): Promise<void>;
  listBlocked(): Promise<PublicProfile[]>;
  report(input: { profileId: string; category: ReportCategory; notes?: string; conversationId?: string; albumShareId?: string; albumItemId?: string }): Promise<void>;
  discoverMeetups(filters: MeetupFilters): Promise<MeetupSummary[]>;
  getMeetup(id: string): Promise<MeetupDetail>;
  listMyMeetups(): Promise<MeetupDetail[]>;
  listMeetupRequests(id: string): Promise<MeetupRequest[]>;
  listMeetupParticipants(id: string): Promise<MeetupRosterEntry[]>;
  getMeetupGender(id: string): Promise<string | null>;
  setMeetupGender(id: string, gender: string | null): Promise<void>;
  listMeetupMedia(id: string): Promise<MeetupMedia[]>;
  uploadMeetupMedia(id: string, uri: string, kind: 'photo' | 'video', mimeType: string): Promise<string | void>;
  removeMeetupMedia(id: string, mediaId: string): Promise<void>;
  listMeetupReviews(id: string): Promise<MeetupReview[]>;
  saveMeetupReview(id: string, rating: number, body: string): Promise<void>;
  deleteMeetupReview(id: string): Promise<void>;
  listMeetupInvitations(id: string): Promise<string[]>;
  setMeetupInvitation(id: string, profileId: string, invited: boolean): Promise<void>;
  createMeetupDraft(input: MeetupDraftInput): Promise<string>;
  updateMeetup(id: string, input: MeetupUpdateInput): Promise<MeetupDetail>;
  publishMeetup(id: string, sponsorship?: MeetupSponsorship): Promise<MeetupDetail>;
  deleteMeetupDraft(id: string): Promise<void>;
  joinMeetup(id: string): Promise<MeetupParticipation>;
  requestMeetupAccess(id: string): Promise<MeetupParticipation>;
  cancelMeetupRequest(id: string): Promise<void>;
  leaveMeetup(id: string): Promise<void>;
  respondToMeetupRequest(id: string, profileId: string, approve: boolean): Promise<MeetupRequest>;
  removeMeetupParticipant(id: string, profileId: string): Promise<void>;
  reinstateMeetupParticipant(id: string, profileId: string, status: MeetupReinstateStatus): Promise<MeetupRequest>;
  cancelMeetup(id: string): Promise<void>;
  reportMeetup(id: string, input: MeetupReportInput): Promise<string>;
  listPublicMeetupRoster(id: string): Promise<MeetupPublicRosterPage>;
  listProfileMeetupHistory(profileId: string): Promise<MeetupProfileHistoryPage>;
  listProfileUpcomingMeetups(profileId: string): Promise<MeetupProfileUpcomingPage>;
  setMeetupRsvpVisibility(id: string, visibility: MeetupRsvpVisibility): Promise<void>;
  confirmMeetupAttendance(id: string): Promise<void>;
  completeMeetupAttendance(id: string, outcome: 'attended' | 'did_not_attend' | 'dismiss', historyVisibility?: 'visible' | 'private'): Promise<void>;
  setMeetupHistoryVisibility(id: string, visibility: 'visible' | 'private'): Promise<void>;
  getMeetupRoom(id: string): Promise<MeetupRoomSummary | null>;
  listMeetupRoomMessages(roomId: string, cursor?: string | null): Promise<MeetupRoomMessagePage>;
  sendMeetupRoomMessage(roomId: string, body: string, clientMessageId?: string): Promise<MeetupRoomMessage>;
  subscribeMeetupRoom(roomId: string, onInvalidate: () => void): () => void;
  setAdultContentPreference(enabled: boolean): Promise<void>;
  listMeetupNotifications(limit?: number): Promise<MeetupNotification[]>;
  resolveNotification(notificationId: string): Promise<NotificationTarget>;
  markMeetupNotificationRead(notificationId: string): Promise<void>;
  registerPushToken(expoPushToken: string, platform: PushPlatform, locale?: 'is' | 'en'): Promise<void>;
  unregisterPushToken(expoPushToken: string): Promise<void>;
  searchMeetupPlaces(query: string, options?: MeetupPlaceSearchOptions): Promise<MeetupPlaceResult[]>;
  reverseGeocodeMeetupPlace(coordinate: GeoCoordinate, options?: MeetupPlaceSearchOptions): Promise<MeetupPlaceResult | null>;
  requestExport(): Promise<string>;
  withdrawSensitiveConsent(): Promise<void>;
  deleteAccount(): Promise<void>;
}
