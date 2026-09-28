import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';

const issuer = 'https://appleid.apple.com';
const appleKeys = createRemoteJWKSet(new URL(`${issuer}/auth/keys`));
type AppleConfiguration = { team: string; keyId: string; privateKey: string; clientId: string };

export function appleConfiguration(clientId = process.env.APPLE_NATIVE_CLIENT_ID): AppleConfiguration {
  const allowed = [process.env.APPLE_NATIVE_CLIENT_ID, process.env.APPLE_SERVICE_CLIENT_ID].filter(Boolean);
  if (!clientId || !allowed.includes(clientId) || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY)
    throw new Error('apple_provider_unavailable');
  return { team: process.env.APPLE_TEAM_ID, keyId: process.env.APPLE_KEY_ID, privateKey: process.env.APPLE_PRIVATE_KEY.replaceAll('\\n', '\n'), clientId };
}

async function clientSecret(config: AppleConfiguration) {
  return new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: config.keyId })
    .setIssuer(config.team).setSubject(config.clientId).setAudience(issuer)
    .setIssuedAt().setExpirationTime('5m').sign(await importPKCS8(config.privateKey, 'ES256'));
}

/** Ciphertext is bound to account and audience. Tokens never enter logs or exports. */
export function sealAppleToken(token: string, accountId: string, clientId: string, key = process.env.APPLE_TOKEN_ENCRYPTION_KEY) {
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key) || !token || token.length > 16384) throw new Error('apple_vault_unavailable');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), nonce);
  cipher.setAAD(Buffer.from(`${accountId}:${clientId}`));
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function openAppleToken(sealed: string, accountId: string, clientId: string, key = process.env.APPLE_TOKEN_ENCRYPTION_KEY) {
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key)) throw new Error('apple_vault_unavailable');
  const [version, iv, tag, ciphertext, extra] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext || extra) throw new Error('apple_token_invalid');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(`${accountId}:${clientId}`));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

export async function exchangeAppleCode(code: string, subject: string, clientId?: string, redirectUri?: string) {
  const config = appleConfiguration(clientId);
  const fields = new URLSearchParams({ client_id: config.clientId, client_secret: await clientSecret(config), code, grant_type: 'authorization_code' });
  if (redirectUri) fields.set('redirect_uri', redirectUri);
  const response = await fetch(`${issuer}/auth/token`, { method: 'POST', body: fields, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('apple_authorization_failed');
  const result = await response.json();
  if (typeof result.refresh_token !== 'string' || typeof result.id_token !== 'string') throw new Error('apple_authorization_failed');
  const verified = await jwtVerify(result.id_token, appleKeys, { issuer, audience: config.clientId, algorithms: ['RS256'] });
  if (verified.payload.sub !== subject) throw new Error('apple_identity_mismatch');
  return { refreshToken: result.refresh_token as string, clientId: config.clientId };
}

export async function revokeAppleToken(token: string, clientId: string) {
  const config = appleConfiguration(clientId);
  const response = await fetch(`${issuer}/auth/revoke`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ client_id: clientId, client_secret: await clientSecret(config), token, token_type_hint: 'refresh_token' }),
  });
  // Apple returns 200 for already-revoked tokens: crash/retry is safe.
  if (!response.ok) throw new Error('apple_revocation_pending');
}
