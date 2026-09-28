'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { reviewFinance } from '@/app/(console)/finance/actions';

export function FinanceReviewForm({
  meetupId,
  expectedReview,
}: {
  meetupId: string;
  expectedReview: 'pending' | 'approved' | 'rejected';
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        const fingerprint = JSON.stringify({
          meetupId,
          decision,
          reason: reason.trim(),
          expectedReview,
        });
        if (pending.current?.fingerprint !== fingerprint)
          pending.current = { fingerprint, requestId: crypto.randomUUID() };
        const requestId = pending.current.requestId;
        setBusy(true);
        setStatus('');
        void reviewFinance({ meetupId, decision, reason: reason.trim(), requestId, expectedReview })
          .then((result) => {
            if (result.conflict) {
              setStatus(
                'Another operator changed this event. Refresh and review the current decision before submitting again.',
              );
              router.refresh();
              return;
            }
            if (!result.ok) throw new Error('review_failed');
            setStatus('Decision recorded.');
            pending.current = null;
            setReason('');
            router.refresh();
          })
          .catch(() =>
            setStatus(
              'The decision was not confirmed. Retry without changing the fields to safely check the same request.',
            ),
          )
          .finally(() => setBusy(false));
      }}
    >
      <label style={{ display: 'block' }}>
        Decision
        <select
          value={decision}
          disabled={busy}
          onChange={(event) => setDecision(event.target.value as 'approved' | 'rejected')}
        >
          <option value="approved">Approve</option>
          <option value="rejected">Reject</option>
        </select>
      </label>
      <label style={{ display: 'block' }}>
        Evidence and reason (20–500 characters)
        <textarea
          style={{ display: 'block', width: '100%' }}
          required
          minLength={20}
          maxLength={500}
          rows={3}
          value={reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <button className="button button-primary" disabled={busy || reason.trim().length < 20}>
        {busy ? 'Recording…' : 'Record sandbox decision'}
      </button>
      {status && <p role="status">{status}</p>}
    </form>
  );
}
