import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { Locale } from '@/i18n/translations';
import { authService, type RummalApi } from '@/services';
import type { NotificationTarget } from '@/types/domain';
import { createNotificationDispatcher } from '@/services/notificationDelivery';

type Options = { api: RummalApi; locale: Locale; navigateToMeetup?: (id: string) => void; onInboxChanged?: () => void };
type GlobalOptions = { api: RummalApi; enabled: boolean; accountId?: string | null; navigateToMeetup: (id: string) => void; navigateToTarget?: (target: NotificationTarget) => void; onInboxChanged?: () => void };
const TOKEN_KEY = 'rummal.push.expoToken';
let pushGeneration = 0;
let pushQueue: Promise<void> = Promise.resolve();
function serializePush<T>(task: () => Promise<T>): Promise<T> {
  const next = pushQueue.then(task, task);
  pushQueue = next.then(() => undefined, () => undefined);
  return next;
}
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });

async function registerDevice(api: RummalApi, locale: Locale, requestPermission: boolean, accountId?: string, stillCurrent: () => boolean = () => true) {
  const revision = pushGeneration;
  return serializePush(async () => {
    if (api.isDemo || revision !== pushGeneration || !stillCurrent()) return 'idle' as const;
    const user = await authService.getUser();
    if (!user || accountId && user.id !== accountId) return 'idle' as const;
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('hittingar', { name: 'Hittumst', importance: Notifications.AndroidImportance.DEFAULT, sound: undefined, vibrationPattern: [0, 200] });
    let permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted' && requestPermission) permission = await Notifications.requestPermissionsAsync();
    if (revision !== pushGeneration || !stillCurrent()) return 'idle' as const;
    if (permission.status !== 'granted') {
      const old = await AsyncStorage.getItem(TOKEN_KEY);
      if (old) { await api.unregisterPushToken(old); await AsyncStorage.removeItem(TOKEN_KEY); }
      return 'denied' as const;
    }
    const projectId = Constants.easConfig?.projectId ?? (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
    if (!projectId) throw new Error('push_project_unavailable');
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (revision !== pushGeneration || !stillCurrent() || (await authService.getUser())?.id !== user.id) return 'idle' as const;
    const old = await AsyncStorage.getItem(TOKEN_KEY);
    if (old && old !== token) await api.unregisterPushToken(old);
    await api.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android', locale);
    // Logout waits for this serialized write and then unregisters it before ending auth.
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return 'enabled' as const;
  });
}

export function useHittingarNotifications({ api, locale }: Options) {
  const [status, setStatus] = useState<'idle' | 'enabled' | 'denied' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const enable = useCallback(async () => {
    if (busyRef.current || api.isDemo) return;
    busyRef.current = true; setBusy(true);
    try { const next = await registerDevice(api, locale, true, undefined, () => mounted.current); if (mounted.current) setStatus(next); }
    catch { if (mounted.current) setStatus('error'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }, [api, locale]);
  return { enable, status, busy, supported: !api.isDemo };
}

/** Restore an already granted permission on login, locale change, token rotation or foreground. */
export function usePushTokenRegistration({ api, locale, accountId }: { api: RummalApi; locale: Locale; accountId: string | null }) {
  useEffect(() => {
    if (!accountId || api.isDemo) return;
    let active = true;
    const sync = () => { void registerDevice(api, locale, false, accountId, () => active).catch(() => undefined); };
    sync();
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') sync(); });
    const changed = Notifications.addPushTokenListener(sync);
    return () => { active = false; foreground.remove(); changed.remove(); };
  }, [api, accountId, locale]);
}

export function useGlobalHittingarNotifications({ api, enabled, accountId, navigateToMeetup, navigateToTarget, onInboxChanged }: GlobalOptions) {
  const account = useRef<string | null>(null);
  account.current = enabled ? accountId ?? 'signed-in' : null;
  useEffect(() => {
    if (!enabled || api.isDemo) return;
    let active = true;
    const dispatch = createNotificationDispatcher({
      account: () => active ? account.current : null,
      resolve: id => api.resolveNotification(id),
      navigate: target => { if (navigateToTarget) navigateToTarget(target); else if (target.type === 'meetup') navigateToMeetup(target.id); },
      clear: () => Notifications.clearLastNotificationResponseAsync(), changed: onInboxChanged,
    });
    const open = (response: Notifications.NotificationResponse | null) => response && dispatch(response.notification.request.content.data?.notificationId);
    const received = Notifications.addNotificationReceivedListener(() => onInboxChanged?.());
    const opened = Notifications.addNotificationResponseReceivedListener(response => { void open(response); });
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    return () => { active = false; received.remove(); opened.remove(); };
  }, [api, enabled, accountId, navigateToMeetup, navigateToTarget, onInboxChanged]);
}

export async function unregisterStoredHittingarPushToken(api: RummalApi): Promise<void> {
  pushGeneration++;
  await serializePush(async () => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    try { await api.unregisterPushToken(token); }
    finally { await AsyncStorage.removeItem(TOKEN_KEY); }
  });
}
