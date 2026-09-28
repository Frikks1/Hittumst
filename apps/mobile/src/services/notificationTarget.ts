import type { NotificationTarget } from '@/types/domain';

export function parseNotificationTarget(value: unknown): NotificationTarget {
  if (!value || typeof value !== 'object') throw new Error('notification_unavailable');
  const target = value as Record<string, unknown>;
  if (!['meetup', 'conversation', 'group'].includes(String(target.type)) || typeof target.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.id)) throw new Error('notification_unavailable');
  const result: NotificationTarget = { type: target.type as NotificationTarget['type'], id: target.id };
  if (target.type === 'conversation' && target.profileId !== undefined) {
    if (typeof target.profileId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.profileId)) throw new Error('notification_unavailable');
    result.profileId = target.profileId;
    if (typeof target.displayName === 'string') result.displayName = target.displayName.slice(0, 120);
  }
  return result;
}
