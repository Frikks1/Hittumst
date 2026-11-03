import type { MeetupDetail } from '@/types/domain';

function escapeText(value: string) { return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
function timestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('invalid_event_date');
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
function fold(line: string) {
  const lines: string[] = [];
  let current = ''; let bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) { lines.push(current); current = ' '; bytes = 1; }
    current += char; bytes += size;
  }
  lines.push(current); return lines.join('\r\n');
}

/** Protected addresses and meeting links never leave the app in a calendar export. */
export function createMeetupCalendar(detail: MeetupDetail, now = new Date()): string {
  if (detail.status !== 'published') throw new Error('event_unavailable');
  const location = detail.location.state === 'public' && detail.capabilities.canViewExactLocation
    ? [detail.location.exactLocation.venueName, detail.location.exactLocation.address].filter(Boolean).join(', ')
    : detail.generalArea.labelEn;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hittumst//Hittingar//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${detail.id}@hittumst`, `DTSTAMP:${timestamp(now.toISOString())}`,
    `DTSTART:${timestamp(detail.startsAt)}`, `DTEND:${timestamp(detail.effectiveEnd)}`,
    `SUMMARY:${escapeText(detail.title)}`, `LOCATION:${escapeText(location)}`,
    'DESCRIPTION:Open Hittumst for current attendance and venue access.', 'END:VEVENT', 'END:VCALENDAR']
    .map(fold).join('\r\n') + '\r\n';
}

/** Call with a freshly fetched detail to recheck protected-location authorization. */
export function meetupDirectionsUrl(detail: MeetupDetail, now = new Date()): string | null {
  if (detail.status !== 'published' || detail.venueMode === 'online' || !detail.capabilities.canViewExactLocation) return null;
  const location = detail.location;
  if (location.state !== 'public' && location.state !== 'protected_revealed') return null;
  if (location.state === 'protected_revealed' && Date.parse(location.accessExpiresAt) <= now.getTime()) return null;
  const { latitude, longitude } = location.exactLocation;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${latitude},${longitude}`)}`;
}
