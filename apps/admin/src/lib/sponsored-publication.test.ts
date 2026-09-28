import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { newFinanceState } from '@rummal/shared';
import {
  FinanceBusinessError,
  sponsoredPublicationCommit,
  verifiedFinanceSession,
} from './sponsored-publication';

const memberId = '10000000-0000-4000-8000-000000000001';
const sessionId = '10000000-0000-4000-8000-000000000002';
const meetupId = '10000000-0000-4000-8000-000000000003';
const requestId = '10000000-0000-4000-8000-000000000004';
const input = { memberId, sessionId, meetupId, requestId, startsAt: '2026-09-21T18:00:00.000Z' };
const client = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as SupabaseClient;
const token = (claims: unknown) =>
  `verified-header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.verified-signature`;

describe('verified finance session binding', () => {
  it('extracts only the server-verified member session, ignoring user metadata', () => {
    expect(
      verifiedFinanceSession(
        token({
          sub: memberId,
          session_id: sessionId,
          user_metadata: { sub: 'attacker', session_id: 'attacker' },
        }),
        memberId,
      ),
    ).toBe(sessionId);
  });
  it('rejects a different account and missing or malformed session identifiers', () => {
    expect(() =>
      verifiedFinanceSession(token({ sub: 'another-account', session_id: sessionId }), memberId),
    ).toThrow('account_unavailable');
    expect(() => verifiedFinanceSession(token({ sub: memberId }), memberId)).toThrow();
    expect(() =>
      verifiedFinanceSession(token({ sub: memberId, session_id: 'invalid' }), memberId),
    ).toThrow();
    expect(() => verifiedFinanceSession('malformed-token', memberId)).toThrow();
  });
});

describe('atomic sponsored publication commit adapter', () => {
  it('passes the verified session, exact finance revision, state and generated recurrence into one RPC', async () => {
    const memberRpc = vi.fn().mockResolvedValue({
      data: { frequency: 'daily', interval: 1, end: { kind: 'count', count: 3 } },
      error: null,
    });
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const state = newFinanceState();
    const commit = await sponsoredPublicationCommit(client(rpc), client(memberRpc), input);
    expect(await commit(7, state)).toBe(true);
    expect(memberRpc).toHaveBeenCalledWith('get_meetup_draft_recurrence', { meetup_id: meetupId });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('finance_publish_meetup', {
      member_id: memberId,
      session_id: sessionId,
      meetup_id: meetupId,
      request_id: requestId,
      revision: 7,
      state,
      recurrence: {
        frequency: 'daily',
        interval: 1,
        weekdays: [],
        skippedDates: [],
        end: { kind: 'count', count: 3 },
        timezone: 'Atlantic/Reykjavik',
      },
      occurrence_starts: [
        '2026-09-21T18:00:00.000Z',
        '2026-09-22T18:00:00.000Z',
        '2026-09-23T18:00:00.000Z',
      ],
    });
  });
  it('can replay an already published request without a draft-only recurrence lookup', async () => {
    const memberRpc = vi.fn().mockRejectedValue(new Error('draft no longer exists'));
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const commit = await sponsoredPublicationCommit(client(rpc), client(memberRpc), {
      ...input,
      alreadyPublished: true,
    });
    expect(await commit(8, newFinanceState())).toBe(true);
    expect(memberRpc).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      'finance_publish_meetup',
      expect.objectContaining({ request_id: requestId, recurrence: null, occurrence_starts: null }),
    );
  });
  it('returns CAS conflicts for the transaction retry loop without falling back to a plain save', async () => {
    const memberRpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const commit = await sponsoredPublicationCommit(client(rpc), client(memberRpc), input);
    expect(await commit(4, newFinanceState())).toBe(false);
    expect(await commit(5, newFinanceState())).toBe(true);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'finance_publish_meetup',
      'finance_publish_meetup',
    ]);
    expect(memberRpc).toHaveBeenCalledTimes(1);
  });
  it('keeps business-rule rollbacks definitive and does not expose database diagnostics', async () => {
    const memberRpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: 'P0001', message: 'meetup_limit_reached' } });
    const commit = await sponsoredPublicationCommit(client(rpc), client(memberRpc), input);
    await expect(commit(4, newFinanceState())).rejects.toBeInstanceOf(FinanceBusinessError);
    await expect(commit(4, newFinanceState())).rejects.toThrow('meetup_limit_reached');
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'sensitive SQL detail 123' },
    });
    await expect(commit(4, newFinanceState())).rejects.toThrow('event_unavailable');
    rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection lost' } });
    await expect(commit(4, newFinanceState())).rejects.toThrow('finance_unavailable');
  });
  it('never commits after a denied draft lookup or invalid recurrence', async () => {
    const rpc = vi.fn();
    const memberRpc = vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(sponsoredPublicationCommit(client(rpc), client(memberRpc), input)).rejects.toThrow(
      'event_unavailable',
    );
    memberRpc.mockResolvedValue({ data: { frequency: 'daily', interval: 0 }, error: null });
    await expect(
      sponsoredPublicationCommit(client(rpc), client(memberRpc), input),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
