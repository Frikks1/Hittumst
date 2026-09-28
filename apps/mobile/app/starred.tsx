import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, EmptyState, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { StarredItem } from '@/types/domain';

export default function StarredScreen() {
  const { t, theme, user } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<StarredItem[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const revision = useRef(0);
  useFocusEffect(useCallback(() => {
    let active = true; revision.current++; setLoading(true); setError(false); setItems([]);
    void api.listStarredItems().then(value => { if (active) setItems(value); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; revision.current++; };
  }, [attempt, user?.id]));
  const open = (item: StarredItem) => {
    if (item.targetType === 'event') router.push(`/hittingar/${item.targetId}`);
    else if (item.targetType === 'chat') router.push(`/chat/${item.targetId}`);
    else if (item.targetType === 'group') router.push(`/groups/${item.targetId}?name=${encodeURIComponent(item.label)}` as never);
    else router.push(`/profile/${item.targetId}`);
  };
  return <Screen back title={t('social.starred')}>
    <View style={styles.page}>
      {error && <View><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('common.error')}</Text><Button variant="secondary" label={t('common.retry')} onPress={() => setAttempt(value => value + 1)} /></View>}
      {loading ? <Text style={{ color: theme.colors.textMuted }}>{t('common.loading')}</Text> : items.length === 0 && !error ? <EmptyState icon="star-outline" title={t('social.noStars')} body={t('social.noStarsBody')} /> : items.map((item) =>
      <Pressable accessibilityRole="button" accessibilityLabel={item.label} key={item.id} onPress={() => open(item)} style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <Ionicons name="star" size={22} color={theme.colors.lava} />
        <View style={styles.copy}><Text style={[styles.name, { color: theme.colors.text }]}>{item.label}</Text><Text style={{ color: theme.colors.textMuted }}>{t(`social.type.${item.targetType}`)} · {t(`social.audience.${item.profileAudience}`)}</Text></View>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
      </Pressable>)}</View>
  </Screen>;
}
const styles = StyleSheet.create({ page: { padding: 18, gap: 10 }, card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }, copy: { flex: 1 }, name: { fontSize: 16, fontWeight: '900' } });
