import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { Train } from '@rummal/shared';
import { Text } from '@/components/Typography';
import { Button, ChoiceChip, EmptyState, Field, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import { createTrain, listTrains, trainCommand } from '@/services/trains';
import { useEntitlement } from '@/hooks/useEntitlement';
import { confirmAction } from '@/utils/confirmAction';

export default function TrainsScreen() {
  const { locale, theme, user } = useApp(); const is = locale === 'is'; const router = useRouter();
  const { entitlement } = useEntitlement();
  const [items, setItems] = useState<Train[]>([]); const [creating, setCreating] = useState(false);
  const [name, setName] = useState(''); const [bio, setBio] = useState(''); const [symbol, setSymbol] = useState('🚂');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [publicOnly, setPublicOnly] = useState(false);
  const [sponsorId, setSponsorId] = useState<string | null>(null); const [amount, setAmount] = useState('1000'); const [notice, setNotice] = useState('');
  const generation = useRef(0); const inFlight = useRef(false);
  const account = useRef(user?.id); account.current = user?.id;
  const reload = async (current: () => boolean) => { const rows = await listTrains(); if (current()) setItems(rows); };
  useFocusEffect(useCallback(() => {
    const revision = ++generation.current;
    const current = () => revision === generation.current && account.current === user?.id;
    inFlight.current = false; setBusy(false); setItems([]); setError(''); setCreating(false); setName(''); setBio(''); setSymbol('🚂'); setSponsorId(null); setNotice('');
    void listTrains().then(rows => { if (current()) setItems(rows); }).catch(() => { if (current()) setError(is ? 'Ekki tókst að sækja ferðalestir.' : 'Could not load trains.'); });
    return () => { generation.current++; };
  }, [is, user?.id]));
  const run = async (action: (current: () => boolean) => Promise<void>) => {
    if (inFlight.current) return;
    const revision = generation.current; const id = user?.id;
    const current = () => revision === generation.current && id === account.current;
    if (!current()) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await action(current); }
    catch (failure) { if (current()) setError(failure instanceof Error && failure.message === 'insufficient_funds' ? (is ? 'Ónóg inneign. Opnaðu veskið til að bæta við.' : 'Insufficient wallet funds. Open your wallet to add funds.') : (is ? 'Ekki tókst að vista. Reyndu aftur.' : 'Could not save. Try again.')); }
    finally { if (current()) { inFlight.current = false; setBusy(false); } }
  };
  const visibleItems = items.filter(item => publicOnly ? item.visibility === 'public' : !!item.membershipStatus);
  const sponsor = (train: Train) => {
    const revision = generation.current; const id = user?.id; const contribution = Number(amount);
    confirmAction({ title: is ? `Styrkja ${train.name}` : `Sponsor ${train.name}`,
      message: is ? `${contribution.toLocaleString()} ISK verða flutt úr prufuveskinu þínu í sjóð lestarinnar. Framlagið er ekki afturkræft. Stjórnendur ákveða hvaða hittinga sjóðurinn styrkir. Þú færð ekki aðgang að spjalli eða staðsetningu meðlima.` : `${contribution.toLocaleString()} ISK will move from your sandbox wallet to this train's shared pool. You cannot withdraw it. Administrators control which gatherings it sponsors. Sponsoring does not grant access to member chat or locations.`,
      cancelLabel: is ? 'Hætta við' : 'Cancel', confirmLabel: is ? 'Styrkja' : 'Sponsor',
      onConfirm: async () => {
        if (revision !== generation.current || id !== account.current) return;
        await run(async current => {
          await trainCommand('pool_deposit', train.id, { amount: contribution, requestId: Crypto.randomUUID() });
          if (!current()) return;
          setSponsorId(null); setNotice(is ? 'Framlagið hefur verið fært í sjóðinn.' : 'Your contribution is in the train pool.'); await reload(current);
        });
      },
    });
  };
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
    {!!notice && <Text accessibilityRole="alert" style={{ color: theme.colors.text }}>{notice}</Text>}
    {creating && <View style={card}>
      <Field label={is ? 'Nafn' : 'Name'} value={name} onChangeText={setName} maxLength={80} />
      <Field label={is ? 'Tákn' : 'Symbol'} value={symbol} onChangeText={setSymbol} maxLength={16} />
      <Field label={is ? 'Lýsing' : 'Description'} value={bio} onChangeText={setBio} maxLength={500} multiline />
      <Text style={{ color: theme.colors.textMuted }}>{is ? 'Aðeins með boði í upphafi. Eigandi getur gert lestina opinbera síðar.' : 'Invite-only to start. The owner can make the train public later.'}</Text>
      <Button disabled={!name.trim() || !symbol.trim()} loading={busy} label={is ? 'Stofna ferðalest' : 'Create train'} onPress={() => void run(async current => { const id = await createTrain({ name, bio, symbol, visibility: 'private' }); if (!current()) return; setCreating(false); setName(''); router.push(`/groups/${id}` as never); })} />
    </View>}
    {visibleItems.map(item => <View key={item.id} style={card}>
      <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '800' }}>{item.symbol} {item.name}</Text>
      <Text style={{ color: theme.colors.textMuted }}>{item.memberCount} {is ? 'meðlimir' : 'members'} · {item.visibility === 'public' ? (is ? 'Opinber' : 'Public') : (is ? 'Aðeins með boði' : 'Invite-only')}</Text>
      {!!item.bio && <Text style={{ color: theme.colors.text }}>{item.bio}</Text>}
      {item.sponsored && <Text style={{ color: theme.colors.textMuted }}>{is ? 'Styrkt ferðalest · prufuhamur' : 'Sponsored train · sandbox'}</Text>}
      {item.membershipStatus === 'invited' ? <>
        <Button disabled={busy} label={is ? 'Samþykkja boð' : 'Accept invitation'} onPress={() => void run(async current => { await api.groupAction(item.id, 'accept'); if (current()) router.push(`/groups/${item.id}` as never); })} />
        <Button disabled={busy} variant="ghost" label={is ? 'Hafna' : 'Decline'} onPress={() => void run(async current => { await api.groupAction(item.id, 'decline'); if (current()) await reload(current); })} />
      </> : item.membershipStatus === 'active' ? <Button variant="secondary" label={is ? 'Opna lest' : 'Open train'} onPress={() => router.push(`/groups/${item.id}` as never)} />
        : <Button disabled={busy} label={is ? 'Ganga í lest' : 'Join train'} onPress={() => void run(async current => { await trainCommand('join', item.id); if (current()) router.push(`/groups/${item.id}` as never); })} />}
      {item.visibility === 'public' && item.membershipStatus !== 'active' && entitlement?.sandbox && <>
        <Button disabled={busy} variant="secondary" label={is ? 'Styrkja lest' : 'Sponsor train'} onPress={() => setSponsorId(sponsorId === item.id ? null : item.id)} />
        {sponsorId === item.id && <><Field label={is ? 'Framlag úr prufuveski (ISK)' : 'Sandbox wallet contribution (ISK)'} value={amount} onChangeText={setAmount} keyboardType="number-pad" />
          <Button disabled={busy || !Number.isSafeInteger(Number(amount)) || Number(amount) < 1 || Number(amount) > 100000} label={is ? 'Styrkja úr veski' : 'Sponsor from wallet'} onPress={() => sponsor(item)} />
          <Button variant="ghost" label={is ? 'Opna veski' : 'Open wallet'} onPress={() => router.push('/wallet' as never)} />
        </>}
      </>}
    </View>)}
    {!visibleItems.length && !creating && !error && <EmptyState icon="train-outline" title={publicOnly ? (is ? 'Engar opinberar lestir' : 'No public trains yet') : (is ? 'Fyrsta ferðalestin þín' : 'Your first train')} body={is ? 'Stofnaðu lest og bjóddu vinum þínum.' : 'Create a train and invite your friends.'} />}
  </View></Screen>;
}
