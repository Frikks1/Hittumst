'use client';
import { useEffect, useState } from 'react';
type Case = { id: string; diagnosisId: string; status: string; assigned: boolean };
type Identity = { name: string; birthDate: string; diagnosisId: string };
async function request(action: string, input: Record<string, unknown> = {}) {
  const response = await fetch('/api/diagnoses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, input }),
    cache: 'no-store',
  });
  if (!response.ok) throw Error('review_unavailable');
  return response.json();
}
export function DiagnosisReview() {
  const [cases, setCases] = useState<Case[]>([]),
    [selected, setSelected] = useState<Case | null>(null),
    [identity, setIdentity] = useState<Identity | null>(null);
  const [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void request('list')
      .then((items) => {
        if (active) setCases(items);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await work();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const decide = (decision: string) =>
    void run(async () => {
      await request('decide', { id: selected!.id, decision, checked });
      setSelected(null);
      setIdentity(null);
      setChecked(false);
      setCases(await request('list'));
    });
  return (
    <main className="page-content">
      <h1>Diagnosis evidence review</h1>
      <p>
        Designated reviewers only. Current MFA is required. Review the minimum clinician evidence;
        do not download or copy medical documents. Approval records an evidence review, not
        authenticity or safe behavior.
      </p>
      {error && (
        <p role="alert">
          Review unavailable. Check your reviewer permission, MFA and case assignment.
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <section aria-label="Review queue">
          <h2>Cases</h2>
          {cases.map((item) => (
            <p key={item.id}>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setIdentity(null);
                    setSelected(null);
                    setChecked(false);
                    await request('claim', { id: item.id });
                    setSelected(item);
                    if (item.status !== 'approved')
                      setIdentity(await request('evidence', { id: item.id }));
                  })
                }
              >
                {item.diagnosisId} · {item.status} · {item.id.slice(0, 8)}
              </button>
            </p>
          ))}
        </section>
        {selected && (
          <section aria-label="Assigned case" style={{ maxWidth: 780 }}>
            <h2>{selected.diagnosisId}</h2>
            {identity && (
              <>
                <p>
                  Submitted patient name: {identity.name} · Account birth date: {identity.birthDate}
                </p>
                {/* Authenticated non-caching endpoint, never a signed storage URL. */}
                <img
                  src={'/api/diagnoses/' + selected.id + '/evidence'}
                  alt="Private clinician evidence for assigned review"
                  referrerPolicy="no-referrer"
                  style={{ maxWidth: '100%' }}
                />
                <p>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => setChecked(event.target.checked)}
                    />{' '}
                    I checked the condition, clinician/issuer, date, and patient details against the
                    submitted name and account birth date.
                  </label>
                </p>
              </>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {selected.status === 'approved' ? (
                <button disabled={busy} onClick={() => decide('revoked')}>
                  Revoke approval
                </button>
              ) : (
                <>
                  <button
                    disabled={busy || !checked || !identity}
                    onClick={() => decide('approved')}
                  >
                    Approve reviewed evidence
                  </button>
                  <button disabled={busy} onClick={() => decide('more_information')}>
                    Request more information
                  </button>
                  <button disabled={busy} onClick={() => decide('rejected')}>
                    Reject — evidence insufficient
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  setSelected(null);
                  setIdentity(null);
                  setChecked(false);
                }}
              >
                Close case
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
