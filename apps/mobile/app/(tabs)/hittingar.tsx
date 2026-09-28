import { Text } from '@/components/Typography';
import { Ionicons } from '@expo/vector-icons';
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Screen, textStyles } from '@/components/ui';
import HittingarMap from '@/features/hittingar/HittingarMap';
import { hittingarFeature } from '@/features/hittingar/config';
import { HittingurCard, HittingurPrimaryButton, ViewModeToggle } from '@/features/hittingar/components';
import type { HittingurListModel } from '@/features/hittingar/model';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useApp } from '@/providers/AppProvider';
import { api, type RummalApi } from '@/services';
import { defaultMeetupFilters, type MeetupAccessMode, type MeetupCategory, type MeetupFilters, type MeetupIntention, type MeetupVenueMode, type MeetupRegion, type MeetupSummary } from '@/types/domain';

type Timing = 'all' | 'today' | 'weekend' | 'future';
const meetupApi = api as RummalApi;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function HittingarScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ timing?: string; category?: string; accessMode?: string; region?: string; intention?: string; venueMode?: string }>();
  const { demo, t, theme, locale, meetupFilters, setMeetupFilters } = useApp();
  const { entitlement, limits, reload: reloadEntitlement } = useEntitlement();
  const paidSponsor = Boolean(entitlement && entitlement.tier !== 'plebbi');
  const sponsor = (id: string) => router.push((paidSponsor ? `/wallet?meetupId=${encodeURIComponent(id)}` : '/membership') as Href);
  const [actionError, setActionError] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('list');
  const [items, setItems] = useState<MeetupSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState(false);
  const revision = useRef(0);
  const rawTiming = first(params.timing);
  const timing: Timing = rawTiming === 'today' || rawTiming === 'weekend' || rawTiming === 'future' ? rawTiming : 'all';

  const filters = useMemo<MeetupFilters>(() => ({
    ...defaultMeetupFilters, ...meetupFilters,
    timing: timing ?? 'all',
    category: (first(params.category) as MeetupCategory | undefined) || null,
    accessMode: (first(params.accessMode) as MeetupAccessMode | undefined) || null,
    region: (first(params.region) as MeetupRegion | undefined) || null,
    intention: (first(params.intention) as MeetupIntention | undefined) || null,
    venueMode: (first(params.venueMode) as MeetupVenueMode | undefined) || null,
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
  }, [filters]);

  useFocusEffect(useCallback(() => { void load(); return () => { revision.current++; }; }, [load]));

  const displayItems: HittingurListModel[] = items;
  const selected = displayItems.find((item) => item.id === selectedId) ?? null;

  const setTiming = (value: Timing) => {
    setMeetupFilters({ ...filters, timing: value });
    router.setParams({ timing: value });
  };

  const runAction = async (kind: 'join' | 'request' | 'cancel_request' | 'leave' | 'manage' | 'disabled') => {
    if (!selected || kind === 'disabled' || actionBusy) return;
    if (kind === 'request') return router.push(`/hittingar/${selected.id}` as Href);
    if (kind === 'manage') return router.push(`/hittingar/${selected.id}/manage` as Href);
    const actionRevision = revision.current;
    setActionBusy(true); setActionError(null);
    try {
      if (kind === 'join') await meetupApi.joinMeetup(selected.id);
      if (kind === 'cancel_request') await meetupApi.cancelMeetupRequest(selected.id);
      if (kind === 'leave') await meetupApi.leaveMeetup(selected.id);
      if (actionRevision === revision.current) { await load(true); await reloadEntitlement(); }
    } catch (failure) {
      if (actionRevision === revision.current) setActionError(failure instanceof Error ? failure.message : 'failed');
    } finally {
      setActionBusy(false);
    }
  };

  if (!hittingarFeature.enabled) {
    return (
      <Screen title={t('hittingar.title')}>
        <View style={styles.centerState}>
          <Ionicons name="map-outline" size={48} color={theme.colors.textMuted} />
          <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.disabledTitle')}</Text>
          <Text style={[textStyles.body, styles.centerCopy, { color: theme.colors.textMuted }]}>{t('hittingar.disabledBody')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={[textStyles.title, { color: theme.colors.text }]}>{t('hittingar.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{t('hittingar.subtitle')}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('hittingar.notifications.title')} onPress={() => router.push('/hittingar/notifications' as Href)} style={[styles.roundButton, { backgroundColor: theme.colors.surfaceRaised }]}>
            <Ionicons name="notifications-outline" size={22} color={theme.colors.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('hittingar.my.title')} onPress={() => router.push('/hittingar/mine' as Href)} style={[styles.roundButton, { backgroundColor: theme.colors.surfaceRaised }]}>
            <Ionicons name="calendar-outline" size={22} color={theme.colors.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('hittingar.create.title')} onPress={() => router.push('/hittingar/create' as Href)} style={[styles.roundButton, { backgroundColor: theme.colors.accent }]}>
            <Ionicons name="add" size={24} color={theme.colors.textOnAccent} />
          </Pressable>
        </View>
      </View>
      {entitlement && <Pressable accessibilityRole="button" onPress={() => router.push('/membership' as Href)} style={{ paddingHorizontal: 18, paddingBottom: 10 }}><Text style={{ color: theme.colors.textMuted }}>{locale === 'is' ? 'Þátttaka í þessum mánuði' : 'Joining this month'}: {entitlement.joinsUsed}/{limits.joins} · {locale === 'is' ? 'Stofnað' : 'Hosted'}: {entitlement.occurrencesUsed}/{limits.occurrences}</Text></Pressable>}
      {actionError && <View style={{ padding: 14, gap: 8 }}><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{/join.*(limit|quota)|(limit|quota).*join/i.test(actionError) ? (locale === 'is' ? 'Þú hefur náð þátttökumörkum fyrir mánuð þessa hittings.' : 'You have reached your joining allowance for this event’s month.') : t('hittingar.actionFailed')}</Text>{/join.*(limit|quota)|(limit|quota).*join/i.test(actionError) && <Button label={locale === 'is' ? 'Skoða áskriftir' : 'View memberships'} onPress={() => router.push('/membership' as Href)} />}</View>}
      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/hittingar/following' as Href)} style={[styles.chip, { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.border }]}><Ionicons name="heart-outline" size={17} color={theme.colors.accent} /><Text style={[styles.chipText, { color: theme.colors.text }]}>{locale === 'is' ? 'Í eftirfylgni' : 'Following'}</Text></Pressable>
          {(['all', 'today', 'weekend', 'future'] as const).map((value) => (
            <Pressable key={value} accessibilityRole="checkbox" accessibilityState={{ checked: timing === value }} onPress={() => setTiming(value)} style={[styles.chip, { backgroundColor: timing === value ? theme.colors.accent : theme.colors.surface, borderColor: theme.colors.border }]}>
              <Text style={[styles.chipText, { color: timing === value ? theme.colors.textOnAccent : theme.colors.text }]}>{t(value === 'all' ? 'hittingar.allDates' : `hittingar.filter.${value}`)}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => router.push(`/hittingar/filters?${new URLSearchParams({ timing, category: first(params.category) ?? '', accessMode: first(params.accessMode) ?? '', region: first(params.region) ?? '', intention: first(params.intention) ?? '', venueMode: first(params.venueMode) ?? '' })}` as Href)} style={[styles.chip, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Ionicons name="options-outline" size={17} color={theme.colors.text} />
            <Text style={[styles.chipText, { color: theme.colors.text }]}>{t('hittingar.filter.more')} · {[filters.radiusKm !== null, filters.genders.length > 0, filters.social !== 'all', filters.diagnosisIds.length > 0, filters.category !== null, filters.region !== null, filters.accessMode !== null, filters.intention !== null, filters.venueMode !== null].filter(Boolean).length}</Text>
          </Pressable>
        </ScrollView>
        <ViewModeToggle value={view} onChange={setView} />
      </View>
      {demo && (
        <View style={[styles.demoDisclosure, { backgroundColor: theme.colors.accentSoft }]}>
          <Ionicons name="information-circle-outline" size={16} color={theme.colors.accent} />
          <Text style={[styles.demoCopy, { color: theme.colors.text }]}>{t('hittingar.demoDisclosure')}</Text>
        </View>
      )}
      <View style={styles.content}>
        {error ? (
          <View style={styles.centerState}>
            <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.errorTitle')}</Text>
            <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{t('hittingar.errorBody')}</Text>
            <Button label={t('common.retry')} onPress={() => void load()} />
          </View>
        ) : view === 'map' ? (
          <HittingarMap items={displayItems} onSelect={setSelectedId} />
        ) : (
          <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />} contentContainerStyle={styles.list}>
            {displayItems.length === 0 && !loading ? (
              <View style={styles.centerState}>
                <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.emptyTitle')}</Text>
                <Text style={[textStyles.body, styles.centerCopy, { color: theme.colors.textMuted }]}>{t('hittingar.emptyBody')}</Text>
                <Button label={t('discovery.adjust')} variant="secondary" onPress={()=>router.push('/hittingar/filters' as Href)}/><Button label={t('filters.clear')} variant="ghost" onPress={()=>{setMeetupFilters({...defaultMeetupFilters,timing});router.replace(('/(tabs)/hittingar?timing='+timing) as Href);}}/><Button label={t('hittingar.create.action')} icon="add-circle-outline" onPress={() => router.push('/hittingar/create' as Href)} />
              </View>
            ) : displayItems.map((item) => (
              <HittingurCard key={item.id} item={item} paidSponsor={paidSponsor} onSponsor={() => sponsor(item.id)} onPress={() => router.push(`/hittingar/${item.id}` as Href)} />
            ))}
          </ScrollView>
        )}
        {view === 'map' && selected && (
          <View style={[styles.bottomCard, { backgroundColor: theme.colors.canvas }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setSelectedId(null)} style={styles.close}>
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </Pressable>
            <HittingurCard item={selected} primary paidSponsor={paidSponsor} onSponsor={() => sponsor(selected.id)} onPress={() => router.push(`/hittingar/${selected.id}` as Href)} />
            <HittingurPrimaryButton item={selected} busy={loading || actionBusy} onAction={(kind) => void runAction(kind)} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerCopy: { flexGrow: 1, flexShrink: 1, minWidth: 220 },
  subtitle: { fontSize: 13, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
  roundButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  toolbar: { paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  chips: { gap: 7, paddingRight: 8 },
  chip: { minHeight: 38, borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  chipText: { fontSize: 12, fontWeight: '800' },
  demoDisclosure: { minHeight: 36, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 7 },
  demoCopy: { flex: 1, fontSize: 11, lineHeight: 15 },
  content: { flex: 1, position: 'relative' },
  list: { padding: 12, paddingBottom: 120, gap: 10 },
  bottomCard: { position: 'absolute', left: 8, right: 8, bottom: 8, padding: 8, paddingTop: 28, borderRadius: 26, gap: 8, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 22, elevation: 10 },
  close: { position: 'absolute', zIndex: 2, right: 12, top: 4, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  centerState: { flex: 1, minHeight: 360, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 14 },
  centerCopy: { textAlign: 'center' },
});
