import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
  type FriendSummary,
  type FinanceCommand,
  type FinanceSnapshot,
  type WithdrawalQuote,
} from '@rummal/shared';
import { Text, TextInput } from '@/components/Typography';
import { Button, ChoiceChip, Screen } from '@/components/ui';
import { useApp } from '@/providers/AppProvider';
import { api } from '@/services';

export default function WalletScreen() {
  const { user } = useApp();
  return <WalletSession key={user?.id ?? 'demo'} />;
}

function WalletSession() {
  const { theme, locale } = useApp();
  const is = locale === 'is';
  const [friends, setFriends] = useState<FriendSummary[]>([]);

  const [wallet, setWallet] = useState<FinanceSnapshot | null>(null);
  const [amount, setAmount] = useState('500');
  const [recipient, setRecipient] = useState('');
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
    }, []),
  );
  const run = async (command: FinanceCommand) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const result = await api.walletCommand(command);
      setQuote(command.action === 'quote' ? (result as WithdrawalQuote) : null);
      await load();
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
