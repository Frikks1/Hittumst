import type { TranslationKey } from '@/i18n/translations';
import {
  meetupTags,
  type MeetupTag,
  MeetupCategory,
  MeetupGeneralAreaId,
  MeetupIntention,
  MeetupVenueMode,
  MeetupRsvpVisibility,
  MeetupSummary,
} from '@/types/domain';

export type HittingurListModel = MeetupSummary;

export const HITTINGUR_CATEGORIES = [
  'coffee_food',
  'walk_outdoors',
  'party_social',
  'dating',
  'community',
  'other',
] as const satisfies readonly MeetupCategory[];

export const HITTINGUR_TAGS = meetupTags;
export const HITTINGUR_INTENTIONS = ['friends_social', 'dating', 'community', 'shared_activity'] as const satisfies readonly MeetupIntention[];
export const HITTINGUR_VENUE_MODES = ['in_person', 'online', 'hybrid'] as const satisfies readonly MeetupVenueMode[];

export const HITTINGUR_GENERAL_AREAS = [
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
] as const satisfies readonly MeetupGeneralAreaId[];

export type CreateHittingurForm = {
  title: string;
  description: string;
  category: MeetupCategory;
  intention: MeetupIntention;
  venueMode: MeetupVenueMode;
  tags: MeetupTag[];
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  generalAreaId: MeetupGeneralAreaId | null;
  venueName: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  arrivalInstructions: string;
  accessMode: 'open' | 'private';
  locationVisibility: 'public' | 'protected';
  capacity: string;
  isExplicit: boolean;
  releasePolicy: 'immediate' | '24_hours_before';
  publicLocationConfirmed: boolean;
  prohibitedServicesAttested: boolean;
  rsvpVisibility: MeetupRsvpVisibility;
  onlineUrl: string;
  onlineAccessCode: string;
  recurring: boolean;
  recurrenceFrequency: 'daily' | 'weekly' | 'monthly';
  recurrenceInterval: string;
  recurrenceWeekdays: number[];
  recurrenceEndType: 'count' | 'date';
  recurrenceCount: string;
  recurrenceEndDate: string;
};

export const ICELAND_BOUNDS = [-25, 63.15, -12.7, 67.2] as const;

export const initialCreateHittingurForm: CreateHittingurForm = {
  title: '',
  description: '',
  category: 'coffee_food',
  intention: 'friends_social',
  venueMode: 'in_person',
  tags: [],
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  generalAreaId: null,
  venueName: '',
  address: '',
  latitude: null,
  longitude: null,
  arrivalInstructions: '',
  accessMode: 'private',
  locationVisibility: 'protected',
  capacity: '',
  isExplicit: false,
  releasePolicy: '24_hours_before',
  publicLocationConfirmed: false,
  prohibitedServicesAttested: false,
  rsvpVisibility: 'inherit',
  onlineUrl: '',
  onlineAccessCode: '',
  recurring: false,
  recurrenceFrequency: 'weekly',
  recurrenceInterval: '1',
  recurrenceWeekdays: [],
  recurrenceEndType: 'count',
  recurrenceCount: '4',
  recurrenceEndDate: '',
};

export function categoryKey(category: MeetupCategory): TranslationKey {
  return `hittingar.category.${category}`;
}

export function tagKey(tag: MeetupTag): TranslationKey {
  return `hittingar.tag.${tag}`;
}

export function generalAreaKey(area: MeetupGeneralAreaId): TranslationKey {
  return `hittingar.area.${area}`;
}

export function generalAreaLabel(item: Pick<MeetupSummary, 'generalArea'>, locale: 'is' | 'en'): string {
  return locale === 'is' ? item.generalArea.labelIs : item.generalArea.labelEn;
}

export function participationKey(status: string | null | undefined): TranslationKey | null {
  if (!status || status === 'none') return null;
  const supported = ['joined', 'pending', 'approved', 'declined', 'removed', 'left', 'host'] as const;
  const normalized = supported.find((value) => value === status);
  return normalized ? `hittingar.participation.${normalized}` : null;
}

export type HittingurAction = {
  kind: 'join' | 'request' | 'cancel_request' | 'leave' | 'manage' | 'disabled';
  labelKey: TranslationKey;
  disabled: boolean;
};

