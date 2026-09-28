import { communityCoverSchema, communityFollowsSchema, communityReputationSchema, communityPastGatheringSchema } from './community';
import { discoveryExtensions, defaultDiscoveryExtensions } from './discovery';
import { z } from 'zod';
import { meetupEventProfileSchema } from './meetup-profile';
import { reportCategorySchema } from './reports';

const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).optional();

export const meetupCategories = [
  'coffee_food',
  'walk_outdoors',
  'party_social',
  'dating',
  'community',
  'private_adult',
  'other',
] as const;
export const meetupCategorySchema = z.enum(meetupCategories);
export type MeetupCategory = z.infer<typeof meetupCategorySchema>;

export const meetupIntentions = ['friends_social', 'dating', 'casual_adult', 'community', 'shared_activity'] as const;
export const meetupIntentionSchema = z.enum(meetupIntentions);
export type MeetupIntention = z.infer<typeof meetupIntentionSchema>;

export const meetupVenueModes = ['in_person', 'online', 'hybrid'] as const;
export const meetupVenueModeSchema = z.enum(meetupVenueModes);
export type MeetupVenueMode = z.infer<typeof meetupVenueModeSchema>;

export const meetupRsvpVisibilities = ['inherit', 'visible', 'private'] as const;
export const meetupRsvpVisibilitySchema = z.enum(meetupRsvpVisibilities);
export type MeetupRsvpVisibility = z.infer<typeof meetupRsvpVisibilitySchema>;

export const meetupAttendanceStates = [
  'not_required',
  'confirmation_pending',
  'confirmed',
  'expired',
  'completion_pending',
  'completed',
  'dismissed',
] as const;
export const meetupAttendanceStateSchema = z.enum(meetupAttendanceStates);
export type MeetupAttendanceState = z.infer<typeof meetupAttendanceStateSchema>;

export const meetupAttendanceOutcomes = ['attended', 'did_not_attend'] as const;
export const meetupAttendanceOutcomeSchema = z.enum(meetupAttendanceOutcomes);
export type MeetupAttendanceOutcome = z.infer<typeof meetupAttendanceOutcomeSchema>;

export const meetupOnlineAccessStateSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none') }).strict(),
  z.object({ state: z.literal('locked') }).strict(),
  z.object({
    state: z.literal('revealed'),
    url: z.url().refine((value) => /^https?:\/\//i.test(value), 'Online access must use HTTP(S)'),
    accessCode: optionalText(160),
    accessExpiresAt: z.iso.datetime({ offset: true }),
  }).strict(),
]);
export type MeetupOnlineAccessState = z.infer<typeof meetupOnlineAccessStateSchema>;

export const meetupRecurrenceFrequencies = ['daily', 'weekly', 'monthly'] as const;
export const meetupRecurrenceFrequencySchema = z.enum(meetupRecurrenceFrequencies);
export type MeetupRecurrenceFrequency = z.infer<typeof meetupRecurrenceFrequencySchema>;

const recurrenceDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const meetupMonthlyPatternSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('day_of_month'), day: z.number().int().min(1).max(31) }).strict(),
  z.object({
    kind: z.literal('nth_weekday'),
    weekday: z.number().int().min(0).max(6),
    ordinal: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]),
  }).strict(),
]);
export type MeetupMonthlyPattern = z.infer<typeof meetupMonthlyPatternSchema>;

export const meetupRecurrenceEndSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('count'), count: z.number().int().min(1).max(100) }).strict(),
  z.object({ kind: z.literal('date'), date: recurrenceDateSchema }).strict(),
]);
export type MeetupRecurrenceEnd = z.infer<typeof meetupRecurrenceEndSchema>;

export const meetupRecurrenceRuleSchema = z.object({
  frequency: meetupRecurrenceFrequencySchema,
  interval: z.number().int().min(1).max(30),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([])
    .refine((values) => new Set(values).size === values.length, 'Weekdays must be unique'),
  monthlyPattern: meetupMonthlyPatternSchema.optional(),
  skippedDates: z.array(recurrenceDateSchema).max(100).default([])
    .refine((values) => new Set(values).size === values.length, 'Skipped dates must be unique'),
  end: meetupRecurrenceEndSchema,
  timezone: z.literal('Atlantic/Reykjavik').default('Atlantic/Reykjavik'),
}).strict().superRefine((rule, context) => {
  if (rule.frequency === 'weekly' && rule.weekdays.length === 0) {
    context.addIssue({ code: 'custom', message: 'Weekly recurrence requires a weekday', path: ['weekdays'] });
  }
  if (rule.frequency === 'monthly' && !rule.monthlyPattern) {
    context.addIssue({ code: 'custom', message: 'Monthly recurrence requires a pattern', path: ['monthlyPattern'] });
  }
});
export type MeetupRecurrenceRule = z.infer<typeof meetupRecurrenceRuleSchema>;

export const meetupSeriesEditScopes = ['this_occurrence', 'this_and_future'] as const;
export const meetupSeriesEditScopeSchema = z.enum(meetupSeriesEditScopes);
export type MeetupSeriesEditScope = z.infer<typeof meetupSeriesEditScopeSchema>;

/** Stable, language-neutral identifiers for the controlled meetup tag catalog. */
export const meetupTags = [
  'coffee',
  'conversation',
  'walk',
  'outdoors',
  'games',
  'community',
  'quiet',
  'accessible',
  'sober',
  'newcomer_friendly',
  'dating',
  'dance',
  'food',
  'private',
  'adult_only',
] as const;
export const meetupTagSchema = z.enum(meetupTags);
export type MeetupTag = z.infer<typeof meetupTagSchema>;
export const meetupTagListSchema = z
  .array(meetupTagSchema)
  .max(12)
  .refine((tags) => new Set(tags).size === tags.length, {
    message: 'Meetup tags must be unique',
  });

