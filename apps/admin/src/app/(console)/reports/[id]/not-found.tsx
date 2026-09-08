import Link from "next/link";

import { Icons } from "@/components/icon";

export default function ReportNotFound() {
  return (
    <main className="page-shell centered-state">
      <Icons.FileSearch aria-hidden="true" />
      <span className="eyebrow">Case unavailable</span>
      <h1>We couldn&apos;t find that report</h1>
      <p>It may have been removed from the active retention window.</p>
      <Link href="/reports" className="button button-primary"><Icons.ArrowLeft aria-hidden="true" /> Return to reports</Link>
    </main>
  );
}
