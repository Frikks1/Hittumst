// Currency units are explicit at every provider boundary. Never infer them from a currency name.
export type ProviderAmount = { currency: 'ISK'; value: number; unitsPerIsk: 1 | 100 };
export function toProviderAmount(isk: number, unitsPerIsk: 1 | 100): ProviderAmount {
  if (!Number.isSafeInteger(isk) || isk < 0 || !Number.isSafeInteger(isk * unitsPerIsk))
    throw new Error('invalid_currency_amount');
  return { currency: 'ISK', value: isk * unitsPerIsk, unitsPerIsk };
}
export function fromProviderAmount(amount: ProviderAmount): number {
  if (
    amount.currency !== 'ISK' ||
    !Number.isSafeInteger(amount.value) ||
    amount.value < 0 ||
    ![1, 100].includes(amount.unitsPerIsk) ||
    amount.value % amount.unitsPerIsk
  )
    throw new Error('invalid_provider_amount');
  return amount.value / amount.unitsPerIsk;
}
export interface PayoutProvider {
  readonly environment: 'sandbox';
  quote(amountIsk: number): Promise<{ feeIsk: number; minimumIsk: number; maximumIsk: number }>;
  submit(
    idempotencyKey: string,
    amount: ProviderAmount,
  ): Promise<{ status: 'paid' | 'failed' | 'unknown'; reference: string }>;
}
export interface FulfilmentProvider {
  readonly environment: 'sandbox';
  fulfil(
    idempotencyKey: string,
    sku: string,
  ): Promise<{ status: 'fulfilled' | 'refunded'; receipt: string }>;
}
export class SandboxProvider implements PayoutProvider, FulfilmentProvider {
  readonly environment = 'sandbox' as const;
  async quote() {
    return { feeIsk: 0, minimumIsk: 1, maximumIsk: 100_000_000 };
  }
  async submit(id: string, amount: ProviderAmount) {
    fromProviderAmount(amount);
    return { status: 'paid' as const, reference: `sandbox:${id}` };
  }
  async fulfil(id: string, sku: string) {
    if (sku !== 'sandbox-voucher') throw new Error('supplier_unavailable');
    return { status: 'fulfilled' as const, receipt: `sandbox:${id}` };
  }
}
