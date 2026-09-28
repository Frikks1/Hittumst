import { describe, expect, it, vi } from 'vitest';
import { createOAuthCodeExchange, readOAuthCallbackCode } from './oauthCallback';

describe('OAuth callback validation', () => {
  it('accepts only the expected callback endpoint with one PKCE code', () => {
    expect(readOAuthCallbackCode('rummal://auth/callback?code=one', 'rummal://auth/callback')).toBe('one');
    expect(readOAuthCallbackCode('https://app.test/auth/callback?code=two', 'https://app.test/auth/callback')).toBe('two');
  });
  it.each([
    'evil://auth/callback?code=one', 'rummal://other/callback?code=one',
    'rummal://auth/other?code=one', 'rummal://auth/callback?code=one&code=two',
    'rummal://auth/callback#access_token=secret', 'rummal://auth/callback?error=denied&code=one',
  ])('rejects a malformed or mismatched callback: %s', url => {
    expect(() => readOAuthCallbackCode(url, 'rummal://auth/callback')).toThrow();
  });
  it('exchanges a duplicate deep-link/browser result only once', async () => {
    const exchange = vi.fn(async () => ({ id: 'user' }));
    const callback = createOAuthCodeExchange(exchange);
    const first = callback.complete('code');
    expect(callback.complete('code')).toBe(first);
    await expect(first).resolves.toEqual({ id: 'user' });
    await callback.complete('code');
    expect(exchange).toHaveBeenCalledTimes(1);
    callback.clear();
    await callback.complete('code');
    expect(exchange).toHaveBeenCalledTimes(2);
  });
  it('allows retry after a failed exchange', async () => {
    const exchange = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('user');
    const callback = createOAuthCodeExchange(exchange);
    await expect(callback.complete('code')).rejects.toThrow('offline');
    await expect(callback.complete('code')).resolves.toBe('user');
  });
});
