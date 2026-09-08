import { validMessageBody } from '@/utils/chatDelivery';
import { decodeMessageCursor } from '@/utils/messagePagination';
import * as Crypto from 'expo-crypto';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { calculateAge } from '@/utils/age';
import type {
  Album, AlbumAccessMode, AlbumItem, AlbumShare, AlbumShareStatus, AlbumViewer, ChatMessage,
  ConversationSummary, DiscoveryFilters, DistanceBand, GeoCoordinate, Identity, IcelandRegion, Intent,
  LocationVerification, MeetupDraftInput, MeetupFilters, MeetupPlaceSearchOptions, MeetupReinstateStatus,
  MeetupReportInput, MeetupUpdateInput, OwnProfile, ProfileSocial, ProfileTag, ProfileTagCategory,
  PublicProfile, Page, PushPlatform, ReportCategory, SocialPlatform, ContentComment, ContentRating, ContentReaction, ContentTargetType,
  FriendSummary, GroupMessage, GroupSummary, GroupVoiceSession, ProfileAudience, ProfileReactionEmoji, StarredItem, StarredTargetType
} from '@/types/domain';
import type { Database, Json } from '@/types/database';
import type { OnboardingPayload, RummalApi } from './types';
import { LiveMeetupService } from './meetupLive';
import { supabase } from './supabase';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type PhotoRow = Database['public']['Tables']['profile_photos']['Row'];
type MessageRow = Database['public']['Tables']['messages']['Row'];

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase!.auth.getUser();
  if (error || !data.user) throw error ?? new Error('Authentication required');
  return data.user.id;
}

async function signedUrls(bucket: 'profile-photos' | 'message-images' | 'album-media' | 'profile-videos', paths: string[], expiresIn = 5 * 60): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await supabase!.storage.from(bucket).createSignedUrls(paths, expiresIn);
  if (error) throw error;
  return new Map(
    data.flatMap((item) =>
      item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
    ),
  );
}

const databaseRegions: Record<IcelandRegion, string> = {
  capital: 'hofudborgarsvaedid',
  south: 'sudurland',
  west: 'vesturland',
  westfjords: 'vestfirdir',
  north: 'nordurland_eystra',
  east: 'austurland',
};

function toDatabaseRegion(region: IcelandRegion): string {
  return databaseRegions[region];
}

function fromDatabaseRegion(region: string | null | undefined): IcelandRegion {
  switch (region) {
    case 'sudurland': return 'south';
    case 'vesturland':
    case 'sudurnes': return 'west';
    case 'vestfirdir': return 'westfjords';
    case 'nordurland_vestra':
    case 'nordurland_eystra': return 'north';
    case 'austurland': return 'east';
    default: return 'capital';
  }
}

function safeDistance(value: string): DistanceBand {
  return ['under1', '1to3', '3to10', '10to25', '25plus'].includes(value) ? value as DistanceBand : '25plus';
}

const socialPlatforms: SocialPlatform[] = ['instagram', 'tiktok', 'x', 'discord', 'steam', 'youtube', 'website'];

function mapSocials(value: Json | undefined): ProfileSocial[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const platform = item.platform;
    const handle = item.handle;
    return typeof platform === 'string' && socialPlatforms.includes(platform as SocialPlatform) && typeof handle === 'string' && handle.trim()
      ? [{ platform: platform as SocialPlatform, handle: handle.trim() }]
      : [];
  });
}

async function mapProfile(row: ProfileRow, photos: PhotoRow[], distanceBand: DistanceBand = '25plus'): Promise<PublicProfile> {
  const approved = photos.filter((item) => item.approval_status === 'approved');
  const urls = await signedUrls('profile-photos', approved.map((item) => item.storage_path));
  return {
    id: row.id,
    displayName: row.display_name ?? 'Hittumst',
    age: row.date_of_birth ? calculateAge(row.date_of_birth) ?? 18 : 18,
    pronouns: row.pronouns ?? undefined,
    identity: row.identity_tags as Identity[],
    lookingFor: row.looking_for as Intent[],
    tags: row.profile_tags,
    videos: row.videos,
    profileVideos: [],
    socials: mapSocials(row.socials),
    interests: row.interests,
    bio: row.bio ?? '',
    region: fromDatabaseRegion(row.region),
    isOnline: false,
    distanceBand,
    customTags: row.custom_tags,
    photos: approved.map((item) => ({ id: item.id, url: urls.get(item.storage_path) ?? '', status: 'approved', tags: item.tags }))
  };
}

async function mapMessage(row: MessageRow): Promise<ChatMessage> {
  let imageUrl: string | undefined;
  if (row.image_path) imageUrl = (await signedUrls('message-images', [row.image_path])).get(row.image_path);
  return {
    id: row.id, conversationId: row.conversation_id, senderId: row.sender_id,
    body: row.deleted_at ? undefined : row.body ?? undefined,
    imageUrl: row.deleted_at ? undefined : imageUrl,
    kind: (row.message_kind ?? (row.image_path ? 'image' : 'text')) as ChatMessage['kind'],
    albumShareId: row.album_share_id ?? undefined,
    albumItemId: row.album_item_id ?? undefined,
    createdAt: row.created_at, status: 'sent'
  };
}

export class LiveRummalApi implements RummalApi {
  readonly isDemo = false;
  private readonly meetupService = new LiveMeetupService();

