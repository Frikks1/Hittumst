import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuditTimeline } from "@/components/audit-timeline";
import { Icons } from "@/components/icon";
import { MemberCard } from "@/components/member-card";
import { MeetupEvidencePanel } from "@/components/meetup-evidence-panel";
import { Notice } from "@/components/notice";
import { ReportActionPanel } from "@/components/report-action-panel";
import { PriorityBadge, StatusBadge } from "@/components/status-badge";
import { absoluteTime } from "@/lib/format";
import { requireAdmin } from "@/lib/auth/session";
import { getAuditEvents, getReport } from "@/lib/moderation/repository";

export const metadata: Metadata = { title: "Report review" };
export const dynamic = "force-dynamic";

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ state?: string; message?: string }>;
}) {
  const [{ id }, query, admin] = await Promise.all([params, searchParams, requireAdmin()]);
  const [report, audit] = await Promise.all([getReport(id), getAuditEvents()]);
  if (!report) notFound();
  const relatedAudit = audit.filter((event) =>
    [report.id, report.reported.id].includes(event.targetId),
  );

  return (
    <main className="page-shell detail-shell">
      <Link href="/reports" className="back-link"><Icons.ArrowLeft aria-hidden="true" /> Back to report queue</Link>
      <header className="detail-header">
        <div>
          <div className="detail-badges"><PriorityBadge priority={report.priority} /><StatusBadge status={report.status} /></div>
          <h1>{report.categoryLabel}</h1>
          <p>Report {report.id} · received {absoluteTime(report.createdAt)}</p>
        </div>
        <div className="evidence-count"><strong>{report.evidenceCount}</strong><span>Evidence items</span></div>
      </header>
      <Notice state={query.state} message={query.message} />

      <div className="detail-grid">
        <div className="detail-main">
          <section className="panel case-summary">
            <div className="panel-heading"><div><span className="eyebrow">Reporter statement</span><h2>What happened</h2></div><Icons.MessageSquareWarning aria-hidden="true" /></div>
            <blockquote>{report.details}</blockquote>
            <div className="reporter-line"><span className="staff-avatar">{report.reporter.initials}</span><div><strong>{report.reporter.displayName}</strong><span>{report.reporter.region ?? "Region withheld"}</span></div></div>
          </section>

          {report.meetupSnapshot && (
            <MeetupEvidencePanel report={report} roles={admin.roles} />
          )}

          <section className="panel evidence-panel">
            <div className="panel-heading"><div><span className="eyebrow">Preserved context</span><h2>Evidence</h2></div><span className="secure-label"><Icons.LockKeyhole aria-hidden="true" /> Staff only</span></div>
            {report.evidence.length ? (
              <div className="evidence-list">
                {report.evidence.map((item) => (
                  <article key={item.id} className={`evidence-item evidence-${item.type}`}>
                    <span className="evidence-icon">{item.type === "message" ? <Icons.MessageSquareWarning /> : item.type === "image" ? <Icons.ImageIcon /> : <Icons.FileSearch />}</span>
                    <div><div><strong>{item.label}</strong>{item.createdAt && <time>{absoluteTime(item.createdAt)}</time>}</div>{item.body && <p>{item.body}</p>}{item.signedUrl && item.mediaType === "video" && <video src={item.signedUrl} controls muted playsInline style={{ width: "100%", maxHeight: 520, borderRadius: 16, marginTop: 12 }} />}{item.signedUrl && item.mediaType !== "video" && <img src={item.signedUrl} alt="Reported private album evidence" style={{ width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 16, marginTop: 12 }} />}</div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state compact-empty"><Icons.FileSearch aria-hidden="true" /><strong>No preserved evidence attached</strong><span>Review the reporter statement and account history.</span></div>
            )}
          </section>

          <section className="panel case-audit">
            <div className="panel-heading"><div><span className="eyebrow">Case history</span><h2>Audit timeline</h2></div></div>
            <AuditTimeline events={relatedAudit} />
          </section>
        </div>
        <aside className="detail-aside">
          <MemberCard person={report.reported} />
          <ReportActionPanel report={report} roles={admin.roles} />
        </aside>
      </div>
    </main>
  );
}
