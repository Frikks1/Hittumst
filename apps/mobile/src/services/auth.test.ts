import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ retain: vi.fn(), available: vi.fn(), apple: vi.fn(), digest: vi.fn(), idToken: vi.fn(), signOut: vi.fn(), exchange: vi.fn(), authChange: vi.fn(), getUser: vi.fn(), getSession: vi.fn(), oauth: vi.fn(), browser: vi.fn() }));
vi.mock('./nativeDiagnostics', () => ({ suspendNativeDiagnostics: vi.fn(async () => undefined) }));
vi.mock('./appleAccount', () => ({ retainAppleAuthorization: mocks.retain }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'random-nonce', digestStringAsync: mocks.digest, CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));
vi.mock('expo-apple-authentication', () => ({ isAvailableAsync: mocks.available, signInAsync: mocks.apple, AppleAuthenticationScope: { EMAIL: 1 } }));
vi.mock('expo-auth-session', () => ({ makeRedirectUri: () => 'rummal://auth/callback' }));
vi.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: () => ({ type: 'failed' }), openAuthSessionAsync: mocks.browser }));
vi.mock('./env', () => ({ runtimeEnv: { isDemo: false } }));
vi.mock('./supabase', () => ({ supabase: { auth: { signInWithIdToken: mocks.idToken, signInWithOAuth: mocks.oauth, signOut: mocks.signOut, exchangeCodeForSession: mocks.exchange, onAuthStateChange: mocks.authChange, getUser: mocks.getUser, getSession: mocks.getSession } } }));
import { DemoAuthService, SupabaseAuthService } from './auth';
beforeEach(() => { vi.clearAllMocks(); mocks.retain.mockReset(); mocks.signOut.mockResolvedValue({ error: null }); });
describe('authentication service', () => {
  it('completes Facebook through the existing PKCE callback and requests only email', async () => {
    mocks.oauth.mockResolvedValue({ data: { url: 'https://facebook.test/authorize' }, error: null });
    mocks.browser.mockResolvedValue({ type: 'success', url: 'rummal://auth/callback?code=facebook-pkce' });
    mocks.exchange.mockResolvedValue({ data: { user: { id: 'facebook-member' } }, error: null });
    await expect(new SupabaseAuthService().signInWithProvider('facebook')).resolves.toEqual({ id: 'facebook-member', email: null });
    expect(mocks.oauth).toHaveBeenCalledWith({ provider: 'facebook', options: { redirectTo: 'rummal://auth/callback', skipBrowserRedirect: true, scopes: 'email' } });
    expect(mocks.exchange).toHaveBeenCalledWith('facebook-pkce');
  });
  it('does not exchange a Facebook code after the user signs out during OAuth', async () => {
    const service = new SupabaseAuthService();
    mocks.oauth.mockResolvedValue({ data: { url: 'https://facebook.test/authorize' }, error: null });
    mocks.browser.mockImplementation(async () => { await service.signOut(); return { type: 'success', url: 'rummal://auth/callback?code=cancelled-facebook' }; });
    await expect(service.signInWithProvider('facebook')).rejects.toThrow('authentication_cancelled');
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it.each([['late-facebook-member', true], ['newer-account', false]] as const)('cleans up a cancelled PKCE session only when it belongs to that attempt (%s)', async (currentId, shouldClear) => {
    const service = new SupabaseAuthService();
    mocks.oauth.mockResolvedValue({ data: { url: 'https://facebook.test/authorize' }, error: null });
    mocks.browser.mockResolvedValue({ type: 'success', url: `rummal://auth/callback?code=late-facebook-${currentId}` });
    mocks.exchange.mockImplementation(async () => {
      await service.signOut();
      return { data: { user: { id: 'late-facebook-member' } }, error: null };
    });
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: currentId } } }, error: null });
    await expect(service.signInWithProvider('facebook')).rejects.toThrow('authentication_cancelled');
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'global' });
    if (shouldClear) expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    else expect(mocks.signOut).not.toHaveBeenCalledWith({ scope: 'local' });
  });
  it('binds the Apple identity token to a fresh hashed nonce', async () => {
    mocks.available.mockResolvedValue(true); mocks.digest.mockResolvedValue('hashed-nonce');
    mocks.apple.mockResolvedValue({ identityToken: 'apple-token', authorizationCode: 'apple-code' });
    mocks.idToken.mockResolvedValue({ data: { user: { id: 'user', email: 'member@test.is' } }, error: null });
    await expect(new SupabaseAuthService().signInWithProvider('apple')).resolves.toEqual({ id: 'user', email: 'member@test.is' });
    expect(mocks.apple).toHaveBeenCalledWith({ requestedScopes: [1], nonce: 'hashed-nonce' });
    expect(mocks.retain).toHaveBeenCalledWith('apple-code', 'user');
    expect(mocks.idToken).toHaveBeenCalledWith({ provider: 'apple', token: 'apple-token', nonce: 'random-nonce' });
  });
  it('propagates demo sign-in and sign-out to the session provider', async () => {
    const service = new DemoAuthService(); const listener = vi.fn(); const unsubscribe = service.onAuthStateChange(listener);
    await service.signOut(); expect(listener).toHaveBeenLastCalledWith(null);
    await service.verifyEmailOtp('member@test.is', '123456'); expect(listener).toHaveBeenLastCalledWith({ id: 'demo-me', email: 'member@test.is' });
    unsubscribe(); await service.signOut(); expect(listener).toHaveBeenCalledTimes(2);
  });
});


describe('native Apple startup custody', () => {
  function setup() {
    let callback!: (_event: string, session: { user: { id: string } } | null) => void;
    mocks.authChange.mockImplementation((listener) => { callback = listener; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    mocks.available.mockResolvedValue(true); mocks.digest.mockResolvedValue('hashed-nonce');
    mocks.apple.mockResolvedValue({ identityToken: 'apple-token', authorizationCode: 'apple-code' });
    mocks.idToken.mockImplementation(async () => {
      callback('SIGNED_IN', { user: { id: 'brand-new-user-with-no-profile' } });
      return { data: { user: { id: 'brand-new-user-with-no-profile' } }, error: null };
    });
    const service = new SupabaseAuthService(); const listener = vi.fn(); service.onAuthStateChange(listener);
    return { service, listener };
  }
  it('does not publish a signed-in user or finish startup before token retention completes', async () => {
    const { service, listener } = setup();
    let finish!: () => void;
    mocks.retain.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const signin = service.signInWithProvider('apple');
    await vi.waitFor(() => expect(mocks.retain).toHaveBeenCalledOnce());
    expect(listener).not.toHaveBeenCalled();
    let restored = false; const startup = service.getUser().then(value => { restored = true; return value; });
    await Promise.resolve(); expect(restored).toBe(false);
    finish();
    await expect(signin).resolves.toEqual({ id: 'brand-new-user-with-no-profile', email: null });
    await expect(startup).resolves.toEqual({ id: 'brand-new-user-with-no-profile', email: null });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ id: 'brand-new-user-with-no-profile', email: null });
  });
  it('publishes no authenticated user and removes the local session if custody fails', async () => {
    const { service, listener } = setup();
    mocks.retain.mockRejectedValue(new Error('apple_provider_unavailable'));
    await expect(service.signInWithProvider('apple')).rejects.toThrow('apple_provider_unavailable');
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(listener).toHaveBeenCalledTimes(1); expect(listener).toHaveBeenCalledWith(null);
  });
});
