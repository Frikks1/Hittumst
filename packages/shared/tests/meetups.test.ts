import { describe, expect, it } from 'vitest';
import {
  calculateMeetupEffectiveEnd,
  calculateMeetupLocationAccessExpiry,
  calculateMeetupLifecycle,
  defaultMeetupFilters,
  expoPushTokenSchema,
  extractSafeHttpLinks,
  formatMeetupReykjavikDate,
  generateMeetupOccurrences,
  meetupDraftInputSchema,
  meetupLocationStateSchema,
  meetupParticipationStatusSchema,
  meetupPlaceResultSchema,
  meetupProfileHistoryPageSchema,
  meetupProfileUpcomingPageSchema,
  meetupSummarySchema,
  meetupUpdateInputSchema,
  normalizeMeetupNotificationKind,
  safeMeetupPublicationDefaults,
} from '../src/meetups';

const coordinate = { latitude: 64.1466, longitude: -21.9426 };

describe('Hittingar contracts', () => {
  it('makes protected locked locations structurally incapable of carrying exact coordinates', () => {
    const locked = {
      state: 'protected_locked',
      generalAreaId: 'vesturbaer',
      marker: { ...coordinate, isApproximate: true },
      releaseAt: '2026-09-11T20:00:00.000Z',
      exactLocation: coordinate,
    };

    expect(meetupLocationStateSchema.safeParse(locked).success).toBe(false);
    expect(
      meetupLocationStateSchema.safeParse({
        state: 'protected_locked',
        generalAreaId: 'vesturbaer',
        marker: { ...coordinate, isApproximate: true },
        releaseAt: '2026-09-11T20:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('requires exact, non-approximate data for public and revealed locations', () => {
    expect(
      meetupLocationStateSchema.safeParse({
        state: 'public',
        generalAreaId: 'reykjavik',
        marker: { ...coordinate, isApproximate: false },
        exactLocation: { ...coordinate, venueName: 'Kaffihús' },
      }).success,
    ).toBe(true);
    expect(
      meetupLocationStateSchema.safeParse({
        state: 'protected_revealed',
        generalAreaId: 'vesturbaer',
        marker: { ...coordinate, isApproximate: true },
        exactLocation: coordinate,
        accessExpiresAt: '2026-09-13T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('validates Iceland coordinates, event order, and non-empty updates', () => {
    const draft = {
      title: 'Kvöldkaffi',
      description: 'Rólegt spjall og kaffi fyrir fullorðna.',
      category: 'coffee_food',
      tags: ['coffee'],
      startsAt: '2026-09-12T20:00:00.000Z',
      endsAt: '2026-09-12T19:00:00.000Z',
      accessMode: 'open',
      locationVisibility: 'public',
      releasePolicy: 'immediate',
      generalAreaId: 'reykjavik',
      capacity: 12,
      isExplicit: false,
      prohibitedServicesAttested: true,
      publicLocationConfirmed: true,
      ...coordinate,
    };

    expect(meetupDraftInputSchema.safeParse(draft).success).toBe(false);
    expect(meetupDraftInputSchema.safeParse({ ...draft, endsAt: null }).success).toBe(true);
    expect(meetupDraftInputSchema.safeParse({ ...draft, endsAt: null, latitude: 55 }).success).toBe(
      false,
    );
    expect(meetupUpdateInputSchema.safeParse({}).success).toBe(false);
    expect(meetupUpdateInputSchema.safeParse({ capacity: null }).success).toBe(true);
    expect(meetupDraftInputSchema.safeParse({ ...draft, endsAt: null, tags: ['rólegt'] }).success).toBe(false);
    expect(meetupDraftInputSchema.safeParse({ ...draft, endsAt: null, tags: ['quiet', 'quiet'] }).success).toBe(false);
  });

  it('rejects responses that omit server-authored capabilities', () => {
    const result = meetupSummarySchema.safeParse({
      id: '16f31dcf-8a0a-4cd9-8c2a-7e3162942310',
      title: 'Göngutúr',
      category: 'walk_outdoors',
      tags: ['walk'],
      startsAt: '2026-09-12T18:00:00.000Z',
      effectiveEnd: '2026-09-13T06:00:00.000Z',
      generalAreaId: 'reykjavik',
      generalArea: { id: 'reykjavik', labelIs: 'Reykjavík', labelEn: 'Reykjavík', region: 'capital' },
      host: { id: 'host', displayName: 'Ari' },
      accessMode: 'open',
      locationVisibility: 'public',
      releasePolicy: 'immediate',
      participantCount: 2,
      capacity: null,
      isFull: false,
      isExplicit: false,
      status: 'published',
      location: {
        state: 'public',
        generalAreaId: 'reykjavik',
        marker: { ...coordinate, isApproximate: false },
        exactLocation: coordinate,
      },
      viewerState: { participationStatus: 'none', hasProtectedLocationAccess: false },
    });

    expect(result.success).toBe(false);
  });

  it('defaults to privacy-preserving filters', () => {
    expect(defaultMeetupFilters.includeExplicit).toBe(false);
    expect(defaultMeetupFilters.bounds).toBeNull();
    expect(safeMeetupPublicationDefaults).toEqual({
      accessMode: 'private',
      locationVisibility: 'protected',
      releasePolicy: '24_hours_before',
    });
  });

  it('uses a 12-hour effective-end fallback and a two-hour location grace period', () => {
    const effectiveEnd = calculateMeetupEffectiveEnd('2026-09-12T18:00:00.000Z');
    expect(effectiveEnd).toBe('2026-09-13T06:00:00.000Z');
    expect(calculateMeetupLocationAccessExpiry(effectiveEnd)).toBe('2026-09-13T08:00:00.000Z');
  });

  it('formats Reykjavík-local dates consistently without device locale data', () => {
    const value = '2026-09-02T01:32:00.000Z';
    expect(formatMeetupReykjavikDate(value, 'is')).toBe('mið., 2. sep., 01:32');
    expect(formatMeetupReykjavikDate(value, 'en')).toBe('Wed, 2 Sep, 01:32');
    expect(formatMeetupReykjavikDate('invalid', 'is')).toBe('invalid');
  });

  it('normalizes database notification kinds and supports request withdrawal', () => {
    expect(normalizeMeetupNotificationKind('meetup_access_requested')).toBe('access_requested');
    expect(normalizeMeetupNotificationKind('meetup_materially_changed')).toBe('material_change');
    expect(normalizeMeetupNotificationKind('meetup_moderated')).toBe('moderated');
    expect(normalizeMeetupNotificationKind('meetup_participant_reinstated')).toBe(
      'participant_reinstated',
    );
    expect(meetupParticipationStatusSchema.parse('withdrawn')).toBe('withdrawn');
  });

  it('keeps provider address text truly optional', () => {
    expect(
      meetupPlaceResultSchema.safeParse({
        id: 'demo:akureyri',
        provider: 'demo',
        name: 'Akureyri',
        generalArea: 'Akureyri',
        generalAreaId: 'akureyri',
        kind: 'locality',
        coordinate: { latitude: 65.6885, longitude: -18.1262 },
      }).success,
    ).toBe(true);
  });

  it('validates push registrations at the shared service boundary', () => {
    expect(expoPushTokenSchema.parse('ExponentPushToken[demo-device-token]')).toBe(
      'ExponentPushToken[demo-device-token]',
    );
    expect(expoPushTokenSchema.safeParse('short').success).toBe(false);
  });

  it('generates bounded Reykjavík recurrence dates', () => {
    expect(generateMeetupOccurrences('2026-09-07T20:00:00.000Z', {
      frequency: 'weekly',
      interval: 1,
      weekdays: [1, 3],
      skippedDates: ['2026-09-09'],
      end: { kind: 'count', count: 4 },
      timezone: 'Atlantic/Reykjavik',
    })).toEqual([
      '2026-09-07T20:00:00.000Z',
      '2026-09-14T20:00:00.000Z',
      '2026-09-16T20:00:00.000Z',
      '2026-09-21T20:00:00.000Z',
    ]);
    expect(() => generateMeetupOccurrences('2026-09-07T20:00:00.000Z', {
      frequency: 'daily',
      interval: 30,
      weekdays: [],
      skippedDates: [],
      end: { kind: 'count', count: 100 },
      timezone: 'Atlantic/Reykjavik',
    })).toThrow('12 months');
  });

  it('calculates confirmation and room deadlines from occurrence times', () => {
    expect(calculateMeetupLifecycle(
      '2026-09-12T18:00:00.000Z',
      '2026-09-12T21:00:00.000Z',
    )).toEqual({
      confirmationRequestsAt: '2026-09-11T18:00:00.000Z',
      unconfirmedExpiresAt: '2026-09-12T16:00:00.000Z',
      completionOpensAt: '2026-09-12T23:00:00.000Z',
      postingClosesAt: '2026-09-12T23:00:00.000Z',
      readingClosesAt: '2026-09-13T21:00:00.000Z',
    });
  });

  it('extracts HTTP(S) destinations without creating link previews', () => {
    expect(extractSafeHttpLinks('Join https://meet.example.is/a and ftp://unsafe.test')).toEqual([
      { url: 'https://meet.example.is/a', hostname: 'meet.example.is' },
    ]);
  });

  it('keeps public profile meetup activity limited to explicit visible response shapes', () => {
    expect(meetupProfileUpcomingPageSchema.safeParse({
      items: [{ meetupId: '7baf2892-3bbc-4c91-9f80-0f97bd398f26', title: 'Kaffi', startsAt: '2026-10-01T18:00:00.000Z', intention: 'friends_social', venueMode: 'in_person', visibility: 'visible' }],
      nextCursor: null,
    }).success).toBe(true);
    expect(meetupProfileUpcomingPageSchema.safeParse({
      items: [{ meetupId: '7baf2892-3bbc-4c91-9f80-0f97bd398f26', title: 'Kaffi', startsAt: '2026-10-01T18:00:00.000Z', intention: 'friends_social', venueMode: 'in_person', visibility: 'inherit' }],
      nextCursor: null,
    }).success).toBe(false);
    expect(meetupProfileHistoryPageSchema.safeParse({
      items: [{ meetupId: '7baf2892-3bbc-4c91-9f80-0f97bd398f26', title: 'Kaffi', startsAt: '2026-09-01T18:00:00.000Z', intention: 'friends_social', venueMode: 'in_person', attendanceOutcome: 'did_not_attend', visibility: 'visible' }],
      nextCursor: null,
    }).success).toBe(false);
  });

  it('requires explicit content for casual-adult intentions and online access for online events', () => {
    const base = {
      title: 'Kvöldhittingur',
      description: 'Skýr lýsing fyrir fullorðna þátttakendur.',
      category: 'dating',
      tags: ['dating'],
      startsAt: '2026-09-12T20:00:00.000Z',
      endsAt: null,
      accessMode: 'private',
      locationVisibility: 'protected',
      releasePolicy: '24_hours_before',
      generalAreaId: 'reykjavik',
      capacity: 12,
      prohibitedServicesAttested: true,
      publicLocationConfirmed: false,
      ...coordinate,
    };
    expect(meetupDraftInputSchema.safeParse({
      ...base,
      intention: 'casual_adult',
      venueMode: 'in_person',
      isExplicit: false,
    }).success).toBe(false);
    expect(meetupDraftInputSchema.safeParse({
      ...base,
      intention: 'dating',
      venueMode: 'online',
      isExplicit: false,
    }).success).toBe(false);
    expect(meetupDraftInputSchema.safeParse({
      ...base,
      intention: 'dating',
      venueMode: 'online',
      onlineUrl: 'https://meet.example.is/room',
      isExplicit: false,
    }).success).toBe(true);
  });
});
