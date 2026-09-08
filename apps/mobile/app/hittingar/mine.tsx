import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, ChoiceChip, DemoBanner, Screen, textStyles } from '@/components/ui';
import { HittingurCard, StatusPill } from '@/features/hittingar/components';
import { useApp } from '@/providers/AppProvider';
import { api, type RummalApi } from '@/services';
import type { MeetupDetail } from '@/types/domain';

type MySection = 'upcoming' | 'previous' | 'drafts';
const meetupApi = api as RummalApi;

export default function MyHittingarScreen() {
  const router = useRouter();
  const { t, theme } = useApp();
  const [items, setItems] = useState<MeetupDetail[]>([]);
  const [section, setSection] = useState<MySection>('upcoming');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await meetupApi.listMyMeetups()); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const visible = useMemo(() => {
    const now = Date.now();
    if (section === 'drafts') return items.filter((item) => item.status === 'draft');
    if (section === 'previous') return items.filter((item) => item.status !== 'draft' && (item.status !== 'published' || Date.parse(item.effectiveEnd) < now));
    return items.filter((item) => item.status === 'published' && Date.parse(item.effectiveEnd) >= now);
  }, [items, section]);

  return (
    <Screen back title={t('hittingar.my.title')} scroll={false}>
      <DemoBanner />
      <View style={styles.header}>
        <Text style={[textStyles.body, { color: theme.colors.textMuted }]}>{t('hittingar.my.body')}</Text>
        <Button label={t('hittingar.create.action')} icon="add-circle-outline" onPress={() => router.push('/hittingar/create' as Href)} />
      </View>
      <View style={styles.sections} accessibilityRole="tablist">
        {(['upcoming', 'previous', 'drafts'] as const).map((value) => <ChoiceChip key={value} label={t(`hittingar.my.${value}`)} selected={section === value} onPress={() => setSection(value)} />)}
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />} contentContainerStyle={styles.list}>
        {visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[textStyles.heading, { color: theme.colors.text }]}>{t('hittingar.my.emptyTitle')}</Text>
            <Text style={[textStyles.body, styles.center, { color: theme.colors.textMuted }]}>{t(`hittingar.my.empty.${section}`)}</Text>
          </View>
        ) : visible.map((item) => (
          <View key={item.id} style={styles.item}>
            {item.status !== 'published' && <View style={styles.status}><StatusPill label={t(`hittingar.status.${item.status}`)} tone={item.status === 'draft' ? 'warning' : 'danger'} /></View>}
            <HittingurCard item={item} onPress={() => router.push(item.capabilities.canEdit ? `/hittingar/${item.id}/manage` as Href : `/hittingar/${item.id}` as Href)} />
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
