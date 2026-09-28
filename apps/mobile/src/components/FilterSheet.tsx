import { type ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Href, useRouter } from 'expo-router';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';
import { Text } from './Typography';
import { DemoBanner } from './ui';

export function FilterSheet({
  children,
  footer,
  fallback = '/(tabs)/discover',
  title,
}: {
  title?: string;
  fallback?: Href;
  children: (close: () => void) => ReactNode;
  footer: (close: () => void) => ReactNode;
}) {
  const { theme, t, user } = useApp();
  const { reducedMotion } = useAppearance();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const closing = useRef(false);
  const draftAccount = useRef(user?.id ?? null);
  const accountChanged = draftAccount.current !== (user?.id ?? null);
  useEffect(() => {
    if (accountChanged) router.replace(fallback);
  }, [accountChanged, fallback, router]);
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: reducedMotion ? 0 : 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion]);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(progress, {
      toValue: 0,
      duration: reducedMotion ? 0 : 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        if (router.canGoBack()) router.back();
        else router.replace(fallback);
      }
    });
  };
  // Never render or apply a previous account's in-memory filter draft.
  if (accountChanged) return null;
  return (
    <View style={styles.root} accessibilityViewIsModal>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity: progress, backgroundColor: theme.colors.scrim },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={close}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            maxHeight: height - Math.max(insets.top, 24),
            backgroundColor: theme.colors.canvas,
            transform: [
              {
                translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }),
              },
            ],
          },
        ]}
      >
        <DemoBanner />
        <View style={styles.heading}>
          <Text
            accessibilityRole="header"
            style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900', flex: 1 }}
          >
            {title ?? t('filters.title')}
          </Text>
          <Pressable accessibilityRole="button" onPress={close} style={styles.close}>
            <Text style={{ color: theme.colors.accent }}>{t('common.close')}</Text>
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {children(close)}
        </ScrollView>
        <View
          style={[
            styles.footer,
            { borderTopColor: theme.colors.border, paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          {footer(close)}
        </View>
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    flexShrink: 1,
  },
  heading: {
    paddingHorizontal: 20,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  close: { minHeight: 48, minWidth: 48, justifyContent: 'center' },
  content: { padding: 20, gap: 16 },
  footer: { padding: 16, gap: 10, borderTopWidth: 1 },
});
