import { describe, expect, it } from 'vitest';
import { newFinanceState, type FinanceState } from './finance';
import { meetupSponsorSchema, sponsorSupportHistory } from './sponsorship';

function support(state: FinanceState, id: string, eventId: string, memberId: string, amount: number, at: string) {
  state.contributions[id] = { id, eventId, memberId, amount, lotIds: [], reversed: false };
  state.journal.push({ id, kind: 'contribution', at, entries: [{ account: `pool:${eventId}`, amount }] });
}
const now = '2026-10-07T12:00:00Z';
describe('observed same-series sponsorship history', () => {
  it('sums principal and distinct committed months without inferring a payment mandate', () => {
    const state = newFinanceState();
    support(state, 'july', 'first', 'sponsor', 500, '2026-07-31T23:59:59Z');
    support(state, 'august', 'second', 'sponsor', 700, '2026-08-01T00:00:00Z');
    support(state, 'september', 'current', 'sponsor', 1000, '2026-09-10T12:00:00Z');
    support(state, 'extra', 'current', 'sponsor', 500, '2026-09-10T13:00:00Z');
    support(state, 'other-series', 'unrelated', 'sponsor', 10000, '2026-06-10T12:00:00Z');
    expect(sponsorSupportHistory(state, 'current', ['first', 'second', 'current'], now)).toEqual([
      { id: 'extra', memberId: 'sponsor', amount: 1500, contributingMonths: 3, cumulativeAmount: 2700, repeatSupport: true },
    ]);
    expect(sponsorSupportHistory(state, 'current', ['current'], now)[0]).toMatchObject({ contributingMonths: 1, cumulativeAmount: 1500, repeatSupport: false });
  });
  it('excludes reversed, refunded, uncommitted, malformed and future receipts', () => {
    const state = newFinanceState();
    support(state, 'valid', 'current', 'sponsor', 500, '2026-09-01T00:00:00Z');
    for (const [id, at] of [['reversed', '2026-08-01T00:00:00Z'], ['refunded', '2026-07-01T00:00:00Z'], ['bad-date', 'unknown'], ['bad-calendar', '2026-02-30T12:00:00Z'], ['bad-offset', '2026-06-01T00:00:00+99:99'], ['future', '2027-01-01T00:00:00Z'], ['wrong-principal', '2026-06-01T00:00:00Z']]) support(state, id!, 'current', 'sponsor', 500, at!);
    state.contributions.reversed!.reversed = true;
    state.contributions.refunded!.refundReason = 'cancelled';
    state.journal.find(tx => tx.id === 'wrong-principal')!.entries[0]!.amount = 1;
    state.contributions.uncommitted = { id: 'uncommitted', memberId: 'sponsor', eventId: 'current', amount: 500, lotIds: [], reversed: false };
    expect(sponsorSupportHistory(state, 'current', ['current'], now)).toEqual([
      { id: 'valid', memberId: 'sponsor', amount: 500, contributingMonths: 1, cumulativeAmount: 500, repeatSupport: false },
    ]);
  });
  it('recognizes repeat support at two months and rejects invented recurring fields or inconsistent recognition', () => {
    const valid = { id: 'receipt', profile: null, amount: 500, contributingMonths: 2, cumulativeAmount: 1000, repeatSupport: true };
    expect(meetupSponsorSchema.parse(valid)).toEqual(valid);
    expect(meetupSponsorSchema.safeParse({ ...valid, recurring: true }).success).toBe(false);
    expect(meetupSponsorSchema.safeParse({ ...valid, contributingMonths: 1 }).success).toBe(false);
    expect(meetupSponsorSchema.safeParse({ ...valid, cumulativeAmount: 499 }).success).toBe(false);
  });
});
