import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const cryptoMocks = vi.hoisted(() => ({ verify: vi.fn(), sign: vi.fn(async () => 'synthetic-client-secret') }));
vi.mock('jose', () => ({
  createRemoteJWKSet: () => ({}), importPKCS8: vi.fn(async () => ({})), jwtVerify: cryptoMocks.verify,
  SignJWT: class {
    setProtectedHeader() { return this; } setIssuer() { return this; } setSubject() { return this; }
    setAudience() { return this; } setIssuedAt() { return this; } setExpirationTime() { return this; }
    sign = cryptoMocks.sign;
  },
}));
import { exchangeAppleCode, revokeAppleToken } from './apple-tokens';
describe('Apple provider exchange and revocation', () => {
  beforeEach(() => {
    vi.stubEnv('APPLE_NATIVE_CLIENT_ID','is.rummal.app');
    vi.stubEnv('APPLE_TEAM_ID','test-team'); vi.stubEnv('APPLE_KEY_ID','test-key');
    vi.stubEnv('APPLE_PRIVATE_KEY','synthetic-pem');
    cryptoMocks.verify.mockResolvedValue({ payload: { sub: 'apple-member' } });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it('checks issuer, audience and provider subject before retaining a refresh token', async () => {
    const fetcher = vi.fn(async () => Response.json({ refresh_token: 'test-refresh', id_token: 'test-jwt' }));
    vi.stubGlobal('fetch', fetcher);
    expect(await exchangeAppleCode('test-code','apple-member')).toEqual({ refreshToken: 'test-refresh', clientId: 'is.rummal.app' });
    expect(cryptoMocks.verify).toHaveBeenCalledWith('test-jwt', expect.anything(), { issuer: 'https://appleid.apple.com', audience: 'is.rummal.app', algorithms: ['RS256'] });
    cryptoMocks.verify.mockResolvedValueOnce({ payload: { sub: 'other-member' } });
    await expect(exchangeAppleCode('code','apple-member')).rejects.toThrow('apple_identity_mismatch');
    await expect(exchangeAppleCode('code','apple-member','attacker-client')).rejects.toThrow('apple_provider_unavailable');
  });
  it('does not treat failed verification or failed revocation as success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null,{status:503})));
    await expect(exchangeAppleCode('code','apple-member')).rejects.toThrow('apple_authorization_failed');
    await expect(revokeAppleToken('refresh','is.rummal.app')).rejects.toThrow('apple_revocation_pending');
  });
  it('uses the official revocation endpoint and refresh-token hint, without redirects', async () => {
    const fetcher = vi.fn(async () => new Response(null,{status:200})); vi.stubGlobal('fetch',fetcher);
    await revokeAppleToken('refresh','is.rummal.app');
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://appleid.apple.com/auth/revoke');
    expect(options.redirect).toBe('error');
    expect((options.body as URLSearchParams).get('token_type_hint')).toBe('refresh_token');
    expect((options.body as URLSearchParams).get('token')).toBe('refresh');
  });
});
