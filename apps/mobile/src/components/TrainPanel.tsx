import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Linking, View } from 'react-native';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { locationShareInput, type TrainDetail } from '@rummal/shared';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import { getTrain, listTrains, trainCommand } from '@/services/trains';
import { defaultMeetupFilters, type GroupMember, type MeetupSummary } from '@/types/domain';
import { useEntitlement } from '@/hooks/useEntitlement';
import { Button, ChoiceChip, Field } from './ui';
import { Text } from './Typography';

export default function TrainPanel({ groupId, members }: { groupId: string; members: GroupMember[] }) {
  const { locale, theme, user } = useApp(); const is = locale === 'is'; const router = useRouter(); const { entitlement } = useEntitlement();
  const scope = useRef(0);
  useEffect(() => { scope.current++; return () => { scope.current++; }; }, [user?.id, groupId]);
  const [state, setState] = useState<TrainDetail | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [section, setSection] = useState<'plan' | 'location' | 'pool' | 'settings'>('plan');
  const [events, setEvents] = useState<MeetupSummary[]>([]); const [choosing, setChoosing] = useState(false); const [note, setNote] = useState('');
  const [allMembers, setAllMembers] = useState(true); const [recipients, setRecipients] = useState<string[]>([]); const [minutes, setMinutes] = useState<15 | 60>(15);
  const [name, setName] = useState(''); const [bio, setBio] = useState(''); const [symbol, setSymbol] = useState(''); const [isPublic, setIsPublic] = useState(false);
  const [perEvent, setPerEvent] = useState('500'); const [monthly, setMonthly] = useState('5000'); const [deposit, setDeposit] = useState('1000');
  const reload = useCallback(async () => { setState(await getTrain(groupId)); }, [groupId]);
  useFocusEffect(useCallback(() => {
    let active = true; let found = false; setState(null); setError('');
    const load = async () => {
      try { if (!found) found = (await listTrains()).some(t => t.id === groupId && t.membershipStatus === 'active');
        if (!found) return;
        const next = await getTrain(groupId); if (active) setState(next);
      } catch { if (active) { setState(null); setError(is ? 'Ekki tókst að sækja ferðalest.' : 'Could not load train.'); } }
    };
    void load(); const timer = setInterval(() => void load(), 30000);
    return () => { active = false; clearInterval(timer); };
  }, [groupId, user?.id, is]));
  useEffect(() => { if (!state) return; setName(state.train.name); setBio(state.train.bio); setSymbol(state.train.symbol); setIsPublic(state.train.visibility === 'public'); setPerEvent(String(state.pool.amountPerEvent || 500)); setMonthly(String(state.pool.monthlyCap || 5000)); }, [state?.train.name, state?.train.bio, state?.train.symbol, state?.train.visibility, state?.pool.amountPerEvent, state?.pool.monthlyCap]);
  const run = async (action: () => Promise<unknown>) => { if (busy) return; setBusy(true); setError(''); try { await action(); await reload(); } catch { setError(is ? 'Aðgerðin mistókst. Athugaðu tengingu og aðgang.' : 'Action failed. Check your connection and access.'); } finally { setBusy(false); } };
  if (!state) return error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null;
  const admin = state.train.role === 'owner' || state.train.role === 'admin';
  const poolValid = Number.isSafeInteger(Number(perEvent)) && Number(perEvent) > 0 && Number(perEvent) <= 100000 && Number.isSafeInteger(Number(monthly)) && Number(monthly) >= Number(perEvent) && Number(monthly) <= 1000000;
  return <View style={{ gap: 14, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
    <Text style={{ color: theme.colors.text, fontSize: 23, fontWeight: '800' }}>{state.train.symbol} {state.train.name}</Text>
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {([['plan', is ? 'Ferðaplan' : 'Plan'], ['location', is ? 'Staðsetning' : 'Location'], ['pool', is ? 'Sjóður' : 'Pool'], ...(admin ? [['settings', is ? 'Stillingar' : 'Settings']] : [])] as [typeof section, string][]).map(([key, label]) => <ChoiceChip key={key} label={label} selected={section === key} onPress={() => setSection(key)} />)}
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text>}
    {section === 'plan' && <>
      <Button disabled={busy} icon="add-circle-outline" label={is ? 'Mæla með hittingi' : 'Recommend a gathering'} onPress={() => void run(async () => { setEvents(await api.discoverMeetups(defaultMeetupFilters)); setChoosing(!choosing); })} />
      {choosing && <><Field label={is ? 'Athugasemd við tillögu' : 'Recommendation note'} value={note} onChangeText={setNote} maxLength={1000} multiline />
        {events.filter(e => !state.plans.some(p => p.meetupId === e.id)).map(e => <Button key={e.id} disabled={busy} variant="secondary" label={e.title} onPress={() => void run(async () => { await trainCommand('recommend', groupId, { meetupId: e.id, note }); setChoosing(false); setNote(''); })} />)}
        {!events.length && <Text style={{ color: theme.colors.textMuted }}>{is ? 'Engir hittingar fundust.' : 'No gatherings found.'}</Text>}
      </>}
      {!state.plans.length && <Text style={{ color: theme.colors.textMuted }}>{is ? 'Mælið með hittingi, ræðið í spjallinu og ákveðið hvert þið farið.' : 'Recommend a gathering, discuss it in chat, and decide where to go.'}</Text>}
      {state.plans.map(plan => <View key={plan.meetupId} style={{ gap: 8, paddingVertical: 10 }}>
        <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700' }}>{plan.title}</Text>
        {!!plan.note && <Text style={{ color: theme.colors.text }}>{plan.note}</Text>}
        <Text style={{ color: theme.colors.textMuted }}>{plan.going.length} {is ? 'ætla með lestinni' : 'planning to go with the train'}</Text>
        <Button disabled={busy} variant="secondary" label={plan.going.includes(user?.id ?? 'demo-me') ? (is ? 'Ég fer ekki með' : 'Leave this plan') : (is ? 'Ég ætla með' : 'I plan to go')} onPress={() => void run(() => trainCommand('going', groupId, { meetupId: plan.meetupId, going: !plan.going.includes(user?.id ?? 'demo-me') }))} />
        <Button variant="ghost" label={is ? 'Skoða hitting og skrá mætingu' : 'Open gathering and RSVP'} onPress={() => router.push(`/hittingar/${plan.meetupId}` as never)} />
        <Button variant="ghost" label={is ? 'Umsagnir' : 'Reviews'} onPress={() => router.push(`/hittingar/${plan.meetupId}/feedback` as never)} />
      </View>)}
    </>}
    {section === 'location' && <>
      <Text style={{ color: theme.colors.textMuted }}>{is ? 'Deildu nákvæmri staðsetningu núna. Aðeins valdir meðlimir sjá hana. Nýir meðlimir fá ekki aðgang að eldri deilingu.' : 'Share your exact current location. Only selected members can see it. New members do not gain access to an existing share.'}</Text>
      <ChoiceChip label={is ? 'Allir núverandi meðlimir' : 'All current members'} selected={allMembers} onPress={() => setAllMembers(!allMembers)} />
      {!allMembers && members.filter(m => m.status === 'active' && m.profileId !== user?.id).map(m => <ChoiceChip key={m.profileId} label={m.displayName} selected={recipients.includes(m.profileId)} onPress={() => setRecipients(current => current.includes(m.profileId) ? current.filter(id => id !== m.profileId) : [...current, m.profileId])} />)}
      <View style={{ flexDirection: 'row', gap: 8 }}><ChoiceChip label="15 min" selected={minutes === 15} onPress={() => setMinutes(15)} /><ChoiceChip label="60 min" selected={minutes === 60} onPress={() => setMinutes(60)} /></View>
      <Button loading={busy} disabled={!allMembers && !recipients.length} icon="location-outline" label={is ? 'Deila nákvæmri staðsetningu' : 'Share exact location'} onPress={() => void run(async () => {
        const generation = scope.current;
        if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error('location_permission_required');
        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (generation !== scope.current) return;
        await trainCommand('location', groupId, locationShareInput(fix.coords.latitude, fix.coords.longitude, minutes, allMembers ? null : recipients));
      })} />
      <Button disabled={busy} variant="danger" label={is ? 'Hætta að deila' : 'Stop sharing'} onPress={() => void run(() => trainCommand('stop_location', groupId))} />
      {state.locations.filter(l => Date.parse(l.expiresAt) > Date.now()).map(l => <View key={l.profileId} style={{ gap: 5 }}><Text style={{ color: theme.colors.text }}>{l.displayName} · {is ? 'til' : 'until'} {new Date(l.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text><Button variant="secondary" label={is ? 'Opna á korti' : 'Open map'} onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${l.latitude},${l.longitude}`)} /></View>)}
    </>}
    {section === 'pool' && <>
      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{is ? 'Prufusjóður — engir raunverulegir peningar' : 'Test pool — no real money'}</Text>
      <Text style={{ color: theme.colors.textMuted }}>{is ? 'Raunverulegar greiðslur bíða tengingar við greiðsluþjónustu. Prófun úthlutar einu sinni á hitting þegar meðlimur ætlar með lestinni.' : 'Real payments require a payment-provider integration. The simulation allocates once per gathering when a member plans to go with the train.'}</Text>
      <Text style={{ color: theme.colors.text, fontSize: 24 }}>{state.pool.balance.toLocaleString()} ISK · {is ? 'prufueiningar' : 'test units'}</Text>
      {entitlement?.sandbox && <><Field label={is ? 'Prufuframlag (ISK)' : 'Test contribution (ISK)'} value={deposit} onChangeText={setDeposit} keyboardType="number-pad" />
        <Button disabled={busy || !Number.isSafeInteger(Number(deposit)) || Number(deposit) < 1 || Number(deposit) > 100000} label={is ? 'Bæta við prufueiningum' : 'Add test units'} onPress={() => void run(() => trainCommand('pool_deposit', groupId, { amount: Number(deposit), requestId: Crypto.randomUUID() }))} /></>}
      {state.train.role === 'owner' && <><Field label={is ? 'Upphæð á hitting (ISK)' : 'Amount per gathering (ISK)'} value={perEvent} onChangeText={setPerEvent} keyboardType="number-pad" /><Field label={is ? 'Hámark á mánuði (ISK)' : 'Monthly cap (ISK)'} value={monthly} onChangeText={setMonthly} keyboardType="number-pad" />
        <Button disabled={busy || !entitlement?.sandbox || !poolValid} label={state.pool.enabled ? (is ? 'Slökkva á sjálfvirkri prófun' : 'Disable automatic simulation') : (is ? 'Virkja sjálfvirka prófun' : 'Enable automatic simulation')} onPress={() => void run(() => trainCommand('pool_settings', groupId, { enabled: !state.pool.enabled, amountPerEvent: Number(perEvent), monthlyCap: Number(monthly) }))} /></>}
      {state.pool.allocations.map(a => <Text key={a.meetupId} style={{ color: theme.colors.text }}>{state.plans.find(p => p.meetupId === a.meetupId)?.title ?? (is ? 'Hittingur' : 'Gathering')} · {a.amount} ISK ({is ? 'prófun' : 'test'})</Text>)}
    </>}
    {section === 'settings' && admin && <>
      <Field label={is ? 'Nafn' : 'Name'} value={name} onChangeText={setName} maxLength={80} />
      <Field label={is ? 'Tákn' : 'Symbol'} value={symbol} onChangeText={setSymbol} maxLength={16} />
      <Field label={is ? 'Lýsing' : 'Description'} value={bio} onChangeText={setBio} maxLength={500} multiline />
      <ChoiceChip label={is ? 'Opinber — allir geta gengið í lest' : 'Public — anyone can join'} selected={isPublic} onPress={() => setIsPublic(!isPublic)} />
      <Text style={{ color: theme.colors.textMuted }}>{is ? 'Spjall og miðlar sjást aðeins eftir inngöngu. Nákvæm staðsetning er alltaf sérdeiling.' : 'Chat and media are visible only after joining. Exact location always has its own sharing controls.'}</Text>
      <Button disabled={busy || !name.trim() || !symbol.trim()} label={is ? 'Vista stillingar' : 'Save settings'} onPress={() => void run(() => trainCommand('update', groupId, { name, bio, symbol, visibility: isPublic ? 'public' : 'private' }))} />
    </>}
  </View>;
}
