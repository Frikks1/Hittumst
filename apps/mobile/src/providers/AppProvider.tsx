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
} from '@/features/hittingar/notifications';
import {
  clearHittingarLocalDraft,
  clearLegacyHittingarLocalDrafts,
} from '@/features/hittingar/draftStorage';
import { api, authService, runtimeEnv } from '@/services';
import type { AuthUser } from '@/services/types';
import { defaultFilters, type DiscoveryFilters } from '@/types/domain';
import { resolveTheme, type AppTheme, type ThemeMode } from '@/theme/tokens';
import { evaluateLocationFix, isLocationFresh } from '@/utils/location';

const PREFERENCES_KEY = 'rummal.preferences.v1';

type AppContextValue = {
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
  locationVerifiedAt: string | null;
  locationAllowed: boolean;
  verifyLocation: () => Promise<
    'verified' | 'denied' | 'poor_accuracy' | 'outside_iceland' | 'error'
  >;
  clearLocation: () => void;
  discoveryFilters: DiscoveryFilters;
  setDiscoveryFilters: (filters: DiscoveryFilters) => void;
  signOut: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() as ColorSchemeName;
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState(false);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const retryStartup = useCallback(() => setStartupAttempt(value => value + 1), []);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [locale, setLocaleState] = useState<Locale>('is');
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [locationVerifiedAt, setLocationVerifiedAt] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [discoveryFilters, setDiscoveryFilters] = useState<DiscoveryFilters>(defaultFilters);
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    void clearLegacyHittingarLocalDrafts().catch(() => undefined);
    let mounted = true;
    let authRevision = 0;
    setReady(false);
    setStartupError(false);
    if (runtimeEnv.configurationIssue) { setReady(true); return; }
    const unsubscribe = authService.onAuthStateChange(current => {
      authRevision++;
      if (mounted) setUser(current);
    });
    const revisionAtStart = authRevision;
    void Promise.allSettled([AsyncStorage.getItem(PREFERENCES_KEY), authService.getUser()])
      .then(([stored, auth]) => {
        if (!mounted) return;
        if (stored.status === 'fulfilled' && stored.value) {
          try {
            const preferences = JSON.parse(stored.value);
            if (preferences.locale === 'is' || preferences.locale === 'en') setLocaleState(preferences.locale);
            if (['system', 'dark', 'light'].includes(preferences.themeMode)) setThemeModeState(preferences.themeMode);
          } catch { /* Corrupt preferences must not prevent account restoration. */ }
        }
        if (revisionAtStart === authRevision) {
          if (auth.status === 'fulfilled') setUser(auth.value);
          else setStartupError(true);
        }
        setReady(true);
      });
    return () => { mounted = false; unsubscribe(); };
  }, [startupAttempt]);

  useEffect(() => {
    const nextId = user?.id ?? null;
    if (previousUserId.current !== nextId) {
      const oldId = previousUserId.current;
      previousUserId.current = nextId;
      setLocationVerifiedAt(null);
      setDiscoveryFilters({ ...defaultFilters });
      if (oldId) void clearHittingarLocalDraft(oldId).catch(() => undefined);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!ready) return;
    void AsyncStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ locale, themeMode }),
    ).catch(() => undefined);
  }, [locale, ready, themeMode]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setClock(Date.now());
        if (isLocationFresh(locationVerifiedAt)) void api.touchPresence().catch(() => undefined);
      }
    });
    const timer = setInterval(() => setClock(Date.now()), 30_000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [locationVerifiedAt]);

  const setLocale = useCallback((value: Locale) => setLocaleState(value), []);
  const setThemeMode = useCallback((value: ThemeMode) => setThemeModeState(value), []);
  const clearLocation = useCallback(() => setLocationVerifiedAt(null), []);
  const navigateToMeetupFromPush = useCallback(
    (id: string) => router.push(`/hittingar/${id}` as Href),
    [router],
  );

  useGlobalHittingarNotifications({
    api,
    enabled: hittingarFeature.enabled && Boolean(user),
    navigateToMeetup: navigateToMeetupFromPush,
  });

  const verifyLocation = useCallback(async () => {
    if (runtimeEnv.bypassAuth) {
      setLocationVerifiedAt(new Date().toISOString());
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
        setLocationVerifiedAt(result.verifiedAt ?? new Date().toISOString());
        return 'verified' as const;
      }
      if (result.reason === 'outside_iceland') return 'outside_iceland' as const;
      if (result.reason === 'poor_accuracy') return 'poor_accuracy' as const;
      return 'error' as const;
    } catch {
      return 'error' as const;
    }
  }, []);

  const signOut = useCallback(async () => {
    await unregisterStoredHittingarPushToken(api).catch(() => undefined);
    if (user?.id) await clearHittingarLocalDraft(user.id).catch(() => undefined);
    await authService.signOut();
    setLocationVerifiedAt(null);
    setUser(null);
    router.replace('/');
  }, [router, user?.id]);

  const theme = useMemo(() => resolveTheme(themeMode, systemScheme), [systemScheme, themeMode]);
  const locationAllowed = useMemo(
    () => Boolean(user) && (runtimeEnv.bypassAuth || isLocationFresh(locationVerifiedAt, new Date(clock))),
    [clock, locationVerifiedAt, user],
  );
  const t = useCallback(
    (key: TranslationKey, variables?: Record<string, string | number>) =>
      translate(locale, key, variables),
    [locale],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
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
      locationVerifiedAt,
      locationAllowed,
      verifyLocation,
      clearLocation,
      discoveryFilters,
      setDiscoveryFilters,
      signOut,
    }),
    [
      clearLocation,
      discoveryFilters,
      locale,
      locationAllowed,
      locationVerifiedAt,
      ready,
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
