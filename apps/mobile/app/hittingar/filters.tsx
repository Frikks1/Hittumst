import { FilterSheet } from '@/components/FilterSheet';
import {
  FilterSection,
  RadiusControl,
  GenderChoices,
  SocialChoices,
  DiagnosisChoices,
} from '@/components/DiscoveryControls';
import { defaultMeetupFilters } from '@/types/domain';
import { Text } from '@/components/Typography';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, ChoiceChip, textStyles } from '@/components/ui';
import {
  HITTINGUR_CATEGORIES,
  HITTINGUR_INTENTIONS,
  HITTINGUR_VENUE_MODES,
} from '@/features/hittingar/model';
import { useApp } from '@/providers/AppProvider';

const categories = HITTINGUR_CATEGORIES;
const regions = ['capital', 'south', 'west', 'westfjords', 'north', 'east'] as const;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

export default function HittingarFiltersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    timing?: string;
    category?: string;
    accessMode?: string;
    region?: string;
    intention?: string;
    venueMode?: string;
  }>();
  const { discoveryEnabled, t, theme, meetupFilters, setMeetupFilters } = useApp();
  const [draft, setDraft] = useState(meetupFilters);
  const [open, setOpen] = useState<string | null>(null);
  const section = (key: string) => ({
    open: open === key,
    onPress: () => setOpen(open === key ? null : key),
  });
  const [category, setCategory] = useState(first(params.category));
  const [accessMode, setAccessMode] = useState(first(params.accessMode));
  const [region, setRegion] = useState(first(params.region));
  const [intention, setIntention] = useState(first(params.intention));
  const [venueMode, setVenueMode] = useState(first(params.venueMode));

  const apply = () => {
    setMeetupFilters(draft);
    const query = new URLSearchParams({
      timing: first(params.timing) || meetupFilters.timing,
      category,
      accessMode,
      region,
      intention,
      venueMode,
    });
    router.replace(`/(tabs)/hittingar?${query}` as Href);
  };

  return (
    <FilterSheet
      title={t('hittingar.filter.title')}
      fallback="/(tabs)/hittingar"
      footer={() => (
        <>
          <Button label={t('hittingar.filter.apply')} onPress={apply} />
          <Button
            variant="ghost"
            label={t('filters.clear')}
            onPress={() => {
              setDraft(defaultMeetupFilters);
              setCategory('');
              setRegion('');
              setAccessMode('');
              setIntention('');
              setVenueMode('');
            }}
          />
        </>
      )}
    >
      {() => (
        <>
          <View style={{ gap: 14 }}>
            {discoveryEnabled && (
              <>
                <RadiusControl
                  value={draft.radiusKm}
                  onChange={(radiusKm) => setDraft({ ...draft, radiusKm })}
                />
                <FilterSection title={t('diagnosis.audience')} {...section('audience')}>
                  <GenderChoices
                    value={draft.genders}
                    onChange={(genders) => setDraft({ ...draft, genders })}
                  />
                </FilterSection>
                <FilterSection title={t('discovery.connections')} {...section('connections')}>
                  <SocialChoices
                    events
                    value={draft.social}
                    onChange={(social) => setDraft({ ...draft, social })}
                  />
                </FilterSection>
                <FilterSection title={t('discovery.community')} {...section('community')}>
                  <DiagnosisChoices
                    value={draft.diagnosisIds}
                    onChange={(diagnosisIds) => setDraft({ ...draft, diagnosisIds })}
                  />
                </FilterSection>
              </>
            )}
            <FilterSection title={t('discovery.other')} {...section('other')}>
              <Text style={[textStyles.eyebrow, { color: theme.colors.textMuted }]}>
                {t('hittingar.filter.category')}
              </Text>
              <View style={styles.wrap}>
                <ChoiceChip
                  label={t('hittingar.filter.all')}
                  selected={!category}
                  onPress={() => setCategory('')}
                />
                {categories.map((value) => (
                  <ChoiceChip
                    key={value}
                    label={t(`hittingar.category.${value}`)}
                    selected={category === value}
                    onPress={() => setCategory(category === value ? '' : value)}
                  />
                ))}
              </View>
              <Text style={[textStyles.eyebrow, styles.section, { color: theme.colors.textMuted }]}>
                {t('hittingar.filter.access')}
              </Text>
              <View style={styles.wrap}>
                <ChoiceChip
                  label={t('hittingar.filter.all')}
                  selected={!accessMode}
                  onPress={() => setAccessMode('')}
                />
                <ChoiceChip
                  label={t('hittingar.access.open')}
                  selected={accessMode === 'open'}
                  onPress={() => setAccessMode(accessMode === 'open' ? '' : 'open')}
                />
                <ChoiceChip
                  label={t('hittingar.access.private')}
                  selected={accessMode === 'private'}
                  onPress={() => setAccessMode(accessMode === 'private' ? '' : 'private')}
                />
              </View>
              <Text style={[textStyles.eyebrow, styles.section, { color: theme.colors.textMuted }]}>
                {t('hittingar.filter.region')}
              </Text>
              <View style={styles.wrap}>
                <ChoiceChip
                  label={t('hittingar.filter.all')}
                  selected={!region}
                  onPress={() => setRegion('')}
                />
                {regions.map((value) => (
                  <ChoiceChip
                    key={value}
                    label={t(`region.${value}`)}
                    selected={region === value}
                    onPress={() => setRegion(region === value ? '' : value)}
                  />
                ))}
              </View>
              <View style={styles.wrap}>
                {HITTINGUR_INTENTIONS.map((value) => (
                  <ChoiceChip
                    key={value}
                    label={t(`hittingar.intention.${value}`)}
                    selected={intention === value}
                    onPress={() => setIntention(intention === value ? '' : value)}
                  />
                ))}
              </View>
              <View style={styles.wrap}>
                {HITTINGUR_VENUE_MODES.map((value) => (
                  <ChoiceChip
                    key={value}
                    label={t(`hittingar.venue.${value}`)}
                    selected={venueMode === value}
                    onPress={() => setVenueMode(venueMode === value ? '' : value)}
                  />
                ))}
              </View>
            </FilterSection>
          </View>
        </>
      )}
    </FilterSheet>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 40, gap: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { marginTop: 12 },
  preference: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  preferenceCopy: { flex: 1, gap: 4 },
  preferenceTitle: { fontSize: 16, fontWeight: '800' },
  preferenceBody: { fontSize: 13, lineHeight: 19 },
});
