import { z } from 'zod';
import { activeTier, TIERS, tierIdSchema, withdrawalBadgeBps, type TierId } from './tiers';

const isk = z.number().int().positive().max(100_000_000);
export const sponsorshipFundingSourceSchema = z.enum(['credit', 'cash', 'mixed']);
export type SponsorshipFundingSource = z.infer<typeof sponsorshipFundingSourceSchema>;
const contributionFields = {
  amount: isk,
  meetupId: z.string().min(1).max(100),
  expectedHostBps: z.number().int(),
  quoteId: z.string().min(1).max(150),
  requestId: z.string().uuid(),
};
export const financeCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('purchase'), amount: isk, requestId: z.string().uuid() }),
  z.object({
    action: z.literal('gift'),
    amount: isk,
    recipientId: z.string().min(1).max(100),
    requestId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('pool_info'),
    meetupId: z.string().min(1).max(100),
    requestId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('contribution_quote'),
    amount: isk,
    meetupId: z.string().min(1).max(100),
    fundingSource: sponsorshipFundingSourceSchema,
    creditAmount: z.number().int().nonnegative().max(100_000_000).optional(),
    requestId: z.string().uuid(),
  }),
  z.object({ action: z.literal('contribute'), ...contributionFields }),
  z.object({ action: z.literal('publish_sponsored'), ...contributionFields }),
  z.object({
    action: z.literal('reverse'),
    contributionId: z.string().min(1).max(150),
    requestId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('checkin_code'),
    meetupId: z.string().min(1).max(100),
    requestId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('checkin'),
    meetupId: z.string().min(1).max(100),
    code: z.string().min(16).max(200),
    requestId: z.string().uuid(),
  }),
  z.object({ action: z.literal('quote'), amount: isk, requestId: z.string().uuid() }),
  z.object({
    action: z.literal('withdraw'),
    quoteId: z.string().min(1).max(150),
    requestId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('shop'),
    sku: z.string().min(1).max(100),
    requestId: z.string().uuid(),
  }),
]);
export type FinanceCommand = z.infer<typeof financeCommandSchema>;
export type FinanceMember = {
  tier: TierId;
  paidUntil: string | null;
  premiumMonths: number;
  payoutIdentity: string | null;
  suspended: boolean;
};
export type MoneyLot = {
  id: string;
  holder: string;
  amount: number;
  origin: 'purchase' | 'monthly' | 'earning';
  originId: string;
  visited: string[];
  eligible: boolean;
  // Absent on legacy lots: those retain their existing wallet rights.
  purpose?: 'sponsorship';
};
export type LedgerTransaction = {
  id: string;
  kind: string;
  at: string;
  entries: { account: string; amount: number }[];
};
export type FundedEvent = {
  id: string;
  hostId: string;
  startsAt: string;
  endsAt: string;
  cancelled: boolean;
  eligibleAttendees: string[];
  hostBps: number | null;
  checkedIn: Record<string, string>;
  code: { value: string; expiresAt: string } | null;
  review: 'pending' | 'approved' | 'rejected';
  settled: boolean;
  settlementOutcome?: 'paid_out' | 'refunded';
  paidTotal?: number;
  refundedTotal?: number;
};
export type Contribution = {
  id: string;
  eventId: string;
  memberId: string;
  amount: number;
  lotIds: string[];
  reversed: boolean;
  fundingSource?: SponsorshipFundingSource;
  creditAmount?: number;
  cashAmount?: number;
  serviceFee?: number;
  processingFee?: number;
  feeLotIds?: string[];
  refundReason?: 'reversed' | 'cancelled' | 'rejected' | 'no_attendees';
};
export type ContributionQuote = {
  id: string;
  memberId: string;
  meetupId: string;
  amount: number;
  fundingSource: SponsorshipFundingSource;
  creditAmount: number;
  cashAmount: number;
  serviceFee: number;
  processingFee: number;
  totalCash: number;
  eventHostId: string;
  eventStartsAt: string;
  eventEndsAt: string;
  hostBps: number;
  expiresAt: string;
  used: boolean;
};
export type PoolSummary = {
  hostBps: number;
  locked: boolean;
  total: number;
  fundedTotal: number;
  paidTotal: number;
  refundedTotal: number;
  status: 'accepting' | 'locked' | 'awaiting_settlement' | 'paid_out' | 'refunded';
  estimatedParticipantReward: number | null;
  eligibleParticipantCount: number;
};
export type WithdrawalQuote = {
  id: string;
  memberId: string;
  amount: number;
  eligible: number;
  bonus: number;
  fee: number;
  net: number;
  badgeBps: number;
  expiresAt: string;
  used: boolean;
};
export type Payout = {
  id: string;
  memberId: string;
  amount: number;
  bonus: number;
  fee: number;
  net: number;
  status: 'pending' | 'unknown' | 'paid' | 'failed';
  providerReference: string | null;
};
export type ShopOrder = {
  id: string;
  memberId: string;
  sku: string;
  amount: number;
  status: 'pending' | 'fulfilled' | 'refunded';
  receipt: string | null;
};
export type SubscriptionPeriod = {
  accountId: string;
  periodId: string;
  startsAt: string;
  endsAt: string;
  tier: TierId;
  granted: number;
  refunded: boolean;
};
export type FinanceState = {
  environment: 'sandbox';
  sequence: number;
  balances: Record<string, number>;
  members: Record<string, FinanceMember>;
  lots: MoneyLot[];
  journal: LedgerTransaction[];
  events: Record<string, FundedEvent>;
  contributions: Record<string, Contribution>;
  quotes: Record<string, WithdrawalQuote>;
  contributionQuotes?: Record<string, ContributionQuote>;
  payouts: Record<string, Payout>;
  orders: Record<string, ShopOrder>;
  subscriptions: Record<string, SubscriptionPeriod>;
  receipts: Record<string, string>;
  requests: Record<string, { fingerprint: string; result: unknown }>;
  flags: { accountId: string; reason: string }[];
};
export type FinanceContext = { memberId: string; now: string; randomId: () => string };
export type ShopItem = { sku: string; title: string; price: number; available: boolean };
// These are deliberately labelled fixtures, not promises of third-party stock or partnerships.
export const SANDBOX_SHOP: ShopItem[] = [
  { sku: 'sandbox-voucher', title: 'Prufugjafabréf / Test voucher', price: 500, available: true },
];
export const walletAccount = (id: string) => `wallet:${id}`;
export const sponsorshipAccount = (id: string) => `sponsorship:${id}`;
const contributionFeeAccount = (id: string) => `sponsor-fee:${id}`;
const poolAccount = (id: string) => `pool:${id}`;
function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function flag(state: FinanceState, accountId: string, reason: string) {
  if (!state.flags.some((item) => item.accountId === accountId && item.reason === reason))
    state.flags.push({ accountId, reason });
}
function post(
  state: FinanceState,
  id: string,
  kind: string,
  at: string,
  entries: LedgerTransaction['entries'],
) {
  requireCondition(
    entries.length >= 2 &&
      entries.every((e) => Number.isSafeInteger(e.amount)) &&
      entries.reduce((sum, e) => sum + e.amount, 0) === 0,
    'unbalanced_ledger',
  );
  requireCondition(!state.journal.some((tx) => tx.id === id), 'duplicate_ledger_id');
  for (const entry of entries) {
    const next = (state.balances[entry.account] ?? 0) + entry.amount;
    requireCondition(
      Number.isSafeInteger(next) && (entry.account.startsWith('external:') || next >= 0),
      'insufficient_funds',
    );
    state.balances[entry.account] = next;
  }
  state.journal.push({ id, kind, at, entries });
}
function creditLot(state: FinanceState, input: Omit<MoneyLot, 'id'>) {
  const lot = { ...input, id: `lot-${++state.sequence}` };
  state.lots.push(lot);
  return lot.id;
}
function moveLots(
  state: FinanceState,
  from: string,
  to: string,
  value: number,
  change: (lot: MoneyLot) => Partial<MoneyLot> = () => ({}),
) {
  let remaining = value;
  const ids: string[] = [];
  let eligible = 0;
  for (const lot of [...state.lots]) {
    if (lot.holder !== from || lot.amount === 0 || remaining === 0) continue;
    const taken = Math.min(remaining, lot.amount);
    remaining -= taken;
    lot.amount -= taken;
    if (lot.eligible) eligible += taken;
    ids.push(creditLot(state, { ...lot, ...change(lot), holder: to, amount: taken }));
  }
  requireCondition(remaining === 0, 'insufficient_lots');
  return { ids, eligible };
}
function previewEligible(state: FinanceState, holder: string, value: number) {
  let remaining = value;
  let eligible = 0;
  for (const lot of state.lots) {
    if (lot.holder !== holder) continue;
    const taken = Math.min(remaining, lot.amount);
    remaining -= taken;
    if (lot.eligible) eligible += taken;
    if (!remaining) break;
  }
  requireCondition(remaining === 0, 'insufficient_funds');
  return eligible;
}
export function newFinanceState(): FinanceState {
  const state: FinanceState = {
    environment: 'sandbox',
    sequence: 0,
    balances: {},
    members: {},
    lots: [],
    journal: [],
    events: {},
    contributions: {},
    quotes: {},
    contributionQuotes: {},
    payouts: {},
    orders: {},
    subscriptions: {},
    receipts: {},
    requests: {},
    flags: [],
  };
  post(state, 'sandbox-reserve', 'sandbox_funding', new Date(0).toISOString(), [
    { account: 'external:sandbox', amount: -10_000_000 },
    { account: 'platform:reserve', amount: 10_000_000 },
  ]);
  return state;
}
export function auditFinance(state: FinanceState) {
  const balances: Record<string, number> = {};
  const ids = new Set<string>();
  for (const tx of state.journal) {
    requireCondition(!ids.has(tx.id), 'duplicate_ledger_id');
    ids.add(tx.id);
    requireCondition(
      tx.entries.length >= 2 &&
        tx.entries.every((entry) => Number.isSafeInteger(entry.amount)) &&
        tx.entries.reduce((sum, item) => sum + item.amount, 0) === 0,
      'unbalanced_ledger',
    );
    for (const entry of tx.entries) {
      balances[entry.account] = (balances[entry.account] ?? 0) + entry.amount;
      requireCondition(
        Number.isSafeInteger(balances[entry.account]) &&
          (entry.account.startsWith('external:') || balances[entry.account]! >= 0),
        'invalid_ledger_balance',
      );
    }
  }
  for (const key of new Set([...Object.keys(balances), ...Object.keys(state.balances)]))
    requireCondition((balances[key] ?? 0) === (state.balances[key] ?? 0), 'balance_drift');
  const lots: Record<string, number> = {};
  for (const lot of state.lots) {
    requireCondition(Number.isSafeInteger(lot.amount) && lot.amount >= 0, 'invalid_lot');
    lots[lot.holder] = (lots[lot.holder] ?? 0) + lot.amount;
  }
  for (const key of new Set([
    ...Object.keys(lots),
    ...Object.keys(balances).filter((k) =>
      /^(wallet|sponsorship|pool|payout|order|sponsor-fee):/.test(k),
    ),
  ]))
    requireCondition((lots[key] ?? 0) === (balances[key] ?? 0), 'lot_balance_drift');
  return true;
}
export function applyFinanceCommand(
  original: FinanceState,
  input: FinanceCommand,
  context: FinanceContext,
): { state: FinanceState; result: unknown } {
  const cmd = financeCommandSchema.parse(input);
  const state = structuredClone(original);
  const member = state.members[context.memberId];
  requireCondition(member && !member.suspended, 'account_unavailable');
  const key = `${context.memberId}:${cmd.requestId}`;
  const fingerprint = JSON.stringify(cmd);
  if (state.requests[key]) {
    requireCondition(state.requests[key].fingerprint === fingerprint, 'idempotency_conflict');
    return { state: original, result: state.requests[key].result };
  }
  const now = Date.parse(context.now);
  const owner = walletAccount(context.memberId);
  const id = cmd.requestId;
  let result: unknown = { id };
  if (cmd.action === 'purchase') {
    // Called only behind the explicit sandbox boundary. Live purchases require verified payment settlement.
    post(state, id, 'sandbox_purchase', context.now, [
      { account: 'external:purchase', amount: -cmd.amount },
      { account: owner, amount: cmd.amount },
    ]);
    creditLot(state, {
      holder: owner,
      amount: cmd.amount,
      origin: 'purchase',
      originId: id,
      visited: [context.memberId],
      eligible: false,
    });
  } else if (cmd.action === 'gift') {
    const recipient = state.members[cmd.recipientId];
    requireCondition(
      cmd.recipientId !== context.memberId && recipient && !recipient.suspended,
      'recipient_unavailable',
    );
    moveLots(state, owner, walletAccount(cmd.recipientId), cmd.amount, (lot) => {
      if (lot.visited.includes(cmd.recipientId)) flag(state, context.memberId, 'circular_funding');
      return { eligible: false, visited: [...new Set([...lot.visited, cmd.recipientId])] };
    });
    post(state, id, 'gift', context.now, [
      { account: owner, amount: -cmd.amount },
      { account: walletAccount(cmd.recipientId), amount: cmd.amount },
    ]);
  } else if (cmd.action === 'pool_info') {
    result = getPoolSummary(state, cmd.meetupId, context.now);
  } else if (cmd.action === 'contribution_quote') {
    requireCondition(
      activeTier(member.tier, member.paidUntil, now) !== 'plebbi',
      'paid_subscription_required',
    );
    const event = state.events[cmd.meetupId];
    requireCondition(
      event && !event.cancelled && !event.settled && now < Date.parse(event.startsAt),
      'pool_closed',
    );
    const creditAmount =
      cmd.fundingSource === 'credit'
        ? cmd.amount
        : cmd.fundingSource === 'cash'
          ? 0
          : (cmd.creditAmount ?? 0);
    const cashAmount = cmd.amount - creditAmount;
    requireCondition(
      creditAmount >= 0 && creditAmount <= cmd.amount && creditAmount % 500 === 0,
      'credit_units_required',
    );
    requireCondition(
      cmd.creditAmount === undefined || cmd.creditAmount === creditAmount,
      'funding_source_mismatch',
    );
    requireCondition(
      cmd.fundingSource !== 'mixed' || (creditAmount > 0 && cashAmount > 0),
      'funding_source_mismatch',
    );
    const serviceFee = Math.ceil(cashAmount / 10);
    // Sandbox wallet funds are already settled; no processor is used for this transfer.
    const processingFee = 0;
    const totalCash = cashAmount + serviceFee + processingFee;
    requireCondition(
      (state.balances[sponsorshipAccount(context.memberId)] ?? 0) >= creditAmount,
      'insufficient_sponsorship_credit',
    );
    requireCondition((state.balances[owner] ?? 0) >= totalCash, 'insufficient_funds');
    const quote: ContributionQuote = {
      id,
      memberId: context.memberId,
      meetupId: event.id,
      amount: cmd.amount,
      fundingSource: cmd.fundingSource,
      creditAmount,
      cashAmount,
      serviceFee,
      processingFee,
      totalCash,
      eventHostId: event.hostId,
      eventStartsAt: event.startsAt,
      eventEndsAt: event.endsAt,
      hostBps: event.hostBps ?? 2500,
      expiresAt: new Date(Math.min(now + 120_000, Date.parse(event.startsAt))).toISOString(),
      used: false,
    };
    (state.contributionQuotes ??= {})[id] = quote;
    result = quote;
  } else if (cmd.action === 'contribute' || cmd.action === 'publish_sponsored') {
    requireCondition(
      activeTier(member.tier, member.paidUntil, now) !== 'plebbi',
      'paid_subscription_required',
    );
    const event = state.events[cmd.meetupId];
    requireCondition(
      event && !event.cancelled && !event.settled && now < Date.parse(event.startsAt),
      'pool_closed',
    );
    if (cmd.action === 'publish_sponsored')
      requireCondition(event.hostId === context.memberId, 'not_host');
    const quote = state.contributionQuotes?.[cmd.quoteId];
    requireCondition(
      quote &&
        !quote.used &&
        quote.memberId === context.memberId &&
        now < Date.parse(quote.expiresAt),
      'quote_expired',
    );
    requireCondition(
      quote.meetupId === event.id &&
        quote.amount === cmd.amount &&
        quote.eventHostId === event.hostId &&
        quote.eventStartsAt === event.startsAt &&
        quote.eventEndsAt === event.endsAt,
      'quote_changed',
    );
    requireCondition(
      cmd.expectedHostBps === quote.hostBps && quote.hostBps === (event.hostBps ?? 2500),
      'pool_split_changed',
    );
    event.hostBps ??= 2500;
    const credit = sponsorshipAccount(context.memberId);
    const creditLots = moveLots(state, credit, poolAccount(event.id), quote.creditAmount);
    const cashLots = moveLots(state, owner, poolAccount(event.id), quote.cashAmount);
    const feeLots = moveLots(state, owner, contributionFeeAccount(id), quote.serviceFee);
    post(state, id, 'contribution', context.now, [
      { account: credit, amount: -quote.creditAmount },
      { account: owner, amount: -quote.totalCash },
      { account: poolAccount(event.id), amount: cmd.amount },
      { account: contributionFeeAccount(id), amount: quote.serviceFee },
    ]);
    quote.used = true;
    state.contributions[id] = {
      id,
      eventId: event.id,
      memberId: context.memberId,
      amount: cmd.amount,
      lotIds: [...creditLots.ids, ...cashLots.ids],
      reversed: false,
      fundingSource: quote.fundingSource,
      creditAmount: quote.creditAmount,
      cashAmount: quote.cashAmount,
      serviceFee: quote.serviceFee,
      processingFee: quote.processingFee,
      feeLotIds: feeLots.ids,
    };
    result = state.contributions[id];
  } else if (cmd.action === 'reverse') {
    const contribution = state.contributions[cmd.contributionId];
    requireCondition(
      contribution && contribution.memberId === context.memberId && !contribution.reversed,
      'contribution_unavailable',
    );
    const event = state.events[contribution.eventId];
    requireCondition(event && !event.settled && now < Date.parse(event.startsAt), 'pool_closed');
    refundContribution(state, contribution, context.now, id, 'reversed');
  } else if (cmd.action === 'checkin_code') {
    const event = state.events[cmd.meetupId];
    requireCondition(
      event &&
        event.hostId === context.memberId &&
        !event.cancelled &&
        now >= Date.parse(event.startsAt) &&
        now < Date.parse(event.endsAt),
      'checkin_unavailable',
    );
    if (!event.code || now >= Date.parse(event.code.expiresAt))
      event.code = {
        value: context.randomId(),
        expiresAt: new Date(Math.min(now + 30_000, Date.parse(event.endsAt))).toISOString(),
      };
    result = event.code;
  } else if (cmd.action === 'checkin') {
    const event = state.events[cmd.meetupId];
    requireCondition(
      event &&
        !event.cancelled &&
        context.memberId !== event.hostId &&
        event.eligibleAttendees.includes(context.memberId) &&
        now >= Date.parse(event.startsAt) &&
        now < Date.parse(event.endsAt),
      'checkin_unavailable',
    );
    requireCondition(
      event.code?.value === cmd.code && now < Date.parse(event.code.expiresAt),
      'checkin_code_expired',
    );
    requireCondition(!event.checkedIn[context.memberId], 'already_checked_in');
    event.checkedIn[context.memberId] = context.now;
    const repeated = Object.values(state.events).filter(
      (previous) =>
        previous.hostId === event.hostId &&
        previous.checkedIn[context.memberId] &&
        Date.parse(previous.checkedIn[context.memberId]!) >= now - 60 * 86_400_000,
    ).length;
    if (repeated >= 3) flag(state, context.memberId, `repeated_attendance:${event.hostId}`);
  } else if (cmd.action === 'quote') {
    requireCondition(member.payoutIdentity, 'payout_identity_required');
    const eligible = previewEligible(state, owner, cmd.amount);
    const bps = withdrawalBadgeBps(
      activeTier(member.tier, member.paidUntil, now),
      member.premiumMonths,
    );
    const bonus = 0; // Tenure badges are cosmetic; new withdrawal quotes never mint a bonus.
    const quote: WithdrawalQuote = {
      id,
      memberId: context.memberId,
      amount: cmd.amount,
      eligible,
      bonus,
      badgeBps: bps,
      fee: 0,
      net: cmd.amount + bonus,
      expiresAt: new Date(now + 120_000).toISOString(),
      used: false,
    };
    state.quotes[id] = quote;
    result = quote;
  } else if (cmd.action === 'withdraw') {
    const quote = state.quotes[cmd.quoteId];
    requireCondition(
      quote &&
        quote.memberId === context.memberId &&
        !quote.used &&
        quote.bonus === 0 &&
        now < Date.parse(quote.expiresAt),
      'quote_expired',
    );
    requireCondition(
      member.payoutIdentity &&
        quote.eligible === previewEligible(state, owner, quote.amount) &&
        quote.badgeBps ===
          withdrawalBadgeBps(activeTier(member.tier, member.paidUntil, now), member.premiumMonths),
      'quote_changed',
    );
    requireCondition(
      !Object.entries(state.members).some(
        ([other, value]) =>
          other !== context.memberId && value.payoutIdentity === member.payoutIdentity,
      ),
      'payout_identity_shared',
    );
    const reserve = `payout:${id}`;
    moveLots(state, owner, reserve, quote.amount);
    post(state, id, 'payout_reserved', context.now, [
      { account: owner, amount: -quote.amount },
      { account: reserve, amount: quote.amount },
      { account: 'platform:reserve', amount: -quote.bonus },
      { account: `bonus:${id}`, amount: quote.bonus },
    ]);
    quote.used = true;
    state.payouts[id] = {
      id,
      memberId: context.memberId,
      amount: quote.amount,
      bonus: quote.bonus,
      fee: quote.fee,
      net: quote.net,
      status: 'pending',
      providerReference: null,
    };
    result = state.payouts[id];
  } else if (cmd.action === 'shop') {
    const item = SANDBOX_SHOP.find((item) => item.sku === cmd.sku && item.available);
    requireCondition(item, 'item_unavailable');
    moveLots(state, owner, `order:${id}`, item.price);
    post(state, id, 'order_reserved', context.now, [
      { account: owner, amount: -item.price },
      { account: `order:${id}`, amount: item.price },
    ]);
    state.orders[id] = {
      id,
      memberId: context.memberId,
      sku: item.sku,
      amount: item.price,
      status: 'pending',
      receipt: null,
    };
    result = state.orders[id];
  }
  state.requests[key] = { fingerprint, result };
  auditFinance(state);
  return { state, result };
}
function isSettlementRefund(state: FinanceState, contribution: Contribution): boolean {
  return (
    contribution.reversed &&
    (contribution.refundReason
      ? contribution.refundReason !== 'reversed'
      : state.journal.some(
          (tx) => tx.id === 'refund:' + contribution.id && tx.kind === 'contribution_refund',
        ))
  );
}
function refundContribution(
  state: FinanceState,
  contribution: Contribution,
  now: string,
  id: string,
  reason: NonNullable<Contribution['refundReason']>,
) {
  let creditAmount = 0;
  let cashAmount = 0;
  for (const lotId of contribution.lotIds) {
    const lot = state.lots.find((l) => l.id === lotId);
    requireCondition(
      lot && lot.holder === poolAccount(contribution.eventId),
      'contribution_already_spent',
    );
    if (lot.purpose === 'sponsorship') {
      lot.holder = sponsorshipAccount(contribution.memberId);
      creditAmount += lot.amount;
    } else {
      lot.holder = walletAccount(contribution.memberId);
      cashAmount += lot.amount;
    }
  }
  requireCondition(creditAmount + cashAmount === contribution.amount, 'contribution_already_spent');
  const fee = contribution.serviceFee ?? 0;
  for (const lotId of contribution.feeLotIds ?? []) {
    const lot = state.lots.find((l) => l.id === lotId);
    requireCondition(
      lot && lot.holder === contributionFeeAccount(contribution.id),
      'contribution_already_spent',
    );
    lot.holder = walletAccount(contribution.memberId);
  }
  post(state, id, 'contribution_refund', now, [
    { account: poolAccount(contribution.eventId), amount: -contribution.amount },
    { account: contributionFeeAccount(contribution.id), amount: -fee },
    { account: sponsorshipAccount(contribution.memberId), amount: creditAmount },
    { account: walletAccount(contribution.memberId), amount: cashAmount + fee },
  ]);
  contribution.reversed = true;
  contribution.refundReason = reason;
}
export function settleEvent(original: FinanceState, eventId: string, now: string): FinanceState {
  const state = structuredClone(original);
  const event = state.events[eventId];
  requireCondition(event, 'event_unavailable');
  if (event.settled) return original;
  requireCondition(
    event.cancelled || Date.parse(now) >= Date.parse(event.endsAt) + 86_400_000,
    'settlement_hold',
  );
  requireCondition(event.cancelled || event.review !== 'pending', 'financial_review_required');
  requireCondition(
    event.cancelled ||
      event.review === 'rejected' ||
      !Object.keys(event.checkedIn).some((id) => id !== event.hostId) ||
      (state.members[event.hostId] && !state.members[event.hostId]!.suspended),
    'host_financial_review_required',
  );
  const attendees = Object.keys(event.checkedIn)
    .filter((id) => id !== event.hostId)
    .sort();
  requireCondition(
    event.cancelled ||
      event.review === 'rejected' ||
      !attendees.some((id) => !state.members[id] || state.members[id].suspended),
    'attendance_dispute_requires_review',
  );
  if (event.cancelled || event.review === 'rejected' || !attendees.length) {
    for (const contribution of Object.values(state.contributions).filter(
      (c) => c.eventId === eventId && !c.reversed,
    ))
      refundContribution(
        state,
        contribution,
        now,
        `refund:${contribution.id}`,
        event.cancelled ? 'cancelled' : event.review === 'rejected' ? 'rejected' : 'no_attendees',
      );
    event.settlementOutcome = 'refunded';
    event.refundedTotal = Object.values(state.contributions)
      .filter((c) => c.eventId === eventId && isSettlementRefund(state, c))
      .reduce((sum, c) => sum + c.amount, 0);
  } else {
    const pool = poolAccount(eventId);
    const total = state.balances[pool] ?? 0;
    if (total > 0) {
      const hostAmount = Math.floor((total * (event.hostBps ?? 2500)) / 10_000);
      const remainder = total - hostAmount;
      const base = Math.floor(remainder / attendees.length);
      const shares = [
        { id: event.hostId, amount: hostAmount },
        ...attendees.map((id, index) => ({
          id,
          amount: base + (index < remainder % attendees.length ? 1 : 0),
        })),
      ];
      for (const share of shares.filter((s) => s.amount > 0)) {
        moveLots(state, pool, walletAccount(share.id), share.amount, (lot) => {
          if (lot.origin === 'earning' && lot.visited.includes(share.id))
            flag(state, share.id, 'circular_funding');
          return {
            origin: 'earning',
            purpose: undefined,
            eligible: !lot.visited.includes(share.id),
            visited: [...new Set([...lot.visited, share.id])],
          };
        });
      }
      post(state, `settle:${eventId}`, 'event_settlement', now, [
        { account: pool, amount: -total },
        ...shares
          .filter((s) => s.amount > 0)
          .map((s) => ({ account: walletAccount(s.id), amount: s.amount })),
      ]);
    }
  }
  if (!event.settlementOutcome) {
    event.settlementOutcome = 'paid_out';
    event.paidTotal = Object.values(state.contributions)
      .filter((c) => c.eventId === eventId && !c.reversed)
      .reduce((sum, c) => sum + c.amount, 0);
    for (const contribution of Object.values(state.contributions).filter(
      (c) => c.eventId === eventId && !c.reversed && (c.serviceFee ?? 0) > 0,
    )) {
      for (const lotId of contribution.feeLotIds ?? []) {
        const lot = state.lots.find((l) => l.id === lotId);
        requireCondition(
          lot && lot.holder === contributionFeeAccount(contribution.id),
          'contribution_fee_unavailable',
        );
        lot.amount = 0;
      }
      post(state, 'earn-fee:' + contribution.id, 'sponsorship_service_fee', now, [
        { account: contributionFeeAccount(contribution.id), amount: -contribution.serviceFee! },
        { account: 'platform:sponsorship-fees', amount: contribution.serviceFee! },
      ]);
    }
  }
  event.settled = true;
  event.code = null;
  auditFinance(state);
  return state;
}
export function finishPayout(
  original: FinanceState,
  id: string,
  outcome: 'paid' | 'failed' | 'unknown',
  reference: string,
  now: string,
) {
  const state = structuredClone(original);
  const payout = state.payouts[id];
  requireCondition(payout, 'payout_unavailable');
  if (payout.status === 'paid' || payout.status === 'failed') {
    requireCondition(payout.status === outcome, 'payout_terminal');
    return original;
  }
  if (outcome === 'unknown') {
    payout.status = outcome;
    return state;
  }
  if (outcome === 'failed') {
    moveLots(state, `payout:${id}`, walletAccount(payout.memberId), payout.amount);
    post(state, `finish:${id}`, 'payout_failed', now, [
      { account: `payout:${id}`, amount: -payout.amount },
      { account: walletAccount(payout.memberId), amount: payout.amount },
      { account: `bonus:${id}`, amount: -payout.bonus },
      { account: 'platform:reserve', amount: payout.bonus },
    ]);
  } else {
    for (const lot of state.lots.filter((l) => l.holder === `payout:${id}`)) lot.amount = 0;
    post(state, `finish:${id}`, 'payout_paid', now, [
      { account: `payout:${id}`, amount: -payout.amount },
      { account: `bonus:${id}`, amount: -payout.bonus },
      { account: 'external:bank', amount: payout.net },
      { account: 'external:fees', amount: payout.fee },
    ]);
  }
  payout.status = outcome;
  payout.providerReference = reference;
  auditFinance(state);
  return state;
}
export function finishOrder(
  original: FinanceState,
  id: string,
  outcome: 'fulfilled' | 'refunded',
  receipt: string,
  now: string,
) {
  const state = structuredClone(original);
  const order = state.orders[id];
  requireCondition(order, 'order_unavailable');
  if (order.status !== 'pending') {
    requireCondition(order.status === outcome, 'order_terminal');
    return original;
  }
  if (outcome === 'refunded')
    moveLots(state, `order:${id}`, walletAccount(order.memberId), order.amount);
  else for (const lot of state.lots.filter((l) => l.holder === `order:${id}`)) lot.amount = 0;
  post(state, `finish-order:${id}`, outcome, now, [
    { account: `order:${id}`, amount: -order.amount },
    {
      account: outcome === 'refunded' ? walletAccount(order.memberId) : 'external:shop',
      amount: order.amount,
    },
  ]);
  order.status = outcome;
  order.receipt = receipt;
  auditFinance(state);
  return state;
}
export const subscriptionEventSchema = z.object({
  eventId: z.string().min(1),
  accountId: z.string().min(1),
  periodId: z.string().min(1),
  tier: tierIdSchema,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  environment: z.literal('SANDBOX'),
  refunded: z.boolean().default(false),
});
export function applySubscriptionEvent(
  original: FinanceState,
  input: z.input<typeof subscriptionEventSchema>,
  now: string,
): FinanceState {
  const event = subscriptionEventSchema.parse(input);
  const state = structuredClone(original);
  const fingerprint = JSON.stringify(event);
  if (state.receipts[event.eventId]) {
    requireCondition(state.receipts[event.eventId] === fingerprint, 'receipt_conflict');
    return original;
  }
  requireCondition(
    Date.parse(event.endsAt) > Date.parse(event.startsAt),
    'invalid_subscription_period',
  );
  const member = state.members[event.accountId];
  requireCondition(member, 'account_unavailable');
  const periodKey = `${event.accountId}:${event.periodId}`;
  const old = state.subscriptions[periodKey];
  const overlapping = Object.values(state.subscriptions).filter(
    (p) =>
      p.accountId === event.accountId &&
      p.periodId !== event.periodId &&
      Date.parse(p.startsAt) < Date.parse(event.endsAt) &&
      Date.parse(p.endsAt) > Date.parse(event.startsAt),
  );
  const allowance = TIERS[event.tier].tokens * TIERS[event.tier].tokenValueIsk;
  const previouslyGranted =
    (old?.granted ?? 0) + overlapping.reduce((sum, p) => sum + p.granted, 0);
  const grant = event.refunded || old?.refunded ? 0 : Math.max(0, allowance - previouslyGranted);
  if (grant) {
    post(state, `grant:${event.eventId}`, 'subscription_grant', now, [
      { account: 'platform:reserve', amount: -grant },
      { account: sponsorshipAccount(event.accountId), amount: grant },
    ]);
    creditLot(state, {
      holder: sponsorshipAccount(event.accountId),
      amount: grant,
      origin: 'monthly',
      purpose: 'sponsorship',
      originId: periodKey,
      visited: [event.accountId],
      eligible: false,
    });
  }
  const period: SubscriptionPeriod = {
    accountId: event.accountId,
    periodId: event.periodId,
    tier: old && TIERS[old.tier].priceIsk > TIERS[event.tier].priceIsk ? old.tier : event.tier,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    granted: (old?.granted ?? 0) + grant,
    refunded: event.refunded || !!old?.refunded,
  };
  state.subscriptions[periodKey] = period;
  if (event.refunded && !old?.refunded) {
    // Spent grants create a review case; never debit unrelated recipients or silently mint replacement funds.
    let recovered = 0;
    const recoveredAccounts: Record<string, number> = {};
    for (const lot of state.lots.filter(
      (l) =>
        l.originId === periodKey &&
        l.origin === 'monthly' &&
        [walletAccount(event.accountId), sponsorshipAccount(event.accountId)].includes(l.holder),
    )) {
      recovered += lot.amount;
      recoveredAccounts[lot.holder] = (recoveredAccounts[lot.holder] ?? 0) + lot.amount;
      lot.amount = 0;
    }
    if (recovered)
      post(state, 'refund-grant:' + event.eventId, 'subscription_refund', now, [
        ...Object.entries(recoveredAccounts).map(([account, amount]) => ({
          account,
          amount: -amount,
        })),
        { account: 'platform:reserve', amount: recovered },
      ]);
    if (recovered < period.granted) {
      const exposed = new Set([
        event.accountId,
        ...state.lots.filter((l) => l.originId === periodKey).flatMap((l) => l.visited),
      ]);
      for (const accountId of exposed) {
        if (state.members[accountId]) state.members[accountId]!.suspended = true;
        state.flags.push({ accountId, reason: 'spent_subscription_refund' });
      }
    }
  }
  const valid = Object.values(state.subscriptions).filter(
    (p) => p.accountId === event.accountId && !p.refunded,
  );
  const current = valid
    .filter(
      (p) => Date.parse(p.startsAt) <= Date.parse(now) && Date.parse(p.endsAt) > Date.parse(now),
    )
    .sort((a, b) => TIERS[b.tier].priceIsk - TIERS[a.tier].priceIsk)[0];
  member.tier = current?.tier ?? 'plebbi';
  member.paidUntil = current?.endsAt ?? null;
  const premium = valid
    .filter((p) => p.tier === 'plebba_kongur' && Date.parse(p.endsAt) <= Date.parse(now))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  let lastEnd = 0;
  let months = 0;
  for (const p of premium) {
    const start = new Date(p.startsAt);
    const minimumEnd = new Date(start);
    minimumEnd.setUTCDate(1);
    minimumEnd.setUTCMonth(minimumEnd.getUTCMonth() + 1);
    const lastDay = new Date(
      Date.UTC(minimumEnd.getUTCFullYear(), minimumEnd.getUTCMonth() + 1, 0),
    ).getUTCDate();
    minimumEnd.setUTCDate(Math.min(start.getUTCDate(), lastDay));
    if (Date.parse(p.startsAt) >= lastEnd && Date.parse(p.endsAt) >= minimumEnd.getTime()) {
      months++;
      lastEnd = Date.parse(p.endsAt);
    }
  }
  member.premiumMonths = months;
  state.receipts[event.eventId] = fingerprint;
  auditFinance(state);
  return state;
}
/** Funded history excludes voluntary reversals, but retains money returned when an event fails. */
export function getPoolSummary(
  state: FinanceState,
  eventId: string,
  now: string = new Date().toISOString(),
): PoolSummary {
  const event = state.events[eventId];
  requireCondition(event, 'event_unavailable');
  const contributions = Object.values(state.contributions).filter((c) => c.eventId === eventId);
  const total = state.balances[poolAccount(eventId)] ?? 0;
  const hostBps = event.hostBps ?? 2500;
  const paidTotal =
    event.paidTotal ??
    state.journal
      .filter((tx) => tx.kind === 'event_settlement')
      .reduce(
        (sum, tx) =>
          sum -
          tx.entries
            .filter((entry) => entry.account === poolAccount(eventId))
            .reduce((value, entry) => value + entry.amount, 0),
        0,
      );
  const refundedTotal =
    event.refundedTotal ??
    contributions.filter((c) => isSettlementRefund(state, c)).reduce((sum, c) => sum + c.amount, 0);
  const fundedTotal = contributions
    .filter((c) => !c.reversed || isSettlementRefund(state, c))
    .reduce((sum, c) => sum + c.amount, 0);
  const ids =
    Date.parse(now) < Date.parse(event.startsAt)
      ? event.eligibleAttendees
      : Object.keys(event.checkedIn);
  const eligibleParticipantCount = new Set(ids.filter((id) => id !== event.hostId)).size;
  const status: PoolSummary['status'] = event.settled
    ? (event.settlementOutcome ?? (paidTotal > 0 ? 'paid_out' : 'refunded'))
    : event.cancelled || Date.parse(now) >= Date.parse(event.endsAt)
      ? 'awaiting_settlement'
      : Date.parse(now) >= Date.parse(event.startsAt)
        ? 'locked'
        : 'accepting';
  return {
    hostBps,
    locked: event.hostBps !== null,
    total,
    fundedTotal,
    paidTotal,
    refundedTotal,
    status,
    estimatedParticipantReward:
      eligibleParticipantCount && !event.settled
        ? Math.floor((total - Math.floor((total * hostBps) / 10_000)) / eligibleParticipantCount)
        : null,
    eligibleParticipantCount,
  };
}
export function financeSnapshot(state: FinanceState, memberId: string) {
  const member = state.members[memberId];
  requireCondition(member, 'account_unavailable');
  return {
    sandbox: true as const,
    balance: state.balances[walletAccount(memberId)] ?? 0,
    withdrawableBalance: state.balances[walletAccount(memberId)] ?? 0,
    sponsorshipCredit: state.balances[sponsorshipAccount(memberId)] ?? 0,
    sponsorshipCredits: Math.floor((state.balances[sponsorshipAccount(memberId)] ?? 0) / 500),
    bonusEligible: state.lots
      .filter((l) => l.holder === walletAccount(memberId) && l.eligible)
      .reduce((sum, l) => sum + l.amount, 0),
    payouts: Object.values(state.payouts).filter((p) => p.memberId === memberId),
    orders: Object.values(state.orders).filter((o) => o.memberId === memberId),
    contributions: Object.values(state.contributions).filter((c) => c.memberId === memberId),
    transactions: state.journal
      .filter((tx) =>
        tx.entries.some(
          (e) =>
            e.account === walletAccount(memberId) || e.account === sponsorshipAccount(memberId),
        ),
      )
      .map((tx) => ({
        id: tx.id,
        kind: tx.kind,
        at: tx.at,
        amount: tx.entries
          .filter(
            (e) =>
              e.account === walletAccount(memberId) || e.account === sponsorshipAccount(memberId),
          )
          .reduce((sum, e) => sum + e.amount, 0),
      })),
    shop: SANDBOX_SHOP,
    payoutIdentityVerified: !!member.payoutIdentity,
  };
}
export type FinanceSnapshot = ReturnType<typeof financeSnapshot>;

