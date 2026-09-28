import { Text } from '@/components/Typography';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, EmptyState, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import { confirmAction } from '@/utils/confirmAction';
import type { FriendSummary } from '@/types/domain';

export default function FriendsScreen() {
  const { t, theme, locale, user } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<FriendSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const revision = useRef(0);
  useFocusEffect(useCallback(() => {
    let active = true; revision.current++; setBusy(false); setLoading(true); setError(false); setItems([]);
    void api.listFriends().then(value => { if (active) setItems(value); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; revision.current++; };
  }, [attempt, user?.id]));
  const act = async (item: FriendSummary, action: 'accept' | 'decline' | 'remove') => {
    if (busy) return; const request = revision.current; setBusy(true); setError(false);
    try { await api.setFriendship(item.profileId, action); if (request === revision.current) setAttempt(value => value + 1); }
    catch { if (request === revision.current) setError(true); } finally { if (request === revision.current) setBusy(false); }
  };
  return <Screen back title={t('social.friends')}>
    <View style={styles.page}>
      {error && <View><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('common.error')}</Text><Button variant="secondary" label={t('common.retry')} onPress={() => setAttempt(value => value + 1)} /></View>}
      {loading ? <Text style={{ color: theme.colors.textMuted }}>{t('common.loading')}</Text> : items.length === 0 && !error ? <EmptyState icon="people-outline" title={t('social.noFriends')} body={t('social.noFriendsBody')} /> : items.map((item) =>
        <View key={item.friendshipId} style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          {item.avatarUrl ? <Image source={item.avatarUrl} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: theme.colors.surfaceMuted }]} />}
          <View style={styles.copy}><Text style={[styles.name, { color: theme.colors.text }]}>{item.displayName}</Text><Text style={{ color: theme.colors.textMuted }}>{t(`social.friend.${item.direction}`)}</Text></View>
          {item.status === 'accepted' && <Button disabled={busy} variant="ghost" label={locale === 'is' ? 'Fjarlægja vin' : 'Remove friend'} onPress={() => confirmAction({ title: locale === 'is' ? 'Fjarlægja vin' : 'Remove friend', message: item.displayName, cancelLabel: t('common.cancel'), confirmLabel: locale === 'is' ? 'Fjarlægja' : 'Remove', destructive: true, onConfirm: () => act(item, 'remove') })} />}
          {item.direction === 'incoming' && item.status === 'pending'
            ? <View style={styles.actions}><Button disabled={busy} label={t('social.accept')} onPress={() => void act(item, 'accept')} /><Button disabled={busy} variant="secondary" label={t('social.decline')} onPress={() => void act(item, 'decline')} /></View>
            : <Button variant="secondary" label={item.status === 'accepted' ? t('social.view') : t('social.pending')} onPress={() => router.push(`/profile/${item.profileId}`)} />}
        </View>)}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({ page: { padding: 18, gap: 12 }, card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 48, height: 48, borderRadius: 24 }, copy: { flex: 1 }, name: { fontWeight: '900', fontSize: 16 }, actions: { gap: 6 } });
