import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { FriendSummary } from '@/types/domain';

export default function FriendsScreen() {
  const { t, theme } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<FriendSummary[]>([]);
  const load = useCallback(() => { void api.listFriends().then(setItems); }, []);
  useFocusEffect(load);
  const act = async (item: FriendSummary, action: 'accept' | 'decline' | 'remove') => {
    await api.setFriendship(item.profileId, action);
    setItems(await api.listFriends());
  };
  return <Screen back title={t('social.friends')}>
    <View style={styles.page}>
      {items.length === 0 ? <EmptyState icon="people-outline" title={t('social.noFriends')} body={t('social.noFriendsBody')} /> : items.map((item) =>
        <View key={item.friendshipId} style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          {item.avatarUrl ? <Image source={item.avatarUrl} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: theme.colors.surfaceMuted }]} />}
          <View style={styles.copy}><Text style={[styles.name, { color: theme.colors.text }]}>{item.displayName}</Text><Text style={{ color: theme.colors.textMuted }}>{t(`social.friend.${item.direction}`)}</Text></View>
          {item.direction === 'incoming' && item.status === 'pending'
            ? <View style={styles.actions}><Button label={t('social.accept')} onPress={() => void act(item, 'accept')} /><Button variant="secondary" label={t('social.decline')} onPress={() => void act(item, 'decline')} /></View>
            : <Button variant="secondary" label={item.status === 'accepted' ? t('social.view') : t('social.pending')} onPress={() => router.push(`/profile/${item.profileId}`)} />}
        </View>)}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({ page: { padding: 18, gap: 12 }, card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 48, height: 48, borderRadius: 24 }, copy: { flex: 1 }, name: { fontWeight: '900', fontSize: 16 }, actions: { gap: 6 } });
