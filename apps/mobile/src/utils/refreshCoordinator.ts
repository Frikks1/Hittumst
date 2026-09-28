export type RefreshJob<T> = {
  read: () => Promise<T>;
  apply: (value: T) => void;
  reject: (error: unknown) => void;
  settled?: () => void;
};

/** Serializes refreshes and discards snapshots superseded by a successful write
 * or a changed screen/account. Only the latest queued refresh needs to run. */
export function createRefreshCoordinator<T>() {
  let version = 0;
  let pending: RefreshJob<T> | null = null;
  let active: RefreshJob<T> | null = null;
  let running: Promise<void> | null = null;
  const pump = async () => {
    while (pending) {
      const job: RefreshJob<T> = pending;
      pending = null; active = job;
      const started = version;
      try {
        const value = await job.read();
        if (started === version) job.apply(value);
      } catch (error) {
        if (started === version) job.reject(error);
      } finally {
        if (started === version) job.settled?.();
        if (active === job) active = null;
      }
    }
  };
  const start = (): Promise<void> => {
    running = pump().finally(() => {
      running = null;
      // A request may arrive after pump's last loop but before this finally
      // callback. Include that queued read in the returned completion promise.
      if (pending) return start();
    });
    return running;
  };
  return {
    request(job: RefreshJob<T>): Promise<void> {
      pending = job;
      return running ?? start();
    },
    invalidate() {
      version++;
      // A write made an in-flight snapshot stale. Schedule a fresh read rather
      // than letting that snapshot erase the confirmed mutation from the UI.
      if (active && !pending) pending = active;
    },
    cancel() { version++; pending = null; active = null; },
    isRunning() { return running !== null; },
  };
}
