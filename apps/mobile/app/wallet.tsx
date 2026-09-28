import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
  defaultMeetupFilters,
  type FriendSummary,
  type MeetupSummary,
  type FinanceCommand,
  type FinanceSnapshot,
  type WithdrawalQuote,
} from '@rummal/shared';
import { Text, TextInput } from '@/components/Typography';
import { Button, ChoiceChip, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';
import { PoolSummary } from '@/features/hittingar/PoolSummary';
import { SponsorshipForm } from '@/features/hittingar/SponsorshipForm';

export default function WalletScreen() {
  const { user } = useApp();
  return <WalletSession key={user?.id ?? 'demo'} />;
}

function WalletSession() {
  const { theme, locale } = useApp();
  const is = locale === 'is';
  const router = useRouter();
  const { meetupId: initialMeetupId } = useLocalSearchParams<{ meetupId?: string }>();
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [events, setEvents] = useState<MeetupSummary[]>([]);

  const [wallet, setWallet] = useState<FinanceSnapshot | null>(null);
  const [amount, setAmount] = useState('500');
  const [recipient, setRecipient] = useState('');
  const [meetup, setMeetup] = useState(initialMeetupId ?? '');
  const [quote, setQuote] = useState<WithdrawalQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<FinanceCommand | null>(null);
  const load = useCallback(async () => {
    try {
      setPending(await api.getPendingFinanceCommand());
      setWallet(await api.getWallet());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useFocusEffect(
    useCallback(() => {
      void api
        .listFriends()
        .then(setFriends)
        .catch(() => {});
      void api
        .discoverMeetups(defaultMeetupFilters)
        .then(async listed => {
          if (initialMeetupId && !listed.some(event => event.id === initialMeetupId)) {
            const targeted = await api.getMeetup(initialMeetupId).catch(() => null);
            if (targeted) listed = [targeted, ...listed];
          }
          setEvents(listed);
          if (initialMeetupId) setMeetup(initialMeetupId);
        })
        .catch(() => {});
    }, [initialMeetupId]),
  );
  const selectedEvent = events.find(event => event.id === meetup);
  const refreshSelected = async () => {
    await load();
    if (meetup) {
      const next = await api.getMeetup(meetup);
      setEvents(current => current.map(event => event.id === meetup ? next : event));
    }
  };
  const run = async (command: FinanceCommand) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const result = await api.walletCommand(command);
      setQuote(command.action === 'quote' ? (result as WithdrawalQuote) : null);
      await refreshSelected();
      if (command.action === 'publish_sponsored') router.push(`/hittingar/${encodeURIComponent(command.meetupId)}` as never);
    } catch {
      setError(true);
      setPending(await api.getPendingFinanceCommand().catch(() => null));
    } finally {
      setBusy(false);
    }
  };
  const base = () => ({ amount: Number(amount), requestId: Crypto.randomUUID() });
  const inputStyle = {
    color: theme.colors.text,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  };
  const statusLabel = (status: string) =>
    ({
      pending: is ? 'Í bið' : 'Pending',
      unknown: is ? 'Staðfesting í bið' : 'Awaiting confirmation',
      paid: is ? 'Greitt' : 'Paid',
      failed: is ? 'Mistókst' : 'Failed',
      fulfilled: is ? 'Afgreitt' : 'Fulfilled',
      refunded: is ? 'Endurgreitt' : 'Refunded',
    })[status] ?? status;
  return (
    <Screen back title={is ? 'Veski' : 'Wallet'}>
      <View style={{ padding: 20, gap: 14 }}>
        <Text style={{ color: theme.colors.text }}>
          {is
            ? 'Prufukerfi — engir raunverulegir peningar eða vörur.'
            : 'Sandbox — no real money or goods.'}
        </Text>
        {error && (
          <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
            {is ? 'Veskið eða aðgerðin er ekki tiltæk.' : 'Wallet or action unavailable.'}
          </Text>
        )}
        {pending && (
          <>
            <Text style={{ color: theme.colors.text }}>
              {is
                ? 'Staðfesting á síðustu aðgerð er í bið. Athugaðu hana áður en þú byrjar aðra.'
                : 'Your last action is awaiting confirmation. Resolve it before starting another.'}
            </Text>
            <Button
              disabled={busy}
              label={is ? 'Athuga síðustu aðgerð' : 'Check last action'}
              onPress={() => void run(pending)}
            />
          </>
        )}
        {wallet && (
          <>
            <Text style={{ color: theme.colors.text, fontSize: 28 }}>
              {wallet.balance.toLocaleString('is-IS')} kr · {is ? 'Peningaveski' : 'Cash wallet'}
            </Text>
            <Text style={{ color: theme.colors.text }}>{is ? 'Til úttektar' : 'Withdrawable'}: {wallet.withdrawableBalance.toLocaleString('is-IS')} kr</Text>
            <Text style={{ color: theme.colors.text }}>{is ? 'Styrktarinneign' : 'Sponsorship credit'}: {wallet.sponsorshipCredit.toLocaleString('is-IS')} kr</Text>
            <Text style={{ color: theme.colors.textMuted }}>{is ? 'Styrktarinneign má aðeins nota til að styrkja hittinga. Hún rennur ekki út og er aðskilin frá peningum sem má gefa, nota í verslun eða taka út.' : 'Sponsorship credit is only for meetup pools. It does not expire and is separate from money available for gifts, shopping or withdrawal.'}</Text>
            <TextInput
              accessibilityLabel={is ? 'Upphæð' : 'Amount'}
              keyboardType="number-pad"
              value={amount}
              onChangeText={value => { setAmount(value); setQuote(null); }}
              style={inputStyle}
            />
            <Button
              disabled={busy}
              label={is ? 'Bæta við prufuinneign' : 'Add test funds'}
              onPress={() => void run({ action: 'purchase', ...base() })}
            />
            <Text style={{ color: theme.colors.text }}>{is ? 'Veldu vin' : 'Choose a friend'}</Text>
            {friends
              .filter((f) => f.status === 'accepted')
              .map((friend) => (
                <ChoiceChip
                  key={friend.profileId}
                  label={friend.displayName}
                  selected={recipient === friend.profileId}
                  onPress={() => setRecipient(friend.profileId)}
                />
              ))}
            <Button
              disabled={busy || !recipient}
              label={is ? 'Gefa' : 'Gift'}
              onPress={() => void run({ action: 'gift', recipientId: recipient, ...base() })}
            />
            <Text style={{ color: theme.colors.text }}>
              {is ? 'Veldu hitting' : 'Choose a meetup'}
            </Text>
            {events.map((event) => (
              <ChoiceChip
                key={event.id}
                label={event.title}
                selected={meetup === event.id}
                onPress={() => setMeetup(event.id)}
              />
            ))}
            {selectedEvent && <>
              <PoolSummary pool={selectedEvent.pool} />
              {selectedEvent.pool?.status === 'accepting' && selectedEvent.status === 'published'
                ? <SponsorshipForm key={`${meetup}:${wallet.balance}:${wallet.sponsorshipCredit}`} meetupId={meetup} disabled={busy || Boolean(pending)} onComplete={refreshSelected} />
                : <Text style={{ color: theme.colors.textMuted }}>{is ? 'Lokað fyrir styrki á þennan hitting.' : 'This meetup is not accepting sponsorships.'}</Text>}
            </>}
            {meetup && (
              <Button
                variant="secondary"
                label={is ? 'Skrá mætingu' : 'Check in'}
                onPress={() =>
                  router.push(`/check-in?meetupId=${encodeURIComponent(meetup)}` as never)
                }
              />
            )}
            <Button
              disabled={busy}
              label={is ? 'Skoða úttekt' : 'Quote withdrawal'}
              onPress={() => void run({ action: 'quote', ...base() })}
            />
            {quote && (
              <>
                <Text style={{ color: theme.colors.text }}>
                    {is ? 'Inneign' : 'Principal'}: {quote.amount} kr · {is ? 'Gjald' : 'Fee'}: {quote.fee} kr · {is ? 'Útborgað' : 'Payout'}: {quote.net} kr
                    {quote.bonus > 0 ? ` · ${is ? 'Áður staðfest leiðrétting' : 'Previously quoted adjustment'}: ${quote.bonus} kr` : ''}
                </Text>
                <Button
                  disabled={busy}
                  label={is ? 'Staðfesta prufuúttekt' : 'Confirm test withdrawal'}
                  onPress={() =>
                    void run({
                      action: 'withdraw',
                      quoteId: quote.id,
                      requestId: Crypto.randomUUID(),
                    })
                  }
                />
              </>
            )}
            {wallet.shop.map((item) => (
              <Button
                key={item.sku}
                disabled={busy}
                variant="secondary"
                label={`${item.title} · ${item.price} kr`}
                onPress={() =>
                  void run({ action: 'shop', sku: item.sku, requestId: Crypto.randomUUID() })
                }
              />
            ))}
            {wallet.transactions
              .slice()
              .reverse()
              .map((tx) => (
                <Text key={tx.id} style={{ color: theme.colors.text }}>
                  {new Date(tx.at).toLocaleDateString(locale)} · {tx.amount > 0 ? '+' : ''}
                  {tx.amount} kr
                </Text>
              ))}
            {wallet.contributions
              .filter((c) => !c.reversed)
              .map((c) => (
                <View key={c.id} style={{ gap: 6 }}>
                  <Text style={{ color: theme.colors.text }}>
                    {events.find((e) => e.id === c.eventId)?.title ??
                      (is ? 'Styrkur til hittings' : 'Meetup contribution')}{' '}
                    · {c.amount} kr
                  </Text>
                  <Button
                    disabled={busy}
                    variant="secondary"
                    label={is ? 'Afturkalla fyrir upphaf' : 'Reverse before start'}
                    onPress={() =>
                      void run({
                        action: 'reverse',
                        contributionId: c.id,
                        requestId: Crypto.randomUUID(),
                      })
                    }
                  />
                </View>
              ))}
            {wallet.payouts.map((p) => (
              <Text key={p.id} style={{ color: theme.colors.text }}>
                {p.net} kr · {statusLabel(p.status)}
              </Text>
            ))}
            {wallet.orders.map((order) => (
              <Text key={order.id} style={{ color: theme.colors.text }}>
                {is ? 'Prufupöntun' : 'Test order'} · {order.amount} kr ·{' '}
                {statusLabel(order.status)}
              </Text>
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}
