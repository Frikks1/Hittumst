import { mergeCommunityAttendance } from '@/lib/community-attendance';
import { timingSafeEqual } from 'node:crypto';
import {
  SandboxProvider,
  toProviderAmount,
  finishOrder,
  finishPayout,
  settleEvent,
  pendingFinanceWork,
  fundTrainEvents,
  type FundedEvent,
} from '@rummal/shared';
import { commerceDatabase, financeTransaction, requireSandbox } from '@/lib/commerce';
import { syncVerifiedSponsorshipCredits } from '@/lib/billing/sponsorship-credit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (process.env.WORKER_SCHEDULER === "render" && process.env.WORKER_EXECUTION_ROLE !== "worker")
    return Response.json({ error: "dedicated_worker_required" }, { status: 503 });
  const secret = process.env.CRON_SECRET;
  const header = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    secret.length < 32 ||
    header.length !== expected.length ||
    !timingSafeEqual(header, expected)
  )
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    requireSandbox();
    const db = commerceDatabase();
    const provider = new SandboxProvider();
    const now = new Date().toISOString();
    await syncVerifiedSponsorshipCredits(db, now);
    const trainIds = await financeTransaction(db, state => ({
      state, result: Object.entries(state.trainPools ?? {}).filter(([,pool]) => pool.enabled).map(([id]) => id), persist: false,
    }));
    for (const trainId of trainIds) {
      const current = await db.rpc('finance_train_auto_context', { train_id: trainId });
      if (current.error) throw new Error('train_context_unavailable');
      const events = (current.data ?? []) as FundedEvent[];
      if (!events.length) continue;
      try {
        await financeTransaction(db, state => {
          const next = fundTrainEvents(state, trainId, events, now);
          return { state: next, result: null, persist: next !== state };
        }, async (revision, state) => {
          const saved = await db.rpc('finance_train_auto_save', { train_id: trainId, revision, state, event_context: events });
          if (saved.error) throw new Error(saved.error.code === 'P0001' && saved.error.message === 'train_context_changed'
            ? 'train_context_changed' : 'train_finance_unavailable');
          return saved.data === true;
        });
      } catch (error) {
        // A changing RSVP/group or busy ledger retries next tick without starving payouts/settlement.
        if (!(error instanceof Error) || !['train_context_changed', 'finance_busy_retry_same_request'].includes(error.message)) throw error;
      }
    }
    const work = await financeTransaction(db, (state) => ({
      state,
      result: pendingFinanceWork(state, now),
    }));
    for (const payout of work.payouts) {
      // Persisted operation ID is also the provider key. A timeout leaves the reservation intact.
      const outcome = await provider.submit(payout.id, toProviderAmount(payout.net, 1));
      await financeTransaction(db, (state) => ({
        state: finishPayout(state, payout.id, outcome.status, outcome.reference, now),
        result: null,
      }));
    }
    for (const order of work.orders) {
      const outcome = await provider.fulfil(order.id, order.sku);
      await financeTransaction(db, (state) => ({
        state: finishOrder(state, order.id, outcome.status, outcome.receipt, now),
        result: null,
      }));
    }
    for (const event of work.events) {
      // Serialize settlement with cancellation/rescheduling, not just other ledger writers.
      const commit = async (revision: number, state: Parameters<typeof settleEvent>[0]) => {
        const saved = await db.rpc('finance_settlement_save', { meetup_id: event.id, revision, state });
        if (saved.error) throw new Error('finance_unavailable');
        return saved.data === true;
      };
      const context = await db.rpc('finance_event_context', { meetup_id: event.id });
      if (context.error) {
        // A deletion trigger can cancel the financial event before its public row disappears.
        if (event.cancelled)
          await financeTransaction(db, (state) => ({
            state: state.events[event.id]?.cancelled ? settleEvent(state, event.id, now) : state,
            result: null,
          }), commit);
        continue;
      }
      const receipts = await db.rpc('community_checkin_receipts', { p_meetup_id: event.id });
      if (receipts.error) throw new Error('attendance_receipts_unavailable');
      await financeTransaction(db, (state) => {
        const latest = state.events[event.id]!;
        Object.assign(latest, context.data);
        state.events[event.id] = mergeCommunityAttendance(latest, receipts.data);
        if (
          latest.cancelled ||
          (latest.review !== 'pending' && Date.parse(now) >= Date.parse(latest.endsAt) + 86400000)
        )
          state = settleEvent(state, event.id, now);
        return { state, result: null };
      }, commit);
    }
    return Response.json(
      { processed: true, sandbox: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: 'commerce_worker_unavailable' }, { status: 503 });
  }
}
