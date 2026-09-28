import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { appleConfiguration, exchangeAppleCode, sealAppleToken, revokeAppleToken } from './apple-tokens';
export type AppleReturnMode = 'native'|'web';
export class AppleReturnError extends Error {
  constructor(readonly returnMode:AppleReturnMode) { super('apple_authorization_failed'); }
}
export function appleWebsiteOrigin() {
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? '');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.port || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('apple_provider_unavailable');
  return origin.origin;
}
function callbackUrl() { return appleWebsiteOrigin()+'/api/account/apple/callback'; }
export async function startAppleReauthorization(db: SupabaseClient, accountId: string, subject: string, sessionId:string, returnMode:AppleReturnMode='native') {
  const config = appleConfiguration(process.env.APPLE_SERVICE_CLIENT_ID);
  const redirectUri=callbackUrl();
  const state = randomBytes(32).toString('base64url');
  const result = await db.rpc('apple_authorization_start_bound', { account_id: accountId, apple_subject: subject, state_hash: createHash('sha256').update(state).digest('hex'),session_id:sessionId,return_mode:returnMode });
  if (result.error) throw new Error('apple_authorization_unavailable');
  const url = new URL('https://appleid.apple.com/auth/authorize');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, response_type: 'code', response_mode: 'form_post', state }).toString();
  return url.toString();
}
export async function finishAppleReauthorization(db: SupabaseClient, state: string, code: string):Promise<AppleReturnMode> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new Error('apple_authorization_invalid');
  const claimed = await db.rpc('apple_authorization_take', { state_hash: createHash('sha256').update(state).digest('hex') });
  if (claimed.error || !claimed.data) throw new Error('apple_authorization_expired');
  const { accountId, subject, sessionId } = claimed.data as { accountId: string; subject: string; sessionId:string };
  const returnMode:AppleReturnMode=claimed.data.returnMode==='web'?'web':'native';
  try {
    if (!code || code.length>4096) throw new Error('apple_authorization_invalid');
    const credentials = await exchangeAppleCode(code, subject, process.env.APPLE_SERVICE_CLIENT_ID, callbackUrl());
    await retainAppleCredentials(db,accountId,subject,sessionId,credentials);

    return returnMode;
  } catch { throw new AppleReturnError(returnMode); }
}


export async function retainAppleCredentials(db:SupabaseClient,accountId:string,subject:string,sessionId:string,credentials:{refreshToken:string;clientId:string}) {
  try {
    const saved=await db.rpc('apple_token_store_authorized',{account_id:accountId,apple_subject:subject,client_id:credentials.clientId,
      sealed_token:sealAppleToken(credentials.refreshToken,accountId,credentials.clientId),session_id:sessionId});
    if(saved.error)throw Error('apple_authorization_unavailable');
  } catch {
    // If authorization changed while exchanging the one-use code, do not retain a new usable token.
    await revokeAppleToken(credentials.refreshToken,credentials.clientId);
    throw Error('apple_authorization_unavailable');
  }
}

