import { describe, expect, it, vi } from 'vitest';
import { DemoMeetupService } from '@/services/meetupDemo';
import { createMeetupCalendar, meetupDirectionsUrl } from './meetupCalendar';
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
const now = new Date('2026-10-10T12:00:00Z');
const walk = '9f433726-18df-41bd-96a1-e9ec1b503a02';

describe('event calendar and directions privacy', () => {
  it('exports valid UTC event dates and a public venue', async () => {
    const detail = await new DemoMeetupService(now).get('6b7d4dc6-640b-4d10-8f0f-e45778159a01');
    const calendar = createMeetupCalendar(detail, now);
    expect(calendar).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0');
    expect(calendar).toContain('DTSTART:20261011T140000Z');
    expect(calendar).toContain('LOCATION:Harpa\\, Austurbakki 2\\, 101 Reykjavík');
    expect(calendar).not.toContain('Hittumst við aðalinnganginn.');
    expect(meetupDirectionsUrl(detail)).toContain('destination=64.1505%2C-21.9326');
  });
  it('keeps protected addresses, coordinates, instructions and meeting credentials out of exports even after admission', async () => {
    const service = new DemoMeetupService(now);
    await service.join(walk);
    const detail = await service.get(walk);
    expect(detail.location.state).toBe('protected_revealed');
    const calendar = createMeetupCalendar(detail, now);
    expect(calendar).toContain('LOCATION:Akureyri');
    expect(calendar).not.toContain('65.6829');
    expect(calendar).not.toContain('Upphaf gönguleiðar');
    expect(calendar).not.toContain('Nákvæmur');
    expect(meetupDirectionsUrl(detail, now)).not.toBeNull();
    expect(meetupDirectionsUrl(detail, new Date('2027-01-01'))).toBeNull();
  });
  it('denies directions for locked locations and departed members', async () => {
    const service = new DemoMeetupService(now);
    expect(meetupDirectionsUrl(await service.get(walk), now)).toBeNull();
    await service.join(walk);
    await service.leave(walk);
    expect(meetupDirectionsUrl(await service.get(walk), now)).toBeNull();
  });
  it('escapes injected iCalendar properties and folds long Unicode titles by UTF-8 byte count', async () => {
    const detail = await new DemoMeetupService(now).get(walk);
    const calendar = createMeetupCalendar({ ...detail, title: 'Á'.repeat(60) + '\nATTENDEE:attacker;test,yes\\no\rURL:https://example.test' }, now);
    expect(calendar).not.toContain('\r\nATTENDEE:');
    expect(calendar.replace(/\r\n /g, '')).toContain('\\nATTENDEE:attacker\\;test\\,yes\\\\no');
    expect(calendar.replace(/\r\n /g, '')).toContain('\\nURL:https://example.test');
    expect(calendar).not.toContain('\rURL:');
    expect(calendar.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });
});
