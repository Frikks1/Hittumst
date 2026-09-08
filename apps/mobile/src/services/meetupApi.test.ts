import { describe, expect, it, vi } from 'vitest';
import {
  defaultMeetupFilters,
  safeMeetupPublicationDefaults,
  type MeetupDraftInput,
} from '@/types/domain';
import { MockRummalApi } from './mockApi';

vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

describe('MockRummalApi Hittingar', () => {
  it('never exposes protected exact coordinates before access and reveals immediate locations after join', async () => {
    const api = new MockRummalApi();
    const meetups = await api.discoverMeetups(defaultMeetupFilters);
    const walk = meetups.find((meetup) => meetup.category === 'walk_outdoors');

    expect(walk?.location.state).toBe('protected_locked');
    if (walk?.location.state !== 'protected_locked') throw new Error('Expected protected location');
    expect(walk.location.releaseAt).toBeTruthy();
    expect('exactLocation' in walk.location).toBe(false);

    await api.joinMeetup(walk.id);
    const joined = await api.getMeetup(walk.id);
    expect(joined.location.state).toBe('protected_revealed');
    if (joined.location.state !== 'protected_revealed') throw new Error('Expected revealed location');
    expect(joined.location.exactLocation.latitude).toBeGreaterThan(65);
    expect(joined.location.accessExpiresAt).toBeTruthy();
  });

  it('keeps adult meetups unavailable even when legacy preferences and filters are supplied', async () => {
    const api = new MockRummalApi();
    expect((await api.discoverMeetups(defaultMeetupFilters)).some((item) => item.isExplicit)).toBe(false);

    await api.setAdultContentPreference(true);
    const visible = await api.discoverMeetups({ ...defaultMeetupFilters, includeExplicit: true });
    expect(visible.some(item => item.isExplicit || item.category === 'private_adult' || item.intention === 'casual_adult')).toBe(false);
  });

  it('supports host request decisions, terminal removal, and explicit reinstatement', async () => {
    const api = new MockRummalApi();
    const [mine] = await api.listMyMeetups();
    const [request] = await api.listMeetupRequests(mine!.id);

    expect(request?.status).toBe('pending');
    expect((await api.respondToMeetupRequest(mine!.id, request!.profile.id, false)).status).toBe('declined');
    expect((await api.reinstateMeetupParticipant(mine!.id, request!.profile.id, 'approved')).status).toBe('approved');
    await api.removeMeetupParticipant(mine!.id, request!.profile.id);
    expect((await api.reinstateMeetupParticipant(mine!.id, request!.profile.id, 'pending')).status).toBe('pending');
  });

  it('creates a safe draft, publishes it, and accepts capacity one', async () => {
    const api = new MockRummalApi();
    const startsAt = new Date(Date.now() + 86_400_000).toISOString();
    const input: MeetupDraftInput = {
      title: 'Lítill hittingur',
      description: 'Rólegur og öruggur hittingur fyrir fullorðna.',
      category: 'community',
      intention: 'community',
      venueMode: 'in_person',
      tags: [],
      startsAt,
      endsAt: null,
      ...safeMeetupPublicationDefaults,
      generalAreaId: 'reykjavik',
      capacity: 1,
      isExplicit: false,
      rsvpVisibility: 'inherit',
      recurrence: null,
      prohibitedServicesAttested: true,
      publicLocationConfirmed: false,
      latitude: 64.1466,
      longitude: -21.9426,
    };
    const id = await api.createMeetupDraft(input);

    const draft = await api.getMeetup(id);
    expect(draft.status).toBe('draft');
    expect(Date.parse(draft.effectiveEnd) - Date.parse(startsAt)).toBe(12 * 60 * 60 * 1_000);
    expect((await api.publishMeetup(id)).status).toBe('published');
    await api.cancelMeetup(id);
    expect((await api.getMeetup(id)).status).toBe('cancelled');
    expect((await api.getMeetup(id)).location.state).toBe('protected_locked');

    const unattestedId = await api.createMeetupDraft({
      ...input,
      title: 'Óstaðfest drög',
      prohibitedServicesAttested: false,
    });
    await expect(api.publishMeetup(unattestedId)).rejects.toThrow('meetup_attestation_required');

    const unconfirmedPublicId = await api.createMeetupDraft({
      ...input,
      title: 'Opin óstaðfest drög',
      accessMode: 'open',
      locationVisibility: 'public',
      releasePolicy: 'immediate',
      publicLocationConfirmed: false,
    });
    await expect(api.publishMeetup(unconfirmedPublicId)).rejects.toThrow(
      'meetup_public_location_confirmation_required',
    );
  });

  it('provides seeded local place search and notifications', async () => {
    const api = new MockRummalApi();
    const [place] = await api.searchMeetupPlaces('Akureyri');
    expect(place?.generalAreaId).toBeUndefined();
    expect(place?.coordinate.latitude).toBeCloseTo(65.6885);

    const [notification] = await api.listMeetupNotifications();
    expect(notification?.readAt).toBeUndefined();
    await api.markMeetupNotificationRead(notification!.id);
    expect((await api.listMeetupNotifications())[0]?.readAt).toBeTruthy();
  });

  it('keeps push-token registration local in demo mode', async () => {
    const api = new MockRummalApi();
    const token = 'ExponentPushToken[demo-device-token]';
    await expect(api.registerPushToken(token, 'ios', 'is')).resolves.toBeUndefined();
    await expect(api.unregisterPushToken(token)).resolves.toBeUndefined();
    await expect(api.registerPushToken('short', 'ios', 'is')).rejects.toThrow();
  });
});