export const meetupAccessModes = ['open', 'private'] as const;
export const meetupAccessModeSchema = z.enum(meetupAccessModes);
export type MeetupAccessMode = z.infer<typeof meetupAccessModeSchema>;

export const meetupLocationVisibilities = ['public', 'protected'] as const;
export const meetupLocationVisibilitySchema = z.enum(meetupLocationVisibilities);
export type MeetupLocationVisibility = z.infer<typeof meetupLocationVisibilitySchema>;

export const meetupReleasePolicies = ['immediate', '24_hours_before'] as const;
export const meetupReleasePolicySchema = z.enum(meetupReleasePolicies);
export type MeetupReleasePolicy = z.infer<typeof meetupReleasePolicySchema>;

export const meetupLocationStates = [
  'public',
  'protected_locked',
  'protected_revealed',
] as const;
export const meetupLocationStateNameSchema = z.enum(meetupLocationStates);
export type MeetupLocationStateName = z.infer<typeof meetupLocationStateNameSchema>;

export const meetupStatuses = ['draft', 'published', 'cancelled', 'moderation_hidden'] as const;
export const meetupStatusSchema = z.enum(meetupStatuses);
export type MeetupStatus = z.infer<typeof meetupStatusSchema>;

export function normalizeMeetupStatus(value: string): MeetupStatus | null {
  const canonical = meetupStatusSchema.safeParse(value);
  if (canonical.success) return canonical.data;
  if (value === 'ended') return 'published';
  if (value === 'removed') return 'moderation_hidden';
  return null;
}

export const meetupParticipationStatuses = [
  'host',
  'none',
  'joined',
  'pending',
  'approved',
  'declined',
  'removed',
  'left',
  'withdrawn',
] as const;
export const meetupParticipationStatusSchema = z.enum(meetupParticipationStatuses);
export type MeetupParticipationStatus = z.infer<typeof meetupParticipationStatusSchema>;

export const meetupRequestStatusSchema = z.enum(['pending', 'approved', 'declined']);
export type MeetupRequestStatus = z.infer<typeof meetupRequestStatusSchema>;

export const meetupRosterStatuses = [
  'joined',
  'pending',
  'approved',
  'declined',
  'withdrawn',
  'removed',
  'left',
] as const;
export const meetupRosterStatusSchema = z.enum(meetupRosterStatuses);
export type MeetupRosterStatus = z.infer<typeof meetupRosterStatusSchema>;

export const meetupReinstateStatusSchema = z.enum(['pending', 'approved']);
export type MeetupReinstateStatus = z.infer<typeof meetupReinstateStatusSchema>;

export const meetupRegions = ['capital', 'south', 'west', 'westfjords', 'north', 'east'] as const;
export const meetupRegionSchema = z.enum(meetupRegions);
export type MeetupRegion = z.infer<typeof meetupRegionSchema>;

const databaseRegionAliases: Readonly<Record<string, MeetupRegion>> = {
  hofudborgarsvaedid: 'capital',
  sudurland: 'south',
  vesturland: 'west',
  sudurnes: 'west',
  vestfirdir: 'westfjords',
  nordurland_vestra: 'north',
  nordurland_eystra: 'north',
  austurland: 'east',
};

export function normalizeMeetupRegion(value: string): MeetupRegion | null {
  const canonical = meetupRegionSchema.safeParse(value);
  if (canonical.success) return canonical.data;
  return databaseRegionAliases[value] ?? null;
}

export const meetupGeneralAreaIds = [
  'reykjavik',
  'vesturbaer',
  'kopavogur',
  'hafnarfjordur',
  'keflavik',
  'borgarnes',
  'isafjordur',
  'saudarkrokur',
  'akureyri',
  'egilsstadir',
  'selfoss',
  'vestmannaeyjar',
] as const;
export const meetupGeneralAreaIdSchema = z.enum(meetupGeneralAreaIds);
export type MeetupGeneralAreaId = z.infer<typeof meetupGeneralAreaIdSchema>;

export const meetupGeneralAreaSchema = z
  .object({
    id: meetupGeneralAreaIdSchema,
    labelIs: z.string().trim().min(1).max(120),
    labelEn: z.string().trim().min(1).max(120),
    region: meetupRegionSchema,
  })
  .strict();
export type MeetupGeneralArea = z.infer<typeof meetupGeneralAreaSchema>;

export const meetupTimingFilterSchema = z.enum(['all', 'today', 'weekend', 'future']);
export type MeetupTimingFilter = z.infer<typeof meetupTimingFilterSchema>;

export const geoCoordinateSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();
export type GeoCoordinate = z.infer<typeof geoCoordinateSchema>;

export const icelandCoordinateSchema = geoCoordinateSchema.refine(
  ({ latitude, longitude }) =>
    latitude >= 62.5 && latitude <= 67.5 && longitude >= -25.5 && longitude <= -12,
  { message: 'Coordinate must be within Iceland and its surrounding islands' },
);

export const meetupBoundsSchema = z
  .object({
    north: z.number().finite().min(-90).max(90),
    south: z.number().finite().min(-90).max(90),
    east: z.number().finite().min(-180).max(180),
    west: z.number().finite().min(-180).max(180),
  })
  .strict()
  .refine((bounds) => bounds.north > bounds.south, {
    message: 'North must be greater than south',
    path: ['north'],
  })
  .refine((bounds) => bounds.east > bounds.west, {
    message: 'East must be greater than west',
    path: ['east'],
  });
export type MeetupBounds = z.infer<typeof meetupBoundsSchema>;

