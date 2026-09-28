import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { FinanceReviewForm } from '@/components/finance-review-form';
import { loadFinanceConsole } from '@/lib/finance-console';

export const metadata: Metadata = { title: 'Finance review' };
export const dynamic = 'force-dynamic';
export default async function FinancePage() {
  let queue;
  try {
    queue = await loadFinanceConsole();
  } catch {
    return (
      <main className="page-shell">
        <PageHeader
          eyebrow="Financial operations"
          title="Finance review"
          description="Requires a separate financial permission, an active MFA session and a configured sandbox."
        />
        <section className="panel" style={{ padding: 24 }}>
          <p role="status">
            Financial review is unavailable for this session or environment. Production money
            operations remain disabled until provider acceptance and integration are verified.
          </p>
          <Link href="/finance" className="button button-secondary">
            Retry
          </Link>
        </section>
      </main>
    );
  }
  return (
    <main className="page-shell">
      <PageHeader
        eyebrow="Financial operations"
        title="Finance review"
        description="Review event settlements and inspect unresolved provider work."
      />
      <section className="panel" style={{ padding: 24, marginBottom: 24 }}>
        <strong>Sandbox only — simulated money</strong>
        <p>No production funds are shown or moved. Sandbox figures do not prove reserve funding.</p>
        {queue && <p>Reserved sponsorship credit: {queue.sponsorship.reservedCredit} kr · Funded pools: {queue.sponsorship.activePools} kr · Refundable service fees: {queue.sponsorship.pendingServiceFees} kr · Earned service fees: {queue.sponsorship.earnedServiceFees} kr</p>}
        <p>
          {queue
            ? queue.ledgerEntries + ' balanced ledger transactions.'
            : 'No sandbox ledger has been initialized.'}
        </p>
      </section>
      <section className="panel" style={{ padding: 24, marginBottom: 24 }}>
        <h2>Unsettled events ({queue?.events.length ?? 0})</h2>
        {!queue?.events.length && <p>No unsettled events.</p>}
        {queue?.events.map((event) => (
          <article key={event.id} style={{ padding: '20px 0', borderBottom: '1px solid #d9e4dc' }}>
            <h3>Event {event.id}</h3>
            <p>
              Ends: {event.endsAt} · {event.review} · {event.cancelled ? 'Cancelled' : 'Active'} ·{' '}
              {event.checkedIn}/{event.attendees} checked in
            </p>
            <p>Pool: {event.pool.total} kr · Creator: {event.pool.hostBps / 100}% · Participants: {(10000 - event.pool.hostBps) / 100}% · {event.pool.status}</p>
            {event.canReview ? (
              <FinanceReviewForm meetupId={event.id} expectedReview={event.review} />
            ) : (
              <p>You cannot review your own event. Another authorized operator must review it.</p>
            )}
          </article>
        ))}
      </section>
      <section className="panel" style={{ padding: 24, marginBottom: 24 }}>
        <h2>Payout exceptions ({queue?.payouts.length ?? 0})</h2>
        {!queue?.payouts.length && <p>No pending, unknown or failed payouts.</p>}
        <ul>
          {queue?.payouts.map((item) => (
            <li key={item.id}>
              {item.id} · {item.status} · Gross {item.gross} + bonus {item.bonus} − fee {item.fee} =
              net {item.net} simulated ISK
            </li>
          ))}
        </ul>
        <h2>Pending voucher orders ({queue?.orders.length ?? 0})</h2>
        {!queue?.orders.length && <p>No pending orders.</p>}
        <ul>
          {queue?.orders.map((item) => (
            <li key={item.id}>
              {item.id} · {item.sku} · {item.amount} simulated ISK
            </li>
          ))}
        </ul>
        <p>
          Reconcile an uncertain provider outcome before retrying or refunding. The continuous
          worker retains stable operation identifiers; this console does not override provider
          outcomes.
        </p>
      </section>
      <section className="panel" style={{ padding: 24 }}>
        <h2>Recent financial decisions and flags</h2>
        {queue?.reviews.map((item) => (
          <article key={item.requestId}>
            <p>
              <time dateTime={item.at}>{item.at}</time> · <code>{item.actor}</code> ·{' '}
              {item.previousReview} → {item.decision}
            </p>
            <p>
              Event {item.eventId}: {item.reason}
            </p>
          </article>
        ))}
        {!queue?.flags.length && <p>No financial flags.</p>}
        <ul>
          {queue?.flags.map((item, index) => (
            <li key={index}>
              <code>{item.accountId}</code>: {item.reason}
            </li>
          ))}
        </ul>
        <p>Up to 100 recent entries shown. Full records remain in the protected ledger.</p>
      </section>
    </main>
  );
}
