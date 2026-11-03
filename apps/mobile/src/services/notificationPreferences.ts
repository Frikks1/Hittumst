import { z } from 'zod';

const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const timeZone = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; }
  catch { return false; }
});

export const notificationPreferencesSchema = z.object({
  messages: z.boolean(), taps: z.boolean(), groups: z.boolean(), events: z.boolean(),
  quietHoursEnabled: z.boolean(), quietHoursStart: clock, quietHoursEnd: clock,
  timeZone, mutedConversationIds: z.array(z.string()).max(10000),
}).strict();
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type NotificationPreferenceUpdate = Partial<Omit<NotificationPreferences, 'mutedConversationIds'>>;
export const notificationPreferenceUpdateSchema = notificationPreferencesSchema.omit({ mutedConversationIds: true }).partial().strict();
export const defaultNotificationPreferences: NotificationPreferences = {
  messages: true, taps: true, groups: true, events: true, quietHoursEnabled: false,
  quietHoursStart: '22:00', quietHoursEnd: '08:00', timeZone: 'Atlantic/Reykjavik', mutedConversationIds: [],
};

/** Match the server's local-clock window, including a window that crosses midnight. */
export function isNotificationQuiet(preferences: NotificationPreferences, at = new Date()): boolean {
  if (!preferences.quietHoursEnabled) return false;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: preferences.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  const minute = Number(parts.find(part => part.type === 'minute')?.value);
  const current = hour * 60 + minute;
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = minutes(preferences.quietHoursStart), end = minutes(preferences.quietHoursEnd);
  return start === end || (start < end ? current >= start && current < end : current >= start || current < end);
}

export function parseNotificationPreferenceUpdate(value: NotificationPreferenceUpdate): NotificationPreferenceUpdate {
  return notificationPreferenceUpdateSchema.parse(value);
}
