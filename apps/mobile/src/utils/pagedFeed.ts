export type FeedSnapshot<T> = { items: T[]; cursor: string | null; loading: boolean; error: boolean };
export const emptyFeed = <T>(): FeedSnapshot<T> => ({ items: [], cursor: null, loading: false, error: false });

/** Owns request ordering so an old filter, refresh or signed-out request cannot repopulate the feed. */
export class PagedFeed<T extends { id: string }, Q> {
  private revision = 0;
  private query: Q | null = null;
  private snapshot = emptyFeed<T>();
  constructor(
    private fetchPage: (query: Q, cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>,
    private commit: (snapshot: FeedSnapshot<T>) => void,
  ) {}
  private publish(next: FeedSnapshot<T>) { this.snapshot = next; this.commit(next); }
  clear() { this.revision++; this.query = null; this.publish(emptyFeed<T>()); }
  async refresh(query: Q) {
    this.query = query;
    const revision = ++this.revision;
    this.publish({ ...emptyFeed<T>(), loading: true });
    await this.fetch(revision, query, null);
  }
  async more() {
    if (this.query === null || this.snapshot.loading || !this.snapshot.cursor) return;
    this.publish({ ...this.snapshot, loading: true, error: false });
    await this.fetch(this.revision, this.query, this.snapshot.cursor);
  }
  private async fetch(revision: number, query: Q, cursor: string | null) {
    try {
      const page = await this.fetchPage(query, cursor);
      if (revision !== this.revision) return;
      const merged = new Map((cursor ? this.snapshot.items : []).map(item => [item.id, item]));
      for (const item of page.items) merged.set(item.id, item);
      this.publish({
        items: [...merged.values()],
        cursor: page.items.length && page.nextCursor !== cursor ? page.nextCursor : null,
        loading: false, error: false,
      });
    } catch {
      if (revision === this.revision) this.publish({ ...this.snapshot, loading: false, error: true });
    }
  }
}
