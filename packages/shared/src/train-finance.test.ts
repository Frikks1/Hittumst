import { describe, expect, it } from 'vitest';
import { applyFinanceCommand, auditFinance, fundTrainEvents, newFinanceState, pendingFinanceWork, settleEvent, trainPoolSnapshot, type FinanceCommand, type FinanceState, type FundedEvent, type TrainFinanceContext } from './finance';

const now = '2026-10-01T12:00:00.000Z';
let serial = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`;
const train: TrainFinanceContext = { id: 'train', role: 'owner', public: false };
function fixture() {
  let state = newFinanceState();
  for (const memberId of ['owner', 'donor', 'host', 'attendee']) state.members[memberId] = {
    tier: 'plebbi', paidUntil: null, premiumMonths: 0, payoutIdentity: memberId, suspended: false,
  };
  for (const memberId of ['owner','donor']) state = applyFinanceCommand(state, { action: 'purchase', amount: 5000, requestId: uuid() }, { memberId, now, randomId: uuid }).state;
  return state;
}
function apply(state: FinanceState, command: FinanceCommand, memberId = 'owner', access = train) {
  return applyFinanceCommand(state, command, { memberId, now, randomId: uuid, train: access });
}
function configured(amount = 1000, cap = 2200) {
  const state = apply(fixture(), { action: 'train_pool_settings', trainId: 'train', enabled: true, amountPerEvent: amount, monthlyCap: cap, expectedHostBps: 2500, requestId: uuid() }).state;
  return apply(state, { action: 'train_pool_deposit', trainId: 'train', amount: 4000, requestId: uuid() }).state;
}
const event = (id = 'event', startsAt = '2026-10-02T12:00:00.000Z'): FundedEvent => ({ id, hostId: 'host', startsAt,
  endsAt: '2026-10-02T13:00:00.000Z', cancelled: false, eligibleAttendees: ['attendee'], hostBps: null,
  checkedIn: {}, code: null, review: 'pending', settled: false });

describe('wallet-backed train pools', () => {
  it('moves existing wallet lots without minting money and retries deposits once', () => {
    const before = fixture();
    const command: FinanceCommand = { action: 'train_pool_deposit', trainId: 'train', amount: 500, requestId: uuid() };
    const { state, result } = apply(before, command);
    expect(state.balances['wallet:owner']).toBe(4500);
    expect(state.balances['train:train']).toBe(500);
    expect(state.balances['external:purchase']).toBe(before.balances['external:purchase']);
    expect(apply(state, command).result).toEqual(result);
    expect(apply(state, command).state.journal).toEqual(state.journal);
    expect(() => apply(state, { ...command, amount: 501 })).toThrow('idempotency_conflict');
    expect(auditFinance(state)).toBe(true);
  });
  it('rejects deposits larger than available funds without changing the input', () => {
    const state = fixture();
    const before = structuredClone(state);
    expect(() => apply(state, { action: 'train_pool_deposit', trainId: 'train', amount: 5001, requestId: uuid() })).toThrow('insufficient_funds');
    expect(state).toEqual(before);
  });
  it('requires server membership context and administrator access for budgets', () => {
    const state = fixture();
    const cmd: FinanceCommand = { action: 'train_pool_settings', trainId: 'train', enabled: true, amountPerEvent: 1000, monthlyCap: 1100, expectedHostBps: 2500, requestId: uuid() };
    expect(() => apply(state, cmd, 'donor', { ...train, role: 'member' })).toThrow('train_admin_required');
    expect(() => applyFinanceCommand(state, cmd, { memberId: 'owner', now, randomId: uuid })).toThrow('train_unavailable');
    expect(() => apply(state, { ...cmd, monthlyCap: 1000 })).toThrow('invalid_train_budget');
  });
  it('allows receipt-only public sponsorship but keeps private pool reads scoped', () => {
    const access = { ...train, role: null, public: true };
    const cmd: FinanceCommand = { action: 'train_pool_deposit', trainId: 'train', amount: 600, requestId: uuid() };
    const deposited = apply(fixture(), cmd, 'donor', access);
    expect(deposited.result).toEqual({ id: cmd.requestId, trainId: 'train', amount: 600 });
    expect(trainPoolSnapshot(deposited.state, 'train', now).sponsored).toBe(true);
    expect(() => apply(deposited.state, { action: 'train_pool_info', trainId: 'train', requestId: uuid() }, 'donor', access)).toThrow('train_forbidden');
    expect(() => apply(fixture(), cmd, 'donor', { ...access, public: false })).toThrow('train_forbidden');
  });
  it('funds each gathering once, reserves its fee, and enforces the monthly total', () => {
    const before = configured();
    const funded = fundTrainEvents(before, 'train', [event('third','2026-10-04T12:00:00.000Z'), event('first'), event('second','2026-10-03T12:00:00.000Z')], now);
    expect(funded.balances['pool:first']).toBe(1000);
    expect(funded.balances['pool:second']).toBe(1000);
    expect(funded.balances['pool:third']).toBeUndefined();
    expect(funded.balances['train:train']).toBe(1800);
    expect(trainPoolSnapshot(funded,'train',now).monthlySpent).toBe(2200);
    expect(fundTrainEvents(funded, 'train', [event('first')], now)).toBe(funded);
    expect(auditFinance(funded)).toBe(true);
  });
  it('does not spend without the full fee, on changed splits or on closed events', () => {
    let state = configured(4000, 10000);
    expect(fundTrainEvents(state,'train',[event()],now)).toBe(state);
    state = configured();
    state.events.event = { ...event(), hostBps: 3000 };
    expect(fundTrainEvents(state,'train',[event()],now)).toBe(state);
    expect(fundTrainEvents(state,'train',[{ ...event('cancelled'), cancelled: true }, event('past','2026-09-01T12:00:00Z')],now)).toBe(state);
  });
  it('refunds a cancelled gathering principal and fee to the train even after its admin is suspended', () => {
    let state = fundTrainEvents(configured(),'train',[event()],now);
    state.members.owner!.suspended = true;
    state.events.event!.cancelled = true;
    state = settleEvent(state,'event',now);
    expect(state.balances['train:train']).toBe(4000);
    expect(state.balances['wallet:owner']).toBe(1000);
    expect(trainPoolSnapshot(state,'train',now).allocations).toEqual([{ meetupId: 'event', amount: 1000, fee: 100, refunded: true }]);
    expect(auditFinance(state)).toBe(true);
  });
  it('cannot convert pooled funds into an admin wallet via individual reversal', () => {
    const state = fundTrainEvents(configured(),'train',[event()],now);
    expect(() => apply(state,{ action: 'reverse', contributionId: 'train:train:event', requestId: uuid() })).toThrow('contribution_unavailable');
  });
  it('settles through the existing checked-in attendance ledger and earns the reserved fee', () => {
    let state = fundTrainEvents(configured(),'train',[event()],now);
    state.events.event!.checkedIn = { attendee: '2026-10-02T12:05:00Z' };
    state.events.event!.review = 'approved';
    state = settleEvent(state, 'event', '2026-10-04T12:00:00Z');
    expect(state.balances['wallet:host']).toBe(250);
    expect(state.balances['wallet:attendee']).toBe(750);
    expect(state.balances['platform:sponsorship-fees']).toBe(100);
    expect(auditFinance(state)).toBe(true);
  });
  it('can allocate in the next month without resetting per-event idempotence', () => {
    const first = fundTrainEvents(configured(),'train',[event('one'),event('two')],now);
    const next = fundTrainEvents(first,'train',[event('three','2026-11-03T12:00:00Z')],'2026-11-01T00:00:00Z');
    expect(next.balances['pool:three']).toBe(1000);
    expect(trainPoolSnapshot(next,'train','2026-11-01T00:00:00Z').monthlySpent).toBe(1100);
    expect(trainPoolSnapshot(next,'train',now).monthlySpent).toBe(2200);
  });
});


it('prioritizes cancelled and due settlement work ahead of future train allocations', () => {
  const state = configured();
  for (let i=0; i<25; i++) state.events['future-'+i] = { ...event('future-'+i), endsAt: '2027-01-02T13:00:00Z' };
  state.events.due = { ...event('due'), endsAt: '2026-09-20T13:00:00Z', review: 'approved' };
  state.events.refund = { ...event('refund'), cancelled: true };
  expect(pendingFinanceWork(state,now).events.slice(0,2).map(item => item.id)).toEqual(['refund','due']);
});
