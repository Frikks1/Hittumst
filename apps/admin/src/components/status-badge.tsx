import type {
  ReportPriority,
  ReportStatus,
} from "@/lib/moderation/types";

const labels: Record<ReportStatus, string> = {
  open: "Open",
  in_review: "In review",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export function StatusBadge({ status }: { status: ReportStatus }) {
  return <span className={`badge badge-${status}`}>{labels[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: ReportPriority }) {
  return (
    <span className={`priority priority-${priority}`}>
      <span aria-hidden="true" />
      {priority}
    </span>
  );
}
