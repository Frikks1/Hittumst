import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyFinanceCommand,
  newFinanceState,
  type FinanceCommand,
  type FinanceState,
  type ContributionQuote,
} from '@rummal/shared';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/commerce', async (original) => ({
  ...(await original<typeof import('./commerce')>()),
  commerceDatabase: () => ({ rpc: mocks.rpc }),
}));
import { GET } from '@/app/api/jobs/commerce/route';
let stored: FinanceState;
let revision: number;
let context: Record<string, unknown> | null;
let rejectSettlement: boolean;
const eventId = '00000000-0000-4000-8000-000000000001';
const secret = 'local-worker-test-secret-with-32-characters';
const request = () =>
  new Request('https://local.test/api/jobs/commerce', {
    headers: { authorization: 'Bearer ' + secret },
  });
function fundedEvent() {
  let state = newFinanceState();
  for (const id of ['host', 'attendee', 'sponsor'])
    state.members[id] = {
      tier: id === 'sponsor' ? 'flottari_plebbi' : 'plebbi',
      paidUntil: '2026-10-01T00:00:00.000Z',
      premiumMonths: 0,
      suspended: false,
      payoutIdentity: id,
    };
  state.events[eventId] = {
    id: eventId,
    hostId: 'host',
    startsAt: '2026-09-02T12:00:00.000Z',
    endsAt: '2026-09-02T13:00:00.000Z',
    eligibleAttendees: ['attendee'],
    checkedIn: { attendee: '2026-09-02T12:01:00.000Z' },
    cancelled: false,
    settled: false,
    review: 'approved',
    hostBps: null,
    code: null,
  };
  const apply = (command: FinanceCommand) => {
    const result = applyFinanceCommand(state, command, {
      memberId: 'sponsor',
      now: '2026-09-01T12:00:00.000Z',
      randomId: randomUUID,
    });
    state = result.state;
    return result.result;
  };
  apply({ action: 'purchase', amount: 1100, requestId: randomUUID() });
  const quote = apply({
    action: 'contribution_quote',
    meetupId: eventId,
    amount: 1000,
    fundingSource: 'cash',
    requestId: randomUUID(),
  }) as ContributionQuote;
  apply({
    action: 'contribute',
    meetupId: eventId,
    amount: 1000,
    quoteId: quote.id,
    expectedHostBps: 2500,
    requestId: randomUUID(),
  });
  return state;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T12:00:00.000Z'));
  vi.stubEnv('COMMERCE_MODE', 'sandbox');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://sandbox.supabase.co');
  vi.stubEnv('COMMERCE_SANDBOX_SUPABASE_URL', 'https://sandbox.supabase.co');
  vi.stubEnv('CRON_SECRET', secret);
  vi.stubEnv('WORKER_SCHEDULER', '');
  stored = fundedEvent();
  revision = 1;
  rejectSettlement = false;
  const event = stored.events[eventId]!;
  context = {
    id: event.id,
    hostId: event.hostId,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    cancelled: event.cancelled,
    eligibleAttendees: event.eligibleAttendees,
  };
  mocks.rpc
    .mockReset()
    .mockImplementation(async (name: string, args?: { state: FinanceState; revision: number }) => {
      if (name === 'finance_load')
        return { data: { mode: 'sandbox', revision, state: structuredClone(stored) }, error: null };
      if (name === 'finance_event_context')
        return { data: context, error: context ? null : { message: 'deleted event' } };
      if (name === 'community_checkin_receipts') return { data: {}, error: null };
      if (name === 'finance_billing_snapshot') return { data: null, error: null };
      if (name === 'finance_settlement_save' && rejectSettlement)
        return { data: false, error: null };
      if (name === 'finance_save' || name === 'finance_settlement_save') {
        if (args!.revision !== revision) return { data: false, error: null };
        stored = structuredClone(args!.state);
        revision++;
        return { data: true, error: null };
      }
      throw new Error('Unexpected RPC: ' + name);
    });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe('settlement worker event-lock boundary', () => {
  it('settles the full advertised pool once and earns the separate service fee', async () => {
    expect((await GET(request())).status).toBe(200);
    expect(stored.balances['wallet:host']).toBe(250);
    expect(stored.balances['wallet:attendee']).toBe(750);
    expect(stored.balances['platform:sponsorship-fees']).toBe(100);
    expect(
      mocks.rpc.mock.calls.filter(([name]) => name === 'finance_settlement_save'),
    ).toHaveLength(1);
    const entries = stored.journal.length;
    expect((await GET(request())).status).toBe(200);
    expect(stored.journal).toHaveLength(entries);
  });
  it('never falls back to an unlocked save when a concurrent cancellation or reschedule rejects settlement', async () => {
    rejectSettlement = true;
    expect((await GET(request())).status).toBe(503);
    expect(stored.events[eventId]!.settled).toBe(false);
    expect(stored.balances['pool:' + eventId]).toBe(1000);
    expect(stored.balances['wallet:host'] ?? 0).toBe(0);
    expect(
      mocks.rpc.mock.calls.filter(([name]) => name === 'finance_settlement_save'),
    ).toHaveLength(5);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'finance_save')).toHaveLength(1);
  });
  it('refunds cancelled event principal and its fee without paying recipients', async () => {
    context!.cancelled = true;
    expect((await GET(request())).status).toBe(200);
    expect(stored.balances['wallet:sponsor']).toBe(1100);
    expect(stored.balances['pool:' + eventId]).toBe(0);
    expect(stored.events[eventId]!.settlementOutcome).toBe('refunded');
    expect(stored.balances['wallet:host'] ?? 0).toBe(0);
  });
  it('leaves a quoted but unpublished draft recoverable when ordinary event context excludes drafts', async () => {
    const draft = { ...stored.events[eventId]!, settled: false, cancelled: false, checkedIn: {}, hostBps: null };
    stored = newFinanceState(); stored.events[eventId] = draft; context = null;
    expect((await GET(request())).status).toBe(200);
    expect(stored.events[eventId]).toMatchObject({ settled: false, cancelled: false });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'finance_settlement_save')).toHaveLength(0);
    expect(stored.journal).toHaveLength(1);
  });
  it('uses the same locked commit when account deletion has removed the public event', async () => {
    stored.events[eventId]!.cancelled = true;
    context = null;
    expect((await GET(request())).status).toBe(200);
    expect(stored.balances['wallet:sponsor']).toBe(1100);
    expect(
      mocks.rpc.mock.calls.filter(([name]) => name === 'finance_settlement_save'),
    ).toHaveLength(1);
  });
});

it('settles using a recorded community check-in when no legacy financial scan exists', async () => {
  stored.events[eventId]!.checkedIn = {};
  const original = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation(async (name, args) => name === 'community_checkin_receipts'
    ? { data: { attendee: '2026-09-02T12:10:00.000Z' }, error: null } : original(name, args));
  expect((await GET(request())).status).toBe(200);
  expect(stored.balances['wallet:attendee']).toBe(750);
  expect(stored.events[eventId]!.checkedIn.attendee).toBe('2026-09-02T12:10:00.000Z');
});

it('does not settle while recorded attendance cannot be checked', async () => {
  const original = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation(async (name, args) => name === 'community_checkin_receipts'
    ? { data: null, error: { message: 'temporary failure' } } : original(name, args));
  expect((await GET(request())).status).toBe(503);
  expect(stored.events[eventId]!.settled).toBe(false);
});
