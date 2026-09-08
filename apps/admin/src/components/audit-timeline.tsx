import { absoluteTime, compactId, relativeTime } from "@/lib/format";
import type { AuditEvent } from "@/lib/moderation/types";
import { Icons } from "./icon";

export function AuditTimeline({
  events,
  compact = false,
}: {
  events: AuditEvent[];
  compact?: boolean;
}) {
  const shown = compact ? events.slice(0, 4) : events;
  if (!shown.length) {
    return <div className="empty-state"><Icons.FileSearch aria-hidden="true" /><strong>No recorded actions</strong></div>;
  }
  return (
    <ol className={`audit-timeline ${compact ? "audit-compact" : ""}`}>
      {shown.map((event) => (
        <li key={event.id}>
          <span className="audit-marker" aria-hidden="true"><Icons.Activity /></span>
          <div className="audit-copy">
            <div><strong>{event.actionLabel}</strong><time title={absoluteTime(event.createdAt)}>{relativeTime(event.createdAt)}</time></div>
            <p>{event.details}</p>
            <span>{event.actorName} · {event.targetType} {compactId(event.targetId)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
