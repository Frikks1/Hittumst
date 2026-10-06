import { diagnosisReleaseEnabled } from '@/services/diagnoses';
import { clearSubscriptionIdentity } from '@/services/subscriptions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { type Href, useRouter } from 'expo-router';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type ColorSchemeName, useColorScheme } from 'react-native';
import { translations, translate, type Locale, type TranslationKey } from '@/i18n/translations';
import { hittingarFeature } from '@/features/hittingar/config';
import {
  unregisterStoredHittingarPushToken,
  useGlobalHittingarNotifications,
  usePushTokenRegistration,
} from '@/features/hittingar/notifications';
import {
  clearHittingarLocalDraft,
  clearLegacyHittingarLocalDrafts,
} from '@/features/hittingar/draftStorage';
import { api, authService, runtimeEnv } from '@/services';
import type { AuthUser } from '@/services/types';
import {
  defaultMeetupFilters,
  type MeetupFilters,
  defaultFilters,
  type DiscoveryFilters,
  type NotificationTarget,
} from '@/types/domain';
import { resolveTheme, type AppTheme, type ThemeMode } from '@/theme/tokens';
import { evaluateLocationFix, isLocationFresh } from '@/utils/location';
import { useAppearance } from './AppearanceProvider';
import { useSavedFilters } from './useSavedFilters';

const PREFERENCES_KEY = 'rummal.preferences.v1';

