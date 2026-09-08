import type { LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "positive";
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-icon"><Icon aria-hidden="true" /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
