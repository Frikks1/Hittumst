import type { MeetupPoolSummary } from '@rummal/shared';
import { generateMeetupOccurrences, monthInIceland, TIERS, type TierId, type MeetupMedia, type MeetupReview } from '@rummal/shared';
import { defaultMeetupEventProfile, meetupEligibility, type MeetupEventProfile } from '@rummal/shared';
import * as Crypto from 'expo-crypto';
import {
  isLaunchMeetup,
  calculateMeetupEffectiveEnd,
  calculateMeetupLocationAccessExpiry,
  calculateMeetupReleaseAt,
  defaultMeetupFilters,
  icelandCoordinateSchema,
  meetupDetailSchema,
  meetupDraftInputSchema,
  meetupFiltersSchema,
  meetupNotificationSchema,
  meetupParticipationSchema,
  meetupPlaceQuerySchema,
  meetupPlaceResultSchema,
  meetupPlaceSearchOptionsSchema,
  meetupReportInputSchema,
  meetupRequestSchema,
  meetupRosterEntrySchema,
  meetupSummarySchema,
  meetupUpdateInputSchema,
  type GeoCoordinate,
  type MeetupAccessMode,
  type MeetupCategory,
  type MeetupDetail,
  type MeetupDraftInput,
  type MeetupFilters,
  type MeetupGeneralArea,
  type MeetupGeneralAreaId,
  type MeetupHost,
  type MeetupLocationVisibility,
  type MeetupIntention,
  type MeetupVenueMode,
  type MeetupRecurrenceRule,
  type MeetupNotification,
  type MeetupParticipantProfile,
  type MeetupParticipation,
  type MeetupParticipationStatus,
  type MeetupPlaceResult,
  type MeetupPlaceSearchOptions,
  type MeetupRegion,
  type MeetupReinstateStatus,
  type MeetupReleasePolicy,
  type MeetupReportInput,
  type MeetupRequest,
  type MeetupRequestStatus,
  type MeetupRosterEntry,
  type MeetupRosterStatus,
  type MeetupStatus,
  type MeetupSummary,
  type MeetupUpdateInput,
  type MeetupViewerCapabilities,
  type MeetupViewerState,
} from '@rummal/shared';

const DEMO_VIEWER_ID = 'demo-me';

type DemoParticipation = {
  status: Exclude<MeetupParticipationStatus, 'host' | 'none'>;
  quotaConsumed?: boolean;
  requestedAt?: string;
  respondedAt?: string;
};

type DemoRequest = {
  profile: MeetupParticipantProfile;
  status: MeetupRosterStatus;
  quotaConsumed?: boolean;
  requestedAt: string;
  respondedAt?: string;
};

type DemoMeetup = {
  eventProfile?: MeetupEventProfile;
  onlineUrl?: string;
  onlineAccessCode?: string;
  id: string;
  title: string;
  description: string;
  category: MeetupCategory;
  intention?: MeetupIntention;
  venueMode?: MeetupVenueMode;
  recurrence?: MeetupRecurrenceRule | null;
  seriesId?: string | null;
  occurrenceIndex?: number | null;
  tags: string[];
  startsAt: string;
  endsAt?: string;
  region: MeetupRegion;
  generalAreaId: MeetupGeneralAreaId;
  host: MeetupHost;
  accessMode: MeetupAccessMode;
  locationVisibility: MeetupLocationVisibility;
  releasePolicy: MeetupReleasePolicy;
  latitude: number;
  longitude: number;
  approximateLatitude: number;
  approximateLongitude: number;
  venueName?: string;
  address?: string;
  arrivalInstructions?: string;
  capacity: number | null;
  baseParticipantCount: number;
  isExplicit: boolean;
  prohibitedServicesAttested: boolean;
  publicLocationConfirmed: boolean;
  status: MeetupStatus;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  publishedAt?: string;
  participations: Map<string, DemoParticipation>;
  requests: Map<string, DemoRequest>;
};

const GENERAL_AREAS: Readonly<Record<MeetupGeneralAreaId, MeetupGeneralArea>> = {
  reykjavik: { id: 'reykjavik', labelIs: 'Reykjavík', labelEn: 'Reykjavík', region: 'capital' },
  vesturbaer: { id: 'vesturbaer', labelIs: 'Vesturbær', labelEn: 'Vesturbær', region: 'capital' },
  kopavogur: { id: 'kopavogur', labelIs: 'Kópavogur', labelEn: 'Kópavogur', region: 'capital' },
  hafnarfjordur: { id: 'hafnarfjordur', labelIs: 'Hafnarfjörður', labelEn: 'Hafnarfjörður', region: 'capital' },
  keflavik: { id: 'keflavik', labelIs: 'Keflavík', labelEn: 'Keflavík', region: 'west' },
  borgarnes: { id: 'borgarnes', labelIs: 'Borgarnes', labelEn: 'Borgarnes', region: 'west' },
  isafjordur: { id: 'isafjordur', labelIs: 'Ísafjörður', labelEn: 'Ísafjörður', region: 'westfjords' },
  saudarkrokur: { id: 'saudarkrokur', labelIs: 'Sauðárkrókur', labelEn: 'Sauðárkrókur', region: 'north' },
  akureyri: { id: 'akureyri', labelIs: 'Akureyri', labelEn: 'Akureyri', region: 'north' },
  egilsstadir: { id: 'egilsstadir', labelIs: 'Egilsstaðir', labelEn: 'Egilsstaðir', region: 'east' },
  selfoss: { id: 'selfoss', labelIs: 'Selfoss', labelEn: 'Selfoss', region: 'south' },
  vestmannaeyjar: { id: 'vestmannaeyjar', labelIs: 'Vestmannaeyjar', labelEn: 'Westman Islands', region: 'south' },
};

function addTime(now: Date, days: number, hours = 0): string {
  return new Date(now.getTime() + days * 86_400_000 + hours * 3_600_000).toISOString();
}

function includesCoordinate(bounds: MeetupFilters['bounds'], latitude: number, longitude: number) {
  return (
    !bounds ||
    (latitude <= bounds.north &&
      latitude >= bounds.south &&
      longitude <= bounds.east &&
      longitude >= bounds.west)
  );
}

function sameUtcDate(left: string, right: Date) {
  return left.slice(0, 10) === right.toISOString().slice(0, 10);
}

