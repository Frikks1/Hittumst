import type { StraxCreateInput } from '@rummal/shared';

export type StraxForm = {
  title: string;
  description: string;
  locationText: string;
  address: string;
  requirements: string;
  capacity: string;
  joinMode: 'application' | 'open';
  venueMode: 'in_person' | 'online';
};
export const initialStraxForm: StraxForm = {
  title: '',
  description: '',
  locationText: '',
  address: '',
  requirements: '',
  capacity: '',
  joinMode: 'application',
  venueMode: 'in_person',
};
export function straxInput(form: StraxForm): StraxCreateInput | null {
  const capacity = form.capacity.trim();
  if (
    !form.title.trim() ||
    !form.description.trim() ||
    (capacity && (!/^\d+$/.test(capacity) || Number(capacity) < 1 || Number(capacity) > 50))
  )
    return null;
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    requirements: form.requirements.trim() || null,
    locationText: form.locationText.trim() || null,
    address: form.venueMode === 'online' ? null : form.address.trim() || null,
    spacesNeeded: capacity ? Number(capacity) : null,
    joinMode: form.joinMode,
    venueMode: form.venueMode,
  };
}
export function straxIsActive(item: { status: string; expiresAt: string }, now: number) {
  return item.status === 'active' && Date.parse(item.expiresAt) > now;
}
export function straxMinutesLeft(expiresAt: string, now: number) {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
}
export type StraxClockAnchor = { server: number; monotonic: number };
export function straxAnchoredNow(
  anchor: StraxClockAnchor | null,
  monotonic: number,
  fallback = Date.now(),
) {
  return anchor ? anchor.server + Math.max(0, monotonic - anchor.monotonic) : fallback;
}
