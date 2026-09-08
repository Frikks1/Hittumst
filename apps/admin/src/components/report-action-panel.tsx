"use client";

import { useState } from "react";

import { performModerationAction } from "@/app/actions";
import type { StaffRole } from "@/lib/auth/roles";
import { can } from "@/lib/auth/roles";
import type { ReportDetail } from "@/lib/moderation/types";
import { Icons } from "./icon";

export function ReportActionPanel({
  report,
  roles,
}: {
  report: ReportDetail;
  roles: StaffRole[];
}) {
  const [action, setAction] = useState("note");
  const [confirmed, setConfirmed] = useState(false);
  const destructive = action === "ban";
  const meetupDestructive = action === "meetup_remove" || action === "host_restrict";

  return (
    <section className="panel action-panel">
      <div className="panel-heading compact-heading">
        <div><span className="eyebrow">Decision</span><h2>Take action</h2></div>
        <Icons.Shield aria-hidden="true" />
      </div>
      <form action={performModerationAction}>
        <input type="hidden" name="reportId" value={report.id} />
        <input type="hidden" name="profileId" value={report.reported.id} />
        <input type="hidden" name="meetupId" value={report.meetupId ?? ""} />
        <label>
          <span>Action</span>
          <select name="action" value={action} onChange={(event) => { setAction(event.target.value); setConfirmed(false); }}>
            <option value="note">Add internal note</option>
            {can(roles, "member.warn") && <option value="warn">Issue warning</option>}
            {can(roles, "member.suspend") && <option value="suspend">Temporarily suspend</option>}
            {can(roles, "member.ban") && <option value="ban">Permanently ban</option>}
            {report.meetupId && can(roles, "meetup.manage") && <option value="meetup_remove">Remove meetup</option>}
            {report.meetupId && can(roles, "meetup.manage") && <option value="meetup_restore">Restore meetup</option>}
            {report.meetupId && can(roles, "meetup.manage") && <option value="host_restrict">Restrict host creation</option>}
            <option value="resolve">Resolve report</option>
            <option value="dismiss">Dismiss report</option>
          </select>
        </label>
        {action === "suspend" && (
          <label>
            <span>Suspension length</span>
            <select name="suspensionDays" defaultValue="7">
              <option value="1">24 hours</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </label>
        )}
        <label>
          <span>Internal rationale</span>
          <textarea
            name="reason"
            minLength={8}
            rows={4}
            placeholder="Summarise the evidence and policy basis…"
            required
          />
        </label>
        {(destructive || meetupDestructive) && (
          <label className="confirm-row">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>I reviewed the evidence and understand this permanently removes access.</span>
          </label>
        )}
        <button
          className={`button button-wide ${destructive ? "button-danger" : "button-primary"}`}
          type="submit"
          disabled={(destructive || meetupDestructive) && !confirmed}
        >
          {action === "note" ? "Save case note" : action === "ban" ? "Confirm permanent ban" : "Record decision"}
        </button>
        <p className="action-footnote"><Icons.LockKeyhole aria-hidden="true" /> Your account, rationale, and timestamp are added to the immutable audit log.</p>
      </form>
    </section>
  );
}