function isUpcomingWeekend(value: string, now: Date) {
  const date = new Date(value);
  const daysAhead = (date.getTime() - now.getTime()) / 86_400_000;
  return daysAhead >= 0 && daysAhead <= 7 && [5, 6, 0].includes(date.getUTCDay());
}

export class DemoMeetupService {
  private get viewerId() { return this.context.viewerId?.() ?? DEMO_VIEWER_ID; }
  private get now() { return this.context.now?.() ?? this.referenceNow; }
  private readonly referenceNow: Date;
  private adultContentOptIn = false;
  private meetups: DemoMeetup[];
  private notifications: MeetupNotification[];
  private readonly places: MeetupPlaceResult[] = [
    {
      id: 'demo:harpa',
      provider: 'demo',
      name: 'Harpa',
      fullAddress: 'Austurbakki 2, 101 Reykjavík',
      generalArea: 'Miðborg, Reykjavík',
      kind: 'venue',
      coordinate: { latitude: 64.1505, longitude: -21.9326 },
    },
    {
      id: 'demo:hallgrimskirkja',
      provider: 'demo',
      name: 'Hallgrímskirkja',
      fullAddress: 'Hallgrímstorg 1, 101 Reykjavík',
      generalArea: 'Miðborg, Reykjavík',
      kind: 'venue',
      coordinate: { latitude: 64.1417, longitude: -21.9266 },
    },
    {
      id: 'demo:akureyri',
      provider: 'demo',
      name: 'Akureyri',
      generalArea: 'Akureyri',
      kind: 'locality',
      coordinate: { latitude: 65.6885, longitude: -18.1262 },
    },
  ];

  constructor(now = new Date(), private readonly tier: () => TierId = () => 'plebbi',
    private readonly poolForEvent?: (event: { id: string; hostId: string; startsAt: string; endsAt: string; status: MeetupStatus; participantCount: number }) => MeetupPoolSummary,
    private readonly context: { viewerId?: () => string; now?: () => Date;
      reservedSeats?: (event: Pick<MeetupSummary, 'id' | 'title' | 'host' | 'seriesId' | 'capacity' | 'participantCount' | 'startsAt' | 'status'>, excluding?: string) => number } = {}) {
    this.referenceNow = now;
    const createdAt = addTime(now, -2);
    this.meetups = [
      {
        id: '6b7d4dc6-640b-4d10-8f0f-e45778159a01',
        title: 'Kvöldkaffi í miðbænum',
        description: 'Rólegt kvöldkaffi og spjall fyrir hinsegin fullorðna.',
        category: 'coffee_food',
        tags: ['coffee', 'conversation'],
        startsAt: addTime(now, 1, 2),
        endsAt: addTime(now, 1, 4),
        region: 'capital',
        generalAreaId: 'reykjavik',
        host: { id: 'p-bjarni', displayName: 'Bjarni' },
        accessMode: 'open',
        locationVisibility: 'public',
        releasePolicy: 'immediate',
        latitude: 64.1505,
        longitude: -21.9326,
        approximateLatitude: 64.1505,
        approximateLongitude: -21.9326,
        venueName: 'Harpa',
        address: 'Austurbakki 2, 101 Reykjavík',
        arrivalInstructions: 'Hittumst við aðalinnganginn.',
        capacity: 20,
        baseParticipantCount: 7,
        isExplicit: false,
        prohibitedServicesAttested: true,
        publicLocationConfirmed: true,
        status: 'published',
        createdAt,
        updatedAt: createdAt,
        participations: new Map(),
        requests: new Map(),
      },
      {
        id: '9f433726-18df-41bd-96a1-e9ec1b503a02',
        title: 'Norðurljósaganga',
        description: 'Kvöldganga fyrir fullorðna með hlý föt og rólegt tempó.',
        category: 'walk_outdoors',
        tags: ['walk', 'outdoors'],
        startsAt: addTime(now, 3, 3),
        endsAt: addTime(now, 3, 5),
        region: 'north',
        generalAreaId: 'akureyri',
        host: { id: 'p-kari', displayName: 'Kári' },
        accessMode: 'open',
        locationVisibility: 'protected',
        releasePolicy: 'immediate',
        latitude: 65.6829,
        longitude: -18.0907,
        approximateLatitude: 65.6885,
        approximateLongitude: -18.1262,
        venueName: 'Upphaf gönguleiðar',
        arrivalInstructions: 'Nákvæmur upphafsstaður birtist eftir skráningu.',
        capacity: 12,
        baseParticipantCount: 4,
        isExplicit: false,
        prohibitedServicesAttested: true,
        publicLocationConfirmed: false,
        status: 'published',
        createdAt,
        updatedAt: createdAt,
        participations: new Map(),
        requests: new Map(),
      },
      {
        id: 'ab9d8adc-c086-4dcb-a461-953830d90a03',
        title: 'Einkakvöld í Vesturbæ',
        description: 'Lítill lokaður 18+ hittingur með skýrum mörkum og samþykki.',
        category: 'private_adult',
        tags: ['adult_only', 'private'],
        startsAt: addTime(now, 4, 4),
        endsAt: addTime(now, 4, 8),
        region: 'capital',
        generalAreaId: 'vesturbaer',
        host: { id: 'p-elias', displayName: 'Elías' },
        accessMode: 'private',
        locationVisibility: 'protected',
        releasePolicy: '24_hours_before',
        latitude: 64.1478,
        longitude: -21.9652,
        approximateLatitude: 64.1459,
        approximateLongitude: -21.955,
        arrivalInstructions: 'Leiðbeiningar birtast aðeins samþykktum gestum.',
        capacity: 10,
        baseParticipantCount: 5,
        isExplicit: true,
        prohibitedServicesAttested: true,
        publicLocationConfirmed: false,
        status: 'published',
        createdAt,
        updatedAt: createdAt,
        participations: new Map(),
        requests: new Map(),
      },
      {
        id: 'c38df8a4-f792-4aa7-aec7-093140d54a04',
        title: 'Hinsegin spilakvöld',
        description: 'Spil, snarl og notalegt samfélagskvöld fyrir 18 ára og eldri.',
        category: 'community',
        tags: ['games', 'community'],
        startsAt: addTime(now, 5, 1),
        endsAt: addTime(now, 5, 4),
        region: 'capital',
        generalAreaId: 'reykjavik',
        host: { id: DEMO_VIEWER_ID, displayName: 'Þú' },
        accessMode: 'private',
        locationVisibility: 'protected',
        releasePolicy: 'immediate',
        latitude: 64.1407,
        longitude: -21.8766,
        approximateLatitude: 64.1392,
        approximateLongitude: -21.889,
        venueName: 'Samkomurými',
        arrivalInstructions: 'Hringdu bjöllu 2 við innganginn.',
        capacity: 14,
        baseParticipantCount: 3,
        isExplicit: false,
        prohibitedServicesAttested: true,
        publicLocationConfirmed: false,
        status: 'published',
        createdAt,
        updatedAt: createdAt,
        participations: new Map(),
        requests: new Map([
          [
            'p-bjarni',
            {
              profile: { id: 'p-bjarni', displayName: 'Bjarni' },
              status: 'pending',
              requestedAt: addTime(now, -1),
            },
          ],
        ]),
      },
    ];
    this.notifications = [
      meetupNotificationSchema.parse({
        id: 'd1d4cb4d-729e-4ae7-b2fd-18159ade5a01',
        meetupId: 'c38df8a4-f792-4aa7-aec7-093140d54a04',
        kind: 'request_received',
        meetupTitle: 'Hinsegin spilakvöld',
        actor: { id: 'p-bjarni', displayName: 'Bjarni' },
        createdAt: addTime(now, -1),
      }),
    ];
  }

