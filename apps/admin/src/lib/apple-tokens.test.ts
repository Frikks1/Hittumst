import { describe, expect, it } from 'vitest';
import { openAppleToken, sealAppleToken } from './apple-tokens';
const key = 'ab'.repeat(32);
describe('Apple token custody', () => {
  it('uses unique nonces and binds ciphertext to account and audience', () => {
    const first = sealAppleToken('synthetic-refresh-token', 'account-a', 'is.rummal.app', key);
    expect(first).not.toBe(sealAppleToken('synthetic-refresh-token', 'account-a', 'is.rummal.app', key));
    expect(first).not.toContain('synthetic-refresh-token');
    expect(openAppleToken(first, 'account-a', 'is.rummal.app', key)).toBe('synthetic-refresh-token');
    expect(() => openAppleToken(first, 'account-b', 'is.rummal.app', key)).toThrow();
    expect(() => openAppleToken(first, 'account-a', 'another.client', key)).toThrow();
    expect(() => openAppleToken(first, 'account-a', 'is.rummal.app', 'cd'.repeat(32))).toThrow();
  });
  it('fails closed for missing keys, malformed envelopes and modified ciphertext', () => {
    expect(() => sealAppleToken('token', 'a', 'b', 'short')).toThrow();
    expect(() => openAppleToken('plaintext', 'a', 'b', key)).toThrow();
    const envelope = sealAppleToken('token', 'a', 'b', key).split('.');
    envelope[3] = Buffer.from('changed').toString('base64url');
    expect(() => openAppleToken(envelope.join('.'), 'a', 'b', key)).toThrow();
  });
});
