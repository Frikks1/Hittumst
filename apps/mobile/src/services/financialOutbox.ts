import { financeCommandSchema, type FinanceCommand } from '@rummal/shared';

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
const inFlight = new Map<string, { fingerprint: string; promise: Promise<unknown> }>();
const fingerprint = (command: FinanceCommand) =>
  JSON.stringify({ ...command, requestId: undefined });
export class FinancialCommandRejected extends Error {}
export async function pendingFinancialCommand(storage: Storage, accountId: string) {
  const value = await storage.getItem(`hittumst:pending-finance:${accountId}`);
  return value ? financeCommandSchema.parse(JSON.parse(value)) : null;
}

/** An uncertain response keeps its operation ID across retries and app restarts. */
export function sendFinancialCommand(
  storage: Storage,
  accountId: string,
  command: FinanceCommand,
  send: (command: FinanceCommand) => Promise<unknown>,
) {
  const key = `hittumst:pending-finance:${accountId}`;
  const currentFingerprint = fingerprint(command);
  const running = inFlight.get(key);
  if (running) {
    if (running.fingerprint !== currentFingerprint)
      return Promise.reject(new Error('financial_request_pending'));
    return running.promise;
  }
  const promise = (async () => {
    const stored = await storage.getItem(key);
    const pending = stored ? financeCommandSchema.parse(JSON.parse(stored)) : command;
    if (fingerprint(pending) !== currentFingerprint) throw new Error('financial_request_pending');
    if (!stored) await storage.setItem(key, JSON.stringify(pending));
    try {
      const result = await send(pending);
      await storage.removeItem(key);
      return result;
    } catch (error) {
      if (error instanceof FinancialCommandRejected) await storage.removeItem(key);
      throw error;
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, { fingerprint: currentFingerprint, promise });
  return promise;
}
