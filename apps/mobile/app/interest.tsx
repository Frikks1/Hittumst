import { Text } from '@/components/Typography';
import { Button, EmptyState, ProfileTile, Screen } from '@/components/ui';
import { profileActivityCopy, profileActivityTime } from '@/i18n/profileActivity';
import { useApp } from '@/providers/AppProvider';
import { useAppearance } from '@/providers/AppearanceProvider';
import { api } from '@/services';
import type { ProfileActivity, ProfileActivityKind } from '@/types/domain';
import { emptyFeed, PagedFeed, type FeedSnapshot } from '@/utils/pagedFeed';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

export default function InterestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const { user, locationAllowed, locale, t, theme } = useApp();
  const { appearance } = useAppearance();
  const copy = profileActivityCopy(locale);
  const initialKind = (Array.isArray(params.tab) ? params.tab[0] : params.tab) === 'taps' ? 'taps' : 'views';
  const [kind, setKind] = useState<ProfileActivityKind>(initialKind);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [views, setViews] = useState(emptyFeed<ProfileActivity>);
  const [taps, setTaps] = useState(emptyFeed<ProfileActivity>);
  const [loaded, setLoaded] = useState({ views: false, taps: false });
  const [feedAccountId, setFeedAccountId] = useState<string | null>(null);
  const sessionRevision = useRef(0);
  const { width, fontScale } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(width);
  const textScale = appearance.textScale * Math.max(1, fontScale);
  const preferredColumns = listWidth >= 700 ? Math.floor(listWidth / 240) : 2;
  const columns = layout === 'list' ? 1 : Math.max(1, Math.min(preferredColumns, Math.floor((listWidth - 24 + 6) / (135 * textScale + 6))));
  const tileWidth = (listWidth - 24 - (columns - 1) * 6) / columns;
  const feeds = useMemo(() => {
    const commit = (activityKind: ProfileActivityKind, snapshot: FeedSnapshot<ProfileActivity>) => {
      (activityKind === 'views' ? setViews : setTaps)(snapshot);
    };
    const fetchPage = async (query: ProfileActivityKind, cursor: string | null) => {
      const revision = sessionRevision.current;
      const page = await api.listProfileActivity(query, cursor);
      if (revision === sessionRevision.current) setLoaded(value => ({ ...value, [query]: true }));
      return page;
    };
    return {
      views: new PagedFeed<ProfileActivity, ProfileActivityKind>(fetchPage, snapshot => commit('views', snapshot)),
      taps: new PagedFeed<ProfileActivity, ProfileActivityKind>(fetchPage, snapshot => commit('taps', snapshot)),
    };
  }, []);
  const snapshot = kind === 'views' ? views : taps;
  const canView = Boolean(user && feedAccountId === user.id && locationAllowed);
  const items = useMemo(() => canView ? [...snapshot.items].sort((left, right) => (Date.parse(right.occurredAt) || 0) - (Date.parse(left.occurredAt) || 0)) : [], [canView, snapshot.items]);

  useEffect(() => { setKind(initialKind); }, [initialKind]);
  useFocusEffect(useCallback(() => {
    sessionRevision.current++;
    setFeedAccountId(user?.id ?? null);
    setLoaded({ views: false, taps: false });
    if (user && locationAllowed) {
      void feeds.views.refresh('views');
      void feeds.taps.refresh('taps');
    } else {
      feeds.views.clear();
      feeds.taps.clear();
    }
    return () => { sessionRevision.current++; feeds.views.pause(); feeds.taps.pause(); };
  }, [feeds, locationAllowed, user?.id]));
  useEffect(() => {
    if (!user || !locationAllowed) {
      sessionRevision.current++;
      setLoaded({ views: false, taps: false });
      feeds.views.clear(); feeds.taps.clear();
    }
  }, [feeds, locationAllowed, user?.id]);
  const refresh = useCallback(() => {
    if (user && locationAllowed) void feeds[kind].refresh(kind);
    else feeds[kind].clear();
  }, [feeds, kind, locationAllowed, user?.id]);
  const open = (item: ProfileActivity) => router.push(`/profile/${item.profile.id}`);
  const countLabel = (activityKind: ProfileActivityKind) => {
    const state = activityKind === 'views' ? views : taps;
    if (!canView || !loaded[activityKind] || (!state.items.length && (state.loading || state.error))) return '—';
    return `${state.items.length}${state.cursor ? '+' : ''}`;
  };

  return <Screen scroll={false} title={copy.title} back>
    <View style={[styles.tabs, { borderBottomColor: theme.colors.border }]}>
      {(['views', 'taps'] as const).map(activityKind => {
        const selected = activityKind === kind;
        const title = activityKind === 'views' ? copy.views : copy.taps;
        return <Pressable key={activityKind} accessibilityRole="tab" accessibilityLabel={`${title} ${countLabel(activityKind)}`}
          accessibilityState={{ selected }} onPress={() => setKind(activityKind)}
          style={({ pressed }) => [styles.tab, { borderBottomColor: selected ? theme.colors.accent : 'transparent' }, pressed && styles.pressed]}>
          <Ionicons name={activityKind === 'views' ? 'eye-outline' : 'flame-outline'} size={19} color={selected ? theme.colors.accent : theme.colors.textMuted} />
          <Text style={[styles.tabLabel, { color: selected ? theme.colors.text : theme.colors.textMuted }]}>{title}</Text>
          <Text accessibilityLiveRegion="polite" style={[styles.tabCount, { color: selected ? theme.colors.accent : theme.colors.textMuted }]}>{countLabel(activityKind)}</Text>
        </Pressable>;
      })}
    </View>
    <View style={styles.toolbar}>
      <View style={styles.toolbarCopy}>
        <Text style={[styles.order, { color: theme.colors.text }]}>{copy.newest}</Text>
        <Text accessibilityLiveRegion="polite" style={[styles.loaded, { color: theme.colors.textMuted }]}>
          {snapshot.loading && !items.length ? t('common.loading') : `${copy.loaded} · ${canView && loaded[kind] ? items.length : '—'}`}
        </Text>
      </View>
      <View style={[styles.layoutSwitch, { backgroundColor: theme.colors.surfaceRaised }]}>
        {(['grid', 'list'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === 'grid' ? copy.grid : copy.list}
          accessibilityState={{ selected: layout === value }} onPress={() => setLayout(value)}
          style={({ pressed }) => [styles.layoutButton, layout === value && { backgroundColor: theme.colors.accentSoft }, pressed && styles.pressed]}>
          <Ionicons name={value === 'grid' ? 'grid-outline' : 'list-outline'} size={21} color={layout === value ? theme.colors.accent : theme.colors.textMuted} />
        </Pressable>)}
      </View>
    </View>
    <View style={styles.feed} onLayout={event => setListWidth(event.nativeEvent.layout.width)}>
      <FlatList
        key={`${layout}-${columns}`}
        data={items}
        numColumns={columns}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        columnWrapperStyle={columns > 1 ? styles.columns : undefined}
        refreshing={snapshot.loading}
        onRefresh={refresh}
        initialNumToRender={12}
        windowSize={5}
        renderItem={({ item }) => layout === 'grid' ? <View style={[styles.gridCell, { width: tileWidth }]}>
          <ProfileTile profile={item.profile} compact={tileWidth < 180 * textScale} onPress={() => open(item)} />
          <View style={styles.activityMeta}>
            <Ionicons name={kind === 'views' ? 'eye-outline' : 'flame-outline'} size={14} color={theme.colors.accent} />
            <Text style={[styles.time, { color: theme.colors.textMuted }]}>{profileActivityTime(item.occurredAt, locale)}</Text>
            {item.count > 1 && <Text accessibilityLabel={`${kind === 'views' ? copy.views : copy.taps}: ${item.count}`} style={[styles.repeat, { color: theme.colors.accent }]}>{item.count}×</Text>}
          </View>
        </View> : <ActivityRow activity={item} kind={kind} onPress={() => open(item)} />}
        ListEmptyComponent={!locationAllowed ? <EmptyState icon="location-outline" title={t('location.staleTitle')} body={t('location.lockedHint')}
          action={<Button label={t('location.verifyAgain')} onPress={() => router.push('/location-gate')} />} /> : snapshot.loading ? <View accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} style={styles.loading}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View> : snapshot.error ? <EmptyState icon="cloud-offline-outline" title={copy.error} action={<Button label={t('common.retry')} onPress={refresh} />} /> :
          <EmptyState icon={kind === 'views' ? 'eye-outline' : 'flame-outline'} title={kind === 'views' ? copy.viewEmpty : copy.tapEmpty} body={kind === 'views' ? copy.viewEmptyBody : copy.tapEmptyBody} />}
        ListFooterComponent={items.length ? <View style={styles.footer}>
          {snapshot.error && <Text accessibilityRole="alert" style={[styles.footerCopy, { color: theme.colors.danger }]}>{copy.error}</Text>}
          {snapshot.cursor ? <>
            <Text style={[styles.footerCopy, { color: theme.colors.textMuted }]}>{copy.partial}</Text>
            <Button variant="secondary" label={snapshot.error ? t('common.retry') : copy.more} loading={snapshot.loading} onPress={() => void feeds[kind].more()} />
          </> : <Text style={[styles.footerCopy, { color: theme.colors.textMuted }]}>{copy.end}</Text>}
        </View> : null}
      />
    </View>
  </Screen>;
}

