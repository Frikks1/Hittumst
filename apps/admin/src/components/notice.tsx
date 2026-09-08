import { Icons } from "./icon";

export function Notice({
  state,
  message,
}: {
  state?: string;
  message?: string;
}) {
  if (!state || !message) return null;
  const success = state === "success";
  return (
    <div className={`notice ${success ? "notice-success" : "notice-error"}`} role="status">
      {success ? <Icons.Check aria-hidden="true" /> : <Icons.AlertTriangle aria-hidden="true" />}
      <span>{message}</span>
    </div>
  );
}
