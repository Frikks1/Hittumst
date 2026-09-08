'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function MfaForm() {
  const router = useRouter();
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>([]);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    void createClient().auth.mfa.listFactors().then(({ data, error: failure }) => {
      if (!active) return;
      if (failure) { setError('Could not load your authenticators. Please try again.'); return; }
      const verified = data.totp.filter(factor => factor.status === 'verified');
      setFactors(verified); setFactorId(verified[0]?.id ?? '');
    }).catch(() => { if (active) setError('Could not load your authenticators. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);
  async function enroll() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const { data, error: failure } = await createClient().auth.mfa.enroll({ factorType: 'totp', issuer: 'Hittumst', friendlyName: `Safety desk ${new Date().toISOString()}` });
      if (failure) throw failure;
      setFactorId(data.id); setSetup({ qr: data.totp.qr_code, secret: data.totp.secret });
    } catch { setError('Could not start authenticator setup. Please try again.'); }
    finally { setBusy(false); }
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy || !factorId || !/^\d{6}$/.test(code)) return;
    setBusy(true); setError(null);
    try {
      const { error: failure } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
      if (failure) throw failure;
      setSetup(null); setCode(''); router.replace('/dashboard'); router.refresh();
    } catch { setError('That code could not be verified. Try the current code from your authenticator.'); }
    finally { setBusy(false); }
  }
  if (loading) return <p role="status">Loading authenticators…</p>;
  return <div className="login-form">
    {error && <p role="alert">{error}</p>}
    {!factorId && error ? <button className="button" onClick={() => setReload(value => value + 1)}>Try again</button> : null}
    {!factorId && !error && <button className="button button-primary" disabled={busy} onClick={() => void enroll()}>Set up an authenticator</button>}
    {setup && <div>
      <p>Scan this code in your authenticator app, then enter its six-digit code.</p>
      {/* The data image stays in memory; it is never sent to an image proxy. */}
      <img src={setup.qr} width={240} height={240} alt="Authenticator setup QR code" />
      <details><summary>Enter the setup key manually</summary><code style={{ overflowWrap: 'anywhere' }}>{setup.secret}</code></details>
    </div>}
    {factorId && <form className="login-form" onSubmit={verify}>
      {factors.length > 1 && <label>Authenticator<select value={factorId} onChange={event => setFactorId(event.target.value)}>{factors.map(factor => <option key={factor.id} value={factor.id}>{factor.friendly_name ?? 'Authenticator'}</option>)}</select></label>}
      <label>Authenticator code<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} required /></label>
      <button className="button button-primary" type="submit" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
    </form>}
  </div>;
}
