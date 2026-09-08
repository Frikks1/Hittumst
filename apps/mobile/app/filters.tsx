import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, ChoiceChip, Screen, SectionHeader } from '@/components/ui';
import { profileTags } from '@/data/profileTags';
import { useApp } from '@/providers/AppProvider';
import type { Identity, Intent } from '@/types/domain';

export default function FiltersScreen() {
  const router = useRouter();
  const { discoveryFilters, setDiscoveryFilters, t, theme } = useApp();
  const initialAge = discoveryFilters.ageMin === 18 && discoveryFilters.ageMax === 25 ? '18to25' : discoveryFilters.ageMin === 26 && discoveryFilters.ageMax === 35 ? '26to35' : discoveryFilters.ageMin === 36 ? '36plus' : 'all';
  const [age, setAge] = useState(initialAge);
  const [identities, setIdentities] = useState<Identity[]>(discoveryFilters.identities);
  const [intents, setIntents] = useState<Intent[]>(discoveryFilters.intents);
  const [online, setOnline] = useState(discoveryFilters.onlineOnly);
  const [tags, setTags] = useState(discoveryFilters.tags);
  const [query, setQuery] = useState('');
  const matchingTags = useMemo(() => profileTags.filter((tag) => tag.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 40), [query]);
  const toggle = <T,>(value: T, values: T[], setValues: (values: T[]) => void) => setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  return (
    <Screen back title={t('filters.title')}>
      <View style={styles.page}>
        <SectionHeader title={t('filters.title')} detail={t('discover.subtitle')} />
        <View style={[styles.group, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.label, { color: theme.colors.text }]}>{t('filters.age')}</Text>
          <View style={styles.chips}>{['all', '18to25', '26to35', '36plus'].map((item) => <ChoiceChip key={item} label={t(`filters.age${item === 'all' ? 'All' : item[0]!.toUpperCase() + item.slice(1)}` as Parameters<typeof t>[0])} selected={age === item} onPress={() => setAge(item)} />)}</View>
          <Text style={[styles.label, { color: theme.colors.text }]}>{t('filters.identity')}</Text>
          <View style={styles.chips}>{(['gay', 'bi', 'queer', 'trans', 'nonbinary', 'lesbian'] as Identity[]).map((item) => <ChoiceChip key={item} label={t(`identity.${item}`)} selected={identities.includes(item)} onPress={() => toggle(item, identities, setIdentities)} />)}</View>
          <Text style={[styles.label, { color: theme.colors.text }]}>{t('filters.intent')}</Text>
          <View style={styles.chips}>{(['chat', 'dates', 'friends', 'relationship'] as Intent[]).map((item) => <ChoiceChip key={item} label={t(`intent.${item}`)} selected={intents.includes(item)} onPress={() => toggle(item, intents, setIntents)} />)}</View>
          <ChoiceChip label={t('filters.onlineOnly')} selected={online} onPress={() => setOnline(!online)} />
        </View>
        <View style={[styles.group, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Text style={[styles.label, { color: theme.colors.text }]}>{t('filters.tags')} ({tags.length}/3)</Text>
          <TextInput value={query} onChangeText={setQuery} placeholder={t('filters.searchTags')} placeholderTextColor={theme.colors.textMuted} style={[styles.search, { color: theme.colors.text, backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]} />
          <View style={styles.chips}>{matchingTags.map((tag) => <ChoiceChip key={tag.id} label={tag.label} selected={tags.includes(tag.id)} onPress={() => setTags(tags.includes(tag.id) ? tags.filter((item) => item !== tag.id) : tags.length < 3 ? [...tags, tag.id] : tags)} />)}</View>
        </View>
        <View style={styles.spacer} />
        <Button variant="secondary" label={t('filters.clear')} onPress={() => { setAge('all'); setIdentities([]); setIntents([]); setOnline(false); setTags([]); setQuery(''); }} />
        <Button label={t('filters.apply')} onPress={() => {
          const ages = age === '18to25' ? [18, 25] : age === '26to35' ? [26, 35] : age === '36plus' ? [36, 99] : [18, 99];
          setDiscoveryFilters({ ageMin: ages[0]!, ageMax: ages[1]!, identities, intents, onlineOnly: online, tags });
          router.back();
        }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 16, flex: 1 },
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, padding: 16, gap: 15 },
  label: { fontWeight: '900', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  search: { minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, fontSize: 16 },
  spacer: { flex: 1, minHeight: 16 },
});
