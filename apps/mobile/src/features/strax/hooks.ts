import { useCallback, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useApp } from '@/providers/AppProvider';
import { straxApi } from '@/services/strax';
import { straxAnchoredNow, type StraxClockAnchor } from './model';

const refreshListeners = new Set<() => void>();
export function refreshStrax() {
  refreshListeners.forEach((listener) => listener());
}
const monotonicNow = () => performance.now();

/** Scoped to the signed-in member; refreshes only while this screen is foregrounded. */
export function useStraxResource<T extends { serverNow: string }>(
  loader: () => Promise<T>,
  scope = '',
) {
  const { user, locationAllowed } = useApp();
  const key = `${user?.id ?? ''}:${locationAllowed}:${scope}`;
  const [snapshot, setSnapshot] = useState<{ key: string; data: T; receivedAt: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now());
  const anchor = useRef<StraxClockAnchor | null>(null);
  const activeReload = useRef<() => Promise<void>>(async () => undefined);
  const reload = useCallback(() => activeReload.current(), []);
  const anchorServerTime = useCallback((serverNow: string, receivedAt = monotonicNow()) => {
    anchor.current = { server: Date.parse(serverNow), monotonic: receivedAt };
    setNow(straxAnchoredNow(anchor.current, monotonicNow()));
  }, []);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      let pending = false;
      const foreground = () =>
        AppState.currentState !== 'background' &&
        AppState.currentState !== 'inactive' &&
        (Platform.OS !== 'web' ||
          typeof document === 'undefined' ||
          document.visibilityState !== 'hidden');
      const refresh = async () => {
        if (!alive || pending || !user || !locationAllowed || !foreground()) return;
        pending = true;
        const started = monotonicNow();
        setLoading(true);
        try {
          const data = await loader();
          if (alive) {
            anchorServerTime(data.serverNow, started);
            setSnapshot({ key, data, receivedAt: started });
            setError(false);
          }
        } catch {
          if (alive) {
            setSnapshot(null);
            setError(true);
          }
        } finally {
          pending = false;
          if (alive) setLoading(false);
        }
      };
      activeReload.current = refresh;
      setError(false);
      void refresh();
      const refreshInterval = setInterval(() => void refresh(), 30_000);
      const tickInterval = setInterval(() => {
        if (alive && foreground()) setNow(straxAnchoredNow(anchor.current, monotonicNow()));
      }, 1_000);
      const onForeground = () => {
        if (foreground()) {
          setNow(straxAnchoredNow(anchor.current, monotonicNow()));
          void refresh();
        }
      };
      const subscription = AppState.addEventListener('change', onForeground);
      const listener = () => void refresh();
      refreshListeners.add(listener);
      if (Platform.OS === 'web' && typeof document !== 'undefined')
        document.addEventListener('visibilitychange', onForeground);
      return () => {
        alive = false;
        clearInterval(refreshInterval);
        clearInterval(tickInterval);
        subscription.remove();
        refreshListeners.delete(listener);
        if (Platform.OS === 'web' && typeof document !== 'undefined')
          document.removeEventListener('visibilitychange', onForeground);
      };
    }, [key, loader, user, locationAllowed, anchorServerTime]),
  );
  return {
    data: snapshot?.key === key && locationAllowed ? snapshot.data : null,
    now,
    loading,
    error,
    reload,
    anchorServerTime,
    receivedAt: snapshot?.key === key ? snapshot.receivedAt : undefined,
  };
}
export function useStraxSummary() {
  const loader = useCallback(() => straxApi.summary(), []);
  return useStraxResource(loader, 'summary');
}
