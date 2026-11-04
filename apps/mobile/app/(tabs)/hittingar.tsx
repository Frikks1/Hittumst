import { Text, TextInput } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Button, Screen, textStyles } from '@/components/ui';
import HittingarMap from '@/features/hittingar/HittingarMap';
import { hittingarFeature } from '@/features/hittingar/config';
import { formatHittingurDate, HittingurPrimaryButton } from '@/features/hittingar/components';
import { DiscoveryEventRow } from '@/features/hittingar/DiscoveryEventRow';
import { EventCover } from '@/features/hittingar/EventCover';
import { categoryKey, generalAreaLabel, meetupFeeLabel, type HittingurAction } from '@/features/hittingar/model';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useApp } from '@/providers/AppProvider';
import { api, type RummalApi } from '@/services';
import { defaultMeetupFilters, type MeetupAccessMode, type MeetupCategory, type MeetupDetail, type MeetupFilters, type MeetupIntention, type MeetupRegion, type MeetupSummary, type MeetupVenueMode } from '@/types/domain';
import { confirmAction } from '@/utils/confirmAction';

type Timing = 'all' | 'today' | 'weekend' | 'future';
const meetupApi = api as RummalApi;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function HittingarScreen() { return <HittingarMeetupsScreen />; }

function HittingarMeetupsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ timing?: string; category?: string; accessMode?: string; region?: string; intention?: string; venueMode?: string }>();
  const { demo, t, theme, locale, user, meetupFilters, setMeetupFilters } = useApp();
  const { reload: reloadEntitlement } = useEntitlement();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const mint = theme.dark ? '#97E3CF' : '#17654F';
  const [view, setView] = useState<'map' | 'list'>('list');
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query.trim().toLocaleLowerCase(locale));
  const [items, setItems] = useState<MeetupSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MeetupDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const revision = useRef(0);
  const acting = useRef(false);
  const rawTiming = first(params.timing) ?? meetupFilters.timing;
  const timing: Timing = rawTiming === 'today' || rawTiming === 'weekend' || rawTiming === 'future' ? rawTiming : 'all';

  const filters = useMemo<MeetupFilters>(() => ({
    ...defaultMeetupFilters, ...meetupFilters,
    timing,
    category: (first(params.category) === undefined ? meetupFilters.category : first(params.category) || null) as MeetupCategory | null,
    accessMode: (first(params.accessMode) === undefined ? meetupFilters.accessMode : first(params.accessMode) || null) as MeetupAccessMode | null,
    region: (first(params.region) === undefined ? meetupFilters.region : first(params.region) || null) as MeetupRegion | null,
    intention: (first(params.intention) === undefined ? meetupFilters.intention : first(params.intention) || null) as MeetupIntention | null,
    venueMode: (first(params.venueMode) === undefined ? meetupFilters.venueMode : first(params.venueMode) || null) as MeetupVenueMode | null,
    includeExplicit: false,
  }), [meetupFilters, params.accessMode, params.intention, params.venueMode, params.category, params.region, timing]);

  const load = useCallback(async (preserveSelection = false) => {
    if (!hittingarFeature.enabled) return;
    const request = ++revision.current;
    setLoading(true);
    if (!preserveSelection) { setItems([]); setSelectedId(null); }
    setError(false);
    try {
      const result = await meetupApi.discoverMeetups(filters);
      if (request === revision.current) setItems(result);
    } catch {
      if (request === revision.current) setError(true);
    } finally {
      if (request === revision.current) setLoading(false);
    }
  }, [filters, user?.id]);

  useFocusEffect(useCallback(() => { void load(); return () => { revision.current++; }; }, [load]));

  const displayItems = useMemo(() => search ? items.filter(item => [item.title, item.host.displayName, generalAreaLabel(item, locale), t(categoryKey(item.category))].some(value => value.toLocaleLowerCase(locale).includes(search))) : items, [items, locale, search, t]);
  const selected = displayItems.find(item => item.id === selectedId) ?? (wide ? displayItems[0] ?? null : null);
  const preview = detail?.id === selected?.id ? detail : selected;
  const activeFilterCount = [filters.radiusKm !== null, filters.genders.length > 0, filters.social !== 'all', filters.diagnosisIds.length > 0, filters.category !== null, filters.region !== null, filters.accessMode !== null, filters.intention !== null, filters.venueMode !== null].filter(Boolean).length;
  const joinLimitError = Boolean(actionError && /join.*(limit|quota)|(limit|quota).*join/i.test(actionError));

  useEffect(() => {
    let current = true;
    setDetail(null); setDetailError(false);
    if (!selected || !wide) { setDetailLoading(false); return; }
    setDetailLoading(true);
    void meetupApi.getMeetup(selected.id).then(result => {
      if (current) setDetail(result);
    }).catch(() => {
      if (current) setDetailError(true);
    }).finally(() => {
      if (current) setDetailLoading(false);
    });
    return () => { current = false; };
  }, [selected, wide, user?.id]);

  const openFilters = () => router.push(`/hittingar/filters?${new URLSearchParams({ timing, category: filters.category ?? '', accessMode: filters.accessMode ?? '', region: filters.region ?? '', intention: filters.intention ?? '', venueMode: filters.venueMode ?? '' })}` as Href);
  const openEvent = (id: string) => router.push(`/hittingar/${id}` as Href);
  const setTiming = (value: Timing) => { setMeetupFilters({ ...filters, timing: value }); router.setParams({ timing: value }); };
  const clearFilters = () => { setQuery(''); setMeetupFilters({ ...defaultMeetupFilters, timing }); router.replace(`/(tabs)/hittingar?timing=${timing}` as Href); };

  const runAction = (kind: HittingurAction['kind']) => {
    if (!preview || kind === 'disabled' || acting.current) return;
    if (kind === 'request') { openEvent(preview.id); return; }
    if (kind === 'manage') { router.push(`/hittingar/${preview.id}/manage` as Href); return; }
    const item = preview;
    const operation = async () => {
      if (acting.current) return;
      acting.current = true; setActionBusy(true); setActionError(null);
      const actionRevision = revision.current;
      try {
        if (kind === 'join') await meetupApi.joinMeetup(item.id);
        if (kind === 'cancel_request') await meetupApi.cancelMeetupRequest(item.id);
        if (kind === 'leave') await meetupApi.leaveMeetup(item.id);
        if (actionRevision === revision.current) { await load(true); await reloadEntitlement(); }
      } catch (failure) {
        if (actionRevision === revision.current) setActionError(failure instanceof Error ? failure.message : 'failed');
      } finally {
        acting.current = false; setActionBusy(false);
      }
    };
    if (kind === 'leave' || kind === 'cancel_request') {
      const leave = kind === 'leave';
      confirmAction({ title: t(leave ? 'hittingar.leave.confirmTitle' : 'hittingar.request.cancelTitle'), message: t(leave ? 'hittingar.leave.confirmBody' : 'hittingar.request.cancelBody'), cancelLabel: t('common.cancel'), confirmLabel: t(leave ? 'hittingar.action.leave' : 'hittingar.action.cancelRequest'), destructive: true, onConfirm: operation });
    } else void operation();
  };

  if (!hittingarFeature.enabled) return <Screen title={t('hittingar.title')}><View style={styles.centerState}><Ionicons name="map-outline" size={40} color={theme.colors.textMuted} /><Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.disabledTitle')}</Text><Text style={[textStyles.body, styles.centerCopy, { color: theme.colors.textMuted }]}>{t('hittingar.disabledBody')}</Text></View></Screen>;

  const eventPreview = preview && (
    <ScrollView contentContainerStyle={styles.previewContent}>
      <Pressable accessibilityRole="button" accessibilityLabel={preview.title} onPress={() => openEvent(preview.id)}><EventCover cover={preview.cover} title={preview.title} compact={!wide} /></Pressable>
      <View style={styles.previewCopy}>
        <Text style={[styles.previewDate, { color: theme.colors.accent }]}>{formatHittingurDate(preview.startsAt, locale)}</Text>
        <Text accessibilityRole="header" style={[styles.previewTitle, { color: theme.colors.text }]}>{preview.title}</Text>
        <Text style={[styles.previewMeta, { color: theme.colors.textMuted }]}>{generalAreaLabel(preview, locale)} · {preview.host.displayName}</Text>
        <View style={styles.previewFacts}><Ionicons name="people-outline" size={16} color={mint} /><Text style={[styles.previewMeta, { color: theme.colors.textMuted }]}>{preview.capacity ? t('hittingar.capacityCount', { count: preview.participantCount, capacity: preview.capacity }) : t('hittingar.participantCount', { count: preview.participantCount })}</Text><Text style={[styles.previewAccess, { color: theme.colors.accent }]}>{t(`hittingar.access.${preview.accessMode}`)}</Text></View>
        {detailLoading && <ActivityIndicator color={mint} />}
        {detail?.id === preview.id && <Text style={[styles.description, { color: theme.colors.textMuted }]} numberOfLines={6}>{detail.description}</Text>}
        {detailError && <Text accessibilityRole="alert" style={[styles.previewMeta, { color: theme.colors.danger }]}>{t('hittingar.errorBody')}</Text>}
        <Text style={[styles.previewMeta, { color: theme.colors.text }]}>{meetupFeeLabel(preview, locale)}</Text>
        <HittingurPrimaryButton item={preview} busy={loading || actionBusy} onAction={runAction} />
        <Button label={locale === 'is' ? 'Skoða hitting' : 'View meetup'} icon="arrow-forward-outline" variant="ghost" onPress={() => openEvent(preview.id)} />
      </View>
    </ScrollView>
  );

  return (
    <Screen scroll={false}>
      <View style={[styles.root, wide && styles.rootWide]}>
        <View style={styles.header}>
          <View style={styles.headerCopy}><Text accessibilityRole="header" style={[styles.title, { color: theme.colors.accent }]}>{locale === 'is' ? 'Hittingar' : 'Meetups'}</Text></View>
          <View accessibilityRole="tablist" style={[styles.segment, { backgroundColor: theme.colors.surface }]}>{(['list', 'map'] as const).map(mode => <Pressable key={mode} accessibilityRole="tab" accessibilityState={{ selected: view === mode }} onPress={() => setView(mode)} style={[styles.segmentItem, view === mode && { backgroundColor: theme.colors.surfaceRaised }]}><Text style={[styles.segmentText, { color: view === mode ? theme.colors.text : theme.colors.textMuted }]}>{t(`hittingar.view.${mode}`)}</Text></Pressable>)}</View>
          {<Pressable accessibilityRole="button" accessibilityLabel={t('hittingar.create.action')} onPress={() => router.push('/hittingar/create' as Href)} style={[styles.createButton, { backgroundColor: theme.colors.accent }, !wide && { width: 42, paddingHorizontal: 0 }]}><Ionicons name="add" size={20} color={theme.colors.textOnAccent} />{wide && <Text style={[styles.createText, { color: theme.colors.textOnAccent }]}>{t('hittingar.create.action')}</Text>}</Pressable>}
        </View>
        <View style={styles.searchRow}>
          <View style={[styles.search, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Ionicons name="search-outline" size={17} color={theme.colors.textMuted} /><TextInput accessibilityLabel={locale === 'is' ? 'Leita að hittingum' : 'Search meetups'} placeholder={locale === 'is' ? 'Leita að hittingum' : 'Search meetups'} placeholderTextColor={theme.colors.textMuted} value={query} onChangeText={setQuery} style={[styles.searchInput, { color: theme.colors.text }]} returnKeyType="search" />{query.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={locale === 'is' ? 'Hreinsa leit' : 'Clear search'} onPress={() => setQuery('')} style={styles.clearSearch}><Ionicons name="close-circle" size={17} color={theme.colors.textMuted} /></Pressable>}</View>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t('hittingar.filter.more')}${activeFilterCount ? ` (${activeFilterCount})` : ''}`} onPress={openFilters} style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: activeFilterCount ? theme.colors.accent : theme.colors.border }]}><Ionicons name="options-outline" size={19} color={activeFilterCount ? theme.colors.accent : theme.colors.textMuted} />{activeFilterCount > 0 && <View style={[styles.filterDot, { backgroundColor: theme.colors.accent }]} />}</Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('hittingar.my.title')} onPress={() => router.push('/hittingar/mine' as Href)} style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Ionicons name="calendar-outline" size={19} color={theme.colors.textMuted} /></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.chips}>{(['all', 'today', 'weekend', 'future'] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: timing === value }} onPress={() => setTiming(value)} style={[styles.chip, { backgroundColor: timing === value ? theme.colors.accent : theme.colors.surface, borderColor: timing === value ? theme.colors.accent : theme.colors.border }]}><Text style={[styles.chipText, { color: timing === value ? theme.colors.textOnAccent : theme.colors.textMuted }]}>{t(value === 'all' ? 'hittingar.allDates' : `hittingar.filter.${value}`)}</Text></Pressable>)}</ScrollView>
        {actionError && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('hittingar.actionFailed')}</Text>}
        <View style={[styles.content, wide && styles.desktopContent]}>
          <View style={styles.results}>
            {error ? <View style={styles.centerState}><Ionicons name="cloud-offline-outline" size={32} color={theme.colors.textMuted} /><Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.errorTitle')}</Text><Text style={[textStyles.body, styles.centerCopy, { color: theme.colors.textMuted }]}>{t('hittingar.errorBody')}</Text><Button label={t('common.retry')} onPress={() => void load()} /></View> : loading && items.length === 0 ? <View style={styles.centerState}><ActivityIndicator color={mint} /><Text style={{ color: theme.colors.textMuted }}>{t('common.loading')}</Text></View> : view === 'map' && displayItems.length > 0 ? <HittingarMap items={displayItems} onSelect={setSelectedId} /> : <ScrollView keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load(true)} tintColor={mint} />} contentContainerStyle={styles.list}>{displayItems.length === 0 ? <View style={styles.centerState}><Ionicons name="calendar-outline" size={32} color={mint} /><Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.emptyTitle')}</Text><Text style={[textStyles.body, styles.centerCopy, { color: theme.colors.textMuted }]}>{t('hittingar.emptyBody')}</Text><Button label={search ? (locale === 'is' ? 'Hreinsa leit' : 'Clear search') : t('discovery.adjust')} variant="secondary" onPress={search ? () => setQuery('') : openFilters} /><Button label={t('filters.clear')} variant="ghost" onPress={clearFilters} /></View> : displayItems.map(item => <DiscoveryEventRow key={item.id} item={item} selected={wide && selected?.id === item.id} onPress={() => wide ? setSelectedId(item.id) : openEvent(item.id)} />)}</ScrollView>}
          </View>
          {wide && preview && !error && <View style={[styles.desktopPreview, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>{eventPreview}</View>}
          {!wide && view === 'map' && preview && <View style={[styles.bottomCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setSelectedId(null)} style={styles.close}><Ionicons name="close" size={20} color={theme.colors.text} /></Pressable>{eventPreview}</View>}
        </View>
        {demo && <Text style={[styles.demoDisclosure, { color: theme.colors.textMuted }]}>{t('hittingar.demoDisclosure')}</Text>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTabs: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, width: '100%', maxWidth: 1380, alignSelf: 'center' },
  sectionTab: { minHeight: 48, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  mainSection: { flex: 1 },
  sectionLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  root: { flex: 1, minHeight: 0, paddingHorizontal: 16, paddingTop: 12, position: 'relative' },
  rootWide: { width: '100%', maxWidth: 1380, alignSelf: 'center', paddingHorizontal: 32, paddingTop: 28 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16 },
  headerCopy: { flex: 1, minWidth: 0, gap: 5 },
  title: { fontSize: 25, lineHeight: 32, fontWeight: '800' },
  subtitle: { fontSize: 13, lineHeight: 19 },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 20 },
  segmentItem: { minHeight: 36, minWidth: 51, borderRadius: 18, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  searchRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  search: { flex: 1, minWidth: 0, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 6, paddingLeft: 10 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 12, paddingVertical: 9, paddingHorizontal: 0 },
  clearSearch: { minWidth: 36, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  iconButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  filterDot: { position: 'absolute', right: 6, top: 6, width: 5, height: 5, borderRadius: 3 },
  filters: { flexGrow: 0, marginBottom: 10 },
  chips: { gap: 7, alignItems: 'center', paddingBottom: 2 },
  chip: { minHeight: 34, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  followingChip: { minWidth: 40, paddingHorizontal: 10 },
  allowance: { alignSelf: 'flex-start', minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  allowanceText: { fontSize: 10, lineHeight: 15, flexShrink: 1 },
  actionError: { paddingVertical: 8, gap: 8 },
  content: { flex: 1, minHeight: 0, position: 'relative' },
  desktopContent: { flexDirection: 'row', alignItems: 'stretch', gap: 22 },
  results: { flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' },
  list: { gap: 12, paddingBottom: 84 },
  desktopPreview: { width: 340, maxWidth: '40%', borderWidth: 1, borderRadius: 8, overflow: 'hidden', marginBottom: 18 },
  previewContent: { gap: 12, padding: 12 },
  previewCopy: { gap: 10 },
  previewDate: { fontSize: 11, lineHeight: 16, fontWeight: '800', textTransform: 'uppercase' },
  previewTitle: { fontSize: 19, lineHeight: 25, fontWeight: '800' },
  previewMeta: { fontSize: 12, lineHeight: 18 },
  previewFacts: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  previewAccess: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  description: { fontSize: 13, lineHeight: 21 },
  bottomCard: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '80%', paddingTop: 34, borderWidth: 1, borderRadius: 8 },
  close: { position: 'absolute', zIndex: 2, right: 6, top: 0, width: 40, height: 34, alignItems: 'center', justifyContent: 'center' },
  createButton: { minHeight: 42, borderRadius: 22, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  createText: { fontSize: 12, lineHeight: 17, fontWeight: '800' },
  floatingCreate: { position: 'absolute', bottom: 26, right: 16 },
  demoDisclosure: { fontSize: 9, lineHeight: 14, paddingTop: 6, paddingBottom: 8 },
  centerState: { flex: 1, minHeight: 220, padding: 20, alignItems: 'center', justifyContent: 'center', gap: 13 },
  centerCopy: { textAlign: 'center' },
});