  async discover(filters: DiscoveryFilters, cursor?: string | null) {
    const parsedCursor = cursor ? JSON.parse(cursor) as Json : null;
    const { data, error } = await supabase!.rpc('discover_nearby', {
      filters: {
        min_age: filters.ageMin, max_age: filters.ageMax, identities: filters.identities,
        intents: filters.intents, tags: filters.tags, online_only: filters.onlineOnly, limit: 40
      },
      cursor: parsedCursor
    });
    if (error) throw error;
    const allPaths = data.flatMap((row) => row.photo_paths ?? []);
    const urls = await signedUrls('profile-photos', allPaths);
    const items: PublicProfile[] = data.map((row) => ({
      id: row.profile_id, displayName: row.display_name, age: row.age, pronouns: row.pronouns ?? undefined,
      identity: row.identity_tags as Identity[], lookingFor: row.looking_for as Intent[], bio: row.bio,
      tags: row.profile_tags ?? [],
      videos: [], profileVideos: [], customTags: [], socials: [], interests: [],
      region: fromDatabaseRegion(row.region), isOnline: row.is_online, distanceBand: safeDistance(row.distance_band),
      photos: (row.photo_paths ?? []).map((path, index) => ({ id: `${row.profile_id}-${index}`, url: urls.get(path) ?? '', status: 'approved' }))
    }));
    const last = data.at(-1);
    return { items, nextCursor: data.length === 40 && last?.result_cursor ? JSON.stringify(last.result_cursor) : null };
  }

