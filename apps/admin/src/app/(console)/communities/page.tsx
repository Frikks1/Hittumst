import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import type { PublicCommunity } from '@rummal/shared';
import { PageHeader } from '@/components/page-header';
import { requireAdmin } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { feedReportQueueSchema, staffCommunityDirectorySchema } from '@/lib/social-feed';
import { moderateCommunityContent, savePublicCommunity } from './actions';

export const dynamic = 'force-dynamic';
function CommunityEditor({ item }: { item?: PublicCommunity }) {
  return (
    <section className="policy-strip">
      <h2>{item ? item.name : 'Create community'}</h2>
      <form action={savePublicCommunity}>
        <input type="hidden" name="id" value={item?.id ?? randomUUID()} />
        <input type="hidden" name="coverRequest" value={randomUUID()} />
        <label>
          Name
          <input
            name="name"
            defaultValue={item?.name ?? ''}
            minLength={1}
            maxLength={80}
            required
          />
        </label>
        <label>
          Description
          <textarea name="description" defaultValue={item?.description ?? ''} maxLength={2000} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={item?.status ?? 'active'}>
            <option value="active">Active and discoverable</option>
            <option value="archived">Archived with readable history</option>
            <option value="hidden">Hidden from members</option>
          </select>
        </label>
        <label>
          Cover picture
          <input name="cover" type="file" accept="image/jpeg,image/png,image/webp" />
        </label>
        <p>One optional picture, up to 10 MiB. Pictures appear after approval.</p>
        {item && <p>{item.memberCount} current members</p>}
        <label>
          Audit reason
          <textarea name="reason" required minLength={8} maxLength={1000} />
        </label>
        <button type="submit">Save community</button>
      </form>
    </section>
  );
}
export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const staff = await requireAdmin();
  const query = await searchParams;
  const client = staff.demo ? null : await createClient();
  const [directory, reports] = client
    ? await Promise.all([
        client.rpc('social_feed_staff_directory'),
        client.rpc('social_feed_staff_reports'),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  const items = staffCommunityDirectorySchema.safeParse(directory.data);
  const queue = feedReportQueueSchema.safeParse(reports.data);
  const messages: Record<string, string> = {
    saved: 'Saved. Cover pictures appear after approval.',
    invalid: 'Check the required fields and provide an audit reason of at least 8 characters.',
    unavailable: 'Unable to save. Refresh and retry.',
    invalidImage: 'The community was saved. Select a JPEG, PNG or WebP picture of up to 10 MiB.',
    imageUnavailable: 'The community was saved. Its cover upload failed; try again.',
    demo: 'Demo mode does not change live communities.',
  };
  return (
    <main className="page-shell">
      <PageHeader
        eyebrow="Samfélag"
        title="Public communities"
        description="Maintain member-visible organisations and review reported posts and comments. These communities are separate from invitation-only chat groups."
      />
      {query.state && <p role="status">{messages[query.state] ?? 'Refresh the page.'}</p>}
      {directory.error || !items.success ? (
        <p role="alert">Community directory unavailable.</p>
      ) : (
        <>
          <CommunityEditor />
          {items.data.map((item) => (
            <CommunityEditor key={item.id} item={item} />
          ))}
        </>
      )}
      <section>
        <h2>Reported posts and comments</h2>
        {reports.error || !queue.success ? (
          <p role="alert">Report queue unavailable.</p>
        ) : !queue.data.length ? (
          <p>No community reports.</p>
        ) : (
          queue.data.map((report) => {
            const kind = report.social_feed_comment_id ? 'comment' : 'post';
            const id = report.social_feed_comment_id ?? report.social_feed_post_id;
            return (
              <section className="policy-strip" key={report.id}>
                <h3>
                  {report.category.replaceAll('_', ' ')} · {report.status}
                </h3>
                <p style={{ whiteSpace: 'pre-wrap' }}>{report.social_feed_snapshot.body}</p>
                <p>{report.details}</p>
                <p>
                  Evidence captured{' '}
                  {new Date(report.social_feed_snapshot.capturedAt).toLocaleString('is-IS', {
                    timeZone: 'Atlantic/Reykjavik',
                  })}
                </p>
                <Link href={`/reports/${report.id}`}>Open safety case</Link>
                {id && (
                  <form action={moderateCommunityContent}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="kind" value={kind} />
                    <label>
                      Audit reason
                      <textarea name="reason" required minLength={8} maxLength={1000} />
                    </label>
                    <button name="action" value="hide">
                      Hide {kind}
                    </button>
                    <button name="action" value="restore">
                      Restore {kind}
                    </button>
                  </form>
                )}
              </section>
            );
          })
        )}
      </section>
    </main>
  );
}
