import { useState } from 'react';
import type { Locale } from '@/i18n/translations';
import type { RummalApi } from '@/services';

type Options = { api: RummalApi; locale: Locale; navigateToMeetup: (id: string) => void; onInboxChanged?: () => void };
type NotificationHookState = { enable: () => Promise<void>; status: 'idle' | 'enabled' | 'denied' | 'error'; busy: boolean; supported: boolean };
type GlobalOptions = { api: RummalApi; enabled: boolean; navigateToMeetup: (id: string) => void; onInboxChanged?: () => void };

export function useHittingarNotifications(_: Options): NotificationHookState {
  const [status] = useState<'idle'>('idle');
  return { enable: async () => undefined, status, busy: false, supported: false };
}

export function useGlobalHittingarNotifications(_: GlobalOptions): void {}

export async function unregisterStoredHittingarPushToken(_: RummalApi): Promise<void> {}
