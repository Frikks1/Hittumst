import { Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import type { TierId } from '@rummal/shared';
import { runtimeEnv } from './env';
import { authService } from './auth';
import { memberRequest } from './memberApi';

export type SubscriptionMode = 'test-store' | 'store';
export type SubscriptionProduct = { tier: TierId; packageId: string; productId: string; price: string };
export type SubscriptionCatalog = { mode: SubscriptionMode; products: SubscriptionProduct[]; purchaseAllowed: boolean; reason?: string };
export type SubscriptionResult = { status: 'cancelled' | 'payment_pending' | 'verification_pending' | 'verified' };
type BillingStatus = { purchaseAllowed: boolean; reason?: string; status?: 'queued' | 'processing' | 'verified' };

export function subscriptionConfiguration() {
  if (runtimeEnv.isDemo || !['ios', 'android'].includes(Platform.OS)) return null;
  const mode = process.env.EXPO_PUBLIC_REVENUECAT_MODE;
  const key = mode === 'test-store' ? process.env.EXPO_PUBLIC_REVENUECAT_SANDBOX_KEY
    : Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  const prefix = mode === 'test-store' ? 'test_' : Platform.OS === 'ios' ? 'appl_' : 'goog_';
  if (!['test-store', 'store'].includes(mode ?? '') || !key?.startsWith(prefix) || key.length <= prefix.length ||
      (mode === 'test-store' && runtimeEnv.appEnvironment === 'production')) return null;
  return { mode: mode as SubscriptionMode, key };
}

function packageIds(): [TierId, string | undefined][] {
  return [['flottari_plebbi', process.env.EXPO_PUBLIC_REVENUECAT_PLUS_PACKAGE],
    ['plebba_kongur', process.env.EXPO_PUBLIC_REVENUECAT_PREMIUM_PACKAGE]];
}
function packages(available: readonly PurchasesPackage[]) {
  const ids = packageIds();
  if (ids[0]?.[1] && ids[0][1] === ids[1]?.[1]) throw new Error('offering_unavailable');
  const mapped = ids.flatMap(([tier, id]) => {
    const item = available.find(candidate => candidate.identifier === id);
    // Monthly grants require an actual monthly auto-renewable store product.
    return item?.product.subscriptionPeriod === 'P1M' && item.product.priceString
      ? [{ tier, item }] : [];
  });
  if (new Set(mapped.map(({ item }) => item.product.identifier)).size !== mapped.length)
    throw new Error('offering_unavailable');
  return mapped;
}

let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(action: () => Promise<T>): Promise<T> {
  const task = queue.then(action, action);
  queue = task.catch(() => undefined);
  return task;
}
async function assertAccount(accountId: string) {
  if (!accountId || (await authService.getUser())?.id !== accountId) throw new Error('authentication_required');
}
async function sdk(accountId: string) {
  await assertAccount(accountId);
  const config = subscriptionConfiguration();
  if (!config) throw new Error('native_store_unavailable');
  const { default: Purchases } = await import('react-native-purchases');
  if (!(await Purchases.isConfigured())) Purchases.configure({ apiKey: config.key, appUserID: accountId });
  else if (await Purchases.getAppUserID() !== accountId) await Purchases.logIn(accountId);
  await assertAccount(accountId);
  return Purchases;
}
function parseBillingStatus(value: unknown, needsStatus = false): BillingStatus {
  if (!value || typeof value !== 'object') throw new Error('billing_unavailable');
  const data = value as Record<string, unknown>;
  if (typeof data.purchaseAllowed !== 'boolean' || (needsStatus && !['queued', 'processing', 'verified'].includes(String(data.status))))
    throw new Error('billing_unavailable');
  return { purchaseAllowed: data.purchaseAllowed, ...(typeof data.reason === 'string' ? { reason: data.reason } : {}),
    ...(needsStatus ? { status: data.status as BillingStatus['status'] } : {}) };
}
async function sync(accountId: string): Promise<SubscriptionResult> {
  await assertAccount(accountId);
  try {
    const result = parseBillingStatus(await memberRequest('/api/billing/sync', {}, accountId), true);
    await assertAccount(accountId);
    return { status: result.status === 'verified' ? 'verified' : 'verification_pending' };
  } catch (error) {
    await assertAccount(accountId);
    // A completed store transaction is never presented as a failed purchase that should be bought again.
    if (error instanceof Error && error.message === 'authentication_required') throw error;
    return { status: 'verification_pending' };
  }
}
export function syncSubscriptions(accountId: string) {
  return serialize(() => sync(accountId));
}
export function loadSubscriptionCatalog(accountId: string): Promise<SubscriptionCatalog> {
  return serialize(async () => {
    const purchases = await sdk(accountId);
    const [offerings, gate] = await Promise.all([
      purchases.getOfferings(), memberRequest('/api/billing/sync', undefined, accountId).then(value => parseBillingStatus(value)),
    ]);
    await assertAccount(accountId);
    return { mode: subscriptionConfiguration()!.mode, ...gate, products: packages(offerings.current?.availablePackages ?? []).map(({ tier, item }) => ({
      tier, packageId: item.identifier, productId: item.product.identifier, price: item.product.priceString,
    })) };
  });
}
export function purchaseSubscription(accountId: string, tier: TierId): Promise<SubscriptionResult> {
  return serialize(async () => {
    const purchases = await sdk(accountId);
    const gate = parseBillingStatus(await memberRequest('/api/billing/sync', undefined, accountId));
    if (!gate.purchaseAllowed) throw new Error('purchases_unavailable');
    const offerings = await purchases.getOfferings();
    const available = packages(offerings.current?.availablePackages ?? []);
    const selected = available.find(candidate => candidate.tier === tier)?.item;
    if (!selected) throw new Error('offering_unavailable');
    const info = await purchases.getCustomerInfo();
    const active = info.activeSubscriptions;
    if (active.includes(selected.product.identifier)) return sync(accountId);
    // An unknown/other-store active product must be managed in its original store, never sold a duplicate.
    if (active.length > 1 || active.some(id => !available.some(candidate => candidate.item.product.identifier === id)))
      throw new Error('manage_existing_subscription');
    await assertAccount(accountId);
    try {
      const change = Platform.OS === 'android' && active[0] ? {
        oldProductIdentifier: active[0], replacementMode: purchases.STORE_REPLACEMENT_MODE.DEFERRED,
      } : null;
      await purchases.purchasePackage(selected, null, change);
    } catch (error) {
      await assertAccount(accountId);
      const failure = error as { code?: string; userCancelled?: boolean };
      if (failure.userCancelled || failure.code === purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return { status: 'cancelled' };
      if (failure.code === purchases.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return { status: 'payment_pending' };
      throw error;
    }
    // CustomerInfo never grants app entitlements. Only the backend verifies and writes the subscription.
    return sync(accountId);
  });
}
export function restoreSubscriptions(accountId: string): Promise<SubscriptionResult> {
  return serialize(async () => {
    await (await sdk(accountId)).restorePurchases();
    return sync(accountId);
  });
}
export function manageSubscriptions(accountId: string) {
  return serialize(async () => {
    await (await sdk(accountId)).showManageSubscriptions();
    return sync(accountId);
  });
}
/** Call after sign-out. Serialized cleanup cannot race a purchase or a subsequent account login. */
export function clearSubscriptionIdentity() {
  return serialize(async () => {
    if (Platform.OS === 'web' || runtimeEnv.isDemo || await authService.getUser()) return;
    const { default: Purchases } = await import('react-native-purchases');
    if (await Purchases.isConfigured() && !(await Purchases.isAnonymous())) await Purchases.logOut();
  });
}