export const meetupFiltersSchema = z
  .object({
    ...discoveryExtensions,
    timing: meetupTimingFilterSchema.default('all'),
    category: meetupCategorySchema.nullable().default(null),
    intention: meetupIntentionSchema.nullable().default(null),
    venueMode: meetupVenueModeSchema.nullable().default(null),
    accessMode: meetupAccessModeSchema.nullable().default(null),
    region: meetupRegionSchema.nullable().default(null),
    bounds: meetupBoundsSchema.nullable().default(null),
    includeExplicit: z.boolean().default(false),
  })
  .strict();
export type MeetupFilters = z.infer<typeof meetupFiltersSchema>;

export const defaultMeetupFilters: MeetupFilters = {
  ...defaultDiscoveryExtensions,
  timing: 'all',
  category: null,
  intention: null,
  venueMode: null,
  accessMode: null,
  region: null,
  bounds: null,
  includeExplicit: false,
};

export const safeMeetupPublicationDefaults = Object.freeze({
  accessMode: 'private' as const,
  locationVisibility: 'protected' as const,
  releasePolicy: '24_hours_before' as const,
});

export const MEETUP_FALLBACK_DURATION_MS = 12 * 60 * 60 * 1_000;
export const MEETUP_LOCATION_ACCESS_GRACE_MS = 2 * 60 * 60 * 1_000;
export const MEETUP_CONFIRMATION_REQUEST_MS = 24 * 60 * 60 * 1_000;
export const MEETUP_CONFIRMATION_EXPIRY_MS = 2 * 60 * 60 * 1_000;
export const MEETUP_ROOM_POST_GRACE_MS = 2 * 60 * 60 * 1_000;
export const MEETUP_ROOM_READ_GRACE_MS = 24 * 60 * 60 * 1_000;
export const MEETUP_RECURRENCE_MAX_OCCURRENCES = 100;
export const MEETUP_RECURRENCE_MAX_MONTHS = 12;

const REYKJAVIK_WEEKDAYS = {
  is: ['sun.', 'mán.', 'þri.', 'mið.', 'fim.', 'fös.', 'lau.'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
} as const;

const REYKJAVIK_MONTHS = {
  is: ['jan.', 'feb.', 'mar.', 'apr.', 'maí', 'jún.', 'júl.', 'ágú.', 'sep.', 'okt.', 'nóv.', 'des.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
} as const;

/**
 * Deterministic Reykjavík-local display used by native and web clients.
 * Iceland observes UTC year-round, so UTC date parts are Reykjavík-local
 * without relying on a device's optional ICU locale data.
 */
export function formatMeetupReykjavikDate(value: string, locale: 'is' | 'en'): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const weekday = REYKJAVIK_WEEKDAYS[locale][parsed.getUTCDay()];
  const month = REYKJAVIK_MONTHS[locale][parsed.getUTCMonth()];
  const day = parsed.getUTCDate();
  const hour = String(parsed.getUTCHours()).padStart(2, '0');
  const minute = String(parsed.getUTCMinutes()).padStart(2, '0');

  return locale === 'is'
    ? `${weekday}, ${day}. ${month}, ${hour}:${minute}`
    : `${weekday}, ${day} ${month}, ${hour}:${minute}`;
}

/** Server and demo fallback for a meetup without an explicit end time. */
export function calculateMeetupEffectiveEnd(startsAt: string, endsAt?: string | null): string {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) throw new TypeError('Invalid meetup start time');
  if (endsAt) {
    const end = Date.parse(endsAt);
    if (!Number.isFinite(end) || end <= start) throw new RangeError('Meetup end must be after start');
    return new Date(end).toISOString();
  }
  return new Date(start + MEETUP_FALLBACK_DURATION_MS).toISOString();
}

export function calculateMeetupLocationAccessExpiry(effectiveEnd: string): string {
  const end = Date.parse(effectiveEnd);
  if (!Number.isFinite(end)) throw new TypeError('Invalid meetup effective end time');
  return new Date(end + MEETUP_LOCATION_ACCESS_GRACE_MS).toISOString();
}

export function calculateMeetupReleaseAt(
  startsAt: string,
  releasePolicy: MeetupReleasePolicy,
  immediateAt: string,
): string {
  const start = Date.parse(startsAt);
  const immediate = Date.parse(immediateAt);
  if (!Number.isFinite(start) || !Number.isFinite(immediate)) throw new TypeError('Invalid meetup release time');
  return releasePolicy === '24_hours_before'
    ? new Date(start - 24 * 60 * 60 * 1_000).toISOString()
    : new Date(immediate).toISOString();
}

export function calculateMeetupLifecycle(startsAt: string, effectiveEnd: string) {
  const start = Date.parse(startsAt);
  const end = Date.parse(effectiveEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new RangeError('Invalid meetup lifecycle');
  }
  return {
    confirmationRequestsAt: new Date(start - MEETUP_CONFIRMATION_REQUEST_MS).toISOString(),
    unconfirmedExpiresAt: new Date(start - MEETUP_CONFIRMATION_EXPIRY_MS).toISOString(),
    completionOpensAt: new Date(end + MEETUP_ROOM_POST_GRACE_MS).toISOString(),
    postingClosesAt: new Date(end + MEETUP_ROOM_POST_GRACE_MS).toISOString(),
    readingClosesAt: new Date(end + MEETUP_ROOM_READ_GRACE_MS).toISOString(),
  };
}

function utcDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function lastUtcDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function recurrenceMatches(candidate: Date, start: Date, rule: MeetupRecurrenceRule): boolean {
  const dayMs = 86_400_000;
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const candidateDay = Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth(), candidate.getUTCDate());
  const days = Math.floor((candidateDay - startDay) / dayMs);
  if (rule.frequency === 'daily') return days % rule.interval === 0;
  if (rule.frequency === 'weekly') {
    return Math.floor(days / 7) % rule.interval === 0 && rule.weekdays.includes(candidate.getUTCDay());
  }
  const months =
    (candidate.getUTCFullYear() - start.getUTCFullYear()) * 12
    + candidate.getUTCMonth() - start.getUTCMonth();
  if (months % rule.interval !== 0 || !rule.monthlyPattern) return false;
  if (rule.monthlyPattern.kind === 'day_of_month') {
    const target = Math.min(
      rule.monthlyPattern.day,
      lastUtcDayOfMonth(candidate.getUTCFullYear(), candidate.getUTCMonth()),
    );
    return candidate.getUTCDate() === target;
  }
  if (candidate.getUTCDay() !== rule.monthlyPattern.weekday) return false;
  if (rule.monthlyPattern.ordinal === -1) {
    const nextWeek = new Date(candidate);
    nextWeek.setUTCDate(candidate.getUTCDate() + 7);
    return nextWeek.getUTCMonth() !== candidate.getUTCMonth();
  }
  return Math.ceil(candidate.getUTCDate() / 7) === rule.monthlyPattern.ordinal;
}

/**
 * Generates Reykjavík-local occurrence instants. Iceland is UTC year-round,
 * so UTC date arithmetic is deterministic and DST-free.
 */
export function generateMeetupOccurrences(
  startsAt: string,
  input: MeetupRecurrenceRule,
): string[] {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) throw new TypeError('Invalid recurrence start');
  const rule = meetupRecurrenceRuleSchema.parse(input);
  const hardEnd = new Date(start);
  hardEnd.setUTCMonth(hardEnd.getUTCMonth() + MEETUP_RECURRENCE_MAX_MONTHS);
  const requestedEnd = rule.end.kind === 'date'
    ? new Date(`${rule.end.date}T23:59:59.999Z`)
    : hardEnd;
  if (Number.isNaN(requestedEnd.getTime()) || requestedEnd < start) {
    throw new RangeError('Recurrence end must not precede the first occurrence');
  }
  if (requestedEnd > hardEnd) {
    throw new RangeError('Recurrence cannot exceed 12 months');
  }

  const desiredCount = rule.end.kind === 'count' ? rule.end.count : MEETUP_RECURRENCE_MAX_OCCURRENCES;
  const skipped = new Set(rule.skippedDates);
  const results: string[] = [];
  const candidate = new Date(start);
  while (
    candidate <= requestedEnd
    && candidate <= hardEnd
    && results.length < desiredCount
    && results.length < MEETUP_RECURRENCE_MAX_OCCURRENCES
  ) {
    if (recurrenceMatches(candidate, start, rule) && !skipped.has(utcDate(candidate))) {
      results.push(candidate.toISOString());
    }
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  if (results.length === 0) throw new RangeError('Recurrence must include at least one occurrence');
  if (rule.end.kind === 'count' && results.length !== rule.end.count) {
    throw new RangeError('Requested occurrence count does not fit within 12 months');
  }
  return results;
}

export const meetupMarkerSchema = geoCoordinateSchema.extend({
  isApproximate: z.boolean(),
});
export type MeetupMarker = z.infer<typeof meetupMarkerSchema>;

export const meetupExactLocationSchema = icelandCoordinateSchema.extend({
  venueName: optionalText(200),
  address: optionalText(300),
});
export type MeetupExactLocation = z.infer<typeof meetupExactLocationSchema>;

const publicMeetupLocationSchema = z
  .object({
    state: z.literal('public'),
    generalAreaId: meetupGeneralAreaIdSchema,
    marker: meetupMarkerSchema.extend({ isApproximate: z.literal(false) }),
    exactLocation: meetupExactLocationSchema,
    arrivalInstructions: optionalText(1_000),
  })
  .strict();

