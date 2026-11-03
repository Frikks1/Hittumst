import { describe, expect, it, vi } from 'vitest';
import { DemoMeetupService } from '@/services/meetupDemo';
import { defaultNotificationPreferences } from '@/services/notificationPreferences';
import { meetupReminderPlan } from './eventReminderState';
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
const now = new Date('2026-10-10T12:00:00Z');
const id = '9f433726-18df-41bd-96a1-e9ec1b503a02';
describe('device event reminder authorization and timing', () => {
  it('requires current admission and cancels after leaving or cancellation', async () => {
    const service = new DemoMeetupService(now);
    expect(meetupReminderPlan(await service.get(id), 60, defaultNotificationPreferences, now.getTime()).status).toBe('none');
    await service.join(id);
    const detail = await service.get(id);
    expect(meetupReminderPlan(detail, 60, defaultNotificationPreferences, now.getTime())).toEqual({ status: 'scheduled', fireAt: Date.parse(detail.startsAt) - 3_600_000 });
    expect(meetupReminderPlan({ ...detail, status: 'cancelled' }, 60, defaultNotificationPreferences, now.getTime()).status).toBe('none');
    await service.leave(id);
    expect(meetupReminderPlan(await service.get(id), 60, defaultNotificationPreferences, now.getTime()).status).toBe('none');
  });
  it('honors disabled events, quiet hours at delivery, and past reminders', async () => {
    const service = new DemoMeetupService(now);
    await service.join(id);
    const detail = await service.get(id);
    expect(meetupReminderPlan(detail, 60, { ...defaultNotificationPreferences, events: false }, now.getTime()).status).toBe('disabled');
    expect(meetupReminderPlan(detail, 60, { ...defaultNotificationPreferences, quietHoursEnabled: true, quietHoursStart: '13:00', quietHoursEnd: '16:00' }, now.getTime()).status).toBe('quiet');
    expect(meetupReminderPlan(detail, 60, defaultNotificationPreferences, Date.parse(detail.startsAt)).status).toBe('past');
  });
});
