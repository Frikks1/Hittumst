import { z } from 'zod';
import { getPoolSummary, auditFinance, type FinanceState } from '@rummal/shared';

export const financeReviewSchema = z
  .object({
    meetupId: z.string().uuid(),
    decision: z.enum(['approved', 'rejected']),
    reason: z.string().trim().min(20).max(500),
    requestId: z.string().uuid(),
    expectedReview: z.enum(['pending', 'approved', 'rejected']).optional(),
  })
  .strict();
export type FinanceReview = z.infer<typeof financeReviewSchema>;

export function applyFinanceReview(state: FinanceState, actor: string, input: FinanceReview) {
  const key = 'review:' + input.requestId;
  const fingerprint = JSON.stringify({ ...input, actor });
  if (state.receipts[key]) {
    if (state.receipts[key] !== fingerprint) throw new Error('review_conflict');
    return { state, result: null };
  }
  const event = state.events[input.meetupId];
  if (!event || event.settled || event.hostId === actor) throw new Error('review_unavailable');
  if (event.review !== (input.expectedReview ?? 'pending')) throw new Error('review_conflict');
  const previousReview = event.review;
  event.review = input.decision;
  state.receipts[key + ':audit'] = JSON.stringify({
    requestId: input.requestId,
    eventId: input.meetupId,
    actor,
    decision: input.decision,
    reason: input.reason,
    previousReview,
    at: new Date().toISOString(),
  });
  state.receipts[key] = fingerprint;
  state.flags.push({
    accountId: actor,
    reason: 'financial_review:' + input.meetupId + ':' + input.decision + ':' + input.reason,
  });
  return { state, result: null };
}

export function financeQueue(state: FinanceState, actor: string) {
  if (state.environment !== 'sandbox') throw new Error('sandbox_disabled');
  auditFinance(state);
  return {
    events: Object.values(state.events)
      .filter((event) => !event.settled)
      .map((event) => ({
        id: event.id,
        endsAt: event.endsAt,
        review: event.review,
        cancelled: event.cancelled,
        attendees: event.eligibleAttendees.length,
        checkedIn: Object.keys(event.checkedIn).length,
        canReview: event.hostId !== actor,
        pool: getPoolSummary(state, event.id),
      }))
      .sort((a, b) => a.endsAt.localeCompare(b.endsAt)),
    payouts: Object.values(state.payouts)
      .filter((payout) => payout.status !== 'paid')
      .map((payout) => ({
        id: payout.id,
        status: payout.status,
        gross: payout.amount,
        bonus: payout.bonus,
        fee: payout.fee,
        net: payout.net,
      })),
    orders: Object.values(state.orders)
      .filter((order) => order.status === 'pending')
      .map((order) => ({
        id: order.id,
        status: order.status,
        sku: order.sku,
        amount: order.amount,
      })),
    // Include only decisions and exception text; never serialize the full state,
    // check-in codes, payout identities, receipts or member money provenance.
    flags: state.flags
      .slice(-100)
      .reverse()
      .map((flag) => ({ accountId: flag.accountId, reason: flag.reason })),
    reviews: Object.entries(state.receipts)
      .filter(([key]) => /^review:[0-9a-f-]{36}:audit$/i.test(key))
      .flatMap(([, value]) => {
        try {
          const parsed = z
            .object({
              requestId: z.string().uuid(),
              eventId: z.string().uuid(),
              actor: z.string().min(1).max(100),
              decision: z.enum(['approved', 'rejected']),
              reason: z.string().min(20).max(500),
              previousReview: z.enum(['pending', 'approved', 'rejected']),
              at: z.iso.datetime(),
            })
            .strict()
            .safeParse(JSON.parse(value));
          return parsed.success ? [parsed.data] : [];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 100),
    ledgerEntries: state.journal.length,
    sponsorship: {
      reservedCredit: Object.entries(state.balances).filter(([key]) => key.startsWith('sponsorship:')).reduce((sum, [, amount]) => sum + amount, 0),
      pendingServiceFees: Object.entries(state.balances).filter(([key]) => key.startsWith('sponsor-fee:')).reduce((sum, [, amount]) => sum + amount, 0),
      earnedServiceFees: state.balances['platform:sponsorship-fees'] ?? 0,
      activePools: Object.entries(state.balances).filter(([key]) => key.startsWith('pool:')).reduce((sum, [, amount]) => sum + amount, 0),
    },
  };
}
export type FinanceQueue = ReturnType<typeof financeQueue>;