  private record(id: string) {
    const meetup = this.meetups.find((candidate) => candidate.id === id);
    if (!meetup) throw new Error('meetup_not_found');
    return meetup;
  }

  private statusFor(meetup: DemoMeetup): MeetupParticipationStatus {
    if (meetup.host.id === this.viewerId) return 'host';
    return meetup.participations.get(this.viewerId)?.status ?? meetup.requests.get(this.viewerId)?.status ?? 'none';
  }


  private gender: string | null = null;
  async getGender(_id: string): Promise<string | null> { return this.gender; }
  async setGender(_id: string, gender: string | null) { this.gender = gender; }
  private media = new Map<string, MeetupMedia[]>();
  private reviews = new Map<string, MeetupReview[]>();
  private assertOwner(id: string) { if (this.record(id).host.id !== this.viewerId) throw new Error('owned_meetup_required'); }
  async listMedia(id: string): Promise<MeetupMedia[]> { this.record(id); return this.media.get(id) ?? []; }
  async uploadMedia(id: string, uri: string, kind: 'photo' | 'video', _mimeType: string) {
    this.assertOwner(id); const rows = this.media.get(id) ?? [];
    if (rows.length >= 8) throw new Error('event_media_limit');
    const mediaId = Crypto.randomUUID();
    this.media.set(id, [...rows, { id: mediaId, kind, url: uri, position: rows.length }]);
    return mediaId;
  }
  async removeMedia(id: string, mediaId: string) { this.assertOwner(id); this.media.set(id, (this.media.get(id) ?? []).filter(x => x.id !== mediaId)); }
  async listReviews(id: string): Promise<MeetupReview[]> { this.record(id); return (this.reviews.get(id) ?? []).map(row => ({ ...row, authorId: '', authorName: 'Attendee' })); }
  async saveReview(_id: string, _rating: number, _body: string): Promise<void> { throw new Error('star_reviews_retired'); }
  async deleteReview(id: string) { this.reviews.set(id, (this.reviews.get(id) ?? []).filter(x => x.authorId !== this.viewerId)); }
  async listInvitations(id: string): Promise<string[]> { this.assertOwner(id); return [...(this.invites.get(id) ?? [])]; }
  async setInvitation(id: string, profileId: string, invited: boolean) {
    this.assertOwner(id); const set = this.invites.get(id) ?? new Set<string>();
    if (invited) set.add(profileId); else set.delete(profileId); this.invites.set(id, set);
  }

  private invites = new Map<string, Set<string>>();

  private participantCount(meetup: DemoMeetup) {
    const ids = new Set([...meetup.participations].filter(([, value]) => ['joined', 'approved'].includes(value.status)).map(([id]) => id));
    for (const [id, value] of meetup.requests) if (['joined', 'approved'].includes(value.status)) ids.add(id);
    return meetup.baseParticipantCount + ids.size;
  }
  private reservedSeats(meetup: DemoMeetup, excluding?: string) {
    return this.context.reservedSeats?.({ id: meetup.id, title: meetup.title, host: meetup.host, seriesId: meetup.seriesId ?? null,
      capacity: meetup.capacity, startsAt: meetup.startsAt, status: meetup.status, participantCount: this.participantCount(meetup) }, excluding) ?? 0;
  }
  isCommunityEligible(id: string, profileId: string) {
    const event = this.record(id); const profile = event.eventProfile ?? defaultMeetupEventProfile(event.accessMode);
    const status = event.participations.get(profileId)?.status ?? event.requests.get(profileId)?.status ?? 'none';
    return event.status === 'published' && event.host.id !== profileId && this.now.getTime() < Date.parse(event.startsAt)
      && !['joined', 'approved', 'removed', 'declined'].includes(status)
      && meetupEligibility(profile, { age: 30, identities: this.gender ? [this.gender] : [] })
      && (profile.joinMode !== 'invite' || this.invites.get(id)?.has(profileId) === true);
  }
  communityHostId(id: string) { return this.record(id).host.id; }
  communityParticipants(id: string) {
    const event = this.record(id); return [...new Set([...event.participations, ...event.requests]
      .filter(([, entry]) => ['joined', 'approved'].includes(entry.status)).map(([profileId]) => profileId))];
  }
  async allForCommunity() { return this.meetups.filter(event => isLaunchMeetup(event) && (event.status === 'published' || event.host.id === this.viewerId)).map(event => this.detail(event)); }
  async acceptCommunityOffer(id: string, approvedApplication: boolean) {
    const event = this.record(id); const profile = event.eventProfile ?? defaultMeetupEventProfile(event.accessMode);
    if (!this.isCommunityEligible(id, this.viewerId) || profile.joinMode === 'request' && !approvedApplication) throw new Error('meetup_cannot_join');
    if (event.capacity !== null && this.participantCount(event) + this.reservedSeats(event, this.viewerId) >= event.capacity) throw new Error('meetup_full');
    this.checkJoinSlot(event, this.viewerId);
    const status = profile.joinMode === 'request' ? 'approved' : 'joined';
    event.participations.set(this.viewerId, { status, respondedAt: this.now.toISOString() });
    event.requests.set(this.viewerId, { profile: { id: this.viewerId, displayName: this.viewerId === 'demo-me' ? 'Þú' : this.viewerId }, status, requestedAt: this.now.toISOString(), respondedAt: this.now.toISOString() });
  }

