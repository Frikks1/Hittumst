import { Text } from '@/components/Typography';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Button, ChoiceChip, EmptyState, IconButton, ProfileTile, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';
import { api } from '@/services';
import { type DiscoveryFilters, type Intent, type PublicProfile } from '@/types/domain';
import { discoveryFilterCount } from '@/utils/discoveryPreferences';
import { emptyFeed, PagedFeed } from '@/utils/pagedFeed';
import { hittingarFeature } from '@/features/hittingar/config';

export default function DiscoverScreen() {
  const router = useRouter();
  const { discoveryFilters, setDiscoveryFilters, locationAllowed, locationVerifiedAt, user, t, theme } = useApp();
  const { appearance } = useAppearance();
  const { width, fontScale } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(width);
  const [stored, setSnapshot] = useState(emptyFeed<PublicProfile>);
  const feed = useMemo(() => new PagedFeed<PublicProfile, DiscoveryFilters>((query, cursor) => api.discover(query, cursor), setSnapshot), []);
  const queryKey = user && locationAllowed ? JSON.stringify([user.id, locationVerifiedAt, discoveryFilters]) : null;
  const snapshot = stored.queryKey === queryKey && queryKey ? stored : emptyFeed<PublicProfile>();
  const textScale = Math.max(1, fontScale) * appearance.textScale;
  const gap = 16;
  const usable = Math.max(1, listWidth - 48);
  const preferred = listWidth >= 700 ? Math.max(2, Math.floor((usable + gap) / (200 + gap))) : 2;
  const columns = Math.max(1, Math.min(preferred, Math.floor((usable + gap) / (145 * textScale + gap))));
  const tileWidth = (usable - (columns - 1) * gap) / columns;
  const filterCount = discoveryFilterCount(discoveryFilters);
  const load = useCallback(() => { if (queryKey) void feed.refresh(discoveryFilters, queryKey); else feed.clear(); }, [queryKey, discoveryFilters, feed]);
  useEffect(() => { if (!queryKey) feed.clear(); }, [queryKey, feed]);
  useFocusEffect(useCallback(() => { load(); return () => feed.pause(); }, [load, feed]));
  const header = <View style={styles.header}>
    <View style={styles.topbar}><Text accessibilityRole="header" style={[styles.brand, { color: theme.colors.accent }]}>hittumst</Text><View style={styles.actions}>
      {hittingarFeature.enabled && <IconButton icon="notifications-outline" label={t('hittingar.notifications.title')} onPress={() => router.push('/hittingar/notifications')} />}
      <IconButton icon="options-outline" label={t('discovery.filterCount', { count: filterCount })} onPress={() => router.push('/filters')} />
    </View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      <ChoiceChip label={t('discovery.everyone')} selected={!discoveryFilters.intents.length} onPress={() => setDiscoveryFilters({ ...discoveryFilters, intents: [] })} />
      {(['chat', 'dates', 'friends', 'relationship'] as Intent[]).map(intent => <ChoiceChip key={intent} label={t(`intent.${intent}`)} selected={discoveryFilters.intents.includes(intent)}
        onPress={() => setDiscoveryFilters({ ...discoveryFilters, intents: discoveryFilters.intents.includes(intent) ? discoveryFilters.intents.filter(value => value !== intent) : [intent] })} />)}
    </ScrollView>
  </View>;
  return <Screen scroll={false}><View style={{ flex: 1 }} onLayout={event => setListWidth(event.nativeEvent.layout.width)}>
    <FlatList key={'columns-' + columns} data={queryKey ? snapshot.items : []} numColumns={columns} keyExtractor={item => item.id} contentContainerStyle={styles.list}
      columnWrapperStyle={columns > 1 ? { gap } : undefined} ListHeaderComponent={header} refreshing={snapshot.loading && snapshot.items.length > 0} onRefresh={load}
      initialNumToRender={12} windowSize={5} onEndReached={() => { if (queryKey && snapshot.cursor && !snapshot.loading) void feed.more(); }} onEndReachedThreshold={0.4}
      renderItem={({ item }) => <View style={{ width: tileWidth, marginBottom: gap }}><ProfileTile profile={item} onPress={() => router.push(`/profile/${item.id}`)} /></View>}
      ListEmptyComponent={!locationAllowed ? <EmptyState icon="location-outline" title={t('location.staleTitle')} body={t('location.lockedHint')} action={<Button label={t('location.verifyAgain')} onPress={() => router.push('/location-gate')} />} />
        : snapshot.loading ? <ActivityIndicator color={theme.colors.accent} style={{ padding: 40 }} /> : snapshot.error ? <EmptyState icon="cloud-offline-outline" title={t('discover.error')} action={<Button label={t('common.retry')} onPress={load} />} />
        : <EmptyState icon="people-outline" title={t('discover.emptyTitle')} action={<Button variant="secondary" label={t('discover.filters')} onPress={() => router.push('/filters')} />} />}
      ListFooterComponent={snapshot.items.length && snapshot.cursor ? <Button variant="secondary" loading={snapshot.loading} label={t('discovery.more')} onPress={() => void feed.more()} /> : null}
    />
  </View></Screen>;
}
const styles = StyleSheet.create({ list: { paddingHorizontal: 24, paddingBottom: 24 }, header: { paddingTop: 14, paddingBottom: 16, gap: 16 }, topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, brand: { fontSize: 28, fontWeight: '800' }, actions: { flexDirection: 'row', alignItems: 'center', gap: 10 }, chips: { gap: 8 } });
