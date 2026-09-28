import { describe, expect, it } from 'vitest';
import {
  applyFinanceCommand,
  applySubscriptionEvent,
  auditFinance,
  financeSnapshot,
  finishOrder,
  finishPayout,
  flagPurchaseChargeback,
  getPoolSummary,
  newFinanceState,
  pendingFinanceWork,
  settleEvent,
  type ContributionQuote,
  type FinanceCommand,
  type FinanceState,
  type SponsorshipFundingSource,
} from './finance';
import {
  TIERS,
  TIER_IDS,
  requireAlbumCapacity,
  requireAlbumMedia,
  withdrawalBadgeBps,
} from './tiers';

const now = '2026-09-08T12:00:00.000Z';
const after = '2026-09-11T00:00:00.000Z';
let serial = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`;
type WithoutRequest<T> = T extends { requestId: string } ? Omit<T, 'requestId'> : never;
function fixture() {
  const state = newFinanceState();
  for (const id of ['host', 'alice', 'bob', 'sponsor'])
    state.members[id] = {
      tier: id === 'sponsor' ? 'flottari_plebbi' : 'plebbi',
      paidUntil: id === 'sponsor' ? '2026-10-01T00:00:00.000Z' : null,
      premiumMonths: 0,
      payoutIdentity: id,
      suspended: false,
    };
  state.events.event = {
    id: 'event',
    hostId: 'host',
    startsAt: '2026-09-09T12:00:00.000Z',
    endsAt: '2026-09-09T13:00:00.000Z',
    cancelled: false,
    eligibleAttendees: ['alice', 'bob'],
    hostBps: null,
    checkedIn: {},
    code: null,
    review: 'pending',
    settled: false,
  };
  return state;
}
const command = (
  state: FinanceState,
  memberId: string,
  cmd: WithoutRequest<FinanceCommand>,
  time = now,
) =>
  applyFinanceCommand(
    state,
    { ...cmd, requestId: uuid() },
    { memberId, now: time, randomId: uuid },
  );
const purchase = (state: FinanceState, id: string, amount: number) =>
  command(state, id, { action: 'purchase', amount }).state;
const subscription = (tier: 'flottari_plebbi' | 'plebba_kongur', eventId = uuid()) => ({
  eventId,
  accountId: 'alice',
  periodId: 'september',
  tier,
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: '2026-10-01T00:00:00.000Z',
  environment: 'SANDBOX' as const,
});
function quote(
  state: FinanceState,
  memberId = 'sponsor',
  amount = 1000,
  fundingSource: SponsorshipFundingSource = 'cash',
  creditAmount?: number,
) {
  const applied = command(state, memberId, {
    action: 'contribution_quote',
    meetupId: 'event',
    amount,
    fundingSource,
    creditAmount,
  });
  return { state: applied.state, quote: applied.result as ContributionQuote };
}
function contribute(
  state: FinanceState,
  memberId = 'sponsor',
  amount = 1000,
  fundingSource: SponsorshipFundingSource = 'cash',
  creditAmount?: number,
) {
  const quoted = quote(state, memberId, amount, fundingSource, creditAmount);
  return command(quoted.state, memberId, {
    action: 'contribute',
    meetupId: 'event',
    amount,
    expectedHostBps: quoted.quote.hostBps,
    quoteId: quoted.quote.id,
  }).state;
}
function attend(state: FinanceState, ids = ['alice', 'bob']) {
  state.events.event!.checkedIn = Object.fromEntries(ids.map((id) => [id, now]));
  state.events.event!.review = 'approved';
  return state;
}

describe('membership limits and cosmetic tenure', () => {
  it('uses the agreed joining, hosting, credit and creator offer', () => {
    expect(TIER_IDS.map((id) => TIERS[id].joins)).toEqual([1, 5, 15]);
    expect(TIER_IDS.map((id) => TIERS[id].occurrences)).toEqual([1, 5, 10]);
    expect(TIER_IDS.map((id) => [TIERS[id].tokens, TIERS[id].tokenValueIsk])).toEqual([
      [0, 0],
      [1, 500],
      [2, 500],
    ]);
    expect(TIER_IDS.map((id) => TIERS[id].hostBps)).toEqual([2500, 2500, 2500]);
  });
  for (const tier of TIER_IDS)
    it(`${tier}: preserves album limits`, () => {
      const limits = TIERS[tier];
      expect(() =>
        requireAlbumCapacity(tier, { albums: limits.albums - 1 }, 'album'),
      ).not.toThrow();
      expect(() => requireAlbumCapacity(tier, { albums: limits.albums }, 'album')).toThrow();
      expect(() =>
        requireAlbumCapacity(tier, { albums: 1, photos: limits.photos }, 'image'),
      ).toThrow();
      expect(() =>
        requireAlbumCapacity(tier, { albums: 1, videos: limits.videos }, 'video'),
      ).toThrow();
      expect(() => requireAlbumCapacity(tier, { albums: limits.albums + 1 }, 'image')).toThrow(
        'downgrade',
      );
    });
  it('retains media limits and noncash tenure badge', () => {
    expect(() => requireAlbumMedia('video', 30 * 1024 * 1024, 15000)).not.toThrow();
    expect(() => requireAlbumMedia('video', 1, 15001)).toThrow();
    expect(() => requireAlbumMedia('image', 30 * 1024 * 1024 + 1)).toThrow();
    expect(withdrawalBadgeBps('plebba_kongur', 8)).toBe(750);
    expect(withdrawalBadgeBps('plebbi', 8)).toBe(0);
  });
});

describe('sponsorship credit and verified subscription grants', () => {
  it('grants once, only the upgrade difference, and keeps a refund terminal', () => {
    let state = applySubscriptionEvent(fixture(), subscription('flottari_plebbi'), now);
    state = applySubscriptionEvent(state, subscription('flottari_plebbi'), now);
    expect(financeSnapshot(state, 'alice')).toMatchObject({
      balance: 0,
      sponsorshipCredit: 500,
      sponsorshipCredits: 1,
    });
    state = applySubscriptionEvent(state, subscription('plebba_kongur'), now);
    expect(financeSnapshot(state, 'alice').sponsorshipCredit).toBe(1000);
    state = applySubscriptionEvent(
      state,
      { ...subscription('plebba_kongur'), refunded: true },
      now,
    );
    state = applySubscriptionEvent(state, subscription('plebba_kongur'), now);
    expect(financeSnapshot(state, 'alice').sponsorshipCredit).toBe(0);
    expect(auditFinance(state)).toBe(true);
  });
  it('restored purchases with alternate overlapping period IDs cannot duplicate credit', () => {
    let state = applySubscriptionEvent(fixture(), subscription('flottari_plebbi'), now);
    state = applySubscriptionEvent(
      state,
      { ...subscription('flottari_plebbi'), periodId: 'restore' },
      now,
    );
    state = applySubscriptionEvent(
      state,
      { ...subscription('plebba_kongur'), periodId: 'upgrade' },
      now,
    );
    expect(financeSnapshot(state, 'alice').sponsorshipCredit).toBe(1000);
  });
  it('rolls unused credit forward without expiry but requires active paid allocation', () => {
    let state = applySubscriptionEvent(
      fixture(),
      {
        ...subscription('plebba_kongur'),
        periodId: 'august',
        startsAt: '2026-08-01T00:00:00.000Z',
        endsAt: '2026-09-01T00:00:00.000Z',
      },
      now,
    );
    expect(state.members.alice).toMatchObject({ tier: 'plebbi', premiumMonths: 1 });
    expect(financeSnapshot(state, 'alice').sponsorshipCredit).toBe(1000);
    expect(() => quote(state, 'alice', 500, 'credit')).toThrow('paid_subscription_required');
    state = applySubscriptionEvent(state, subscription('flottari_plebbi'), now);
    expect(financeSnapshot(state, 'alice').sponsorshipCredit).toBe(1500);
    state = contribute(state, 'alice', 1500, 'credit');
    expect(getPoolSummary(state, 'event', now).total).toBe(1500);
    expect(auditFinance(state)).toBe(true);
  });
  it('rejects withdrawal, gifting and shop spending of sponsorship-only credit', () => {
    const state = applySubscriptionEvent(fixture(), subscription('plebba_kongur'), now);
    expect(() => command(state, 'alice', { action: 'quote', amount: 500 })).toThrow(
      'insufficient_funds',
    );
    expect(() =>
      command(state, 'alice', { action: 'gift', recipientId: 'bob', amount: 500 }),
    ).toThrow();
    expect(() => command(state, 'alice', { action: 'shop', sku: 'sandbox-voucher' })).toThrow();
    expect(financeSnapshot(state, 'alice')).toMatchObject({ balance: 0, sponsorshipCredit: 1000 });
  });
  it('requires fully backed grants', () => {
    const state = fixture();
    const remaining = state.balances['platform:reserve']!;
    state.journal.push({
      id: uuid(),
      kind: 'test_reserve',
      at: now,
      entries: [
        { account: 'platform:reserve', amount: -remaining },
        { account: 'external:sandbox', amount: remaining },
      ],
    });
    state.balances['platform:reserve'] = 0;
    state.balances['external:sandbox']! += remaining;
    expect(() => applySubscriptionEvent(state, subscription('plebba_kongur'), now)).toThrow(
      'insufficient_funds',
    );
    expect(financeSnapshot(state, 'alice').sponsorshipCredit).toBe(0);
  });
  it('keeps pre-migration monthly wallet rights', () => {
    let state = purchase(fixture(), 'alice', 1000);
    state.lots[0]!.origin = 'monthly';
    state.lots[0]!.eligible = true;
    state = command(state, 'alice', { action: 'gift', recipientId: 'bob', amount: 500 }).state;
    state = command(state, 'alice', { action: 'quote', amount: 500 }).state;
    expect(Object.values(state.quotes)[0]).toMatchObject({ bonus: 0, net: 500 });
    expect(financeSnapshot(state, 'alice')).toMatchObject({ balance: 500, sponsorshipCredit: 0 });
  });
});

describe('quoted funding, fee escrow, and refunds', () => {
  it('quotes full cost without reducing the advertised pool', () => {
    let state = purchase(fixture(), 'sponsor', 1100);
    const quoted = quote(state);
    expect(quoted.quote).toMatchObject({
      amount: 1000,
      cashAmount: 1000,
      serviceFee: 100,
      processingFee: 0,
      totalCash: 1100,
      hostBps: 2500,
    });
    state = contribute(state);
    expect(getPoolSummary(state, 'event', now)).toMatchObject({ total: 1000, fundedTotal: 1000 });
    expect(financeSnapshot(state, 'sponsor').balance).toBe(0);
    expect(auditFinance(state)).toBe(true);
  });
  it('requires paid membership for both quote and confirmed contribution', () => {
    const free = purchase(fixture(), 'alice', 1100);
    expect(() => quote(free, 'alice')).toThrow('paid_subscription_required');
    const quoted = quote(purchase(fixture(), 'sponsor', 1100));
    quoted.state.members.sponsor!.paidUntil = now;
    expect(() =>
      command(quoted.state, 'sponsor', {
        action: 'contribute',
        meetupId: 'event',
        amount: 1000,
        expectedHostBps: 2500,
        quoteId: quoted.quote.id,
      }),
    ).toThrow('paid_subscription_required');
  });
  it('allocates full 500 kr units and combines credit with cash', () => {
    let state = applySubscriptionEvent(fixture(), subscription('plebba_kongur'), now);
    state = purchase(state, 'alice', 1100);
    expect(() => quote(state, 'alice', 250, 'credit')).toThrow('credit_units_required');
    expect(() => quote(state, 'alice', 1000, 'mixed', 250)).toThrow('credit_units_required');
    expect(() => quote(state, 'alice', 1000, 'mixed', 1000)).toThrow('funding_source_mismatch');
    const quoted = quote(state, 'alice', 1500, 'mixed', 500);
    expect(quoted.quote).toMatchObject({
      creditAmount: 500,
      cashAmount: 1000,
      serviceFee: 100,
      totalCash: 1100,
    });
    state = contribute(state, 'alice', 1500, 'mixed', 500);
    expect(financeSnapshot(state, 'alice')).toMatchObject({ balance: 0, sponsorshipCredit: 500 });
    expect(getPoolSummary(state, 'event', now).total).toBe(1500);
  });
  it('refunds mixed funding and fees to original sources on cancellation', () => {
    let state = applySubscriptionEvent(fixture(), subscription('plebba_kongur'), now);
    state = contribute(purchase(state, 'alice', 1100), 'alice', 1500, 'mixed', 500);
    state.events.event!.cancelled = true;
    state = settleEvent(state, 'event', now);
    expect(financeSnapshot(state, 'alice')).toMatchObject({
      balance: 1100,
      sponsorshipCredit: 1000,
    });
    expect(getPoolSummary(state, 'event', now)).toMatchObject({
      total: 0,
      fundedTotal: 1500,
      refundedTotal: 1500,
      status: 'refunded',
    });
    expect(auditFinance(state)).toBe(true);
    expect(settleEvent(state, 'event', now)).toBe(state);
  });
  for (const reason of ['rejected', 'empty'] as const)
    it(`refunds pool and fee when settlement is ${reason}`, () => {
      let state = contribute(purchase(fixture(), 'sponsor', 1100));
      state.events.event!.review = reason === 'rejected' ? 'rejected' : 'approved';
      if (reason === 'rejected') {
        state.events.event!.checkedIn = { alice: now };
        state.members.host!.suspended = true;
      }
      state = settleEvent(state, 'event', after);
      expect(financeSnapshot(state, 'sponsor').balance).toBe(1100);
      expect(getPoolSummary(state, 'event', after)).toMatchObject({
        refundedTotal: 1000,
        status: 'refunded',
      });
      expect(auditFinance(state)).toBe(true);
    });
  it('reverses before start, omits voluntary reversals from advertised funded history, and closes at start', () => {
    let state = contribute(purchase(fixture(), 'sponsor', 1100));
    const contributionId = Object.keys(state.contributions)[0]!;
    expect(() =>
      command(state, 'sponsor', { action: 'reverse', contributionId }, '2026-09-09T12:00:00.000Z'),
    ).toThrow('pool_closed');
    state = command(state, 'sponsor', { action: 'reverse', contributionId }).state;
    expect(financeSnapshot(state, 'sponsor').balance).toBe(1100);
    expect(getPoolSummary(state, 'event', now)).toMatchObject({
      total: 0,
      fundedTotal: 0,
      refundedTotal: 0,
    });
    expect(() =>
      command(
        state,
        'sponsor',
        { action: 'contribution_quote', meetupId: 'event', amount: 1000, fundingSource: 'cash' },
        '2026-09-09T12:00:00.000Z',
      ),
    ).toThrow('pool_closed');
  });
  it('does not count a legacy voluntary reversal again when the event is cancelled', () => {
    let state = contribute(purchase(fixture(), 'sponsor', 1100));
    const contributionId = Object.keys(state.contributions)[0]!;
    state = command(state, 'sponsor', { action: 'reverse', contributionId }).state;
    delete state.contributions[contributionId]!.refundReason;
    state = contribute(state, 'sponsor', 500);
    state.events.event!.cancelled = true;
    state = settleEvent(state, 'event', now);
    expect(getPoolSummary(state, 'event', now)).toMatchObject({
      fundedTotal: 500,
      refundedTotal: 500,
      estimatedParticipantReward: null,
    });
    expect(financeSnapshot(state, 'sponsor').balance).toBe(1100);
    expect(auditFinance(state)).toBe(true);
  });
  it('rejects stale fee confirmation, changed splits, event rescheduling, and reused quotes', () => {
    const quoted = quote(purchase(fixture(), 'sponsor', 2200));
    const cmd = {
      action: 'contribute' as const,
      meetupId: 'event',
      amount: 1000,
      expectedHostBps: 2500,
      quoteId: quoted.quote.id,
    };
    expect(() => command(quoted.state, 'sponsor', cmd, '2026-09-08T12:02:00.000Z')).toThrow(
      'quote_expired',
    );
    expect(() => command(quoted.state, 'sponsor', { ...cmd, amount: 500 })).toThrow(
      'quote_changed',
    );
    expect(() => command(quoted.state, 'sponsor', { ...cmd, expectedHostBps: 500 })).toThrow(
      'pool_split_changed',
    );
    const changed = structuredClone(quoted.state);
    changed.events.event!.startsAt = '2026-09-10T12:00:00.000Z';
    expect(() => command(changed, 'sponsor', cmd)).toThrow('quote_changed');
    const applied = command(quoted.state, 'sponsor', cmd).state;
    expect(() => command(applied, 'sponsor', cmd)).toThrow('quote_expired');
  });
  it('makes retried self-sponsorship idempotent and restricts publication to the creator', () => {
    let state = applySubscriptionEvent(
      fixture(),
      { ...subscription('flottari_plebbi'), accountId: 'host' },
      now,
    );
    const quoted = quote(state, 'host', 500, 'credit');
    const cmd = {
      action: 'publish_sponsored' as const,
      meetupId: 'event',
      amount: 500,
      expectedHostBps: 2500,
      quoteId: quoted.quote.id,
      requestId: uuid(),
    };
    const context = { memberId: 'host', now, randomId: uuid };
    state = applyFinanceCommand(quoted.state, cmd, context).state;
    expect(applyFinanceCommand(state, cmd, context).state).toBe(state);
    expect(getPoolSummary(state, 'event', now).total).toBe(500);
    const other = quote(purchase(fixture(), 'sponsor', 1100));
    expect(() =>
      command(other.state, 'sponsor', { ...cmd, amount: 1000, quoteId: other.quote.id }),
    ).toThrow('not_host');
  });
  it('does not charge any fee on included credit', () => {
    const state = applySubscriptionEvent(fixture(), subscription('plebba_kongur'), now);
    expect(quote(state, 'alice', 1000, 'credit').quote).toMatchObject({
      serviceFee: 0,
      totalCash: 0,
    });
  });
});

describe('settlement and visible pool lifecycle', () => {
  it('pays 25% to the creator and 75% among the others with deterministic rounding', () => {
    let state = contribute(purchase(fixture(), 'sponsor', 11002), 'sponsor', 10001);
    state = settleEvent(attend(state, ['bob', 'host', 'alice']), 'event', after);
    expect(financeSnapshot(state, 'host').balance).toBe(2500);
    expect(financeSnapshot(state, 'alice').balance).toBe(3751);
    expect(financeSnapshot(state, 'bob').balance).toBe(3750);
    expect(state.balances['platform:sponsorship-fees']).toBe(1001);
    expect(getPoolSummary(state, 'event', after)).toMatchObject({
      total: 0,
      fundedTotal: 10001,
      paidTotal: 10001,
      status: 'paid_out',
      estimatedParticipantReward: null,
    });
    expect(auditFinance(state)).toBe(true);
    expect(settleEvent(state, 'event', after)).toBe(state);
  });
  it('uses the same split for small events and clears credit restrictions only on settled earnings', () => {
    let state = applySubscriptionEvent(
      fixture(),
      { ...subscription('plebba_kongur'), accountId: 'host' },
      now,
    );
    state = contribute(state, 'host', 1000, 'credit');
    state = settleEvent(attend(state, ['alice']), 'event', after);
    expect(financeSnapshot(state, 'host')).toMatchObject({ balance: 250, sponsorshipCredit: 0 });
    expect(financeSnapshot(state, 'alice')).toMatchObject({ balance: 750, sponsorshipCredit: 0 });
    state = command(state, 'alice', { action: 'quote', amount: 750 }, after).state;
    expect(Object.values(state.quotes)[0]).toMatchObject({ bonus: 0, net: 750 });
    expect(auditFinance(state)).toBe(true);
  });
  it('preserves a legacy pool disclosed split even after membership changes', () => {
    let state = fixture();
    state.events.event!.hostBps = 500;
    state = contribute(purchase(state, 'sponsor', 1100));
    state = settleEvent(attend(state, ['alice']), 'event', after);
    expect(financeSnapshot(state, 'host').balance).toBe(50);
    expect(financeSnapshot(state, 'alice').balance).toBe(950);
  });
  it('shows a zero pool and every lifecycle status without inventing funding from quotes', () => {
    let state = purchase(fixture(), 'sponsor', 1100);
    expect(getPoolSummary(state, 'event', now)).toMatchObject({ total: 0, status: 'accepting' });
    state = quote(state).state;
    expect(getPoolSummary(state, 'event', now).total).toBe(0);
    state = contribute(state);
    expect(getPoolSummary(state, 'event', now)).toMatchObject({
      estimatedParticipantReward: 375,
      eligibleParticipantCount: 2,
    });
    expect(getPoolSummary(state, 'event', '2026-09-09T12:00:00.000Z').status).toBe('locked');
    expect(getPoolSummary(state, 'event', '2026-09-09T13:00:00.000Z').status).toBe(
      'awaiting_settlement',
    );
  });
  it('reconstructs already settled historical pool totals from existing ledger entries', () => {
    const state = settleEvent(
      attend(contribute(purchase(fixture(), 'sponsor', 1100))),
      'event',
      after,
    );
    delete state.events.event!.paidTotal;
    delete state.events.event!.settlementOutcome;
    expect(getPoolSummary(state, 'event', after)).toMatchObject({
      total: 0,
      paidTotal: 1000,
      status: 'paid_out',
    });
  });
  it('holds rewards for at least 24 hours and requires review and eligible account states', () => {
    const state = contribute(purchase(fixture(), 'sponsor', 1100));
    state.events.event!.checkedIn = { alice: now };
    expect(() => settleEvent(state, 'event', '2026-09-10T12:59:59.000Z')).toThrow(
      'settlement_hold',
    );
    expect(() => settleEvent(state, 'event', after)).toThrow('financial_review_required');
    state.events.event!.review = 'approved';
    state.members.host!.suspended = true;
    expect(() => settleEvent(state, 'event', after)).toThrow('host_financial_review_required');
    state.members.host!.suspended = false;
    state.members.alice!.suspended = true;
    expect(() => settleEvent(state, 'event', after)).toThrow('attendance_dispute_requires_review');
  });
  it('rejects premature and replayed check-in and records repeated attendance for review', () => {
    let state = fixture();
    for (const id of ['old-one', 'old-two'])
      state.events[id] = { ...structuredClone(state.events.event!), id, checkedIn: { alice: now } };
    expect(() => command(state, 'host', { action: 'checkin_code', meetupId: 'event' })).toThrow();
    state = command(
      state,
      'host',
      { action: 'checkin_code', meetupId: 'event' },
      '2026-09-09T12:00:00.000Z',
    ).state;
    const code = state.events.event!.code!.value;
    state = command(
      state,
      'alice',
      { action: 'checkin', meetupId: 'event', code },
      '2026-09-09T12:00:01.000Z',
    ).state;
    expect(() =>
      command(
        state,
        'alice',
        { action: 'checkin', meetupId: 'event', code },
        '2026-09-09T12:00:02.000Z',
      ),
    ).toThrow('already_checked_in');
    expect(() =>
      command(
        state,
        'bob',
        { action: 'checkin', meetupId: 'event', code },
        '2026-09-09T12:01:00.000Z',
      ),
    ).toThrow('checkin_code_expired');
    expect(state.flags).toContainEqual({ accountId: 'alice', reason: 'repeated_attendance:host' });
  });
});

describe('legacy payouts, free earnings access, and reversals', () => {
  it('never grants a new cash withdrawal bonus, even with premium tenure', () => {
    let state = applySubscriptionEvent(fixture(), subscription('plebba_kongur'), now);
    state = purchase(state, 'alice', 1000);
    state.members.alice!.premiumMonths = 8;
    state = command(state, 'alice', { action: 'quote', amount: 1000 }).state;
    expect(Object.values(state.quotes)[0]).toMatchObject({ bonus: 0, net: 1000, badgeBps: 750 });
  });
  it('retains an already committed old bonus payout through unknown and failed results', () => {
    let state = purchase(fixture(), 'alice', 1000);
    state = command(state, 'alice', { action: 'quote', amount: 1000 }).state;
    state = command(state, 'alice', {
      action: 'withdraw',
      quoteId: Object.keys(state.quotes)[0]!,
    }).state;
    const id = Object.keys(state.payouts)[0]!;
    state.payouts[id]!.bonus = 75;
    state.payouts[id]!.net = 1075;
    state.journal.push({
      id: uuid(),
      kind: 'legacy_bonus_reservation',
      at: now,
      entries: [
        { account: 'platform:reserve', amount: -75 },
        { account: `bonus:${id}`, amount: 75 },
      ],
    });
    state.balances['platform:reserve']! -= 75;
    state.balances[`bonus:${id}`] = 75;
    state = finishPayout(state, id, 'unknown', 'pending', now);
    expect(state.payouts[id]!.net).toBe(1075);
    state = finishPayout(state, id, 'paid', 'legacy-paid', now);
    expect(state.balances['external:bank']).toBe(1075);
    expect(finishPayout(state, id, 'paid', 'legacy-paid', now)).toBe(state);
    expect(auditFinance(state)).toBe(true);
  });
  it('refunds failed free-account payouts and shop orders without duplicate transfers', () => {
    let state = purchase(fixture(), 'alice', 500);
    state = command(state, 'alice', { action: 'shop', sku: 'sandbox-voucher' }).state;
    state = finishOrder(state, Object.keys(state.orders)[0]!, 'refunded', 'fixture', now);
    state = command(state, 'alice', { action: 'quote', amount: 500 }).state;
    const quoteId = Object.keys(state.quotes)[0]!;
    state = command(state, 'alice', { action: 'withdraw', quoteId }).state;
    const payoutId = Object.keys(state.payouts)[0]!;
    state = finishPayout(state, payoutId, 'failed', 'fixture', now);
    expect(financeSnapshot(state, 'alice').balance).toBe(500);
    expect(finishPayout(state, payoutId, 'failed', 'fixture', now)).toBe(state);
    expect(auditFinance(state)).toBe(true);
  });
  it('holds downstream rewards and pending payouts after a spent subscription refund', () => {
    let state = applySubscriptionEvent(
      fixture(),
      { ...subscription('plebba_kongur'), accountId: 'host' },
      now,
    );
    state = settleEvent(
      attend(contribute(state, 'host', 1000, 'credit'), ['alice']),
      'event',
      after,
    );
    state = command(state, 'alice', { action: 'quote', amount: 750 }, after).state;
    state = command(
      state,
      'alice',
      { action: 'withdraw', quoteId: Object.keys(state.quotes)[0]! },
      after,
    ).state;
    expect(pendingFinanceWork(state).payouts).toHaveLength(1);
    state = applySubscriptionEvent(
      state,
      { ...subscription('plebba_kongur'), accountId: 'host', refunded: true },
      after,
    );
    expect(pendingFinanceWork(state).payouts).toHaveLength(0);
    expect(state.members.alice!.suspended).toBe(true);
    expect(auditFinance(state)).toBe(true);
  });
  it('freezes chargeback exposure and preserves strict request idempotency', () => {
    const initial = fixture(),
      requestId = uuid();
    const input = { action: 'purchase' as const, amount: 1000, requestId };
    const context = { memberId: 'alice', now, randomId: uuid };
    let state = applyFinanceCommand(initial, input, context).state;
    expect(applyFinanceCommand(state, input, context).state).toBe(state);
    expect(() => applyFinanceCommand(state, { ...input, amount: 500 }, context)).toThrow(
      'idempotency_conflict',
    );
    state = command(state, 'alice', { action: 'gift', recipientId: 'bob', amount: 500 }).state;
    state = flagPurchaseChargeback(state, requestId, 'notice', now);
    expect(state.members.alice!.suspended).toBe(true);
    expect(state.members.bob!.suspended).toBe(true);
    expect(financeSnapshot(state, 'bob').balance).toBe(500);
    expect(auditFinance(state)).toBe(true);
    expect(flagPurchaseChargeback(state, requestId, 'notice', now)).toBe(state);
  });
});
