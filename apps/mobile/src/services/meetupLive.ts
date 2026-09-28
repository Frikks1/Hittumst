import { signCommunityCovers } from './communityMedia';
import { queueMediaUpload } from './mediaUpload';
import { meetupMediaSchema, meetupReviewSchema, meetupReviewInputSchema, type MeetupMedia, type MeetupReview } from '@rummal/shared';
import * as Crypto from 'expo-crypto';
import { decodeMessageCursor } from '@/utils/messagePagination';
import {
  isLaunchMeetup,
  calculateMeetupEffectiveEnd,
  expoPushTokenSchema,
  generateMeetupOccurrences,
  icelandCoordinateSchema,
  meetupDetailSchema,
  meetupDraftInputSchema,
  meetupFiltersSchema,
  meetupNotificationSchema,
  meetupParticipationSchema,
  meetupPlaceQuerySchema,
  meetupPlaceResultSchema,
  meetupPlaceSearchOptionsSchema,
  meetupProfileHistoryPageSchema,
  meetupProfileUpcomingPageSchema,
  meetupPublicRosterPageSchema,
  meetupRecurrenceRuleSchema,
  meetupReportInputSchema,
  meetupRoomMessagePageSchema,
  meetupRoomMessageSchema,
  meetupRoomSummarySchema,
  meetupRequestSchema,
  meetupRosterEntrySchema,
  meetupSummarySchema,
  meetupUpdateInputSchema,
  normalizeMeetupNotificationKind,
  normalizeMeetupRegion,
  normalizeMeetupStatus,
  pushTokenRegistrationSchema,
  type GeoCoordinate,
  type MeetupDetail,
  type MeetupDraftInput,
  type MeetupFilters,
  type MeetupNotification,
  type MeetupParticipation,
  type MeetupPlaceResult,
  type MeetupPlaceSearchOptions,
  type MeetupProfileHistoryPage,
  type MeetupProfileUpcomingPage,
  type MeetupPublicRosterPage,
  type MeetupReinstateStatus,
  type MeetupReportInput,
  type MeetupRequest,
  type MeetupRoomMessage,
  type MeetupRoomMessagePage,
  type MeetupRoomSummary,
  type MeetupRsvpVisibility,
  type MeetupRosterEntry,
  type MeetupSummary,
  type MeetupUpdateInput,
  type PushPlatform,
} from '@rummal/shared';
import type { Json } from '@/types/database';
import { supabase } from './supabase';

type JsonRecord = Record<string, Json | undefined>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (record && Array.isArray(record.items)) return record.items;
  if (record && Array.isArray(record.results)) return record.results;
  return record && Array.isArray(record.places) ? record.places : [];
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function signedProfileUrls(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase!.storage.from('profile-photos').createSignedUrls(unique, 5 * 60);
  if (error) throw error;
  return new Map(
    data.flatMap((item) =>
      item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
    ),
  );
}

