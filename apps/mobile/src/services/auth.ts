import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { AuthProvider, AuthService, AuthUser } from './types';
import { runtimeEnv } from './env';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const demoUser: AuthUser = { id: 'demo-me', email: 'demo@example.com' };

function toUser(user: { id: string; email?: string | null }): AuthUser {
  return { id: user.id, email: user.email ?? null };
}

class DemoAuthService implements AuthService {
  private user: AuthUser | null = demoUser;
  async getUser() { return this.user; }
  async requestEmailOtp(_email: string) {}
  async verifyEmailOtp(email: string, _token: string) { this.user = { ...demoUser, email }; return this.user; }
  async signInWithProvider(_provider: AuthProvider) { this.user = demoUser; return this.user; }
  async signOut() { this.user = null; }
  onAuthStateChange(_callback: (user: AuthUser | null) => void) { return () => undefined; }
}

class SupabaseAuthService implements AuthService {
  async getUser() {
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
    if (provider === 'apple' && Platform.OS === 'ios' && await AppleAuthentication.isAvailableAsync()) {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL]
      });
      if (!credential.identityToken) throw new Error('Apple did not return an identity token');
      const { data, error } = await supabase!.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
      if (error || !data.user) throw error ?? new Error('Missing user after Apple sign-in');
      return toUser(data.user);
    }

    const redirectTo = makeRedirectUri({ scheme: 'rummal', path: 'auth/callback' });
    const { data, error } = await supabase!.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true }
    });
    if (error || !data.url) throw error ?? new Error('OAuth URL was not returned');
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') throw new Error('OAuth sign-in was cancelled');
    const callback = new URL(result.url);
    const code = callback.searchParams.get('code');
    if (!code) throw new Error('OAuth callback did not include a code');
    const exchanged = await supabase!.auth.exchangeCodeForSession(code);
    if (exchanged.error || !exchanged.data.user) throw exchanged.error ?? new Error('OAuth session missing');
    return toUser(exchanged.data.user);
  }

  async signOut() {
    const { error } = await supabase!.auth.signOut({ scope: 'global' });
    if (error) throw error;
  }

  onAuthStateChange(callback: (user: AuthUser | null) => void) {
    const { data } = supabase!.auth.onAuthStateChange((_event, session) => callback(session?.user ? toUser(session.user) : null));
    return () => data.subscription.unsubscribe();
  }
}

export const authService: AuthService = runtimeEnv.isDemo ? new DemoAuthService() : new SupabaseAuthService();
