import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Locale } from '@/i18n/translations';
import type { RummalApi } from '@/services';

type PushCapableApi = RummalApi & {
  registerPushToken(token: string, platform: 'ios' | 'android', locale?: Locale): Promise<void>;
  unregisterPushToken(token: string): Promise<void>;
};

type UseHittingarNotificationsOptions = {
  api: RummalApi;
  locale: Locale;
  navigateToMeetup: (id: string) => void;
  onInboxChanged?: () => void;
};

type UseGlobalHittingarNotificationsOptions = {
  api: RummalApi;
  enabled: boolean;
  navigateToMeetup: (id: string) => void;
  onInboxChanged?: () => void;
};

const TOKEN_KEY = 'rummal.push.expoToken';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function useHittingarNotifications({ api, locale }: UseHittingarNotificationsOptions) {
  const pushApi = api as PushCapableApi;
  const [status, setStatus] = useState<'idle' | 'enabled' | 'denied' | 'error'>('idle');
  const [busy, setBusy] = useState(false);

  const enable = useCallback(async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    setBusy(true);
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('hittingar', {
          name: 'Hittingar',
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: undefined,
          vibrationPattern: [0, 200],
        });
      }
      let permission = await Notifications.getPermissionsAsync();
      if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setStatus('denied');
        return;
      }
      const projectId = Constants.easConfig?.projectId
        ?? (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
      if (!projectId) throw new Error('Expo project id is not configured');
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await pushApi.registerPushToken(token, Platform.OS, locale);
      await AsyncStorage.setItem(TOKEN_KEY, token);
      setStatus('enabled');
    } catch {
      setStatus('error');
    } finally {
      setBusy(false);
    }
  }, [locale, pushApi]);

  return { enable, status, busy, supported: true as const };
}

export function useGlobalHittingarNotifications({
  api,
  enabled,
  navigateToMeetup,
  onInboxChanged,
}: UseGlobalHittingarNotificationsOptions) {
  const handledResponse = useRef<string | null>(null);

  const openResponse = useCallback(async (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const notificationId = response.notification.request.content.data?.notificationId;
    if (typeof notificationId !== 'string' || handledResponse.current === notificationId) {
      await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      return;
    }
    handledResponse.current = notificationId;
    try {
      // A push carries only an opaque inbox id. Resolve it against the current
      // signed-in user's authoritative inbox and re-check meetup authorization.
      const inbox = await api.listMeetupNotifications(50);
      const notification = inbox.find((item) => item.id === notificationId);
      if (!notification) return;
      await api.markMeetupNotificationRead(notification.id);
      await api.getMeetup(notification.meetupId);
      navigateToMeetup(notification.meetupId);
      onInboxChanged?.();
    } catch {
      // The notification may have expired or access may have been revoked.
    } finally {
      await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    }
  }, [api, navigateToMeetup, onInboxChanged]);

  useEffect(() => {
    if (!enabled) {
      handledResponse.current = null;
      return undefined;
    }
    const received = Notifications.addNotificationReceivedListener(() => onInboxChanged?.());
    const opened = Notifications.addNotificationResponseReceivedListener((response) => void openResponse(response));
    void Notifications.getLastNotificationResponseAsync().then(openResponse);
    return () => {
      received.remove();
      opened.remove();
    };
  }, [enabled, onInboxChanged, openResponse]);
}

export async function unregisterStoredHittingarPushToken(api: RummalApi): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;
  try {
    await (api as PushCapableApi).unregisterPushToken(token);
  } finally {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}
