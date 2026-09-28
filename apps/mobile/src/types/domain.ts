import { defaultDiscoveryExtensions, type DiscoveryExtensions, type ProfileGender, type DiagnosisId } from '@rummal/shared';
export type Identity = 'gay' | 'bi' | 'queer' | 'trans' | 'nonbinary' | 'lesbian';
export type Intent = 'chat' | 'dates' | 'friends' | 'relationship';
export type IcelandRegion = 'capital' | 'south' | 'west' | 'westfjords' | 'north' | 'east';
export type DistanceBand = 'under1' | '1to3' | '3to10' | '10to25' | '25plus' | '10to30' | '30plus';
export type PhotoStatus = 'pending' | 'approved' | 'rejected';
export type ProfileTagCategory = 'kinks' | 'hobbies' | 'personality' | 'other';
export type ProfileTag = { id: string; label: string; category: ProfileTagCategory; sortOrder: number };
export type SocialPlatform = 'instagram' | 'tiktok' | 'x' | 'discord' | 'steam' | 'youtube' | 'website';
export type ProfileSocial = { platform: SocialPlatform; handle: string };
export type ProfileVideo = { id: string; url: string; tags: string[]; durationMs?: number; status: PhotoStatus };
export type ContentTargetType = 'profile' | 'photo' | 'video';
export type ContentRating = { id: string; targetType: ContentTargetType; targetId: string; userId: string; value: -1 | 1; isAnonymous?: boolean };
export type ContentComment = { id: string; targetType: ContentTargetType; targetId: string; authorId: string; authorName: string; body: string; createdAt: string; isAnonymous?: boolean };
export type ContentReaction = { emoji: '❤️' | '🔥' | '😊' | '👏' | '🏳️‍🌈'; count: number; reacted: boolean };
export type {
  FriendSummary,
  FriendshipStatus,
  GroupMessage,
  GroupRole,
  GroupVoiceSession,
  ProfileAudience,
  ProfileReactionEmoji,
  StarredItem,
  StarredTargetType,
} from '@rummal/shared';
export type AlbumAccessMode = 'indefinite' | 'view_once' | '10_minutes' | '1_hour' | '24_hours';
export type AlbumShareStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired' | 'consumed';
export type AlbumMediaType = 'image' | 'video';

export type AlbumItem = {
  id: string;
  albumId: string;
  mediaType: AlbumMediaType;
  position: number;
  url?: string;
  storagePath?: string;
  byteSize?: number;
  durationMs?: number;
};

export type Album = {
  id: string;
  ownerId: string;
  name: string;
  contentVersion: number;
  items: AlbumItem[];
  createdAt: string;
  updatedAt: string;
};

export type AlbumShare = {
  id: string;
  albumId: string;
  albumName: string;
  ownerId: string;
  recipientId: string;
  conversationId: string;
  accessMode: AlbumAccessMode;
  status: AlbumShareStatus;
  sharedVersion: number;
  lastViewedVersion: number;
  sharedAt: string;
  acceptedAt?: string;
  expiresAt?: string;
  isIncoming: boolean;
  itemCount: number;
};

export type AlbumViewer = {
  shareId: string;
  albumId: string;
  name: string;
  contentVersion: number;
  sessionId?: string;
  sessionExpiresAt?: string;
  accessExpiresAt?: string;
  urlsExpireAt?: string;
  items: AlbumItem[];
};

export type NotificationTarget = { type: 'meetup' | 'conversation' | 'group'; id: string; profileId?: string; displayName?: string };

export type PublicProfile = {
  id: string;
  displayName: string;
  age: number;
  pronouns?: string;
  identity: Identity[];
  lookingFor: Intent[];
  tags: string[];
  videos: string[];
  profileVideos: ProfileVideo[];
  socials: ProfileSocial[];
  customTags: string[];
  interests: string[];
  coverPhotoId?: string | null;
  conversationPrompt?: string;
  bio: string;
  region: IcelandRegion;
  isOnline: boolean;
  distanceBand: DistanceBand | null;
  gender?: ProfileGender | null;
  diagnosisIds?: DiagnosisId[];
  photos: Array<{ id: string; url: string; status: PhotoStatus; tags?: string[] }>;
  commentWallEnabled?: boolean;
  anonymousRatingsEnabled?: boolean;
};

export type GroupSummary = import('@rummal/shared').GroupSummary & { membershipStatus?: 'active' | 'invited'; status?: 'active' | 'locked' };
export type GroupMember = { profileId: string; displayName: string; role: import('@rummal/shared').GroupRole; status: 'active' | 'invited' };
export type GroupAction = 'accept' | 'decline' | 'leave' | 'lock' | 'unlock' | 'archive' | 'remove_member' | 'set_role' | 'hide_message';

export type OwnProfile = Omit<PublicProfile, 'distanceBand'> & {
  dateOfBirth?: string;
  friendsOfFriendsDiscovery?: boolean;
  isHidden: boolean;
  showOnline: boolean;
  locationSharing: boolean;
  adultProfileTagsEnabled?: boolean;
  starredProfileAudience?: 'everyone' | 'friends' | 'no_one';
  meetupRsvpVisibilityDefault?: 'visible' | 'private';
  commentWallEnabled?: boolean;
  anonymousRatingsEnabled?: boolean;
};

