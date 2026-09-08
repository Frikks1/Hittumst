import { describe, expect, it } from 'vitest';
import type { MeetupSummary } from '@/types/domain';
import { initialCreateHittingurForm, primaryHittingurAction, toMeetupFeatureCollection, validateCreateStep } from './model';

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

describe('Hittingar UI behavior', () => {
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

  it('builds marker data only from the sanitized marker supplied by the API', () => {
    const item: MeetupSummary = {
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
