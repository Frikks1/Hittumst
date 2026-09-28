import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { defaultAppearance, parseAppearance, type AppearancePreferences } from '@/theme/appearance';

const KEY = 'rummal.appearance.v1';
type AppearanceContext = {
  appearance: AppearancePreferences;
  updateAppearance: (patch: Partial<AppearancePreferences>) => void;
  resetAppearance: () => void;
  reducedMotion: boolean;
  ready: boolean;
  storageError: boolean;
};
const Context = createContext<AppearanceContext | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [systemReducedMotion, setSystemReducedMotion] = useState(true);
  const writeQueue = useRef(Promise.resolve());
  const canPersist = useRef(false);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(KEY).then(value => {
      if (!active) return;
      canPersist.current = true;
      if (value) { try { setAppearance(parseAppearance(JSON.parse(value))); } catch { /* Restore safe defaults. */ } }
    }).catch(() => { if (active) setStorageError(true); }).finally(() => { if (active) setReady(true); });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setSystemReducedMotion(value); }).catch(() => { /* Keep motion reduced when the OS preference is unavailable. */ });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    // A failed read must not replace previously saved preferences with defaults.
    if (!ready || !canPersist.current) return;
    let active = true;
    writeQueue.current = writeQueue.current.catch(() => undefined).then(() => AsyncStorage.setItem(KEY, JSON.stringify(appearance)))
      .then(() => { if (active) setStorageError(false); }).catch(() => { if (active) setStorageError(true); });
    return () => { active = false; };
  }, [appearance, ready]);
  const value = useMemo<AppearanceContext>(() => ({
    appearance, ready, storageError, reducedMotion: systemReducedMotion || appearance.reducedMotion,
    updateAppearance: patch => { canPersist.current = true; setAppearance(current => parseAppearance({ ...current, ...patch })); },
    resetAppearance: () => { canPersist.current = true; setAppearance({ ...defaultAppearance }); },
  }), [appearance, ready, storageError, systemReducedMotion]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppearance() {
  const value = useContext(Context);
  if (!value) throw new Error('AppearanceProvider is required');
  return value;
}
