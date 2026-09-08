import type { PersonSummary } from "@/lib/moderation/types";

export function Avatar({
  person,
  size = "md",
}: {
  person: PersonSummary;
  size?: "sm" | "md" | "lg";
}) {
  const hue = [...person.id].reduce((total, char) => total + char.charCodeAt(0), 0) % 360;
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ "--avatar-hue": hue } as React.CSSProperties}
      aria-hidden="true"
    >
      {person.initials}
    </span>
  );
}
