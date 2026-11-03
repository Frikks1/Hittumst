import { z } from 'zod';
import { meetupParticipantProfileSchema } from './meetups';
import type { FinanceState } from './finance';

/** Observed support history, never an authorization for recurring charges. */
export const meetupSponsorSchema = z.object({
  id: z.string().min(1).max(150),
  profile: meetupParticipantProfileSchema.nullable(),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  contributingMonths: z.number().int().positive(),
  cumulativeAmount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  repeatSupport: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.cumulativeAmount < value.amount) context.addIssue({ code: 'custom', message: 'History must include current support', path: ['cumulativeAmount'] });
  if (value.repeatSupport !== (value.contributingMonths >= 2)) context.addIssue({ code: 'custom', message: 'Repeat support requires two observed support months', path: ['repeatSupport'] });
});
export const meetupSponsorsSchema = z.array(meetupSponsorSchema);
export type MeetupSponsor = z.infer<typeof meetupSponsorSchema>;
export type SponsorSupportHistory = Omit<MeetupSponsor, 'profile'> & { memberId: string };
const committedTimestampSchema = z.iso.datetime({ offset: true }).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);

/** The caller supplies ONLY the same-series occurrences they may see. */
export function sponsorSupportHistory(state: FinanceState, meetupId: string, visibleSeriesOccurrences: readonly string[], now = new Date().toISOString()): SponsorSupportHistory[] {
  const scope = new Set([...visibleSeriesOccurrences, meetupId]);
  const transactions = new Map(state.journal.filter(tx => tx.kind === 'contribution').map(tx => [tx.id, tx]));
  const monthFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Reykjavik', year: 'numeric', month: '2-digit' });
  const valid = Object.values(state.contributions).flatMap(contribution => {
    if (!scope.has(contribution.eventId) || contribution.reversed || contribution.refundReason || contribution.amount <= 0) return [];
    const transaction = transactions.get(contribution.id);
    const at = transaction && committedTimestampSchema.safeParse(transaction.at).success ? Date.parse(transaction.at) : NaN;
    if (!transaction || !Number.isFinite(at) || at > Date.parse(now)
      || transaction.entries.filter(entry => entry.account === `pool:${contribution.eventId}`).reduce((sum, entry) => sum + entry.amount, 0) !== contribution.amount) return [];
    return [{ ...contribution, at, month: monthFormatter.format(new Date(at)) }];
  });
  const current = new Map<string, { id: string; amount: number; firstAt: number }>();
  for (const contribution of valid.filter(row => row.eventId === meetupId)) {
    const prior = current.get(contribution.memberId);
    current.set(contribution.memberId, { id: prior && prior.id < contribution.id ? prior.id : contribution.id,
      amount: (prior?.amount ?? 0) + contribution.amount, firstAt: Math.min(prior?.firstAt ?? contribution.at, contribution.at) });
  }
  return [...current].map(([memberId, support]) => {
    const history = valid.filter(row => row.memberId === memberId);
    const contributingMonths = new Set(history.map(row => row.month)).size;
    return { ...support, memberId, contributingMonths, cumulativeAmount: history.reduce((sum, row) => sum + row.amount, 0), repeatSupport: contributingMonths >= 2 };
  }).sort((left, right) => left.firstAt - right.firstAt || left.id.localeCompare(right.id))
    .map(({ firstAt: _firstAt, ...row }) => row);
}
