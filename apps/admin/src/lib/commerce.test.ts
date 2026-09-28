import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireSandbox, financeTransaction } from './commerce';
import { newFinanceState, type FinanceState } from '@rummal/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FinanceBusinessError } from './sponsored-publication';
afterEach(() => vi.unstubAllEnvs());
describe('commerce environment boundary', () => {
  it('requires both an explicit sandbox mode and matching project', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://sandbox.supabase.co');
    vi.stubEnv('COMMERCE_SANDBOX_SUPABASE_URL', 'https://sandbox.supabase.co');
    vi.stubEnv('COMMERCE_MODE', 'disabled');
    expect(() => requireSandbox()).toThrow('sandbox_disabled');
    vi.stubEnv('COMMERCE_MODE', 'sandbox');
    expect(() => requireSandbox()).not.toThrow();
    vi.stubEnv('COMMERCE_SANDBOX_SUPABASE_URL', 'https://another.supabase.co');
    expect(() => requireSandbox()).toThrow('sandbox_disabled');
  });
  it('refuses the production project even when both settings claim sandbox', () => {
    vi.stubEnv('COMMERCE_MODE', 'sandbox');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://yztxwdhajgoqvtsqmcdw.supabase.co');
    vi.stubEnv('COMMERCE_SANDBOX_SUPABASE_URL', 'https://yztxwdhajgoqvtsqmcdw.supabase.co');
    expect(() => requireSandbox()).toThrow('sandbox_disabled');
  });
});

describe('finance transaction compare-and-swap boundaries', () => {
  function setup() {
    vi.stubEnv('COMMERCE_MODE', 'sandbox');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://sandbox.supabase.co');
    vi.stubEnv('COMMERCE_SANDBOX_SUPABASE_URL', 'https://sandbox.supabase.co');
    const rpc = vi.fn();
    const db = { rpc } as unknown as SupabaseClient;
    return { rpc, db };
  }
  it('reloads and recomputes from the newer finance state after an atomic commit conflict', async () => {
    const { rpc, db } = setup();
    const initial = newFinanceState();
    const concurrent = structuredClone(initial);
    concurrent.sequence = 10;
    rpc
      .mockResolvedValueOnce({
        data: { mode: 'sandbox', revision: 3, state: initial },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { mode: 'sandbox', revision: 4, state: concurrent },
        error: null,
      });
    const change = vi.fn((state: FinanceState) => ({
      state: { ...state, sequence: state.sequence + 1 },
      result: state.sequence + 1,
    }));
    const commit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await financeTransaction(db, change, commit)).toBe(11);
    expect(commit).toHaveBeenNthCalledWith(1, 3, expect.objectContaining({ sequence: 1 }));
    expect(commit).toHaveBeenNthCalledWith(2, 4, expect.objectContaining({ sequence: 11 }));
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['finance_load', 'finance_load']);
    expect(initial.sequence).toBe(0);
  });
  it('never falls back to a non-atomic save or repeats a definitive rollback', async () => {
    const { rpc, db } = setup();
    const state = newFinanceState();
    rpc.mockResolvedValue({ data: { mode: 'sandbox', revision: 3, state }, error: null });
    const commit = vi.fn().mockRejectedValue(new FinanceBusinessError('meetup_limit_reached'));
    await expect(
      financeTransaction(
        db,
        (loaded) => ({ state: { ...loaded, sequence: 1 }, result: true }),
        commit,
      ),
    ).rejects.toThrow('meetup_limit_reached');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('finance_load');
    expect(state.sequence).toBe(0);
  });
  it('returns a receipt discovered after contention without invoking a commit again', async () => {
    const { rpc, db } = setup();
    rpc.mockResolvedValue({
      data: { mode: 'sandbox', revision: 4, state: newFinanceState() },
      error: null,
    });
    const commit = vi.fn();
    expect(
      await financeTransaction(
        db,
        (state) => ({ state, result: 'saved receipt', persist: false }),
        commit,
      ),
    ).toBe('saved receipt');
    expect(commit).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledExactlyOnceWith('finance_load');
  });
  it('bounds contention retries while preserving same-request retry semantics', async () => {
    const { rpc, db } = setup();
    rpc.mockResolvedValue({
      data: { mode: 'sandbox', revision: 3, state: newFinanceState() },
      error: null,
    });
    const commit = vi.fn().mockResolvedValue(false);
    await expect(
      financeTransaction(db, (state) => ({ state, result: true }), commit),
    ).rejects.toThrow('finance_busy_retry_same_request');
    expect(commit).toHaveBeenCalledTimes(5);
    expect(rpc).toHaveBeenCalledTimes(5);
  });
  it('does not invoke custom commits when the loaded or proposed ledger is invalid', async () => {
    const { rpc, db } = setup();
    const state = newFinanceState();
    state.balances['wallet:broken'] = 1;
    rpc.mockResolvedValueOnce({ data: { mode: 'sandbox', revision: 1, state }, error: null });
    const change = vi.fn((value: FinanceState) => ({ state: value, result: null }));
    const commit = vi.fn();
    await expect(financeTransaction(db, change, commit)).rejects.toThrow('balance_drift');
    expect(change).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({
      data: { mode: 'sandbox', revision: 1, state: newFinanceState() },
      error: null,
    });
    await expect(
      financeTransaction(
        db,
        (value) => ({
          state: { ...value, balances: { ...value.balances, 'wallet:broken': 1 } },
          result: null,
        }),
        commit,
      ),
    ).rejects.toThrow('balance_drift');
    expect(commit).not.toHaveBeenCalled();
  });
  it('denies even custom atomic saves when sandbox gates are closed', async () => {
    const { rpc, db } = setup();
    vi.stubEnv('COMMERCE_MODE', 'disabled');
    const commit = vi.fn();
    await expect(
      financeTransaction(db, (state) => ({ state, result: true }), commit),
    ).rejects.toThrow('sandbox_disabled');
    expect(rpc).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
});
