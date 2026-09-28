import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyFinanceCommand,
  newFinanceState,
  type ContributionQuote,
  type FinanceState,
} from '@rummal/shared';
const mocks = vi.hoisted(() => ({ serviceRpc: vi.fn(), memberRpc: vi.fn(), getUser: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: mocks.memberRpc }) }));
vi.mock('@/lib/commerce', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/commerce')>()),
  commerceDatabase: () => ({ rpc: mocks.serviceRpc, auth: { getUser: mocks.getUser } }),
}));
import { POST } from './route';

const memberId = '10000000-0000-4000-8000-000000000001';
const sessionId = '10000000-0000-4000-8000-000000000002';
const meetupId = '10000000-0000-4000-8000-000000000003';
const now = '2026-09-21T12:00:00.000Z';
let serial = 100;
const uuid = () => `10000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`;
const token = (sub = memberId) =>
  `signed-header.${Buffer.from(JSON.stringify({ sub, session_id: sessionId })).toString('base64url')}.signed-signature`;
let durable: FinanceState;
let eventStatus: string;
let tier: 'plebbi' | 'flottari_plebbi';
let revision: number;
let commitError: { code: string; message: string } | null;
let contextDenied: boolean;
let loseFirstCas: boolean;
let onFirstCas: ((proposed: FinanceState) => void) | null;
let contextStartsAt: string | null;
function request(payload: unknown, bearer = token()) {
  return new Request('https://app.example/api/commerce', {
    method: 'POST',
    body: JSON.stringify({ action: 'command', payload }),
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
  });
}
const quoteInput = () => ({
  action: 'contribution_quote',
  meetupId,
  amount: 1000,
  fundingSource: 'cash',
  requestId: uuid(),
});
async function createQuote() {
  const response = await POST(request(quoteInput()));
  expect(response.status).toBe(200);
  return (await response.json()) as ContributionQuote;
}
const commitInput = (quote: ContributionQuote, action = 'publish_sponsored') => ({
  action,
  meetupId,
  amount: quote.amount,
  expectedHostBps: quote.hostBps,
  quoteId: quote.id,
  requestId: uuid(),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv('COMMERCE_MODE', 'sandbox');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://sandbox.supabase.co');
  vi.stubEnv('COMMERCE_SANDBOX_SUPABASE_URL', 'https://sandbox.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sandbox-public');
  eventStatus = 'draft';
  tier = 'flottari_plebbi';
  revision = 3;
  commitError = null;
  contextDenied = false;
  loseFirstCas = false;
  onFirstCas = null;
  contextStartsAt = null;
  durable = newFinanceState();
  durable.members[memberId] = {
    tier: 'flottari_plebbi',
    paidUntil: '2026-10-01T00:00:00.000Z',
    premiumMonths: 0,
    payoutIdentity: memberId,
    suspended: false,
  };
  durable.events[meetupId] = {
    id: meetupId,
    hostId: memberId,
    startsAt: '2026-09-22T12:00:00.000Z',
    endsAt: '2026-09-22T13:00:00.000Z',
    cancelled: false,
    eligibleAttendees: [],
    hostBps: null,
    checkedIn: {},
    code: null,
    review: 'pending',
    settled: false,
  };
  durable = applyFinanceCommand(
    durable,
    { action: 'purchase', amount: 2200, requestId: uuid() },
    { memberId, now, randomId: uuid },
  ).state;
  mocks.getUser.mockResolvedValue({ data: { user: { id: memberId } }, error: null });
  mocks.memberRpc.mockImplementation(async (name: string) => {
    if (name === 'get_my_entitlement')
      return {
        data: { tier, paidUntil: tier === 'plebbi' ? null : '2026-10-01T00:00:00.000Z' },
        error: null,
      };
    if (name === 'get_meetup') return { data: { id: meetupId, status: eventStatus }, error: null };
    if (name === 'get_meetup_draft_recurrence')
      return {
        data: null,
        error: eventStatus === 'draft' ? null : { code: 'P0001', message: 'draft_unavailable' },
      };
    throw new Error('unexpected_member_rpc:' + name);
  });
  mocks.serviceRpc.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'finance_load')
      return { data: { mode: 'sandbox', revision, state: structuredClone(durable) }, error: null };
    if (name === 'finance_event_context' || name === 'finance_publish_context') {
      if (contextDenied) return { data: null, error: { code: 'P0001', message: 'not_host' } };
      const event = durable.events[meetupId]!;
      return {
        data: {
          id: event.id,
          hostId: event.hostId,
          startsAt: contextStartsAt ?? event.startsAt,
          endsAt: event.endsAt,
          cancelled: event.cancelled,
          eligibleAttendees: event.eligibleAttendees,
        },
        error: null,
      };
    }
    if (name === 'finance_event_save' || name === 'finance_publish_meetup') {
      if (commitError) return { data: null, error: commitError };
      if (loseFirstCas) {
        loseFirstCas = false;
        revision++;
        durable.sequence += 10;
        onFirstCas?.(args.state as FinanceState);
        return { data: false, error: null };
      }
      expect(args.revision).toBe(revision);
      expect(args.member_id).toBe(memberId);
      expect(args.session_id).toBe(sessionId);
      durable = structuredClone(args.state as FinanceState);
      revision++;
      if (name === 'finance_publish_meetup') eventStatus = 'published';
      return { data: true, error: null };
    }
    throw new Error('unexpected_service_rpc:' + name);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('sponsorship HTTP authorization and atomic publication', () => {
  it('verifies the exact bearer token before accepting its session and account claims', async () => {
    const response = await POST(request(quoteInput()));
    expect(response.status).toBe(200);
    expect(mocks.getUser).toHaveBeenCalledWith(token());
    expect(mocks.serviceRpc).toHaveBeenCalledWith(
      'finance_event_save',
      expect.objectContaining({
        member_id: memberId,
        session_id: sessionId,
        command_action: 'contribution_quote',
      }),
    );
    mocks.serviceRpc.mockClear();
    const mismatch = await POST(request(quoteInput(), token('another-account')));
    expect(mismatch.status).toBe(422);
    expect(await mismatch.json()).toMatchObject({ code: 'account_unavailable' });
    expect(mocks.serviceRpc.mock.calls.some(([name]) => name === 'finance_load')).toBe(false);
  });
  it('does not use unverified token claims when authentication fails', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid signature' },
    });
    expect((await POST(request(quoteInput()))).status).toBe(401);
    expect(mocks.memberRpc).not.toHaveBeenCalled();
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });
  it('rejects new ordinary contributions to a draft without changing finance state', async () => {
    const quote = await createQuote();
    const before = structuredClone(durable);
    mocks.serviceRpc.mockClear();
    const response = await POST(request(commitInput(quote, 'contribute')));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'pool_closed' });
    expect(mocks.serviceRpc.mock.calls.every(([name]) => name === 'finance_load')).toBe(true);
    expect(durable).toEqual(before);
    expect(eventStatus).toBe('draft');
  });
  it('requires authoritative current paid entitlement even if stored finance membership was paid', async () => {
    tier = 'plebbi';
    const before = structuredClone(durable);
    const response = await POST(request(quoteInput()));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'paid_subscription_required' });
    expect(durable).toEqual(before);
    expect(mocks.serviceRpc.mock.calls.some(([name]) => name === 'finance_event_save')).toBe(false);
  });
  it('classifies invalid credit units as definitive rejection rather than uncertain commerce failure', async () => {
    const response = await POST(request({ ...quoteInput(), amount: 250, fundingSource: 'credit' }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'credit_units_required' });
    expect(mocks.serviceRpc.mock.calls.some(([name]) => name === 'finance_event_save')).toBe(false);
  });
  it('rejects draft lookup for a nonowner through the privileged context boundary', async () => {
    contextDenied = true;
    const response = await POST(request(quoteInput()));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: 'event_unavailable' });
    expect(mocks.serviceRpc.mock.calls.some(([name]) => name === 'finance_event_save')).toBe(false);
  });
  it('publishes and funds through one commit, then replays without draft recurrence or a second charge', async () => {
    const quote = await createQuote();
    const input = commitInput(quote);
    const response = await POST(request(input));
    expect(response.status).toBe(200);
    expect(eventStatus).toBe('published');
    expect(durable.balances[`wallet:${memberId}`]).toBe(1100);
    expect(durable.balances[`pool:${meetupId}`]).toBe(1000);
    expect(mocks.serviceRpc).toHaveBeenCalledWith(
      'finance_publish_meetup',
      expect.objectContaining({
        request_id: input.requestId,
        member_id: memberId,
        session_id: sessionId,
      }),
    );
    mocks.memberRpc.mockClear();
    expect((await POST(request(input))).status).toBe(200);
    expect(
      mocks.memberRpc.mock.calls.some(([name]) => name === 'get_meetup_draft_recurrence'),
    ).toBe(false);
    expect(Object.values(durable.contributions)).toHaveLength(1);
    expect(durable.balances[`wallet:${memberId}`]).toBe(1100);
    expect(mocks.serviceRpc.mock.calls.some(([name]) => name === 'finance_save')).toBe(false);
  });
  it('keeps a failed publication draft and its quote/funds intact for retry with the same request', async () => {
    const quote = await createQuote();
    const input = commitInput(quote);
    const before = structuredClone(durable);
    commitError = { code: 'P0001', message: 'meetup_limit_reached' };
    const failed = await POST(request(input));
    expect(failed.status).toBe(422);
    expect(await failed.json()).toMatchObject({ code: 'meetup_limit_reached' });
    expect(eventStatus).toBe('draft');
    expect(durable).toEqual(before);
    expect(durable.contributionQuotes![quote.id]!.used).toBe(false);
    commitError = null;
    expect((await POST(request(input))).status).toBe(200);
    expect(eventStatus).toBe('published');
    expect(Object.values(durable.contributions)).toHaveLength(1);
  });
  it('recomputes atomic publication after finance contention without duplicate funding', async () => {
    const quote = await createQuote();
    loseFirstCas = true;
    const input = commitInput(quote);
    const response = await POST(request(input));
    expect(response.status).toBe(200);
    expect(eventStatus).toBe('published');
    expect(
      mocks.serviceRpc.mock.calls.filter(([name]) => name === 'finance_publish_meetup'),
    ).toHaveLength(2);
    expect(Object.values(durable.contributions)).toHaveLength(1);
    expect(durable.balances[`pool:${meetupId}`]).toBe(1000);
  });
  it('keeps a completed receipt available after cancellation, expiry and lost event visibility without writing', async () => {
    const quote = await createQuote();
    const input = commitInput(quote);
    const original = await (await POST(request(input))).json();
    eventStatus = 'cancelled';
    durable.events[meetupId]!.cancelled = true;
    durable.members[memberId]!.tier = 'plebbi';
    durable.members[memberId]!.paidUntil = null;
    tier = 'plebbi';
    contextDenied = true;
    vi.setSystemTime('2026-10-02T12:00:00.000Z');
    const before = structuredClone(durable);
    mocks.memberRpc.mockClear();
    mocks.serviceRpc.mockClear();
    const replayed = await POST(request(input));
    expect(replayed.status).toBe(200);
    expect(await replayed.json()).toEqual(original);
    expect(mocks.memberRpc.mock.calls.map(([name]) => name)).toEqual(['get_my_entitlement']);
    expect(mocks.serviceRpc).toHaveBeenCalledExactlyOnceWith('finance_load');
    expect(durable).toEqual(before);
    const conflict = await POST(request({ ...input, amount: 2000 }));
    expect(conflict.status).toBe(422);
    expect(await conflict.json()).toMatchObject({ code: 'idempotency_conflict' });
  });
  it('never replays a pool summary after permission to view the event is lost', async () => {
    const input = { action: 'pool_info', meetupId, requestId: uuid() };
    expect((await POST(request(input))).status).toBe(200);
    const originalMemberRpc = mocks.memberRpc.getMockImplementation()!;
    mocks.memberRpc.mockImplementation(async (name, ...args) =>
      name === 'get_meetup'
        ? { data: null, error: { code: '42501', message: 'event_unavailable' } }
        : originalMemberRpc(name, ...args),
    );
    const denied = await POST(request(input));
    expect(denied.status).toBe(422);
    expect(await denied.json()).toMatchObject({ code: 'event_unavailable' });
  });
  it('preserves a newer renewal or upgrade loaded after a finance CAS conflict', async () => {
    const quote = await createQuote();
    loseFirstCas = true;
    onFirstCas = () => {
      durable.members[memberId]!.tier = 'plebba_kongur';
      durable.members[memberId]!.paidUntil = '2026-11-01T00:00:00.000Z';
    };
    expect((await POST(request(commitInput(quote)))).status).toBe(200);
    expect(durable.members[memberId]).toMatchObject({
      tier: 'plebba_kongur',
      paidUntil: '2026-11-01T00:00:00.000Z',
    });
  });
  it('recovers a duplicate committed during a CAS conflict even when the event was then cancelled', async () => {
    const quote = await createQuote();
    const input = commitInput(quote);
    loseFirstCas = true;
    onFirstCas = (proposed) => {
      durable = structuredClone(proposed);
      durable.events[meetupId]!.cancelled = true;
      eventStatus = 'cancelled';
    };
    mocks.serviceRpc.mockClear();
    const result = await POST(request(input));
    expect(result.status).toBe(200);
    expect(Object.values(durable.contributions)).toHaveLength(1);
    expect(
      mocks.serviceRpc.mock.calls.filter(([name]) => name === 'finance_publish_meetup'),
    ).toHaveLength(1);
    expect(durable.events[meetupId]!.cancelled).toBe(true);
  });
  it('recovers a duplicate committed between the initial receipt read and a denied event lookup', async () => {
    const quote = await createQuote();
    const input = commitInput(quote);
    const originalMemberRpc = mocks.memberRpc.getMockImplementation()!;
    mocks.memberRpc.mockImplementation(async (name, ...args) => {
      if (name === 'get_meetup') {
        durable = applyFinanceCommand(durable, input as Parameters<typeof applyFinanceCommand>[1], {
          memberId,
          now,
          randomId: uuid,
        }).state;
        durable.events[meetupId]!.cancelled = true;
        eventStatus = 'cancelled';
        return { data: null, error: { code: '42501', message: 'event_unavailable' } };
      }
      return originalMemberRpc(name, ...args);
    });
    mocks.serviceRpc.mockClear();
    expect((await POST(request(input))).status).toBe(200);
    expect(mocks.serviceRpc.mock.calls.every(([name]) => name === 'finance_load')).toBe(true);
    expect(Object.values(durable.contributions)).toHaveLength(1);
  });
  it('uses current event times for reversal and refunds an owned contribution after access is removed', async () => {
    const quote = await createQuote();
    const input = commitInput(quote);
    expect((await POST(request(input))).status).toBe(200);
    const reversal = { action: 'reverse', contributionId: input.requestId, requestId: uuid() };
    const before = structuredClone(durable);
    contextStartsAt = '2026-09-21T11:00:00.000Z';
    const closed = await POST(request(reversal));
    expect(closed.status).toBe(422);
    expect(await closed.json()).toMatchObject({ code: 'pool_closed' });
    expect(durable).toEqual(before);
    contextStartsAt = null;
    tier = 'plebbi';
    mocks.memberRpc.mockClear();
    expect((await POST(request(reversal))).status).toBe(200);
    expect(mocks.memberRpc.mock.calls.some(([name]) => name === 'get_meetup')).toBe(false);
    expect(mocks.serviceRpc).toHaveBeenCalledWith(
      'finance_event_save',
      expect.objectContaining({ command_action: 'reverse', meetup_id: meetupId }),
    );
    expect(durable.balances['wallet:' + memberId]).toBe(2200);
    expect(durable.balances['pool:' + meetupId]).toBe(0);
    expect(durable.contributions[input.requestId]!.reversed).toBe(true);
  });
  it.each(['P0002', '22023', '23514', '28000', '42501', '55000'])(
    'treats SQL %s as a definite publication rollback',
    async (code) => {
      const quote = await createQuote();
      const before = structuredClone(durable);
      commitError = { code, message: 'meetup_limit_reached' };
      const failed = await POST(request(commitInput(quote)));
      expect(failed.status).toBe(422);
      expect(await failed.json()).toMatchObject({ code: 'meetup_limit_reached' });
      expect(durable).toEqual(before);
    },
  );
  it('recovers the durable receipt when publication committed but its acknowledgement was lost', async () => {
    const quote = await createQuote();
    const input = commitInput(quote);
    const originalServiceRpc = mocks.serviceRpc.getMockImplementation()!;
    mocks.serviceRpc.mockImplementation(async (name, args) => {
      const result = await originalServiceRpc(name, args);
      if (name === 'finance_publish_meetup')
        return { data: null, error: { code: '08006', message: 'acknowledgement lost' } };
      return result;
    });
    const result = await POST(request(input));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ id: input.requestId, amount: 1000 });
    expect(eventStatus).toBe('published');
    expect(Object.values(durable.contributions)).toHaveLength(1);
    expect(
      mocks.serviceRpc.mock.calls.filter(([name]) => name === 'finance_publish_meetup'),
    ).toHaveLength(1);
  });
  it('keeps transport failures resumable without inventing a receipt or spending twice', async () => {
    const quote = await createQuote();
    const input = commitInput(quote);
    const before = structuredClone(durable);
    commitError = { code: '08006', message: 'connection lost' };
    expect((await POST(request(input))).status).toBe(503);
    expect(durable).toEqual(before);
    commitError = null;
    expect((await POST(request(input))).status).toBe(200);
    expect(Object.values(durable.contributions)).toHaveLength(1);
  });
});