  private states(meetup: DemoMeetup): {
    viewerState: MeetupViewerState;
    capabilities: MeetupViewerCapabilities;
  } {
    const participationStatus = this.statusFor(meetup);
    const profile = meetup.eventProfile ?? defaultMeetupEventProfile(meetup.accessMode);
    const diagnosisEligible=!profile.requiredDiagnosisIds.length;
    const eligible = meetupEligibility(profile, { age: 30, identities: this.gender ? [this.gender] : [] }) && (profile.joinMode !== 'invite' || this.invites.get(meetup.id)?.has(this.viewerId) === true);
    const active = meetup.status === 'published';
    const isHost = participationStatus === 'host';
    const isAttending = participationStatus === 'joined' || participationStatus === 'approved';
    const exactLocationStatusAllowed = active || (isHost && meetup.status === 'draft');
    const releaseAt = calculateMeetupReleaseAt(meetup.startsAt, meetup.releasePolicy, meetup.createdAt);
    const releaseReached = this.now.getTime() >= Date.parse(releaseAt);
    const hasProtectedLocationAccess =
      diagnosisEligible && meetup.locationVisibility === 'protected' && meetup.status !== 'cancelled' && (isHost || isAttending);
    const canRevealProtectedLocation = hasProtectedLocationAccess && (isHost || releaseReached);
    const isFull = meetup.capacity !== null && this.participantCount(meetup) + this.reservedSeats(meetup) >= meetup.capacity;
    return {
      viewerState: {
        participationStatus,
        hasProtectedLocationAccess,
        rsvpVisibility: 'private',
        attendanceState: 'not_required',
        historyVisibility: 'private',
      },
      capabilities: {
        canViewExactLocation:
          exactLocationStatusAllowed
          && (meetup.locationVisibility === 'public' || canRevealProtectedLocation),
        canViewArrivalInstructions:
          diagnosisEligible && meetup.status !== 'cancelled' && (isHost || (isAttending && releaseReached)),
        canJoin:
          active && eligible && meetup.accessMode === 'open' && !isFull && ['none', 'left', 'withdrawn'].includes(participationStatus),
        canRequestAccess:
          active && eligible && meetup.accessMode === 'private' && ['none', 'left', 'withdrawn'].includes(participationStatus),
        canCancelRequest: active && participationStatus === 'pending',
        canLeave: active && isAttending,
        canEdit: isHost && ['draft', 'published'].includes(meetup.status),
        canManageRequests: isHost && active,
        canRemoveParticipants: isHost && active,
        canCancel: isHost && active,
        canDeleteDraft: isHost && meetup.status === 'draft',
        canReport: !isHost && meetup.status !== 'moderation_hidden',
        canBlockHost: !isHost,
        canViewRoster: active && isHost,
        canViewRoom: isHost || isAttending,
        canSendRoomMessage: (isHost || isAttending) && active,
        canConfirmAttendance: false,
        canCompleteAttendance: false,
      },
    };
  }

  private location(meetup: DemoMeetup, capabilities: MeetupViewerCapabilities) {
    const exactLocation = {
      latitude: meetup.latitude,
      longitude: meetup.longitude,
      ...(meetup.venueName ? { venueName: meetup.venueName } : {}),
      ...(meetup.address ? { address: meetup.address } : {}),
    };
    if (!capabilities.canViewExactLocation) {
      return {
        state: 'protected_locked' as const,
        generalAreaId: meetup.generalAreaId,
        marker: {
          latitude: meetup.approximateLatitude,
          longitude: meetup.approximateLongitude,
          isApproximate: true as const,
        },
        releaseAt: calculateMeetupReleaseAt(meetup.startsAt, meetup.releasePolicy, meetup.createdAt),
      };
    }
    if (meetup.locationVisibility === 'public') {
      return {
        state: 'public' as const,
        generalAreaId: meetup.generalAreaId,
        marker: { latitude: meetup.latitude, longitude: meetup.longitude, isApproximate: false as const },
        exactLocation,
        ...(capabilities.canViewArrivalInstructions && meetup.arrivalInstructions
          ? { arrivalInstructions: meetup.arrivalInstructions }
          : {}),
      };
    }
    return {
      state: 'protected_revealed' as const,
      generalAreaId: meetup.generalAreaId,
      marker: { latitude: meetup.latitude, longitude: meetup.longitude, isApproximate: false as const },
      exactLocation,
      ...(meetup.arrivalInstructions ? { arrivalInstructions: meetup.arrivalInstructions } : {}),
      accessExpiresAt: calculateMeetupLocationAccessExpiry(
        calculateMeetupEffectiveEnd(meetup.startsAt, meetup.endsAt),
      ),
    };
  }

