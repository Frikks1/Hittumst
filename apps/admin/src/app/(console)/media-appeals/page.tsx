import { PageHeader } from '@/components/page-header';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { reviewMediaAppeal } from './actions';

export const dynamic = 'force-dynamic';
type Appeal = {
  id: string;
  media_type: string;
  created_at: string;
  rejection_reason: string | null;
};
export default async function MediaAppealsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const staff = await requireAdmin();
  const query = await searchParams;
  const result = staff.demo
    ? { data: [], error: null }
    : await (await createClient()).rpc('admin_media_appeals');
  const appeals = (result.data ?? []) as Appeal[];
  const messages: Record<string, string> = {
    recorded: 'Decision recorded. Approved files return to inspection before publication.',
    invalid: 'Choose a decision and provide a reason of 20–500 characters.',
    unavailable: 'The case could not be updated. Refresh to check whether it was already reviewed.',
    demo: 'Demo mode contains no private appeal evidence.',
  };
  return (
    <main className="page-shell">
      <PageHeader
        eyebrow="Private media"
        title="Media appeals"
        description="Review the full attachment and record the reason for your decision. Every evidence view and decision is audited."
      />
      {query.state && <p role="status">{messages[query.state] ?? 'Refresh the queue.'}</p>}
      {result.error ? (
        <p role="alert">The appeal queue is unavailable. Try again.</p>
      ) : !appeals.length ? (
        <p>No appeals are waiting.</p>
      ) : (
        appeals.map((appeal) => (
          <section className="policy-strip" key={appeal.id}>
            <h2>{appeal.media_type === 'video' ? 'Video' : 'Photo'} appeal</h2>
            <p>{new Date(appeal.created_at).toLocaleDateString('is-IS')}</p>
            <a href={`/api/media/evidence/${appeal.id}`} target="_blank" rel="noreferrer">
              Review full attachment
            </a>
            <form action={reviewMediaAppeal}>
              <input name="id" type="hidden" value={appeal.id} />
              <label>
                Decision reason
                <textarea name="reason" minLength={20} maxLength={500} required />
              </label>
              <button name="decision" value="approve">
                Approve appeal
              </button>
              <button name="decision" value="reject">
                Reject appeal
              </button>
            </form>
          </section>
        ))
      )}
    </main>
  );
}
