import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppState, Linking, View } from 'react-native';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { locationShareInput, type TrainDetail } from '@rummal/shared';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import { getTrain, listTrains, trainCommand } from '@/services/trains';
import { defaultMeetupFilters, type GroupMember, type MeetupSummary } from '@/types/domain';
import { useEntitlement } from '@/hooks/useEntitlement';
import { confirmAction } from '@/utils/confirmAction';
import { Button, ChoiceChip, Field } from './ui';
import { Text } from './Typography';

export default function TrainPanel({ groupId, members }: { groupId: string; members: GroupMember[] }) {
  const { locale, theme, user } = useApp(); const is = locale === 'is'; const router = useRouter(); const { entitlement } = useEntitlement();
  const scope = useRef(0); const request = useRef(0); const inFlight = useRef(false);
  const account = useRef(user?.id); account.current = user?.id;
  const [state, setState] = useState<TrainDetail | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [section, setSection] = useState<'plan' | 'location' | 'pool' | 'settings'>('plan');
  const [events, setEvents] = useState<MeetupSummary[]>([]); const [choosing, setChoosing] = useState(false); const [note, setNote] = useState('');
  const [allMembers, setAllMembers] = useState(true); const [recipients, setRecipients] = useState<string[]>([]); const [minutes, setMinutes] = useState<15 | 60>(15);
  const [name, setName] = useState(''); const [bio, setBio] = useState(''); const [symbol, setSymbol] = useState(''); const [isPublic, setIsPublic] = useState(false);
  const [perEvent, setPerEvent] = useState('500'); const [monthly, setMonthly] = useState('5000'); const [deposit, setDeposit] = useState('1000');
  const reload = useCallback(async (current: () => boolean) => {
    const revision = ++request.current;
    const next = await getTrain(groupId);
    if (current() && revision === request.current) setState(next);
  }, [groupId]);
  useFocusEffect(useCallback(() => {
    const generation = ++scope.current; let found = false;
    const current = () => generation === scope.current && user?.id === account.current;
    inFlight.current = false; setBusy(false); setState(null); setError(''); setEvents([]); setChoosing(false); setNote(''); setRecipients([]); setAllMembers(true);
    const load = async () => {
      try { if (!found) found = (await listTrains()).some(t => t.id === groupId && t.membershipStatus === 'active');
        if (!found || !current()) return;
        await reload(current);
      } catch { if (current()) { setState(null); setError(is ? 'Ekki tókst að sækja ferðalest.' : 'Could not load train.'); } }
    };
    void load(); const timer = setInterval(() => { if (AppState.currentState === 'active' && !inFlight.current) void load(); }, 30000);
    return () => { scope.current++; request.current++; clearInterval(timer); };
  }, [groupId, user?.id, is, reload]));
  useEffect(() => { if (!state) return; setName(state.train.name); setBio(state.train.bio); setSymbol(state.train.symbol); setIsPublic(state.train.visibility === 'public'); setPerEvent(String(state.pool.amountPerEvent || 500)); setMonthly(String(state.pool.monthlyCap || 5000)); }, [state?.train.name, state?.train.bio, state?.train.symbol, state?.train.visibility, state?.pool.amountPerEvent, state?.pool.monthlyCap]);
  const run = async (action: (current: () => boolean) => Promise<unknown>) => {
    if (inFlight.current) return;
    const generation = scope.current; const id = user?.id;
    const current = () => generation === scope.current && id === account.current;
    if (!current()) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await action(current); if (current()) await reload(current); }
    catch (failure) { if (current()) setError(financeError(failure, is)); }
    finally { if (current()) { inFlight.current = false; setBusy(false); } }
  };
  if (!state) return error ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text> : null;
  const admin = state.train.role === 'owner' || state.train.role === 'admin';
  const perEventCost = Number(perEvent) + Math.ceil(Number(perEvent) * state.pool.serviceFeeBps / 10000);
  const poolValid = Number.isSafeInteger(Number(perEvent)) && Number(perEvent) > 0 && Number(perEvent) <= 100000 && Number.isSafeInteger(Number(monthly)) && Number(monthly) >= perEventCost && Number(monthly) <= 1000000;
  const depositToPool = () => {
    const generation = scope.current; const id = user?.id; const amount = Number(deposit);
    confirmAction({
      title: is ? 'Leggja í ferðasjóð' : 'Contribute to train pool',
      message: is ? `${amount.toLocaleString()} ISK verða flutt úr prufuveskinu þínu í sameiginlegan sjóð lestarinnar. Framlagið er ekki afturkræft. Sjóðurinn styrkir hittinga samkvæmt stillingum stjórnenda.` : `${amount.toLocaleString()} ISK will move from your sandbox wallet to the train's shared pool. You cannot withdraw this contribution. The pool sponsors gatherings according to its administrators' settings.`,
      cancelLabel: is ? 'Hætta við' : 'Cancel', confirmLabel: is ? 'Leggja í sjóð' : 'Contribute',
      onConfirm: async () => { if (generation === scope.current && id === account.current) await run(() => trainCommand('pool_deposit', groupId, { amount, requestId: Crypto.randomUUID() })); },
    });
  };
  return <View style={{ gap: 14, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
    <Text style={{ color: theme.colors.text, fontSize: 23, fontWeight: '800' }}>{state.train.symbol} {state.train.name}</Text>
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {([['plan', is ? 'Ferðaplan' : 'Plan'], ['location', is ? 'Staðsetning' : 'Location'], ['pool', is ? 'Sjóður' : 'Pool'], ...(admin ? [['settings', is ? 'Stillingar' : 'Settings']] : [])] as [typeof section, string][]).map(([key, label]) => <ChoiceChip key={key} label={label} selected={section === key} onPress={() => setSection(key)} />)}
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text>}
    {section === 'plan' && <>
      <Button disabled={busy} icon="add-circle-outline" label={is ? 'Mæla með hittingi' : 'Recommend a gathering'} onPress={() => void run(async current => { const next = await api.discoverMeetups(defaultMeetupFilters); if (current()) { setEvents(next); setChoosing(!choosing); } })} />
      {choosing && <><Field label={is ? 'Athugasemd við tillögu' : 'Recommendation note'} value={note} onChangeText={setNote} maxLength={1000} multiline />
        {events.filter(e => !state.plans.some(p => p.meetupId === e.id)).map(e => <Button key={e.id} disabled={busy} variant="secondary" label={e.title} onPress={() => void run(async current => { await trainCommand('recommend', groupId, { meetupId: e.id, note }); if (current()) { setChoosing(false); setNote(''); } })} />)}
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
      <Button loading={busy} disabled={!allMembers && !recipients.length} icon="location-outline" label={is ? 'Deila nákvæmri staðsetningu' : 'Share exact location'} onPress={() => void run(async current => {
        if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error('location_permission_required');
        if (!current()) return;
        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (!current()) return;
        await trainCommand('location', groupId, locationShareInput(fix.coords.latitude, fix.coords.longitude, minutes, allMembers ? null : recipients), { accountId: user?.id, isCurrent: current });
      })} />
      <Button disabled={busy} variant="danger" label={is ? 'Hætta að deila' : 'Stop sharing'} onPress={() => void run(() => trainCommand('stop_location', groupId))} />
      {state.locations.filter(l => Date.parse(l.expiresAt) > Date.now()).map(l => <View key={l.profileId} style={{ gap: 5 }}><Text style={{ color: theme.colors.text }}>{l.displayName} · {is ? 'til' : 'until'} {new Date(l.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text><Button variant="secondary" label={is ? 'Opna á korti' : 'Open map'} onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${l.latitude},${l.longitude}`)} /></View>)}
    </>}
    {section === 'pool' && <>
      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{is ? 'Sameiginlegur sjóður · prufuhamur' : 'Shared pool · sandbox'}</Text>
      {!state.pool.available ? <><Text style={{ color: theme.colors.textMuted }}>{is ? 'Sjóðurinn er ekki tiltækur núna. Reyndu aftur.' : 'The pool is unavailable right now. Please retry.'}</Text><Button disabled={busy} label={is ? 'Reyna aftur' : 'Retry'} onPress={() => void run(async () => {})} /></> : <>
        <Text style={{ color: theme.colors.textMuted }}>{is ? 'Framlög koma úr prufuveski. Sjálfvirkur styrkur fer einu sinni á hvern fyrirhugaðan hitting þegar meðlimur lestarinnar hefur skráð eða fengið samþykkta mætingu. Engir raunverulegir peningar eru færðir.' : 'Contributions come from sandbox wallets. Automatic sponsorship funds each planned gathering once, after a train member has a confirmed RSVP. No real money moves.'}</Text>
        <Text style={{ color: theme.colors.text, fontSize: 24 }}>{state.pool.balance.toLocaleString()} ISK</Text>
        <Text style={{ color: theme.colors.textMuted }}>{is ? 'Ráðstafað í þessum mánuði' : 'Spent this month'}: {state.pool.monthlySpent.toLocaleString()} / {state.pool.monthlyCap.toLocaleString()} ISK</Text>
        <Text style={{ color: theme.colors.textMuted }}>{is ? '10% þjónustugjald bætist við hvern styrk og telst með í mánaðarhámarki. Styrkur skiptist 25% til gestgjafa og 75% til þátttakenda. Afbókanir skila styrk og gjaldi í sjóðinn.' : 'A 10% service fee is added to each sponsorship and counts toward the monthly cap. Sponsorship is split 25% to the host and 75% to participants. Cancellation refunds return the sponsorship and fee to this pool.'}</Text>
        {entitlement?.sandbox && <><Field label={is ? 'Framlag úr prufuveski (ISK)' : 'Contribution from sandbox wallet (ISK)'} value={deposit} onChangeText={setDeposit} keyboardType="number-pad" />
          <Button disabled={busy || !Number.isSafeInteger(Number(deposit)) || Number(deposit) < 1 || Number(deposit) > 100000} label={is ? 'Leggja úr veski í sjóð' : 'Contribute from wallet'} onPress={depositToPool} /></>}
        {admin && <><Field label={is ? 'Styrkur á hitting (ISK)' : 'Sponsorship per gathering (ISK)'} value={perEvent} onChangeText={setPerEvent} keyboardType="number-pad" /><Field label={is ? 'Hámark á mánuði með gjöldum (ISK)' : 'Monthly cap including fees (ISK)'} value={monthly} onChangeText={setMonthly} keyboardType="number-pad" />
          {poolValid && <Text style={{ color: theme.colors.textMuted }}>{perEventCost.toLocaleString()} ISK {is ? 'úr sjóði á hvern hitting með gjaldi' : 'leaves the pool per gathering, including the fee'}</Text>}
          <Button disabled={busy || !entitlement?.sandbox || !poolValid} label={state.pool.enabled ? (is ? 'Vista sjálfvirka styrki' : 'Save automatic sponsorship') : (is ? 'Virkja sjálfvirka styrki' : 'Enable automatic sponsorship')} onPress={() => void run(() => trainCommand('pool_settings', groupId, { enabled: true, amountPerEvent: Number(perEvent), monthlyCap: Number(monthly), requestId: Crypto.randomUUID() }))} />
          {state.pool.enabled && <Button disabled={busy} variant="secondary" label={is ? 'Slökkva á sjálfvirkum styrkjum' : 'Disable automatic sponsorship'} onPress={() => void run(() => trainCommand('pool_settings', groupId, { enabled: false, amountPerEvent: state.pool.amountPerEvent, monthlyCap: state.pool.monthlyCap, requestId: Crypto.randomUUID() }))} />}
        </>}
        {state.pool.allocations.map(a => <Text key={a.meetupId} style={{ color: theme.colors.text }}>{state.plans.find(p => p.meetupId === a.meetupId)?.title ?? (is ? 'Hittingur' : 'Gathering')} · {a.amount.toLocaleString()} + {a.fee.toLocaleString()} ISK {a.refunded ? (is ? '· endurgreitt' : '· refunded') : ''}</Text>)}
      </>}
      <Button variant="secondary" label={is ? 'Opna veski' : 'Open wallet'} onPress={() => router.push('/wallet' as never)} />
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

function financeError(failure: unknown, is: boolean) {
  const code = failure instanceof Error ? failure.message : '';
  if (code.includes('insufficient')) return is ? 'Ónóg inneign í veski. Opnaðu veskið til að bæta við.' : 'Insufficient wallet funds. Open your wallet to add funds.';
  if (code === 'financial_request_pending') return is ? 'Óstaðfest greiðslubeiðni bíður. Opnaðu veskið til að reyna aftur.' : 'A payment request is awaiting confirmation. Open your wallet to retry it.';
  if (code === 'location_permission_required') return is ? 'Veittu staðsetningarleyfi til að deila staðsetningu.' : 'Allow location access to share your location.';
  return is ? 'Aðgerðin mistókst. Athugaðu tengingu og aðgang.' : 'Action failed. Check your connection and access.';
}
