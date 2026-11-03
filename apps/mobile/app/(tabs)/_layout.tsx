import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesktopSidebar, desktopSidebarBreakpoint } from '@/components/DesktopSidebar';
import { hittingarFeature } from '@/features/hittingar/config';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';
import { useChatInbox } from '@/providers/ChatInboxProvider';

const icon = (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size, focused }: { color: unknown; size: number; focused: boolean }) => (
    <View style={focused ? styles.activeIcon : undefined}>
      <Ionicons name={name} color={String(color ?? '')} size={size} />
    </View>
  );

export default function TabLayout() {
  const router = useRouter();
  const { t, theme } = useApp();
  const { unreadCount } = useChatInbox();
  const { reducedMotion, appearance } = useAppearance();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const desktop = width >= desktopSidebarBreakpoint;
  const bottomPadding = Math.max(insets.bottom, 8);
  const barContentHeight = Math.ceil(58 + 20 * (appearance.textScale * Math.max(1, fontScale) - 1));
  return (
    <View style={[styles.shell, { backgroundColor: theme.colors.canvas }]}>
      {desktop && <DesktopSidebar />}
      <View style={styles.main}>
      <Tabs
      screenOptions={{
        headerShown: false,
        animation: reducedMotion ? 'none' : 'fade',
        transitionSpec: { animation: 'timing', config: { duration: 150 } },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          display: desktop ? 'none' : 'flex',
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: barContentHeight + bottomPadding,
          paddingTop: 6,
          paddingBottom: bottomPadding,
        },
        tabBarItemStyle: { borderRadius: 6 },
        tabBarLabelStyle: { fontSize: 10 * appearance.textScale, fontWeight: '600', letterSpacing: 0 },
      } as never}
    >
      <Tabs.Screen name="discover" options={{ title: t('tabs.discover'), tabBarIcon: icon('location-outline') }} />
      <Tabs.Screen name="hittingar" listeners={{ tabPress: event => { event.preventDefault(); router.navigate('/(tabs)/hittingar?section=hittingar'); } }} options={{ href: hittingarFeature.enabled ? undefined : null, title: t('tabs.hittingar'), tabBarIcon: icon('calendar-outline') }} />
      <Tabs.Screen name="chats" options={{ title: t('tabs.chats'), tabBarIcon: icon('chatbubbles-outline'), tabBarBadge: unreadCount > 0 ? unreadCount > 99 ? '99+' : unreadCount : undefined, tabBarBadgeStyle: { backgroundColor: theme.colors.accent, color: theme.colors.textOnAccent } }} />
      <Tabs.Screen name="samfelag" options={{ title: t('tabs.community'), tabBarIcon: icon('people-outline') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('person-circle-outline') }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ shell: { flex: 1, flexDirection: 'row' }, main: { flex: 1, minWidth: 0 }, activeIcon: { transform: [{ translateY: -1 }] } });
