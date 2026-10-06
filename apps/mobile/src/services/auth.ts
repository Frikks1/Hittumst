import { suspendNativeDiagnostics } from './nativeDiagnostics';
import { retainAppleAuthorization } from './appleAccount';
import * as Crypto from 'expo-crypto';
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { AuthProvider, AuthService, AuthUser } from './types';
import { runtimeEnv } from './env';
import { supabase } from './supabase';
import { createOAuthCodeExchange, readOAuthCallbackCode } from './oauthCallback';

export const browserAuthCompletion = WebBrowser.maybeCompleteAuthSession();

const demoUser: AuthUser = { id: 'demo-me', email: 'demo@example.com' };

function toUser(user: { id: string; email?: string | null }): AuthUser {
  return { id: user.id, email: user.email ?? null };
}

export class DemoAuthService implements AuthService {
  private user: AuthUser | null = demoUser;
  private listeners = new Set<(user: AuthUser | null) => void>();
  private update(user: AuthUser | null) {
    this.user = user;
    this.listeners.forEach(listener => listener(user));
  }
  async getUser() { return this.user; }
  async requestEmailOtp(_email: string) {}
  async verifyEmailOtp(email: string, _token: string) { const user = { ...demoUser, email }; this.update(user); return user; }
  async signInWithProvider(_provider: AuthProvider) { this.update(demoUser); return demoUser; }
  async signOut() { this.update(null); }
  onAuthStateChange(callback: (user: AuthUser | null) => void) {
    this.listeners.add(callback);
    return () => { this.listeners.delete(callback); };
  }
}

const oauthExchange = createOAuthCodeExchange(async code => {
  if (!supabase) throw new Error('auth_unavailable');
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) throw error ?? new Error('OAuth session missing');
  return toUser(data.user);
});
export const completeOAuthCallback = (code: string) => oauthExchange.complete(code);

export class SupabaseAuthService implements AuthService {
  private applePending: Promise<AuthUser> | null = null;
  private listeners = new Set<(user: AuthUser | null) => void>();
  private authRevision = 0;
  async getUser() {
    if (this.applePending) return this.applePending.catch(() => null);
    const { data, error } = await supabase!.auth.getUser();
    if (error && error.name !== 'AuthSessionMissingError') throw error;
    return data.user ? toUser(data.user) : null;
  }

  async requestEmailOtp(email: string) {
    const { error } = await supabase!.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
  }

  async verifyEmailOtp(email: string, token: string) {
    const { data, error } = await supabase!.auth.verifyOtp({ email, token, type: 'email' });
    if (error || !data.user) throw error ?? new Error('Missing user after OTP verification');
    return toUser(data.user);
  }

  async signInWithProvider(provider: AuthProvider) {
    if (this.applePending) throw new Error('authentication_in_progress');
    if (provider === 'apple' && Platform.OS === 'ios' && await AppleAuthentication.isAvailableAsync()) {
      const revision = this.authRevision;
      const pending = (async () => {
        const nonce = Crypto.randomUUID();
        const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL], nonce: hashedNonce
        });
        if (!credential.identityToken) throw new Error('Apple did not return an identity token');
        if (revision !== this.authRevision) throw new Error('authentication_cancelled');
        const { data, error } = await supabase!.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce });
        if (error || !data.user) throw error ?? new Error('Missing user after Apple sign-in');
        try {
          await retainAppleAuthorization(credential.authorizationCode ?? '', data.user.id);
          if (revision !== this.authRevision) throw new Error('authentication_cancelled');
        } catch (failure) {
          await supabase!.auth.signOut({ scope: 'local' });
          throw failure;
        }
        return toUser(data.user);
      })();
      this.applePending = pending;
      try {
        const user = await pending;
        this.applePending = null;
        this.listeners.forEach(listener => listener(user));
        return user;
      } catch (failure) {
        this.applePending = null;
        this.listeners.forEach(listener => listener(null));
        throw failure;
      }
    }

    const redirectTo = makeRedirectUri({ scheme: 'rummal', path: 'auth/callback' });
    const revision = this.authRevision;
    const { data, error } = await supabase!.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true, ...(provider === 'facebook' ? { scopes: 'email' } : {}) }
    });
    if (error || !data.url) throw error ?? new Error('OAuth URL was not returned');
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') throw new Error('OAuth sign-in was cancelled');
    if (revision !== this.authRevision) throw new Error('authentication_cancelled');
    const user = await completeOAuthCallback(readOAuthCallbackCode(result.url, redirectTo));
    if (revision !== this.authRevision) {
      // A late PKCE response can recreate the local session after sign-out.
      // Clear that attempt without signing out a different account opened later.
      const { data: current } = await supabase!.auth.getSession();
      if (current.session?.user.id === user.id) await supabase!.auth.signOut({ scope: 'local' });
      throw new Error('authentication_cancelled');
    }
    return user;
  }

  async signOut() {
    this.authRevision += 1;
    await suspendNativeDiagnostics();
    const { error } = await supabase!.auth.signOut({ scope: 'global' });
    if (error) throw error;
    oauthExchange.clear();
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void) {
    this.listeners.add(callback);
    const { data } = supabase!.auth.onAuthStateChange((_event, session) => {
      // Native Apple custody must finish before navigation observes the authenticated member.
      if (!this.applePending) callback(session?.user ? toUser(session.user) : null);
    });
    return () => { this.listeners.delete(callback); data.subscription.unsubscribe(); };
  }
}

export const authService: AuthService = runtimeEnv.isDemo ? new DemoAuthService() : new SupabaseAuthService();
