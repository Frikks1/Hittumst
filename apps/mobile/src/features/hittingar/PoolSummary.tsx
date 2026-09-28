import { View } from 'react-native';
import { Text } from '@/components/Typography';
import { useApp } from '@/providers/AppProvider';
import type { MeetupSummary } from '@rummal/shared';

export function PoolSummary({ pool, compact = false }: { pool: MeetupSummary['pool']; compact?: boolean }) {
  const { locale, theme } = useApp();
  const is = locale === 'is';
  if (!pool) return <Text style={{ color: theme.colors.textMuted }}>{is ? 'Styrktarsjóður ekki tiltækur' : 'Reward pool unavailable'}</Text>;
  const money = (value: number) => `${value.toLocaleString('is-IS')} kr`;
  const total = pool.status === 'paid_out' ? pool.paidTotal : pool.status === 'refunded' ? pool.refundedTotal : pool.total;
  const status = {
    accepting: is ? 'Tekur við styrkjum' : 'Accepting sponsorships',
    locked: is ? 'Lokað fyrir styrki' : 'Sponsorship closed',
    awaiting_settlement: is ? 'Bíður uppgjörs' : 'Awaiting settlement',
    paid_out: is ? 'Greitt út' : 'Paid out',
    refunded: is ? 'Endurgreitt' : 'Refunded',
  }[pool.status];
  return <View style={{ gap: compact ? 3 : 7, padding: compact ? 10 : 16, borderRadius: 16, backgroundColor: theme.colors.accentSoft }}>
    <Text style={{ color: theme.colors.text, fontWeight: '800', fontSize: compact ? 17 : 24 }}>
      {money(total)} · {pool.status === 'paid_out' || pool.status === 'refunded' ? status : is ? 'Styrktarsjóður' : 'Reward pool'}
    </Text>
    <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>{status}</Text>
    <Text style={{ color: theme.colors.text, fontSize: 12 }}>
      {pool.hostBps / 100}% {is ? 'til höfundar' : 'to creator'} · {(10_000 - pool.hostBps) / 100}% {is ? 'til annarra þátttakenda' : 'to other attendees'}
    </Text>
    {pool.status !== 'paid_out' && pool.status !== 'refunded' && <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
      {is ? 'Áætlað á þátttakanda' : 'Estimated per attendee'}: {pool.estimatedParticipantReward === null ? (is ? 'bíður þátttakenda' : 'awaiting attendees') : money(pool.estimatedParticipantReward)}
    </Text>}
    {!compact && <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
      {is ? 'Greiðslur miðast við staðfesta mætingu, að lágmarki 24 klst. bið og yfirferð. Áætlun getur breyst.' : 'Rewards require verified attendance, a minimum 24-hour hold and review. Estimates may change.'}
    </Text>}
  </View>;
}
