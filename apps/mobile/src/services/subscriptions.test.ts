import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  platform: { OS: 'ios' }, env: { appEnvironment: 'staging', isDemo: false }, user: vi.fn(), request: vi.fn(),
  purchases: { isConfigured: vi.fn(), configure: vi.fn(), getAppUserID: vi.fn(), logIn: vi.fn(), getOfferings: vi.fn(),
    getCustomerInfo: vi.fn(), purchasePackage: vi.fn(), restorePurchases: vi.fn(), showManageSubscriptions: vi.fn(),
    isAnonymous: vi.fn(), logOut: vi.fn(), STORE_REPLACEMENT_MODE: { DEFERRED: 'DEFERRED' },
    PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: '1', PAYMENT_PENDING_ERROR: '20' } },
}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('./env', () => ({ runtimeEnv: mocks.env }));
vi.mock('./auth', () => ({ authService: { getUser: mocks.user } }));
vi.mock('./memberApi', () => ({ memberRequest: mocks.request }));
vi.mock('react-native-purchases', () => ({ default: mocks.purchases }));
const plus = { identifier: 'plus-monthly', product: { identifier: 'plus:monthly', subscriptionPeriod: 'P1M', priceString: '1.190 kr.' } };
const premium = { identifier: 'premium-monthly', product: { identifier: 'premium:monthly', subscriptionPeriod: 'P1M', priceString: '2.390 kr.' } };
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  mocks.platform.OS = 'ios'; mocks.env.appEnvironment = 'staging'; mocks.env.isDemo = false;
  vi.stubEnv('EXPO_PUBLIC_REVENUECAT_MODE', 'store');
  vi.stubEnv('EXPO_PUBLIC_REVENUECAT_IOS_KEY', 'appl_public');
  vi.stubEnv('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', 'goog_public');
  vi.stubEnv('EXPO_PUBLIC_REVENUECAT_SANDBOX_KEY', 'test_public');
  vi.stubEnv('EXPO_PUBLIC_REVENUECAT_PLUS_PACKAGE', 'plus-monthly');
  vi.stubEnv('EXPO_PUBLIC_REVENUECAT_PREMIUM_PACKAGE', 'premium-monthly');
  mocks.user.mockResolvedValue({ id: 'account-a' });
  mocks.request.mockImplementation(async (_path: string, body?: unknown) => body === undefined ? { purchaseAllowed: true } : { status: 'verified', purchaseAllowed: true });
  mocks.purchases.isConfigured.mockResolvedValue(false);
  mocks.purchases.getAppUserID.mockResolvedValue('account-a');
  mocks.purchases.getOfferings.mockResolvedValue({ current: { availablePackages: [plus, premium] } });
  mocks.purchases.getCustomerInfo.mockResolvedValue({ activeSubscriptions: [] });
  mocks.purchases.purchasePackage.mockResolvedValue({ customerInfo: { entitlements: { active: { invented: true } } } });
  mocks.purchases.restorePurchases.mockResolvedValue({}); mocks.purchases.showManageSubscriptions.mockResolvedValue(undefined);
});