  private summary(meetup: DemoMeetup): MeetupSummary {
    const { viewerState, capabilities } = this.states(meetup);
    const participantCount = this.participantCount(meetup);
    const location = this.location(meetup, capabilities);
    const effectiveLocationVisibility = location.state === 'protected_locked'
      ? 'protected'
      : meetup.locationVisibility;
    return meetupSummarySchema.parse({
      id: meetup.id,
      title: meetup.title,
      category: meetup.category,
      intention: meetup.intention ?? (meetup.category === 'dating' ? 'dating' : meetup.category === 'community' ? 'community' : meetup.category === 'private_adult' ? 'casual_adult' : meetup.category === 'walk_outdoors' ? 'shared_activity' : 'friends_social'),
      venueMode: meetup.venueMode ?? 'in_person',
      seriesId: meetup.seriesId ?? null,
      occurrenceIndex: meetup.occurrenceIndex ?? null,
      rsvpVisibility: 'private',
      onlineAccess: { state: meetup.venueMode && meetup.venueMode !== 'in_person' ? 'locked' : 'none' },
      eventProfile: meetup.eventProfile ?? defaultMeetupEventProfile(meetup.accessMode),
      diagnosisRestricted: Boolean(meetup.eventProfile?.requiredDiagnosisIds.length),
      requiresDiagnosisVerification: Boolean(meetup.eventProfile?.requiredDiagnosisIds.length),
      tags: meetup.tags,
      startsAt: meetup.startsAt,
      ...(meetup.endsAt ? { endsAt: meetup.endsAt } : {}),
      effectiveEnd: calculateMeetupEffectiveEnd(meetup.startsAt, meetup.endsAt),
      generalAreaId: meetup.generalAreaId,
      generalArea: GENERAL_AREAS[meetup.generalAreaId],
      host: meetup.host,
      accessMode: meetup.accessMode,
      locationVisibility: effectiveLocationVisibility,
      releasePolicy: meetup.releasePolicy,
      participantCount,
      reservedPlaces: this.reservedSeats(meetup),
      pool: this.poolForEvent?.({ id: meetup.id, hostId: meetup.host.id, startsAt: meetup.startsAt, endsAt: calculateMeetupEffectiveEnd(meetup.startsAt, meetup.endsAt), status: meetup.status, participantCount }) ?? {
        hostBps: 2500, locked: Date.parse(meetup.startsAt) <= this.now.getTime(), total: 0,
        fundedTotal: 0, paidTotal: 0, refundedTotal: 0,
        status: meetup.status === 'cancelled' ? 'refunded' : Date.parse(calculateMeetupEffectiveEnd(meetup.startsAt, meetup.endsAt)) <= this.now.getTime() ? 'awaiting_settlement' : Date.parse(meetup.startsAt) <= this.now.getTime() ? 'locked' : 'accepting',
        estimatedParticipantReward: participantCount ? 0 : null, eligibleParticipantCount: participantCount,
      },
      capacity: meetup.capacity,
      isFull: meetup.capacity !== null && participantCount + this.reservedSeats(meetup) >= meetup.capacity,
      isExplicit: meetup.isExplicit,
      status: meetup.status,
      location,
      viewerState,
      capabilities,
    });
  }

  private detail(meetup: DemoMeetup): MeetupDetail {
    return meetupDetailSchema.parse({
      ...this.summary(meetup),
      onlineAccess: meetup.venueMode && meetup.venueMode !== 'in_person'
        ? this.states(meetup).capabilities.canViewExactLocation && meetup.onlineUrl
          ? { state: 'revealed', url: meetup.onlineUrl, accessCode: meetup.onlineAccessCode, accessExpiresAt: calculateMeetupLocationAccessExpiry(calculateMeetupEffectiveEnd(meetup.startsAt, meetup.endsAt)) }
          : { state: 'locked' }
        : { state: 'none' },
      description: meetup.description,
      recurrence: meetup.recurrence ?? null,
      tags: meetup.tags,
      createdAt: meetup.createdAt,
      updatedAt: meetup.updatedAt,
      ...(meetup.cancelledAt ? { cancelledAt: meetup.cancelledAt } : {}),
    });
  }

  async discover(filters: MeetupFilters = defaultMeetupFilters): Promise<MeetupSummary[]> {
    const parsed = meetupFiltersSchema.parse(filters);
    return this.meetups
      .filter((meetup) => meetup.status === 'published')
      .filter(isLaunchMeetup)
      .filter((meetup) => !parsed.intention || (meetup.intention ?? 'friends_social') === parsed.intention)
      .filter(meetup=>!parsed.genders.length||!meetup.eventProfile?.audienceGenders.length||parsed.genders.some(g=>meetup.eventProfile!.audienceGenders.includes(g)))
      .filter(meetup=>!parsed.diagnosisIds.length||parsed.diagnosisIds.some(id=>meetup.eventProfile?.requiredDiagnosisIds.includes(id)))
      .filter(meetup=>parsed.radiusKm===null||meetup.venueMode!=='online'&&Math.hypot((meetup.approximateLatitude-64.1466)*111,(meetup.approximateLongitude+21.9426)*48.4)<=parsed.radiusKm)
      .filter((meetup) => !parsed.venueMode || (meetup.venueMode ?? 'in_person') === parsed.venueMode)
      .filter((meetup) => !meetup.endsAt || Date.parse(meetup.endsAt) > this.now.getTime())
      .filter((meetup) => !meetup.isExplicit || (parsed.includeExplicit && this.adultContentOptIn))
      .filter((meetup) => !parsed.category || meetup.category === parsed.category)
      .filter((meetup) => !parsed.accessMode || meetup.accessMode === parsed.accessMode)
      .filter((meetup) => !parsed.region || meetup.region === parsed.region)
      .filter((meetup) =>
        includesCoordinate(parsed.bounds, meetup.approximateLatitude, meetup.approximateLongitude),
      )
      .filter((meetup) => {
        if (parsed.timing === 'today') return sameUtcDate(meetup.startsAt, this.now);
        if (parsed.timing === 'weekend') return isUpcomingWeekend(meetup.startsAt, this.now);
        if (parsed.timing === 'future') return Date.parse(meetup.startsAt) > this.now.getTime();
        return true;
      })
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
      .map((meetup) => this.summary(meetup));
  }

  async get(id: string) {
    return this.detail(this.record(id));
  }

  async listMine() {
    return this.meetups
      .filter((meetup) => meetup.host.id === this.viewerId || meetup.participations.has(this.viewerId))
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
      .map((meetup) => this.detail(meetup));
  }

  async listRequests(id: string): Promise<MeetupRequest[]> {
    const meetup = this.record(id);
    if (meetup.host.id !== this.viewerId) throw new Error('meetup_forbidden');
    return [...meetup.requests.values()]
      .filter((request): request is DemoRequest & { status: MeetupRequestStatus } =>
        ['pending', 'approved', 'declined'].includes(request.status))
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
      .map((request) => meetupRequestSchema.parse({ meetupId: meetup.id, profile: request.profile, status: request.status, requestedAt: request.requestedAt, respondedAt: request.respondedAt }));
  }

  async listParticipants(id: string): Promise<MeetupRosterEntry[]> {
    const meetup = this.record(id);
    if (meetup.host.id !== this.viewerId) throw new Error('meetup_forbidden');
    return [...meetup.requests.values()]
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
      .map((entry) => meetupRosterEntrySchema.parse({ meetupId: meetup.id, profile: entry.profile, status: entry.status, requestedAt: entry.requestedAt, respondedAt: entry.respondedAt }));
  }

