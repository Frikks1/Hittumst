import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  client: vi.fn(),
  service: vi.fn(),
  sandbox: vi.fn(),
  transaction: vi.fn(),
  rpc: vi.fn(),
  load: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ getCurrentAdmin: mocks.admin }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/lib/commerce', () => ({
  commerceDatabase: mocks.service,
  requireSandbox: mocks.sandbox,
  financeTransaction: mocks.transaction,
}));
import { loadFinanceConsole, submitFinanceReview } from './finance-console';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ id: 'operator', demo: false });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.service.mockReturnValue({ rpc: mocks.load });
  mocks.load.mockResolvedValue({ data: { mode: 'sandbox', state: null }, error: null });
});
describe('finance console authorization', () => {
  it('never reads the service ledger in demo, without staff MFA, or without separate financial permission', async () => {
    for (const admin of [null, { id: 'demo', demo: true }]) {
      mocks.admin.mockResolvedValue(admin);
      await expect(loadFinanceConsole()).rejects.toThrow('financial_permission_required');
    }
    mocks.admin.mockResolvedValue({ id: 'operator', demo: false });
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(loadFinanceConsole()).rejects.toThrow('financial_permission_required');
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it('denies permission lookup failures and misleading truthy values', async () => {
    for (const reply of [
      { data: true, error: { message: 'unavailable' } },
      { data: 'true', error: null },
      { data: 1, error: null },
    ]) {
      mocks.rpc.mockResolvedValue(reply);
      await expect(loadFinanceConsole()).rejects.toThrow('financial_permission_required');
    }
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it('does not synthesize a reserve when the ledger is absent', async () => {
    expect(await loadFinanceConsole()).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith('get_financial_access');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('rechecks permissions on every mutation and blocks production before a service read', async () => {
    const input = {
      meetupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      decision: 'approved',
      reason: 'Evidence verified by a separate operator.',
      requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(submitFinanceReview(input)).rejects.toThrow('financial_permission_required');
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.sandbox.mockImplementation(() => {
      throw new Error('sandbox_disabled');
    });
    await expect(loadFinanceConsole()).rejects.toThrow('sandbox_disabled');
    expect(mocks.service).not.toHaveBeenCalled();
  });
});
