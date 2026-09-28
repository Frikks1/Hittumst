import { Text, TextInput } from '@/components/Typography';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Button, ChoiceChip, Screen } from '@/components/ui';
import { profileTags } from '@/data/profileTags';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { OwnProfile, ProfileTagCategory } from '@/types/domain';

const categories: ProfileTagCategory[] = ['kinks', 'hobbies', 'personality', 'other'];

export default function MyTagsScreen() {
  const router = useRouter();
  const { t, theme, user } = useApp();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const revision = useRef(0);
  const adultTagsEnabled = profile?.adultProfileTagsEnabled ?? false;
  const visible = useMemo(() => profileTags.filter((tag) =>
    (adultTagsEnabled || tag.category !== 'kinks')
    && tag.label.toLowerCase().includes(query.trim().toLowerCase())
  ), [adultTagsEnabled, query]);

  useEffect(() => {
    const request = ++revision.current; setLoading(true); setProfile(null); setError(false); setSaving(false);
    void api.getOwnProfile().then(own => {
      if (request === revision.current) { setProfile(own); setSelected(own.tags); }
    }).catch(() => { if (request === revision.current) setError(true); })
      .finally(() => { if (request === revision.current) setLoading(false); });
    return () => { revision.current++; };
  }, [attempt, user?.id]);
  const toggle = (id: string) => {
    if (selected.includes(id)) return setSelected(selected.filter((item) => item !== id));
    if (selected.length < 10) setSelected([...selected, id]);
  };
  const save = async () => {
    if (!profile || saving) return;
    const request = revision.current; setSaving(true); setError(false);
    try { await api.updateProfile({ tags: selected, adultProfileTagsEnabled: adultTagsEnabled }); if (request === revision.current) router.back(); }
    catch { if (request === revision.current) setError(true); }
    finally { if (request === revision.current) setSaving(false); }
  };

  if (loading || !profile) return <Screen back title={t('tags.title')}><View style={styles.page}>
    <Text accessibilityRole={error ? 'alert' : undefined} style={{ color: error ? theme.colors.danger : theme.colors.textMuted }}>{t(loading ? 'common.loading' : 'common.error')}</Text>
    {!loading && <Button label={t('common.retry')} onPress={() => setAttempt(value => value + 1)} />}
  </View></Screen>;

  return (
    <Screen back title={t('tags.title')}>
      <View style={styles.page}>
        {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('common.error')}</Text>}
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('tags.hint')}</Text>
        <View style={[styles.switchRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.switchCopy}>
            <Text style={[styles.heading, { color: theme.colors.text }]}>{t('tags.adultToggle')}</Text>
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{t('tags.adultToggleHint')}</Text>
          </View>
          <Switch
            value={adultTagsEnabled}
            onValueChange={(enabled) => {
              if (!enabled) setSelected((current) => current.filter((id) => profileTags.find((tag) => tag.id === id)?.category !== 'kinks'));
              setProfile((current) => current ? { ...current, adultProfileTagsEnabled: enabled } : current);
            }}
            trackColor={{ true: theme.colors.accent }}
          />
        </View>
        <Text style={[styles.counter, { color: selected.length === 10 ? theme.colors.lava : theme.colors.accent }]}>{selected.length}/10</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder={t('tags.search')} placeholderTextColor={theme.colors.textMuted} style={[styles.search, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} />
        {categories.map((category) => {
          const tags = visible.filter((tag) => tag.category === category);
          if (!tags.length) return null;
          return <View key={category} style={styles.section}>
            <Text style={[styles.heading, { color: theme.colors.text }]}>{t(`tags.${category}`)}</Text>
            <View style={styles.chips}>{tags.map((tag) => <ChoiceChip key={tag.id} label={tag.label} selected={selected.includes(tag.id)} onPress={() => toggle(tag.id)} />)}</View>
          </View>;
        })}
        {selected.length === 10 && <Text style={{ color: theme.colors.textMuted }}>{t('tags.limit')}</Text>}
        <Button label={t('common.save')} loading={saving} disabled={!profile} onPress={() => void save()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 16 }, hint: { fontSize: 13, lineHeight: 19 }, counter: { fontWeight: '900', fontSize: 17 },
  search: { minHeight: 52, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, fontSize: 16 },
  section: { gap: 10, marginTop: 8 }, heading: { fontSize: 18, fontWeight: '900' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 18, padding: 16 },
  switchCopy: { flex: 1, gap: 4 },
});
