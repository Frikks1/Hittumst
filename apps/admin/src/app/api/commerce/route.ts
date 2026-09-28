import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  activeTier,
  applyFinanceCommand,
  applySubscriptionEvent,
  financeCommandSchema,
  financeSnapshot,
  tierIdSchema,
  type FundedEvent,
  type FinanceState,
} from '@rummal/shared';
import {
  commerceDatabase,
  financeTransaction,
  loadFinanceState,
  requireSandbox,
} from '@/lib/commerce';
import {
  FinanceBusinessError,
  sponsoredPublicationCommit,
  throwFinanceSaveError,
  verifiedFinanceSession,
} from '@/lib/sponsored-publication';
import { memberCors, memberPreflight } from '@/lib/auth/member-cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const inputSchema = z.object({
  action: z.enum(['entitlement', 'wallet', 'command', 'sandbox_tier']),
  payload: z.unknown().optional(),
});
const rejectedCommands = new Set([
  'account_unavailable',
  'recipient_unavailable',
  'event_unavailable',
  'pool_closed',
  'pool_split_changed',
  'host_unavailable',
  'insufficient_funds',
  'insufficient_lots',
  'contribution_unavailable',
  'checkin_unavailable',
  'checkin_code_expired',
  'already_checked_in',
  'payout_identity_required',
  'payout_identity_shared',
  'quote_expired',
  'quote_changed',
  'item_unavailable',
  'idempotency_conflict',
  'subscription_required',
  'paid_subscription_required',
  'sponsorship_quote_required',
  'invalid_credit_amount',
  'insufficient_sponsorship_credit',
  'invalid_funding_source',
  'credit_units_required',
  'funding_source_mismatch',
  'not_host',
  'event_context_changed',
  'sponsorship_credit_required',
  'quote_owner_mismatch',
  'sponsorship_quote_expired',
  'sponsorship_quote_changed',
  'sponsorship_quote_required',
]);
async function handlePost(request: Request) {
  let replay: ((state?: FinanceState) => Promise<Response | null>) | undefined;
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer '))
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    const db = commerceDatabase();
    const verified = await db.auth.getUser(auth.slice(7));
    if (verified.error || !verified.data.user)
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    const id = verified.data.user.id;
    const memberDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false }, global: { headers: { Authorization: auth } } },
    );
    // Validates active account and permits entitlement reads with commerce disabled.
    const entitlement = await memberDb.rpc('get_my_entitlement');
    if (entitlement.error) throw new Error('account_unavailable');
    if (Number(request.headers.get('content-length') ?? 0) > 8192)
      return Response.json({ error: 'request_too_large' }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 8192) return Response.json({ error: 'request_too_large' }, { status: 413 });
    const input = inputSchema.parse(JSON.parse(raw));
    if (input.action === 'entitlement')
      return Response.json(entitlement.data, { headers: { 'Cache-Control': 'no-store' } });
    requireSandbox();
    const now = new Date().toISOString();
    const command = input.action === 'command' ? financeCommandSchema.parse(input.payload) : null;
    const sessionId =
      command && ('meetupId' in command || command.action === 'reverse')
        ? verifiedFinanceSession(auth.slice(7), id)
        : null;
    let prior: FinanceState | undefined;
    if (command) {
      // Authentication and account/session checks still apply to receipts. Current subscription or
      // event eligibility does not: an acknowledged payment must remain recoverable after either changes.
      replay = async (state) => {
        // Pool summaries and attendance codes are visibility-scoped reads, not financial receipts.
        if (command.action === 'pool_info' || command.action === 'checkin_code') return null;
        const current = state ?? (await loadFinanceState(db)).state;
        if (!current.requests[id + ':' + command.requestId]) return null;
        const receipt = applyFinanceCommand(current, command, {
          memberId: id,
          now,
          randomId: randomUUID,
        });
        return Response.json(receipt.result, { headers: { 'Cache-Control': 'no-store' } });
      };
      prior = (await loadFinanceState(db)).state;
      const receipt = await replay(prior);
      if (receipt) return receipt;
    }
    if (
      command &&
      ['contribution_quote', 'contribute', 'publish_sponsored'].includes(command.action) &&
      activeTier(entitlement.data.tier, entitlement.data.paidUntil, Date.parse(now)) === 'plebbi'
    )
      throw new Error('paid_subscription_required');
    if (command?.action === 'gift') {
      const recipient = await memberDb.rpc('get_public_profile', {
        profile_id: command.recipientId,
      });
      if (recipient.error || !recipient.data) throw new Error('recipient_unavailable');
    }
    let meetupId = command && 'meetupId' in command ? command.meetupId : null;
    if (command?.action === 'reverse') {
      const contribution = prior?.contributions[command.contributionId];
      if (!contribution || contribution.memberId !== id)
        throw new Error('contribution_unavailable');
      meetupId = contribution.eventId;
    }
    let eventStatus: string | null = null;
    let eventContext: Pick<
      FundedEvent,
      'id' | 'hostId' | 'startsAt' | 'endsAt' | 'cancelled' | 'eligibleAttendees'
    > | null = null;
    if (command && meetupId) {
      // An owner can reverse their contribution before the start even if they were removed from an event.
      if (command.action !== 'reverse') {
        const visible = await memberDb.rpc('get_meetup', { meetup_id: meetupId });
        if (visible.error || !visible.data) throw new Error('event_unavailable');
        eventStatus = visible.data.status;
        const draftQuote =
          eventStatus === 'draft' && ['contribution_quote', 'pool_info'].includes(command.action);
        if (
          eventStatus !== 'published' &&
          !draftQuote &&
          command.action !== 'publish_sponsored' &&
          command.action !== 'pool_info'
        )
          throw new Error('pool_closed');
      }
      const draftQuote =
        eventStatus === 'draft' && ['contribution_quote', 'pool_info'].includes(command.action);
      const event =
        draftQuote || command.action === 'publish_sponsored'
          ? await db.rpc('finance_publish_context', { member_id: id, meetup_id: meetupId })
          : await db.rpc('finance_event_context', { meetup_id: meetupId });
      if (event.error || !event.data) throw new Error('event_unavailable');
      eventContext = event.data;
    }
    const commit =
      command?.action === 'publish_sponsored' && eventContext
        ? await sponsoredPublicationCommit(db, memberDb, {
            memberId: id,
            sessionId: sessionId!,
            meetupId: command.meetupId,
            requestId: command.requestId,
            startsAt: eventContext.startsAt,
            alreadyPublished: eventStatus === 'published',
          })
        : command && meetupId && eventContext
          ? async (revision: number, state: FinanceState) => {
              const saved = await db.rpc('finance_event_save', {
                member_id: id,
                session_id: sessionId,
                meetup_id: meetupId,
                command_action: command.action,
                revision,
                state,
              });
              if (saved.error) throwFinanceSaveError(saved.error);
              return saved.data === true;
            }
          : undefined;
    const result = await financeTransaction(
      db,
      (state) => {
        // Another caller may have committed this same request while this transaction was waiting.
        if (command && state.requests[id + ':' + command.requestId])
          return {
            ...applyFinanceCommand(state, command, { memberId: id, now, randomId: randomUUID }),
            persist: false,
          };
        state.members[id] ??= {
          tier: 'plebbi',
          paidUntil: null,
          premiumMonths: 0,
          payoutIdentity: `sandbox:${id}`,
          suspended: false,
        };
        // Membership in this latest CAS snapshot is canonical; never replace it with an earlier read.
        if (input.action === 'sandbox_tier') {
          const { tier } = z.object({ tier: tierIdSchema }).parse(input.payload);
          const date = new Date(now);
          if (tier === 'plebbi') {
            state.members[id]!.tier = tier;
            state.members[id]!.paidUntil = null;
          } else
            state = applySubscriptionEvent(
              state,
              {
                eventId: randomUUID(),
                accountId: id,
                periodId: `sandbox:${date.getUTCFullYear()}-${date.getUTCMonth()}`,
                tier,
                startsAt: new Date(
                  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
                ).toISOString(),
                endsAt: new Date(
                  Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
                ).toISOString(),
                environment: 'SANDBOX',
              },
              now,
            );
          state.members[id]!.tier = tier;
          return { state, result: null };
        }
        if (input.action === 'command') {
          if (command?.action === 'gift')
            state.members[command.recipientId] ??= {
              tier: 'plebbi',
              paidUntil: null,
              premiumMonths: 0,
              payoutIdentity: null,
              suspended: false,
            };
          if (eventContext) {
            const old = state.events[eventContext.id];
            state.members[eventContext.hostId] ??= {
              tier: 'plebbi',
              paidUntil: null,
              premiumMonths: 0,
              payoutIdentity: null,
              suspended: false,
            };
            state.events[eventContext.id] = {
              ...old,
              ...eventContext,
              hostBps: old?.hostBps ?? null,
              checkedIn: old?.checkedIn ?? {},
              code: old?.code ?? null,
              review: old?.review ?? 'pending',
              settled: old?.settled ?? false,
            };
          }
          return applyFinanceCommand(state, command!, { memberId: id, now, randomId: randomUUID });
        }
        return { state, result: financeSnapshot(state, id) };
      },
      commit,
    );
    if (input.action === 'sandbox_tier') {
      const refreshed = await memberDb.rpc('get_my_entitlement');
      if (refreshed.error) throw new Error('entitlement_unavailable');
      return Response.json(refreshed.data, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (caughtError) {
    let error = caughtError;
    // Also covers a duplicate that committed during a now-failing event/recurrence lookup.
    if (replay) {
      try {
        const receipt = await replay();
        if (receipt) return receipt;
      } catch (receiptError) {
        if (
          receiptError instanceof Error &&
          ['idempotency_conflict', 'account_unavailable'].includes(receiptError.message)
        )
          error = receiptError;
      }
    }
    const rejected =
      error instanceof z.ZodError ||
      error instanceof FinanceBusinessError ||
      (error instanceof Error && rejectedCommands.has(error.message));
    return Response.json(
      {
        error: rejected ? 'financial_request_rejected' : 'commerce_unavailable',
        ...(rejected && error instanceof Error && /^[a-z_]+$/.test(error.message)
          ? { code: error.message }
          : {}),
      },
      { status: rejected ? 422 : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function POST(request: Request) {
  const cors = memberCors(request, 'POST');
  if (!cors.allowed) return new Response(null, { status: 403, headers: cors.headers });
  const response = await handlePost(request);
  for (const [key, value] of cors.headers) response.headers.set(key, value);
  return response;
}
export function OPTIONS(request: Request) {
  return memberPreflight(request, 'POST');
}