type AppContextValue = ReturnType<typeof useSavedFilters> & {
  ready: boolean;
  startupError: boolean;
  retryStartup: () => void;
  user: AuthUser | null;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  theme: AppTheme;
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string;
  demo: boolean;
  discoveryEnabled: boolean;
  locationVerifiedAt: string | null;
  locationAllowed: boolean;
  verifyLocation: () => Promise<
    'verified' | 'denied' | 'poor_accuracy' | 'outside_iceland' | 'error'
  >;
  clearLocation: () => void;
  meetupFilters: MeetupFilters;
  setMeetupFilters: (filters: MeetupFilters) => void;
  discoveryFilters: DiscoveryFilters;
  setDiscoveryFilters: (filters: DiscoveryFilters) => void;
  signOut: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { appearance, ready: appearanceReady } = useAppearance();
  const systemScheme = useColorScheme() as ColorSchemeName;
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState(false);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const retryStartup = useCallback(() => setStartupAttempt((value) => value + 1), []);
  const [user, setUser] = useState<AuthUser | null>(null);
  const savedDiscovery = useSavedFilters(user?.id);
  const [locale, setLocaleState] = useState<Locale>('is');
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [locationVerifiedAt, setLocationVerifiedAt] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [meetupFilters, setMeetupFilters] = useState<MeetupFilters>(defaultMeetupFilters);
  const [discoveryFilters, setDiscoveryFilters] = useState<DiscoveryFilters>(defaultFilters);
  const [discoveryEnabled, setDiscoveryEnabled] = useState(api.isDemo);
  useEffect(() => {
    let active = true;
    setDiscoveryEnabled(api.isDemo);
    if (user && !api.isDemo)
      void diagnosisReleaseEnabled().then((enabled) => {
        if (active) setDiscoveryEnabled(enabled);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    void clearLegacyHittingarLocalDrafts().catch(() => undefined);
    let mounted = true;
    let authRevision = 0;
    setReady(false);
    setStartupError(false);
    if (runtimeEnv.configurationIssue) {
      setReady(true);
      return;
    }
    const unsubscribe = authService.onAuthStateChange((current) => {
      authRevision++;
      if (mounted) setUser(current);
    });
    const revisionAtStart = authRevision;
    void Promise.allSettled([AsyncStorage.getItem(PREFERENCES_KEY), authService.getUser()]).then(
      ([stored, auth]) => {
        if (!mounted) return;
        if (stored.status === 'fulfilled' && stored.value) {
          try {
            const preferences = JSON.parse(stored.value);
            if (preferences.locale === 'is' || preferences.locale === 'en')
              setLocaleState(preferences.locale);
            if (['system', 'dark', 'light'].includes(preferences.themeMode))
              setThemeModeState(preferences.themeMode);
          } catch {
            /* Corrupt preferences must not prevent account restoration. */
          }
        }
        if (revisionAtStart === authRevision) {
          if (auth.status === 'fulfilled') setUser(auth.value);
          else setStartupError(true);
        }
        setReady(true);
      },
    );
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [startupAttempt]);

  useEffect(() => {
    const nextId = user?.id ?? null;
    if (previousUserId.current !== nextId) {
      const oldId = previousUserId.current;
      previousUserId.current = nextId;
      setLocationVerifiedAt(null);
      setDiscoveryFilters({ ...defaultFilters });
      setMeetupFilters({ ...defaultMeetupFilters });
      if (oldId) void clearHittingarLocalDraft(oldId).catch(() => undefined);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!ready) return;
    void AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify({ locale, themeMode })).catch(
      () => undefined,
    );
  }, [locale, ready, themeMode]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setClock(Date.now());
      }
    });
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [locationVerifiedAt]);

  useEffect(() => {
    if (!user) return;
    let last = 0;
    let pending = false;
    const touch = () => {
      if (AppState.currentState !== 'active' || pending || Date.now() - last < 60_000) return;
      last = Date.now();
      pending = true;
      void api
        .touchPresence()
        .catch(() => undefined)
        .finally(() => {
          pending = false;
        });
    };
    touch();
    const timer = setInterval(touch, 60_000);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') touch();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [user?.id]);

  const setLocale = useCallback((value: Locale) => setLocaleState(value), []);
  const setThemeMode = useCallback((value: ThemeMode) => setThemeModeState(value), []);
  const clearLocation = useCallback(() => setLocationVerifiedAt(null), []);
  const navigateToMeetupFromPush = useCallback(
    (id: string) => router.push(`/hittingar/${id}` as Href),
    [router],
  );

  const navigateToNotificationTarget = useCallback(
    (target: NotificationTarget) => {
      if (target.type === 'meetup') {
        if (hittingarFeature.enabled) navigateToMeetupFromPush(target.id);
      } else if (target.type === 'conversation') {
        const query = target.profileId
          ? '?profileId=' +
            encodeURIComponent(target.profileId) +
            '&name=' +
            encodeURIComponent(target.displayName ?? '')
          : '';
        router.push(('/chat/' + target.id + query) as Href);
      } else router.push(('/groups/' + target.id) as Href);
    },
    [router, navigateToMeetupFromPush],
  );

  usePushTokenRegistration({ api, locale, accountId: user?.id ?? null });
  useGlobalHittingarNotifications({
    api,
    enabled: Boolean(user) && !api.isDemo,
    accountId: user?.id ?? null,
    navigateToTarget: navigateToNotificationTarget,
    navigateToMeetup: navigateToMeetupFromPush,
  });

  const verifyLocation = useCallback(async () => {
    if (runtimeEnv.bypassAuth) {
      const now = Date.now();
      setClock(now);
      setLocationVerifiedAt(new Date(now).toISOString());
      return 'verified' as const;
    }
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') return 'denied' as const;
      const fix = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: true,
      });
      const capturedAt = new Date(fix.timestamp);
      const local = evaluateLocationFix(
        {
          latitude: fix.coords.latitude,
          longitude: fix.coords.longitude,
          accuracy: fix.coords.accuracy,
          capturedAt,
        },
        new Date(),
      );
      if (local === 'poor_accuracy') return 'poor_accuracy' as const;
      if (local === 'outside_iceland') return 'outside_iceland' as const;
      if (local !== 'ok') return 'error' as const;
      const result = await api.updateLocation({
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
        accuracy: fix.coords.accuracy ?? 9999,
        capturedAt: capturedAt.toISOString(),
      });
      if (result.verified) {
        // Evaluate this fresh receipt immediately, not against the previous 30-second tick.
        const now = Date.now();
        setClock(now);
        setLocationVerifiedAt(result.verifiedAt ?? new Date(now).toISOString());
        return 'verified' as const;
      }
      if (result.reason === 'outside_iceland') return 'outside_iceland' as const;
      if (result.reason === 'poor_accuracy') return 'poor_accuracy' as const;
      return 'error' as const;
    } catch {
      return 'error' as const;
    }
  }, []);

  useEffect(() => {
    if (!user && ready) void clearSubscriptionIdentity().catch(() => undefined);
  }, [user, ready]);

  const signOut = useCallback(async () => {
    await unregisterStoredHittingarPushToken(api).catch(() => undefined);
    if (user?.id) await clearHittingarLocalDraft(user.id).catch(() => undefined);
    await authService.signOut();
    setLocationVerifiedAt(null);
    setUser(null);
    router.replace('/');
  }, [router, user?.id]);

  const theme = useMemo(
    () => resolveTheme(themeMode, systemScheme, appearance),
    [systemScheme, themeMode, appearance],
  );
  const locationAllowed = useMemo(
    () =>
      Boolean(user) &&
      (runtimeEnv.bypassAuth || isLocationFresh(locationVerifiedAt, new Date(clock))),
    [clock, locationVerifiedAt, user],
  );
  const t = useCallback(
    (key: TranslationKey, variables?: Record<string, string | number>) =>
      translate(locale, key, variables),
    [locale],
  );

  // Hide old account selections synchronously, before effects clear the backing state.
  const accountFiltersReady = previousUserId.current === (user?.id ?? null);
  const value = useMemo<AppContextValue>(
    () => ({
      ...savedDiscovery,
      ready: ready && appearanceReady,
      startupError,
      retryStartup,
      user,
      locale,
      setLocale,
      themeMode,
      setThemeMode,
      theme,
      t,
      demo: api.isDemo,
      discoveryEnabled,
      locationVerifiedAt,
      locationAllowed,
      verifyLocation,
      clearLocation,
      meetupFilters: accountFiltersReady ? meetupFilters : defaultMeetupFilters,
      setMeetupFilters,
      discoveryFilters: accountFiltersReady ? discoveryFilters : defaultFilters,
      setDiscoveryFilters,
      signOut,
    }),
    [
      clearLocation,
      discoveryFilters,
      discoveryEnabled,
      meetupFilters,
      accountFiltersReady,
      locale,
      locationAllowed,
      locationVerifiedAt,
      ready,
      appearanceReady,
      savedDiscovery,
      startupError,
      retryStartup,
      setLocale,
      setThemeMode,
      signOut,
      t,
      theme,
      themeMode,
      user,
      verifyLocation,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
