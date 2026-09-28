import type { AlbumViewer } from '@/types/domain';

type AlbumApi = {
  openAlbumShare(shareId: string, requestId: string): Promise<AlbumViewer>;
  refreshAlbumShare(shareId: string, sessionId?: string): Promise<AlbumViewer>;
  closeAlbumViewer(sessionId: string): Promise<void>;
};

/** Keep one viewing session across URL renewals and lost acknowledgements. */
export function createAlbumViewerSession(api: AlbumApi, shareId: string, requestId: string) {
  let current: AlbumViewer | undefined;
  let pending: Promise<AlbumViewer> | undefined;
  let disposed = false;
  const close = (id?: string) => { if (id) void api.closeAlbumViewer(id).catch(() => undefined); };
  return {
    load(): Promise<AlbumViewer> {
      if (disposed) return Promise.reject(new Error('album_viewer_closed'));
      if (pending) return pending;
      pending = (current ? api.refreshAlbumShare(shareId, current.sessionId) : api.openAlbumShare(shareId, requestId))
        .then(viewer => {
          if (disposed) { close(viewer.sessionId); throw new Error('album_viewer_closed'); }
          current = viewer;
          return viewer;
        }).finally(() => { pending = undefined; });
      return pending;
    },
    dispose() { disposed = true; close(current?.sessionId); },
  };
}
