import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState, Field, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { GroupSummary } from '@/types/domain';

export default function GroupsScreen() {
  const { t, theme } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<GroupSummary[]>([]);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const load = useCallback(() => { void api.listGroups().then(setItems); }, []);
  useFocusEffect(load);
  const create = async () => { if (!name.trim()) return; const id = await api.createGroup(name, bio); const route = `/groups/${id}?name=${encodeURIComponent(name)}`; setName(''); setBio(''); router.push(route as never); };
  return <Screen back title={t('social.groups')}>
    <View style={styles.page}>
      <View style={[styles.form, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.heading, { color: theme.colors.text }]}>{t('social.createGroup')}</Text>
        <Field label={t('social.groupName')} value={name} onChangeText={setName} />
        <Field label={t('social.groupBio')} value={bio} onChangeText={setBio} multiline />
        <Button icon="add-circle-outline" label={t('social.create')} disabled={!name.trim()} onPress={() => void create()} />
      </View>
      {items.length === 0 ? <EmptyState icon="people-circle-outline" title={t('social.noGroups')} body={t('social.noGroupsBody')} /> : items.map((item) =>
        <Button key={item.id} variant="secondary" icon={item.isVoiceActive ? 'mic' : 'people-outline'} label={`${item.name} · ${item.memberCount}`} onPress={() => router.push(`/groups/${item.id}?name=${encodeURIComponent(item.name)}` as never)} />)}
    </View>
  </Screen>;
}
const styles = StyleSheet.create({ page: { padding: 18, gap: 14 }, form: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, padding: 16, gap: 12 }, heading: { fontSize: 18, fontWeight: '900' } });
