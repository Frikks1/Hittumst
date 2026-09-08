"use client";

import { useActionState } from "react";

import {
  revealMeetupLocationEvidence,
  type MeetupEvidenceActionState,
} from "@/app/actions";
import { can, type StaffRole } from "@/lib/auth/roles";
import type { ReportDetail } from "@/lib/moderation/types";
import { Icons } from "./icon";

const initialState: MeetupEvidenceActionState = {};

export function MeetupEvidencePanel({
  report,
  roles,
}: {
  report: ReportDetail;
  roles: StaffRole[];
}) {
  const snapshot = report.meetupSnapshot;
  const [state, action, pending] = useActionState(revealMeetupLocationEvidence, initialState);
  if (!snapshot) return null;

  return (
    <section className="panel meetup-evidence-panel">
      <div className="panel-heading">
        <div><span className="eyebrow">Report-time snapshot</span><h2>Hittingur evidence</h2></div>
        <span className="secure-label"><Icons.LockKeyhole aria-hidden="true" /> Case scoped</span>
      </div>
      <dl className="meetup-snapshot-grid">
        <div><dt>Title</dt><dd>{snapshot.title}</dd></div>
        <div><dt>Area</dt><dd>{snapshot.generalArea}</dd></div>
        <div><dt>Access</dt><dd>{snapshot.accessMode} · {snapshot.locationVisibility}</dd></div>
        <div><dt>State</dt><dd>{snapshot.lifecycle} · {snapshot.moderationStatus}</dd></div>
        <div><dt>Attendance</dt><dd>{snapshot.participantCount}{snapshot.capacity ? ` / ${snapshot.capacity}` : ""}</dd></div>
        <div><dt>Adult explicit</dt><dd>{snapshot.adultExplicit ? "Yes" : "No"}</dd></div>
      </dl>

      {snapshot.locationVisibility === "protected" && can(roles, "meetup.evidence") && !state.evidence && (
        <form action={action} className="meetup-evidence-form">
          <input type="hidden" name="reportId" value={report.id} />
          <label>
            <span>Why exact location evidence is necessary</span>
            <textarea name="reason" minLength={12} rows={3} required placeholder="State the case-specific safety need…" />
          </label>
          <button className="button button-secondary" type="submit" disabled={pending}>
            <Icons.LockKeyhole aria-hidden="true" /> {pending ? "Recording access…" : "Access protected evidence"}
          </button>
        </form>
      )}
      {state.error && <p className="notice notice-error">{state.error}</p>}
      {state.evidence && (
        <div className="protected-evidence-result" role="region" aria-label="Protected meetup location evidence">
          <strong>Audited protected evidence</strong>
          <span>{state.evidence.venueLabel ?? "Venue label withheld"}</span>
          <span>{state.evidence.address ?? "Address unavailable"}</span>
          <code>{state.evidence.latitude.toFixed(5)}, {state.evidence.longitude.toFixed(5)}</code>
          {state.evidence.arrivalInstructions && <p>{state.evidence.arrivalInstructions}</p>}
          <small>Access recorded {new Date(state.evidence.accessedAt).toLocaleString("en-GB")}</small>
        </div>
      )}
    </section>
  );
}