export function primaryHittingurAction(
  item: Pick<HittingurListModel, 'isFull' | 'status' | 'viewerState' | 'capabilities'>,
): HittingurAction {
  if (item.status === 'cancelled' || item.status === 'moderation_hidden') {
    return { kind: 'disabled', labelKey: 'hittingar.action.unavailable', disabled: true };
  }
  if (item.capabilities.canEdit) return { kind: 'manage', labelKey: 'hittingar.action.manage', disabled: false };
  if (item.capabilities.canLeave) return { kind: 'leave', labelKey: 'hittingar.action.leave', disabled: false };
  if (item.capabilities.canCancelRequest) return { kind: 'cancel_request', labelKey: 'hittingar.action.cancelRequest', disabled: false };
  if (item.capabilities.canJoin) return { kind: 'join', labelKey: 'hittingar.action.join', disabled: false };
  if (item.capabilities.canRequestAccess) return { kind: 'request', labelKey: 'hittingar.action.request', disabled: false };
  if (item.viewerState.participationStatus === 'pending') return { kind: 'disabled', labelKey: 'hittingar.action.pending', disabled: true };
  if (item.viewerState.participationStatus === 'declined') return { kind: 'disabled', labelKey: 'hittingar.action.declined', disabled: true };
  if (item.viewerState.participationStatus === 'removed') return { kind: 'disabled', labelKey: 'hittingar.action.removed', disabled: true };
  if (item.isFull) return { kind: 'disabled', labelKey: 'hittingar.action.full', disabled: true };
  return { kind: 'disabled', labelKey: 'hittingar.action.unavailable', disabled: true };
}

/** Iceland uses UTC year-round, so a Reykjavík wall-clock value can be encoded directly as Z. */
export function reykjavikLocalToUtc(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const value = new Date(`${date}T${time}:00.000Z`);
  if (Number.isNaN(value.getTime())) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (
    value.getUTCFullYear() !== year
    || value.getUTCMonth() + 1 !== month
    || value.getUTCDate() !== day
    || value.getUTCHours() !== hour
    || value.getUTCMinutes() !== minute
  ) return null;
  return value.toISOString();
}

export function utcToReykjavikFields(value: string | undefined): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: '', time: '' };
  return { date: parsed.toISOString().slice(0, 10), time: parsed.toISOString().slice(11, 16) };
}

export function validateCreateStep(step: number, form: CreateHittingurForm): TranslationKey[] {
  const errors: TranslationKey[] = [];
  if (step === 0) {
    if (form.title.trim().length < 3) errors.push('hittingar.create.error.title');
    if (form.description.trim().length < 10) errors.push('hittingar.create.error.description');
    if (form.category === 'private_adult' && !form.isExplicit) errors.push('hittingar.create.error.adultCategory');
    if (form.intention === 'casual_adult' && !form.isExplicit) errors.push('hittingar.create.error.adultCategory');
  }
  if (step === 1) {
    const start = reykjavikLocalToUtc(form.startDate, form.startTime);
    const hasEnd = Boolean(form.endDate || form.endTime);
    const end = hasEnd ? reykjavikLocalToUtc(form.endDate, form.endTime) : null;
    if (!start) errors.push('hittingar.create.error.start');
    if (hasEnd && (!end || !start || Date.parse(end) <= Date.parse(start))) errors.push('hittingar.create.error.end');
    if (form.recurring) {
      const interval = Number(form.recurrenceInterval);
      const count = Number(form.recurrenceCount);
      if (!Number.isInteger(interval) || interval < 1 || interval > 30) errors.push('hittingar.create.error.recurrence');
      if (form.recurrenceFrequency === 'weekly' && form.recurrenceWeekdays.length === 0) errors.push('hittingar.create.error.recurrence');
      if (form.recurrenceEndType === 'count' && (!Number.isInteger(count) || count < 1 || count > 100)) errors.push('hittingar.create.error.recurrence');
      if (form.recurrenceEndType === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(form.recurrenceEndDate)) errors.push('hittingar.create.error.recurrence');
    }
  }
  if (step === 2) {
    if (form.venueMode !== 'online' && (!form.generalAreaId || form.latitude === null || form.longitude === null)) {
      errors.push('hittingar.create.error.location');
    }
    if (form.venueMode !== 'in_person' && !/^https?:\/\//i.test(form.onlineUrl.trim())) errors.push('hittingar.create.error.onlineUrl');
    if (form.locationVisibility === 'public' && !form.publicLocationConfirmed) {
      errors.push('hittingar.create.error.publicConfirm');
    }
  }
  if (step === 3) {
    if (!form.prohibitedServicesAttested) {
      errors.push('hittingar.create.error.attestation');
    }
    if (form.capacity) {
      const capacity = Number(form.capacity);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 1_000) {
        errors.push('hittingar.create.error.capacity');
      }
    }
  }
  return errors;
}

export function toMeetupFeatureCollection(items: HittingurListModel[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: items.map((item) => ({
      type: 'Feature',
      id: item.id,
      geometry: { type: 'Point', coordinates: [item.location.marker.longitude, item.location.marker.latitude] },
      properties: {
        id: item.id,
        approximate: item.location.marker.isApproximate,
        explicit: item.isExplicit,
      },
    })),
  };
}
