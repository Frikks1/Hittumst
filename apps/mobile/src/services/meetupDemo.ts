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
  requestedAt?: string;
  respondedAt?: string;
};

type DemoRequest = {
  profile: MeetupParticipantProfile;
  status: MeetupRosterStatus;
  requestedAt: string;
  respondedAt?: string;
};

type DemoMeetup = {
  id: string;
  title: string;
  description: string;
  category: MeetupCategory;
  intention?: MeetupIntention;
  venueMode?: MeetupVenueMode;
  recurrence?: MeetupRecurrenceRule | null;
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
  private readonly viewerId = DEMO_VIEWER_ID;
  private readonly now: Date;
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

  constructor(now = new Date()) {
    this.now = now;
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
    return meetup.participations.get(this.viewerId)?.status ?? 'none';
  }

  private participantCount(meetup: DemoMeetup) {
    const current = meetup.participations.get(this.viewerId)?.status;
    return meetup.baseParticipantCount + (current === 'joined' || current === 'approved' ? 1 : 0);
  }

  private states(meetup: DemoMeetup): {
    viewerState: MeetupViewerState;
    capabilities: MeetupViewerCapabilities;
  } {
    const participationStatus = this.statusFor(meetup);
    const active = meetup.status === 'published';
    const isHost = participationStatus === 'host';
    const isAttending = participationStatus === 'joined' || participationStatus === 'approved';
    const exactLocationStatusAllowed = active || (isHost && meetup.status === 'draft');
    const releaseAt = calculateMeetupReleaseAt(meetup.startsAt, meetup.releasePolicy, meetup.createdAt);
    const releaseReached = this.now.getTime() >= Date.parse(releaseAt);
    const hasProtectedLocationAccess =
      meetup.locationVisibility === 'protected' && meetup.status !== 'cancelled' && (isHost || isAttending);
    const canRevealProtectedLocation = hasProtectedLocationAccess && (isHost || releaseReached);
    const isFull = meetup.capacity !== null && this.participantCount(meetup) >= meetup.capacity;
    return {
      viewerState: {
        participationStatus,
        hasProtectedLocationAccess,
        rsvpVisibility: 'inherit',
        attendanceState: 'not_required',
        historyVisibility: 'private',
      },
      capabilities: {
        canViewExactLocation:
          exactLocationStatusAllowed
          && (meetup.locationVisibility === 'public' || canRevealProtectedLocation),
        canViewArrivalInstructions:
          meetup.status !== 'cancelled' && (isHost || (isAttending && releaseReached)),
        canJoin:
          active && meetup.accessMode === 'open' && !isFull && ['none', 'left', 'withdrawn'].includes(participationStatus),
        canRequestAccess:
          active && meetup.accessMode === 'private' && ['none', 'left', 'withdrawn'].includes(participationStatus),
        canCancelRequest: active && participationStatus === 'pending',
        canLeave: active && isAttending,
        canEdit: isHost && ['draft', 'published'].includes(meetup.status),
        canManageRequests: isHost && active,
        canRemoveParticipants: isHost && active,
        canCancel: isHost && active,
        canDeleteDraft: isHost && meetup.status === 'draft',
        canReport: !isHost && meetup.status !== 'moderation_hidden',
        canBlockHost: !isHost,
        canViewRoster: active,
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
      seriesId: null,
      occurrenceIndex: null,
      rsvpVisibility: 'inherit',
      onlineAccess: { state: 'none' },
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
      capacity: meetup.capacity,
      isFull: meetup.capacity !== null && participantCount >= meetup.capacity,
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
      .filter((meetup) => meetup.host.id === this.viewerId)
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
      .map((request) => meetupRequestSchema.parse({ meetupId: meetup.id, ...request }));
  }

  async listParticipants(id: string): Promise<MeetupRosterEntry[]> {
    const meetup = this.record(id);
    if (meetup.host.id !== this.viewerId) throw new Error('meetup_forbidden');
    return [...meetup.requests.values()]
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
      .map((entry) => meetupRosterEntrySchema.parse({ meetupId: meetup.id, ...entry }));
  }

  async createDraft(input: MeetupDraftInput): Promise<string> {
    if (!isLaunchMeetup(input)) throw new Error('explicit_events_unavailable');
    const draft = meetupDraftInputSchema.parse(input);
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
      tags: draft.tags,
      startsAt: draft.startsAt,
      ...(draft.endsAt ? { endsAt: draft.endsAt } : {}),
      region: GENERAL_AREAS[draft.generalAreaId].region,
      generalAreaId: draft.generalAreaId,
      host: { id: this.viewerId, displayName: 'Þú' },
      accessMode: draft.accessMode,
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
    if (update.title !== undefined) meetup.title = update.title;
    if (update.description !== undefined) meetup.description = update.description;
    if (update.category !== undefined) meetup.category = update.category;
    if (update.tags !== undefined) meetup.tags = update.tags;
    if (update.startsAt !== undefined) meetup.startsAt = update.startsAt;
    if ('endsAt' in update) meetup.endsAt = update.endsAt ?? undefined;
    if (update.accessMode !== undefined) meetup.accessMode = update.accessMode;
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
    if (!meetup.prohibitedServicesAttested) throw new Error('meetup_attestation_required');
    if (meetup.locationVisibility === 'public' && !meetup.publicLocationConfirmed) {
      throw new Error('meetup_public_location_confirmation_required');
    }
    meetup.status = 'published';
    meetup.updatedAt = new Date().toISOString();
    return this.detail(meetup);
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
      ...participation,
    });
  }

  async join(id: string): Promise<MeetupParticipation> {
    const meetup = this.record(id);
    const { capabilities } = this.states(meetup);
    if (!capabilities.canJoin) throw new Error(meetup.capacity === this.participantCount(meetup) ? 'meetup_full' : 'meetup_cannot_join');
    const participation: DemoParticipation = { status: 'joined', respondedAt: new Date().toISOString() };
    meetup.participations.set(this.viewerId, participation);
    return this.participationResult(meetup, participation);
  }

  async requestAccess(id: string): Promise<MeetupParticipation> {
    const meetup = this.record(id);
    if (!this.states(meetup).capabilities.canRequestAccess) throw new Error('meetup_cannot_request');
    const participation: DemoParticipation = { status: 'pending', requestedAt: new Date().toISOString() };
    meetup.participations.set(this.viewerId, participation);
    return this.participationResult(meetup, participation);
  }

  async cancelRequest(id: string) {
    const meetup = this.record(id);
    if (!this.states(meetup).capabilities.canCancelRequest) throw new Error('meetup_request_not_pending');
    meetup.participations.set(this.viewerId, { status: 'withdrawn', respondedAt: new Date().toISOString() });
  }

  async leave(id: string) {
    const meetup = this.record(id);
    if (!this.states(meetup).capabilities.canLeave) throw new Error('meetup_not_joined');
    meetup.participations.set(this.viewerId, { status: 'left', respondedAt: new Date().toISOString() });
  }

  async respond(id: string, profileId: string, approve: boolean): Promise<MeetupRequest> {
    const meetup = this.record(id);
    if (meetup.host.id !== this.viewerId) throw new Error('meetup_forbidden');
    const request = meetup.requests.get(profileId);
    if (!request || request.status !== 'pending') throw new Error('meetup_request_not_pending');
    if (approve && meetup.capacity !== null && this.participantCount(meetup) >= meetup.capacity) {
      throw new Error('meetup_full');
    }
    request.status = approve ? 'approved' : 'declined';
    request.respondedAt = new Date().toISOString();
    if (approve) meetup.baseParticipantCount += 1;
    return meetupRequestSchema.parse({ meetupId: meetup.id, ...request });
  }

  async removeParticipant(id: string, profileId: string) {
    const meetup = this.record(id);
    if (meetup.host.id !== this.viewerId) throw new Error('meetup_forbidden');
    const request = meetup.requests.get(profileId);
    if (request?.status === 'approved') meetup.baseParticipantCount = Math.max(0, meetup.baseParticipantCount - 1);
    if (request) {
      request.status = 'removed';
      request.respondedAt = new Date().toISOString();
    }
    if (profileId === this.viewerId) {
      meetup.participations.set(profileId, { status: 'removed', respondedAt: new Date().toISOString() });
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
    if (status === 'approved' && meetup.capacity !== null && this.participantCount(meetup) >= meetup.capacity) {
      throw new Error('meetup_full');
    }
    request.status = status;
    request.respondedAt = new Date().toISOString();
    if (status === 'approved') meetup.baseParticipantCount += 1;
    return meetupRequestSchema.parse({ meetupId: meetup.id, ...request });
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
