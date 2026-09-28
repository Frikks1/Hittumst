import { AppState, NativeModules, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { runtimeEnv } from './env';
import { supabase } from './supabase';

export type PrivateDiagnosticsBridge = {
  configured: boolean;
  dsn: string;
  release: string;
  environment: string;
  setSession: (key: string | null, expiresAtMs: number) => Promise<void>;
};
let started = false;
let revision = 0;
let observedSessionId: string | null | undefined;
let verifiedSessionId: string | null = null;
let blockedSessionId: string | null = null;
let suspendedBeforeObservation = false;
const bridge = () => Platform.OS === 'web' ? undefined : NativeModules.PrivateNativeDiagnostics as PrivateDiagnosticsBridge | undefined;
const validSessionId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

// Local decoding is used only to CLOSE permission promptly on a session transition. It never
// grants upload permission; grant requires verified claims AND an authenticated network read.
export function diagnosticSessionId(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return validSessionId(data.session_id) ? data.session_id : null;
  } catch { return null; }
}

export function nativeDiagnosticsConfigured(): boolean {
  const native = bridge();
  return !runtimeEnv.isDemo && !runtimeEnv.configurationIssue &&
    ['staging', 'production'].includes(runtimeEnv.appEnvironment) &&
    process.env.EXPO_PUBLIC_SENTRY_PRIVACY_VERIFIED === 'true' &&
    process.env.EXPO_PUBLIC_SENTRY_NATIVE_PRIVACY_VERIFIED === 'true' &&
    native?.configured === true && typeof native.setSession === 'function' && native.dsn === process.env.EXPO_PUBLIC_SENTRY_DSN &&
    native.release === process.env.EXPO_PUBLIC_RELEASE_ID && native.environment === runtimeEnv.appEnvironment;
}

async function closeNativeLease(): Promise<void> {
  revision++;
  verifiedSessionId = null;
  try { await bridge()?.setSession?.(null, 0); } catch { /* Optional diagnostics must never trap account lifecycle. */ }
}

/** Await before sign-out, consent withdrawal or deletion; diagnostics failure cannot block them. */
export async function suspendNativeDiagnostics(): Promise<void> {
  blockedSessionId = observedSessionId ?? verifiedSessionId;
  suspendedBeforeObservation = blockedSessionId === null;
  await closeNativeLease();
}

async function observeSession(next: string | null): Promise<void> {
  const changed = observedSessionId !== undefined && observedSessionId !== next;
  observedSessionId = next;
  if (changed || next === null) await closeNativeLease();
}

export async function validateNativeDiagnosticsSession(): Promise<void> {
  const native = bridge();
  if (!native || !nativeDiagnosticsConfigured() || !supabase) return;
  let currentRevision = ++revision;
  try {
    const { data, error } = await supabase.auth.getSession();
    const session = data.session;
    if (currentRevision !== revision) return;
    if (error || !session) throw new Error('diagnostics_session_unavailable');
    await observeSession(diagnosticSessionId(session.access_token));
    currentRevision = revision;
    const claimsResult = await supabase.auth.getClaims(session.access_token);
    const sessionId = claimsResult.data?.claims.session_id;
    if (claimsResult.error || !validSessionId(sessionId) || sessionId !== observedSessionId) throw new Error('diagnostics_session_unavailable');
    if (suspendedBeforeObservation) { blockedSessionId = sessionId; suspendedBeforeObservation = false; return; }
    if (blockedSessionId === sessionId) return;
    const key = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, sessionId);
    // Central Data API pre-request checks auth.sessions, expiry, deletion and restore quarantine.
    const proof = await supabase.from('profiles').select('id').eq('id', session.user.id).maybeSingle();
    if (proof.error || proof.data?.id !== session.user.id) throw new Error('diagnostics_session_unavailable');
    const latest = await supabase.auth.getSession();
    if (latest.error || latest.data.session?.access_token !== session.access_token) throw new Error('diagnostics_session_changed');
    const expiresAt = Math.min((session.expires_at ?? 0) * 1000, Date.now() + 120_000);
    if (expiresAt <= Date.now()) throw new Error('diagnostics_session_expired');
    if (currentRevision !== revision || blockedSessionId === sessionId) return;
    verifiedSessionId = sessionId;
    blockedSessionId = null;
    await native.setSession(key, expiresAt);
  } catch {
    if (currentRevision !== revision) return;
    verifiedSessionId = null;
    try { await native.setSession(null, 0); } catch { /* Fail closed without affecting account UI. */ }
  }
}

export function initializeNativeDiagnostics(): void {
  if (started || !nativeDiagnosticsConfigured() || !supabase) return;
  started = true;
  void validateNativeDiagnosticsSession();
  supabase.auth.onAuthStateChange((_event, session) => {
    // Repeated SIGNED_IN events for the same session cannot undo explicit suspension.
    const next = session ? diagnosticSessionId(session.access_token) : null;
    if (_event === 'SIGNED_OUT') suspendedBeforeObservation = false;
    const observed = observeSession(next);
    // Never await Auth calls inside Supabase's synchronous listener.
    void observed.then(() => { setTimeout(() => { void validateNativeDiagnosticsSession(); }, 0); });
  });
  AppState.addEventListener('change', state => { if (state === 'active') void validateNativeDiagnosticsSession(); });
  setInterval(() => { void validateNativeDiagnosticsSession(); }, 60_000);
}
