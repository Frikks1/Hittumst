import {
  FilterSection,
  RadiusControl,
  GenderChoices,
  SocialChoices,
  DiagnosisChoices,
} from '@/components/DiscoveryControls';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/Typography';
import { Button, ChoiceChip, Field, IconButton, SectionHeader } from '@/components/ui';
import { FilterSheet } from '@/components/FilterSheet';
import { profileTags } from '@/data/profileTags';
import { interestLabel } from '@/data/interestLabels';
import { useApp } from '@/providers/AppProvider';
import { defaultFilters, type DiscoveryFilters, type Identity, type Intent } from '@/types/domain';
import { genderChoices, orientationChoices } from '@/utils/discoveryPreferences';

export default function FiltersScreen() {
  const {
    discoveryEnabled,
    discoveryFilters,
    setDiscoveryFilters,
    savedFilters,
    saveFilter,
    removeFilter,
    savedFiltersReady,
    savedFiltersError,
    retrySavedFilters,
    locale,
    t,
    theme,
  } = useApp();
  const [draft, setDraft] = useState<DiscoveryFilters>(discoveryFilters);
  const [ageMin, setAgeMin] = useState(String(draft.ageMin));
  const [ageMax, setAgeMax] = useState(String(draft.ageMax));
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const section = (key: string) => ({
    open: open === key,
    onPress: () => setOpen(open === key ? null : key),
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<'saved' | 'error' | null>(null);
  const agesValid =
    /^\d{2}$/.test(ageMin) &&
    /^\d{2}$/.test(ageMax) &&
    +ageMin >= 18 &&
    +ageMax <= 99 &&
    +ageMin <= +ageMax;
  const filters = { ...draft, ageMin: +ageMin, ageMax: +ageMax };
  const matchingTags = useMemo(
    () =>
      profileTags.filter(
        (tag) =>
          tag.category === 'hobbies' &&
          interestLabel(tag.id, locale)
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
      ),
    [locale, query],
  );
  const selectDraft = (value: DiscoveryFilters) => {
    setDraft(value);
    setAgeMin(String(value.ageMin));
    setAgeMax(String(value.ageMax));
    setNotice(null);
  };
  const toggleIdentity = (value: Identity) =>
    setDraft({
      ...draft,
      identities: draft.identities.includes(value)
        ? draft.identities.filter((id) => id !== value)
        : [...draft.identities, value],
    });
  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await saveFilter(name, filters);
      setName('');
      setNotice('saved');
    } catch {
      setNotice('error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <FilterSheet
      footer={(close) => (
        <>
          <Button
            label={t('filters.apply')}
            disabled={!agesValid}
            onPress={() => {
              setDiscoveryFilters(filters);
              close();
            }}
          />
          <Button
            variant="ghost"
            label={t('filters.clear')}
            onPress={() => {
              selectDraft({ ...defaultFilters });
              setQuery('');
            }}
          />
        </>
      )}
    >
      {() => (
        <>
          {discoveryEnabled && (
            <RadiusControl
              value={draft.radiusKm}
              onChange={(radiusKm) => setDraft({ ...draft, radiusKm })}
            />
          )}
          <FilterSection
            title={t('discovery.people')}
            summary={
              draft.genders.length
                ? draft.genders.map((g) => t(`discovery.gender.${g}`)).join(', ')
                : t('discovery.gender.all')
            }
            {...section('people')}
          >
            {discoveryEnabled && (
              <GenderChoices
                value={draft.genders}
                onChange={(genders) => setDraft({ ...draft, genders })}
              />
            )}
            <SectionHeader title={t('filters.age')} />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Field
                  label={t('filters.minAge')}
                  value={ageMin}
                  onChangeText={setAgeMin}
                  keyboardType="number-pad"
                />
              </View>
              <Text style={{ color: theme.colors.text }}>–</Text>
              <View style={styles.flex}>
                <Field
                  label={t('filters.maxAge')}
                  value={ageMax}
                  onChangeText={setAgeMax}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            {!agesValid && (
              <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
                {t('filters.invalidAge')}
              </Text>
            )}
            {(
              [
                ['filters.orientation', orientationChoices],
                ['filters.gender', genderChoices],
              ] as const
            ).map(([key, choices]) => (
              <View key={key} style={styles.group}>
                <SectionHeader
                  title={
                    key === 'filters.gender'
                      ? locale === 'is'
                        ? 'Prófílmerkingar'
                        : 'Profile labels'
                      : t(key)
                  }
                  detail={key === 'filters.orientation' ? t('filters.identityHelp') : undefined}
                />
                <View style={styles.chips}>
                  {choices.map((value) => (
                    <ChoiceChip
                      key={value}
                      label={t(`identity.${value}`)}
                      selected={draft.identities.includes(value)}
                      onPress={() => toggleIdentity(value)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </FilterSection>
          {discoveryEnabled && (
            <FilterSection
              title={t('discovery.connections')}
              summary={t(`discovery.social.${draft.social}`)}
              {...section('connections')}
            >
              <SocialChoices
                value={draft.social}
                onChange={(social) => setDraft({ ...draft, social })}
              />
            </FilterSection>
          )}
          <FilterSection
            title={t('discovery.activity')}
            summary={t(`discovery.activity.${draft.activity}`)}
            {...section('activity')}
          >
            <View style={styles.chips}>
              {(['all', 'now', 'recent', 'month'] as const)
                .filter((a) => discoveryEnabled || a === 'all' || a === 'now')
                .map((activity) => (
                  <ChoiceChip
                    key={activity}
                    label={t(`discovery.activity.${activity}`)}
                    selected={draft.activity === activity}
                    onPress={() => setDraft({ ...draft, activity })}
                  />
                ))}
            </View>
            <Text style={{ color: theme.colors.textMuted }}>{t('discovery.activityHelp')}</Text>
          </FilterSection>
          <FilterSection title={t('discovery.interests')} {...section('interests')}>
            <SectionHeader title={t('filters.intent')} />
            <View style={styles.chips}>
              {(['chat', 'dates', 'friends', 'relationship'] as Intent[]).map((value) => (
                <ChoiceChip
                  key={value}
                  label={t(`intent.${value}`)}
                  selected={draft.intents.includes(value)}
                  onPress={() =>
                    setDraft({
                      ...draft,
                      intents: draft.intents.includes(value)
                        ? draft.intents.filter((item) => item !== value)
                        : [...draft.intents, value],
                    })
                  }
                />
              ))}
            </View>
            <SectionHeader title={`${t('filters.tags')} (${draft.tags.length}/3)`} />
            <TextInput
              accessibilityLabel={t('filters.searchTags')}
              value={query}
              onChangeText={setQuery}
              placeholder={t('filters.searchTags')}
              placeholderTextColor={theme.colors.textMuted}
              style={[
                styles.search,
                {
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            />
            <View style={styles.chips}>
              {[...new Set([...draft.tags, ...matchingTags.map((tag) => tag.id)])].map((id) => (
                <ChoiceChip
                  key={id}
                  label={interestLabel(id, locale)}
                  selected={draft.tags.includes(id)}
                  onPress={() =>
                    setDraft({
                      ...draft,
                      tags: draft.tags.includes(id)
                        ? draft.tags.filter((item) => item !== id)
                        : draft.tags.length < 3
                          ? [...draft.tags, id]
                          : draft.tags,
                    })
                  }
                />
              ))}
            </View>
          </FilterSection>
          {discoveryEnabled && (
            <FilterSection
              title={t('discovery.community')}
              summary={draft.diagnosisIds.map((id) => t(`diagnosis.${id}`)).join(', ')}
              {...section('community')}
            >
              <DiagnosisChoices
                value={draft.diagnosisIds}
                onChange={(diagnosisIds) => setDraft({ ...draft, diagnosisIds })}
              />
              <Text style={{ color: theme.colors.textMuted }}>{t('discovery.presetsPrivate')}</Text>
            </FilterSection>
          )}
          <FilterSection title={t('filters.saved')} {...section('saved')}>
            <SectionHeader title={t('filters.saved')} detail={t('filters.savedHint')} />
            {savedFiltersError && !savedFiltersReady && (
              <Button label={t('common.retry')} onPress={retrySavedFilters} />
            )}
            {!savedFilters.length && (
              <Text style={{ color: theme.colors.textMuted }}>{t('filters.savedEmpty')}</Text>
            )}
            {savedFilters.map((item) => (
              <View key={item.id} style={styles.row}>
                <View style={styles.flex}>
                  <Button
                    variant="secondary"
                    label={item.name}
                    onPress={() => selectDraft(item.filters)}
                  />
                </View>
                <IconButton
                  icon="trash-outline"
                  label={t('filters.removeSaved', { name: item.name })}
                  onPress={() => {
                    if (busy) return;
                    setBusy(true);
                    void removeFilter(item.id)
                      .catch(() => setNotice('error'))
                      .finally(() => setBusy(false));
                  }}
                />
              </View>
            ))}
            {savedFilters.length < 5 ? (
              <>
                <Field
                  label={t('filters.saveName')}
                  value={name}
                  onChangeText={(value) => setName(value.slice(0, 40))}
                  placeholder={t('filters.savePlaceholder')}
                />
                <Button
                  variant="secondary"
                  label={t('filters.save')}
                  icon="bookmark-outline"
                  loading={busy}
                  disabled={!name.trim() || !agesValid || !savedFiltersReady}
                  onPress={() => void save()}
                />
              </>
            ) : (
              <Text style={{ color: theme.colors.textMuted }}>{t('filters.saveLimit')}</Text>
            )}
            {(notice || savedFiltersError) && (
              <Text
                accessibilityRole="alert"
                style={{ color: notice === 'saved' ? theme.colors.success : theme.colors.danger }}
              >
                {t(notice === 'saved' ? 'filters.savedSuccess' : 'filters.saveError')}
              </Text>
            )}
          </FilterSection>
        </>
      )}
    </FilterSheet>
  );
}
const styles = StyleSheet.create({
  group: { gap: 12, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  flex: { flex: 1 },
  search: { minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, fontSize: 16 },
});
