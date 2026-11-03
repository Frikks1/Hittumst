import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { authService, type RummalApi } from '@/services';
import type { NotificationPreferences } from '@/services/notificationPreferences';
import type { MeetupDetail } from '@/types/domain';
import { canScheduleMeetupReminder, meetupReminderPlan, type MeetupReminderMinutes, type MeetupReminderState } from './eventReminderState';

const prefix = 'hittumst.meetupReminder.';
type Stored = { accountId: string; meetupId: string; minutes: MeetupReminderMinutes; requestId: string | null; startsAt: string; locale: string; status: MeetupReminderState['status'] };
export const meetupRemindersSupported = Constants.executionEnvironment !== 'storeClient';
let queue: Promise<unknown> = Promise.resolve();
let generation = 0;
function serialized<T>(task: () => Promise<T>): Promise<T> { const next = queue.then(task, task); queue = next.catch(() => undefined); return next; }
const key = (accountId: string, meetupId: string) => `${prefix}${accountId}.${meetupId}`;
async function read(accountId: string, meetupId: string): Promise<Stored | null> {
  const value = await AsyncStorage.getItem(key(accountId, meetupId));
  if (!value) return null;
  try { const row = JSON.parse(value) as Stored; return row.accountId === accountId && row.meetupId === meetupId ? row : null; }
  catch { return null; }
}
async function cancel(row: Stored | null) { if (row?.requestId) await Notifications.cancelScheduledNotificationAsync(row.requestId); }
export async function getMeetupReminder(accountId: string, meetupId: string): Promise<MeetupReminderState> {
  if (!meetupRemindersSupported) return { minutes: null, status: 'unsupported' };
  const row = await read(accountId, meetupId);
  return row ? { minutes: row.minutes, status: row.status } : { minutes: null, status: 'none' };
}
async function apply(api: RummalApi, accountId: string, detail: MeetupDetail, minutes: MeetupReminderMinutes | null, locale: string, requestPermission: boolean, savedPreferences?: NotificationPreferences): Promise<MeetupReminderState> {
  if (!meetupRemindersSupported) return { minutes: null, status: 'unsupported' };
  const ticket = generation;
  const old = await read(accountId, detail.id);
  if (ticket !== generation || (await authService.getUser())?.id !== accountId) return { minutes: null, status: 'none' };
  if (minutes === null || !canScheduleMeetupReminder(detail)) {
    await cancel(old);
    await AsyncStorage.removeItem(key(accountId, detail.id));
    return { minutes: null, status: 'none' };
  }
  // Preserve the current selection if preferences or permission cannot be read.
  const preferences = savedPreferences ?? await api.getNotificationPreferences();
  const plan = meetupReminderPlan(detail, minutes, preferences);
  if (plan.status === 'none') {
    await cancel(old); await AsyncStorage.removeItem(key(accountId, detail.id));
    return { minutes: null, status: 'none' };
  }
  let requestId: string | null = null;
  if (plan.status === 'scheduled') {
    let permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted' && requestPermission) permission = await Notifications.requestPermissionsAsync();
    if (permission.status !== 'granted') throw new Error('reminder_permission_required');
    if (ticket !== generation || (await authService.getUser())?.id !== accountId) return { minutes: null, status: 'none' };
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('event-reminders', { name: 'Hittingar reminders', importance: Notifications.AndroidImportance.DEFAULT, sound: undefined });
    requestId = await Notifications.scheduleNotificationAsync({
      content: { title: 'Hittumst', body: locale === 'is' ? 'Hittingurinn þinn hefst bráðum. Opnaðu appið til að sjá nánar.' : 'Your gathering starts soon. Open the app for details.',
        data: { meetupReminderId: detail.id, accountId }, sound: false },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(plan.fireAt), channelId: 'event-reminders' },
    });
    if (ticket !== generation || (await authService.getUser())?.id !== accountId) { await Notifications.cancelScheduledNotificationAsync(requestId); return { minutes: null, status: 'none' }; }
  }
  const row: Stored = { accountId, meetupId: detail.id, minutes, requestId, startsAt: detail.startsAt, locale, status: plan.status };
  if (ticket !== generation || (await authService.getUser())?.id !== accountId) { await cancel(row); return { minutes: null, status: 'none' }; }
  try {
    await cancel(old);
    await AsyncStorage.setItem(key(accountId, detail.id), JSON.stringify(row));
  }
  catch (error) { await cancel(row); throw error; }
  return { minutes, status: plan.status };
}
export function setMeetupReminder(api: RummalApi, accountId: string, detail: MeetupDetail, minutes: MeetupReminderMinutes | null, locale: string) {
  const ticket = generation;
  return serialized(async () => ticket === generation ? apply(api, accountId, detail, minutes, locale, true) : { minutes: null, status: 'none' as const });
}
export function reconcileMeetupReminder(api: RummalApi, accountId: string, detail: MeetupDetail, locale: string) {
  const ticket = generation;
  return serialized(async () => {
    if (ticket !== generation) return { minutes: null, status: 'none' as const };
    const old = await read(accountId, detail.id);
    if (!old) return { minutes: null, status: 'none' as const };
    try { return await apply(api, accountId, detail, old.minutes, locale, false); }
    catch (error) { await suspend(old); throw error; }
  });
}
// Refresh errors stop delivery without deleting the member's reminder choice.
async function suspend(row: Stored) {
  await cancel(row);
  if ((await authService.getUser())?.id !== row.accountId) return;
  await AsyncStorage.setItem(key(row.accountId, row.meetupId), JSON.stringify({ ...row, requestId: null, status: 'unavailable' }));
}
export function reconcileMeetupReminders(api: RummalApi, preferences?: NotificationPreferences): Promise<void> {
  const ticket = generation;
  return serialized(async () => {
    if (ticket !== generation) return;
    const user = await authService.getUser();
    if (!user || !meetupRemindersSupported) return;
    const keys = (await AsyncStorage.getAllKeys()).filter(value => value.startsWith(`${prefix}${user.id}.`));
    let failure: unknown;
    for (const item of keys) {
      if (ticket !== generation) return;
      const row = await read(user.id, item.slice(`${prefix}${user.id}.`.length));
      if (!row) continue;
      try { const detail = await api.getMeetup(row.meetupId); await apply(api, user.id, detail, row.minutes, row.locale, false, preferences); }
      catch (error) { await suspend(row); failure ??= error; }
    }
    if (failure) throw failure;
  });
}
export async function cancelAllMeetupReminders(): Promise<void> {
  generation++;
  await serialized(async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(scheduled.filter(value => typeof value.content.data?.meetupReminderId === 'string').map(value => Notifications.cancelScheduledNotificationAsync(value.identifier)));
    const keys = (await AsyncStorage.getAllKeys()).filter(value => value.startsWith(prefix));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  });
}
