import { Text } from '@/components/Typography';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, EmptyState, Field, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import type { GroupSummary } from '@/types/domain';

export default function GroupsScreen() {
  const { t, theme, locale, user } = useApp();
  const is = locale === 'is';
  const router = useRouter();
  const [items, setItems] = useState<GroupSummary[]>([]);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const revision = useRef(0);
  useFocusEffect(useCallback(() => {
    let active = true; revision.current++; setBusy(false); setLoading(true); setError(false); setItems([]);
    void api.listGroups().then(groups => { if (active) setItems(groups); })
      .catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; revision.current++; };
  }, [attempt, user?.id]));
  const create = async () => {
    if (busy || !name.trim()) return;
    const request = revision.current; setBusy(true); setError(false);
    try {
      const id = await api.createGroup(name.trim(), bio.trim());
      if (request !== revision.current) return;
      setName(''); setBio(''); router.push(`/groups/${id}` as never);
    } catch { if (request === revision.current) setError(true); }
    finally { if (request === revision.current) setBusy(false); }
  };
  const respond = async (id: string, action: 'accept' | 'decline') => {
    if (busy) return;
    const request = revision.current; setBusy(true); setError(false);
    try {
      await api.groupAction(id, action);
      if (request !== revision.current) return;
      setAttempt(value => value + 1);
      if (action === 'accept') router.push(`/groups/${id}` as never);
    } catch { if (request === revision.current) setError(true); }
    finally { if (request === revision.current) setBusy(false); }
  };
  return <Screen back title={t('social.groups')}><View style={styles.page}>
    {error && <View style={styles.form}><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{t('errors.network')}</Text><Button variant="secondary" label={t('common.retry')} onPress={() => setAttempt(value => value + 1)} /></View>}
    <View style={[styles.form, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <Text style={[styles.heading, { color: theme.colors.text }]}>{t('social.createGroup')}</Text>
      <Field label={t('social.groupName')} value={name} onChangeText={setName} maxLength={80} />
      <Field label={t('social.groupBio')} value={bio} onChangeText={setBio} maxLength={500} multiline />
      <Button icon="add-circle-outline" label={t('social.create')} loading={busy} disabled={!name.trim()} onPress={() => void create()} />
    </View>
    {loading ? <Text style={{ color: theme.colors.textMuted }}>{t('common.loading')}</Text> : items.length === 0 && !error ? <EmptyState icon="people-circle-outline" title={t('social.noGroups')} body={t('social.noGroupsBody')} /> : items.map(item =>
      <View key={item.id} style={[styles.form, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.heading, { color: theme.colors.text }]}>{item.name} · {item.memberCount}</Text>
        {item.bio ? <Text style={{ color: theme.colors.textMuted }}>{item.bio}</Text> : null}
        {item.membershipStatus === 'invited' ? <>
          <Text style={{ color: theme.colors.textMuted }}>{is ? 'Þér hefur verið boðið í þennan hóp. Samþykktu til að sjá meðlimi og skilaboð.' : 'You are invited to this group. Accept to see members and messages.'}</Text>
          <Button disabled={busy} label={is ? 'Samþykkja boð' : 'Accept invitation'} onPress={() => void respond(item.id, 'accept')} />
          <Button disabled={busy} variant="secondary" label={is ? 'Hafna boði' : 'Decline invitation'} onPress={() => void respond(item.id, 'decline')} />
        </> : <Button variant="secondary" icon="people-outline" label={is ? 'Opna hóp' : 'Open group'} onPress={() => router.push(`/groups/${item.id}` as never)} />}
      </View>)}
  </View></Screen>;
}
const styles = StyleSheet.create({ page: { padding: 18, gap: 14 }, form: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, padding: 16, gap: 12 }, heading: { fontSize: 18, fontWeight: '900' } });
