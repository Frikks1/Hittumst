import type { MeetupDetail } from '@/types/domain';
import { isNotificationQuiet, type NotificationPreferences } from '@/services/notificationPreferences';

export const meetupReminderChoices = [1440, 60, 15] as const;
export type MeetupReminderMinutes = typeof meetupReminderChoices[number];
export type MeetupReminderState = { minutes: MeetupReminderMinutes | null; status: 'scheduled' | 'quiet' | 'disabled' | 'past' | 'none' | 'unsupported' | 'unavailable' };

export function canScheduleMeetupReminder(detail: MeetupDetail) {
  return detail.status === 'published' && !detail.requiresDiagnosisVerification
    && ['host', 'joined', 'approved'].includes(detail.viewerState.participationStatus)
    && detail.viewerState.attendanceState !== 'expired';
}

export function meetupReminderPlan(detail: MeetupDetail, minutes: MeetupReminderMinutes, preferences: NotificationPreferences, now = Date.now()) {
  if (!meetupReminderChoices.includes(minutes)) throw new Error('invalid_reminder_choice');
  const fireAt = Date.parse(detail.startsAt) - minutes * 60_000;
  if (!Number.isFinite(fireAt) || !canScheduleMeetupReminder(detail)) return { status: 'none' as const, fireAt };
  if (fireAt <= now) return { status: 'past' as const, fireAt };
  if (!preferences.events) return { status: 'disabled' as const, fireAt };
  if (isNotificationQuiet(preferences, new Date(fireAt))) return { status: 'quiet' as const, fireAt };
  return { status: 'scheduled' as const, fireAt };
}
