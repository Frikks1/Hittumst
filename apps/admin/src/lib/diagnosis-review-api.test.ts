import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn(), normalize: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/commerce', () => ({
  commerceDatabase: () => ({ storage: { from: () => ({ download: mocks.download }) } }),
}));
vi.mock('@/lib/jobs/media', () => ({ normalizeMedia: mocks.normalize }));
vi.mock('@/lib/jobs/media-worker', () => ({ mediaLimits: () => ({}) }));
import { GET } from '@/app/api/diagnoses/[id]/evidence/route';
import { POST } from '@/app/api/diagnoses/route';
const id = 'dd000000-0000-4000-8000-000000000011';
const context = { params: Promise.resolve({ id }) };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.download.mockResolvedValue({ data: new Blob(['synthetic evidence']), error: null });
  mocks.normalize.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]) });
});
describe('private evidence proxy', () => {
  it('never downloads evidence when reviewer authorization fails', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'reviewer_required' } });
    const response = await GET(
      new Request('https://admin.example.test/api/diagnoses/' + id + '/evidence'),
      context,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('withholds bytes when consent or assignment changes during download', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { path: 'synthetic/private' }, error: null })
      .mockResolvedValueOnce({ error: {} });
    const response = await GET(
      new Request('https://admin.example.test/api/diagnoses/' + id + '/evidence'),
      context,
    );
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it('returns non-caching normalized bytes only after both authorization checks', async () => {
    mocks.rpc.mockResolvedValue({ data: { path: 'synthetic/private' }, error: null });
    const response = await GET(
      new Request('https://admin.example.test/api/diagnoses/' + id + '/evidence'),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
  });
  it('rejects cross-origin cookie-authenticated review mutations before accessing the database', async () => {
    const response = await POST(
      new Request('https://admin.example.test/api/diagnoses', {
        method: 'POST',
        headers: { Origin: 'https://untrusted.example.test' },
        body: JSON.stringify({ action: 'list' }),
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('never sends the private storage path in browser identity metadata', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        path: 'synthetic/private',
        name: 'Synthetic Person',
        birthDate: '1990-01-01',
        diagnosisId: 'autism',
      },
      error: null,
    });
    const response = await POST(
      new Request('https://admin.example.test/api/diagnoses', {
        method: 'POST',
        headers: { Origin: 'https://admin.example.test' },
        body: JSON.stringify({ action: 'evidence', input: { id } }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: 'Synthetic Person',
      birthDate: '1990-01-01',
      diagnosisId: 'autism',
    });
  });
});
