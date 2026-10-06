import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hittingarFeature } from '@/features/hittingar/config';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';

const icon = (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size, focused }: { color: unknown; size: number; focused: boolean }) => (
    <View style={focused ? styles.activeIcon : undefined}>
      <Ionicons name={name} color={String(color ?? '')} size={size} />
    </View>
  );

export default function TabLayout() {
  const { t, theme } = useApp();
  const { reducedMotion, appearance } = useAppearance();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const bottomPadding = Math.max(insets.bottom, 8);
  const barContentHeight = Math.ceil(58 + 20 * (appearance.textScale * Math.max(1, fontScale) - 1));
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: reducedMotion ? 'none' : 'fade',
        transitionSpec: { animation: 'timing', config: { duration: 150 } },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: barContentHeight + bottomPadding,
          paddingTop: 6,
          paddingBottom: bottomPadding,
        },
        tabBarItemStyle: { borderRadius: 18 },
        tabBarLabelStyle: { fontSize: 11 * appearance.textScale, fontWeight: '700', letterSpacing: -0.1 },
      } as never}
    >
      <Tabs.Screen name="discover" options={{ title: t('tabs.discover'), tabBarIcon: icon('grid-outline') }} />
      <Tabs.Screen name="hittingar" options={{ href: hittingarFeature.enabled ? undefined : null, title: t('tabs.hittingar'), tabBarIcon: icon('map-outline') }} />
      <Tabs.Screen name="chats" options={{ title: t('tabs.chats'), tabBarIcon: icon('chatbubbles-outline') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('person-circle-outline') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings'), tabBarIcon: icon('options-outline') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({ activeIcon: { transform: [{ translateY: -1 }] } });
