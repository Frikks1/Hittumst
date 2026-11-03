import type { RummalApi } from '@/services';
import type { MeetupDetail } from '@/types/domain';
import type { NotificationPreferences } from '@/services/notificationPreferences';
import type { MeetupReminderMinutes, MeetupReminderState } from './eventReminderState';
export const meetupRemindersSupported = false;
export async function getMeetupReminder(_accountId: string, _meetupId: string): Promise<MeetupReminderState> { return { minutes: null, status: 'unsupported' }; }
export async function setMeetupReminder(_api: RummalApi, _accountId: string, _detail: MeetupDetail, _minutes: MeetupReminderMinutes | null, _locale: string): Promise<MeetupReminderState> { return { minutes: null, status: 'unsupported' }; }
export async function reconcileMeetupReminder(_api: RummalApi, _accountId: string, _detail: MeetupDetail, _locale: string): Promise<MeetupReminderState> { return { minutes: null, status: 'unsupported' }; }
export async function reconcileMeetupReminders(_api: RummalApi, _preferences?: NotificationPreferences): Promise<void> {}
export async function cancelAllMeetupReminders(): Promise<void> {}
