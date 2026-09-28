import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyFinanceCommand,
  applySubscriptionEvent,
  auditFinance,
  newFinanceState,
  type ContributionQuote,
  type FinanceState,
} from '@rummal/shared';
import {
  applyVerifiedSponsorshipCredits,
  syncVerifiedSponsorshipCredits,
  type SponsorshipBillingSnapshot,
} from './sponsorship-credit';

const account = '10000000-0000-4000-8000-000000000001';
const recipient = '10000000-0000-4000-8000-000000000002';
const periodKey = 'a'.repeat(64);
const now = '2026-09-21T12:00:00.000Z';
function snapshot(): SponsorshipBillingSnapshot {
  return {
    environment: 'SANDBOX',
    fingerprint: 'f'.repeat(64),
    members: [
      {
        accountId: account,
        tier: 'flottari_plebbi',
        paidUntil: '2026-10-01T00:00:00.000Z',
        premiumMonths: 2,
        needsReview: false,
      },
    ],
    periods: [
      {
        periodKey,
        ownerId: account,
        tier: 'flottari_plebbi',
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2026-10-01T00:00:00.000Z',
        paid: true,
        refunded: false,
        allowancePending: 500,
      },
    ],
  };
}
const apply = (state: FinanceState, input = snapshot(), at = now) =>
  applyVerifiedSponsorshipCredits(state, input, at);
const credit = (state: FinanceState, owner = account) =>
  state.balances['sponsorship:' + owner] ?? 0;
beforeEach(() => {
  vi.stubEnv('COMMERCE_MODE', 'sandbox');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://sandbox.supabase.co');
  vi.stubEnv('COMMERCE_SANDBOX_SUPABASE_URL', 'https://sandbox.supabase.co');
});
afterEach(() => vi.unstubAllEnvs());

