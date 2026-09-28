import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), fetch: vi.fn(), env: { websiteUrl: 'https://app.example.is', appEnvironment: 'staging' } }));
vi.mock('./env', () => ({ runtimeEnv: mocks.env }));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: mocks.session } } }));
import { memberRequest } from './memberApi';
const session = (id: string) => ({ data: { session: { user: { id }, access_token: 'fake-token' } }, error: null });
beforeEach(() => { vi.clearAllMocks(); mocks.env.websiteUrl = 'https://app.example.is'; mocks.env.appEnvironment = 'staging'; vi.stubGlobal('fetch', mocks.fetch); mocks.session.mockResolvedValue(session('a')); mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'queued' }) }); });
it('rejects a subscription request after the expected account departed, before sending a bearer', async () => {
  await expect(memberRequest('/api/billing/sync', {}, 'b')).rejects.toThrow('authentication_required');
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it('uses only the configured first-party origin with an account-bound POST', async () => {
  await expect(memberRequest('/api/billing/sync', {}, 'a')).resolves.toEqual({ status: 'queued' });
  expect(mocks.fetch).toHaveBeenCalledWith('https://app.example.is/api/billing/sync', expect.objectContaining({ method: 'POST', body: '{}', redirect: 'error', credentials: 'omit' }));
});
it('discards a response after a user switch', async () => {
  mocks.session.mockResolvedValueOnce(session('a')).mockResolvedValueOnce(session('b'));
  await expect(memberRequest('/api/billing/sync', {}, 'a')).rejects.toThrow('authentication_required');
});
it('never sends auth to an arbitrary URL or invalid configured origin', async () => {
  await expect(memberRequest('https://elsewhere.example/api/billing/sync')).rejects.toThrow('service_unavailable');
  mocks.env.websiteUrl = 'https://app.example.is@elsewhere.example/anything';
  await expect(memberRequest('/api/billing/sync')).rejects.toThrow('service_unavailable');
  expect(mocks.fetch).not.toHaveBeenCalled();
});