describe('native subscription trust boundary', () => {
  it.each(['ios', 'android'])('uses the correct platform public store key for %s', async platform => {
    mocks.platform.OS = platform;
    const { loadSubscriptionCatalog } = await import('./subscriptions');
    const catalog = await loadSubscriptionCatalog('account-a');
    expect(mocks.purchases.configure).toHaveBeenCalledWith({ apiKey: platform === 'ios' ? 'appl_public' : 'goog_public', appUserID: 'account-a' });
    expect(catalog.products[0]).toEqual({ tier: 'flottari_plebbi', packageId: 'plus-monthly', productId: 'plus:monthly', price: '1.190 kr.' });
    expect(mocks.request).toHaveBeenCalledWith('/api/billing/sync', undefined, 'account-a');
  });
  it('rejects test-store in production and accepts it only outside production', async () => {
    vi.stubEnv('EXPO_PUBLIC_REVENUECAT_MODE', 'test-store'); mocks.env.appEnvironment = 'production';
    const { subscriptionConfiguration } = await import('./subscriptions');
    expect(subscriptionConfiguration()).toBeNull();
    mocks.env.appEnvironment = 'staging'; expect(subscriptionConfiguration()?.key).toBe('test_public');
  });
  it.each(['web', 'windows'])('does not configure unsupported %s clients', async platform => {
    mocks.platform.OS = platform;
    const { loadSubscriptionCatalog } = await import('./subscriptions');
    await expect(loadSubscriptionCatalog('account-a')).rejects.toThrow('native_store_unavailable');
    expect(mocks.purchases.configure).not.toHaveBeenCalled();
  });
  it('rejects a test key used as an iOS production key', async () => {
    vi.stubEnv('EXPO_PUBLIC_REVENUECAT_IOS_KEY', 'test_wrong');
    expect((await import('./subscriptions')).subscriptionConfiguration()).toBeNull();
  });
  it('does not configure the SDK for a departed account', async () => {
    mocks.user.mockResolvedValue({ id: 'account-b' });
    await expect((await import('./subscriptions')).loadSubscriptionCatalog('account-a')).rejects.toThrow('authentication_required');
    expect(mocks.purchases.configure).not.toHaveBeenCalled();
  });
  it('switches SDK identity before store operations and does not configure twice', async () => {
    mocks.purchases.isConfigured.mockResolvedValue(true); mocks.purchases.getAppUserID.mockResolvedValue('old-account');
    await (await import('./subscriptions')).loadSubscriptionCatalog('account-a');
    expect(mocks.purchases.logIn).toHaveBeenCalledWith('account-a'); expect(mocks.purchases.configure).not.toHaveBeenCalled();
  });
  it('hides annual and missing products instead of inventing monthly prices', async () => {
    mocks.purchases.getOfferings.mockResolvedValue({ current: { availablePackages: [{ ...plus, product: { ...plus.product, subscriptionPeriod: 'P1Y' } }] } });
    expect((await (await import('./subscriptions')).loadSubscriptionCatalog('account-a')).products).toEqual([]);
  });
  it('rejects ambiguous mappings that would sell one product as both tiers', async () => {
    vi.stubEnv('EXPO_PUBLIC_REVENUECAT_PREMIUM_PACKAGE', 'plus-monthly');
    await expect((await import('./subscriptions')).purchaseSubscription('account-a', 'flottari_plebbi')).rejects.toThrow('offering_unavailable');
    expect(mocks.purchases.purchasePackage).not.toHaveBeenCalled();
  });
  it('rejects different packages that point both tiers at the same store product', async () => {
    mocks.purchases.getOfferings.mockResolvedValue({ current: { availablePackages: [plus, { ...premium, product: plus.product }] } });
    const service = await import('./subscriptions');
    await expect(service.loadSubscriptionCatalog('account-a')).rejects.toThrow('offering_unavailable');
    await expect(service.purchaseSubscription('account-a', 'plebba_kongur')).rejects.toThrow('offering_unavailable');
    expect(mocks.purchases.purchasePackage).not.toHaveBeenCalled();
  });
  it('rechecks the server sales gate immediately before a purchase', async () => {
    const service = await import('./subscriptions');
    await service.loadSubscriptionCatalog('account-a');
    mocks.request.mockResolvedValue({ purchaseAllowed: false, reason: 'financial_provider_approval_required' });
    await expect(service.purchaseSubscription('account-a', 'flottari_plebbi')).rejects.toThrow('purchases_unavailable');
    expect(mocks.purchases.purchasePackage).not.toHaveBeenCalled();
  });
  it('fails closed on malformed gate responses', async () => {
    mocks.request.mockResolvedValue({ purchaseAllowed: 'true' });
    await expect((await import('./subscriptions')).purchaseSubscription('account-a', 'flottari_plebbi')).rejects.toThrow('billing_unavailable');
    expect(mocks.purchases.purchasePackage).not.toHaveBeenCalled();
  });
  it('cancellation is silent and does not claim or sync a purchase', async () => {
    mocks.purchases.purchasePackage.mockRejectedValue({ code: '1', userCancelled: true });
    expect(await (await import('./subscriptions')).purchaseSubscription('account-a', 'flottari_plebbi')).toEqual({ status: 'cancelled' });
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it('returns payment pending distinctly without granting benefits', async () => {
    mocks.purchases.purchasePackage.mockRejectedValue({ code: '20' });
    expect(await (await import('./subscriptions')).purchaseSubscription('account-a', 'flottari_plebbi')).toEqual({ status: 'payment_pending' });
  });
  it('a successful store transaction triggers account-bound server verification', async () => {
    expect(await (await import('./subscriptions')).purchaseSubscription('account-a', 'flottari_plebbi')).toEqual({ status: 'verified' });
    expect(mocks.request).toHaveBeenLastCalledWith('/api/billing/sync', {}, 'account-a');
    expect(mocks.purchases.purchasePackage).toHaveBeenCalledWith(plus, null, null);
  });
  it.each(['queued', 'processing'])('retains pending verification for a %s server job', async status => {
    mocks.request.mockImplementation(async (_path, body) => body === undefined ? { purchaseAllowed: true } : { status, purchaseAllowed: true });
    expect(await (await import('./subscriptions')).purchaseSubscription('account-a', 'flottari_plebbi')).toEqual({ status: 'verification_pending' });
  });
  it('an offline server after successful payment does not tell the member to buy again', async () => {
    mocks.request.mockImplementation(async (_path, body) => { if (body !== undefined) throw new Error('network'); return { purchaseAllowed: true }; });
    expect(await (await import('./subscriptions')).purchaseSubscription('account-a', 'flottari_plebbi')).toEqual({ status: 'verification_pending' });
  });
  it('does not sync a completed purchase into a newly signed-in account', async () => {
    mocks.purchases.purchasePackage.mockImplementation(async () => { mocks.user.mockResolvedValue({ id: 'account-b' }); return {}; });
    await expect((await import('./subscriptions')).purchaseSubscription('account-a', 'flottari_plebbi')).rejects.toThrow('authentication_required');
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it('restores even while new production sales are disabled', async () => {
    mocks.request.mockResolvedValue({ status: 'verified', purchaseAllowed: false });
    expect(await (await import('./subscriptions')).restoreSubscriptions('account-a')).toEqual({ status: 'verified' });
    expect(mocks.purchases.restorePurchases).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledWith('/api/billing/sync', {}, 'account-a');
  });
  it('opens store management and then refreshes authoritative server state', async () => {
    await (await import('./subscriptions')).manageSubscriptions('account-a');
    expect(mocks.purchases.showManageSubscriptions).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledWith('/api/billing/sync', {}, 'account-a');
  });
  it('reconciles an already-owned product without another checkout', async () => {
    mocks.purchases.getCustomerInfo.mockResolvedValue({ activeSubscriptions: ['plus:monthly'] });
    await (await import('./subscriptions')).purchaseSubscription('account-a', 'flottari_plebbi');
    expect(mocks.purchases.purchasePackage).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenLastCalledWith('/api/billing/sync', {}, 'account-a');
  });
  it('uses a deferred Android replacement instead of a second subscription', async () => {
    mocks.platform.OS = 'android'; mocks.purchases.getCustomerInfo.mockResolvedValue({ activeSubscriptions: ['plus:monthly'] });
    await (await import('./subscriptions')).purchaseSubscription('account-a', 'plebba_kongur');
    expect(mocks.purchases.purchasePackage).toHaveBeenCalledWith(premium, null, { oldProductIdentifier: 'plus:monthly', replacementMode: 'DEFERRED' });
  });
  it('prevents duplicate subscriptions when the existing product belongs to another offering/store', async () => {
    mocks.purchases.getCustomerInfo.mockResolvedValue({ activeSubscriptions: ['legacy-or-other-store'] });
    await expect((await import('./subscriptions')).purchaseSubscription('account-a', 'plebba_kongur')).rejects.toThrow('manage_existing_subscription');
    expect(mocks.purchases.purchasePackage).not.toHaveBeenCalled();
  });
  it('serializes purchases and does not switch the RevenueCat identity during checkout', async () => {
    let finish!: () => void;
    mocks.purchases.purchasePackage.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const service = await import('./subscriptions');
    const purchase = service.purchaseSubscription('account-a', 'flottari_plebbi');
    await vi.waitFor(() => expect(mocks.purchases.purchasePackage).toHaveBeenCalledOnce());
    const catalog = service.loadSubscriptionCatalog('account-b');
    expect(mocks.purchases.logIn).not.toHaveBeenCalled();
    finish(); await purchase;
    await expect(catalog).rejects.toThrow('authentication_required');
  });
  it('clears the cached identified customer on logout, but leaves a new login alone', async () => {
    mocks.purchases.isConfigured.mockResolvedValue(true); mocks.purchases.isAnonymous.mockResolvedValue(false);
    const service = await import('./subscriptions');
    await service.clearSubscriptionIdentity(); expect(mocks.purchases.logOut).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue(null);
    await service.clearSubscriptionIdentity(); expect(mocks.purchases.logOut).toHaveBeenCalledOnce();
  });
});
