import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ native: { configured: true, dsn: 'https://' + 'a'.repeat(32) + '@o1.ingest.de.sentry.io/1', release: 'r1', environment: 'staging', setSession: vi.fn() },
  platform: { OS: 'ios' }, env: { isDemo: false, configurationIssue: null as string | null, appEnvironment: 'staging' }, getSession: vi.fn(), claims: vi.fn(), proof: vi.fn(), change: vi.fn(), appState: vi.fn(), digest: vi.fn() }));
vi.mock('react-native', () => ({ NativeModules: { PrivateNativeDiagnostics: mock.native }, Platform: mock.platform, AppState: { addEventListener: mock.appState } }));
vi.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: mock.digest }));
vi.mock('./env', () => ({ runtimeEnv: mock.env }));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: mock.getSession, getClaims: mock.claims, onAuthStateChange: mock.change }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.proof }) }) }) } }));
const sessionA = '11111111-1111-4111-8111-111111111111';
const sessionB = '22222222-2222-4222-8222-222222222222';
const token = (id: string) => 'header.' + btoa(JSON.stringify({ session_id: id })) + '.signature';
const session = (id = sessionA, seconds = 3600) => ({ access_token: token(id), expires_at: Date.now() / 1000 + seconds, user: { id: id === sessionA ? 'member-a' : 'member-b' } });
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  mock.platform.OS = 'ios'; mock.env.isDemo = false; mock.env.configurationIssue = null; mock.env.appEnvironment = 'staging'; mock.native.configured = true;
  mock.native.setSession.mockReset().mockResolvedValue(undefined);
  mock.getSession.mockReset().mockResolvedValue({ data: { session: session() }, error: null });
  mock.claims.mockReset().mockResolvedValue({ data: { claims: { session_id: sessionA } }, error: null });
  mock.proof.mockReset().mockResolvedValue({ data: { id: 'member-a' }, error: null });
  mock.digest.mockResolvedValue('a'.repeat(64));
  vi.stubEnv('EXPO_PUBLIC_SENTRY_PRIVACY_VERIFIED', 'true'); vi.stubEnv('EXPO_PUBLIC_SENTRY_NATIVE_PRIVACY_VERIFIED', 'true');
  vi.stubEnv('EXPO_PUBLIC_SENTRY_DSN', mock.native.dsn); vi.stubEnv('EXPO_PUBLIC_RELEASE_ID', 'r1');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('native diagnostic authorization', () => {
  it.each(['web', 'demo', 'unverified', 'different-native-release'])('makes no provider calls for %s', async mode => {
    if (mode === 'web') mock.platform.OS = 'web';
    if (mode === 'demo') mock.env.isDemo = true;
    if (mode === 'unverified') vi.stubEnv('EXPO_PUBLIC_SENTRY_NATIVE_PRIVACY_VERIFIED', 'false');
    if (mode === 'different-native-release') vi.stubEnv('EXPO_PUBLIC_RELEASE_ID', 'other');
    const diagnostics = await import('./nativeDiagnostics'); diagnostics.initializeNativeDiagnostics();
    expect(mock.getSession).not.toHaveBeenCalled(); expect(mock.native.setSession).not.toHaveBeenCalled();
  });
  it('requires live database proof and gives only a local session hash with a JWT-bounded lease', async () => {
    mock.getSession.mockResolvedValue({ data: { session: session(sessionA, 35) }, error: null });
    await (await import('./nativeDiagnostics')).validateNativeDiagnosticsSession();
    expect(mock.proof).toHaveBeenCalledOnce();
    expect(mock.native.setSession).toHaveBeenLastCalledWith('a'.repeat(64), Date.now() + 35_000);
    expect(JSON.stringify(mock.native.setSession.mock.calls)).not.toContain('member-a');
  });
  it.each(['revoked', 'expired', 'missing'])('closes native upload on %s sessions', async failure => {
    if (failure === 'revoked') mock.proof.mockResolvedValue({ data: null, error: { message: 'account_unavailable' } });
    if (failure === 'expired') mock.getSession.mockResolvedValue({ data: { session: session(sessionA, -1) }, error: null });
    if (failure === 'missing') mock.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await (await import('./nativeDiagnostics')).validateNativeDiagnosticsSession();
    expect(mock.native.setSession).toHaveBeenLastCalledWith(null, 0);
    expect(mock.native.setSession.mock.calls.some(call => call[0] !== null)).toBe(false);
  });
  it('does not reopen a suspended session when delayed live proof completes', async () => {
    let finish!: (value: unknown) => void;
    mock.proof.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const diagnostics = await import('./nativeDiagnostics'); const validation = diagnostics.validateNativeDiagnosticsSession();
    await vi.waitFor(() => expect(mock.proof).toHaveBeenCalled());
    await diagnostics.suspendNativeDiagnostics(); finish({ data: { id: 'member-a' }, error: null }); await validation;
    expect(mock.native.setSession.mock.calls).toEqual([[null, 0]]);
  });
  it('keeps suspension before initial observation closed for the existing session', async () => {
    const diagnostics = await import('./nativeDiagnostics');
    await diagnostics.suspendNativeDiagnostics(); await diagnostics.validateNativeDiagnosticsSession();
    expect(mock.native.setSession.mock.calls).toEqual([[null, 0]]);
  });
  it('purges the old lease immediately on account change before new-account proof', async () => {
    let listener!: (event: string, value: ReturnType<typeof session>) => void;
    mock.change.mockImplementation(callback => { listener = callback; });
    const diagnostics = await import('./nativeDiagnostics'); diagnostics.initializeNativeDiagnostics();
    await vi.waitFor(() => expect(mock.native.setSession).toHaveBeenCalledWith('a'.repeat(64), expect.any(Number)));
    mock.proof.mockImplementation(() => new Promise(() => undefined));
    mock.getSession.mockResolvedValue({ data: { session: session(sessionB) }, error: null });
    mock.claims.mockResolvedValue({ data: { claims: { session_id: sessionB } }, error: null });
    listener('SIGNED_IN', session(sessionB));
    expect(mock.native.setSession).toHaveBeenLastCalledWith(null, 0);
  });
  it('repeated SIGNED_IN for the same session cannot undo explicit suspension', async () => {
    let listener!: (event: string, value: ReturnType<typeof session>) => void;
    mock.change.mockImplementation(callback => { listener = callback; });
    const diagnostics = await import('./nativeDiagnostics'); diagnostics.initializeNativeDiagnostics();
    await vi.waitFor(() => expect(mock.native.setSession).toHaveBeenCalledWith('a'.repeat(64), expect.any(Number)));
    await diagnostics.suspendNativeDiagnostics(); mock.native.setSession.mockClear();
    listener('SIGNED_IN', session()); await Promise.resolve(); await vi.advanceTimersByTimeAsync(1);
    expect(mock.native.setSession.mock.calls.some(call => call[0] !== null)).toBe(false);
  });
  it('does not trap lifecycle when the native bridge throws synchronously', async () => {
    mock.native.setSession.mockImplementation(() => { throw new Error('bridge unavailable'); });
    await expect((await import('./nativeDiagnostics')).suspendNativeDiagnostics()).resolves.toBeUndefined();
  });
});
