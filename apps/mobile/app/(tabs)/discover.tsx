import { discoveryFilterCount } from '@/utils/discoveryPreferences';
import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Brand, Button, ChoiceChip, EmptyState, IconButton, ProfileTile, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';
import { api } from '@/services';
import { defaultFilters, type DiscoveryFilters, type Intent, type PublicProfile } from '@/types/domain';
import { emptyFeed, PagedFeed } from '@/utils/pagedFeed';

export default function DiscoverScreen() {
  const router = useRouter();
  const { discoveryFilters, setDiscoveryFilters, locationAllowed, user, t, theme } = useApp();
  const { appearance } = useAppearance();
  const { width, fontScale } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(width);
  const textScale = appearance.textScale * Math.max(1, fontScale);
  const preferredColumns = listWidth >= 700 ? Math.max(2, Math.floor(listWidth / (appearance.discoveryLayout === 'large' ? 380 : appearance.discoveryLayout === 'dense' ? 190 : 250))) : appearance.discoveryLayout === 'large' ? 1 : appearance.discoveryLayout === 'dense' && textScale === 1 ? 3 : 2;
  // Leave enough room for readable labels, including the phone's font-size preference.
  const columns = Math.max(1, Math.min(preferredColumns, Math.floor((listWidth - 32 + 10) / (100 * textScale + 10))));
  const tileWidth = Math.max(80, (listWidth - 32 - (columns - 1) * 10) / columns);
  const [own, setOwn] = useState<{ interests: string[]; tags: string[] }>({ interests: [], tags: [] });
  useFocusEffect(useCallback(() => { let active = true; void api.getOwnProfile().then(profile => { if (active) setOwn(profile); }).catch(() => { if (active) setOwn({ interests: [], tags: [] }); }); return () => { active = false; }; }, [user?.id]));
  const [snapshot, setSnapshot] = useState(emptyFeed<PublicProfile>);
  const feed = useMemo(() => new PagedFeed<PublicProfile, DiscoveryFilters>(
    (query, cursor) => api.discover(query, cursor), setSnapshot,
  ), []);
  const activeFilters = discoveryFilterCount(discoveryFilters);
  const load = useCallback(() => {
    if (locationAllowed && user) {
      void feed.refresh(discoveryFilters);

    } else feed.clear();
  }, [discoveryFilters, feed, locationAllowed, user]);
  useEffect(() => { if (!locationAllowed || !user) feed.clear(); }, [feed, locationAllowed, user]);
  useFocusEffect(useCallback(() => { load(); return () => feed.pause(); }, [feed, load]));

  const header = (
    <View style={styles.header}>
      <View style={styles.topbar}>
        <Brand compact />
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>{t('discover.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{t('discover.subtitle')}</Text>
        </View>
        <IconButton icon="options-outline" label={t('discovery.filterCount', { count: activeFilters })} onPress={() => router.push('/filters')} />
      </View>
      <Pressable accessibilityRole="link" onPress={() => router.push('/privacy')} style={styles.privacy}>
        <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.accent} />
        <Text style={[styles.privacyText, { color: theme.colors.textMuted }]}>{t('discovery.privacy')}</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
      </Pressable>
      <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>{t('discovery.intentTitle')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <ChoiceChip label={t('discovery.everyone')} selected={!discoveryFilters.intents.length} onPress={() => setDiscoveryFilters({ ...discoveryFilters, intents: [] })} />
        {(['chat', 'dates', 'friends', 'relationship'] as Intent[]).map(intent => (
          <ChoiceChip key={intent} label={t(`intent.${intent}`)} selected={discoveryFilters.intents.includes(intent)}
            onPress={() => setDiscoveryFilters({ ...discoveryFilters, intents: discoveryFilters.intents.includes(intent) ? discoveryFilters.intents.filter(i => i !== intent) : [...discoveryFilters.intents, intent] })} />
        ))}
        <ChoiceChip label={t('discovery.moreOptions')} selected={false} onPress={() => router.push('/filters')} />
      </ScrollView>
      <View style={styles.resultBar}>
        <Text accessibilityLiveRegion="polite" style={[styles.resultText, { color: theme.colors.textMuted }]}>
          {snapshot.loading && !snapshot.items.length ? t('common.loading') : t(snapshot.items.length === 1 ? 'discovery.oneResult' : 'discovery.results', { count: snapshot.items.length })}
        </Text>
        {activeFilters > 0 && <Pressable accessibilityRole="button" onPress={() => setDiscoveryFilters({ ...defaultFilters })} style={styles.clear}>
          <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>{t('filters.clear')} · {activeFilters}</Text>
        </Pressable>}
      </View>
    </View>
  );

  return (
    <Screen scroll={false}>
      <View style={styles.feed} onLayout={event => setListWidth(event.nativeEvent.layout.width)}>
      <FlatList
        data={locationAllowed ? snapshot.items : []}
        key={`columns-${columns}`}
        numColumns={columns}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        columnWrapperStyle={columns > 1 ? styles.columns : undefined}
        ListHeaderComponent={header}
        refreshing={snapshot.loading}
        onRefresh={load}
        initialNumToRender={8}
        windowSize={5}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <View style={[styles.cell, { width: tileWidth }]}><ProfileTile profile={item} compact={tileWidth < 150 * textScale} ownInterests={own.interests} ownTags={own.tags} onPress={() => router.push(`/profile/${item.id}`)} /></View>}
        ListEmptyComponent={!locationAllowed ? (
          <EmptyState icon="location-outline" title={t('location.staleTitle')} body={t('location.lockedHint')}
            action={<Button label={t('location.verifyAgain')} onPress={() => router.push('/location-gate')} />} />
        ) : snapshot.loading ? (
          <View accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} style={styles.loading}><ActivityIndicator size="large" color={theme.colors.accent} /></View>
        ) : snapshot.error ? (
          <EmptyState icon="cloud-offline-outline" title={t('discover.error')} action={<Button label={t('common.retry')} onPress={load} />} />
        ) : (
          <EmptyState icon="people-outline" title={t('discover.emptyTitle')} body={t('discovery.emptyHelp')}
            action={<View style={{gap:8}}><Button variant="secondary" label={t('discovery.adjust')} onPress={()=>router.push('/filters')}/><Button variant="secondary" label={activeFilters ? t('filters.clear') : t('common.retry')} onPress={activeFilters ? () => setDiscoveryFilters({ ...defaultFilters }) : load} /></View>} />
        )}
        ListFooterComponent={snapshot.items.length > 0 ? (
          <View style={styles.footer}>
            {snapshot.error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('discover.error')}</Text>}
            {snapshot.cursor ? <Button variant="secondary" label={snapshot.error ? t('common.retry') : t('discovery.more')} loading={snapshot.loading} onPress={() => void feed.more()} /> :
              <Text style={[styles.end, { color: theme.colors.textMuted }]}>{t('discovery.end')}</Text>}
          </View>
        ) : null}
      />
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  feed: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  header: { gap: 12, paddingTop: 18, paddingBottom: 10 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingCopy: { flex: 1 }, title: { fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { fontSize: 13, lineHeight: 18 }, privacy: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44 },
  privacyText: { flex: 1, fontSize: 12, lineHeight: 18 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }, chips: { gap: 8, paddingRight: 8 },
  resultBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  resultText: { fontSize: 12, flex: 1 }, clear: { minHeight: 44, justifyContent: 'center' },
  columns: { gap: 10 }, cell: { width: '48.5%', marginBottom: 10 },
  loading: { minHeight: 280, justifyContent: 'center', alignItems: 'center' },
  footer: { paddingVertical: 20, gap: 12 }, end: { textAlign: 'center', fontSize: 13, lineHeight: 20 },
});
