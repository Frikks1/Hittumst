import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn(), storage: vi.fn(), member: vi.fn() }));
vi.mock('@/lib/auth/member-database', () => ({ memberDatabase: mocks.member }));
vi.mock('@/lib/commerce', () => ({ commerceDatabase: () => ({ storage: { from: mocks.storage } }) }));
import { GET } from './route';
const id = '10000000-0000-4000-8000-000000000001';
const context = { params: Promise.resolve({ id }) };
const request = () => new Request(`https://example.test/api/account/media/${id}`, { headers: { Authorization: 'Bearer member-token' } });
beforeEach(() => {
  mocks.member.mockReturnValue({ rpc: mocks.rpc });
  mocks.storage.mockReturnValue({ download: mocks.download });
  mocks.rpc.mockResolvedValue({ data: { bucket: 'album-media', name: 'own/file.jpg' }, error: null });
  mocks.download.mockResolvedValue({ data: new Blob(['test']), error: null });
});
afterEach(() => vi.resetAllMocks());
describe('private account media download', () => {
  it('requires a bearer session before touching storage', async () => {
    expect((await GET(new Request('https://example.test'), context)).status).toBe(401);
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it('does not reveal whether another member owns a requested file', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: {} });
    const result = await GET(request(),context);
    expect(result.status).toBe(404); expect(mocks.storage).not.toHaveBeenCalled();
  });
  it('streams only after both authorization checks and never caches or executes bytes', async () => {
    const result = await GET(request(),context);
    expect(result.status).toBe(200); expect(await result.text()).toBe('test');
    expect(result.headers.get('Cache-Control')).toContain('no-store');
    expect(result.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(result.headers.get('Content-Disposition')).toContain('attachment');
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it('fails closed if the session is revoked while storage is loading', async () => {
    mocks.rpc.mockResolvedValueOnce({ data:{ bucket:'album-media',name:'own/file.jpg' },error:null }).mockResolvedValueOnce({ data:null,error:{} });
    expect((await GET(request(),context)).status).toBe(404);
  });
});