function ActivityRow({ activity, kind, onPress }: { activity: ProfileActivity; kind: ProfileActivityKind; onPress: () => void }) {
  const { theme, locale, t } = useApp();
  const copy = profileActivityCopy(locale);
  const profile = activity.profile;
  const source = (profile.photos.find(photo => photo.id === profile.coverPhotoId && photo.status === 'approved') ?? profile.photos.find(photo => photo.status === 'approved'))?.url;
  const time = profileActivityTime(activity.occurredAt, locale);
  const action = kind === 'views' ? copy.viewed : copy.tappedYou;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${profile.displayName}, ${profile.age}. ${action}. ${time}. ${activity.count}×`}
    onPress={onPress} style={({ pressed }) => [styles.row, { borderBottomColor: theme.colors.border }, pressed && styles.pressed]}>
    <View style={[styles.avatar, { backgroundColor: theme.colors.surfaceRaised }]}>
      {source ? <Image source={source} recyclingKey={profile.id} cachePolicy="memory" style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="person" size={30} color={theme.colors.textMuted} />}
      {profile.isOnline && <View style={[styles.onlineDot, { borderColor: theme.colors.canvas }]} />}
    </View>
    <View style={styles.rowCopy}>
      <Text numberOfLines={1} style={[styles.name, { color: theme.colors.text }]}>{profile.displayName}, {profile.age}</Text>
      <Text style={[styles.rowLocation, { color: theme.colors.textMuted }]}>{profile.distanceBand ? t(`distance.${profile.distanceBand}`) : t(`region.${profile.region}`)}</Text>
      <View style={styles.rowMeta}>
        <Ionicons name={kind === 'views' ? 'eye-outline' : 'flame-outline'} size={14} color={theme.colors.accent} />
        <Text style={[styles.time, { color: theme.colors.textMuted }]}>{time}</Text>
      </View>
    </View>
    {activity.count > 1 && <View style={[styles.repeatBadge, { backgroundColor: theme.colors.accentSoft }]}>
      <Text style={[styles.repeat, { color: theme.colors.accent }]}>{activity.count}×</Text>
    </View>}
    <Ionicons name="chevron-forward" size={17} color={theme.colors.textMuted} />
  </Pressable>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: 54, borderBottomWidth: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10 },
  tabLabel: { fontSize: 16, fontWeight: '700' },
  tabCount: { fontSize: 14, fontWeight: '800' },
  toolbar: { minHeight: 68, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  toolbarCopy: { flex: 1, gap: 3 },
  order: { fontSize: 13, fontWeight: '700' },
  loaded: { fontSize: 12 },
  layoutSwitch: { flexDirection: 'row', padding: 3, borderRadius: 14 },
  layoutButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  pressed: { opacity: 0.75 },
  feed: { flex: 1 },
  list: { paddingHorizontal: 12, paddingBottom: 16, flexGrow: 1 },
  columns: { gap: 6 },
  gridCell: { marginBottom: 10 },
  activityMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34, paddingHorizontal: 3, paddingVertical: 5 },
  time: { fontSize: 11, lineHeight: 15, flex: 1 },
  repeat: { fontSize: 12, fontWeight: '800' },
  repeatBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  row: { minHeight: 100, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 64, height: 72, borderRadius: 8, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  onlineDot: { position: 'absolute', bottom: 4, left: 4, width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: '#35D581' },
  rowCopy: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '700' },
  rowLocation: { fontSize: 12, lineHeight: 16 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  loading: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingVertical: 20, gap: 12 },
  footerCopy: { textAlign: 'center', fontSize: 13, lineHeight: 18 },
});