describe('verified sandbox subscription sponsorship credit', () => {
  it('backs a verified grant from reserves and makes restored/repeated snapshots a no-op', () => {
    const initial = newFinanceState();
    const state = apply(initial);
    expect(credit(state)).toBe(500);
    expect(state.balances['platform:reserve']).toBe(9_999_500);
    expect(state.balances['wallet:' + account] ?? 0).toBe(0);
    expect(state.lots.filter((lot) => lot.amount > 0)).toEqual([
      expect.objectContaining({ purpose: 'sponsorship', amount: 500 }),
    ]);
    expect(apply(state, { ...snapshot(), fingerprint: 'e'.repeat(64) })).toBe(state);
    expect(auditFinance(state)).toBe(true);
    expect(credit(initial)).toBe(0);
  });
  it('issues the next paid period once and grants only the difference on upgrade', () => {
    let state = apply(newFinanceState());
    const upgraded = snapshot();
    upgraded.members[0]!.tier = 'plebba_kongur';
    upgraded.periods[0]!.tier = 'plebba_kongur';
    upgraded.periods[0]!.allowancePending = 1000;
    state = apply(state, upgraded);
    expect(credit(state)).toBe(1000);
    expect(apply(state, upgraded)).toBe(state);
    const renewal = structuredClone(upgraded);
    renewal.members[0]!.paidUntil = '2026-11-01T00:00:00.000Z';
    renewal.periods.push({
      ...renewal.periods[0]!,
      periodKey: 'b'.repeat(64),
      startsAt: '2026-10-01T00:00:00.000Z',
      endsAt: '2026-11-01T00:00:00.000Z',
    });
    state = apply(state, renewal, '2026-10-02T12:00:00.000Z');
    expect(credit(state)).toBe(2000);
    expect(apply(state, renewal, '2026-10-02T12:00:00.000Z')).toBe(state);
  });
  it('deduplicates overlapping provider transaction keys and manual sandbox grants', () => {
    let state = newFinanceState();
    state.members[account] = {
      tier: 'plebbi',
      paidUntil: null,
      premiumMonths: 0,
      payoutIdentity: account,
      suspended: false,
    };
    state = applySubscriptionEvent(
      state,
      {
        eventId: 'manual-event',
        accountId: account,
        periodId: 'sandbox:2026-8',
        tier: 'flottari_plebbi',
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2026-10-01T00:00:00.000Z',
        environment: 'SANDBOX',
      },
      now,
    );
    const source = snapshot();
    source.periods.push({ ...source.periods[0]!, periodKey: 'b'.repeat(64) });
    state = apply(state, source);
    expect(credit(state)).toBe(500);
    expect(Object.values(state.subscriptions).map((period) => period.periodId)).toContain(
      'revenuecat:SANDBOX:' + periodKey,
    );
  });
  it('never funds a trial or ambiguous ownership review', () => {
    const trial = snapshot();
    trial.periods[0]!.paid = false;
    expect(credit(apply(newFinanceState(), trial))).toBe(0);
    const review = snapshot();
    review.members[0]!.needsReview = true;
    const state = apply(newFinanceState(), review);
    expect(credit(state)).toBe(0);
    expect(state.members[account]!.tier).toBe('plebbi');
    expect(state.subscriptions).toEqual({});
  });
  it('retains paid historical credit without reviving cancelled or expired access', () => {
    const source = snapshot();
    source.members[0]!.tier = 'plebbi';
    source.members[0]!.paidUntil = null;
    const state = apply(newFinanceState(), source);
    expect(credit(state)).toBe(500);
    expect(state.members[account]).toMatchObject({
      tier: 'plebbi',
      paidUntil: null,
      premiumMonths: 2,
    });
    const expired = apply(newFinanceState(), snapshot(), '2026-11-01T00:00:00.000Z');
    expect(credit(expired)).toBe(500);
    expect(expired.members[account]!.tier).toBe('plebbi');
  });
  it('revokes an unused refunded grant once without replenishing it on a restored snapshot', () => {
    const state = apply(newFinanceState());
    const refund = snapshot();
    refund.periods[0]!.refunded = true;
    refund.members[0]!.tier = 'plebbi';
    refund.members[0]!.paidUntil = null;
    const refunded = apply(state, refund);
    expect(credit(refunded)).toBe(0);
    expect(refunded.balances['platform:reserve']).toBe(10_000_000);
    expect(apply(refunded, refund)).toBe(refunded);
    expect(credit(apply(refunded))).toBe(0);
  });
  it('holds spent refunded grants for review without debiting an unrelated event pool', () => {
    let state = apply(newFinanceState());
    state.events.event = {
      id: 'event',
      hostId: recipient,
      startsAt: '2026-09-22T00:00:00.000Z',
      endsAt: '2026-09-22T01:00:00.000Z',
      cancelled: false,
      eligibleAttendees: [],
      hostBps: null,
      checkedIn: {},
      code: null,
      review: 'pending',
      settled: false,
    };
    const context = { memberId: account, now, randomId: () => 'unused' };
    const quoted = applyFinanceCommand(
      state,
      {
        action: 'contribution_quote',
        meetupId: 'event',
        amount: 500,
        fundingSource: 'credit',
        requestId: '10000000-0000-4000-8000-000000000003',
      },
      context,
    );
    const quote = quoted.result as ContributionQuote;
    state = applyFinanceCommand(
      quoted.state,
      {
        action: 'contribute',
        meetupId: 'event',
        amount: 500,
        expectedHostBps: 2500,
        quoteId: quote.id,
        requestId: '10000000-0000-4000-8000-000000000004',
      },
      context,
    ).state;
    const refund = snapshot();
    refund.periods[0]!.refunded = true;
    const refunded = apply(state, refund);
    expect(refunded.balances['pool:event']).toBe(500);
    expect(refunded.members[account]!.suspended).toBe(true);
    expect(refunded.flags).toContainEqual({
      accountId: account,
      reason: 'spent_subscription_refund',
    });
    expect(auditFinance(refunded)).toBe(true);
  });
  it('never issues the same global provider period to a second account after transfer', () => {
    const state = apply(newFinanceState());
    const transferred = snapshot();
    transferred.members = [
      { ...transferred.members[0]!, tier: 'plebbi', paidUntil: null },
      { ...transferred.members[0]!, accountId: recipient },
    ];
    transferred.periods[0]!.ownerId = recipient;
    const held = apply(state, transferred);
    expect(credit(held)).toBe(500);
    expect(credit(held, recipient)).toBe(0);
    expect(held.members[account]!.suspended).toBe(true);
    expect(held.members[recipient]!.suspended).toBe(true);
    expect(held.flags).toHaveLength(2);
    expect(apply(held, transferred)).toBe(held);
    transferred.periods[0]!.refunded = true;
    expect(credit(apply(held, transferred))).toBe(0);
  });
  it('fails atomically when the reserve cannot fully back the allowance', () => {
    const state = newFinanceState();
    state.journal.push({
      id: 'reserve-exhausted',
      kind: 'reserve_return',
      at: now,
      entries: [
        { account: 'platform:reserve', amount: -10_000_000 },
        { account: 'external:reserve_return', amount: 10_000_000 },
      ],
    });
    state.balances['platform:reserve'] = 0;
    state.balances['external:reserve_return'] = 10_000_000;
    const before = structuredClone(state);
    expect(() => apply(state)).toThrow('insufficient_funds');
    expect(state).toEqual(before);
    expect(auditFinance(state)).toBe(true);
  });
  it('rejects a production snapshot even if a caller uses the sandbox adapter', () => {
    expect(() =>
      apply(newFinanceState(), {
        ...snapshot(),
        environment: 'PRODUCTION',
      } as unknown as SponsorshipBillingSnapshot),
    ).toThrow();
  });
});

