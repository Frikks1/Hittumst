import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ getSession: vi.fn(), rpc: vi.fn(), setHeader: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: mock.getSession }, rpc: mock.rpc } }));
vi.mock('./env', () => ({ runtimeEnv: { isDemo: false } }));
vi.mock('./index', () => ({ api: {} }));
vi.mock('./communityLive', () => ({ communityRpc: vi.fn() }));
vi.mock('./mediaUpload', () => ({ queueMediaUpload: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: vi.fn() }));
import { trainCommand } from './trains';

beforeEach(() => {
  vi.resetAllMocks();
  mock.getSession.mockResolvedValue({ data: { session: { user: { id: 'member' }, access_token: 'initiating-session' } }, error: null });
  mock.setHeader.mockResolvedValue({ data: {}, error: null });
  mock.rpc.mockReturnValue({ setHeader: mock.setHeader });
});

describe('precise location account scope', () => {
  const input = { latitude: 64.15, longitude: -21.94, minutes: 15, recipients: ['friend'] };
  it('binds captured coordinates to the consenting account session', async () => {
    await trainCommand('location', 'train', input, { accountId: 'member', isCurrent: () => true });
    expect(mock.rpc).toHaveBeenCalledWith('train_command', { action: 'location', group_id: 'train', input });
    expect(mock.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer initiating-session');
  });
  it('does not send coordinates after an account switch', async () => {
    mock.getSession.mockResolvedValue({ data: { session: { user: { id: 'other' }, access_token: 'other-session' } }, error: null });
    await expect(trainCommand('location', 'train', input, { accountId: 'member' })).rejects.toThrow('account_changed');
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('does not send a fix after the user leaves the sharing screen', async () => {
    await expect(trainCommand('location', 'train', input, { accountId: 'member', isCurrent: () => false })).rejects.toThrow('account_changed');
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
