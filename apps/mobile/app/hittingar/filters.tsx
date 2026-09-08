import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, ChoiceChip, Screen, textStyles } from '@/components/ui';
import { HITTINGUR_CATEGORIES, HITTINGUR_INTENTIONS, HITTINGUR_VENUE_MODES } from '@/features/hittingar/model';
import { useApp } from '@/providers/AppProvider';

const categories = HITTINGUR_CATEGORIES;
const regions = ['capital', 'south', 'west', 'westfjords', 'north', 'east'] as const;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

export default function HittingarFiltersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; accessMode?: string; region?: string; intention?: string; venueMode?: string }>();
  const { t, theme } = useApp();
  const [category, setCategory] = useState(first(params.category));
  const [accessMode, setAccessMode] = useState(first(params.accessMode));
  const [region, setRegion] = useState(first(params.region));
  const [intention, setIntention] = useState(first(params.intention));
  const [venueMode, setVenueMode] = useState(first(params.venueMode));

  const apply = () => {
    const query = new URLSearchParams({ category, accessMode, region, intention, venueMode });
    router.replace(`/(tabs)/hittingar?${query}` as Href);
  };

  return (
    <Screen back title={t('hittingar.filter.title')}>
      <View style={styles.page}>
        <Text style={[textStyles.eyebrow, { color: theme.colors.textMuted }]}>{t('hittingar.filter.category')}</Text>
        <View style={styles.wrap}>
          <ChoiceChip label={t('hittingar.filter.all')} selected={!category} onPress={() => setCategory('')} />
          {categories.map((value) => <ChoiceChip key={value} label={t(`hittingar.category.${value}`)} selected={category === value} onPress={() => setCategory(category === value ? '' : value)} />)}
        </View>
        <Text style={[textStyles.eyebrow, styles.section, { color: theme.colors.textMuted }]}>{t('hittingar.filter.access')}</Text>
        <View style={styles.wrap}>
          <ChoiceChip label={t('hittingar.filter.all')} selected={!accessMode} onPress={() => setAccessMode('')} />
          <ChoiceChip label={t('hittingar.access.open')} selected={accessMode === 'open'} onPress={() => setAccessMode(accessMode === 'open' ? '' : 'open')} />
          <ChoiceChip label={t('hittingar.access.private')} selected={accessMode === 'private'} onPress={() => setAccessMode(accessMode === 'private' ? '' : 'private')} />
        </View>
        <Text style={[textStyles.eyebrow, styles.section, { color: theme.colors.textMuted }]}>{t('hittingar.filter.region')}</Text>
        <View style={styles.wrap}>
          <ChoiceChip label={t('hittingar.filter.all')} selected={!region} onPress={() => setRegion('')} />
          {regions.map((value) => <ChoiceChip key={value} label={t(`region.${value}`)} selected={region === value} onPress={() => setRegion(region === value ? '' : value)} />)}
        </View>
        <View style={styles.wrap}>
          {HITTINGUR_INTENTIONS.map((value) => <ChoiceChip key={value} label={t(`hittingar.intention.${value}`)} selected={intention === value} onPress={() => setIntention(intention === value ? '' : value)} />)}
        </View>
        <View style={styles.wrap}>
          {HITTINGUR_VENUE_MODES.map((value) => <ChoiceChip key={value} label={t(`hittingar.venue.${value}`)} selected={venueMode === value} onPress={() => setVenueMode(venueMode === value ? '' : value)} />)}
        </View>
        <Button label={t('hittingar.filter.apply')} onPress={apply} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 40, gap: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { marginTop: 12 },
  preference: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  preferenceCopy: { flex: 1, gap: 4 },
  preferenceTitle: { fontSize: 16, fontWeight: '800' },
  preferenceBody: { fontSize: 13, lineHeight: 19 },
});
