import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { StarredItem } from '@/types/domain';

export default function StarredScreen() {
  const { t, theme } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<StarredItem[]>([]);
  useFocusEffect(useCallback(() => { void api.listStarredItems().then(setItems); }, []));
  const open = (item: StarredItem) => {
    if (item.targetType === 'event') router.push(`/hittingar/${item.targetId}`);
    else if (item.targetType === 'chat') router.push(`/chat/${item.targetId}`);
    else if (item.targetType === 'group') router.push(`/groups/${item.targetId}?name=${encodeURIComponent(item.label)}` as never);
    else router.push(`/profile/${item.targetId}`);
  };
  return <Screen back title={t('social.starred')}>
    <View style={styles.page}>{items.length === 0 ? <EmptyState icon="star-outline" title={t('social.noStars')} body={t('social.noStarsBody')} /> : items.map((item) =>
      <Pressable key={item.id} onPress={() => open(item)} style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <Ionicons name="star" size={22} color={theme.colors.lava} />
        <View style={styles.copy}><Text style={[styles.name, { color: theme.colors.text }]}>{item.label}</Text><Text style={{ color: theme.colors.textMuted }}>{t(`social.type.${item.targetType}`)} · {t(`social.audience.${item.profileAudience}`)}</Text></View>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
      </Pressable>)}</View>
  </Screen>;
}
const styles = StyleSheet.create({ page: { padding: 18, gap: 10 }, card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }, copy: { flex: 1 }, name: { fontSize: 16, fontWeight: '900' } });