const protectedLockedMeetupLocationSchema = z
  .object({
    state: z.literal('protected_locked'),
    generalAreaId: meetupGeneralAreaIdSchema,
    marker: meetupMarkerSchema.extend({ isApproximate: z.literal(true) }),
    releaseAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const protectedRevealedMeetupLocationSchema = z
  .object({
    state: z.literal('protected_revealed'),
    generalAreaId: meetupGeneralAreaIdSchema,
    marker: meetupMarkerSchema.extend({ isApproximate: z.literal(false) }),
    exactLocation: meetupExactLocationSchema,
    arrivalInstructions: optionalText(1_000),
    accessExpiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

/** A response-safe union: locked locations structurally cannot contain exact data. */
export const meetupLocationStateSchema = z.discriminatedUnion('state', [
  publicMeetupLocationSchema,
  protectedLockedMeetupLocationSchema,
  protectedRevealedMeetupLocationSchema,
]);
export type MeetupLocationState = z.infer<typeof meetupLocationStateSchema>;

export const meetupViewerStateSchema = z
  .object({
    participationStatus: meetupParticipationStatusSchema,
    hasProtectedLocationAccess: z.boolean(),
    rsvpVisibility: meetupRsvpVisibilitySchema.default('inherit'),
    attendanceState: meetupAttendanceStateSchema.default('not_required'),
    confirmationDeadlineAt: z.iso.datetime({ offset: true }).optional(),
    attendanceOutcome: meetupAttendanceOutcomeSchema.optional(),
    historyVisibility: meetupRsvpVisibilitySchema.exclude(['inherit']).default('private'),
  })
  .strict();
export type MeetupViewerState = z.infer<typeof meetupViewerStateSchema>;

/**
 * Authorization decisions come from the server. UI code must consume these
 * flags and must not recreate them from access mode or participation status.
 */
export const meetupViewerCapabilitiesSchema = z
  .object({
    canViewExactLocation: z.boolean(),
    canViewArrivalInstructions: z.boolean(),
    canJoin: z.boolean(),
    canRequestAccess: z.boolean(),
    canCancelRequest: z.boolean(),
    canLeave: z.boolean(),
    canEdit: z.boolean(),
    canManageRequests: z.boolean(),
    canRemoveParticipants: z.boolean(),
    canCancel: z.boolean(),
    canDeleteDraft: z.boolean(),
    canReport: z.boolean(),
    canBlockHost: z.boolean(),
    canViewRoster: z.boolean().default(false),
    canViewRoom: z.boolean().default(false),
    canSendRoomMessage: z.boolean().default(false),
    canConfirmAttendance: z.boolean().default(false),
    canCompleteAttendance: z.boolean().default(false),
  })
  .strict();
export type MeetupViewerCapabilities = z.infer<typeof meetupViewerCapabilitiesSchema>;

export const meetupHostSchema = z
  .object({
    id: z.string().min(1).max(128),
    displayName: z.string().trim().min(1).max(80),
    avatarUrl: z.url().optional(),
  })
  .strict();
export type MeetupHost = z.infer<typeof meetupHostSchema>;

export const meetupPoolSummarySchema = z.object({
  hostBps: z.number().int().min(0).max(10_000),
  locked: z.boolean(),
  total: z.number().int().nonnegative(),
  fundedTotal: z.number().int().nonnegative(),
  paidTotal: z.number().int().nonnegative(),
  refundedTotal: z.number().int().nonnegative(),
  status: z.enum(['accepting', 'locked', 'awaiting_settlement', 'paid_out', 'refunded']),
  estimatedParticipantReward: z.number().int().nonnegative().nullable(),
  eligibleParticipantCount: z.number().int().nonnegative(),
}).strict();
export type MeetupPoolSummary = z.infer<typeof meetupPoolSummarySchema>;
export type MeetupSponsorship = {
  quoteId: string;
  amount: number;
  expectedHostBps: number;
  requestId: string;
};

const meetupSummaryShape = {
  id: z.uuid(),
  title: z.string().trim().min(3).max(100),
  category: meetupCategorySchema,
  intention: meetupIntentionSchema.default('friends_social'),
  venueMode: meetupVenueModeSchema.default('in_person'),
  seriesId: z.uuid().nullable().default(null),
  occurrenceIndex: z.number().int().min(1).nullable().default(null),
  tags: meetupTagListSchema,
    eventProfile: meetupEventProfileSchema.optional(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).optional(),
  effectiveEnd: z.iso.datetime({ offset: true }),
  generalAreaId: meetupGeneralAreaIdSchema,
  generalArea: meetupGeneralAreaSchema,
  host: meetupHostSchema,
  accessMode: meetupAccessModeSchema,
  locationVisibility: meetupLocationVisibilitySchema,
  releasePolicy: meetupReleasePolicySchema,
  participantCount: z.number().int().nonnegative(),
  reservedPlaces: z.number().int().nonnegative().optional(),
  // Older servers may omit pool data; missing does not mean an empty pool.
  pool: meetupPoolSummarySchema.optional(),
  cover: communityCoverSchema.nullable().optional(),
  follows: communityFollowsSchema.optional(),
  capacity: z.number().int().min(1).max(1_000).nullable(),
  isFull: z.boolean(),
  isExplicit: z.boolean(),
  rsvpVisibility: meetupRsvpVisibilitySchema.default('inherit'),
  onlineAccess: meetupOnlineAccessStateSchema.default({ state: 'none' }),
  status: meetupStatusSchema,
  location: meetupLocationStateSchema,
  viewerState: meetupViewerStateSchema,
  diagnosisRestricted: z.boolean().default(false),
  requiresDiagnosisVerification: z.boolean().default(false),
  capabilities: meetupViewerCapabilitiesSchema,
} as const;

function validateMeetupResponseChronology(
  value: { startsAt: string; endsAt?: string; effectiveEnd: string },
  context: z.core.$RefinementCtx,
) {
  const start = Date.parse(value.startsAt);
  const effectiveEnd = Date.parse(value.effectiveEnd);
  if (effectiveEnd <= start) {
    context.addIssue({ code: 'custom', message: 'Effective end must be after start', path: ['effectiveEnd'] });
  }
  if (value.endsAt && Date.parse(value.endsAt) !== effectiveEnd) {
    context.addIssue({ code: 'custom', message: 'Effective end must equal an explicit end time', path: ['effectiveEnd'] });
  }
}

function validateMeetupResponseConsistency(
  value: {
    generalAreaId: MeetupGeneralAreaId;
    generalArea: MeetupGeneralArea;
    locationVisibility: MeetupLocationVisibility;
    releasePolicy: MeetupReleasePolicy;
    location: MeetupLocationState;
    capabilities: MeetupViewerCapabilities;
  },
  context: z.core.$RefinementCtx,
) {
  if (value.generalArea.id !== value.generalAreaId || value.location.generalAreaId !== value.generalAreaId) {
    context.addIssue({ code: 'custom', message: 'General-area identifiers must agree', path: ['generalAreaId'] });
  }
  if (value.locationVisibility === 'public' && value.location.state !== 'public') {
    context.addIssue({ code: 'custom', message: 'Public visibility requires a public location', path: ['location'] });
  }
  if (value.locationVisibility === 'protected' && value.location.state === 'public') {
    context.addIssue({ code: 'custom', message: 'Protected visibility cannot expose a public location', path: ['location'] });
  }
  if (value.locationVisibility === 'public' && value.releasePolicy !== 'immediate') {
    context.addIssue({ code: 'custom', message: 'Public locations must release immediately', path: ['releasePolicy'] });
  }
  const locationIsExact = value.location.state !== 'protected_locked';
  if (value.capabilities.canViewExactLocation !== locationIsExact) {
    context.addIssue({ code: 'custom', message: 'Exact-location capability must match the location state', path: ['capabilities', 'canViewExactLocation'] });
  }
}

export const meetupSummarySchema = z
  .object(meetupSummaryShape)
  .strict()
  .superRefine(validateMeetupResponseChronology)
  .superRefine(validateMeetupResponseConsistency);
export type MeetupSummary = z.infer<typeof meetupSummarySchema>;

export const meetupDetailSchema = z
  .object({
    ...meetupSummaryShape,
    description: z.string().trim().min(10).max(4_000),
    recurrence: meetupRecurrenceRuleSchema.nullable().default(null),
    createdAt: z.iso.datetime({ offset: true }).optional(),
    updatedAt: z.iso.datetime({ offset: true }).optional(),
    cancelledAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine(validateMeetupResponseChronology)
  .superRefine(validateMeetupResponseConsistency);
export type MeetupDetail = z.infer<typeof meetupDetailSchema>;

const meetupDraftInputObjectSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().min(10).max(4_000),
    category: meetupCategorySchema,
    intention: meetupIntentionSchema.default('friends_social'),
    venueMode: meetupVenueModeSchema.default('in_person'),
    tags: meetupTagListSchema,
    eventProfile: meetupEventProfileSchema.optional(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }).nullable().optional(),
    accessMode: meetupAccessModeSchema,
    locationVisibility: meetupLocationVisibilitySchema,
    releasePolicy: meetupReleasePolicySchema,
    generalAreaId: meetupGeneralAreaIdSchema,
    capacity: z.number().int().min(1).max(1_000).nullable().optional(),
    isExplicit: z.boolean(),
    rsvpVisibility: meetupRsvpVisibilitySchema.default('inherit'),
    onlineUrl: z.url().refine((value) => /^https?:\/\//i.test(value), 'Online access must use HTTP(S)').optional(),
    onlineAccessCode: optionalText(160),
    recurrence: meetupRecurrenceRuleSchema.nullable().default(null),
    prohibitedServicesAttested: z.boolean(),
    publicLocationConfirmed: z.boolean(),
    latitude: icelandCoordinateSchema.shape.latitude,
    longitude: icelandCoordinateSchema.shape.longitude,
    venueName: optionalText(200),
    address: optionalText(300),
    arrivalInstructions: optionalText(1_000),
  })
  .strict();

export const meetupDraftInputSchema = meetupDraftInputObjectSchema
  .refine(
    (draft) =>
      !draft.endsAt || new Date(draft.endsAt).getTime() > new Date(draft.startsAt).getTime(),
    { message: 'End time must be after start time', path: ['endsAt'] },
  )
  .refine(
    (draft) =>
      icelandCoordinateSchema.safeParse({
        latitude: draft.latitude,
        longitude: draft.longitude,
      }).success,
    { message: 'Meetup location must be within Iceland', path: ['latitude'] },
  )
  .refine(
    (draft) => draft.locationVisibility !== 'public' || draft.releasePolicy === 'immediate',
    { message: 'Public locations must release immediately', path: ['releasePolicy'] },
  )
  .refine(
    (draft) => draft.category !== 'private_adult' || draft.isExplicit,
    { message: 'Private adult meetups must be marked explicit', path: ['isExplicit'] },
  )
  .refine(
    (draft) => draft.intention !== 'casual_adult' || draft.isExplicit,
    { message: 'Casual-adult intention must be marked explicit', path: ['isExplicit'] },
  )
  .refine(
    (draft) => draft.category !== 'private_adult' || draft.intention === 'casual_adult',
    { message: 'Private-adult category requires casual-adult intention', path: ['intention'] },
  )
  .refine(
    (draft) => draft.venueMode === 'in_person' || Boolean(draft.onlineUrl),
    { message: 'Online and hybrid meetups require protected online access', path: ['onlineUrl'] },
  );
export type MeetupDraftInput = z.infer<typeof meetupDraftInputSchema>;

const meetupUpdateInputObjectSchema = meetupDraftInputObjectSchema
  .partial()
  .extend({
    intention: meetupIntentionSchema.optional(),
    venueMode: meetupVenueModeSchema.optional(),
    rsvpVisibility: meetupRsvpVisibilitySchema.optional(),
    recurrence: meetupRecurrenceRuleSchema.nullable().optional(),
    venueName: optionalText(200).nullable(),
    address: optionalText(300).nullable(),
    arrivalInstructions: optionalText(1_000).nullable(),
    onlineUrl: z.url().refine((value) => /^https?:\/\//i.test(value), 'Online access must use HTTP(S)').nullable().optional(),
    onlineAccessCode: optionalText(160).nullable(),
  });

export const meetupUpdateInputSchema = meetupUpdateInputObjectSchema
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one field must be supplied',
  })
  .refine(
    (input) =>
      !input.startsAt ||
      !input.endsAt ||
      new Date(input.endsAt).getTime() > new Date(input.startsAt).getTime(),
    { message: 'End time must be after start time', path: ['endsAt'] },
  )
  .refine(
    (input) => (input.latitude === undefined) === (input.longitude === undefined),
    { message: 'Latitude and longitude must be updated together', path: ['latitude'] },
  )
  .refine(
    (input) =>
      input.latitude === undefined ||
      icelandCoordinateSchema.safeParse({ latitude: input.latitude, longitude: input.longitude }).success,
    { message: 'Meetup location must be within Iceland', path: ['latitude'] },
  )
  .refine(
    (input) => input.locationVisibility !== 'public' || input.releasePolicy === 'immediate',
    { message: 'Switching to a public location requires immediate release', path: ['releasePolicy'] },
  )
  .refine(
    (input) => input.category !== 'private_adult' || input.isExplicit === true,
    { message: 'Switching to the private adult category requires explicit content', path: ['isExplicit'] },
  )
  .refine(
    (input) => input.intention !== 'casual_adult' || input.isExplicit === true,
    { message: 'Switching to casual-adult intention requires explicit content', path: ['isExplicit'] },
  );
export type MeetupUpdateInput = z.infer<typeof meetupUpdateInputSchema>;

export const meetupParticipantProfileSchema = z
  .object({
    id: z.string().min(1).max(128),
    displayName: z.string().trim().min(1).max(80),
    avatarUrl: z.url().optional(),
  })
  .strict();
export type MeetupParticipantProfile = z.infer<typeof meetupParticipantProfileSchema>;

export const meetupParticipationSchema = z
  .object({
    meetupId: z.uuid(),
    profileId: z.string().min(1).max(128),
    status: meetupParticipationStatusSchema.exclude(['host', 'none']),
    requestedAt: z.iso.datetime({ offset: true }).optional(),
    respondedAt: z.iso.datetime({ offset: true }).optional(),
    rsvpVisibility: meetupRsvpVisibilitySchema.default('inherit'),
    attendanceState: meetupAttendanceStateSchema.default('not_required'),
    attendanceOutcome: meetupAttendanceOutcomeSchema.optional(),
  })
  .strict();
export type MeetupParticipation = z.infer<typeof meetupParticipationSchema>;

export const meetupRequestSchema = z
  .object({
    meetupId: z.uuid(),
    profile: meetupParticipantProfileSchema,
    status: meetupRequestStatusSchema,
    requestedAt: z.iso.datetime({ offset: true }),
    respondedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
export type MeetupRequest = z.infer<typeof meetupRequestSchema>;

export const meetupRosterEntrySchema = z
  .object({
    meetupId: z.uuid(),
    profile: meetupParticipantProfileSchema,
    status: meetupRosterStatusSchema,
    requestedAt: z.iso.datetime({ offset: true }).optional(),
    respondedAt: z.iso.datetime({ offset: true }).optional(),
    rsvpVisibility: meetupRsvpVisibilitySchema.default('inherit'),
    attendanceState: meetupAttendanceStateSchema.default('not_required'),
  })
  .strict();
export type MeetupRosterEntry = z.infer<typeof meetupRosterEntrySchema>;

export const meetupCursorPageSchema = <T extends z.ZodType>(item: T) => z.object({
  items: z.array(item),
  nextCursor: z.string().nullable(),
}).strict();

export const meetupProfileHistoryItemSchema = z.object({
  meetupId: z.uuid(),
  title: z.string().trim().min(1).max(100),
  startsAt: z.iso.datetime({ offset: true }),
  intention: meetupIntentionSchema,
  venueMode: meetupVenueModeSchema,
  attendanceOutcome: z.literal('attended'),
  visibility: meetupRsvpVisibilitySchema.exclude(['inherit']),
}).strict();
export type MeetupProfileHistoryItem = z.infer<typeof meetupProfileHistoryItemSchema>;

export const meetupProfileUpcomingItemSchema = z.object({
  meetupId: z.uuid(),
  title: z.string().trim().min(1).max(100),
  startsAt: z.iso.datetime({ offset: true }),
  intention: meetupIntentionSchema,
  venueMode: meetupVenueModeSchema,
  visibility: meetupRsvpVisibilitySchema.exclude(['inherit']),
}).strict();
export type MeetupProfileUpcomingItem = z.infer<typeof meetupProfileUpcomingItemSchema>;

export const meetupRoomSummarySchema = z.object({
  id: z.uuid(),
  meetupId: z.uuid(),
  postingClosesAt: z.iso.datetime({ offset: true }),
  readingClosesAt: z.iso.datetime({ offset: true }),
  isPaused: z.boolean(),
  canPost: z.boolean(),
  unreadCount: z.number().int().nonnegative().default(0),
}).strict();
export type MeetupRoomSummary = z.infer<typeof meetupRoomSummarySchema>;

export const meetupRoomMessageKinds = ['text', 'system'] as const;
export const meetupRoomMessageKindSchema = z.enum(meetupRoomMessageKinds);
export type MeetupRoomMessageKind = z.infer<typeof meetupRoomMessageKindSchema>;

export const meetupRoomMessageSchema = z.object({
  id: z.uuid(),
  roomId: z.uuid(),
  sender: meetupParticipantProfileSchema.nullable(),
  kind: meetupRoomMessageKindSchema,
  body: z.string().trim().min(1).max(2_000),
  linkHostnames: z.array(z.string().trim().min(1).max(253)).max(10).default([]),
  createdAt: z.iso.datetime({ offset: true }),
  hiddenAt: z.iso.datetime({ offset: true }).optional(),
}).strict();
export type MeetupRoomMessage = z.infer<typeof meetupRoomMessageSchema>;

export const meetupRoomMessagePageSchema = meetupCursorPageSchema(meetupRoomMessageSchema);
export type MeetupRoomMessagePage = z.infer<typeof meetupRoomMessagePageSchema>;

export const meetupPublicRosterPageSchema = meetupCursorPageSchema(meetupRosterEntrySchema);
export type MeetupPublicRosterPage = z.infer<typeof meetupPublicRosterPageSchema>;

export const meetupProfileHistoryPageSchema = meetupCursorPageSchema(meetupProfileHistoryItemSchema);
export type MeetupProfileHistoryPage = z.infer<typeof meetupProfileHistoryPageSchema>;

export const meetupProfileUpcomingPageSchema = meetupCursorPageSchema(meetupProfileUpcomingItemSchema);
export type MeetupProfileUpcomingPage = z.infer<typeof meetupProfileUpcomingPageSchema>;

export const meetupConflictActions = ['reinstate_both', 'remove_blocker', 'remove_blocked', 'remove_both'] as const;
export const meetupConflictActionSchema = z.enum(meetupConflictActions);
export type MeetupConflictAction = z.infer<typeof meetupConflictActionSchema>;

export function extractSafeHttpLinks(body: string): Array<{ url: string; hostname: string }> {
  const matches = body.match(/https?:\/\/[^\s<>{}"']+/gi) ?? [];
  return matches.flatMap((candidate) => {
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
        ? [{ url: parsed.toString(), hostname: parsed.hostname }]
        : [];
    } catch {
      return [];
    }
  });
}

export const meetupNotificationKinds = [
  'community_published',
  'community_announcement',
  'community_waitlist_offer',
  'community_reminder',
  'request_received',
  'access_requested',
  'joined',
  'request_approved',
  'request_declined',
  'material_change',
  'cancelled',
  'participant_removed',
  'participant_reinstated',
  'moderated',
  'starts_soon',
] as const;
export const meetupNotificationKindSchema = z.enum(meetupNotificationKinds);
export type MeetupNotificationKind = z.infer<typeof meetupNotificationKindSchema>;

const databaseNotificationKindAliases: Readonly<Record<string, MeetupNotificationKind>> = {
  meetup_request_received: 'request_received',
  meetup_access_requested: 'access_requested',
  meetup_joined: 'joined',
  meetup_request_approved: 'request_approved',
  meetup_access_approved: 'request_approved',
  meetup_request_declined: 'request_declined',
  meetup_access_declined: 'request_declined',
  meetup_material_change: 'material_change',
  meetup_materially_changed: 'material_change',
  meetup_cancelled: 'cancelled',
  meetup_participant_removed: 'participant_removed',
  meetup_participant_reinstated: 'participant_reinstated',
  meetup_moderated: 'moderated',
  meetup_starts_soon: 'starts_soon',
};

export function normalizeMeetupNotificationKind(value: string): MeetupNotificationKind | null {
  const canonical = meetupNotificationKindSchema.safeParse(value);
  if (canonical.success) return canonical.data;
  return databaseNotificationKindAliases[value] ?? null;
}

export const meetupNotificationSchema = z
  .object({
    id: z.uuid(),
    meetupId: z.uuid(),
    kind: meetupNotificationKindSchema,
    meetupTitle: z.string().trim().min(1).max(100),
    actor: meetupParticipantProfileSchema.optional(),
    createdAt: z.iso.datetime({ offset: true }),
    readAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
export type MeetupNotification = z.infer<typeof meetupNotificationSchema>;

export const pushPlatformSchema = z.enum(['ios', 'android']);
export type PushPlatform = z.infer<typeof pushPlatformSchema>;

export const expoPushTokenSchema = z.string().trim().min(8).max(512);

export const pushTokenRegistrationSchema = z
  .object({
    expoPushToken: expoPushTokenSchema,
    platform: pushPlatformSchema,
    locale: z.enum(['is', 'en']),
  })
  .strict();
export type PushTokenRegistration = z.infer<typeof pushTokenRegistrationSchema>;

export const meetupPlaceKinds = [
  'venue',
  'address',
  'neighbourhood',
  'locality',
  'road',
  'region',
  'other',
] as const;
export const meetupPlaceKindSchema = z.enum(meetupPlaceKinds);
export type MeetupPlaceKind = z.infer<typeof meetupPlaceKindSchema>;

export const meetupPlaceResultSchema = z
  .object({
    id: z.string().min(1).max(240),
    provider: z.enum(['maptiler', 'demo']),
    name: z.string().trim().min(1).max(160),
    fullAddress: optionalText(300),
    generalArea: z.string().trim().min(1).max(160),
    generalAreaId: meetupGeneralAreaIdSchema.optional(),
    kind: meetupPlaceKindSchema,
    coordinate: icelandCoordinateSchema,
  })
  .strict();
export type MeetupPlaceResult = z.infer<typeof meetupPlaceResultSchema>;

export const meetupPlaceSearchOptionsSchema = z
  .object({
    locale: z.enum(['is', 'en']).default('is'),
    proximity: icelandCoordinateSchema.optional(),
    limit: z.number().int().min(1).max(10).default(6),
  })
  .strict();
export type MeetupPlaceSearchOptions = z.input<typeof meetupPlaceSearchOptionsSchema>;

export const meetupPlaceQuerySchema = z.string().trim().min(2).max(120);

export const meetupReportInputSchema = z
  .object({
    category: reportCategorySchema,
    details: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();
export type MeetupReportInput = z.infer<typeof meetupReportInputSchema>;

// Icelandic product-language aliases. Runtime schemas remain single-source.
export type HittingurCategory = MeetupCategory;
export type HittingurFilters = MeetupFilters;
export type HittingurMapItem = MeetupSummary;
export type HittingurDetail = MeetupDetail;
export type HittingurDraft = MeetupDraftInput;
export type HittingurParticipation = MeetupParticipation;
export type HittingurNotification = MeetupNotification;
export type HittingurPlaceResult = MeetupPlaceResult;

export const communityHostSummarySchema = z.object({
  hostId: z.string(), displayName: z.string(), profileVisible: z.boolean(), followerCount: z.number().int().nonnegative(),
  following: z.boolean().default(false), notifications: z.boolean().default(true),
  reputation: communityReputationSchema, pastGatherings: z.array(communityPastGatheringSchema), upcomingGatherings: z.array(meetupSummarySchema),
});
export type CommunityHostSummary = z.infer<typeof communityHostSummarySchema>;