  async createDraft(input: MeetupDraftInput): Promise<string> {
    if (!isLaunchMeetup(input)) throw new Error('explicit_events_unavailable');
    const draft = meetupDraftInputSchema.parse(input);
    if(draft.eventProfile?.requiredDiagnosisIds.length)throw new Error('verified_host_required');
    const now = new Date().toISOString();
    const id = Crypto.randomUUID();
    this.meetups.unshift({
      id,
      title: draft.title,
      description: draft.description,
      category: draft.category,
      intention: draft.intention,
      venueMode: draft.venueMode,
      recurrence: draft.recurrence,
      eventProfile: draft.eventProfile,
      onlineUrl: draft.onlineUrl,
      onlineAccessCode: draft.onlineAccessCode,
      tags: draft.tags,
      startsAt: draft.startsAt,
      ...(draft.endsAt ? { endsAt: draft.endsAt } : {}),
      region: GENERAL_AREAS[draft.generalAreaId].region,
      generalAreaId: draft.generalAreaId,
      host: { id: this.viewerId, displayName: 'Þú' },
      accessMode: draft.eventProfile ? draft.eventProfile.joinMode === 'request' ? 'private' : 'open' : draft.accessMode,
      locationVisibility: draft.locationVisibility,
      releasePolicy: draft.releasePolicy,
      latitude: draft.latitude,
      longitude: draft.longitude,
      approximateLatitude: draft.latitude + 0.008,
      approximateLongitude: draft.longitude - 0.012,
      ...(draft.venueName ? { venueName: draft.venueName } : {}),
      ...(draft.address ? { address: draft.address } : {}),
      ...(draft.arrivalInstructions ? { arrivalInstructions: draft.arrivalInstructions } : {}),
      capacity: draft.capacity ?? null,
      baseParticipantCount: 0,
      isExplicit: draft.isExplicit,
      prohibitedServicesAttested: draft.prohibitedServicesAttested,
      publicLocationConfirmed: draft.publicLocationConfirmed,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      participations: new Map(),
      requests: new Map(),
    });
    return id;
  }

  async update(id: string, input: MeetupUpdateInput): Promise<MeetupDetail> {
    if (!isLaunchMeetup(input)) throw new Error('explicit_events_unavailable');
    const meetup = this.record(id);
    if (meetup.host.id !== this.viewerId || !['draft', 'published'].includes(meetup.status)) {
      throw new Error('meetup_forbidden');
    }
    const update = meetupUpdateInputSchema.parse(input);
    if (meetup.status === 'published' && update.startsAt && monthInIceland(update.startsAt) !== monthInIceland(meetup.startsAt)) {
      this.checkPublicationSlots([update.startsAt], meetup.id);
      const affected = new Set([...meetup.participations.keys(), ...meetup.requests.keys()]);
      for (const profileId of affected) if (this.consumesJoin(meetup, profileId)) this.checkJoinSlot(meetup, profileId, update.startsAt);
    }
    const materialChange = ['startsAt', 'endsAt', 'accessMode', 'latitude', 'longitude'].some(
      (key) => key in update,
    );
    const resetsProhibitedServicesAttestation = [
      'title',
      'description',
      'category',
      'tags',
      'isExplicit',
    ].some((key) => key in update);
    const resetsPublicLocationConfirmation = [
      'locationVisibility',
      'generalAreaId',
      'latitude',
      'longitude',
      'venueName',
      'address',
    ].some((key) => key in update);
    if (update.eventProfile !== undefined) {
      if((meetup.requests.size||meetup.participations.size)&&JSON.stringify(update.eventProfile.requiredDiagnosisIds)!==JSON.stringify(meetup.eventProfile?.requiredDiagnosisIds??[]))throw new Error('diagnosis_requirements_locked');
      if(update.eventProfile.requiredDiagnosisIds.length)throw new Error('verified_host_required');
      meetup.eventProfile = update.eventProfile;
    }
    if (update.venueMode !== undefined) meetup.venueMode = update.venueMode;
    if (update.intention !== undefined) meetup.intention = update.intention;
    if (update.recurrence !== undefined) meetup.recurrence = update.recurrence;
    if (update.onlineUrl !== undefined) meetup.onlineUrl = update.onlineUrl ?? undefined;
    if (update.onlineAccessCode !== undefined) meetup.onlineAccessCode = update.onlineAccessCode ?? undefined;
    if (update.title !== undefined) meetup.title = update.title;
    if (update.description !== undefined) meetup.description = update.description;
    if (update.category !== undefined) meetup.category = update.category;
    if (update.tags !== undefined) meetup.tags = update.tags;
    if (update.startsAt !== undefined) meetup.startsAt = update.startsAt;
    if ('endsAt' in update) meetup.endsAt = update.endsAt ?? undefined;
    if (update.accessMode !== undefined) meetup.accessMode = update.accessMode;
    if (meetup.eventProfile) meetup.accessMode = meetup.eventProfile.joinMode === 'request' ? 'private' : 'open';
    if (update.locationVisibility !== undefined) meetup.locationVisibility = update.locationVisibility;
    if (update.generalAreaId !== undefined) {
      meetup.generalAreaId = update.generalAreaId;
      meetup.region = GENERAL_AREAS[update.generalAreaId].region;
    }
    if (update.releasePolicy !== undefined) meetup.releasePolicy = update.releasePolicy;
    if ('capacity' in update) meetup.capacity = update.capacity ?? null;
    if (update.isExplicit !== undefined) meetup.isExplicit = update.isExplicit;
    if (resetsProhibitedServicesAttestation) {
      meetup.prohibitedServicesAttested = update.prohibitedServicesAttested === true;
    } else if (update.prohibitedServicesAttested !== undefined) {
      meetup.prohibitedServicesAttested = update.prohibitedServicesAttested;
    }
    if (resetsPublicLocationConfirmation) {
      meetup.publicLocationConfirmed = update.publicLocationConfirmed === true;
    } else if (update.publicLocationConfirmed !== undefined) {
      meetup.publicLocationConfirmed = update.publicLocationConfirmed;
    }
    if (update.latitude !== undefined) meetup.latitude = update.latitude;
    if (update.longitude !== undefined) meetup.longitude = update.longitude;
    if ('venueName' in update) meetup.venueName = update.venueName ?? undefined;
    if ('address' in update) meetup.address = update.address ?? undefined;
    if ('arrivalInstructions' in update) meetup.arrivalInstructions = update.arrivalInstructions ?? undefined;
    meetup.updatedAt = new Date().toISOString();
    if (materialChange && meetup.status === 'published') {
      this.notifications.unshift(
        meetupNotificationSchema.parse({
          id: Crypto.randomUUID(),
          meetupId: meetup.id,
          kind: 'material_change',
          meetupTitle: meetup.title,
          createdAt: meetup.updatedAt,
        }),
      );
    }
    return this.detail(meetup);
  }

