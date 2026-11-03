import { describe, expect, it } from 'vitest';
import type { MeetupSummary } from '@/types/domain';
import { initialCreateHittingurForm, meetupFeeLabel, primaryHittingurAction, toMeetupFeatureCollection, validateCreateHittingur, validateCreateStep, type CreateHittingurForm } from './model';

const baseItem: Pick<MeetupSummary, 'isFull' | 'status' | 'viewerState' | 'capabilities'> = {
  isFull: false,
  status: 'published',
  viewerState: { participationStatus: 'none', hasProtectedLocationAccess: false, rsvpVisibility: 'inherit', attendanceState: 'not_required', historyVisibility: 'private' },
  capabilities: {
    canViewExactLocation: false, canViewArrivalInstructions: false, canJoin: true,
    canRequestAccess: false, canCancelRequest: false, canLeave: false, canEdit: false,
    canManageRequests: false, canRemoveParticipants: false, canCancel: false,
    canDeleteDraft: false, canReport: true, canBlockHost: true,
    canViewRoster: true, canViewRoom: false, canSendRoomMessage: false,
    canConfirmAttendance: false, canCompleteAttendance: false,
  },
};

const creationNow = Date.parse('2026-10-14T12:00:00Z');
const completeForm = (overrides: Partial<CreateHittingurForm> = {}): CreateHittingurForm => ({
  ...initialCreateHittingurForm,
  title: 'Kvöldkaffi',
  description: 'Kaffi og spjall á fimmtudagskvöldi.',
  startDate: '2026-10-15',
  startTime: '18:30',
  generalAreaId: 'reykjavik',
  latitude: 64.1466,
  longitude: -21.9426,
  prohibitedServicesAttested: true,
  ...overrides,
});

