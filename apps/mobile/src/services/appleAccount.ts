import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { memberRequest } from './memberApi';
import { runtimeEnv } from './env';

export async function retainAppleAuthorization(code: string, accountId?: string) {
  if (!code) throw new Error('apple_authorization_required');
  await memberRequest('/api/account/apple', { code }, accountId);
}

export const APPLE_MANUAL_REVOCATION_URL = 'https://support.apple.com/102571';
export type AppleDeletionPreparation = 'ready' | 'manual_revocation';

export async function prepareAppleAccountDeletion(accountId: string): Promise<AppleDeletionPreparation> {
  if (runtimeEnv.isDemo) return 'ready';
  try {
    const state = await memberRequest('/api/account/apple', undefined, accountId) as { requiresRevocation: boolean; ready: boolean };
    if (typeof state?.requiresRevocation !== 'boolean' || typeof state.ready !== 'boolean') throw new Error('apple_authorization_failed');
    if (!state.requiresRevocation || state.ready) return 'ready';
    if (Platform.OS === 'ios' && await AppleAuthentication.isAvailableAsync()) {
      const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
      if (!credential.authorizationCode) throw new Error('apple_authorization_required');
      await retainAppleAuthorization(credential.authorizationCode, accountId);
      return 'ready';
    }
    if (Platform.OS === 'web') return 'manual_revocation';
    const { url } = await memberRequest('/api/account/apple', { action: 'reauthorize' }, accountId) as { url: string };
    const parsed = new URL(url);
    if (parsed.origin !== 'https://appleid.apple.com' || parsed.pathname !== '/auth/authorize') throw new Error('apple_authorization_invalid');
    const result = await WebBrowser.openAuthSessionAsync(url, 'rummal://privacy');
    if (result.type !== 'success') return 'manual_revocation';
    const after = await memberRequest('/api/account/apple', undefined, accountId) as { requiresRevocation: boolean; ready: boolean };
    return after?.ready === true ? 'ready' : 'manual_revocation';
  } catch (error) {
    if (error instanceof Error && error.message === 'authentication_required') throw error;
    // Apple TN3194: missing tokens/failed reauthorization must not prevent an authenticated deletion request.
    // The screen offers explicit continuation and manual-revocation instructions; existing stored tokens are still revoked by the worker.
    return 'manual_revocation';
  }
}