  async publish(id: string): Promise<MeetupDetail> {
    const meetup = this.record(id);
    if (meetup.host.id !== this.viewerId || meetup.status !== 'draft') throw new Error('meetup_forbidden');
    if(meetup.eventProfile?.requiredDiagnosisIds.length)throw new Error('verified_host_required');
    if (!meetup.prohibitedServicesAttested) throw new Error('meetup_attestation_required');
    if (meetup.locationVisibility === 'public' && !meetup.publicLocationConfirmed) {
      throw new Error('meetup_public_location_confirmation_required');
    }
    const occurrences = meetup.recurrence ? generateMeetupOccurrences(meetup.startsAt, meetup.recurrence) : [meetup.startsAt];
    this.checkPublicationSlots(occurrences, meetup.id);
    const duration = meetup.endsAt ? Date.parse(meetup.endsAt) - Date.parse(meetup.startsAt) : null;
    if (meetup.recurrence) { meetup.seriesId = meetup.seriesId ?? Crypto.randomUUID(); meetup.occurrenceIndex = 1; }
    // Validate the whole series before mutating any occurrence.
    for (const [index, startsAt] of occurrences.slice(1).entries()) this.meetups.push({ ...structuredClone(meetup), id: Crypto.randomUUID(), occurrenceIndex: index + 2, startsAt, endsAt: duration === null ? undefined : new Date(Date.parse(startsAt) + duration).toISOString(), recurrence: null, status: 'published', publishedAt: new Date().toISOString() });
    meetup.startsAt = occurrences[0]!;
    if (duration !== null) meetup.endsAt = new Date(Date.parse(meetup.startsAt) + duration).toISOString();
    meetup.status = 'published';
    meetup.publishedAt = new Date().toISOString();
    meetup.updatedAt = new Date().toISOString();
    return this.detail(meetup);
  }

  /** Synchronous callback commits finance only after every publication check has passed. */
  async publishFunded(id: string, commit: () => void): Promise<MeetupDetail> {
    const previousMeetups = structuredClone(this.meetups);
    const previousNotifications = structuredClone(this.notifications);
    try {
      await this.publish(id);
      commit();
      return this.detail(this.record(id));
    } catch (error) {
      this.meetups = previousMeetups;
      this.notifications = previousNotifications;
      throw error;
    }
  }

  private consumesJoin(event: DemoMeetup, profileId: string) {
    if (event.host.id === profileId || event.status === 'cancelled' || event.status === 'draft') return false;
    const participation = event.participations.get(profileId);
    const request = event.requests.get(profileId);
    return !!(participation?.quotaConsumed || request?.quotaConsumed ||
      (participation && ['joined', 'approved'].includes(participation.status)) || request?.status === 'approved');
  }

  joinedUsage(month = monthInIceland(), profileId = this.viewerId, excluded?: string) {
    return this.meetups.filter(event => event.id !== excluded && monthInIceland(event.startsAt) === month && this.consumesJoin(event, profileId)).length;
  }

  private checkJoinSlot(event: DemoMeetup, profileId: string, startsAt = event.startsAt) {
    const tier = profileId === this.viewerId ? this.tier() : 'plebbi';
    if (profileId !== event.host.id && this.joinedUsage(monthInIceland(startsAt), profileId, event.id) >= TIERS[tier].joins)
      throw new Error('meetup_join_monthly_limit_reached');
  }

  hostedUsage(month = monthInIceland()) {
    return this.meetups.filter(event => event.host.id === this.viewerId && (event.publishedAt || event.status === 'published')
      && !(event.status === 'cancelled' && event.cancelledAt && Date.parse(event.cancelledAt) < Date.parse(event.startsAt))
      && monthInIceland(event.startsAt) === month).length;
  }

  private checkPublicationSlots(starts: string[], excluded: string) {
    const used = new Map<string, number>();
    for (const event of this.meetups) {
      if (event.id === excluded || event.host.id !== this.viewerId || (!event.publishedAt && event.status !== 'published')) continue;
      if (event.status === 'cancelled' && event.cancelledAt && Date.parse(event.cancelledAt) < Date.parse(event.startsAt)) continue;
      const month = monthInIceland(event.startsAt); used.set(month, (used.get(month) ?? 0) + 1);
    }
    for (const start of starts) {
      const month = monthInIceland(start); const count = (used.get(month) ?? 0) + 1;
      if (count > TIERS[this.tier()].occurrences) throw new Error('meetup_monthly_limit_reached');
      used.set(month, count);
    }
  }

  async deleteDraft(id: string) {
    const meetup = this.record(id);
    if (meetup.host.id !== this.viewerId || meetup.status !== 'draft') throw new Error('meetup_forbidden');
    this.meetups = this.meetups.filter((candidate) => candidate.id !== id);
  }

  private participationResult(meetup: DemoMeetup, participation: DemoParticipation) {
    return meetupParticipationSchema.parse({
      meetupId: meetup.id,
      profileId: this.viewerId,
      status: participation.status, requestedAt: participation.requestedAt, respondedAt: participation.respondedAt,
    });
  }

  async join(id: string): Promise<MeetupParticipation> {
    const meetup = this.record(id);
    const { capabilities } = this.states(meetup);
    if (!capabilities.canJoin) throw new Error(meetup.capacity === this.participantCount(meetup) ? 'meetup_full' : 'meetup_cannot_join');
    this.checkJoinSlot(meetup, this.viewerId);
    const participation: DemoParticipation = { status: 'joined', respondedAt: new Date().toISOString() };
    meetup.participations.set(this.viewerId, participation);
    meetup.requests.set(this.viewerId, { profile: { id: this.viewerId, displayName: this.viewerId === 'demo-me' ? 'Þú' : this.viewerId }, status: participation.status as MeetupRosterStatus, requestedAt: participation.requestedAt ?? this.now.toISOString(), respondedAt: participation.respondedAt });
    return this.participationResult(meetup, participation);
  }

  async requestAccess(id: string): Promise<MeetupParticipation> {
    const meetup = this.record(id);
    if (!this.states(meetup).capabilities.canRequestAccess) throw new Error('meetup_cannot_request');
    const participation: DemoParticipation = { status: 'pending', requestedAt: new Date().toISOString() };
    meetup.participations.set(this.viewerId, participation);
    meetup.requests.set(this.viewerId, { profile: { id: this.viewerId, displayName: this.viewerId === 'demo-me' ? 'Þú' : this.viewerId }, status: participation.status as MeetupRosterStatus, requestedAt: participation.requestedAt ?? this.now.toISOString(), respondedAt: participation.respondedAt });
    return this.participationResult(meetup, participation);
  }