  async getProfile(id: string): Promise<PublicProfile> {
    const { data, error } = await supabase!.rpc('get_public_profile', { profile_id: id });
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) throw error ?? new Error('Profile not found');
    const row = data as Record<string, Json | undefined>;
    const photoEntries = Array.isArray(row.photo_paths) ? row.photo_paths : [];
    const photoPaths = photoEntries.flatMap((item) => typeof item === 'string' ? [item] : item && typeof item === 'object' && !Array.isArray(item) && typeof item.path === 'string' ? [item.path] : []);
    const videoEntries = Array.isArray(row.profile_videos) ? row.profile_videos.filter((item): item is Record<string, Json | undefined> => typeof item === 'object' && item !== null && !Array.isArray(item)) : [];
    const [urls, videoUrls] = await Promise.all([
      signedUrls('profile-photos', photoPaths),
      signedUrls('profile-videos', videoEntries.map((item) => String(item.path)), 5 * 60),
    ]);
    return {
      id: String(row.id), displayName: String(row.display_name), age: Number(row.age),
      pronouns: typeof row.pronouns === 'string' ? row.pronouns : undefined,
      identity: (Array.isArray(row.identity_tags) ? row.identity_tags : []) as Identity[],
      lookingFor: (Array.isArray(row.looking_for) ? row.looking_for : []) as Intent[],
      tags: Array.isArray(row.profile_tags) ? row.profile_tags.filter((item): item is string => typeof item === 'string') : [],
      videos: Array.isArray(row.videos) ? row.videos.filter((item): item is string => typeof item === 'string') : [],
      profileVideos: videoEntries.map((item) => ({ id: String(item.id), url: videoUrls.get(String(item.path)) ?? '', tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [], durationMs: Number(item.duration_ms), status: 'approved' as const })),
      socials: mapSocials(row.socials),
      customTags: Array.isArray(row.custom_tags) ? row.custom_tags.filter((item): item is string => typeof item === 'string') : [],
      interests: Array.isArray(row.interests) ? row.interests.filter((item): item is string => typeof item === 'string') : [],
      bio: typeof row.bio === 'string' ? row.bio : '', region: fromDatabaseRegion(typeof row.region === 'string' ? row.region : null),
      isOnline: row.is_online === true, distanceBand: safeDistance('25plus'),
      commentWallEnabled: row.comment_wall_enabled !== false,
      anonymousRatingsEnabled: row.anonymous_ratings_enabled !== false,
      photos: photoEntries.map((entry, index) => {
        const path = typeof entry === 'string' ? entry : String((entry as Record<string, Json | undefined>).path);
        const rawTags = typeof entry === 'object' && entry !== null && !Array.isArray(entry) ? (entry as Record<string, Json | undefined>).tags : [];
        return { id: typeof entry === 'object' && entry !== null && !Array.isArray(entry) && entry.id ? String(entry.id) : `${id}-${index}`, url: urls.get(path) ?? '', status: 'approved' as const, tags: Array.isArray(rawTags) ? rawTags.filter((tag): tag is string => typeof tag === 'string') : [] };
      })
    };
  }

  async getOwnProfile(): Promise<OwnProfile> {
    const id = await requireUserId();
    const [profileResult, photosResult, videosResult] = await Promise.all([
      supabase!.from('profiles').select('*').eq('id', id).single(),
      supabase!.from('profile_photos').select('*').eq('profile_id', id).order('position'),
      supabase!.from('profile_videos').select('*').eq('profile_id', id).order('position')
    ]);
    if (profileResult.error) throw profileResult.error;
    if (photosResult.error) throw photosResult.error;
    if (videosResult.error) throw videosResult.error;
    const row = profileResult.data;
    const [paths, videoPaths] = await Promise.all([
      signedUrls('profile-photos', photosResult.data.map((item) => item.storage_path)),
      signedUrls('profile-videos', videosResult.data.map((item) => item.storage_path)),
    ]);
    return {
      id: row.id, displayName: row.display_name ?? 'Hittumst', age: row.date_of_birth ? calculateAge(row.date_of_birth) ?? 18 : 18,
      dateOfBirth: row.date_of_birth ?? undefined, pronouns: row.pronouns ?? undefined,
      identity: row.identity_tags as Identity[], lookingFor: row.looking_for as Intent[], bio: row.bio ?? '',
      tags: row.profile_tags,
      videos: row.videos,
      profileVideos: videosResult.data.map((item) => ({ id: item.id, url: videoPaths.get(item.storage_path) ?? '', tags: item.tags, durationMs: item.duration_ms, status: item.approval_status as OwnProfile['photos'][number]['status'] })),
      socials: mapSocials(row.socials),
      customTags: row.custom_tags,
      interests: row.interests,
      region: fromDatabaseRegion(row.region), isOnline: false, isHidden: !row.is_profile_visible,
      showOnline: row.is_online_status_visible, locationSharing: row.is_location_sharing_enabled,
      adultProfileTagsEnabled: (row as unknown as Record<string, unknown>).adult_profile_tags_enabled === true,
      starredProfileAudience: ((row as unknown as Record<string, unknown>).starred_profile_audience as OwnProfile['starredProfileAudience']) ?? 'no_one',
      meetupRsvpVisibilityDefault: ((row as unknown as Record<string, unknown>).meetup_rsvp_visibility_default as OwnProfile['meetupRsvpVisibilityDefault']) ?? 'private',
      commentWallEnabled: (row as unknown as Record<string, unknown>).comment_wall_enabled !== false,
      anonymousRatingsEnabled: (row as unknown as Record<string, unknown>).anonymous_ratings_enabled !== false,
      photos: photosResult.data.map((item) => ({
        id: item.id, url: paths.get(item.storage_path) ?? '', status: item.approval_status as OwnProfile['photos'][number]['status'], tags: item.tags
      }))
    };
  }

  async updateProfile(profile: Partial<OwnProfile>) {
    const id = await requireUserId();
    const update: Database['public']['Tables']['profiles']['Update'] = {};
    if (profile.displayName !== undefined) update.display_name = profile.displayName;
    if (profile.pronouns !== undefined) update.pronouns = profile.pronouns;
    if (profile.identity !== undefined) update.identity_tags = profile.identity;
    if (profile.lookingFor !== undefined) update.looking_for = profile.lookingFor;
    if (profile.tags !== undefined) update.profile_tags = profile.tags;
    if (profile.videos !== undefined) update.videos = profile.videos;
    if (profile.customTags !== undefined) update.custom_tags = profile.customTags;
    if (profile.socials !== undefined) update.socials = profile.socials as unknown as Json;
    if (profile.interests !== undefined) update.interests = profile.interests;
    if (profile.bio !== undefined) update.bio = profile.bio;
    if (profile.region !== undefined) update.region = toDatabaseRegion(profile.region);
    if (profile.isHidden !== undefined) update.is_profile_visible = !profile.isHidden;
    if (profile.adultProfileTagsEnabled !== undefined) (update as unknown as Record<string, unknown>).adult_profile_tags_enabled = profile.adultProfileTagsEnabled;
    if (profile.starredProfileAudience !== undefined) (update as unknown as Record<string, unknown>).starred_profile_audience = profile.starredProfileAudience;
    if (profile.meetupRsvpVisibilityDefault !== undefined) (update as unknown as Record<string, unknown>).meetup_rsvp_visibility_default = profile.meetupRsvpVisibilityDefault;
    if (profile.commentWallEnabled !== undefined) (update as unknown as Record<string, unknown>).comment_wall_enabled = profile.commentWallEnabled;
    if (profile.anonymousRatingsEnabled !== undefined) (update as unknown as Record<string, unknown>).anonymous_ratings_enabled = profile.anonymousRatingsEnabled;
    if (profile.showOnline !== undefined) update.is_online_status_visible = profile.showOnline;
    if (profile.locationSharing !== undefined) update.is_location_sharing_enabled = profile.locationSharing;
    const { error } = await supabase!.from('profiles').update(update).eq('id', id);
    if (error) throw error;
    return this.getOwnProfile();
  }

  async listProfileTags(): Promise<ProfileTag[]> {
    const { data, error } = await supabase!.from('profile_tag_catalog').select('*').eq('active', true).order('category').order('sort_order');
    if (error) throw error;
    return data.map((row) => ({ id: row.tag_id, label: row.label, category: row.category as ProfileTagCategory, sortOrder: row.sort_order }));
  }

  async uploadProfilePhoto(uri: string, mimeType = 'image/jpeg') {
    const id = await requireUserId();
    const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const path = `${id}/${Crypto.randomUUID()}.${extension}`;
    const payload = await (await fetch(uri)).arrayBuffer();
    const uploaded = await supabase!.storage.from('profile-photos').upload(path, payload, { contentType: mimeType, upsert: false });
    if (uploaded.error) throw uploaded.error;
    const { count, error: countError } = await supabase!.from('profile_photos').select('id', { count: 'exact', head: true }).eq('profile_id', id);
    if (countError) throw countError;
    const inserted = await supabase!.from('profile_photos').insert({ profile_id: id, storage_path: path, position: Math.min((count ?? 0) + 1, 6), approval_status: 'pending' });
    if (inserted.error) throw inserted.error;
  }

  async uploadProfileVideo(uri: string, mimeType = 'video/mp4', durationMs = 0, tags: string[] = []) {
    const id = await requireUserId();
    if (durationMs < 1 || durationMs > 10_000) throw new Error('profile_video_limit');
    const payload = await (await fetch(uri)).arrayBuffer();
    if (payload.byteLength > 50 * 1024 * 1024) throw new Error('profile_video_size_limit');
    const videoId = Crypto.randomUUID();
    const extension = mimeType === 'video/quicktime' ? 'mov' : mimeType === 'video/webm' ? 'webm' : 'mp4';
    const path = `${id}/${videoId}.${extension}`;
    const uploaded = await supabase!.storage.from('profile-videos').upload(path, payload, { contentType: mimeType, upsert: false });
    if (uploaded.error) throw uploaded.error;
    const { count, error: countError } = await supabase!.from('profile_videos').select('id', { count: 'exact', head: true }).eq('profile_id', id);
    if (countError) throw countError;
    const inserted = await supabase!.from('profile_videos').insert({ id: videoId, profile_id: id, storage_path: path, position: Math.min((count ?? 0) + 1, 3), tags, byte_size: payload.byteLength, duration_ms: durationMs });
    if (inserted.error) { await supabase!.storage.from('profile-videos').remove([path]); throw inserted.error; }
  }
  async updateProfileMediaTags(mediaType: 'photo' | 'video', mediaId: string, tags: string[]) {
    const table = mediaType === 'photo' ? 'profile_photos' : 'profile_videos';
    const { error } = await supabase!.from(table).update({ tags }).eq('id', mediaId);
    if (error) throw error;
  }

  async listFeedback(targetType: ContentTargetType, targetId: string) {
    const [ratingsResult, commentsResult, reactionsResult] = await Promise.all([
      supabase!.rpc('list_content_rating_counts', { target_type: targetType, target_id: targetId }),
      supabase!.from('content_comments').select('*, profiles:author_id(display_name)').eq('target_type', targetType).eq('target_id', targetId).eq('status', 'visible').order('created_at', { ascending: false }),
      supabase!.rpc('list_content_reactions', { target_type: targetType, target_id: targetId }),
    ]);
    if (ratingsResult.error) throw ratingsResult.error;
    if (commentsResult.error) throw commentsResult.error;
    if (reactionsResult.error) throw reactionsResult.error;
    const reactionRows = (reactionsResult.data ?? []) as unknown as Array<{ emoji: ContentReaction['emoji']; count: number; reacted?: boolean; reacted_by_viewer?: boolean }>;
    return {
      ratings: (() => {
        const counts = (ratingsResult as unknown as { data?: { likes?: number; dislikes?: number } }).data ?? {};
        return [
          ...Array.from({ length: Number(counts.likes ?? 0) }, (_, index) => ({ id: `like-${index}`, targetType, targetId, userId: 'anonymous', value: 1 as const, isAnonymous: true })),
          ...Array.from({ length: Number(counts.dislikes ?? 0) }, (_, index) => ({ id: `dislike-${index}`, targetType, targetId, userId: 'anonymous', value: -1 as const, isAnonymous: true })),
        ];
      })(),
      comments: commentsResult.data.map((row) => {
        const item = row as unknown as { profiles?: { display_name?: string }; is_anonymous?: boolean };
        const anonymous = item.is_anonymous === true;
        return { id: row.id, targetType: row.target_type as ContentTargetType, targetId: row.target_id, authorId: anonymous ? 'anonymous' : row.author_id, authorName: anonymous ? 'Anonymous' : String(item.profiles?.display_name ?? 'Member'), body: row.body, createdAt: row.created_at, isAnonymous: anonymous };
      }),
      reactions: reactionRows.map((row) => ({ emoji: row.emoji, count: Number(row.count), reacted: row.reacted === true || row.reacted_by_viewer === true })),
    };
  }

  async rateContent(targetType: ContentTargetType, targetId: string, value: -1 | 1) {
    const { error } = await supabase!.rpc('rate_content', { target_type: targetType, target_id: targetId, value });
    if (error) throw error;
  }

  async commentOnContent(targetType: ContentTargetType, targetId: string, body: string) {
    const authorId = await requireUserId();
    const { data, error } = await supabase!.from('content_comments').insert({ target_type: targetType, target_id: targetId, author_id: authorId, body: body.trim() }).select().single();
    if (error) throw error;
    return { id: data.id, targetType, targetId, authorId, authorName: 'You', body: data.body, createdAt: data.created_at } satisfies ContentComment;
  }

  async toggleContentReaction(targetType: ContentTargetType, targetId: string, emoji: ProfileReactionEmoji) {
    const { error } = await supabase!.rpc('toggle_content_reaction', { target_type: targetType, target_id: targetId, emoji });
    if (error) throw error;
  }

  async listFriends(): Promise<FriendSummary[]> {
    const { data, error } = await supabase!.rpc('list_friends');
    if (error) throw error;
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
      friendshipId: String(row.friendshipId ?? row.friendship_id ?? row.profileId ?? row.profile_id), profileId: String(row.profileId ?? row.profile_id), displayName: String(row.displayName ?? row.display_name),
      avatarUrl: typeof (row.avatarUrl ?? row.avatar_url) === 'string' ? String(row.avatarUrl ?? row.avatar_url) : undefined, status: row.status as FriendSummary['status'],
      direction: row.status === 'accepted' ? 'friend' : row.direction as FriendSummary['direction'], createdAt: String(row.createdAt ?? row.created_at),
    }));
  }

  async setFriendship(profileId: string, action: 'request' | 'accept' | 'decline' | 'remove') {
    const { error } = await supabase!.rpc('set_friendship', { profile_id: profileId, action });
    if (error) throw error;
  }

  async listStarredItems(ownerId?: string): Promise<StarredItem[]> {
    const { data, error } = await supabase!.rpc('list_starred_items', { owner_id: ownerId });
    if (error) throw error;
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id), targetType: (row.targetType ?? row.target_type) as StarredTargetType, targetId: String(row.targetId ?? row.target_id),
      label: String(row.label), profileAudience: (row.profileAudience ?? row.profile_audience) as ProfileAudience, createdAt: String(row.createdAt ?? row.created_at),
    }));
  }

  async toggleStarredItem(targetType: StarredTargetType, targetId: string, label: string, audience?: ProfileAudience) {
    const { data, error } = await supabase!.rpc('toggle_starred_item', { target_type: targetType, target_id: targetId, label, profile_audience: audience });
    if (error) throw error;
    return Boolean((data as unknown as { starred?: boolean } | null)?.starred ?? data);
  }

  async listGroups(): Promise<GroupSummary[]> {
    const { data, error } = await supabase!.rpc('list_groups');
    if (error) throw error;
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id), name: String(row.name), bio: String(row.bio ?? ''), avatarUrl: typeof (row.avatarUrl ?? row.avatar_url) === 'string' ? String(row.avatarUrl ?? row.avatar_url) : undefined,
      role: row.role as GroupSummary['role'], memberCount: Number(row.memberCount ?? row.member_count), isVoiceActive: (row.isVoiceActive ?? row.is_voice_active) === true, updatedAt: String(row.updatedAt ?? row.updated_at),
    }));
  }
  async createGroup(name: string, bio = '') {
    const { data, error } = await supabase!.rpc('create_group', { name, bio, avatar_path: undefined });
    if (error) throw error;
    return String((data as unknown as { id?: string } | null)?.id ?? data);
  }
  async listGroupMessages(groupId: string): Promise<GroupMessage[]> {
    const { data, error } = await supabase!.rpc('list_group_messages', { group_id: groupId, page_size: 50, before: undefined });
    if (error) throw error;
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), groupId: String(row.groupId ?? row.group_id), senderId: String(row.senderId ?? row.sender_id), senderName: String(row.senderName ?? row.sender_name), body: String(row.body), createdAt: String(row.createdAt ?? row.created_at) }));
  }
  async sendGroupMessage(groupId: string, body: string): Promise<GroupMessage> {
    const { data, error } = await supabase!.rpc('send_group_message', { group_id: groupId, body });
    if (error) throw error;
    const messages = await this.listGroupMessages(groupId);
    return messages.find((item) => item.id === String((data as unknown as { id?: string } | null)?.id ?? data)) ?? messages[0]!;
  }
  async startGroupVoice(groupId: string): Promise<GroupVoiceSession> {
    const { data, error } = await supabase!.rpc('start_group_voice', { group_id: groupId });
    if (error) throw error;
    return { id: String(data), groupId, startedBy: await requireUserId(), startedAt: new Date().toISOString(), participantCount: 1 };
  }

  async completeOnboarding(payload: OnboardingPayload) {
    const { error } = await supabase!.rpc('complete_onboarding', {
      date_of_birth: payload.dateOfBirth, display_name: payload.displayName, pronouns: payload.pronouns,
      identity_tags: payload.identity, looking_for: payload.lookingFor, bio: payload.bio, region: toDatabaseRegion(payload.region),
      videos: payload.videos ?? [], socials: payload.socials ?? [], interests: payload.interests ?? [],
      terms_version: '2026-08-31', guidelines_version: '2026-08-31',
      privacy_version: '2026-08-31',
      sensitive_data_consent: payload.sensitiveDataConsent, locale: payload.locale
    });
    if (error) throw error;
  }

  async updateLocation(fix: { latitude: number; longitude: number; accuracy: number; capturedAt: string }): Promise<LocationVerification> {
    const { data, error } = await supabase!.rpc('update_location', {
      latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy, captured_at: fix.capturedAt
    });
    if (error) throw error;
    const result = data as { verified?: boolean; reason?: LocationVerification['reason']; verified_at?: string } | null;
    return { verified: result?.verified === true, reason: result?.reason, verifiedAt: result?.verified_at };
  }

  async touchPresence() { const { error } = await supabase!.rpc('touch_presence'); if (error) throw error; }

  async listConversations(cursor?: string | null, query = ''): Promise<Page<ConversationSummary>> {
    const { data, error } = await supabase!.rpc('list_conversations_page', {
      cursor: decodeMessageCursor(cursor), search_query: query.trim(), page_size: 30,
    });
    if (error) throw error;
    const page = data as unknown as { items: Array<ConversationSummary & { photoPath?: string }>; nextCursor: Json | null };
    const urls = await signedUrls('profile-photos', page.items.flatMap(item => item.photoPath ? [item.photoPath] : []), 60);
    return { items: page.items.map(({ photoPath, ...item }) => ({ ...item, member: { ...item.member,
      photos: photoPath ? [{ id: photoPath, url: urls.get(photoPath) ?? '', status: 'approved', tags: [] }] : [],
    } })), nextCursor: page.nextCursor ? JSON.stringify(page.nextCursor) : null };
  }

  async startConversation(profileId: string) {
    const { data, error } = await supabase!.rpc('start_conversation', { other_profile_id: profileId });
    if (error) throw error;
    return data;
  }

  async listMessages(conversationId: string, cursor?: string | null): Promise<Page<ChatMessage>> {
    const { data, error } = await supabase!.rpc('list_messages_page', {
      conversation_id: conversationId, cursor: decodeMessageCursor(cursor), page_size: 50,
    });
    if (error) throw error;
    const page = data as unknown as { items: MessageRow[]; nextCursor: Json | null };
    return { items: await Promise.all(page.items.map(mapMessage)), nextCursor: page.nextCursor ? JSON.stringify(page.nextCursor) : null };
  }

  async sendText(conversationId: string, text: string, clientMessageId = Crypto.randomUUID()) {
    if (!validMessageBody(text)) throw new Error('invalid_message_body');
    const senderId = await requireUserId();
    const { data, error } = await supabase!.from('messages').insert({ id: clientMessageId, conversation_id: conversationId, sender_id: senderId, body: text.trim() }).select().single();
    if (error?.code === '23505') {
      const existing = await supabase!.from('messages').select('*').eq('id', clientMessageId)
        .eq('conversation_id', conversationId).eq('sender_id', senderId).single();
      if (!existing.error && existing.data?.body === text.trim()) return mapMessage(existing.data);
    }
    if (error) throw error;
    return mapMessage(data);
  }

  async markConversationRead(conversationId: string, through: string) {
    const userId = await requireUserId();
    const { error } = await supabase!.from('conversation_members').update({ last_read_at: through })
      .eq('conversation_id', conversationId).eq('user_id', userId).lt('last_read_at', through);
    if (error) throw error;
  }

  async sendImage(conversationId: string, uri: string, mimeType = 'image/jpeg') {
    const senderId = await requireUserId();
    const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const path = `${senderId}/${conversationId}/${Crypto.randomUUID()}.${extension}`;
    const payload = await (await fetch(uri)).arrayBuffer();
    const uploaded = await supabase!.storage.from('message-images').upload(path, payload, { contentType: mimeType, upsert: false });
    if (uploaded.error) throw uploaded.error;
    const { data, error } = await supabase!.from('messages').insert({ conversation_id: conversationId, sender_id: senderId, image_path: path }).select().single();
    if (error) throw error;
    return mapMessage(data);
  }

  async listMyAlbums(): Promise<Album[]> {
    const ownerId = await requireUserId();
    const [albumsResult, itemsResult] = await Promise.all([
      supabase!.from('albums').select('*').eq('owner_id', ownerId).is('deleted_at', null).order('updated_at', { ascending: false }),
      supabase!.from('album_items').select('*').eq('owner_id', ownerId).is('deleted_at', null).order('position'),
    ]);
    if (albumsResult.error) throw albumsResult.error;
    if (itemsResult.error) throw itemsResult.error;
    const urls = await signedUrls('album-media', itemsResult.data.map((item) => item.storage_path), 60);
    return albumsResult.data.map((album) => ({
      id: album.id, ownerId: album.owner_id, name: album.name, contentVersion: album.content_version,
      createdAt: album.created_at, updatedAt: album.updated_at,
      items: itemsResult.data.filter((item) => item.album_id === album.id).map((item) => ({
        id: item.id, albumId: item.album_id, mediaType: item.media_type as AlbumItem['mediaType'], position: item.position,
        storagePath: item.storage_path, url: urls.get(item.storage_path), byteSize: item.byte_size, durationMs: item.duration_ms ?? undefined,
      })),
    }));
  }

  async createAlbum(name: string): Promise<Album> {
    const ownerId = await requireUserId();
    const { data, error } = await supabase!.from('albums').insert({ owner_id: ownerId, name: name.trim() }).select().single();
    if (error) throw error;
    return { id: data.id, ownerId, name: data.name, contentVersion: data.content_version, items: [], createdAt: data.created_at, updatedAt: data.updated_at };
  }

  async renameAlbum(albumId: string, name: string) {
    const { error } = await supabase!.from('albums').update({ name: name.trim() }).eq('id', albumId);
    if (error) throw error;
  }

  async deleteAlbum(albumId: string) {
    const album = (await this.listMyAlbums()).find((item) => item.id === albumId);
    if (!album) throw new Error('album_not_found');
    for (const item of album.items) await this.deleteAlbumItem(item.id);
    const { error } = await supabase!.rpc('delete_album', { album_id: albumId });
    if (error) throw error;
  }

  async addAlbumItem(albumId: string, input: { uri: string; mimeType: string; mediaType: 'image' | 'video'; byteSize: number; durationMs?: number }): Promise<AlbumItem> {
    const ownerId = await requireUserId();
    if (input.byteSize > 30 * 1024 * 1024 || (input.mediaType === 'video' && (input.durationMs ?? 0) > 15_000)) throw new Error('invalid_album_media');
    let uploadUri = input.uri;
    let mimeType = input.mimeType;
    if (input.mediaType === 'image') {
      const processed = await manipulateAsync(input.uri, [], { compress: 0.88, format: SaveFormat.JPEG });
      uploadUri = processed.uri;
      mimeType = 'image/jpeg';
    }
    const extension = input.mediaType === 'video' ? (mimeType === 'video/quicktime' ? 'mov' : 'mp4') : 'jpg';
    const itemId = Crypto.randomUUID();
    const path = `${ownerId}/${albumId}/${itemId}.${extension}`;
    const payload = await (await fetch(uploadUri)).arrayBuffer();
    if (payload.byteLength > 30 * 1024 * 1024) throw new Error('invalid_album_media');
    const uploaded = await supabase!.storage.from('album-media').upload(path, payload, { contentType: mimeType, upsert: false, cacheControl: '0' });
    if (uploaded.error) throw uploaded.error;
    const positions = await supabase!.from('album_items').select('position').eq('album_id', albumId).is('deleted_at', null);
    if (positions.error) throw positions.error;
    const usedPositions = new Set(positions.data.map((item) => item.position));
    const position = Array.from({ length: 11 }, (_, index) => index + 1).find((candidate) => !usedPositions.has(candidate));
    if (!position) throw new Error('album_item_limit_reached');
    const { data, error } = await supabase!.from('album_items').insert({
      id: itemId, album_id: albumId, owner_id: ownerId, storage_path: path, media_type: input.mediaType,
      position, byte_size: payload.byteLength, duration_ms: input.durationMs ?? null,
    }).select().single();
    if (error) {
      await supabase!.storage.from('album-media').remove([path]);
      throw error;
    }
    const url = (await signedUrls('album-media', [path], 60)).get(path);
    return { id: data.id, albumId, mediaType: input.mediaType, position: data.position, storagePath: path, url, byteSize: data.byte_size, durationMs: data.duration_ms ?? undefined };
  }

  async deleteAlbumItem(itemId: string) {
    const { data: item, error: itemError } = await supabase!.from('album_items').select('*').eq('id', itemId).single();
    if (itemError) throw itemError;
    const removed = await supabase!.storage.from('album-media').remove([item.storage_path]);
    const policyDenied = removed.error && /row.level|policy|403|unauthorized/i.test(String(removed.error.message));
    if (removed.error && !policyDenied) throw removed.error;
    const { error } = await supabase!.rpc('delete_album_item', { item_id: itemId });
    if (error) throw error;
  }

  async listAlbumShares(): Promise<AlbumShare[]> {
    const me = await requireUserId();
    const { data: shares, error } = await supabase!.from('album_shares').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    const albumIds = [...new Set(shares.map((share) => share.album_id))];
    const albumsResult = albumIds.length ? await supabase!.from('albums').select('*').in('id', albumIds) : { data: [], error: null };
    if (albumsResult.error) throw albumsResult.error;
    const ownedItems = await supabase!.from('album_items').select('id,album_id').eq('owner_id', me).is('deleted_at', null);
    if (ownedItems.error) throw ownedItems.error;
    const now = Date.now();
    return shares.map((share) => {
      const expired = share.status === 'accepted' && share.expires_at && Date.parse(share.expires_at) <= now;
      const album = albumsResult.data.find((candidate) => candidate.id === share.album_id);
      return {
        id: share.id, albumId: share.album_id, albumName: album?.name ?? 'Private album',
        ownerId: share.owner_id, recipientId: share.recipient_id, conversationId: share.conversation_id,
        accessMode: share.access_mode as AlbumAccessMode, status: (expired ? 'expired' : share.status) as AlbumShareStatus,
        sharedVersion: album?.content_version ?? share.shared_version, lastViewedVersion: share.last_viewed_version, sharedAt: share.shared_at,
        acceptedAt: share.accepted_at ?? undefined, expiresAt: share.expires_at ?? undefined, isIncoming: share.recipient_id === me,
        itemCount: share.owner_id === me ? ownedItems.data.filter((item) => item.album_id === share.album_id).length : 0,
      };
    });
  }

  async shareAlbums(profileIds: string | string[], albumIds: string[], accessMode: AlbumAccessMode) {
    const recipients = Array.isArray(profileIds) ? profileIds : [profileIds];
    const { data, error } = await supabase!.rpc('share_albums_with_profiles', { recipient_ids: recipients, album_ids: albumIds, access_mode: accessMode });
    if (error) throw error;
    const value = data as Record<string, Json>;
    const rawConversations = value.conversation_ids && typeof value.conversation_ids === 'object' && !Array.isArray(value.conversation_ids) ? value.conversation_ids as Record<string, Json> : {};
    const conversationIds = Object.fromEntries(Object.entries(rawConversations).map(([profileId, conversationId]) => [profileId, String(conversationId)]));
    return { conversationId: conversationIds[recipients[0]!], conversationIds, shareIds: Array.isArray(value.share_ids) ? value.share_ids.map(String) : [] };
  }

  async respondToAlbumShare(shareId: string, accept: boolean) {
    const { error } = await supabase!.rpc('respond_to_album_share', { share_id: shareId, accept }); if (error) throw error;
  }
  async revokeAlbumShare(shareId: string) { const { error } = await supabase!.rpc('revoke_album_share', { share_id: shareId }); if (error) throw error; }
  async openAlbumShare(shareId: string): Promise<AlbumViewer> {
    const { data, error } = await supabase!.rpc('open_album_share', { share_id: shareId });
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) throw error ?? new Error('album_share_locked');
    const value = data as Record<string, Json | undefined>;
    const rawItems = Array.isArray(value.items) ? value.items.filter((item): item is Record<string, Json | undefined> => typeof item === 'object' && item !== null && !Array.isArray(item)) : [];
    const paths = rawItems.map((item) => String(item.storage_path));
    const urls = await signedUrls('album-media', paths, 60);
    return {
      shareId, albumId: String(value.album_id), name: String(value.name), contentVersion: Number(value.content_version),
      sessionId: value.session_id ? String(value.session_id) : undefined,
      sessionExpiresAt: value.session_expires_at ? String(value.session_expires_at) : undefined,
      items: rawItems.map((item) => ({
        id: String(item.id), albumId: String(value.album_id), mediaType: String(item.media_type) as AlbumItem['mediaType'],
        position: Number(item.position), storagePath: String(item.storage_path), url: urls.get(String(item.storage_path)),
        durationMs: item.duration_ms == null ? undefined : Number(item.duration_ms),
      })),
    };
  }
  async closeAlbumViewer(sessionId: string) { const { error } = await supabase!.rpc('close_album_view_session', { session_id: sessionId }); if (error) throw error; }
  async toggleAlbumReaction(shareId: string, itemId: string) { const { data, error } = await supabase!.rpc('toggle_album_reaction', { share_id: shareId, item_id: itemId }); if (error) throw error; return data; }
  async sendAlbumReply(shareId: string, itemId: string, body: string) { const { error } = await supabase!.rpc('send_album_reply', { share_id: shareId, item_id: itemId, body }); if (error) throw error; }

  subscribeMessages(conversationId: string, callback: (message: ChatMessage) => void, onReconnect?: () => void) {
    let subscribed = false;
    let active = true;
    const channel = supabase!.channel(`conversation:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        void mapMessage(payload.new as MessageRow).then(message => { if (active) callback(message); }).catch(() => { if (active) onReconnect?.(); });
      }).subscribe(status => {
        if (status === 'SUBSCRIBED') {
          if (subscribed && active) onReconnect?.();
          subscribed = true;
        }
      });
    return () => { active = false; void supabase!.removeChannel(channel); };
  }

  async deleteConversation(conversationId: string) {
    const id = await requireUserId();
    const { error } = await supabase!.from('conversation_members').update({ deleted_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('user_id', id);
    if (error) throw error;
  }
  async block(profileId: string) { const id = await requireUserId(); const { error } = await supabase!.from('blocks').insert({ blocker_id: id, blocked_id: profileId }); if (error) throw error; }
  async unblock(profileId: string) { const id = await requireUserId(); const { error } = await supabase!.from('blocks').delete().eq('blocker_id', id).eq('blocked_id', profileId); if (error) throw error; }
  async listBlocked() {
    const { data: profiles, error: rpcError } = await supabase!.rpc('list_blocked_profiles');
    if (rpcError) throw rpcError;
    const rows = Array.isArray(profiles) ? profiles : [];
    return rows.map((row) => {
      const value = row as Record<string, Json | undefined>;
      return {
        id: String(value.id), displayName: String(value.display_name ?? 'Member'), age: Number(value.age ?? 18),
        identity: [], lookingFor: [], tags: [], customTags: [], videos: [], profileVideos: [], socials: [], interests: [], bio: '',
        region: 'capital', isOnline: false, distanceBand: '25plus', photos: [],
      } satisfies PublicProfile;
    });
  }
  async report(input: { profileId: string; category: ReportCategory; notes?: string; conversationId?: string; albumShareId?: string; albumItemId?: string }) {
    const id = await requireUserId();
    const category = input.category === 'minor' ? 'minor_suspected' : input.category === 'intimate' ? 'ncii' : input.category;
    const { error } = await supabase!.from('reports').insert({ reporter_id: id, reported_id: input.profileId, category, details: input.notes ?? null, conversation_id: input.conversationId ?? null, album_share_id: input.albumShareId ?? null, album_item_id: input.albumItemId ?? null });
    if (error) throw error;
  }
  async discoverMeetups(filters: MeetupFilters) { return this.meetupService.discover(filters); }
  async getMeetup(id: string) { return this.meetupService.get(id); }
  async listMyMeetups() { return this.meetupService.listMine(); }
  async listMeetupRequests(id: string) { return this.meetupService.listRequests(id); }
  async listMeetupParticipants(id: string) { return this.meetupService.listParticipants(id); }
  async createMeetupDraft(input: MeetupDraftInput) { return this.meetupService.createDraft(input); }
  async updateMeetup(id: string, input: MeetupUpdateInput) { return this.meetupService.update(id, input); }
  async publishMeetup(id: string) { return this.meetupService.publish(id); }
  async deleteMeetupDraft(id: string) { return this.meetupService.deleteDraft(id); }
  async joinMeetup(id: string) { return this.meetupService.join(id); }
  async requestMeetupAccess(id: string) { return this.meetupService.requestAccess(id); }
  async cancelMeetupRequest(id: string) { return this.meetupService.cancelRequest(id); }
  async leaveMeetup(id: string) { return this.meetupService.leave(id); }
  async respondToMeetupRequest(id: string, profileId: string, approve: boolean) {
    return this.meetupService.respond(id, profileId, approve);
  }
  async removeMeetupParticipant(id: string, profileId: string) {
    return this.meetupService.removeParticipant(id, profileId);
  }
  async reinstateMeetupParticipant(id: string, profileId: string, status: MeetupReinstateStatus) {
    return this.meetupService.reinstateParticipant(id, profileId, status);
  }
  async cancelMeetup(id: string) { return this.meetupService.cancel(id); }
  async reportMeetup(id: string, input: MeetupReportInput) { return this.meetupService.report(id, input); }
  async listPublicMeetupRoster(id: string) { return this.meetupService.listPublicRoster(id); }
  async listProfileMeetupHistory(profileId: string) { return this.meetupService.listProfileHistory(profileId); }
  async listProfileUpcomingMeetups(profileId: string) { return this.meetupService.listProfileUpcoming(profileId); }
  async setMeetupRsvpVisibility(id: string, visibility: import('@/types/domain').MeetupRsvpVisibility) { return this.meetupService.setRsvpVisibility(id, visibility); }
  async confirmMeetupAttendance(id: string) { return this.meetupService.confirmAttendance(id); }
  async completeMeetupAttendance(id: string, outcome: 'attended' | 'did_not_attend' | 'dismiss', historyVisibility: 'visible' | 'private' = 'private') { return this.meetupService.completeAttendance(id, outcome, historyVisibility); }
  async setMeetupHistoryVisibility(id: string, visibility: 'visible' | 'private') { return this.meetupService.setHistoryVisibility(id, visibility); }
  async getMeetupRoom(id: string) { return this.meetupService.getRoom(id); }
  async listMeetupRoomMessages(roomId: string, cursor?: string | null) { return this.meetupService.listRoomMessages(roomId, cursor); }
  async sendMeetupRoomMessage(roomId: string, body: string, clientMessageId?: string) { return this.meetupService.sendRoomMessage(roomId, body, clientMessageId); }
  subscribeMeetupRoom(roomId: string, onInvalidate: () => void) { return this.meetupService.subscribeRoom(roomId, onInvalidate); }
  async setAdultContentPreference(enabled: boolean) { return this.meetupService.setAdultPreference(enabled); }
  async listMeetupNotifications(limit?: number) { return this.meetupService.listNotifications(limit); }
  async markMeetupNotificationRead(notificationId: string) {
    return this.meetupService.markNotificationRead(notificationId);
  }
  async registerPushToken(expoPushToken: string, platform: PushPlatform, locale: 'is' | 'en' = 'is') {
    return this.meetupService.registerPushToken(expoPushToken, platform, locale);
  }
  async unregisterPushToken(expoPushToken: string) {
    return this.meetupService.unregisterPushToken(expoPushToken);
  }
  async searchMeetupPlaces(query: string, options?: MeetupPlaceSearchOptions) {
    return this.meetupService.searchPlaces(query, options);
  }
  async reverseGeocodeMeetupPlace(coordinate: GeoCoordinate, options?: MeetupPlaceSearchOptions) {
    return this.meetupService.reverseGeocode(coordinate, options);
  }
  async requestExport() { const { data, error } = await supabase!.rpc('export_my_account'); if (error) throw error; return JSON.stringify(data, null, 2); }
  async withdrawSensitiveConsent() { const { error } = await supabase!.rpc('withdraw_sensitive_consent'); if (error) throw error; }
  async deleteAccount() { const { error } = await supabase!.rpc('delete_my_account'); if (error) throw error; }
}
