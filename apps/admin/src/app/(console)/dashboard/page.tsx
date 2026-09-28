import type { Metadata } from "next";
import Link from "next/link";

import { AuditTimeline } from "@/components/audit-timeline";
import { Icons } from "@/components/icon";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { ReportQueue } from "@/components/report-queue";
import { getDashboard } from "@/lib/moderation/repository";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboard();
  const urgent = [...data.reports]
    .filter((report) => ["critical", "urgent"].includes(report.priority) && report.status !== "resolved")
    .sort((a, b) => (a.priority === b.priority ? a.createdAt.localeCompare(b.createdAt) : a.priority === "critical" ? -1 : 1))[0];

  return (
    <main className="page-shell">
      <PageHeader
        eyebrow="Safety overview"
        title="Moderation overview"
        description="Here is what needs attention across the Hittumst community."
        actions={<Link href="/reports" className="button button-secondary">Open report queue <Icons.ChevronRight aria-hidden="true" /></Link>}
      />

      <section className="metric-grid" aria-label="Moderation metrics">
        <MetricCard label="Open reports" value={data.stats.openReports} note="Across all categories" icon={Icons.MessageSquareWarning} />
        <MetricCard label="Priority" value={data.stats.urgentReports} note="Critical or urgent" icon={Icons.ShieldAlert} tone="warning" />
        <MetricCard label="Photos waiting" value={data.stats.pendingPhotos} note="Awaiting human review" icon={Icons.Camera} />
        <MetricCard label="Actions today" value={data.stats.actionsToday} note="Fully audited" icon={Icons.Activity} tone="positive" />
      </section>

      {urgent && (
        <section className="attention-card">
          <div className="attention-icon"><Icons.AlertTriangle aria-hidden="true" /></div>
          <div>
            <span className="eyebrow eyebrow-light">Priority review</span>
            <h2>{urgent.categoryLabel}</h2>
            <p>{urgent.details}</p>
          </div>
          <div className="attention-meta"><span>Received {urgent.reporter.displayName}</span><strong>{urgent.reported.displayName}</strong></div>
          <Link href={`/reports/${urgent.id}`} className="button button-light">Review now <Icons.ChevronRight aria-hidden="true" /></Link>
        </section>
      )}

      <div className="dashboard-grid">
        <section className="panel dashboard-reports">
          <div className="panel-heading"><div><span className="eyebrow">Incoming</span><h2>Latest reports</h2></div><Link href="/reports">View all <Icons.ChevronRight aria-hidden="true" /></Link></div>
          <ReportQueue reports={data.reports} compact />
        </section>

        <aside className="dashboard-side">
          <section className="panel photo-glance">
            <div className="panel-heading"><div><span className="eyebrow">Visual checks</span><h2>Photo queue</h2></div><Link href="/photos">Review <Icons.ChevronRight aria-hidden="true" /></Link></div>
            <div className="photo-stack">
              {data.photos.slice(0, 3).map((photo, index) => (
                <div className="mini-photo" key={photo.id} style={{ "--photo-index": index } as React.CSSProperties}>
                  <span>{photo.profile.initials}</span><div><strong>{photo.profile.displayName}</strong><small>{photo.profile.region}</small></div>
                </div>
              ))}
            </div>
          </section>
          <section className="panel audit-glance">
            <div className="panel-heading"><div><span className="eyebrow">Accountability</span><h2>Recent activity</h2></div><Link href="/audit">Audit log <Icons.ChevronRight aria-hidden="true" /></Link></div>
            <AuditTimeline events={data.audit} compact />
          </section>
        </aside>
      </div>
    </main>
  );
}