function normalizeHost(value: unknown, urls: Map<string, string>) {
  const host = asRecord(value);
  if (!host) return value;
  const avatarPath = optionalString(host.avatarPath);
  const avatarUrl = optionalString(host.avatarUrl) ?? (avatarPath ? urls.get(avatarPath) : undefined);
  return {
    id: host.id,
    displayName: host.displayName,
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function normalizeMeetupRecord(value: unknown, urls: Map<string, string>): unknown {
  const row = asRecord(value);
  if (!row) return value;
  const startsAt = optionalString(row.startsAt) ?? '';
  const endsAt = optionalString(row.endsAt);
  const effectiveEnd =
    optionalString(row.effectiveEnd) ||
    (startsAt ? calculateMeetupEffectiveEnd(startsAt, endsAt) : undefined);
  const status = typeof row.status === 'string' ? normalizeMeetupStatus(row.status) : null;
  const generalArea = asRecord(row.generalArea);
  const normalizedRegion =
    generalArea && typeof generalArea.region === 'string'
      ? normalizeMeetupRegion(generalArea.region)
      : null;
  return {
    eventProfile: row.eventProfile,
    cover: row.cover, follows: row.follows,
    diagnosisRestricted: row.diagnosisRestricted, requiresDiagnosisVerification: row.requiresDiagnosisVerification,
    id: row.id,
    title: row.title,
    category: row.category,
    intention: row.intention,
    venueMode: row.venueMode,
    seriesId: row.seriesId,
    occurrenceIndex: row.occurrenceIndex,
    startsAt: row.startsAt,
    ...(endsAt ? { endsAt } : {}),
    effectiveEnd,
    generalAreaId: row.generalAreaId,
    generalArea: generalArea
      ? {
          id: generalArea.id,
          labelIs: generalArea.labelIs,
          labelEn: generalArea.labelEn,
          region: normalizedRegion ?? generalArea.region,
        }
      : row.generalArea,
    host: normalizeHost(row.host, urls),
    accessMode: row.accessMode,
    locationVisibility: row.locationVisibility,
    releasePolicy: row.releasePolicy,
    participantCount: row.participantCount,
    reservedPlaces: row.reservedPlaces ?? 0,
    ...(row.pool !== undefined ? { pool: row.pool } : {}),
    capacity: row.capacity ?? null,
    isFull: row.isFull,
    isExplicit: row.isExplicit,
    rsvpVisibility: row.rsvpVisibility,
    onlineAccess: row.onlineAccess,
    status: status ?? row.status,
    location: row.location,
    viewerState: row.viewerState,
    capabilities: row.capabilities,
    ...(typeof row.description === 'string' ? { description: row.description } : {}),
    ...(row.recurrence !== undefined ? { recurrence: row.recurrence } : {}),
    ...(Array.isArray(row.tags) ? { tags: row.tags } : {}),
    ...(typeof row.createdAt === 'string' ? { createdAt: row.createdAt } : {}),
    ...(typeof row.updatedAt === 'string' ? { updatedAt: row.updatedAt } : {}),
    ...(typeof row.cancelledAt === 'string' ? { cancelledAt: row.cancelledAt } : {}),
  };
}

async function meetupAvatarUrls(values: unknown[]) {
  const paths = values.flatMap((value) => {
    const row = asRecord(value);
    const host = row ? asRecord(row.host) : null;
    const path = host ? optionalString(host.avatarPath) : undefined;
    return path ? [path] : [];
  });
  return signedProfileUrls(paths);
}

export async function parseMeetupSummaries(value: unknown): Promise<MeetupSummary[]> {
  const rows = asArray(value);
  const urls = await meetupAvatarUrls(rows);
  const parsed = rows.map((row) => meetupSummarySchema.parse(normalizeMeetupRecord(row, urls)));
  const covers = await signCommunityCovers(parsed.map(row => row.cover));
  return parsed.map((row, index) => ({ ...row, cover: covers[index] ?? null }));
}

async function parseMeetupDetails(value: unknown): Promise<MeetupDetail[]> {
  const rows = asArray(value);
  const urls = await meetupAvatarUrls(rows);
  const parsed = rows.map((row) => meetupDetailSchema.parse(normalizeMeetupRecord(row, urls)));
  const covers = await signCommunityCovers(parsed.map(row => row.cover));
  return parsed.map((row, index) => ({ ...row, cover: covers[index] ?? null }));
}

async function parseMeetupDetail(value: unknown): Promise<MeetupDetail> {
  const urls = await meetupAvatarUrls([value]);
  const parsed = meetupDetailSchema.parse(normalizeMeetupRecord(value, urls));
  const [cover] = await signCommunityCovers([parsed.cover]);
  return { ...parsed, cover: cover ?? null };
}

async function parseMeetupRequests(value: unknown): Promise<MeetupRequest[]> {
  const rows = asArray(value);
  const paths = rows.flatMap((candidate) => {
    const row = asRecord(candidate);
    const profile = row ? asRecord(row.profile) : null;
    const path = profile ? optionalString(profile.avatarPath) : undefined;
    return path ? [path] : [];
  });
  const urls = await signedProfileUrls(paths);
  return rows.map((candidate) => {
    const row = asRecord(candidate);
    const profile = row ? asRecord(row.profile) : null;
    const avatarPath = profile ? optionalString(profile.avatarPath) : undefined;
    const avatarUrl = profile
      ? optionalString(profile.avatarUrl) ?? (avatarPath ? urls.get(avatarPath) : undefined)
      : undefined;
    return meetupRequestSchema.parse({
      meetupId: row?.meetupId,
      profile: {
        id: profile?.id,
        displayName: profile?.displayName,
        ...(avatarUrl ? { avatarUrl } : {}),
      },
      status: row?.status,
      requestedAt: row?.requestedAt,
      ...(typeof row?.respondedAt === 'string' ? { respondedAt: row.respondedAt } : {}),
    });
  });
}

async function parseMeetupRequest(value: unknown): Promise<MeetupRequest> {
  const [request] = await parseMeetupRequests([value]);
  if (!request) throw new Error('Invalid meetup request response');
  return request;
}

async function parseMeetupRoster(value: unknown): Promise<MeetupRosterEntry[]> {
  const rows = asArray(value);
  const paths = rows.flatMap((candidate) => {
    const row = asRecord(candidate);
    const profile = row ? asRecord(row.profile) : null;
    const path = profile ? optionalString(profile.avatarPath) : undefined;
    return path ? [path] : [];
  });
  const urls = await signedProfileUrls(paths);
  return rows.map((candidate) => {
    const row = asRecord(candidate);
    const profile = row ? asRecord(row.profile) : null;
    const avatarPath = profile ? optionalString(profile.avatarPath) : undefined;
    const avatarUrl = profile
      ? optionalString(profile.avatarUrl) ?? (avatarPath ? urls.get(avatarPath) : undefined)
      : undefined;
    return meetupRosterEntrySchema.parse({
      meetupId: row?.meetupId,
      profile: {
        id: profile?.id,
        displayName: profile?.displayName,
        ...(avatarUrl ? { avatarUrl } : {}),
      },
      status: row?.status,
      ...(typeof row?.requestedAt === 'string' ? { requestedAt: row.requestedAt } : {}),
      ...(typeof row?.respondedAt === 'string' ? { respondedAt: row.respondedAt } : {}),
    });
  });
}

function normalizeNotification(value: unknown): unknown | null {
  const row = asRecord(value);
  if (!row || typeof row.kind !== 'string') return null;
  const kind = normalizeMeetupNotificationKind(row.kind);
  if (!kind) return null;
  const payload = asRecord(row.payload);
  const actor = asRecord(row.actor) ?? asRecord(payload?.actor);
  const meetupTitle = optionalString(row.meetupTitle) ?? optionalString(payload?.title);
  return {
    id: row.id,
    meetupId: row.meetupId,
    kind,
    meetupTitle,
    ...(actor
      ? {
          actor: {
            id: actor.id,
            displayName: actor.displayName,
            ...(typeof actor.avatarUrl === 'string' ? { avatarUrl: actor.avatarUrl } : {}),
          },
        }
      : {}),
    createdAt: row.createdAt,
    ...(typeof row.readAt === 'string' ? { readAt: row.readAt } : {}),
  };
}

async function queryPlaceSearchProxy(
  body: JsonRecord,
  options: MeetupPlaceSearchOptions | undefined,
): Promise<MeetupPlaceResult[]> {
  const parsedOptions = meetupPlaceSearchOptionsSchema.parse(options ?? {});
  const { data, error } = await supabase!.functions.invoke('place-search', {
    body: {
      ...body,
      locale: parsedOptions.locale,
      limit: parsedOptions.limit,
    },
  });
  if (error) throw error;
  const rows = asArray(data);
  return rows.map((row) => meetupPlaceResultSchema.parse(row));
}

export class LiveMeetupService {
  async discover(filters: MeetupFilters): Promise<MeetupSummary[]> {
    const parsed = meetupFiltersSchema.parse(filters);
    const { data, error } = await supabase!.rpc('discover_hittingar', {
      filters: toJson({
        timing: parsed.timing === 'all' ? null : parsed.timing,
        category: parsed.category,
        intention: parsed.intention,
        venueMode: parsed.venueMode,
        accessMode: parsed.accessMode,
        region: parsed.region,
        bounds: parsed.bounds,
        radiusKm: parsed.radiusKm, genders: parsed.genders, social: parsed.social, diagnosisIds: parsed.diagnosisIds,
        includeExplicit: false,
      }),
    });
    if (error) throw error;
    return (await parseMeetupSummaries(data)).filter(isLaunchMeetup);
  }

  async get(id: string) {
    const { data, error } = await supabase!.rpc('get_meetup', { meetup_id: id });
    if (error) throw error;
    return parseMeetupDetail(data);
  }


  private async profileAction(id: string, action: string, input: unknown = {}) {
    const { data, error } = await supabase!.rpc('meetup_profile_action', { meetup_id: id, action, input: toJson(input) });
    if (error) throw error;
    return data;
  }
  async getGender(id: string): Promise<string | null> { const data = await this.profileAction(id, 'gender'); return typeof data === 'string' ? data : null; }
  async setGender(id: string, gender: string | null) { await this.profileAction(id, 'set_gender', { gender }); }
  async listMedia(id: string): Promise<MeetupMedia[]> {
    const rows = asArray(await this.profileAction(id, 'media')).map(asRecord).filter((x): x is JsonRecord => x !== null);
    if (!rows.length) return [];
    const paths = rows.map(row => String(row.path));
    const { data, error } = await supabase!.storage.from('meetup-media').createSignedUrls(paths, 300);
    if (error) throw error;
    return rows.flatMap((row, i) => data[i]?.signedUrl ? [meetupMediaSchema.parse({ id: row.id, kind: row.kind, position: row.position, url: data[i].signedUrl })] : []);
  }
  async uploadMedia(id: string, uri: string, kind: 'photo' | 'video', mimeType: string) {
    return queueMediaUpload('meetup', id, uri, kind === 'photo' ? 'image' : 'video', mimeType);
  }
  async removeMedia(id: string, mediaId: string) {
    const path = await this.profileAction(id, 'remove_media', { id: mediaId });
    if (typeof path === 'string') {
      const { error } = await supabase!.storage.from('meetup-media').remove([path]);
      if (error) throw error;
    }
  }
  async listReviews(id: string): Promise<MeetupReview[]> {
    return asArray(await this.profileAction(id, 'reviews')).map(value => meetupReviewSchema.parse(value));
  }
  async saveReview(id: string, rating: number, body: string) { await this.profileAction(id, 'review', meetupReviewInputSchema.parse({ rating, body })); }
  async deleteReview(id: string) { await this.profileAction(id, 'delete_review'); }
  async listInvitations(id: string): Promise<string[]> { return asArray(await this.profileAction(id, 'invitations')).filter((x): x is string => typeof x === 'string'); }
  async setInvitation(id: string, profileId: string, invited: boolean) { await this.profileAction(id, invited ? 'invite' : 'uninvite', { profileId }); }

  async listMine() {
    const { data, error } = await supabase!.rpc('list_my_meetups');
    if (error) throw error;
    return parseMeetupDetails(data);
  }

  async listRequests(id: string) {
    const { data, error } = await supabase!.rpc('list_meetup_requests', { meetup_id: id });
    if (error) throw error;
    return parseMeetupRequests(data);
  }

  async listParticipants(id: string) {
    const { data, error } = await supabase!.rpc('list_meetup_participants', { meetup_id: id });
    if (error) throw error;
    return parseMeetupRoster(data);
  }

  async createDraft(input: MeetupDraftInput) {
    if (!isLaunchMeetup(input)) throw new Error('explicit_events_unavailable');
    const parsed = meetupDraftInputSchema.parse(input);
    const { data, error } = await supabase!.rpc('create_meetup_draft', { input: toJson(parsed) });
    if (error) throw error;
    if (typeof data !== 'string') throw new Error('Invalid create meetup response');
    return data;
  }

  async update(id: string, input: MeetupUpdateInput) {
    if (!isLaunchMeetup(input)) throw new Error('explicit_events_unavailable');
    const parsed = meetupUpdateInputSchema.parse(input);
    const { error } = await supabase!.rpc('update_meetup', {
      meetup_id: id,
      input: toJson(parsed),
    });
    if (error) throw error;
    return this.get(id);
  }

  async publish(id: string) {
    const recurrenceResult = await supabase!.rpc('get_meetup_draft_recurrence', { meetup_id: id });
    if (recurrenceResult.error) throw recurrenceResult.error;
    const recurrenceData = (recurrenceResult as unknown as { data: unknown }).data;
    if (recurrenceData) {
      const recurrence = meetupRecurrenceRuleSchema.parse(recurrenceData);
      const draft = await this.get(id);
      const occurrenceStarts = generateMeetupOccurrences(draft.startsAt, recurrence);
      const seriesResult = await supabase!.rpc('publish_meetup_series', {
        source_meetup_id: id,
        recurrence: toJson(recurrence),
        occurrence_starts: toJson(occurrenceStarts),
      });
      if (seriesResult.error) throw seriesResult.error;
      return this.get(id);
    }
    const { data, error } = await supabase!.rpc('publish_meetup', { meetup_id: id });
    if (error) throw error;
    return parseMeetupDetail(data);
  }

  async deleteDraft(id: string) {
    const { error } = await supabase!.rpc('delete_meetup_draft', { meetup_id: id });
    if (error) throw error;
  }

  async join(id: string): Promise<MeetupParticipation> {
    const { data, error } = await supabase!.rpc('join_meetup', { meetup_id: id });
    if (error) throw error;
    return meetupParticipationSchema.parse(data);
  }

  async requestAccess(id: string): Promise<MeetupParticipation> {
    const { data, error } = await supabase!.rpc('request_meetup_access', { meetup_id: id });
    if (error) throw error;
    return meetupParticipationSchema.parse(data);
  }

  async cancelRequest(id: string) {
    const { error } = await supabase!.rpc('cancel_meetup_request', { meetup_id: id });
    if (error) throw error;
  }

  async leave(id: string) {
    const { error } = await supabase!.rpc('leave_meetup', { meetup_id: id });
    if (error) throw error;
  }

  async respond(id: string, profileId: string, approve: boolean) {
    const { data, error } = await supabase!.rpc('respond_to_meetup_request', {
      meetup_id: id,
      profile_id: profileId,
      approve,
    });
    if (error) throw error;
    return parseMeetupRequest(data);
  }

  async removeParticipant(id: string, profileId: string) {
    const { error } = await supabase!.rpc('remove_meetup_participant', {
      meetup_id: id,
      profile_id: profileId,
    });
    if (error) throw error;
  }

  async reinstateParticipant(id: string, profileId: string, status: MeetupReinstateStatus) {
    const { data, error } = await supabase!.rpc('reinstate_meetup_participant', {
      meetup_id: id,
      profile_id: profileId,
      status,
    });
    if (error) throw error;
    return parseMeetupRequest(data);
  }

  async cancel(id: string) {
    const { error } = await supabase!.rpc('cancel_meetup', { meetup_id: id });
    if (error) throw error;
  }

  async report(id: string, input: MeetupReportInput) {
    const parsed = meetupReportInputSchema.parse(input);
    const { data, error } = await supabase!.rpc('report_meetup', {
      meetup_id: id,
      category: parsed.category,
      details: parsed.details,
    });
    if (error) throw error;
    if (typeof data !== 'string') throw new Error('Invalid report meetup response');
    return data;
  }

  async setRsvpVisibility(id: string, visibility: MeetupRsvpVisibility) {
    const { error } = await supabase!.rpc('set_meetup_rsvp_visibility', { meetup_id: id, visibility });
    if (error) throw error;
  }

  async listPublicRoster(id: string): Promise<MeetupPublicRosterPage> {
    const { data, error } = await supabase!.rpc('list_public_meetup_roster', {
      meetup_id: id, cursor: undefined, page_size: 50,
    });
    if (error) throw error;
    return meetupPublicRosterPageSchema.parse(data);
  }

  async listProfileHistory(profileId: string): Promise<MeetupProfileHistoryPage> {
    const { data, error } = await supabase!.rpc('list_profile_meetup_history', {
      profile_id: profileId, cursor: undefined, page_size: 50,
    });
    if (error) throw error;
    return meetupProfileHistoryPageSchema.parse(data);
  }

  async listProfileUpcoming(profileId: string): Promise<MeetupProfileUpcomingPage> {
    const { data, error } = await supabase!.rpc('list_profile_upcoming_meetups', {
      profile_id: profileId, cursor: undefined, page_size: 50,
    });
    if (error) throw error;
    return meetupProfileUpcomingPageSchema.parse(data);
  }

  async confirmAttendance(id: string) {
    const { error } = await supabase!.rpc('confirm_meetup_attendance', { meetup_id: id });
    if (error) throw error;
  }

  async completeAttendance(id: string, outcome: 'attended' | 'did_not_attend' | 'dismiss', historyVisibility: 'visible' | 'private' = 'private') {
    const { error } = await supabase!.rpc('complete_meetup_attendance', { meetup_id: id, outcome, history_visibility: historyVisibility });
    if (error) throw error;
  }

  async setHistoryVisibility(id: string, visibility: 'visible' | 'private') {
    const { error } = await supabase!.rpc('set_meetup_history_visibility', { meetup_id: id, visibility });
    if (error) throw error;
  }

  async getRoom(id: string): Promise<MeetupRoomSummary | null> {
    const { data, error } = await supabase!.rpc('get_meetup_room_summary', { meetup_id: id });
    if (error) throw error;
    return data ? meetupRoomSummarySchema.parse(data) : null;
  }

  async listRoomMessages(roomId: string, cursor?: string | null): Promise<MeetupRoomMessagePage> {
    const { data, error } = await supabase!.rpc('list_meetup_room_message_page', { room_id: roomId, cursor: decodeMessageCursor(cursor), page_size: 50 });
    if (error) throw error;
    return meetupRoomMessagePageSchema.parse(data);
  }

  async sendRoomMessage(roomId: string, body: string, clientMessageId = Crypto.randomUUID()): Promise<MeetupRoomMessage> {
    const { data, error } = await supabase!.rpc('send_meetup_room_message_once', { room_id: roomId, message_id: clientMessageId, body });
    if (error) throw error;
    return meetupRoomMessageSchema.parse(data);
  }

  subscribeRoom(roomId: string, onInvalidate: () => void): () => void {
    let active = true;
    const invalidate = () => { if (active) onInvalidate(); };
    const channel = supabase!
      .channel(`hittingur:${roomId}`, { config: { private: true } })
      .on('broadcast', { event: 'message_changed' }, invalidate)
      .on('broadcast', { event: 'membership_changed' }, invalidate)
      .subscribe(status => { if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'CLOSED') invalidate(); });
    return () => { active = false; void supabase!.removeChannel(channel); };
  }

  async setAdultPreference(enabled: boolean) {
    const { error } = await supabase!.rpc('set_adult_content_preference', { enabled });
    if (error) throw error;
  }

  async listNotifications(limit = 50): Promise<MeetupNotification[]> {
    const limitCount = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 50;
    const { data, error } = await supabase!.rpc('list_notifications', { limit_count: limitCount });
    if (error) throw error;
    return asArray(data).flatMap((value) => {
      const normalized = normalizeNotification(value);
      if (!normalized) return [];
      return [meetupNotificationSchema.parse(normalized)];
    });
  }

  async markNotificationRead(notificationId: string) {
    const { error } = await supabase!.rpc('mark_notification_read', {
      notification_id: notificationId,
    });
    if (error) throw error;
  }

  async registerPushToken(expoPushToken: string, platform: PushPlatform, locale: 'is' | 'en' = 'is') {
    const registration = pushTokenRegistrationSchema.parse({ expoPushToken, platform, locale });
    const { error } = await supabase!.rpc('register_push_token', {
      expo_push_token: registration.expoPushToken,
      platform: registration.platform,
      locale: registration.locale,
    });
    if (error) throw error;
  }

  async unregisterPushToken(expoPushToken: string) {
    const { error } = await supabase!.rpc('unregister_push_token', {
      expo_push_token: expoPushTokenSchema.parse(expoPushToken),
    });
    if (error) throw error;
  }

  async searchPlaces(query: string, options?: MeetupPlaceSearchOptions) {
    return queryPlaceSearchProxy(
      { query: meetupPlaceQuerySchema.parse(query) },
      options,
    );
  }

  async reverseGeocode(coordinate: GeoCoordinate, options?: MeetupPlaceSearchOptions) {
    const results = await queryPlaceSearchProxy(
      { coordinate: toJson(icelandCoordinateSchema.parse(coordinate)) },
      { ...options, limit: 1 },
    );
    return results[0] ?? null;
  }
}
