import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { View } from 'react-native';
import type { Train } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, ChoiceChip, EmptyState, Field, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import { createTrain, listTrains, trainCommand } from '@/services/trains';

export default function TrainsScreen() {
  const { locale, theme, user } = useApp(); const is = locale === 'is'; const router = useRouter();
  const [items, setItems] = useState<Train[]>([]); const [creating, setCreating] = useState(false);
  const [name, setName] = useState(''); const [bio, setBio] = useState(''); const [symbol, setSymbol] = useState('🚂');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [publicOnly, setPublicOnly] = useState(false);
  const reload = useCallback(async () => { setItems(await listTrains()); }, []);
  useFocusEffect(useCallback(() => { let active = true; setItems([]); void listTrains().then(rows => { if (active) setItems(rows); }).catch(() => { if (active) setError(is ? 'Ekki tókst að sækja ferðalestir.' : 'Could not load trains.'); }); return () => { active = false; }; }, [is, user?.id]));
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); try { await action(); } catch { setError(is ? 'Ekki tókst að vista. Reyndu aftur.' : 'Could not save. Try again.'); } finally { setBusy(false); } };
  const card = { padding: 18, borderRadius: 20, gap: 12, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border };
  return <Screen title="Ferðalest"><View style={{ padding: 18, gap: 16 }}>
    <Text style={{ color: theme.colors.textMuted }}>{is ? 'Finnið hittinga og farið saman. Lestin ykkar helst milli hittinga.' : 'Find gatherings and go together. Your train stays together between events.'}</Text>
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <ChoiceChip label={is ? 'Mínar lestir' : 'My trains'} selected={!publicOnly} onPress={() => setPublicOnly(false)} />
      <ChoiceChip label={is ? 'Opinberar' : 'Public'} selected={publicOnly} onPress={() => setPublicOnly(true)} />
    </View>
    <Button icon="add-circle-outline" label={is ? 'Ný ferðalest' : 'New train'} onPress={() => setCreating(!creating)} />
    <Button variant="secondary" icon="camera-outline" label={is ? 'Mynda og senda' : 'Capture and send'} onPress={() => router.push('/camera-send' as never)} />
    {error ? <View><Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text><Button label={is ? 'Reyna aftur' : 'Retry'} onPress={() => void run(reload)} /></View> : null}
    {creating && <View style={card}>
      <Field label={is ? 'Nafn' : 'Name'} value={name} onChangeText={setName} maxLength={80} />
      <Field label={is ? 'Tákn' : 'Symbol'} value={symbol} onChangeText={setSymbol} maxLength={16} />
      <Field label={is ? 'Lýsing' : 'Description'} value={bio} onChangeText={setBio} maxLength={500} multiline />
      <Text style={{ color: theme.colors.textMuted }}>{is ? 'Aðeins með boði í upphafi. Eigandi getur gert lestina opinbera síðar.' : 'Invite-only to start. The owner can make the train public later.'}</Text>
      <Button disabled={!name.trim() || !symbol.trim()} loading={busy} label={is ? 'Stofna ferðalest' : 'Create train'} onPress={() => void run(async () => { const id = await createTrain({ name, bio, symbol, visibility: 'private' }); setCreating(false); setName(''); router.push(`/groups/${id}` as never); })} />
    </View>}
    {items.filter(item => publicOnly ? item.visibility === 'public' : !!item.membershipStatus).map(item => <View key={item.id} style={card}>
      <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '800' }}>{item.symbol} {item.name}</Text>
      <Text style={{ color: theme.colors.textMuted }}>{item.memberCount} {is ? 'meðlimir' : 'members'} · {item.visibility === 'public' ? (is ? 'Opinber' : 'Public') : (is ? 'Aðeins með boði' : 'Invite-only')}</Text>
      {!!item.bio && <Text style={{ color: theme.colors.text }}>{item.bio}</Text>}
      {item.membershipStatus === 'invited' ? <>
        <Button disabled={busy} label={is ? 'Samþykkja boð' : 'Accept invitation'} onPress={() => void run(async () => { await api.groupAction(item.id, 'accept'); await reload(); router.push(`/groups/${item.id}` as never); })} />
        <Button disabled={busy} variant="ghost" label={is ? 'Hafna' : 'Decline'} onPress={() => void run(async () => { await api.groupAction(item.id, 'decline'); await reload(); })} />
      </> : item.membershipStatus === 'active' ? <Button variant="secondary" label={is ? 'Opna lest' : 'Open train'} onPress={() => router.push(`/groups/${item.id}` as never)} />
        : <Button disabled={busy} label={is ? 'Ganga í lest' : 'Join train'} onPress={() => void run(async () => { await trainCommand('join', item.id); await reload(); router.push(`/groups/${item.id}` as never); })} />}
    </View>)}
    {!items.length && !creating && <EmptyState icon="train-outline" title={is ? 'Fyrsta ferðalestin þín' : 'Your first train'} body={is ? 'Stofnaðu lest og bjóddu vinum þínum.' : 'Create a train and invite your friends.'} />}
  </View></Screen>;
}