  async cancelRequest(id: string) {
    const meetup = this.record(id);
    if (!this.states(meetup).capabilities.canCancelRequest) throw new Error('meetup_request_not_pending');
    meetup.participations.set(this.viewerId, { status: 'withdrawn', respondedAt: new Date().toISOString() });
    const request = meetup.requests.get(this.viewerId); if (request) request.status = 'withdrawn';
  }

  async leave(id: string) {
    const meetup = this.record(id);
    if (!this.states(meetup).capabilities.canLeave) throw new Error('meetup_not_joined');
    meetup.participations.set(this.viewerId, { status: 'left', quotaConsumed: this.now.getTime() >= Date.parse(meetup.startsAt), respondedAt: new Date().toISOString() });
    const request = meetup.requests.get(this.viewerId); if (request) request.status = 'left';
  }

  async respond(id: string, profileId: string, approve: boolean): Promise<MeetupRequest> {
    const meetup = this.record(id);
    if (meetup.host.id !== this.viewerId) throw new Error('meetup_forbidden');
    const request = meetup.requests.get(profileId);
    if (!request || request.status !== 'pending') throw new Error('meetup_request_not_pending');
    if (approve && meetup.capacity !== null && this.participantCount(meetup) + this.reservedSeats(meetup) >= meetup.capacity) {
      throw new Error('meetup_full');
    }
    if (approve) this.checkJoinSlot(meetup, profileId);
    request.status = approve ? 'approved' : 'declined';
    request.respondedAt = new Date().toISOString();
    if (meetup.participations.has(profileId)) meetup.participations.set(profileId, { status: approve ? 'approved' : 'declined', respondedAt: request.respondedAt });
    return meetupRequestSchema.parse({ meetupId: meetup.id, ...Object.fromEntries(Object.entries(request).filter(([key]) => key !== 'quotaConsumed')) });
  }

  async removeParticipant(id: string, profileId: string) {
    const meetup = this.record(id);
    if (meetup.host.id !== this.viewerId) throw new Error('meetup_forbidden');
    const request = meetup.requests.get(profileId);
    if (request) {
      request.quotaConsumed = this.consumesJoin(meetup, profileId) && this.now.getTime() >= Date.parse(meetup.startsAt);
      request.status = 'removed';
      request.respondedAt = new Date().toISOString();
    }
    if (meetup.participations.has(profileId)) {
      meetup.participations.set(profileId, { status: 'removed', quotaConsumed: this.consumesJoin(meetup, profileId) && this.now.getTime() >= Date.parse(meetup.startsAt), respondedAt: new Date().toISOString() });
    }
  }

  async reinstateParticipant(
    id: string,
    profileId: string,
    status: MeetupReinstateStatus,
  ): Promise<MeetupRequest> {
    const meetup = this.record(id);
    if (meetup.host.id !== this.viewerId) throw new Error('meetup_forbidden');
    const request = meetup.requests.get(profileId);
    if (!request || !['declined', 'removed'].includes(request.status)) {
      throw new Error('meetup_participation_not_terminal');
    }
    if (status === 'approved' && meetup.capacity !== null && this.participantCount(meetup) + this.reservedSeats(meetup) >= meetup.capacity) {
      throw new Error('meetup_full');
    }
    if (status === 'approved') this.checkJoinSlot(meetup, profileId);
    request.status = status;
    request.respondedAt = new Date().toISOString();
    if (meetup.participations.has(profileId)) meetup.participations.set(profileId, { status, respondedAt: request.respondedAt });
    return meetupRequestSchema.parse({ meetupId: meetup.id, profile: request.profile, status: request.status, requestedAt: request.requestedAt, respondedAt: request.respondedAt });
  }

  async cancel(id: string) {
    const meetup = this.record(id);
    if (meetup.host.id !== this.viewerId || meetup.status !== 'published') throw new Error('meetup_forbidden');
    meetup.status = 'cancelled';
    meetup.cancelledAt = new Date().toISOString();
    meetup.updatedAt = meetup.cancelledAt;
  }

  async report(id: string, input: MeetupReportInput) {
    this.record(id);
    meetupReportInputSchema.parse(input);
    return Crypto.randomUUID();
  }

  async setAdultPreference(enabled: boolean) {
    this.adultContentOptIn = enabled;
  }

  async listNotifications(limit = 50) {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 50;
    return this.notifications.slice(0, safeLimit).map((item) => meetupNotificationSchema.parse(item));
  }

  async markNotificationRead(notificationId: string) {
    const notification = this.notifications.find((candidate) => candidate.id === notificationId);
    if (!notification) throw new Error('notification_not_found');
    notification.readAt = new Date().toISOString();
  }

  async searchPlaces(query: string, options?: MeetupPlaceSearchOptions) {
    const normalized = meetupPlaceQuerySchema.parse(query).toLocaleLowerCase('is');
    const parsedOptions = meetupPlaceSearchOptionsSchema.parse(options ?? {});
    return this.places
      .filter((place) => `${place.name} ${place.fullAddress ?? ''} ${place.generalArea}`.toLocaleLowerCase('is').includes(normalized))
      .slice(0, parsedOptions.limit)
      .map((place) => meetupPlaceResultSchema.parse(place));
  }

  async reverseGeocode(coordinate: GeoCoordinate, options?: MeetupPlaceSearchOptions) {
    const parsedCoordinate = icelandCoordinateSchema.parse(coordinate);
    const parsedOptions = meetupPlaceSearchOptionsSchema.parse(options ?? {});
    const nearest = [...this.places]
      .sort((left, right) => {
        const leftDistance = Math.hypot(
          left.coordinate.latitude - parsedCoordinate.latitude,
          left.coordinate.longitude - parsedCoordinate.longitude,
        );
        const rightDistance = Math.hypot(
          right.coordinate.latitude - parsedCoordinate.latitude,
          right.coordinate.longitude - parsedCoordinate.longitude,
        );
        return leftDistance - rightDistance;
      })
      .slice(0, parsedOptions.limit)[0];
    return nearest ? meetupPlaceResultSchema.parse(nearest) : null;
  }
}
