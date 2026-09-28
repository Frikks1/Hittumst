import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  activeTier,
  applySubscriptionEvent,
  auditFinance,
  tierIdSchema,
  type FinanceState,
} from '@rummal/shared';
import { loadFinanceState, requireSandbox } from '@/lib/commerce';

const instant = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const paidTier = z.enum(['flottari_plebbi', 'plebba_kongur']);
const snapshotSchema = z.object({
  environment: z.literal('SANDBOX'),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  members: z.array(
    z.object({
      accountId: z.uuid(),
      tier: tierIdSchema,
      paidUntil: instant.nullable(),
      premiumMonths: z.number().int().nonnegative(),
      needsReview: z.boolean(),
    }),
  ),
  periods: z.array(
    z
      .object({
        periodKey: z.string().regex(/^[a-f0-9]{64}$/),
        ownerId: z.uuid().nullable(),
        tier: paidTier,
        startsAt: instant,
        endsAt: instant,
        paid: z.boolean(),
        refunded: z.boolean(),
        allowancePending: z.number().int().nonnegative(),
      })
      .refine((period) => Date.parse(period.endsAt) > Date.parse(period.startsAt)),
  ),
});
export type SponsorshipBillingSnapshot = z.input<typeof snapshotSchema>;
const namespace = 'revenuecat:SANDBOX:';

/** Only trusted, reconciled provider facts reach this adapter. Credit always debits the funded reserve. */
export function applyVerifiedSponsorshipCredits(
  original: FinanceState,
  input: SponsorshipBillingSnapshot,
  now: string,
): FinanceState {
  const snapshot = snapshotSchema.parse(input);
  let state = structuredClone(original);
  const members = new Map(snapshot.members.map((member) => [member.accountId, member]));
  for (const member of snapshot.members) {
    state.members[member.accountId] ??= {
      tier: 'plebbi',
      paidUntil: null,
      premiumMonths: 0,
      payoutIdentity: 'sandbox:' + member.accountId,
      suspended: false,
    };
  }
  const hold = (accountId: string, periodKey: string) => {
    if (!state.members[accountId]) return;
    state.members[accountId]!.suspended = true;
    const reason = 'billing_credit_ownership_review:' + periodKey;
    if (!state.flags.some((flag) => flag.accountId === accountId && flag.reason === reason))
      state.flags.push({ accountId, reason });
  };
  const apply = (
    period: (typeof snapshot.periods)[number],
    accountId: string,
    refunded = period.refunded,
  ) => {
    const facts = {
      accountId,
      periodId: namespace + period.periodKey,
      tier: period.tier,
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      environment: 'SANDBOX' as const,
      refunded,
    };
    const eventId = namespace + createHash('sha256').update(JSON.stringify(facts)).digest('hex');
    state = applySubscriptionEvent(state, { ...facts, eventId }, now);
  };
  for (const period of [...snapshot.periods].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt) || a.periodKey.localeCompare(b.periodKey),
  )) {
    const periodId = namespace + period.periodKey;
    // Provider ownership is global, whereas the engine keys periods by member for legacy compatibility.
    const previous = Object.values(state.subscriptions).filter(
      (entry) => entry.periodId === periodId,
    );
    const owners = [...new Set(previous.map((entry) => entry.accountId))];
    const changedOwner = owners.some((owner) => owner !== period.ownerId);
    if (period.refunded) {
      // A refund still revokes its original grant after expiry, review or a transfer.
      for (const owner of owners) if (state.members[owner]) apply(period, owner, true);
    }
    if (changedOwner) {
      for (const owner of owners) hold(owner, period.periodKey);
      if (period.ownerId) hold(period.ownerId, period.periodKey);
      continue;
    }
    const member = period.ownerId ? members.get(period.ownerId) : undefined;
    if (!member || member.needsReview || !period.paid || period.refunded) continue;
    apply(period, member.accountId);
  }
  // Historical paid periods establish credit rights, not current access. Never revive cancelled access.
  for (const member of snapshot.members) {
    const target = state.members[member.accountId]!;
    target.tier = member.needsReview
      ? 'plebbi'
      : activeTier(member.tier, member.paidUntil, Date.parse(now));
    target.paidUntil = target.tier === 'plebbi' ? null : member.paidUntil;
    target.premiumMonths = member.premiumMonths;
  }
  auditFinance(state);
  return JSON.stringify(state) === JSON.stringify(original) ? original : state;
}

/** Poll durable verified periods, so worker interruptions never depend on replaying a completed billing job. */
export async function syncVerifiedSponsorshipCredits(
  db: SupabaseClient,
  now: string,
): Promise<void> {
  requireSandbox();
  for (let attempt = 0; attempt < 5; attempt++) {
    const snapshot = await db.rpc('finance_billing_snapshot');
    if (snapshot.error) throw new Error('billing_credit_snapshot_unavailable');
    if (snapshot.data === null) return; // Production or disabled billing retains unfunded pending allowances.
    const parsed = snapshotSchema.parse(snapshot.data);
    const loaded = await loadFinanceState(db);
    const state = applyVerifiedSponsorshipCredits(loaded.state, parsed, now);
    if (state === loaded.state) return;
    const saved = await db.rpc('finance_billing_save', {
      revision: loaded.revision,
      state,
      fingerprint: parsed.fingerprint,
    });
    if (saved.error) throw new Error('billing_credit_save_unavailable');
    if (saved.data === true) return;
  }
  throw new Error('billing_credit_busy_retry');
}
