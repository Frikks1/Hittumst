"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { relativeTime } from "@/lib/format";
import type { ReportListItem, ReportStatus } from "@/lib/moderation/types";
import { Avatar } from "./avatar";
import { Icons } from "./icon";
import { PriorityBadge, StatusBadge } from "./status-badge";

const filters: Array<{ value: "all" | ReportStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_review", label: "In review" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

export function ReportQueue({
  reports,
  compact = false,
}: {
  reports: ReportListItem[];
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | ReportStatus>("all");
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("is-IS");
    return reports.filter((report) => {
      const matchesStatus = filter === "all" || report.status === filter;
      const haystack = `${report.id} ${report.categoryLabel} ${report.reported.displayName} ${report.reporter.displayName}`.toLocaleLowerCase("is-IS");
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [filter, query, reports]);

  const shown = compact ? visible.slice(0, 4) : visible;

  return (
    <div className={`report-queue ${compact ? "report-queue-compact" : ""}`}>
      {!compact && (
        <div className="queue-tools">
          <label className="search-field">
            <Icons.Search aria-hidden="true" />
            <span className="sr-only">Search reports</span>
            <input
              type="search"
              placeholder="Search member, category, or report ID"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="filter-tabs" role="group" aria-label="Filter reports by status">
            {filters.map((item) => (
              <button
                key={item.value}
                className={filter === item.value ? "active" : undefined}
                type="button"
                onClick={() => setFilter(item.value)}
              >
                {item.label}
                {item.value !== "all" && (
                  <span>{reports.filter((report) => report.status === item.value).length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {shown.length ? (
        <div className="report-list">
          {shown.map((report) => (
            <Link className="report-row" href={`/reports/${report.id}`} key={report.id}>
              <div className="report-person">
                <Avatar person={report.reported} />
                <div>
                  <strong>{report.reported.displayName}</strong>
                  <span>Reported by {report.reporter.displayName}</span>
                </div>
              </div>
              <div className="report-subject">
                <div><PriorityBadge priority={report.priority} /><strong>{report.categoryLabel}</strong></div>
                <p>{report.details}</p>
              </div>
              <div className="report-meta">
                <StatusBadge status={report.status} />
                <span><Icons.Clock3 aria-hidden="true" /> {relativeTime(report.createdAt)}</span>
              </div>
              <Icons.ChevronRight className="report-arrow" aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Icons.FileSearch aria-hidden="true" />
          <strong>No reports match</strong>
          <span>Try a different search or status filter.</span>
        </div>
      )}
    </div>
  );
}
