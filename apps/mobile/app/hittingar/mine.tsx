import { Text } from '@/components/Typography';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, ChoiceChip, Screen, textStyles } from '@/components/ui';
import { HittingurCard, StatusPill } from '@/features/hittingar/components';
import { useEntitlement } from '@/hooks/useEntitlement';
import { useApp } from '@/providers/AppProvider';
import { api, type RummalApi } from '@/services';
import type { MeetupDetail } from '@/types/domain';

type MySection = 'upcoming' | 'previous' | 'drafts';
const meetupApi = api as RummalApi;

export default function MyHittingarScreen() {
  const router = useRouter();
  const { t, theme, user, locale } = useApp();
  const { entitlement, limits } = useEntitlement();
  const paidSponsor = Boolean(entitlement && entitlement.tier !== 'plebbi');
  const [items, setItems] = useState<MeetupDetail[]>([]);
  const [section, setSection] = useState<MySection>('upcoming');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const revision = useRef(0);

  const load = useCallback(async () => {
    const request = ++revision.current; setLoading(true); setError(false);
    try { const value = await meetupApi.listMyMeetups(); if (request === revision.current) setItems(value); }
    catch { if (request === revision.current) setError(true); }
    finally { if (request === revision.current) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { setItems([]); void load(); return () => { revision.current++; }; }, [load, user?.id]));

  const visible = useMemo(() => {
    const now = Date.now();
    if (section === 'drafts') return items.filter((item) => item.status === 'draft');
    if (section === 'previous') return items.filter((item) => item.status !== 'draft' && (item.status !== 'published' || Date.parse(item.effectiveEnd) < now));
    return items.filter((item) => item.status === 'published' && Date.parse(item.effectiveEnd) >= now);
  }, [items, section]);

  return (
    <Screen back title={t('hittingar.my.title')} scroll={false}>
      <View style={styles.header}>
        <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{t('hittingar.my.body')}</Text>
        {entitlement && <Text style={{ color: theme.colors.textMuted }}>{locale === 'is' ? 'Þessi mánuður: þátttaka' : 'This month: joined'} {entitlement.joinsUsed}/{limits.joins} · {locale === 'is' ? 'stofnað' : 'hosted'} {entitlement.occurrencesUsed}/{limits.occurrences}</Text>}
        <Button variant="secondary" label={locale === 'is' ? 'Umsagnir mínar' : 'My feedback'} onPress={() => router.push('/hittingar/feedback' as Href)} />
        <Button label={t('hittingar.create.action')} icon="add-circle-outline" onPress={() => router.push('/hittingar/create' as Href)} />
      </View>
      <View style={styles.sections} accessibilityRole="tablist">
        {(['upcoming', 'previous', 'drafts'] as const).map((value) => <ChoiceChip key={value} label={t(`hittingar.my.${value}`)} selected={section === value} onPress={() => setSection(value)} />)}
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />} contentContainerStyle={styles.list}>
        {error && <View><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('common.error')}</Text><Button label={t('common.retry')} onPress={() => void load()} /></View>}
        {visible.length === 0 && !loading && !error ? (
          <View style={styles.empty}>
            <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.my.emptyTitle')}</Text>
            <Text style={[textStyles.body, styles.center, { color: theme.colors.textMuted }]}>{t(`hittingar.my.empty.${section}`)}</Text>
          </View>
        ) : visible.map((item) => (
          <View key={item.id} style={styles.item}>
            {item.status !== 'published' && <View style={styles.status}><StatusPill label={t(`hittingar.status.${item.status}`)} tone={item.status === 'draft' ? 'warning' : 'danger'} /></View>}
            <HittingurCard item={item} paidSponsor={paidSponsor} onSponsor={() => router.push((paidSponsor ? `/wallet?meetupId=${encodeURIComponent(item.id)}` : '/membership') as Href)} onPress={() => router.push(item.capabilities.canEdit ? `/hittingar/${item.id}/manage` as Href : `/hittingar/${item.id}` as Href)} />
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingTop: 14, gap: 12 },
  sections: { padding: 18, paddingBottom: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { padding: 14, paddingBottom: 48, gap: 12 },
  item: { gap: 7 },
  status: { alignItems: 'flex-start' },
  empty: { minHeight: 340, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  center: { textAlign: 'center' },
});
