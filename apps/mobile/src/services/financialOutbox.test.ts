import { describe, it, expect } from 'vitest';
import {
  sendFinancialCommand,
  FinancialCommandRejected,
  pendingFinancialCommand,
} from './financialOutbox';
import type { FinanceCommand } from '@rummal/shared';
const command = (id: string, amount = 500): FinanceCommand => ({
  action: 'purchase',
  amount,
  requestId: `00000000-0000-4000-8000-${id.padStart(12, '0')}`,
});
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: async (key: string) => {
      data.delete(key);
    },
  };
}
describe('financial retries', () => {
  it('allows corrections after a definitive rejection', async () => {
    const store = storage();
    await expect(
      sendFinancialCommand(store, 'alice', command('10'), async () => {
        throw new FinancialCommandRejected('insufficient funds');
      }),
    ).rejects.toThrow();
    expect(await pendingFinancialCommand(store, 'alice')).toBeNull();
    await expect(
      sendFinancialCommand(store, 'alice', command('11', 100), async () => ({ accepted: true })),
    ).resolves.toEqual({ accepted: true });
  });
  it('retains the original ID after an uncertain response and clears only after acknowledgement', async () => {
    const store = storage();
    await expect(
      sendFinancialCommand(store, 'alice', command('1'), async () => {
        throw new Error('connection lost after commit');
      }),
    ).rejects.toThrow();
    let sent: FinanceCommand | undefined;
    await sendFinancialCommand(store, 'alice', command('2'), async (value) => {
      sent = value;
      return { received: true };
    });
    expect(sent?.requestId).toBe(command('1').requestId);
    await sendFinancialCommand(store, 'alice', command('3'), async (value) => {
      sent = value;
      return {};
    });
    expect(sent?.requestId).toBe(command('3').requestId);
  });
  it('prevents a different operation from replacing an unresolved one without blocking another account', async () => {
    const store = storage();
    await expect(
      sendFinancialCommand(store, 'alice', command('4'), async () => {
        throw new Error('timeout');
      }),
    ).rejects.toThrow();
    await expect(
      sendFinancialCommand(store, 'alice', command('5', 1000), async () => ({})),
    ).rejects.toThrow('financial_request_pending');
    await expect(
      sendFinancialCommand(store, 'bob', command('6'), async () => ({ accepted: true })),
    ).resolves.toEqual({ accepted: true });
  });
  it('coalesces simultaneous retries into one submission', async () => {
    const store = storage();
    let count = 0;
    await Promise.all(
      [1, 2].map((index) =>
        sendFinancialCommand(store, 'alice', command(String(index + 6)), async () => {
          count++;
          return {};
        }),
      ),
    );
    expect(count).toBe(1);
  });
});
