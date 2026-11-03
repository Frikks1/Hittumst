import { describe, expect, it } from 'vitest';
import { defaultNotificationPreferences, isNotificationQuiet, notificationPreferenceUpdateSchema } from './notificationPreferences';

describe('notification preferences', () => {
  it('handles overnight quiet hours and exact boundaries', () => {
    const prefs = { ...defaultNotificationPreferences, quietHoursEnabled: true };
    expect(isNotificationQuiet(prefs, new Date('2026-10-10T21:59:00Z'))).toBe(false);
    expect(isNotificationQuiet(prefs, new Date('2026-10-10T22:00:00Z'))).toBe(true);
    expect(isNotificationQuiet(prefs, new Date('2026-10-11T07:59:00Z'))).toBe(true);
    expect(isNotificationQuiet(prefs, new Date('2026-10-11T08:00:00Z'))).toBe(false);
  });
  it('uses the selected timezone through daylight saving changes', () => {
    const prefs = { ...defaultNotificationPreferences, quietHoursEnabled: true,
      quietHoursStart: '01:00', quietHoursEnd: '02:00', timeZone: 'Europe/London' };
    expect(isNotificationQuiet(prefs, new Date('2026-10-25T00:30:00Z'))).toBe(true);
    expect(isNotificationQuiet(prefs, new Date('2026-10-25T01:30:00Z'))).toBe(true);
    expect(isNotificationQuiet(prefs, new Date('2026-10-25T02:30:00Z'))).toBe(false);
  });
  it('handles daytime windows, disabled windows and all-day windows', () => {
    const prefs = { ...defaultNotificationPreferences, quietHoursEnabled: true, quietHoursStart: '12:00', quietHoursEnd: '13:00' };
    expect(isNotificationQuiet(prefs, new Date('2026-10-10T12:30:00Z'))).toBe(true);
    expect(isNotificationQuiet(prefs, new Date('2026-10-10T13:00:00Z'))).toBe(false);
    expect(isNotificationQuiet({ ...prefs, quietHoursEnabled: false }, new Date('2026-10-10T12:30:00Z'))).toBe(false);
    expect(isNotificationQuiet({ ...prefs, quietHoursEnd: '12:00' }, new Date('2026-10-10T23:30:00Z'))).toBe(true);
  });
  it('rejects forged ownership, mute IDs, malformed times and invalid timezones', () => {
    for (const update of [{ profileId: 'other' }, { mutedConversationIds: ['other'] }, { messages: 'false' },
      { quietHoursStart: '24:00' }, { quietHoursEnd: '7:30' }, { timeZone: 'Invalid/Zone' }]) {
      expect(notificationPreferenceUpdateSchema.safeParse(update).success).toBe(false);
    }
    expect(notificationPreferenceUpdateSchema.parse({ messages: false, timeZone: 'Atlantic/Reykjavik' })).toEqual({ messages: false, timeZone: 'Atlantic/Reykjavik' });
  });
});
