import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Brand, Button, ChoiceChip, EmptyState, IconButton, ProfileTile, Screen } from '@/components/ui';
import { profileActivityCopy } from '@/i18n/profileActivity';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';
import { api } from '@/services';
import { defaultFilters, type DiscoveryFilters, type Intent, type PublicProfile } from '@/types/domain';
import { discoveryFilterCount } from '@/utils/discoveryPreferences';
import { emptyFeed, PagedFeed } from '@/utils/pagedFeed';

export default function DiscoverScreen() {
  const router = useRouter();
  const { discoveryFilters, setDiscoveryFilters, locationAllowed, user, t, theme, locale } = useApp();
  const { appearance } = useAppearance();
  const copy = profileActivityCopy(locale);
  const { width, fontScale } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(width);
  const [intentExpanded, setIntentExpanded] = useState(false);
  const textScale = appearance.textScale * Math.max(1, fontScale);
  const preferredColumns = listWidth >= 700
    ? Math.max(2, Math.floor(listWidth / (appearance.discoveryLayout === 'large' ? 380 : appearance.discoveryLayout === 'dense' ? 190 : 250)))
    : appearance.discoveryLayout === 'large' ? 1 : appearance.discoveryLayout === 'dense' && textScale <= 1.15 ? 3 : 2;
  const columns = Math.max(1, Math.min(preferredColumns, Math.floor((listWidth - 12 + 4) / (100 * textScale + 4))));
  const tileWidth = Math.max(80, (listWidth - 12 - (columns - 1) * 4) / columns);
  const [own, setOwn] = useState<{ interests: string[]; tags: string[] }>({ interests: [], tags: [] });
  useFocusEffect(useCallback(() => {
    let active = true;
    void api.getOwnProfile().then(profile => { if (active) setOwn(profile); }).catch(() => { if (active) setOwn({ interests: [], tags: [] }); });
    return () => { active = false; };
  }, [user?.id]));
  const [snapshot, setSnapshot] = useState(emptyFeed<PublicProfile>);
  const feed = useMemo(() => new PagedFeed<PublicProfile, DiscoveryFilters>((query, cursor) => api.discover(query, cursor), setSnapshot), []);
  const activeFilters = discoveryFilterCount(discoveryFilters);
  const showIntents = intentExpanded;
  const load = useCallback(() => {
    if (locationAllowed && user) void feed.refresh(discoveryFilters);
    else feed.clear();
  }, [discoveryFilters, feed, locationAllowed, user]);
  useEffect(() => { if (!locationAllowed || !user) feed.clear(); }, [feed, locationAllowed, user]);
  useFocusEffect(useCallback(() => { load(); return () => feed.pause(); }, [feed, load]));

  const header = (
    <View style={styles.header}>
      <View style={styles.topbar}>
        <Brand compact />
        <Pressable accessibilityRole="link" accessibilityLabel={copy.currentLocation + '. ' + copy.protectedLocation} onPress={() => router.push('/privacy')}
          style={({ pressed }) => [styles.location, { backgroundColor: theme.colors.surface }, pressed && styles.pressed]}>
          <View style={styles.locationCopy}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>{t('discover.title')}</Text>
            <View style={styles.locationLine}>
              <Ionicons name="shield-checkmark-outline" size={14} color={theme.colors.accent} />
              <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{copy.protectedLocation}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
        </Pressable>
        <IconButton icon="options-outline" label={t('discovery.filterCount', { count: activeFilters })} onPress={() => router.push('/filters')} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <QuickChip icon="ellipse" label={copy.online} selected={discoveryFilters.activity === 'now'}
          onPress={() => setDiscoveryFilters({ ...discoveryFilters, activity: discoveryFilters.activity === 'now' ? 'all' : 'now' })} />
        <QuickChip icon="star" label={t('discovery.social.favorites')} selected={discoveryFilters.social === 'favorites'}
          onPress={() => setDiscoveryFilters({ ...discoveryFilters, social: discoveryFilters.social === 'favorites' ? 'all' : 'favorites' })} />
        <QuickChip icon="flame-outline" label={copy.title} onPress={() => router.push('/interest')} />
        <QuickChip icon={showIntents ? 'chevron-up' : 'chevron-down'} label={copy.lookingFor + (discoveryFilters.intents.length ? ' · ' + discoveryFilters.intents.length : '')}
          expanded={showIntents} onPress={() => setIntentExpanded(value => !value)} />
      </ScrollView>
      {showIntents && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <ChoiceChip label={t('discovery.everyone')} selected={!discoveryFilters.intents.length} onPress={() => setDiscoveryFilters({ ...discoveryFilters, intents: [] })} />
        {(['chat', 'dates', 'friends', 'relationship'] as Intent[]).map(intent => (
          <ChoiceChip key={intent} label={t(`intent.${intent}`)} selected={discoveryFilters.intents.includes(intent)}
            onPress={() => setDiscoveryFilters({ ...discoveryFilters, intents: discoveryFilters.intents.includes(intent) ? discoveryFilters.intents.filter(value => value !== intent) : [...discoveryFilters.intents, intent] })} />
        ))}
      </ScrollView>}
      <View style={styles.resultBar}>
        <Text accessibilityLiveRegion="polite" style={[styles.resultText, { color: theme.colors.textMuted }]}>
          {snapshot.loading && !snapshot.items.length ? t('common.loading') : t(snapshot.items.length === 1 ? 'discovery.oneResult' : 'discovery.results', { count: snapshot.items.length })}
        </Text>
        {activeFilters > 0 && <Pressable accessibilityRole="button" onPress={() => setDiscoveryFilters({ ...defaultFilters })} style={styles.clear}>
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: '700' }}>{t('filters.clear')} · {activeFilters}</Text>
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
          initialNumToRender={12}
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
              action={<View style={styles.emptyActions}><Button variant="secondary" label={t('discovery.adjust')} onPress={() => router.push('/filters')} /><Button variant="secondary" label={activeFilters ? t('filters.clear') : t('common.retry')} onPress={activeFilters ? () => setDiscoveryFilters({ ...defaultFilters }) : load} /></View>} />
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

function QuickChip({ icon, label, selected, expanded, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; selected?: boolean; expanded?: boolean; onPress: () => void }) {
  const { theme } = useApp();
  return <Pressable accessibilityRole={selected === undefined ? 'button' : 'checkbox'} accessibilityLabel={label} accessibilityState={{ checked: selected, expanded }} onPress={onPress}
    style={({ pressed }) => [styles.quickChip, { backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surfaceRaised, borderColor: selected ? theme.colors.accent : theme.colors.border }, pressed && styles.pressed]}>
    <Ionicons accessible={false} accessibilityElementsHidden importantForAccessibility="no" name={icon} size={icon === 'ellipse' ? 9 : 17} color={selected ? theme.colors.accent : theme.colors.text} />
    <Text style={[styles.quickLabel, { color: theme.colors.text }]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  feed: { flex: 1 },
  list: { paddingHorizontal: 6, paddingBottom: 20, flexGrow: 1 },
  header: { gap: 9, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 4 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  location: { flex: 1, minHeight: 52, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationCopy: { flex: 1, gap: 3 },
  title: { fontSize: 19, lineHeight: 23, fontWeight: '900', letterSpacing: -0.4 },
  locationLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  subtitle: { flex: 1, fontSize: 11, lineHeight: 15 },
  chips: { gap: 7, paddingRight: 8 },
  quickChip: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  quickLabel: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  resultBar: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  resultText: { fontSize: 12, flex: 1 },
  clear: { minHeight: 44, justifyContent: 'center' },
  columns: { gap: 4 },
  cell: { marginBottom: 4 },
  emptyActions: { gap: 8 },
  loading: { minHeight: 280, justifyContent: 'center', alignItems: 'center' },
  footer: { paddingHorizontal: 8, paddingVertical: 20, gap: 12 },
  end: { textAlign: 'center', fontSize: 13, lineHeight: 20 },
});
