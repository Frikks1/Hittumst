import { Ionicons } from '@expo/vector-icons';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, DemoBanner, Screen, textStyles } from '@/components/ui';
import { formatHittingurDate } from '@/features/hittingar/components';
import { useHittingarNotifications } from '@/features/hittingar/notifications';
import { useApp } from '@/providers/AppProvider';
import { api, type RummalApi } from '@/services';
import type { MeetupNotification } from '@/types/domain';

const meetupApi = api as RummalApi;

export default function HittingarNotificationsScreen() {
  const router = useRouter();
  const { locale, t, theme } = useApp();
  const [items, setItems] = useState<MeetupNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await meetupApi.listMeetupNotifications(50)); } finally { setLoading(false); }
  }, []);
  const navigateToMeetup = useCallback((id: string) => router.push(`/hittingar/${id}` as Href), [router]);
  const notifications = useHittingarNotifications({ api: meetupApi, locale, navigateToMeetup, onInboxChanged: load });
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const open = async (item: MeetupNotification) => {
    if (!item.readAt) await meetupApi.markMeetupNotificationRead(item.id);
    await meetupApi.getMeetup(item.meetupId);
    navigateToMeetup(item.meetupId);
  };

  return (
    <Screen back title={t('hittingar.notifications.title')} scroll={false}>
      <DemoBanner />
      {notifications.supported && notifications.status !== 'enabled' && (
        <View style={[styles.permission, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={[styles.permissionIcon, { backgroundColor: theme.colors.accentSoft }]}><Ionicons name="notifications-outline" size={24} color={theme.colors.accent} /></View>
          <View style={styles.copy}>
            <Text style={[styles.permissionTitle, { color: theme.colors.text }]}>{t('hittingar.notifications.enableTitle')}</Text>
            <Text style={[styles.body, { color: theme.colors.textMuted }]}>{t(`hittingar.notifications.permission.${notifications.status}`)}</Text>
          </View>
          <Button label={t('hittingar.notifications.enable')} loading={notifications.busy} onPress={() => void notifications.enable()} />
        </View>
      )}
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />} contentContainerStyle={styles.list}>
        {items.length === 0 && !loading ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={42} color={theme.colors.textMuted} />
            <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.notifications.emptyTitle')}</Text>
            <Text style={[textStyles.body, styles.center, { color: theme.colors.textMuted }]}>{t('hittingar.notifications.emptyBody')}</Text>
          </View>
        ) : items.map((item) => (
          <Pressable key={item.id} accessibilityRole="button" onPress={() => void open(item)} style={({ pressed }) => [styles.item, { backgroundColor: item.readAt ? theme.colors.surface : theme.colors.accentSoft, borderColor: theme.colors.border }, pressed && styles.pressed]}>
            <View style={[styles.kindIcon, { backgroundColor: theme.colors.surfaceRaised }]}><Ionicons name="calendar-outline" size={20} color={theme.colors.accent} /></View>
            <View style={styles.copy}>
              <Text style={[styles.itemTitle, { color: theme.colors.text }]}>{t(`hittingar.notifications.kind.${item.kind}`)}</Text>
              <Text numberOfLines={1} style={[styles.body, { color: theme.colors.textMuted }]}>{item.meetupTitle}</Text>
              <Text style={[styles.date, { color: theme.colors.textMuted }]}>{formatHittingurDate(item.createdAt, locale)}</Text>
            </View>
            {!item.readAt && <View accessibilityLabel={t('hittingar.notifications.unread')} style={[styles.unread, { backgroundColor: theme.colors.accent }]} />}
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  permission: { borderWidth: 1, margin: 14, marginBottom: 0, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  permissionIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  permissionTitle: { fontSize: 15, fontWeight: '800' },
  copy: { flex: 1, gap: 3 },
  body: { fontSize: 13, lineHeight: 18 },
  list: { padding: 14, paddingBottom: 48, gap: 9 },
  empty: { minHeight: 380, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  center: { textAlign: 'center' },
  item: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  kindIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14, fontWeight: '800' },
  date: { fontSize: 11 },
  unread: { width: 8, height: 8, borderRadius: 4 },
  pressed: { opacity: 0.78 },
});
