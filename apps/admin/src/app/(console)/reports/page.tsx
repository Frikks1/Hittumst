import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { ReportQueue } from "@/components/report-queue";
import { getReports } from "@/lib/moderation/repository";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const reports = await getReports();
  const activeCount = reports.filter((report) => ["open", "in_review"].includes(report.status)).length;

  return (
    <main className="page-shell">
      <PageHeader
        eyebrow="Triage"
        title="Report queue"
        description={`${activeCount} active cases, ordered for clear and consistent review.`}
      />
      <section className="panel reports-panel" aria-label="Community reports">
        <ReportQueue reports={reports} />
      </section>
    </main>
  );
}
