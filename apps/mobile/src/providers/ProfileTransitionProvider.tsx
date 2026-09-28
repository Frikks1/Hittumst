import { Image } from 'expo-image';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, StyleSheet } from 'react-native';
import { useAppearance } from './AppearanceProvider';

type Rect = { x: number; y: number; width: number; height: number };
type Transition = { id: string; uri: string; from: Rect };
const Context = createContext({ start: (_id: string, _uri: string, _from: Rect) => {}, finish: (_id: string, _to: Rect) => {} });
export function ProfileTransitionProvider({ children }: { children: ReactNode }) {
  const { reducedMotion } = useAppearance();
  const [transition, setTransition] = useState<Transition | null>(null);
  const active = useRef<Transition | null>(null);
  const bounds = useRef(new Animated.ValueXY()).current;
  const size = useRef(new Animated.ValueXY()).current;
  const radius = useRef(new Animated.Value(22)).current;
  const clear = useCallback(() => { active.current = null; setTransition(null); }, []);
  useEffect(() => { if (!transition) return; const timeout = setTimeout(clear, 1200); return () => clearTimeout(timeout); }, [transition, clear]);
  useEffect(() => { if (reducedMotion) clear(); }, [reducedMotion, clear]);
  const start = useCallback((id: string, uri: string, from: Rect) => {
    if (reducedMotion || from.width <= 0 || from.height <= 0) return;
    bounds.setValue({ x: from.x, y: from.y }); size.setValue({ x: from.width, y: from.height }); radius.setValue(22);
    active.current = { id, uri, from }; setTransition(active.current);
  }, [bounds, size, radius, reducedMotion]);
  const finish = useCallback((id: string, to: Rect) => {
    if (active.current?.id !== id) return;
    Animated.parallel([
      Animated.timing(bounds, { toValue: { x: to.x, y: to.y }, duration: 300, useNativeDriver: false }),
      Animated.timing(size, { toValue: { x: to.width, y: to.height }, duration: 300, useNativeDriver: false }),
      Animated.timing(radius, { toValue: 32, duration: 300, useNativeDriver: false }),
    ]).start(clear);
  }, [bounds, size, radius, clear]);
  return <Context.Provider value={{ start, finish }}>{children}<Modal transparent visible={!!transition} animationType="none" statusBarTranslucent onRequestClose={clear}>
    {transition && <Animated.View pointerEvents="none" style={{ position: 'absolute', left: bounds.x, top: bounds.y, width: size.x, height: size.y, borderRadius: radius, overflow: 'hidden' }}><Image source={transition.uri} contentFit="cover" style={StyleSheet.absoluteFill} /></Animated.View>}
  </Modal></Context.Provider>;
}
export const useProfileTransition = () => useContext(Context);
