import type { PersonSummary } from "@/lib/moderation/types";
import { Avatar } from "./avatar";
import { Icons } from "./icon";

export function MemberCard({ person }: { person: PersonSummary }) {
  return (
    <section className="panel member-card">
      <div className="member-card-head">
        <Avatar person={person} size="lg" />
        <div>
          <span className="eyebrow">Reported member</span>
          <h2>{person.displayName}</h2>
          <p>{[person.age && `${person.age} years`, person.identity, person.region].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <dl className="member-facts">
        <div><dt>Account state</dt><dd className={`account-${person.moderationStatus ?? "active"}`}>{person.moderationStatus ?? "active"}</dd></div>
        <div><dt>Profile ID</dt><dd>{person.id}</dd></div>
      </dl>
      <div className="privacy-note"><Icons.LockKeyhole aria-hidden="true" /><span>Only safety-relevant account fields are shown. Exact location is never available here.</span></div>
    </section>
  );
}
