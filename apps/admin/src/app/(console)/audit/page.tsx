import type { Metadata } from "next";

import { AuditTimeline } from "@/components/audit-timeline";
import { Icons } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { getAuditEvents } from "@/lib/moderation/repository";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const events = await getAuditEvents();
  return (
    <main className="page-shell">
      <PageHeader eyebrow="Accountability" title="Audit log" description="An immutable record of staff decisions and safety interventions." />
      <div className="audit-layout">
        <section className="panel full-audit">
          <div className="panel-heading"><div><span className="eyebrow">Latest first</span><h2>Administrative activity</h2></div><span className="secure-label"><Icons.LockKeyhole aria-hidden="true" /> Retention controlled</span></div>
          <AuditTimeline events={events} />
        </section>
        <aside className="panel audit-principles">
          <span className="principle-icon"><Icons.Shield aria-hidden="true" /></span>
          <h2>Every decision leaves a trail.</h2>
          <p>Audit entries cannot be edited from this console. Corrections are recorded as new, attributable events.</p>
          <ul><li>Named staff actor</li><li>Exact Icelandic timestamp</li><li>Policy rationale</li><li>Linked target record</li></ul>
        </aside>
      </div>
    </main>
  );
}
