type DraftStorage = {
  getItem(accountId: string): Promise<string | null>;
  setItem(accountId: string, value: string): Promise<void>;
  removeItem(accountId: string): Promise<void>;
};

/** Serializes account cleanup and rejects writes from a signed-out form. */
export function createOnboardingDraftStore(storage: DraftStorage) {
  const generations = new Map<string, number>();
  const queues = new Map<string, Promise<unknown>>();
  const generation = (accountId: string) => generations.get(accountId) ?? 0;
  const serialize = <T>(accountId: string, work: () => Promise<T>): Promise<T> => {
    const operation = (queues.get(accountId) ?? Promise.resolve()).catch(() => undefined).then(work);
    queues.set(accountId, operation);
    void operation.finally(() => { if (queues.get(accountId) === operation) queues.delete(accountId); }).catch(() => undefined);
    return operation;
  };
  return {
    generation,
    get: (accountId: string) => serialize(accountId, () => storage.getItem(accountId)),
    set: (accountId: string, value: string, expectedGeneration = generation(accountId)) => serialize(accountId, async () => {
      if (expectedGeneration === generation(accountId)) await storage.setItem(accountId, value);
    }),
    clear: (accountId: string) => {
      generations.set(accountId, generation(accountId) + 1);
      return serialize(accountId, () => storage.removeItem(accountId));
    },
  };
}