describe('Hittingar UI behavior', () => {
  it('uses whole ISK fee labels and preserves legacy foreign-currency labels', () => {
    expect(meetupFeeLabel({ feeIsk: 0 }, 'en')).toBe('Free');
    expect(meetupFeeLabel({ feeIsk: 0 }, 'is')).toBe('Ókeypis');
    expect(meetupFeeLabel({ feeIsk: 1500 }, 'en')).toBe('1,500 kr.');
    expect(meetupFeeLabel({ admissionMode: 'paid', priceMinor: 450, currency: 'EUR' }, 'en')).toBe('€4.50');
  });

  it.each(['-1', '1.5', '1e3', '2147483648'])('rejects invalid whole-ISK fee %s', feeIsk => {
    expect(validateCreateHittingur(completeForm({ feeIsk }))).toContain('hittingar.create.error.fee');
  });

  it('accepts free and whole-ISK participation fees', () => {
    expect(validateCreateHittingur(completeForm({ feeIsk: '0' }))).toEqual([]);
    expect(validateCreateHittingur(completeForm({ feeIsk: '1500' }))).toEqual([]);
  });
  it('chooses an action from server capabilities and participation state', () => {
    expect(primaryHittingurAction(baseItem).kind).toBe('join');
    expect(primaryHittingurAction({ ...baseItem, capabilities: { ...baseItem.capabilities, canJoin: false, canRequestAccess: true } }).kind).toBe('request');
    expect(primaryHittingurAction({ ...baseItem, capabilities: { ...baseItem.capabilities, canJoin: false, canLeave: true } }).kind).toBe('leave');
    expect(primaryHittingurAction({ ...baseItem, isFull: true, capabilities: { ...baseItem.capabilities, canJoin: false } }).disabled).toBe(true);
  });

  it('defaults sensitive locations to private access and a 24-hour release', () => {
    expect(initialCreateHittingurForm.locationVisibility).toBe('protected');
    expect(initialCreateHittingurForm.accessMode).toBe('private');
    expect(initialCreateHittingurForm.releasePolicy).toBe('24_hours_before');
    expect(initialCreateHittingurForm.prohibitedServicesAttested).toBe(false);
  });

  it('requires the prohibited-services attestation before publication', () => {
    expect(validateCreateStep(3, initialCreateHittingurForm)).toContain(
      'hittingar.create.error.attestation',
    );
    expect(
      validateCreateStep(3, {
        ...initialCreateHittingurForm,
        prohibitedServicesAttested: true,
      }),
    ).not.toContain('hittingar.create.error.attestation');
  });

  it('requires explicit confirmation before publishing a public location', () => {
    const errors = validateCreateStep(2, {
      ...initialCreateHittingurForm,
      generalAreaId: 'reykjavik', latitude: 64.1466, longitude: -21.9426,
      locationVisibility: 'public', publicLocationConfirmed: false,
    });
    expect(errors).toContain('hittingar.create.error.publicConfirm');
  });

  it('accepts the four-field form with its publication acknowledgement and safe defaults', () => {
    const form = completeForm();
    expect(validateCreateHittingur(form, { publishing: true, now: creationNow })).toEqual([]);
    expect(form.eventProfile.joinMode).toBe('request');
    expect(form.locationVisibility).toBe('protected');
    expect(form.releasePolicy).toBe('24_hours_before');
    expect(form.endDate).toBe('');
    expect(form.endTime).toBe('');
    expect(form.capacity).toBe('');
    expect(form.recurring).toBe(false);
  });

  it.each([
    [{ title: '  ' }, 'hittingar.create.error.title'],
    [{ title: 'ab' }, 'hittingar.create.error.title'],
    [{ description: '  ' }, 'hittingar.create.error.description'],
    [{ description: 'Too short' }, 'hittingar.create.error.description'],
    [{ startDate: '' }, 'hittingar.create.error.start'],
    [{ startTime: '' }, 'hittingar.create.error.start'],
    [{ generalAreaId: null }, 'hittingar.create.error.location'],
    [{ latitude: null }, 'hittingar.create.error.location'],
    [{ longitude: null }, 'hittingar.create.error.location'],
    [{ latitude: 51.5, longitude: -0.1 }, 'hittingar.create.error.location'],
    [{ latitude: Number.NaN }, 'hittingar.create.error.location'],
    [{ prohibitedServicesAttested: false }, 'hittingar.create.error.attestation'],
  ] satisfies [Partial<CreateHittingurForm>, string][])(
    'blocks incomplete or invalid creation fields (%o)',
    (overrides, error) => {
      expect(validateCreateHittingur(completeForm(overrides), { publishing: true, now: creationNow })).toContain(error);
    },
  );

  it('validates trimmed name and about lengths against the API bounds', () => {
    expect(validateCreateHittingur(completeForm({ title: `  ${'a'.repeat(100)}  `, description: `  ${'a'.repeat(4_000)}  ` }))).toEqual([]);
    expect(validateCreateHittingur(completeForm({ title: 'a'.repeat(101) }))).toContain('hittingar.create.error.title');
    expect(validateCreateHittingur(completeForm({ description: 'a'.repeat(4_001) }))).toContain('hittingar.create.error.description');
  });

  it.each([
    { startDate: '2026-02-30' },
    { startDate: '2026-13-01' },
    { startTime: '24:00' },
    { startTime: '18:60' },
  ])('blocks impossible date and time values (%o)', overrides => {
    expect(validateCreateHittingur(completeForm(overrides))).toContain('hittingar.create.error.start');
  });

  it('requires a future start for publication and permits valid past times when saving or editing', () => {
    const atNow = completeForm({ startDate: '2026-10-14', startTime: '12:00' });
    const past = completeForm({ startDate: '2026-10-13' });
    expect(validateCreateHittingur(atNow, { publishing: true, now: creationNow })).toContain('hittingar.create.error.start');
    expect(validateCreateHittingur(past, { publishing: true, now: creationNow })).toContain('hittingar.create.error.start');
    expect(validateCreateHittingur(past, { publishing: false, now: creationNow })).toEqual([]);
    expect(validateCreateHittingur(past)).toEqual([]);
    expect(validateCreateHittingur(atNow, { publishing: true, now: creationNow - 1 })).toEqual([]);
  });

  it('reports a shared invalid field only once when composing all creation checks', () => {
    const form = completeForm({ eventProfile: { ...initialCreateHittingurForm.eventProfile, minAge: 17 } });
    expect(validateCreateHittingur(form)).toEqual(['hittingar.create.error.eventProfile']);
  });

  it('builds marker data only from the sanitized marker supplied by the API', () => {
    const item: MeetupSummary = { diagnosisRestricted:false, requiresDiagnosisVerification:false,
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Kaffi',
      category: 'coffee_food',
      intention: 'friends_social',
      venueMode: 'in_person',
      seriesId: null,
      occurrenceIndex: null,
      rsvpVisibility: 'inherit',
      onlineAccess: { state: 'none' },
      tags: [],
      startsAt: '2026-09-01T12:00:00Z',
      effectiveEnd: '2026-09-02T00:00:00Z',
      generalAreaId: 'reykjavik',
      generalArea: { id: 'reykjavik', labelIs: 'Reykjavík', labelEn: 'Reykjavik', region: 'capital' },
      host: { id: 'host', displayName: 'Alex' },
      accessMode: 'private',
      locationVisibility: 'protected',
      releasePolicy: '24_hours_before',
      participantCount: 2,
      capacity: null,
      isFull: false,
      isExplicit: false,
      status: 'published',
      location: {
        state: 'protected_locked',
        generalAreaId: 'reykjavik',
        marker: { latitude: 64.15, longitude: -21.94, isApproximate: true },
        releaseAt: '2026-08-31T12:00:00Z',
      },
      viewerState: baseItem.viewerState,
      capabilities: baseItem.capabilities,
    };
    const collection = toMeetupFeatureCollection([item]);
    expect(collection.features[0]?.geometry.coordinates).toEqual([-21.94, 64.15]);
    expect(collection.features[0]?.properties?.approximate).toBe(true);
  });
});
