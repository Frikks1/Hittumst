export type FeedSnapshot<T> = { items: T[]; cursor: string | null; loading: boolean; error: boolean; queryKey?: string };
export const emptyFeed = <T>(): FeedSnapshot<T> => ({ items: [], cursor: null, loading: false, error: false });

/** Owns request ordering so an old filter, refresh or signed-out request cannot repopulate the feed. */
export class PagedFeed<T extends { id: string }, Q> {
  private revision = 0;
  private query: Q | null = null;
  private queryKey: string | null = null;
  private pageCount = 0;
  private snapshot = emptyFeed<T>();
  constructor(
    private fetchPage: (query: Q, cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>,
    private commit: (snapshot: FeedSnapshot<T>) => void,
  ) {}
  private publish(next: FeedSnapshot<T>) { this.snapshot = next; this.commit(next); }
  clear() { this.revision++; this.query = null; this.queryKey = null; this.pageCount = 0; this.publish(emptyFeed<T>()); }
  pause() { this.revision++; this.publish({ ...this.snapshot, loading: false }); }
  async refresh(query: Q, queryKey?: string) {
    // Callers opt into preservation using a key that includes their authorization scope.
    // Without a key, retain the previous behavior for other paged surfaces.
    const preserve = queryKey !== undefined && queryKey === this.queryKey;
    this.query = query;
    this.queryKey = queryKey ?? null;
    const refreshPages = preserve ? Math.max(1, this.pageCount) : 1;
    if (!preserve) this.pageCount = 0;
    const revision = ++this.revision;
    this.publish({ ...(preserve ? this.snapshot : emptyFeed<T>()), queryKey, loading: true, error: false });
    await this.fetch(revision, query, null, refreshPages);
  }
  async more() {
    if (this.query === null || this.snapshot.loading || !this.snapshot.cursor) return;
    this.publish({ ...this.snapshot, loading: true, error: false });
    await this.fetch(this.revision, this.query, this.snapshot.cursor);
  }
  private async fetch(revision: number, query: Q, cursor: string | null, refreshPages = 1) {
    try {
      const merged = new Map((cursor ? this.snapshot.items : []).map(item => [item.id, item]));
      const seenCursors = new Set<string>();
      let nextCursor = cursor;
      let fetchedPages = 0;
      // Refresh every previously loaded page, then replace atomically. This keeps
      // the scroll destination while removing entries the server no longer returns.
      do {
        const page = await this.fetchPage(query, nextCursor);
        if (revision !== this.revision) return;
        for (const item of page.items) merged.set(item.id, item);
        fetchedPages++;
        if (nextCursor) seenCursors.add(nextCursor);
        nextCursor = page.items.length && page.nextCursor !== nextCursor && !seenCursors.has(page.nextCursor ?? '') ? page.nextCursor : null;
      } while (!cursor && fetchedPages < refreshPages && nextCursor);
      this.pageCount = cursor ? this.pageCount + fetchedPages : fetchedPages;
      this.publish({
        items: [...merged.values()],
        cursor: nextCursor,
        loading: false, error: false,
        queryKey: this.queryKey ?? undefined,
      });
    } catch (failure) {
      if (revision !== this.revision) return;
      const error = failure as { code?: unknown; status?: unknown } | null;
      const accessRevoked = error?.code === '42501' || error?.code === '28000' || error?.status === 401 || error?.status === 403;
      if (accessRevoked) this.pageCount = 0;
      this.publish({ ...(accessRevoked ? emptyFeed<T>() : this.snapshot), queryKey: this.queryKey ?? undefined, loading: false, error: true });
    }
  }
}
