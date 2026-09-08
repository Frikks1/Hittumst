import type { Metadata } from "next";

import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { PhotoReviewGrid } from "@/components/photo-review-grid";
import { getPendingPhotos } from "@/lib/moderation/repository";
import { getRuntimeConfig } from "@/lib/env";

export const metadata: Metadata = { title: "Photo review" };
export const dynamic = "force-dynamic";

export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; message?: string }>;
}) {
  const [photos, query] = await Promise.all([getPendingPhotos(), searchParams]);
  const { supportEmail } = getRuntimeConfig();
  return (
    <main className="page-shell">
      <PageHeader eyebrow="Profile integrity" title="Photo review" description={`${photos.length} submissions waiting for a human safety check.`} />
      <Notice state={query.state} message={query.message} />
      <div className="policy-strip"><span>Approve when</span><p>The image belongs on a dating profile, shows no prohibited content, and does not expose another person without consent.</p>{supportEmail ? <a href={`mailto:${supportEmail}?subject=Photo%20review%20escalation`}>Escalate uncertainty</a> : <span>Escalate uncertainty to the appointed safety lead.</span>}</div>
      <PhotoReviewGrid photos={photos} />
    </main>
  );
}
