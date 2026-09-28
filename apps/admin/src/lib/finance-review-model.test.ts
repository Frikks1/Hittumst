import { describe, expect, it } from 'vitest';
import { newFinanceState } from '@rummal/shared';
import { applyFinanceReview, financeQueue, financeReviewSchema } from './finance-review-model';
const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const input = {
  meetupId: eventId,
  decision: 'approved' as const,
  reason: 'Attendance and contribution evidence reviewed.',
  requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};
function fixture() {
  const state = newFinanceState();
  state.events[eventId] = {
    id: eventId,
    hostId: 'host',
    startsAt: '2026-09-20T18:00:00Z',
    endsAt: '2026-09-20T20:00:00Z',
    cancelled: false,
    eligibleAttendees: ['member'],
    hostBps: 500,
    checkedIn: { member: 'private-checkin-value' },
    code: { value: 'private-code', expiresAt: '2026-09-20T20:00:00Z' },
    review: 'pending',
    settled: false,
  };
  return state;
}
describe('financial review decisions', () => {
  it('records the same confirmed retry only once and refuses changed decision or actor', () => {
    const state = fixture();
    applyFinanceReview(state, 'reviewer', input);
    applyFinanceReview(state, 'reviewer', input);
    expect(state.events[eventId].review).toBe('approved');
    expect(state.flags).toHaveLength(1);
    expect(financeQueue(state, 'reviewer').reviews).toHaveLength(1);
    expect(financeQueue(state, 'reviewer').reviews[0]).toMatchObject({
      actor: 'reviewer',
      previousReview: 'pending',
      decision: 'approved',
    });
    expect(() => applyFinanceReview(state, 'another-reviewer', input)).toThrow('review_conflict');
    expect(() => applyFinanceReview(state, 'reviewer', { ...input, decision: 'rejected' })).toThrow(
      'review_conflict',
    );
  });
  it('rejects a competing stale decision while allowing an explicit current-state revision', () => {
    const state = fixture();
    applyFinanceReview(state, 'first-reviewer', input);
    const competing = {
      ...input,
      requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      decision: 'rejected' as const,
    };
    expect(() => applyFinanceReview(state, 'second-reviewer', competing)).toThrow(
      'review_conflict',
    );
    expect(state.events[eventId].review).toBe('approved');
    expect(state.flags).toHaveLength(1);
    applyFinanceReview(state, 'second-reviewer', { ...competing, expectedReview: 'approved' });
    expect(state.events[eventId].review).toBe('rejected');
    expect(state.flags).toHaveLength(2);
  });
  it('refuses own, settled and missing events without a receipt', () => {
    for (const mode of ['host', 'settled', 'missing']) {
      const state = fixture();
      if (mode === 'settled') state.events[eventId].settled = true;
      if (mode === 'missing') delete state.events[eventId];
      expect(() => applyFinanceReview(state, mode === 'host' ? 'host' : 'reviewer', input)).toThrow(
        'review_unavailable',
      );
      expect(state.flags).toHaveLength(0);
      expect(state.receipts).toEqual({});
    }
  });
  it('requires bounded reasons and UUID request identifiers', () => {
    expect(financeReviewSchema.safeParse({ ...input, reason: 'short' }).success).toBe(false);
    expect(financeReviewSchema.safeParse({ ...input, reason: 'x'.repeat(501) }).success).toBe(
      false,
    );
    expect(financeReviewSchema.safeParse({ ...input, requestId: 'not-a-uuid' }).success).toBe(
      false,
    );
    expect(financeReviewSchema.safeParse({ ...input, actor: 'injected' }).success).toBe(false);
  });
  it('projects only operational data and excludes check-in secrets and full member records', () => {
    const state = fixture();
    state.members.member = {
      tier: 'plebbi',
      paidUntil: null,
      premiumMonths: 0,
      payoutIdentity: 'bank-secret',
      suspended: false,
    };
    const queue = financeQueue(state, 'host');
    expect(queue.events[0].canReview).toBe(false);
    const serialized = JSON.stringify(queue);
    expect(serialized).not.toContain('private-code');
    expect(serialized).not.toContain('private-checkin-value');
    expect(serialized).not.toContain('bank-secret');
  });
  it('refuses a non-sandbox or unbalanced ledger instead of displaying believable numbers', () => {
    const state = fixture();
    expect(() =>
      financeQueue({ ...state, environment: 'production' } as never, 'reviewer'),
    ).toThrow('sandbox_disabled');
    state.balances.corrupt = 42;
    expect(() => financeQueue(state, 'reviewer')).toThrow();
  });
});
