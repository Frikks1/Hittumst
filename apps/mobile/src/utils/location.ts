export const LOCATION_TTL_MS = 15 * 60 * 1000;
export const MAX_ACCEPTABLE_ACCURACY_METERS = 500;

export type LocalLocationResult = 'ok' | 'outside_iceland' | 'too_old' | 'poor_accuracy';

export type LocationFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: Date;
};

// Deliberately permissive client-side envelope including Iceland's inhabited offshore islands.
// The server owns the authoritative PostGIS boundary decision.
export function isPlausiblyInIceland(latitude: number, longitude: number): boolean {
  return latitude >= 63.15 && latitude <= 67.2 && longitude >= -25.0 && longitude <= -12.7;
}

export function isLocationFresh(verifiedAt: string | null, now = new Date()): boolean {
  if (!verifiedAt) return false;
  const timestamp = new Date(verifiedAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= now.getTime() && now.getTime() - timestamp < LOCATION_TTL_MS;
}

export function evaluateLocationFix(fix: LocationFix, now = new Date()): LocalLocationResult {
  const age = now.getTime() - fix.capturedAt.getTime();
  if (!Number.isFinite(age) || age < 0 || age > LOCATION_TTL_MS) return 'too_old';
  if (fix.accuracy === null || !Number.isFinite(fix.accuracy) || fix.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
    return 'poor_accuracy';
  }
  if (!isPlausiblyInIceland(fix.latitude, fix.longitude)) return 'outside_iceland';
  return 'ok';
}
