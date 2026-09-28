import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ platform:{ OS:'ios' }, write:vi.fn(), create:vi.fn(), remove:vi.fn(), share:vi.fn(), available:vi.fn() }));
vi.mock('react-native', () => ({ Platform:mocks.platform }));
vi.mock('expo-crypto', () => ({ randomUUID:() => 'export-id' }));
vi.mock('expo-file-system', () => ({
  Paths:{ cache:'file:///cache' },
  Directory:class { exists = true; create = mocks.create; delete = mocks.remove; },
  File:class { uri = 'file:///cache/hittumst-export-export-id/hittumst-account.json'; write = mocks.write; },
}));
vi.mock('expo-sharing', () => ({ isAvailableAsync:mocks.available, shareAsync:mocks.share }));
import { saveAccountExport } from './accountExport';
beforeEach(() => { mocks.platform.OS='ios'; mocks.available.mockResolvedValue(true); mocks.share.mockResolvedValue(undefined); });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
describe('account file export', () => {
  it('shares a real JSON file and removes its temporary bytes after the sheet closes', async () => {
    await saveAccountExport('{"profile":{"name":"Private"}}');
    expect(mocks.write).toHaveBeenCalledWith('{"profile":{"name":"Private"}}');
    expect(mocks.share).toHaveBeenCalledWith('file:///cache/hittumst-export-export-id/hittumst-account.json', { mimeType:'application/json', dialogTitle:'Hittumst' });
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.share.mock.invocationCallOrder[0]!).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]!);
  });
  it('also removes temporary private data if the system sheet fails', async () => {
    mocks.share.mockRejectedValue(new Error('share_failed'));
    await expect(saveAccountExport('{}')).rejects.toThrow('share_failed');
    expect(mocks.remove).toHaveBeenCalledOnce();
  });
  it('does not create sensitive files when sharing is unavailable', async () => {
    mocks.available.mockResolvedValue(false);
    await expect(saveAccountExport('{}')).rejects.toThrow('file_sharing_unavailable');
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('rejects malformed exports before writing or sharing', async () => {
    await expect(saveAccountExport('bad')).rejects.toThrow();
    expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.share).not.toHaveBeenCalled();
  });
  it('downloads a local Blob on web without passing data to an external service', async () => {
    mocks.platform.OS='web';
    const link = { href:'', download:'', click:vi.fn(), remove:vi.fn() };
    vi.stubGlobal('document', { createElement:() => link, body:{ appendChild:vi.fn() } });
    const objectUrl=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:private-export');
    await saveAccountExport('{}');
    expect(link.download).toBe('hittumst-account.json'); expect(link.href).toBe('blob:private-export');
    expect(link.click).toHaveBeenCalledOnce(); expect(mocks.share).not.toHaveBeenCalled();
    objectUrl.mockRestore();
  });
});
