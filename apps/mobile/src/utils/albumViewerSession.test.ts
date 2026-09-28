import { describe, expect, it, vi } from 'vitest';
import { createAlbumViewerSession } from './albumViewerSession';
import type { AlbumViewer } from '@/types/domain';
const receipt: AlbumViewer = { shareId: 'share', albumId: 'album', name: 'Private', contentVersion: 1, sessionId: 'session', items: [] };
function setup() {
  const api = { openAlbumShare: vi.fn().mockResolvedValue(receipt), refreshAlbumShare: vi.fn().mockResolvedValue(receipt), closeAlbumViewer: vi.fn().mockResolvedValue(undefined) };
  return { api, viewer: createAlbumViewerSession(api, 'share', 'request') };
}
describe('private album viewing session', () => {
  it('coalesces overlapping loads and renews the same view-once session', async () => {
    const { api, viewer } = setup(); const one = viewer.load(); const two = viewer.load();
    expect(one).toBe(two); await one; await viewer.load();
    expect(api.openAlbumShare).toHaveBeenCalledOnce();
    expect(api.openAlbumShare).toHaveBeenCalledWith('share', 'request');
    expect(api.refreshAlbumShare).toHaveBeenCalledWith('share', 'session');
  });
  it('retries a lost initial acknowledgement using the same idempotency ID', async () => {
    const { api, viewer } = setup(); api.openAlbumShare.mockRejectedValueOnce(new Error('offline'));
    await expect(viewer.load()).rejects.toThrow('offline'); await viewer.load();
    expect(api.openAlbumShare.mock.calls).toEqual([['share', 'request'], ['share', 'request']]);
  });
  it('keeps the original session after a refresh error and never reconsumes it', async () => {
    const { api, viewer } = setup(); await viewer.load(); api.refreshAlbumShare.mockRejectedValueOnce(new Error('offline'));
    await expect(viewer.load()).rejects.toThrow('offline'); await viewer.load();
    expect(api.openAlbumShare).toHaveBeenCalledOnce(); expect(api.refreshAlbumShare).toHaveBeenCalledTimes(2);
  });
  it('closes a session whose initial response arrives after navigation away', async () => {
    const { api, viewer } = setup(); let resolve!: (value: AlbumViewer) => void;
    api.openAlbumShare.mockReturnValue(new Promise<AlbumViewer>(done => { resolve = done; }));
    const load = viewer.load(); viewer.dispose(); resolve(receipt);
    await expect(load).rejects.toThrow('album_viewer_closed'); expect(api.closeAlbumViewer).toHaveBeenCalledWith('session');
    await expect(viewer.load()).rejects.toThrow('album_viewer_closed');
  });
  it('propagates revocation and closes on disposal', async () => {
    const { api, viewer } = setup(); await viewer.load(); api.refreshAlbumShare.mockRejectedValue(new Error('album_share_locked'));
    await expect(viewer.load()).rejects.toThrow('album_share_locked'); viewer.dispose();
    expect(api.closeAlbumViewer).toHaveBeenCalledWith('session');
  });
});
