import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: reducedMotion ? 'none' : 'fade',
        transitionSpec: { animation: 'timing', config: { duration: 150 } },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: 78,
          paddingTop: 7,
          paddingBottom: 11,
        },
        tabBarItemStyle: { borderRadius: 18 },
        tabBarLabelStyle: { fontSize: 12 * appearance.textScale, fontWeight: '900', letterSpacing: -0.1 },
      } as never}
    >
      <Tabs.Screen name="discover" options={{ title: t('tabs.discover'), tabBarIcon: icon('grid-outline') }} />
      <Tabs.Screen name="hittingar" options={{ href: hittingarFeature.enabled ? undefined : null, title: t('tabs.hittingar'), tabBarIcon: icon('map-outline') }} />
      <Tabs.Screen name="ferdalest" options={{ title: 'Ferðalest', tabBarIcon: icon('train-outline') }} />
      <Tabs.Screen name="chats" options={{ title: t('tabs.chats'), tabBarIcon: icon('chatbubbles-outline') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('person-circle-outline') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings'), tabBarIcon: icon('options-outline') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({ activeIcon: { transform: [{ translateY: -1 }] } });
