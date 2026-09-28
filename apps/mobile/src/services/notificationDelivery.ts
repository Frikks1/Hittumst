import type { NotificationTarget } from '@/types/domain';

/** Route only a server-authorized opaque notification, bound to the current account. */
export function createNotificationDispatcher(options: {
  account: () => string | null;
  resolve: (id: string) => Promise<NotificationTarget>;
  navigate: (target: NotificationTarget) => void;
  clear: () => Promise<void>;
  changed?: () => void;
}) {
  const pending = new Set<string>();
  const seen = new Set<string>();
  return async (notificationId: unknown) => {
    const account = options.account();
    if (!account) return;
    if (typeof notificationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notificationId)) {
      await options.clear().catch(() => undefined); return;
    }
    const key = account + ':' + notificationId;
    if (pending.has(key) || seen.has(key)) return;
    pending.add(key);
    try {
      const target = await options.resolve(notificationId);
      if (options.account() !== account) return;
      seen.add(key);
      if (seen.size > 100) seen.delete(seen.values().next().value!);
      options.navigate(target); options.changed?.();
    } catch { /* Revoked access, a stale notification or a network failure cannot open private content. */ }
    finally {
      pending.delete(key);
      if (options.account() === account) await options.clear().catch(() => undefined);
    }
  };
}
