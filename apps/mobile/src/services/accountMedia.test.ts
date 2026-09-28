import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session:vi.fn(), save:vi.fn(), env:{ websiteUrl:'https://app.example.test', appEnvironment:'staging' } }));
vi.mock('./env', () => ({ runtimeEnv:mocks.env }));
vi.mock('./supabase', () => ({ supabase:{ auth:{ getSession:mocks.session } } }));
vi.mock('@/utils/accountExport', () => ({ saveExportFile:mocks.save }));
import { accountMediaUrl, readAccountMediaManifest, saveAccountMedia } from './accountMedia';
const item={ id:'10000000-0000-4000-8000-000000000001', bucket:'profile-photos' as const, name:'owner/photo.jpg', bytes:4 };
beforeEach(() => { mocks.env.websiteUrl='https://app.example.test'; mocks.env.appEnvironment='staging'; mocks.session.mockResolvedValue({ data:{ session:{ access_token:'secret-member-token', user:{id:'owner'} } }, error:null }); });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
describe('account media export', () => {
  it('parses only owned downloadable buckets and ignores server-supplied download URLs', () => {
    const manifest=readAccountMediaManifest(JSON.stringify({ mediaManifest:[{ ...item, downloadPath:'https://evil.test/steal' }] }));
    expect(manifest).toEqual([item]);
    expect(() => readAccountMediaManifest(JSON.stringify({ mediaManifest:[{...item,bucket:'media-quarantine'}] }))).toThrow();
  });
  it('never sends credentials to insecure, credentialed or path-bearing configured origins', () => {
    for (const origin of ['http://app.example.test', 'https://trusted.test@evil.test', 'https://app.example.test/api/redirect', 'https://app.example.test?next=evil']) expect(() => accountMediaUrl(item.id, origin)).toThrow();
    expect(() => accountMediaUrl('../evil', 'https://app.example.test')).toThrow();
  });
  it('downloads from the configured own-media endpoint without cookies or redirects, then shares bytes', async () => {
    const fetcher=vi.fn().mockResolvedValue(new Response(new Uint8Array([1,2,3,4]))); vi.stubGlobal('fetch', fetcher);
    await saveAccountMedia(item);
    expect(fetcher).toHaveBeenCalledWith(`https://app.example.test/api/account/media/${item.id}`, expect.objectContaining({ headers:{ Authorization:'Bearer secret-member-token' }, credentials:'omit', redirect:'error', cache:'no-store' }));
    expect(mocks.save).toHaveBeenCalledWith(new Uint8Array([1,2,3,4]), `hittumst-${item.id}.jpg`, 'image/jpeg');
  });
  it('does not fetch when signed out or share bytes after access is denied', async () => {
    const fetcher=vi.fn().mockResolvedValue(new Response(null,{status:404})); vi.stubGlobal('fetch', fetcher);
    mocks.session.mockResolvedValueOnce({ data:{session:null},error:null });
    await expect(saveAccountMedia(item)).rejects.toThrow('authentication_required'); expect(fetcher).not.toHaveBeenCalled();
    await expect(saveAccountMedia(item)).rejects.toThrow('media_export_unavailable'); expect(mocks.save).not.toHaveBeenCalled();
  });
  it('discards completed bytes after the account changes during the download', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private')));
    mocks.session.mockResolvedValueOnce({data:{session:{access_token:'token',user:{id:'owner'}}},error:null}).mockResolvedValueOnce({data:{session:{access_token:'other',user:{id:'different'}}},error:null});
    await expect(saveAccountMedia(item)).rejects.toThrow('authentication_required'); expect(mocks.save).not.toHaveBeenCalled();
  });
});