export type DiscoveryFilters = DiscoveryExtensions & {
  ageMin: number;
  ageMax: number;
  identities: Identity[];
  intents: Intent[];
  activity: 'all' | 'now' | 'recent' | 'month';
  /** Legacy saved-filter input only. */
  onlineOnly?: boolean;
  tags: string[];
};

export const defaultFilters: DiscoveryFilters = {
  ageMin: 18,
  ageMax: 99,
  identities: [],
  intents: [],
  ...defaultDiscoveryExtensions,
  activity: 'all',
  tags: []
};

export type ConversationSummary = {
  id: string;
  member: Pick<PublicProfile, 'id' | 'displayName' | 'photos'>;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

export type MessageStatus = 'sending' | 'sent' | 'failed';

export type ChatMessage = {
  mediaStatus?: 'pending' | 'approved' | 'rejected';
  id: string;
  conversationId: string;
  senderId: string | null;
  body?: string;
  imageUrl?: string;
  kind: 'text' | 'image' | 'album_share' | 'album_reply' | 'album_reaction';
  albumShareId?: string;
  albumItemId?: string;
  createdAt: string;
  status: MessageStatus;
};

export type ReportCategory = 'harassment' | 'hate' | 'impersonation' | 'minor' | 'intimate' | 'spam' | 'other';

export type LocationVerification = {
  verified: boolean;
  reason?: 'outside_iceland' | 'poor_accuracy' | 'stale' | 'rate_limited' | 'server_error';
  verifiedAt?: string;
};

export type Page<T> = { items: T[]; nextCursor: string | null };

// Hittingar contracts live in @rummal/shared so mobile, admin, and backend
// adapters validate the same wire shapes. The existing profile-report
// `ReportCategory` above remains a temporary UI compatibility type.
export {
  defaultMeetupFilters,
  expoPushTokenSchema,
  calculateMeetupEffectiveEnd,
  calculateMeetupLocationAccessExpiry,
  calculateMeetupReleaseAt,
  geoCoordinateSchema,
  meetupAccessModeSchema,
  meetupCategories,
  meetupCategorySchema,
  meetupDetailSchema,
  meetupDraftInputSchema,
  meetupFiltersSchema,
  meetupGeneralAreaIdSchema,
  meetupGeneralAreaSchema,
  meetupLocationStateSchema,
  meetupNotificationSchema,
  meetupParticipationSchema,
  meetupPlaceQuerySchema,
  meetupPlaceResultSchema,
  meetupPlaceSearchOptionsSchema,
  meetupReportInputSchema,
  meetupReinstateStatusSchema,
  meetupRosterEntrySchema,
  meetupRosterStatusSchema,
  meetupReleasePolicySchema,
  meetupRequestSchema,
  meetupSummarySchema,
  meetupTags,
  meetupTagSchema,
  meetupTagListSchema,
  meetupUpdateInputSchema,
  meetupViewerCapabilitiesSchema,
  meetupViewerStateSchema,
  pushTokenRegistrationSchema,
  safeMeetupPublicationDefaults,
} from '@rummal/shared';

export type {
  GeoCoordinate,
  HittingurCategory,
  HittingurDetail,
  HittingurDraft,
  HittingurFilters,
  HittingurMapItem,
  HittingurNotification,
  HittingurParticipation,
  HittingurPlaceResult,
  MeetupAccessMode,
  MeetupBounds,
  MeetupCategory,
  MeetupDetail,
  MeetupDraftInput,
  MeetupFilters,
  MeetupGeneralArea,
  MeetupGeneralAreaId,
  MeetupHost,
  MeetupLocationState,
  MeetupLocationStateName,
  MeetupLocationVisibility,
  MeetupIntention,
  MeetupAttendanceOutcome,
  MeetupAttendanceState,
  MeetupVenueMode,
  MeetupRsvpVisibility,
  MeetupRoomMessage,
  MeetupRoomMessagePage,
  MeetupRoomSummary,
  MeetupRecurrenceRule,
  MeetupMarker,
  MeetupNotification,
  MeetupNotificationKind,
  MeetupParticipantProfile,
  MeetupParticipation,
  MeetupParticipationStatus,
  MeetupProfileHistoryItem,
  MeetupProfileHistoryPage,
  MeetupProfileUpcomingItem,
  MeetupProfileUpcomingPage,
  MeetupPublicRosterPage,
  MeetupPlaceKind,
  MeetupPlaceResult,
  MeetupPlaceSearchOptions,
  MeetupRegion,
  MeetupReinstateStatus,
  MeetupReleasePolicy,
  MeetupReportInput,
  MeetupRequest,
  MeetupRequestStatus,
  MeetupRosterEntry,
  MeetupRosterStatus,
  MeetupStatus,
  MeetupSummary,
  MeetupTag,
  MeetupTimingFilter,
  MeetupUpdateInput,
  MeetupViewerCapabilities,
  MeetupViewerState,
  ReportCategory as MeetupReportCategory,
  PushPlatform,
  PushTokenRegistration,
} from '@rummal/shared';