export function pendingFinanceWork(state: FinanceState) {
  const available = (id: string) => state.members[id] && !state.members[id]!.suspended;
  return {
    payouts: Object.values(state.payouts)
      .filter((p) => ['pending', 'unknown'].includes(p.status) && available(p.memberId))
      .slice(0, 20),
    orders: Object.values(state.orders)
      .filter((o) => o.status === 'pending' && available(o.memberId))
      .slice(0, 20),
    events: Object.values(state.events)
      .filter((e) => !e.settled)
      .slice(0, 20),
  };
}

export function flagPurchaseChargeback(
  original: FinanceState,
  purchaseId: string,
  noticeId: string,
  now: string,
) {
  const state = structuredClone(original);
  const key = `chargeback:${noticeId}`;
  if (state.receipts[key]) {
    requireCondition(state.receipts[key] === purchaseId, 'receipt_conflict');
    return original;
  }
  const tx = state.journal.find((t) => t.id === purchaseId && t.kind === 'sandbox_purchase');
  requireCondition(tx, 'purchase_unavailable');
  for (const lot of state.lots.filter((l) => l.originId === purchaseId)) {
    for (const memberId of lot.visited) {
      const member = state.members[memberId];
      if (member) {
        member.suspended = true;
        state.flags.push({ accountId: memberId, reason: `chargeback_exposure:${purchaseId}` });
      }
    }
  }
  // Do not reverse money already paid to a bank or silently seize unrelated funds.
  // A separately authorized provider reconciliation resolves the exposure before release.
  state.receipts[key] = purchaseId;
  void now;
  auditFinance(state);
  return state;
}
