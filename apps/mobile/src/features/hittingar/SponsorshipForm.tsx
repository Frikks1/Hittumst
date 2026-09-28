import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { ContributionQuote, FinanceCommand, FinanceSnapshot } from '@rummal/shared';
import { Button, ChoiceChip, Field } from '@/components/ui';
import { Text } from '@/components/Typography';
import { useApp } from '@/providers/AppProvider';
import { useEntitlement } from '@/hooks/useEntitlement';
import { api } from '@/services';

export type SponsorshipSelection = { quote: ContributionQuote; requestId: string };

type Props = {
  meetupId?: string;
  prepareMeetup?: () => Promise<string>;
  deferConfirmation?: boolean;
  disabled?: boolean;
  onSelectionChange?: (value: SponsorshipSelection | null) => void;
  onComplete?: () => Promise<void> | void;
};

/** All charged amounts come from the server quote; typing never moves funds. */
export function SponsorshipForm({ meetupId, prepareMeetup, deferConfirmation = false, disabled = false, onSelectionChange, onComplete }: Props) {
  const { locale, theme } = useApp();
  const is = locale === 'is';
  const router = useRouter();
  const { entitlement, error: entitlementError } = useEntitlement();
  const [wallet, setWallet] = useState<FinanceSnapshot | null>(null);
  const [source, setSource] = useState<'credit' | 'cash' | 'mixed'>('credit');
  const [amount, setAmount] = useState('500');
  const [creditAmount, setCreditAmount] = useState('500');
  const [selection, setSelection] = useState<SponsorshipSelection | null>(null);
  const [pending, setPending] = useState<FinanceCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const inFlight = useRef(false);
  const changed = useRef(onSelectionChange);
  changed.current = onSelectionChange;
  const money = (n: number) => `${n.toLocaleString('is-IS')} kr`;
  const refresh = useCallback(async () => {
    const [balance, unresolved] = await Promise.all([api.getWallet(), api.getPendingFinanceCommand()]);
    setWallet(balance); setPending(unresolved);
  }, []);
  useEffect(() => { void refresh().catch(() => setError('unavailable')); }, [refresh]);
  const invalidate = () => { setSelection(null); changed.current?.(null); setError(null); setCompleted(false); };
  useEffect(() => {
    if (!selection) return;
    const timer = setTimeout(() => { setSelection(null); changed.current?.(null); setError('expired'); }, Math.max(0, Date.parse(selection.quote.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [selection]);

  const getQuote = async () => {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setBusy(true); invalidate();
    try {
      const id = prepareMeetup ? await prepareMeetup() : meetupId;
      if (!id) throw new Error('unavailable');
      const quote = await api.walletCommand({ action: 'contribution_quote', meetupId: id, amount: Number(amount), fundingSource: source, ...(source === 'mixed' ? { creditAmount: Number(creditAmount) } : {}), requestId: Crypto.randomUUID() }) as ContributionQuote;
      const next = { quote, requestId: Crypto.randomUUID() };
      setSelection(next); changed.current?.(next);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'unavailable'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const contribute = async (command?: FinanceCommand) => {
    if (inFlight.current || disabled || (!command && !selection)) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const actual = command ?? { action: 'contribute' as const, meetupId: selection!.quote.meetupId, amount: selection!.quote.amount, expectedHostBps: selection!.quote.hostBps, quoteId: selection!.quote.id, requestId: selection!.requestId };
      await api.walletCommand(actual);
      invalidate(); setCompleted(true); await refresh(); await onComplete?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'unavailable');
      setPending(await api.getPendingFinanceCommand().catch(() => null));
    } finally { inFlight.current = false; setBusy(false); }
  };
  const amountValue = Number(amount);
  const creditValue = source === 'credit' ? amountValue : source === 'mixed' ? Number(creditAmount) : 0;
  const valid = Number.isSafeInteger(amountValue) && amountValue > 0 && amountValue <= 100_000_000
    && Number.isSafeInteger(creditValue) && creditValue >= 0 && creditValue <= amountValue
    && (source === 'cash' || (creditValue > 0 && creditValue % 500 === 0))
    && (source !== 'mixed' || creditValue < amountValue);
  const unavailable = disabled || busy || Boolean(pending);
  const muted = { color: theme.colors.textMuted, fontSize: 13 };
  if (!entitlement) return <Text style={muted}>{entitlementError ? (is ? 'Áskriftarupplýsingar ekki tiltækar' : 'Membership unavailable') : (is ? 'Sæki áskrift…' : 'Loading membership…')}</Text>;
  if (entitlement.tier === 'plebbi') return <View style={{ gap: 10 }}>
    <Text style={muted}>{is ? 'Áskrifendur geta styrkt hittinga, líka sína eigin.' : 'Subscribers can sponsor meetups, including their own.'}</Text>
    <Button label={is ? 'Skoða áskriftir' : 'Upgrade to sponsor'} onPress={() => router.push('/membership' as never)} />
  </View>;
  return <View style={{ gap: 12, padding: 16, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 18, backgroundColor: theme.colors.surface }}>
    <Text accessibilityRole="header" style={{ color: theme.colors.text, fontSize: 19, fontWeight: '800' }}>{is ? 'Styrkja hitting' : 'Sponsor this meetup'}</Text>
    <Text style={muted}>{is ? 'Prufukerfi — engin raunveruleg greiðsla.' : 'Sandbox — no real payment.'}</Text>
    {wallet && <Text style={muted}>{is ? 'Styrktarinneign' : 'Sponsorship credit'}: {money(wallet.sponsorshipCredit)} · {is ? 'Peningaveski' : 'Cash wallet'}: {money(wallet.balance)}</Text>}
    {pending && <View style={{ gap: 8 }}>
      <Text style={muted}>{is ? 'Fyrri aðgerð bíður staðfestingar. Ekki senda nýjan styrk.' : 'An earlier action is awaiting confirmation. Do not start another sponsorship.'}</Text>
      {!deferConfirmation && pending.action === 'contribute' && pending.meetupId === meetupId
        ? <Button disabled={busy} label={is ? 'Athuga fyrri styrk' : 'Check previous sponsorship'} onPress={() => void contribute(pending)} />
        : <Button variant="secondary" label={is ? 'Athuga aðgerð í veski' : 'Resolve in wallet'} onPress={() => router.push('/wallet' as never)} />}
    </View>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {(['credit', 'cash', 'mixed'] as const).map(value => <ChoiceChip key={value} selected={source === value} label={value === 'credit' ? (is ? 'Styrktarinneign' : 'Included credit') : value === 'cash' ? (is ? 'Peningar / tekjur' : 'Cash / earnings') : (is ? 'Blanda' : 'Both')} onPress={() => { if (!unavailable) { invalidate(); setSource(value); } }} />)}
    </View>
    <Field label={is ? 'Upphæð í sjóð (kr)' : 'Amount added to pool (ISK)'} keyboardType="number-pad" value={amount} editable={!unavailable} onChangeText={value => { invalidate(); setAmount(value.replace(/[^0-9]/g, '')); }} />
    {source === 'mixed' && <Field label={is ? 'Þar af styrktarinneign (500 kr einingar)' : 'Included credit portion (500 ISK units)'} keyboardType="number-pad" value={creditAmount} editable={!unavailable} onChangeText={value => { invalidate(); setCreditAmount(value.replace(/[^0-9]/g, '')); }} />}
    <Text style={muted}>{is ? 'Styrktarinneign er notuð í 500 kr einingum, án gjalds. Peningahluti ber 10% þjónustugjald og mögulegan greiðsluvinnslukostnað. Gjöld dragast ekki frá sjóðnum.' : 'Included credit is allocated in 500 ISK units with no fee. Cash carries a 10% service fee plus processing where applicable. Fees never reduce the pool.'}</Text>
    <Text style={muted}>{is ? 'Styrkur veitir forgang á biðlista þessa hittings. Hann skráir þig ekki til þátttöku og tryggir ekki aðgang. Samþykki eða boð þarf enn þar sem það á við. Afturköllun fellir niður forgang fyrir ný tilboð.' : 'Sponsoring gives priority on this event’s waitlist. It does not join the event or guarantee admission. Host approval or an invitation is still required where applicable. Reversing the contribution removes priority for future offers.'}</Text>
    {error && <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error === 'expired' ? (is ? 'Verðtilboðið rann út. Sæktu nýtt áður en þú staðfestir.' : 'This quote expired. Request a new one before confirming.') : (is ? 'Styrkurinn tókst ekki. Athugaðu inneign, upphafstíma og stöðu síðustu aðgerðar.' : 'Unable to sponsor. Check your balance, the event start time and the status of your last action.')}</Text>}
    {completed && <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.success }}>{is ? 'Styrkur staðfestur.' : 'Sponsorship confirmed.'}</Text>}
    <Button variant="secondary" disabled={unavailable || !valid || !wallet} loading={busy} label={is ? 'Skoða endanlega upphæð' : 'Review full quote'} onPress={() => void getQuote()} />
    {selection && <View style={{ gap: 8 }}>
      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{is ? 'Bætist í sjóð' : 'Added to pool'}: {money(selection.quote.amount)}</Text>
      <Text style={muted}>{is ? 'Styrktarinneign' : 'Credit'}: {money(selection.quote.creditAmount)} · {is ? 'Peningar' : 'Cash'}: {money(selection.quote.cashAmount)}</Text>
      <Text style={muted}>{is ? 'Þjónustugjald' : 'Service fee'}: {money(selection.quote.serviceFee)} · {is ? 'Greiðsluvinnsla' : 'Processing'}: {money(selection.quote.processingFee)}</Text>
      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{is ? 'Heildargreiðsla úr peningaveski' : 'Total charged to cash wallet'}: {money(selection.quote.totalCash)}</Text>
      <Text style={muted}>{selection.quote.hostBps / 100}% {is ? 'til höfundar' : 'to creator'} · {(10_000 - selection.quote.hostBps) / 100}% {is ? 'til annarra gjaldgengra þátttakenda' : 'to other eligible attendees'}</Text>
      <Text style={muted}>{is ? 'Afturkallanlegt fyrir upphaf. Endurgreiðsla fer á upprunalega inneign eða peningaveski ef hittingi er aflýst eða uppgjöri hafnað.' : 'Reversible before the start. Cancellation or rejected settlement returns funds to the original credit or cash balance.'}</Text>
      {deferConfirmation ? <Text style={muted}>{is ? 'Staðfestu styrkinn með því að velja „Birta og styrkja“. Hann er aðeins greiddur þegar birting tekst.' : 'Choose “Publish and sponsor” to confirm this quote. Funding is committed only when publication succeeds.'}</Text>
        : <Button disabled={unavailable} label={is ? 'Staðfesta styrk' : 'Confirm sponsorship'} onPress={() => void contribute()} />}
    </View>}
  </View>;
}
