import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { processDiagnosisCleanup } from './diagnosis-cleanup';
describe('private evidence erasure', () => {
  it('retries failed storage removal without falsely finishing the lease', async () => {
    const remove = vi
      .fn()
      .mockResolvedValueOnce({ error: {} })
      .mockResolvedValueOnce({ error: null });
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: ['synthetic/a', 'synthetic/b'], error: null })
      .mockResolvedValue({ data: true, error: null });
    const from = vi.fn(() => ({ remove }));
    expect(
      await processDiagnosisCleanup({ rpc, storage: { from } } as unknown as SupabaseClient),
    ).toEqual({ completed: 1, retry: 1 });
    expect(from).toHaveBeenCalledWith('diagnosis-evidence');
    expect(rpc.mock.calls.filter((call) => call[0] === 'finish_diagnosis_cleanup')).toHaveLength(1);
  });
  it('does not claim completion when server finds a restored object', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: ['synthetic/a'], error: null })
      .mockResolvedValue({ data: false, error: null });
    expect(
      await processDiagnosisCleanup({
        rpc,
        storage: { from: () => ({ remove: async () => ({ error: null }) }) },
      } as unknown as SupabaseClient),
    ).toEqual({ completed: 0, retry: 1 });
  });
});
