import { z } from 'zod';
import { communityAttendanceReviewSchema } from '@rummal/shared';
import { PageHeader } from '@/components/page-header';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { resolveAttendanceReview } from './actions';

export const dynamic = 'force-dynamic';
export default async function AttendanceReviewsPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const staff = await requireAdmin();
  const query = await searchParams;
  const result = staff.demo ? { data: [], error: null } : await (await createClient()).rpc('staff_list_meetup_attendance_reviews');
  const parsed = z.array(communityAttendanceReviewSchema).safeParse(result.data);
  const messages: Record<string, string> = {
    recorded: 'Decision recorded. Approval grants permission to review the event.',
    invalid: 'Provide a decision and a reason of 20–2,000 characters.',
    unavailable: 'The case could not be updated. Refresh and try again.',
    demo: 'Demo mode contains no private attendance cases.',
  };
  return <main className="page-shell">
    <PageHeader eyebrow="Community" title="Missed check-ins" description="Review attendance claims using the available evidence. Decisions are audited and do not change sponsorship payments." />
    {query.state && <p role="status">{messages[query.state] ?? 'Refresh the queue.'}</p>}
    {result.error || !parsed.success ? <p role="alert">The attendance review queue is unavailable. Please retry.</p>
      : !parsed.data.length ? <p>No attendance claims are waiting.</p>
        : parsed.data.map(item => <section className="policy-strip" key={item.id}>
          <h2>{item.meetupTitle}</h2>
          <p>{item.displayName} · {new Date(item.createdAt).toLocaleDateString('is-IS')} · {item.status}</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{item.reason}</p>
          {item.status === 'pending' && <form action={resolveAttendanceReview}>
            <input name="id" type="hidden" value={item.id} />
            <label>Evidence checked and decision reason<textarea name="reason" minLength={20} maxLength={2000} required /></label>
            <button name="decision" value="approve">Approve review eligibility</button>
            <button name="decision" value="reject">Reject claim</button>
          </form>}
        </section>)}
  </main>;
}