describe('durable billing credit polling and snapshot CAS', () => {
  it('does nothing when billing is disabled or production, and never loads or saves money', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await syncVerifiedSponsorshipCredits({ rpc } as unknown as SupabaseClient, now);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('finance_billing_snapshot');
    vi.stubEnv('COMMERCE_MODE', 'disabled');
    rpc.mockClear();
    await expect(
      syncVerifiedSponsorshipCredits({ rpc } as unknown as SupabaseClient, now),
    ).rejects.toThrow('sandbox_disabled');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('recomputes from current billing and finance facts after a snapshot conflict and resumes independently', async () => {
    let durable = newFinanceState();
    let revision = 1;
    let billing = snapshot();
    let conflict = true;
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'finance_billing_snapshot')
        return { data: structuredClone(billing), error: null };
      if (name === 'finance_load')
        return {
          data: { mode: 'sandbox', revision, state: structuredClone(durable) },
          error: null,
        };
      if (name === 'finance_billing_save') {
        if (conflict) {
          conflict = false;
          billing = snapshot();
          billing.fingerprint = 'e'.repeat(64);
          billing.members[0]!.tier = 'plebba_kongur';
          billing.periods[0]!.tier = 'plebba_kongur';
          return { data: false, error: null };
        }
        expect(args!.fingerprint).toBe(billing.fingerprint);
        expect(args!.revision).toBe(revision);
        durable = args!.state as FinanceState;
        revision++;
        return { data: true, error: null };
      }
      throw new Error('unexpected_rpc:' + name);
    });
    const db = { rpc } as unknown as SupabaseClient;
    await syncVerifiedSponsorshipCredits(db, now);
    expect(credit(durable)).toBe(1000);
    expect(durable.journal.filter((entry) => entry.kind === 'subscription_grant')).toHaveLength(1);
    rpc.mockClear();
    await syncVerifiedSponsorshipCredits(db, now);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'finance_billing_snapshot',
      'finance_load',
    ]);
  });
});
